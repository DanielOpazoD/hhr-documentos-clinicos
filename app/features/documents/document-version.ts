import { normalizeDocumentStatus, type DocumentStatus } from "./document-policy.ts";

export type DocumentVersionSnapshot = {
  templateId: string;
  title: string;
  patientName: string;
  patientRutMasked: string;
  status: DocumentStatus;
  content: unknown;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function serializeDocumentVersionSnapshot(snapshot: DocumentVersionSnapshot): string {
  return JSON.stringify(snapshot);
}

export function nextRestorationVersions(currentVersion: number) {
  return { archivedVersion: currentVersion + 1, restoredVersion: currentVersion + 2 };
}

export function parseDocumentVersionSnapshot(snapshotJson: unknown): DocumentVersionSnapshot | null {
  const snapshot = record(parseJson(snapshotJson));
  const content = record(snapshot?.content);
  if (
    !snapshot || !content ||
    typeof snapshot.templateId !== "string" || !snapshot.templateId ||
    typeof snapshot.title !== "string" || !snapshot.title ||
    typeof snapshot.patientName !== "string" ||
    typeof snapshot.patientRutMasked !== "string" ||
    !["Borrador", "Revisado", "Finalizado"].includes(String(snapshot.status))
  ) return null;
  return {
    templateId: snapshot.templateId,
    title: snapshot.title,
    patientName: snapshot.patientName,
    patientRutMasked: snapshot.patientRutMasked,
    status: normalizeDocumentStatus(snapshot.status),
    content,
  };
}
