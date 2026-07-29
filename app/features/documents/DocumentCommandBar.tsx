import { Clock3, Save } from "@/app/components/Icons";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "documentId"
  | "saveError"
  | "saving"
  | "openDocumentHistory"
  | "persist"
  | "reloadDocument"
>;

export function DocumentCommandActions({
  documentId,
  saving,
  openDocumentHistory,
  persist,
}: Props) {
  return (
    <div className="document-command-bar print-hide">
      <div className="document-status-actions">
        {documentId ? (
          <button className="button secondary history-button" disabled={saving} onClick={() => void openDocumentHistory()}>
            <Clock3 size={15} /> Historial
          </button>
        ) : null}
        <button
          className="button secondary document-save-button"
          disabled={saving}
          onClick={() => void persist()}
          aria-label="Guardar ahora"
          aria-keyshortcuts="Control+S Meta+S"
        >
          <Save size={17} />
          <span>Guardar</span>
        </button>
      </div>
    </div>
  );
}

export function DocumentSaveError({ saveError, reloadDocument }: Pick<Props, "saveError" | "reloadDocument">) {
  if (!saveError) return null;
  return (
    <div className="form-error document-save-error" role="alert">
      <span>{saveError}</span>
      {saveError.includes("otra pestaña") ? (
        <button className="text-button" onClick={() => void reloadDocument()}>Descartar cambios y recargar</button>
      ) : null}
    </div>
  );
}
