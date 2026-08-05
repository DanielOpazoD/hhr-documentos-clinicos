import { isAiTarget } from "@/app/features/ai/server/prompt";
import { composePromptInstructions, PROFESSIONAL_INSTRUCTION_SOURCE } from "@/app/features/ai/server/prompt-composition";
import { resolvePromptProfile } from "@/app/features/ai/server/prompt-store";
import { PROMPT_ENGINE_VERSION, promptVersion } from "@/app/features/ai/prompt-catalog";
import { generateDraftWithProvider, isAiProviderId } from "@/app/features/ai/server/providers";
import { importSources } from "@/app/features/ai/server/import-request";
import { summarizeAiSourcesForAudit } from "@/app/features/ai/server/operational-metadata";
import { progressStream } from "@/app/features/ai/server/progress-stream";
import { auditBestEffort } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { apiTrace, jsonError, observeApi, reportApiOutcome } from "@/app/lib/server/http";
import { recordAiUsage } from "@/app/features/ai/server/usage";
import type { AiPromptMode, AiTargetId } from "@/app/features/ai/types";
import { FREEFORM_SCHEMA_TARGET } from "@/app/features/ai/targets";
import {
  CLINICAL_DRAFT_WORKFLOW_VERSION,
  ClinicalDraftVerificationError,
  createClinicalDraftWorkflowTrace,
  runClinicalDraftWorkflow,
  type ClinicalDraftWorkflowTrace,
} from "@/app/features/ai/server/clinical-draft-workflow";
import {
  AiExecutionCancelledError,
  AiExecutionTimeoutError,
  aiExecutionDeniedResponse,
  reserveAiExecution,
  runAiExecution,
} from "@/app/features/ai/server/execution";

async function resolveClinicalDraftPrompt(input: {
  owner: string;
  target: AiTargetId;
  promptId: string;
  promptMode: AiPromptMode;
  userInstructions: string;
}) {
  if (input.promptMode === "free") {
    return {
      id: "free-user-prompt",
      name: "Prompt libre",
      revision: null,
      version: `${PROMPT_ENGINE_VERSION}:free:r1`,
      instructions: composePromptInstructions({
        mode: input.promptMode,
        userInstructions: input.userInstructions,
      }),
    };
  }
  const prompt = await resolvePromptProfile(input.owner, input.target, input.promptId || undefined);
  return {
    id: prompt.id,
    name: prompt.name,
    revision: prompt.revision,
    version: `${promptVersion(prompt)}${input.userInstructions.trim() ? ":supplemented" : ""}`,
    instructions: composePromptInstructions({
      mode: input.promptMode,
      baseInstructions: prompt.instructions,
      userInstructions: input.userInstructions,
    }),
  };
}

function auditableWorkflowSnapshot(
  workflow: ClinicalDraftWorkflowTrace,
  auditNode: "audit" | "audit_failure",
) {
  return [
    ...workflow.snapshot(),
    // When this payload exists, its own audit insert completed successfully.
    { node: auditNode, status: "completed" as const, durationMs: 0 },
  ];
}

function requireActiveAiRequest(signal: AbortSignal) {
  if (signal.aborted) throw new AiExecutionCancelledError();
}

