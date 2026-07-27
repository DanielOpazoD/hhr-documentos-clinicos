/* eslint-disable @next/next/no-img-element -- Private authenticated previews are served dynamically. */

import { Download, File, Trash2, X } from "@/app/components/Icons";
import { formatBytes } from "@/app/lib/client-pdf";
import type { FilesLibraryController } from "./use-files-library";

type Props = Pick<FilesLibraryController,
  "busy" | "closeTransient" | "confirmDelete" | "pendingDeleteFiles" | "preview" | "renameValue" |
  "renaming" | "saveRename" | "setPreview" | "setRenameValue" | "setRenaming"
>;

export function FileDialogs(props: Props) {
  return (
    <>
      {props.preview ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.setPreview(null); }}>
          <section className="preview-modal" role="dialog" aria-modal="true" aria-label={`Vista previa de ${props.preview.name}`}>
            <header><div><span className="eyebrow">Vista previa</span><h2>{props.preview.name}</h2></div><button onClick={() => props.setPreview(null)} aria-label="Cerrar" aria-keyshortcuts="Escape"><X size={20} /></button></header>
            <div className="preview-frame">{props.preview.mimeType.startsWith("image/") ? <img src={`/api/files/${props.preview.id}`} alt={props.preview.name} /> : props.preview.mimeType === "application/pdf" ? <iframe src={`/api/files/${props.preview.id}`} title={props.preview.name} /> : <div><File size={44} /><p>Este formato está disponible para descarga.</p></div>}</div>
            <footer><span>{props.preview.origin} · {formatBytes(props.preview.size)}</span><a className="button primary" href={`/api/files/${props.preview.id}?download=1`}><Download size={16} /> Descargar</a></footer>
          </section>
        </div>
      ) : null}
      {props.renaming ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.setRenaming(null); }}>
          <section className="rename-modal" role="dialog" aria-modal="true" aria-label="Cambiar nombre">
            <h2>Cambiar nombre</h2>
            <form onSubmit={(event) => { event.preventDefault(); void props.saveRename(); }}>
              <label>Nombre del archivo<input value={props.renameValue} onChange={(event) => props.setRenameValue(event.target.value)} autoFocus /></label>
              <div><button className="button secondary" type="button" onClick={() => props.setRenaming(null)}>Cancelar</button><button className="button primary" type="submit" disabled={props.busy || !props.renameValue.trim()} aria-keyshortcuts="Enter">Guardar</button></div>
            </form>
          </section>
        </div>
      ) : null}
      {props.pendingDeleteFiles.length ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.closeTransient(); }}>
          <section className="rename-modal delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-file-title">
            <span className="danger-dialog-icon"><Trash2 size={19} /></span>
            <h2 id="delete-file-title">Eliminar {props.pendingDeleteFiles.length === 1 ? "archivo" : `${props.pendingDeleteFiles.length} archivos`}</h2>
            <p>{props.pendingDeleteFiles.length === 1 ? props.pendingDeleteFiles[0].name : "Los archivos seleccionados se eliminarán del respaldo."}</p>
            <div><button className="button secondary" onClick={props.closeTransient}>Cancelar</button><button className="button danger-button" autoFocus disabled={props.busy} onClick={() => void props.confirmDelete()} aria-keyshortcuts="Enter">{props.busy ? "Eliminando…" : "Eliminar"}</button></div>
          </section>
        </div>
      ) : null}
    </>
  );
}
