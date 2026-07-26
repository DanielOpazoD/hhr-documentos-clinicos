import type { AiTargetId } from "./types";

export const aiTargets: Array<{ id: AiTargetId; name: string; text: string }> = [
  { id: "resumen", name: "Resumen clínico", text: "Síntesis estructurada y verificable" },
  { id: "informe", name: "Informe médico", text: "Historia, hallazgos y plan" },
  { id: "certificado", name: "Certificado", text: "Borrador breve con campos pendientes" },
  { id: "antecedentes", name: "Antecedentes y fármacos", text: "Extracción sin completar datos ausentes" },
];

export function getTargetName(target: AiTargetId): string {
  return aiTargets.find((item) => item.id === target)?.name ?? "Documento clínico";
}
