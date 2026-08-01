import assert from "node:assert/strict";
import test from "node:test";
import {
  CLINICAL_DRAFT_WORKFLOW,
  ClinicalDraftVerificationError,
  createClinicalDraftWorkflowTrace,
  runClinicalDraftWorkflow,
  verifyClinicalDraftOutput,
} from "../../app/features/ai/server/clinical-draft-workflow.ts";
import type { OpenAiOutput } from "../../app/features/ai/server/openai-responses.ts";

function completeOutput(overrides: Partial<OpenAiOutput> = {}): OpenAiOutput {
  return {
    documentKind: "Certificado médico",
    patient: {
      firstNames: "Ana",
      lastNames: "Pérez",
      rut: "12.345.678-5",
      birthDate: "1990-01-02",
    },
    signer: {
      name: "Dra. Ejemplo",
      rut: "11.111.111-1",
      specialty: "Medicina interna",
    },
    processingSummary: "Se preparó un certificado breve.",
    sections: [{
      title: "Certificado",
      text: "Se certifica la indicación consignada.",
      evidence: [{
        sourceIndex: 0,
        page: 1,
        excerpt: "Indicación consignada",
        status: "explicito",
        verification: "verified",
      }],
    }],
    missingInformation: [],
    safetyNotice: "Borrador sujeto a revisión profesional.",
    ...overrides,
  };
}

test("defines one acyclic clinical graph with one model node and explicit fan-out", () => {
  const ids = CLINICAL_DRAFT_WORKFLOW.nodes.map((node) => node.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const [index, node] of CLINICAL_DRAFT_WORKFLOW.nodes.entries()) {
    for (const dependency of node.dependsOn) {
      assert.ok(ids.indexOf(dependency) >= 0, `${node.id} has an unknown dependency`);
      assert.ok(ids.indexOf(dependency) < index, `${node.id} depends on a later node`);
    }
  }
  assert.deepEqual(
    CLINICAL_DRAFT_WORKFLOW.nodes.filter((node) => node.dependsOn.length === 0).map((node) => node.id),
    ["resolve_prompt", "validate_sources"],
  );
  assert.deepEqual(
    CLINICAL_DRAFT_WORKFLOW.nodes.find((node) => node.id === "reserve_execution")?.dependsOn,
    ["resolve_prompt", "validate_sources"],
  );
  assert.deepEqual(
    CLINICAL_DRAFT_WORKFLOW.nodes.filter((node) => node.kind === "model").map((node) => node.id),
    ["generate"],
  );
});

test("records only operational node state and enforces graph dependencies", async () => {
  let now = 100;
  const trace = createClinicalDraftWorkflowTrace(() => {
    now += 5;
    return now;
  });
  await Promise.all([
    trace.run("resolve_prompt", async () => "PRIVATE CLINICAL VALUE"),
    trace.run("validate_sources", async () => ["PRIVATE CLINICAL VALUE"]),
  ]);
  trace.record("reserve_execution", "completed");

  assert.deepEqual(trace.snapshot(), [
    { node: "resolve_prompt", status: "completed", durationMs: 10 },
    { node: "validate_sources", status: "completed", durationMs: 10 },
    { node: "reserve_execution", status: "completed", durationMs: 0 },
  ]);
  assert.throws(
    () => createClinicalDraftWorkflowTrace().record("reserve_execution", "completed"),
    /dependencias pendientes/,
  );
  assert.doesNotMatch(JSON.stringify(trace.snapshot()), /PRIVATE CLINICAL VALUE/);
});

test("passes a complete supported draft", () => {
  assert.deepEqual(verifyClinicalDraftOutput(completeOutput()), {
    outcome: "pass",
    findings: [],
  });
});

test("reports reviewable gaps without discarding a usable draft", () => {
  const verification = verifyClinicalDraftOutput(completeOutput({
    patient: { firstNames: "", lastNames: "", rut: "", birthDate: "" },
    signer: { name: "", rut: "", specialty: "" },
    sections: [
      {
        title: "Certificado",
        text: "Se certifica la indicación consignada.",
        evidence: [
          {
            sourceIndex: 0,
            page: 1,
            excerpt: "Indicación consignada",
            status: "explicito",
            verification: "verified",
          },
          {
            sourceIndex: 1,
            page: null,
            excerpt: "Indicación adicional en imagen",
            status: "explicito",
            verification: "unverified",
          },
          {
            sourceIndex: 2,
            page: null,
            excerpt: "Segunda indicación en imagen",
            status: "ambiguo",
            verification: "unverified",
          },
        ],
      },
      {
        title: "Antecedente solicitado",
        text: "No consta.",
        evidence: [{
          sourceIndex: 1,
          page: null,
          excerpt: "Ausencia descrita en imagen",
          status: "explicito",
          verification: "unverified",
        }],
      },
    ],
    missingInformation: ["Confirmar fecha de emisión."],
  }));

  assert.equal(verification.outcome, "warning");
  assert.deepEqual(verification.findings.map((finding) => finding.code), [
    "patient_identity_missing",
    "signer_identity_missing",
    "evidence_not_locally_verified",
    "missing_information",
  ]);
  assert.equal(
    verification.findings.find((finding) => finding.code === "evidence_not_locally_verified")?.count,
    3,
  );
});

