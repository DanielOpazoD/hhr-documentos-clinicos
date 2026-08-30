import type { DocumentStatus } from "@/app/lib/catalog";
import type { AiEvidence, AiGenerationSnapshot, AiPromptTrace, AiWorkflowSummary } from "@/app/features/ai/types";

export type DocumentSection = {
  id: string;
  title: string;
  body: string;
};

export type PatientData = {
  firstNames: string;
  lastNames: string;
  fullName?: string;
  rut: string;
  birthDate: string;
};

export type SignerData = {
  name: string;
  rut: string;
  specialty: string;
};

export type SignatureAssetKind = "signature" | "stamp";

export type StoredDocument = {
  id: string;
  templateId: string;
  title: string;
  patientName: string;
  patientRutMasked: string;
  status: DocumentStatus;
  version: number;
  updatedAt: string;
};

export type SignatureRecord = {
  id: string;
  kind: SignatureAssetKind;
  name: string;
  professionalName: string;
  professionalRut: string;
  specialty: string;
  imageUrl: string;
  isDefault: boolean;
  createdAt?: string;
};

export type PlacedSignature = SignatureRecord & {
  x: number;
  y: number;
  width: number;
  hidden?: boolean;
};

export type StoredAiMetadata = {
  source?: string;
  sources?: string[];
  provider?: string;
  providerName?: string;
  model?: string;
  promptVersion?: string;
  workflow?: AiWorkflowSummary;
  promptTrace?: AiPromptTrace;
  originalOutput?: AiGenerationSnapshot;
  evidence?: Record<string, AiEvidence[]> | AiEvidence[][];
  editedSectionIds?: string[];
  missingInformation?: string[];
  safetyNotice?: string;
};

export type StoredContent = {
  sections?: Array<{
    id?: string;
    title?: string;
    body?: string;
    text?: string;
  }>;
  patient?: Partial<PatientData> & { name?: string; insurance?: string };
  signer?: Partial<SignerData>;
  issueDate?: string;
  frameHidden?: boolean;
  signature?: Omit<PlacedSignature, "imageUrl" | "isDefault" | "name"> & { imageUrl?: string; name?: string };
  stamp?: Omit<PlacedSignature, "imageUrl" | "isDefault" | "name"> & { imageUrl?: string; name?: string };
  ai?: StoredAiMetadata;
};

export type StoredDocumentDetail = StoredDocument & {
  content?: StoredContent;
};

export type StoredDocumentVersion = {
  version: number;
  title: string;
  patientName: string;
  status: DocumentStatus;
  createdAt: string;
};

export type SaveDocumentInput = {
  id?: string;
  expectedUpdatedAt?: string;
  templateId: string;
  title: string;
  patientName: string;
  patientRutMasked: string;
  status: DocumentStatus;
  content: StoredContent;
};

export type SignatureForm = {
  file: File | null;
  name: string;
  professionalName: string;
  professionalRut: string;
  specialty: string;
};

export type DocumentTemplateSectionSetting = Pick<DocumentSection, "id" | "title">;

export type DocumentTemplateSetting = {
  templateId: string;
  title: string;
  sections: DocumentTemplateSectionSetting[];
  promptId: string | null;
  updatedAt?: string;
};
