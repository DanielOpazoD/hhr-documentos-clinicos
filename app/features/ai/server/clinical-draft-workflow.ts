import type { AiProviderId } from "../types";
import type { AiTokenUsage } from "../usage-types";
import type { OpenAiOutput } from "./openai-responses";
import { isDeclaredClinicalAbsence } from "./clinical-evidence.ts";
import { isRedundantIdentitySection } from "./document-hygiene.ts";

export const CLINICAL_DRAFT_WORKFLOW_VERSION = "clinical-draft-v1";

export type ClinicalDraftWorkflowNodeId =
  | "resolve_prompt"
  | "validate_sources"
  | "reserve_execution"
  | "generate"
  | "verify"
  | "record_usage"
  | "audit"
  | "audit_failure"
  | "deliver";

export type ClinicalDraftWorkflowNodeStatus = "completed" | "degraded" | "failed";

type ClinicalDraftWorkflowNode = {
  id: ClinicalDraftWorkflowNodeId;
  dependsOn: readonly ClinicalDraftWorkflowNodeId[];
  kind: "deterministic" | "model" | "side_effect";
  blocking: boolean;
};

export const CLINICAL_DRAFT_WORKFLOW = {
  version: CLINICAL_DRAFT_WORKFLOW_VERSION,
  nodes: [
    { id: "resolve_prompt", dependsOn: [], kind: "deterministic", blocking: true },
    { id: "validate_sources", dependsOn: [], kind: "deterministic", blocking: true },
    {
      id: "reserve_execution",
      dependsOn: ["resolve_prompt", "validate_sources"],
      kind: "side_effect",
      blocking: true,
    },
    { id: "generate", dependsOn: ["reserve_execution"], kind: "model", blocking: true },
    { id: "verify", dependsOn: ["generate"], kind: "deterministic", blocking: true },
    { id: "record_usage", dependsOn: ["verify"], kind: "side_effect", blocking: false },
    { id: "audit", dependsOn: ["verify", "record_usage"], kind: "side_effect", blocking: false },
    { id: "audit_failure", dependsOn: ["reserve_execution"], kind: "side_effect", blocking: false },
    { id: "deliver", dependsOn: ["verify"], kind: "deterministic", blocking: true },
  ] satisfies readonly ClinicalDraftWorkflowNode[],
} as const;

export type ClinicalDraftWorkflowEvent = {
  node: ClinicalDraftWorkflowNodeId;
  status: ClinicalDraftWorkflowNodeStatus;
  durationMs: number;
};

export type ClinicalDraftWorkflowTrace = ReturnType<typeof createClinicalDraftWorkflowTrace>;

export function createClinicalDraftWorkflowTrace(clock: () => number = Date.now) {
  const events: ClinicalDraftWorkflowEvent[] = [];
  const definitions = new Map<ClinicalDraftWorkflowNodeId, ClinicalDraftWorkflowNode>(
    CLINICAL_DRAFT_WORKFLOW.nodes.map((node) => [node.id, node]),
  );

  function record(
    node: ClinicalDraftWorkflowNodeId,
    status: ClinicalDraftWorkflowNodeStatus,
    durationMs = 0,
  ): void {
    const definition = definitions.get(node);
    if (!definition) throw new Error(`Nodo clínico desconocido: ${node}.`);
    if (events.some((event) => event.node === node)) {
      throw new Error(`El nodo clínico ${node} ya fue registrado.`);
    }
    const pendingDependencies = definition.dependsOn.filter((dependency) =>
      !events.some((event) => event.node === dependency && event.status !== "failed"),
    );
    if (pendingDependencies.length) {
      throw new Error(`El nodo clínico ${node} tiene dependencias pendientes.`);
    }
    events.push({
      node,
      status,
      durationMs: Math.max(0, Math.round(durationMs)),
    });
  }

  async function run<T>(node: ClinicalDraftWorkflowNodeId, action: () => Promise<T>): Promise<T> {
    const startedAt = clock();
    try {
      const result = await action();
      record(node, "completed", clock() - startedAt);
      return result;
    } catch (error) {
      record(node, "failed", clock() - startedAt);
      throw error;
    }
  }

  return {
    record,
    run,
    snapshot: (): ClinicalDraftWorkflowEvent[] => events.map((event) => ({ ...event })),
  };
}

export type ClinicalDraftVerificationCode =
  | "document_kind_missing"
  | "patient_identity_missing"
  | "signer_identity_missing"
  | "section_incomplete"
  | "section_without_evidence"
  | "evidence_not_locally_verified"
  | "redundant_identity_section"
  | "duplicate_section_title"
  | "missing_information"
  | "safety_notice_missing";

export type ClinicalDraftVerificationFinding = {
  code: ClinicalDraftVerificationCode;
  severity: "warning" | "block";
  count: number;
};