test("counts every review item even when its section is incomplete", () => {
  const verification = verifyClinicalDraftOutput(completeOutput({
    sections: [{
      title: "",
      text: "",
      evidence: [
        {
          sourceIndex: 0,
          page: null,
          excerpt: "Primera cita en imagen",
          status: "explicito",
          verification: "unverified",
        },
        {
          sourceIndex: 1,
          page: null,
          excerpt: "Segunda cita en imagen",
          status: "ambiguo",
          verification: "unverified",
        },
      ],
    }],
    missingInformation: ["Confirmar fecha.", "Confirmar diagnóstico."],
  }));

  assert.equal(verification.outcome, "blocked");
  assert.deepEqual(verification.findings, [
    { code: "evidence_not_locally_verified", severity: "warning", count: 2 },
    { code: "section_incomplete", severity: "block", count: 1 },
    { code: "missing_information", severity: "warning", count: 2 },
  ]);
});

test("counts declared absences once when reconciling missing information", () => {
  const verification = verifyClinicalDraftOutput(completeOutput({
    sections: [
      { title: "Diagnóstico", text: "No consta.", evidence: [] },
      { title: "Tratamiento", text: "Sin información.", evidence: [] },
      { title: "RUT", text: "No aparece.", evidence: [] },
    ],
    missingInformation: ["Confirmar diagnóstico.", "Confirmar rutina de ejercicios."],
  }));

  assert.deepEqual(verification, {
    outcome: "warning",
    findings: [{ code: "missing_information", severity: "warning", count: 4 }],
  });
});

test("blocks redundant identity and unsupported clinical sections", () => {
  const verification = verifyClinicalDraftOutput(completeOutput({
    sections: [
      {
        title: "Identificación del paciente",
        text: "Nombre: Ana Pérez. RUT: 12.345.678-5. Fecha de nacimiento: 02-01-1990.",
        evidence: [{
          sourceIndex: 0,
          page: 1,
          excerpt: "Ana Pérez 12.345.678-5",
          status: "explicito",
          verification: "verified",
        }],
      },
      {
        title: "Diagnóstico",
        text: "Neumonía.",
        evidence: [],
      },
    ],
  }));

  assert.equal(verification.outcome, "blocked");
  assert.deepEqual(verification.findings.map((finding) => finding.code), [
    "redundant_identity_section",
    "section_without_evidence",
  ]);
});

test("preserves the provider error and records the failed graph node", async () => {
  const trace = createClinicalDraftWorkflowTrace();
  await trace.run("resolve_prompt", async () => undefined);
  await trace.run("validate_sources", async () => undefined);
  trace.record("reserve_execution", "completed");
  const providerError = new Error("provider failure");

  await assert.rejects(
    runClinicalDraftWorkflow({
      trace,
      execute: (action) => action(new AbortController().signal),
      generate: async () => { throw providerError; },
    }),
    (error: unknown) => error === providerError,
  );
  assert.equal(trace.snapshot().at(-1)?.node, "generate");
  assert.equal(trace.snapshot().at(-1)?.status, "failed");
  trace.record("audit_failure", "completed");
  assert.equal(trace.snapshot().at(-1)?.node, "audit_failure");
});

test("rejects a blocked draft after exactly one model execution", async () => {
  const trace = createClinicalDraftWorkflowTrace();
  await trace.run("resolve_prompt", async () => undefined);
  await trace.run("validate_sources", async () => undefined);
  trace.record("reserve_execution", "completed");
  let executions = 0;

  await assert.rejects(
    runClinicalDraftWorkflow({
      trace,
      execute: (action) => {
        executions += 1;
        return action(new AbortController().signal);
      },
      generate: async () => ({
        output: completeOutput({
          sections: [{ title: "Diagnóstico", text: "Neumonía.", evidence: [] }],
        }),
        provider: { id: "openai" as const, name: "OpenAI", model: "gpt-5-mini" },
        usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, totalTokens: 15 },
      }),
    }),
    (error: unknown) => {
      assert.ok(error instanceof ClinicalDraftVerificationError);
      assert.deepEqual(error.findings.map((finding) => finding.code), ["section_without_evidence"]);
      assert.equal(error.provider.model, "gpt-5-mini");
      assert.equal(error.usage.totalTokens, 15);
      return true;
    },
  );
  assert.equal(executions, 1);
  assert.equal(trace.snapshot().at(-1)?.node, "verify");
  assert.equal(trace.snapshot().at(-1)?.status, "completed");
});
