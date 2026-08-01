import assert from "node:assert/strict";
import test from "node:test";
import { aiTargetForDocumentTemplate, resolveAiDraftTemplateId } from "../../app/features/ai/targets.ts";
import { mergeAiSectionsWithTemplate } from "../../app/features/documents/template-ai-sections.ts";

test("maps document templates only to compatible AI targets", () => {
  assert.equal(aiTargetForDocumentTemplate("certificado_antecedentes"), "certificado");
  assert.equal(aiTargetForDocumentTemplate("informe_medico"), "informe_medico");
  assert.equal(aiTargetForDocumentTemplate("epicrisis"), "epicrisis");
  assert.equal(aiTargetForDocumentTemplate("receta_externa"), null);
});

test("preserves the originating template while its compatible AI target remains selected", () => {
  assert.equal(resolveAiDraftTemplateId({
    target: "certificado",
    promptMode: "profile",
    sourceTarget: "certificado",
    sourceTemplateId: "certificado_antecedentes",
  }), "certificado_antecedentes");
  assert.equal(resolveAiDraftTemplateId({
    target: "informe_medico",
    promptMode: "profile",
    sourceTarget: "certificado",
    sourceTemplateId: "certificado_antecedentes",
  }), "informe_medico");
  assert.equal(resolveAiDraftTemplateId({
    target: "informe_medico",
    promptMode: "free",
    sourceTarget: "informe_medico",
    sourceTemplateId: "documento_libre",
  }), "documento_libre");
});

test("applies configured section order and titles without dropping extra AI content", () => {
  const evidence = [{ sourceIndex: 0, page: 1, excerpt: "Hallazgo", status: "explicito" as const, verification: "verified" as const }];
  const result = mergeAiSectionsWithTemplate([
    { title: "Antecedentes mórbidos", text: "Hipertensión arterial.", evidence },
    { title: "Tratamiento farmacológico", text: "Losartán 50 mg.", evidence: [] },
    { title: "Indicación adicional", text: "Control en un mes.", evidence: [] },
  ], [
    { id: "tratamiento", title: "Medicamentos" },
    { id: "antecedentes", title: "Resumen clínico" },
  ], [
    { id: "antecedentes", title: "Antecedentes mórbidos" },
    { id: "tratamiento", title: "Tratamiento farmacológico" },
  ]);

  assert.deepEqual(result.map(({ id, title, body }) => ({ id, title, body })), [
    { id: "tratamiento", title: "Medicamentos", body: "Losartán 50 mg." },
    { id: "antecedentes", title: "Resumen clínico", body: "Hipertensión arterial." },
    { id: "ia-3", title: "Indicación adicional", body: "Control en un mes." },
  ]);
  assert.deepEqual(result[1].evidence, evidence);
});

test("reserves later exact AI sections when an earlier configured section is missing", () => {
  const result = mergeAiSectionsWithTemplate([
    { key: "a", title: "Sección A", text: "Contenido A", evidence: [] },
    { key: "c", title: "Sección C", text: "Contenido C", evidence: [] },
  ], [
    { id: "a", title: "Sección A" },
    { id: "b", title: "Sección B" },
    { id: "c", title: "Sección C" },
  ]);

  assert.deepEqual(result.map(({ id, body }) => ({ id, body })), [
    { id: "a", body: "Contenido A" },
    { id: "b", body: "" },
    { id: "c", body: "Contenido C" },
  ]);
});

test("keeps unmatched configured sections empty and appends unrelated AI content", () => {
  const result = mergeAiSectionsWithTemplate([
    { key: "tratamiento", title: "Tratamiento", text: "Losartán 50 mg", evidence: [] },
  ], [
    { id: "alergias", title: "Alergias" },
  ]);

  assert.deepEqual(result.map(({ id, title, body }) => ({ id, title, body })), [
    { id: "alergias", title: "Alergias", body: "" },
    { id: "tratamiento", title: "Tratamiento", body: "Losartán 50 mg" },
  ]);
});

test("reserves exact AI keys before considering a conflicting title", () => {
  const result = mergeAiSectionsWithTemplate([
    { key: "diagnostico", title: "Plan", text: "Diagnóstico confirmado", evidence: [] },
  ], [
    { id: "resumen", title: "Plan" },
    { id: "diagnostico", title: "Diagnóstico" },
  ]);

  assert.deepEqual(result.map(({ id, body }) => ({ id, body })), [
    { id: "resumen", body: "" },
    { id: "diagnostico", body: "Diagnóstico confirmado" },
  ]);
});
