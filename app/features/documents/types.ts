import type { DocumentStatus } from "@/app/lib/catalog";
import type { AiEvidence } from "@/app/features/ai/types";

export type DocumentSection = {
  id: string;
  title: string;
  body: string;
};

export type PatientData = {
  firstNames: string;
  lastNames: string;
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
};

export type StoredAiMetadata = {
  source?: string;
  sources?: string[];
  provider?: string;
  providerName?: string;
  model?: string;
  promptVersion?: string;
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
  signature?: Omit<PlacedSignature, "imageUrl" | "isDefault"> & { imageUrl?: string };
  stamp?: Omit<PlacedSignature, "imageUrl" | "isDefault"> & { imageUrl?: string };
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
  professionalName: string;
  professionalRut: string;
  specialty: string;
};
