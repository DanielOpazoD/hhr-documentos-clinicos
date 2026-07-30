import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import {
  fallbackOpenAiModels,
  isOpenAiModel,
  supportsReasoning,
} from "../../app/features/ai/server/openai-models.ts";
import {
  MAX_SOURCE_BATCH_SIZE,
  MAX_SOURCE_FILE_SIZE,
  MAX_SOURCE_FILES,
  validateSourceBatch,
  validateSourceContents,
  type SourceDescriptor,
} from "../../app/features/ai/server/source-policy.ts";
import { protectUnsupportedSection, sanitizeEvidenceCandidates } from "../../app/features/ai/server/clinical-evidence.ts";
import { composePromptInstructions } from "../../app/features/ai/server/prompt-composition.ts";
import {
  assertProposalIsGeneric,
  compactDocuments,
  type PromptSourceDocument,
} from "../../app/features/ai/server/prompt-source-policy.ts";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function source(overrides: Partial<SourceDescriptor> = {}): SourceDescriptor {
  return { name: "informe.pdf", size: 1024, type: "application/pdf", ...overrides };
}

test("offers only model IDs compatible with the clinical Responses request", () => {
  for (const model of fallbackOpenAiModels()) assert.equal(isOpenAiModel(model.id), true, model.id);
  for (const model of ["gpt-5.6-sol", "gpt-5-mini", "o3", "o4-mini", "gpt-4.1", "ft:gpt-5-mini:org:clinical"]) {
    assert.equal(isOpenAiModel(model), true, model);
  }
  for (const model of [
    "gpt-5-pro",
    "gpt-5.4-pro-2026-01-01",
    "ft:gpt-5-pro:org:clinical",
    "gpt-4o-realtime-preview",
    "gpt-4o-audio-preview",
    "o3-deep-research",
    "text-embedding-3-large",
    "",
  ]) {
    assert.equal(isOpenAiModel(model), false, model);
  }
  assert.equal(supportsReasoning("gpt-5.6-terra"), true);
  assert.equal(supportsReasoning("o4-mini"), true);
  assert.equal(supportsReasoning("gpt-4.1"), false);
});

test("validates AI source formats and resolves safe extension fallbacks", () => {
  assert.deepEqual(validateSourceBatch([source()]), ["application/pdf"]);
  assert.deepEqual(validateSourceBatch([source({ name: "imagen.JPG", type: "" })]), ["image/jpeg"]);
  assert.deepEqual(
    validateSourceBatch([source({ name: "traslado.DOCX", type: "" })]),
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  );
  assert.throws(() => validateSourceBatch([]), /Seleccione al menos un archivo/);
  assert.throws(
    () => validateSourceBatch(Array.from({ length: MAX_SOURCE_FILES + 1 }, () => source())),
    /Puede analizar hasta 8 archivos/,
  );
  assert.throws(() => validateSourceBatch([source({ size: 0 })]), /está vacío/);
  assert.throws(() => validateSourceBatch([source({ size: MAX_SOURCE_FILE_SIZE + 1 })]), /hasta 15 MB/);
  assert.throws(
    () => validateSourceBatch([
      source({ name: "a.pdf", size: MAX_SOURCE_BATCH_SIZE / 2 + 1 }),
      source({ name: "b.pdf", size: MAX_SOURCE_BATCH_SIZE / 2 + 1 }),
    ]),
    /conjunto de archivos supera 15 MB/,
  );
  assert.throws(() => validateSourceBatch([source({ name: "payload.exe", type: "" })]), /Formato no permitido/);
});

test("rejects spoofed source metadata and accepts authentic file signatures", async () => {
  const pdf = new File(["%PDF-1.7\n%%EOF"], "informe.pdf", { type: "application/pdf" });
  const png = new File([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ], "imagen.png", { type: "image/png" });
  const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "foto.jpg", { type: "image/jpeg" });
  const docx = new File([zipSync({
    "[Content_Types].xml": strToU8("<Types />"),
    "word/document.xml": strToU8("<w:document />"),
  })], "traslado.docx", { type: DOCX_MIME_TYPE });

  const validFiles = [pdf, png, jpeg, docx];
  await validateSourceContents(validFiles, validateSourceBatch(validFiles));

  const executable = new File([
    new Uint8Array([0x4d, 0x5a, 0x90, 0x00]),
  ], "payload.exe", { type: "application/pdf" });
  await assert.rejects(
    validateSourceContents([executable], validateSourceBatch([executable])),
    /no coincide con su formato/,
  );

  const malformedDocx = new File(["PK not really a DOCX"], "informe.docx", { type: DOCX_MIME_TYPE });
  await assert.rejects(
    validateSourceContents([malformedDocx], validateSourceBatch([malformedDocx])),
    /no coincide con su formato/,
  );
});

