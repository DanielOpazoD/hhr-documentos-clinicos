import { documentTemplates } from "@/app/lib/catalog";
import type { DocumentSection } from "./types";

export const DEFAULT_TEMPLATE_ID = "certificado_antecedentes";

const sectionsByTemplate: Record<string, DocumentSection[]> = {
  certificado_general: [
    { id: "motivo", title: "Certificación", body: "Se certifica que la persona individualizada se encuentra bajo control médico." },
    { id: "vigencia", title: "Observaciones", body: "" },
  ],
  certificado_antecedentes: [
    { id: "antecedentes", title: "Antecedentes mórbidos", body: "" },
    { id: "tratamiento", title: "Tratamiento farmacológico", body: "" },
  ],
  informe_medico: [
    { id: "historia", title: "Historia clínica", body: "" },
    { id: "examen", title: "Examen y resultados", body: "" },
    { id: "diagnostico", title: "Diagnóstico", body: "" },
    { id: "plan", title: "Plan", body: "" },
  ],
  epicrisis: [
    { id: "ingreso", title: "Motivo de ingreso", body: "" },
    { id: "evolucion", title: "Evolución", body: "" },
    { id: "alta", title: "Plan de egreso", body: "" },
  ],
  receta_externa: [
    { id: "prescripcion", title: "Rp.", body: "" },
  ],
  documento_libre: [{ id: "contenido", title: "Contenido", body: "" }],
};

export function getTemplate(templateId: string) {
  return documentTemplates.find((template) => template.id === templateId)
    ?? documentTemplates.find((template) => template.id === DEFAULT_TEMPLATE_ID)!;
}

export function normalizeTemplateId(templateId: string): string {
  if (templateId === "epicrisis_demo") return "epicrisis";
  return documentTemplates.some((template) => template.id === templateId)
    ? templateId
    : "documento_libre";
}

export function createSections(templateId: string): DocumentSection[] {
  const sections = sectionsByTemplate[normalizeTemplateId(templateId)]
    ?? sectionsByTemplate.documento_libre;
  return sections.map((section) => ({ ...section }));
}

export function normalizeSections(templateId: string, sections: DocumentSection[]): DocumentSection[] {
  if (normalizeTemplateId(templateId) !== "receta_externa") return sections;
  const prescription = sections.find((section) => section.id === "prescripcion");
  if (prescription) return [{ ...prescription, title: "Rp." }];
  const body = sections.map((section) => section.body.trim()).filter(Boolean).join("\n\n");
  return [{ id: "prescripcion", title: "Rp.", body }];
}
