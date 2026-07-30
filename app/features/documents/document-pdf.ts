import { downloadClinicalPdf } from "@/app/lib/client-pdf";
import { formatStoredDate } from "./formatters";
import { patientFullName } from "./identity";
import type { DocumentSection, PatientData, PlacedSignature, SignerData } from "./types";

type DocumentPdfInput = {
  documentFontSize: number;
  issueDate: string;
  patient: PatientData;
  placedSignature: PlacedSignature | null;
  placedStamp: PlacedSignature | null;
  sections: DocumentSection[];
  signer: SignerData;
  templateId: string;
  visibleTitle: string;
};

export async function downloadDocumentPdf(input: DocumentPdfInput) {
  await downloadClinicalPdf({
    fileName: `${input.templateId}.pdf`,
    title: input.visibleTitle,
    subtitle: ["Servicio de Salud Metropolitano Oriente", "Hospital Hanga Roa"],
    sections: [
      {
        title: "",
        body: `Nombre: ${patientFullName(input.patient) || "—"}\nRUT: ${input.patient.rut || "—"}\nFecha de nacimiento: ${formatStoredDate(input.patient.birthDate) || "—"}`,
      },
      ...input.sections.map((section) => ({ title: section.title, body: section.body })),
    ],
    signatureAssets: [input.placedSignature, input.placedStamp].filter((asset): asset is PlacedSignature => Boolean(asset)),
    signer: input.signer,
    fontSize: input.documentFontSize,
    date: formatStoredDate(input.issueDate),
    footer: input.templateId === "receta_externa" ? "RECETA MÉDICA EXTERNA" : "Hospital Hanga Roa",
  });
}
