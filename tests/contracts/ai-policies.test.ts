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
import { protectUnsupportedSection } from "../../app/features/ai/server/clinical-evidence.ts";

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
    evidence: [{ excerpt: "Diagnóstico: neumonía" }],
    declaresAbsence: false,
  }).unsupportedTitle, null);
});
