export type AiEvidence = {
  sourceIndex: number;
  page: number | null;
  excerpt: string;
  status: "explicito" | "ambiguo" | "no_encontrado";
  verification?: "verified" | "unverified";
};

export type AiPatient = {
  firstNames: string;
  lastNames: string;
  rut: string;
  birthDate: string;
};

export type AiSigner = {
  name: string;
  rut: string;
  specialty: string;
};

export type AiProgressStage = "preparing" | "reading" | "analyzing" | "drafting" | "verifying" | "completed";

export type AiProgress = {
  stage: AiProgressStage;
  label: string;
  detail: string;
};

export type AiProgressReporter = (progress: AiProgress) => void | Promise<void>;

export type AiSourceInput = {
  file: File;
  mimeType: string;
  sourceName: string;
};

export type AiSection = {
  key?: string;
  title: string;
  text: string;
  evidence: AiEvidence[];
  evidenceStale?: boolean;
};

export type AiPromptTrace = {
  mode: AiPromptMode;
  profileId: string;
  profileName: string;
  profileRevision: number | null;
  version: string;
  userInstructions: string;
  effectiveInstructions: string;
  generatedAt: string;
};

export type AiGenerationSnapshot = {
  documentKind: string;
  patient: AiPatient;
  signer: AiSigner;
  sections: AiSection[];
  processingSummary: string;
  missingInformation: string[];
  safetyNotice: string;
};

export type AiImportResult = {
  documentKind: string;
  sources: string[];
  providerId: AiProviderId;
  providerName: string;
  model: string;
  promptVersion: string;
  promptTrace: AiPromptTrace;
  originalOutput: AiGenerationSnapshot;
  sections: AiSection[];
  patient: AiPatient;
  signer: AiSigner;
  processingSummary: string;
  missingInformation: string[];
  safetyNotice: string;
};

export type AiTargetId =
  | "epicrisis"
  | "traslado_agudo"
  | "informe_medico"
  | "certificado"
  | "tele_gastro"
  | "tele_nefro"
  | "tele_reumato"
  | "traslado_salvador";

export type AiPromptMode = "profile" | "free";

export type AiProviderId = "openai" | "gemma_local";

export type AiModelGroup = "Recomendados" | "GPT-5.6" | "GPT-5" | "Razonamiento" | "GPT-4.1" | "GPT-4o" | "Personalizados" | "Otros" | "Local";

export type AiModelOption = {
  id: string;
  name: string;
  detail: string;
  group: AiModelGroup;
  recommended?: boolean;
};

export type AiProviderInfo = {
  id: AiProviderId;
  name: string;
  model: string;
  models: AiModelOption[];
  location: "Nube" | "Este Mac" | "Servidor externo";
  available: boolean;
  detail: string;
};
