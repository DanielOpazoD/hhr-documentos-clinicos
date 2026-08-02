import { Clock3, Save } from "@/app/components/Icons";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "documentId"
  | "dirty"
  | "saveError"
  | "savedAt"
  | "saving"
  | "status"
  | "version"
  | "openDocumentHistory"
  | "persist"
  | "reloadDocument"
>;

export function DocumentCommandActions({
  documentId,
  dirty,
  saveError,
  savedAt,
  saving,
  status,
  version,
  openDocumentHistory,
  persist,
}: Props) {
  const saveState = saveError
    ? "Error al guardar"
    : saving
      ? "Guardando…"
      : dirty
        ? "Cambios sin guardar"
        : documentId
          ? savedAt ? `Guardado ${savedAt}` : "Guardado"
          : "Nuevo documento";
  return (
    <div className="document-command-bar print-hide">
      <div
        className="document-workspace-state"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        title={`${saveState}. ${status}, versión ${version}.`}
      >
        <span>{saveState}</span>
        <small>{status} · v{version}</small>
      </div>
      <div className="document-status-actions">
        {documentId ? (
          <button aria-label="Ver historial del documento" className="button secondary history-button" disabled={saving} onClick={() => void openDocumentHistory()}>
            <Clock3 size={15} /><span>Historial</span>
          </button>
        ) : null}
        {dirty && !saveError ? (
          <button
            className="button secondary document-save-button"
            disabled={saving}
            onClick={() => void persist()}
            aria-label="Guardar ahora"
            aria-keyshortcuts="Control+S Meta+S"
          >
            <Save size={16} />
            <span>Guardar</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function DocumentSaveError({ persist, reloadDocument, saveError, saving }: Pick<Props, "persist" | "reloadDocument" | "saveError" | "saving">) {
  if (!saveError) return null;
  const saveConflict = saveError.includes("otra pestaña");
  return (
    <div className="form-error document-save-error" role="alert">
      <span>{saveError}</span>
      <div className="document-save-error-actions">
        {!saveConflict ? (
          <button className="text-button" disabled={saving} onClick={() => void persist()}>Reintentar guardado</button>
        ) : null}
        {saveConflict ? (
          <button className="text-button" disabled={saving} onClick={() => void reloadDocument()}>Descartar cambios y recargar</button>
        ) : null}
      </div>
    </div>
  );
}
