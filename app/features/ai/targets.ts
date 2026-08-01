import type { AiPromptMode, AiTargetId } from "./types";

export const FREEFORM_SCHEMA_TARGET: AiTargetId = "informe_medico";

export type AiTargetDefinition = {
  id: AiTargetId;
  name: string;
  text: string;
  group: "Hospitalización" | "Informes" | "Teleconsultas" | "Traslados";
  output: "Documento HHR" | "Word oficial";
};

export const aiTargets: AiTargetDefinition[] = [
  { id: "epicrisis", name: "Epicrisis médica", text: "Cierre completo de hospitalización", group: "Hospitalización", output: "Documento HHR" },
  { id: "traslado_agudo", name: "Informe médico de traslado", text: "Evacuación aguda y estado actual", group: "Traslados", output: "Documento HHR" },
  { id: "traslado_salvador", name: "Traslado al Hospital del Salvador", text: "Rellena el formulario institucional", group: "Traslados", output: "Word oficial" },
  { id: "informe_medico", name: "Informe médico ambulatorio", text: "Resumen o atención médica", group: "Informes", output: "Documento HHR" },
  { id: "certificado", name: "Certificado médico", text: "Cinco variantes con mínima divulgación", group: "Informes", output: "Documento HHR" },
  { id: "tele_gastro", name: "Telegastroenterología", text: "Historia digestiva y pregunta clínica", group: "Teleconsultas", output: "Documento HHR" },
  { id: "tele_nefro", name: "Telenefrología", text: "Trayectoria renal y tratamiento", group: "Teleconsultas", output: "Documento HHR" },
  { id: "tele_reumato", name: "Telereumatología", text: "Trayectoria serológica y examen", group: "Teleconsultas", output: "Documento HHR" },
];

export const aiTargetGroups = ["Hospitalización", "Informes", "Teleconsultas", "Traslados"] as const;

export function getTargetName(target: AiTargetId): string {
  return aiTargets.find((item) => item.id === target)?.name ?? "Documento clínico";
}

export function getTargetDefinition(target: AiTargetId): AiTargetDefinition {
  return aiTargets.find((item) => item.id === target) ?? aiTargets[0];
}

export function documentTemplateForAiTarget(target: AiTargetId): string {
  if (target === "epicrisis") return "epicrisis";
  if (target === "informe_medico" || target === "traslado_agudo") return "informe_medico";
  if (target === "certificado") return "certificado_general";
  return "documento_libre";
}

export function aiTargetForDocumentTemplate(templateId: string): AiTargetId | null {
  if (templateId === "epicrisis") return "epicrisis";
  if (templateId === "informe_medico" || templateId === "documento_libre") return "informe_medico";
  if (templateId === "certificado_general" || templateId === "certificado_antecedentes") return "certificado";
  return null;
}

export function resolveAiDraftTemplateId(input: {
  target: AiTargetId;
  promptMode: AiPromptMode;
  sourceTarget?: AiTargetId;
  sourceTemplateId?: string;
}): string {
  if (input.promptMode === "free") return "documento_libre";
  if (input.sourceTemplateId && input.sourceTarget === input.target) return input.sourceTemplateId;
  return documentTemplateForAiTarget(input.target);
}

export const defaultClinicalSigner = {
  name: "Dr. Daniel Opazo",
  rut: "17.752.753-K",
  specialty: "Medicina Interna",
};
