import { Check, RotateCcw, Save } from "@/app/components/Icons";
import type { DocumentWorkspace } from "./use-document-workspace";
import { patientFullName } from "./identity";

type Props = Pick<
  DocumentWorkspace,
  | "dirty"
  | "documentId"
  | "documentTitle"
  | "patient"
  | "savedAt"
  | "saveError"
  | "saving"
  | "setDocumentTitle"
  | "status"
  | "markDirty"
  | "persist"
>;

export function DocumentCommandBar({
  dirty,
  documentId,
  documentTitle,
  patient,
  savedAt,
  saveError,
  saving,
  setDocumentTitle,
  status,
  markDirty,
  persist,
}: Props) {
  const saveLabel = saving
    ? "Guardando…"
    : dirty ? "Cambios pendientes"
    : documentId ? "Guardado" : "Nuevo";

  return (
    <>
      <div className="document-command-bar print-hide">
        <label className="document-title-field">
          <span>Título</span>
          <input
            value={documentTitle}
            onChange={(event) => {
              setDocumentTitle(event.target.value);
              markDirty();
            }}
          />
        </label>
        <div className="save-state" role="status" aria-live="polite">
          <span className={dirty ? "status-dot pending" : "status-dot"} />
          <span><strong>{saveLabel}</strong>{savedAt ? <small>{savedAt}</small> : null}</span>
        </div>
        <div className="document-status-actions">
          {status === "Borrador" ? (
            <button className="button secondary" disabled={saving || !patientFullName(patient)} onClick={() => void persist("Revisado")}>
              <Check size={15} /> Revisar
            </button>
          ) : status === "Revisado" ? (
            <button className="button secondary" disabled={saving} onClick={() => void persist("Finalizado")}>
              <Check size={15} /> Finalizar
            </button>
          ) : (
            <button className="button secondary" disabled={saving} onClick={() => void persist("Borrador")}>
              <RotateCcw size={15} /> Editar
            </button>
          )}
          <button
            className="icon-button"
            disabled={saving || (status !== "Borrador" && !patientFullName(patient))}
            onClick={() => void persist()}
            aria-label="Guardar ahora"
            aria-keyshortcuts="Control+S Meta+S"
          >
            <Save size={17} />
          </button>
        </div>
      </div>
      {saveError ? <p className="form-error document-save-error">{saveError}</p> : null}
    </>
  );
}