export type ClinicalDraftVerification = {
  outcome: "pass" | "warning" | "blocked";
  findings: ClinicalDraftVerificationFinding[];
};

function normalizedSectionTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CL")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesNormalizedPhrase(value: string, phrase: string): boolean {
  return Boolean(phrase) && ` ${value} `.includes(` ${phrase} `);
}

export function verifyClinicalDraftOutput(output: OpenAiOutput): ClinicalDraftVerification {
  const findings = new Map<ClinicalDraftVerificationCode, ClinicalDraftVerificationFinding>();
  const addFinding = (
    code: ClinicalDraftVerificationCode,
    severity: "warning" | "block",
    count = 1,
  ) => {
    const current = findings.get(code);
    findings.set(code, current
      ? { ...current, count: current.count + count }
      : { code, severity, count });
  };

  if (!output.documentKind.trim()) addFinding("document_kind_missing", "block");
  if (!Object.values(output.patient).some((value) => value.trim())) {
    addFinding("patient_identity_missing", "warning");
  }
  if (!Object.values(output.signer).some((value) => value.trim())) {
    addFinding("signer_identity_missing", "warning");
  }

  const sectionTitles = new Set<string>();
  const unmatchedMissingInformation = output.missingInformation.map(normalizedSectionTitle);
  let unlistedDeclaredAbsences = 0;
  for (const section of output.sections) {
    const unverifiedEvidenceCount = section.evidence.filter(
      (evidence) => evidence.verification === "unverified",
    ).length;
    if (unverifiedEvidenceCount) {
      addFinding("evidence_not_locally_verified", "warning", unverifiedEvidenceCount);
    }
    if (!section.title.trim() || !section.text.trim()) {
      addFinding("section_incomplete", "block");
      continue;
    }
    if (isRedundantIdentitySection(section, output.patient)) {
      addFinding("redundant_identity_section", "block");
    }
    const normalizedTitle = normalizedSectionTitle(section.title);
    if (sectionTitles.has(normalizedTitle)) addFinding("duplicate_section_title", "warning");
    sectionTitles.add(normalizedTitle);

    const declaresAbsence = isDeclaredClinicalAbsence(section.text);
    if (declaresAbsence) {
      const matchingMissingInformation = unmatchedMissingInformation.findIndex((item) =>
        includesNormalizedPhrase(item, normalizedTitle),
      );
      if (matchingMissingInformation >= 0) {
        unmatchedMissingInformation.splice(matchingMissingInformation, 1);
      } else {
        unlistedDeclaredAbsences += 1;
      }
    }
    if (!section.evidence.length && !declaresAbsence) {
      addFinding("section_without_evidence", "block");
    }
  }
  if (!output.sections.length) addFinding("section_incomplete", "block");
  const missingInformationCount = output.missingInformation.length + unlistedDeclaredAbsences;
  if (missingInformationCount) {
    addFinding("missing_information", "warning", missingInformationCount);
  }
  if (!output.safetyNotice.trim()) addFinding("safety_notice_missing", "block");

  const result = [...findings.values()];
  return {
    outcome: result.some((finding) => finding.severity === "block")
      ? "blocked"
      : result.length ? "warning" : "pass",
    findings: result,
  };
}

export class ClinicalDraftVerificationError extends Error {
  readonly code = "AI_DRAFT_VERIFICATION_FAILED";
  readonly findings: ClinicalDraftVerificationFinding[];
  readonly provider: ClinicalDraftGenerationResult["provider"];
  readonly usage: AiTokenUsage;

  constructor(
    findings: ClinicalDraftVerificationFinding[],
    context: Pick<ClinicalDraftGenerationResult, "provider" | "usage">,
  ) {
    super("El borrador no superó la verificación clínica automática.");
    this.name = "ClinicalDraftVerificationError";
    this.findings = findings;
    this.provider = context.provider;
    this.usage = context.usage;
  }
}

type ClinicalDraftGenerationResult = {
  output: OpenAiOutput;
  provider: { id: AiProviderId; name: string; model: string };
  usage: AiTokenUsage;
};

type ClinicalDraftExecutor = <T>(action: (signal: AbortSignal) => Promise<T>) => Promise<T>;

export async function runClinicalDraftWorkflow<T extends ClinicalDraftGenerationResult>(input: {
  trace: ClinicalDraftWorkflowTrace;
  execute: ClinicalDraftExecutor;
  generate: (signal: AbortSignal) => Promise<T>;
}): Promise<T & { verification: ClinicalDraftVerification }> {
  const generated = await input.trace.run("generate", () => input.execute(input.generate));
  const verification = await input.trace.run("verify", async () => verifyClinicalDraftOutput(generated.output));
  if (verification.outcome === "blocked") {
    throw new ClinicalDraftVerificationError(verification.findings, generated);
  }
  return { ...generated, verification };
}
