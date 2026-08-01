import { patientFullName } from "./identity.ts";
import type {
  DocumentSection,
  PatientData,
  PlacedSignature,
  SignerData,
  StoredAiMetadata,
} from "./types";

export type DocumentReadinessSeverity = "blocker" | "warning";

export type DocumentReadinessIssue = {
  code: string;
  label: string;
  severity: DocumentReadinessSeverity;
  targetId: string;
};

export type DocumentReadiness = {
  blockers: DocumentReadinessIssue[];
  issues: DocumentReadinessIssue[];
  warnings: DocumentReadinessIssue[];
};

export function evaluateDocumentReadiness(input: {
  aiMetadata: StoredAiMetadata | null;
  issueDate: string;
  patient: PatientData;
  placedSignature: PlacedSignature | null;
  sections: DocumentSection[];
  signer: SignerData;
}): DocumentReadiness {
  const issues: DocumentReadinessIssue[] = [];
  const add = (
    code: string,
    label: string,
    severity: DocumentReadinessSeverity,
    targetId: string,
  ) => issues.push({ code, label, severity, targetId });

  if (!patientFullName(input.patient)) {
    add("patient-name", "Complete el nombre del paciente.", "blocker", "patient-first-names");
  }
  if (!input.patient.rut.trim()) {
    add("patient-rut", "Complete el RUT del paciente.", "blocker", "patient-rut");
  }
  if (!input.issueDate.trim()) {
    add("issue-date", "Seleccione la fecha del documento.", "blocker", "document-issue-date");
  }
  if (!input.patient.birthDate.trim()) {
    add("patient-birth-date", "Revise la fecha de nacimiento.", "warning", "patient-birth-date");
  }

  const sectionsWithContent = input.sections.filter((section) => section.body.trim());
  if (!sectionsWithContent.length) {
    add(
      "document-content",
      "Agregue contenido clínico antes de imprimir.",
      "blocker",
      input.sections[0] ? `section-${input.sections[0].id}` : "document-preview",
    );
  } else {
    input.sections.forEach((section, index) => {
      if (!section.title.trim()) {
        add(
          `section-title-${section.id}`,
          `Asigne un título a la sección ${index + 1}.`,
          "warning",
          `section-title-${section.id}`,
        );
      }
      if (!section.body.trim()) {
        add(
          `section-body-${section.id}`,
          `Revise la sección «${section.title.trim() || index + 1}», que está vacía.`,
          "warning",
          `section-${section.id}`,
        );
      }
    });
  }

  if (!input.signer.name.trim()) {
    add("signer-name", "Complete el nombre del profesional.", "warning", "professional-name");
  }
  if (!input.signer.rut.trim()) {
    add("signer-rut", "Complete el RUT del profesional.", "warning", "professional-rut");
  }
  if (!input.signer.specialty.trim()) {
    add("signer-specialty", "Complete la especialidad.", "warning", "professional-specialty");
  }
  if (!input.placedSignature) {
    add("signature", "No hay una firma en imagen asociada.", "warning", "signature-settings-trigger");
  }
  if (input.aiMetadata?.missingInformation?.length) {
    add(
      "ai-missing-information",
      `La generación con IA dejó ${input.aiMetadata.missingInformation.length} dato${input.aiMetadata.missingInformation.length === 1 ? "" : "s"} por completar.`,
      "warning",
      "ai-document-origin",
    );
  }

  return {
    blockers: issues.filter((issue) => issue.severity === "blocker"),
    issues,
    warnings: issues.filter((issue) => issue.severity === "warning"),
  };
}
