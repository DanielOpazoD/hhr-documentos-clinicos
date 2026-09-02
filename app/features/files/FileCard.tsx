import { Archive, Download, Eye, File, FileImage, FileText, FolderOpen, MoreHorizontal, Pencil, Trash2 } from "@/app/components/Icons";
import { formatBytes } from "@/app/lib/client/format-bytes";
import { useRef } from "react";
import type { SavedFile } from "./types";

type Props = {
  file: SavedFile;
  selected: boolean;
  selectionMode: boolean;
  onPreview: () => void;
  onRename: () => void;
  onToggleArchive: () => void;
  onToggleSelected: () => void;
  onDelete: () => void;
};

function fileIcon(file: SavedFile) {
  if (file.mimeType.startsWith("image/")) return <FileImage size={24} />;
  if (file.mimeType === "application/pdf") return <FileText size={24} />;
  return <File size={24} />;
}

export function FileCard({ file, selected, selectionMode, onPreview, onRename, onToggleArchive, onToggleSelected, onDelete }: Props) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  function runMenuAction(action: () => void, restoreFocus = false) {
    const summary = menuRef.current?.querySelector("summary");
    if (menuRef.current) menuRef.current.open = false;
    action();
    if (restoreFocus) {
      requestAnimationFrame(() => (summary as HTMLElement | null)?.focus());
    }
  }

  return (
    <article className={`file-card${selected ? " selected" : ""}`}>
      {selectionMode ? <input className="file-select" type="checkbox" checked={selected} onChange={onToggleSelected} aria-label={`Seleccionar ${file.name}`} /> : null}
      <button className="file-preview-area" onClick={selectionMode ? onToggleSelected : onPreview} aria-label={selectionMode ? `Seleccionar ${file.name}` : `Previsualizar ${file.name}`}>
        <span className="large-file-icon">{fileIcon(file)}</span>
        <span className="origin-chip">{file.status === "archivado" ? "Archivado" : file.origin}</span>
      </button>
      <div className="file-card-body">
        <div><strong title={file.name}>{file.name}</strong><small>{formatBytes(file.size)} · {new Date(file.createdAt).toLocaleDateString("es-CL")}</small></div>
        {!selectionMode ? (
          <div className="file-actions">
            <button className="text-button file-open-action" onClick={onPreview}><Eye size={15} /> Abrir</button>
            <details ref={menuRef} className="section-actions-menu file-actions-menu">
              <summary aria-label={`Más acciones para ${file.name}`}><MoreHorizontal size={17} /></summary>
              <div>
                <a href={`/api/files/${file.id}?download=1`} download><Download size={15} /> Descargar</a>
                <button onClick={() => runMenuAction(onRename)}><Pencil size={15} /> Cambiar nombre</button>
                <button onClick={() => runMenuAction(onToggleArchive, true)}>{file.status === "archivado" ? <FolderOpen size={15} /> : <Archive size={15} />}{file.status === "archivado" ? "Restaurar" : "Archivar"}</button>
                <button className="section-delete" onClick={() => runMenuAction(onDelete)}><Trash2 size={15} /> Eliminar</button>
              </div>
            </details>
          </div>
        ) : null}
      </div>
    </article>
  );
}
