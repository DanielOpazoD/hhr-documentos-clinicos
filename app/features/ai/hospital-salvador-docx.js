// @ts-check

import { readApiResponse } from "@/app/lib/client/http";
import { hospitalSalvadorTemplateUrl } from "./hospital-salvador-fields.js";

export { hospitalSalvadorTemplateUrl };

/** @param {string} value */
function safeFileName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLocaleLowerCase("es")
    .slice(0, 70);
}

/**
 * La transformación DOCX se ejecuta en el servidor para que la biblioteca ZIP
 * no forme parte del cliente. La plantilla institucional sigue obteniéndose
 * desde el mismo artefacto publicado que muestra la interfaz.
 *
 * @param {Array<{key?: string, title: string, text: string}>} sections
 * @param {{firstNames?: string, lastNames?: string, rut?: string}} patient
 * @param {{name?: string, rut?: string, specialty?: string}} signer
 */
export async function downloadHospitalSalvadorDocx(sections, patient, signer) {
  const templateResponse = await fetch(hospitalSalvadorTemplateUrl, { cache: "no-store" });
  if (!templateResponse.ok) throw new Error("No se pudo abrir la plantilla oficial del Hospital del Salvador.");

  const form = new FormData();
  form.set("template", await templateResponse.blob(), "formato-informe-traslado-hospital-salvador.docx");
  form.set("payload", JSON.stringify({
    sections,
    patient,
    signer,
    issueDate: new Date().toISOString(),
  }));
  const response = await fetch("/api/ai/hospital-salvador-docx", {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    await readApiResponse(response, { fallbackMessage: "No se pudo generar el Word oficial." });
    return;
  }

  const output = await response.blob();
  if (!output.size) throw new Error("El servidor devolvió un documento vacío.");
  const patientName = safeFileName([patient.firstNames, patient.lastNames].filter(Boolean).join(" ")) || "paciente";
  const url = URL.createObjectURL(output);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `informe-traslado-hospital-salvador-${patientName}.docx`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
