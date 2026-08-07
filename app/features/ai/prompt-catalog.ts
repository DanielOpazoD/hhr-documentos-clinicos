import type { AiPromptProfile } from "./prompt-types";
import type { AiTargetId } from "./types";
import { acuteTransferPrompt } from "./prompts/acute-transfer-prompt";
import { epicrisisPrompt } from "./prompts/epicrisis-prompt";
import { hospitalSalvadorTransferPrompt } from "./prompts/hospital-salvador-transfer-prompt";
import { medicalCertificatePrompt } from "./prompts/medical-certificate-prompt";
import { medicalReportPrompt } from "./prompts/medical-report-prompt";
import { telegastroPrompt } from "./prompts/telegastro-prompt";
import { telenephrologyPrompt } from "./prompts/telenephrology-prompt";
import { telerheumatologyPrompt } from "./prompts/telerheumatology-prompt";

export const PROMPT_ENGINE_VERSION = "clinical-draft-v7";

type BuiltInPromptDefinition = Pick<AiPromptProfile, "id" | "name" | "target" | "instructions">
  & Partial<Pick<AiPromptProfile, "revision">>;

const builtInDefinitions: BuiltInPromptDefinition[] = [
  {
    id: "builtin-01-epicrisis",
    name: "Epicrisis médica · HHR",
    target: "epicrisis",
    instructions: epicrisisPrompt,
  },
  {
    id: "builtin-02-traslado-agudo",
    name: "Informe médico de traslado · HHR",
    target: "traslado_agudo",
    instructions: acuteTransferPrompt,
  },
  {
    id: "builtin-03-informe-medico",
    name: "Informe médico ambulatorio",
    target: "informe_medico",
    instructions: medicalReportPrompt,
  },
  {
    id: "builtin-04-certificado-medico",
    name: "Certificado médico",
    target: "certificado",
    instructions: medicalCertificatePrompt,
  },
  {
    id: "builtin-05-telegastro",
    name: "Resumen para telegastroenterología",
    target: "tele_gastro",
    instructions: telegastroPrompt,
  },
  {
    id: "builtin-06-telenefrologia",
    name: "Resumen para telenefrología",
    target: "tele_nefro",
    instructions: telenephrologyPrompt,
  },
  {
    id: "builtin-07-telereumatologia",
    name: "Resumen para telereumatología",
    target: "tele_reumato",
    instructions: telerheumatologyPrompt,
  },
  {
    id: "builtin-08-traslado-salvador",
    name: "Traslado Hospital del Salvador · oficial",
    target: "traslado_salvador",
    instructions: hospitalSalvadorTransferPrompt,
    revision: 3,
  },
];

export const builtInPromptProfiles: AiPromptProfile[] = builtInDefinitions.map((profile) => ({
  ...profile,
  revision: profile.revision ?? 1,
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