async function importWithAi(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);

  const form = await request.formData();
  const requestedTarget = String(form.get("target") ?? "informe_medico");
  const providerId = String(form.get("provider") ?? "openai");
  const model = String(form.get("model") ?? "gpt-5-mini");
  const promptId = String(form.get("promptId") ?? "").trim();
  const promptModeValue = String(form.get("promptMode") ?? "profile");
  const userInstructions = String(form.get("userInstructions") ?? "");
  const processingAuthorized = form.get("processingAuthorized") === "true";

  if (!processingAuthorized) return jsonError("Confirme que tiene autorización para procesar el archivo.");
  if (promptModeValue !== "profile" && promptModeValue !== "free") return jsonError("Modo de prompt no permitido.");
  if (!isAiTarget(requestedTarget)) return jsonError("Tipo de borrador no permitido.");
  if (!isAiProviderId(providerId)) return jsonError("Proveedor de IA no permitido.");
  const promptMode = promptModeValue as AiPromptMode;
  const target: AiTargetId = promptMode === "free" ? FREEFORM_SCHEMA_TARGET : requestedTarget;
  const workflow = createClinicalDraftWorkflowTrace();
  const [promptResult, sourcesResult] = await Promise.allSettled([
    workflow.run("resolve_prompt", () => resolveClinicalDraftPrompt({
      owner,
      target,
      promptId,
      promptMode,
      userInstructions,
    })),
    workflow.run("validate_sources", () => importSources(form)),
  ]);
  if (sourcesResult.status === "rejected" || promptResult.status === "rejected") {
    const errors = [
      sourcesResult.status === "rejected"
        ? sourcesResult.reason instanceof Error ? sourcesResult.reason.message : "No se pudieron validar los archivos."
        : null,
      promptResult.status === "rejected"
        ? promptResult.reason instanceof Error ? promptResult.reason.message : "Prompt no disponible."
        : null,
    ].filter((message): message is string => Boolean(message));
    return jsonError(errors.join(" "));
  }
  const resolvedPromptId = promptResult.value.id;
  const resolvedPromptVersion = promptResult.value.version;
  const resolvedPromptName = promptResult.value.name;
  const resolvedPromptRevision = promptResult.value.revision;
  const promptInstructions = promptResult.value.instructions;
  const sources = sourcesResult.value;
  const sourceAuditMetadata = summarizeAiSourcesForAudit(sources);

  const reservation = await reserveAiExecution({
    owner,
    operation: "clinical_draft",
    providerId,
  });
  workflow.record("reserve_execution", reservation.ok ? "completed" : "failed");
  if (!reservation.ok) return aiExecutionDeniedResponse(reservation.denial);
  const id = reservation.lease.id;

  const trace = apiTrace(request);
  let streamCode = "AI_GENERATION_FAILED";
  let streamMessage = "No se pudo completar la operación.";
  let streamStatus = 502;
  return progressStream(async (emit, signal) => {
    emit({ type: "status", stage: "preparing", label: "Preparando archivos", detail: `${sources.length} fuente${sources.length === 1 ? "" : "s"} lista${sources.length === 1 ? "" : "s"} para analizar` });
    try {
      const { output: result, provider, usage, verification } = await runClinicalDraftWorkflow({
        trace: workflow,
        execute: (action) => runAiExecution(reservation.lease, action, { signal }),
        generate: (signal) => generateDraftWithProvider({
          providerId,
          model,
          sources,
          target,
          promptMode,
          promptInstructions,
          professionalInstructions: userInstructions.trim() || undefined,
          onProgress: (progress) => emit({ type: "status", ...progress }),
          signal,
        }),
      });
      requireActiveAiRequest(signal);
      const usageRecorded = await recordAiUsage({
        owner,
        runId: id,
        providerId: provider.id,
        model: provider.model,
        usage,
      }).then(() => true).catch(() => false);
      workflow.record("record_usage", usageRecorded ? "completed" : "degraded");
      requireActiveAiRequest(signal);
      const generatedAt = new Date().toISOString();
      const resultSources = [
        ...sources.map((source) => source.sourceName),
        ...(userInstructions.trim() ? [PROFESSIONAL_INSTRUCTION_SOURCE] : []),
      ];
      const originalOutput = {
        documentKind: result.documentKind,
        patient: result.patient,
        signer: result.signer,
        sections: result.sections,
        processingSummary: result.processingSummary,
        missingInformation: result.missingInformation,
        safetyNotice: result.safetyNotice,
      };
      requireActiveAiRequest(signal);
      const auditRecorded = await auditBestEffort(owner, "generated", "ai_import", id, {
        ...sourceAuditMetadata,
        target,
        provider: provider.id,
        model: provider.model,
        promptId: resolvedPromptId,
        promptVersion: resolvedPromptVersion,
        promptMode,
        supplemented: promptMode === "profile" && Boolean(userInstructions.trim()),
        store: false,
        processingAuthorized: true,
        usageRecorded,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        workflowVersion: CLINICAL_DRAFT_WORKFLOW_VERSION,
        workflowOutcome: verification.outcome,
        workflowFindings: verification.findings,
        workflowNodes: auditableWorkflowSnapshot(workflow, "audit"),
      });
      workflow.record("audit", auditRecorded ? "completed" : "degraded");
      requireActiveAiRequest(signal);
      const workflowSummary = {
        version: CLINICAL_DRAFT_WORKFLOW_VERSION,
        outcome: verification.outcome,
        findings: verification.findings,
        nodes: workflow.snapshot(),
      };
      emit({ type: "status", stage: "completed", label: "Borrador listo", detail: "Identidad, contenido y fuentes preparados para revisión" });
      emit({ type: "result", result: {
        runId: id,
        documentKind: result.documentKind,
        sources: resultSources,
        providerId: provider.id,
        providerName: provider.name,
        model: provider.model,
        promptVersion: resolvedPromptVersion,
        workflow: workflowSummary,
        promptTrace: {
          workflowVersion: CLINICAL_DRAFT_WORKFLOW_VERSION,
          mode: promptMode,
          profileId: resolvedPromptId,
          profileName: resolvedPromptName,
          profileRevision: resolvedPromptRevision,
          version: resolvedPromptVersion,
          userInstructions: userInstructions.trim(),
          effectiveInstructions: promptInstructions,
          generatedAt,
        },
        originalOutput,
        sections: result.sections,
        patient: result.patient,
        signer: result.signer,
        processingSummary: result.processingSummary,
        missingInformation: result.missingInformation,
        safetyNotice: result.safetyNotice,
      } });
      workflow.record("deliver", "completed");
      try {
        emit({
          type: "workflow",
          workflow: { ...workflowSummary, nodes: workflow.snapshot() },
        });
      } catch {
        console.error(JSON.stringify({ level: "error", event: "ai_workflow_trace_stream_failed" }));
      }
    } catch (error) {
      const verificationFailure = error instanceof ClinicalDraftVerificationError;
      if (error instanceof AiExecutionCancelledError) {
        streamCode = error.code;
        streamMessage = error.message;
        streamStatus = 499;
      } else if (error instanceof AiExecutionTimeoutError) {
        streamCode = error.code;
        streamMessage = error.message;
        streamStatus = 504;
      } else if (verificationFailure) {
        streamCode = error.code;
        streamMessage = "La IA produjo un borrador que no superó la verificación automática.";
        streamStatus = 422;
      }
      if (error instanceof AiExecutionCancelledError) {
        const auditRecorded = await auditBestEffort(owner, "cancelled", "ai_import", id, {
          ...sourceAuditMetadata,
          target,
          provider: providerId,
          promptId: resolvedPromptId,
          promptVersion: resolvedPromptVersion,
          promptMode,
          workflowVersion: CLINICAL_DRAFT_WORKFLOW_VERSION,
          workflowNodes: auditableWorkflowSnapshot(workflow, "audit_failure"),
        });
        workflow.record("audit_failure", auditRecorded ? "completed" : "degraded");
        throw error;
      }
      const failureMetadata = {
        ...sourceAuditMetadata,
        target,
        provider: verificationFailure ? error.provider.id : providerId,
        promptId: resolvedPromptId,
        promptVersion: resolvedPromptVersion,
        promptMode,
        workflowVersion: CLINICAL_DRAFT_WORKFLOW_VERSION,
      };
      if (verificationFailure) {
        const usageRecorded = await recordAiUsage({
          owner,
          runId: id,
          providerId: error.provider.id,
          model: error.provider.model,
          usage: error.usage,
        }).then(() => true).catch(() => false);
        workflow.record("record_usage", usageRecorded ? "completed" : "degraded");
        workflow.record("deliver", "failed");
        const auditRecorded = await auditBestEffort(owner, "blocked", "ai_import", id, {
          ...failureMetadata,
          model: error.provider.model,
          usageRecorded,
          inputTokens: error.usage.inputTokens,
          outputTokens: error.usage.outputTokens,
          workflowOutcome: "blocked",
          workflowFindings: error.findings,
          workflowNodes: auditableWorkflowSnapshot(workflow, "audit"),
        });
        workflow.record("audit", auditRecorded ? "completed" : "degraded");
      } else {
        const auditRecorded = await auditBestEffort(owner, "failed", "ai_import", id, {
          ...failureMetadata,
          workflowNodes: auditableWorkflowSnapshot(workflow, "audit_failure"),
        });
        workflow.record("audit_failure", auditRecorded ? "completed" : "degraded");
      }
      throw error;
    }
  }, {
    code: () => streamCode,
    errorMessage: () => streamMessage,
    requestId: trace?.requestId,
    signal: request.signal,
    onComplete: () => {
      if (trace) reportApiOutcome({
        ...trace,
        status: 200,
        code: "AI_GENERATION_SUCCEEDED",
        outcome: "success",
      });
    },
    onError: () => {
      if (trace) reportApiOutcome({
        ...trace,
        status: streamStatus,
        code: streamCode,
        outcome: streamStatus === 499 ? "cancelled" : "failure",
      });
    },
    onCancel: () => {
      if (trace) reportApiOutcome({
        ...trace,
        status: 499,
        code: "AI_EXECUTION_CANCELLED",
        outcome: "cancelled",
      });
    },
  });
}

export const POST = observeApi("ai.import.POST", importWithAi);