test("replaces unsupported clinical text instead of rejecting the entire draft", () => {
  assert.deepEqual(protectUnsupportedSection({
    title: "Diagnóstico",
    text: "Neumonía",
    evidence: [],
    declaresAbsence: false,
  }), {
    text: "No consignado",
    evidence: [],
    unsupportedTitle: "Diagnóstico",
  });

  assert.equal(protectUnsupportedSection({
    title: "Diagnóstico",
    text: "Neumonía",
    evidence: [{ excerpt: "Diagnóstico: neumonía", status: "explicito" }],
    declaresAbsence: false,
  }).unsupportedTitle, null);
});

test("discards malformed evidence instead of rejecting the complete draft", () => {
  const evidence = sanitizeEvidenceCandidates([
    { source_index: 7, page: null, excerpt: "Fuente inexistente", status: "explicito" },
    { source_index: 0, page: null, excerpt: "Dato verificable", status: "explicito" },
    { source_index: 1, page: 3, excerpt: "Página inexistente", status: "ambiguo" },
    { source_index: 1, page: 2, excerpt: "Dato PDF", status: "explicito" },
    { source_index: 2, page: null, excerpt: "Texto indicado por el profesional", status: "explicito" },
  ], [
    { mimeType: "image/png" },
    { mimeType: "application/pdf", extractedPages: new Set([1, 2]), pageCount: 2 },
    { mimeType: "text/plain" },
  ]);
  assert.deepEqual(evidence, [
    { source_index: 0, page: null, excerpt: "Dato verificable", status: "explicito" },
    { source_index: 1, page: 2, excerpt: "Dato PDF", status: "explicito" },
    { source_index: 2, page: null, excerpt: "Texto indicado por el profesional", status: "explicito" },
  ]);
  assert.deepEqual(sanitizeEvidenceCandidates("invalid", []), []);
});

test("supports bounded free prompts and optional template refinements", () => {
  const supplemented = composePromptInstructions({
    mode: "profile",
    baseInstructions: "Plantilla clínica base",
    userInstructions: "Prioriza la evolución renal.",
  });
  assert.match(supplemented, /Plantilla clínica base/);
  assert.match(supplemented, /Prioriza la evolución renal/);
  assert.match(supplemented, /no pueden anular las reglas clínicas obligatorias/);
  assert.match(supplemented, /prevalecen sobre la plantilla en estructura, cobertura, exclusiones/);
  assert.match(supplemented, /No agregues secciones, resultados, antecedentes ni contexto/);

  const free = composePromptInstructions({
    mode: "free",
    userInstructions: "Crea un resumen breve del formulario.",
  });
  assert.match(free, /sin imponer una plantilla predeterminada/);
  assert.match(free, /Crea un resumen breve del formulario/);
  assert.match(free, /define de forma exhaustiva el alcance/);
  assert.throws(() => composePromptInstructions({ mode: "free", userInstructions: "  " }), /no puede estar vacío/);
  assert.throws(
    () => composePromptInstructions({ mode: "profile", baseInstructions: "Base", userInstructions: "x".repeat(4_001) }),
    /hasta 4\.000 caracteres/,
  );
});

test("sends only anonymous document structure when deriving a reusable prompt", () => {
  const documents: PromptSourceDocument[] = [{
    templateId: "certificado_general",
    sectionCount: 1,
    sections: [{ order: 1, length: "breve", paragraphs: 1 }],
  }];
  const compacted = compactDocuments(documents);
  assert.deepEqual(JSON.parse(compacted), {
    index: 1,
    templateId: "certificado_general",
    sectionCount: 1,
    sections: [{ order: 1, length: "breve", paragraphs: 1 }],
  });
  assert.doesNotThrow(() => assertProposalIsGeneric({
    name: "Certificado escolar",
    instructions: "Redactar un certificado breve con los campos genéricos del paciente.",
    summary: "Plantilla clínica reutilizable.",
  }));
  assert.throws(() => assertProposalIsGeneric({
    name: "Certificado de ejemplo",
    instructions: "Reutilizar el RUT 12.345.678-5.",
    summary: "Plantilla clínica reutilizable.",
  }), /datos identificables/);
});

test("keeps every selected document inside a valid bounded model payload", () => {
  const documents: PromptSourceDocument[] = Array.from({ length: 8 }, () => ({
    templateId: "documento_libre",
    sectionCount: 16,
    sections: Array.from({ length: 16 }, (_, sectionIndex) => ({ order: sectionIndex + 1, length: "extensa" as const, paragraphs: 20 })),
  }));
  const compacted = compactDocuments(documents);
  assert.ok(compacted.length <= 60_000);
  const records = compacted.split("\n").map((record) => JSON.parse(record));
  assert.equal(records.length, documents.length);
  records.forEach((record, index) => {
    assert.equal(record.index, index + 1);
    assert.equal(record.sections.length, 16);
  });
});
