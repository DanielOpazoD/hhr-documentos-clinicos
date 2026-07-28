import { Check, Clock3, Minus, Plus, RotateCcw, Save } from "@/app/components/Icons";
import type { DocumentWorkspace } from "./use-document-workspace";
import { patientFullName } from "./identity";

type Props = Pick<
  DocumentWorkspace,
  | "dirty"
  | "documentFontSize"
  | "documentId"
  | "documentTitle"
  | "patient"
  | "savedAt"
  | "saveError"
  | "saving"
  | "setDocumentTitle"
  | "status"
  | "markDirty"
  | "canDecreaseDocumentFontSize"
  | "canIncreaseDocumentFontSize"
  | "decreaseDocumentFontSize"
  | "increaseDocumentFontSize"
  | "openDocumentHistory"
  | "persist"
  | "reloadDocument"
>;

export function DocumentCommandBar({
  dirty,
  documentFontSize,
  documentId,
  documentTitle,
  patient,
  savedAt,
  saveError,
  saving,
  setDocumentTitle,
  status,
  markDirty,
  canDecreaseDocumentFontSize,
  canIncreaseDocumentFontSize,
  decreaseDocumentFontSize,
  increaseDocumentFontSize,
  openDocumentHistory,
  persist,
  reloadDocument,
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
        <div className="document-type-control" role="group" aria-label="Tamaño global de letra">
          <span>Texto</span>
          <button type="button" aria-label="Disminuir tamaño de letra" disabled={!canDecreaseDocumentFontSize} onClick={decreaseDocumentFontSize}><Minus size={14} /></button>
          <output aria-live="polite">{documentFontSize}</output>
          <button type="button" aria-label="Aumentar tamaño de letra" disabled={!canIncreaseDocumentFontSize} onClick={increaseDocumentFontSize}><Plus size={14} /></button>
        </div>
        <div className="document-status-actions">
          {documentId ? (
            <button className="button secondary history-button" disabled={saving} onClick={() => void openDocumentHistory()}>
              <Clock3 size={15} /> Historial
            </button>
          ) : null}
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
            className="button primary document-save-button"
            disabled={saving || (status !== "Borrador" && !patientFullName(patient))}
            onClick={() => void persist()}
            aria-label="Guardar ahora"
            aria-keyshortcuts="Control+S Meta+S"
          >
            <Save size={17} />
            <span>Guardar</span>
          </button>
        </div>
      </div>
      {saveError ? (
        <div className="form-error document-save-error" role="alert">
          <span>{saveError}</span>
          {saveError.includes("otra pestaña") ? (
            <button className="text-button" onClick={() => void reloadDocument()}>Descartar cambios y recargar</button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
