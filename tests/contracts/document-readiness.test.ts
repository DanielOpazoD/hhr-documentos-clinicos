import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDocumentReadiness } from "../../app/features/documents/document-readiness.ts";

const completeInput = {
  aiMetadata: null,
  issueDate: "2026-07-30",
  patient: {
    firstNames: "",
    lastNames: "",
    fullName: "Claudia Tuki Morales",
    rut: "11.111.111-1",
    birthDate: "1980-01-20",
  },
  placedSignature: {
    id: "signature-1",
    kind: "signature" as const,
    name: "Firma principal",
    professionalName: "Daniel Opazo",
    professionalRut: "17.752.753-K",
    specialty: "Medicina Interna",
    imageUrl: "/api/signatures/signature-1",
    isDefault: true,
    x: 50,
    y: 10,
    width: 30,
  },
  sections: [{ id: "motivo", title: "Certificación", body: "Se certifica el control médico." }],
  signer: {
    name: "Daniel Opazo",
    rut: "17.752.753-K",
    specialty: "Medicina Interna",
  },
};

test("returns a clean readiness result for a complete document", () => {
  const result = evaluateDocumentReadiness(completeInput);

  assert.deepEqual(result, { blockers: [], issues: [], warnings: [] });
});

test("blocks printing when patient identity, date, or all clinical content are missing", () => {
  const result = evaluateDocumentReadiness({
    ...completeInput,
    issueDate: "",
    patient: { ...completeInput.patient, fullName: "", rut: "" },
    sections: [
      { id: "antecedentes", title: "Antecedentes", body: "" },
      { id: "tratamiento", title: "Tratamiento", body: "   " },
    ],
  });

  assert.deepEqual(
    result.blockers.map((issue) => issue.code),
    ["patient-name", "patient-rut", "issue-date", "document-content"],
  );
  assert.equal(result.warnings.length, 0);
  assert.equal(result.blockers.at(-1)?.targetId, "section-antecedentes");
});

test("falls back to the preview when a document has no sections", () => {
  const result = evaluateDocumentReadiness({ ...completeInput, sections: [] });

  assert.deepEqual(result.blockers.map((issue) => issue.code), ["document-content"]);
  assert.equal(result.blockers[0]?.targetId, "document-preview");
});

test("keeps optional professional, signature, and partial-section findings as warnings", () => {
  const result = evaluateDocumentReadiness({
    ...completeInput,
    patient: { ...completeInput.patient, birthDate: "" },
    placedSignature: null,
    sections: [
      completeInput.sections[0],
      { id: "observaciones", title: "", body: "" },
    ],
    signer: { name: "", rut: "", specialty: "" },
  });

  assert.equal(result.blockers.length, 0);
  assert.deepEqual(
    result.warnings.map((issue) => issue.code),
    [
      "patient-birth-date",
      "section-title-observaciones",
      "section-body-observaciones",
      "signer-name",
      "signer-rut",
      "signer-specialty",
      "signature",
    ],
  );
  assert.equal(result.warnings.at(-1)?.targetId, "signature-settings-trigger");
});

test("surfaces AI missing information without duplicating clinical content blockers", () => {
  const result = evaluateDocumentReadiness({
    ...completeInput,
    aiMetadata: { missingInformation: ["Fecha de alta", "Dosis actual"] },
  });

  assert.deepEqual(result.blockers, []);
  assert.equal(result.warnings.at(-1)?.code, "ai-missing-information");
  assert.equal(result.warnings.at(-1)?.targetId, "ai-document-origin");
});
