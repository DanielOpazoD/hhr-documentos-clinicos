import type { AiPromptProfile } from "./prompt-types";
import type { AiTargetId } from "./types";

export const PROMPT_ENGINE_VERSION = "clinical-draft-v4";

const builtInDefinitions: Array<Pick<AiPromptProfile, "id" | "name" | "target" | "instructions">> = [
  {
    id: "builtin-resumen",
    name: "Resumen clínico",
    target: "resumen",
    instructions: "Redacta una síntesis clínica breve y cronológica. Prioriza motivo, antecedentes relevantes, hallazgos, resultados y asuntos pendientes. Evita repeticiones y conserva la terminología de las fuentes.",
  },
  {
    id: "builtin-informe",
    name: "Informe médico",
    target: "informe",
    instructions: "Organiza el borrador en antecedentes, hallazgos y asuntos pendientes. Mantén una redacción clínica sobria, explícita y verificable, sin convertir información incompleta en conclusiones.",
  },
  {
    id: "builtin-certificado",
    name: "Certificado clínico",
    target: "certificado",
    instructions: "Prepara un certificado breve que exponga solamente propósito y hechos verificables. Identifica con claridad los datos necesarios que no estén presentes en las fuentes.",
  },
  {
    id: "builtin-antecedentes",
    name: "Antecedentes y fármacos",
    target: "antecedentes",
    instructions: "Extrae antecedentes y tratamientos en una estructura compacta. Conserva literalmente nombres de fármacos, dosis, vías y frecuencias, y separa los datos ambiguos de los explícitos.",
  },
];

export const builtInPromptProfiles: AiPromptProfile[] = builtInDefinitions.map((profile) => ({
  ...profile,
  revision: 1,
  isDefault: true,
  builtIn: true,
  createdAt: "",
  updatedAt: "",
}));

export function builtInPrompt(target: AiTargetId): AiPromptProfile {
  const profile = builtInPromptProfiles.find((item) => item.target === target);
  if (!profile) throw new Error("No existe un prompt base para este documento.");
  return profile;
}

export function builtInPromptById(id: string): AiPromptProfile | null {
  return builtInPromptProfiles.find((item) => item.id === id) ?? null;
}

export function promptVersion(profile: Pick<AiPromptProfile, "id" | "revision">): string {
  return `${PROMPT_ENGINE_VERSION}:${profile.id}:r${profile.revision}`;
}
