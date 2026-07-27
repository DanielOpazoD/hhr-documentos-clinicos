export type DocumentStatus = "Borrador" | "Revisado" | "Finalizado";

export function normalizeDocumentStatus(value: unknown): DocumentStatus {
  return value === "Revisado" || value === "Finalizado" ? value : "Borrador";
}

export function nextDocumentVersion(
  existing: { version: number; status: string } | null,
  nextStatus: DocumentStatus,
): number {
  if (!existing) return 1;
  const createsClinicalVersion = nextStatus !== "Borrador" && nextStatus !== existing.status;
  return existing.version + (createsClinicalVersion ? 1 : 0);
}

export function requiresPatientIdentity(status: DocumentStatus): boolean {
  return status !== "Borrador";
}

export function isDocumentWriteConflict(currentUpdatedAt: string, expectedUpdatedAt?: string): boolean {
  return Boolean(expectedUpdatedAt && currentUpdatedAt !== expectedUpdatedAt);
}
