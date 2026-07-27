import { Archive, Download, Eye, File, FileImage, FileText, FolderOpen, Pencil, Trash2 } from "@/app/components/Icons";
import { formatBytes } from "@/app/lib/client-pdf";
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
            <button onClick={onPreview} aria-label={`Previsualizar ${file.name}`} title="Vista previa"><Eye size={16} /></button>
            <a href={`/api/files/${file.id}?download=1`} aria-label={`Descargar ${file.name}`} title="Descargar"><Download size={16} /></a>
            <button onClick={onRename} aria-label={`Cambiar nombre de ${file.name}`} title="Cambiar nombre"><Pencil size={15} /></button>
            <button onClick={onToggleArchive} aria-label={file.status === "archivado" ? `Restaurar ${file.name}` : `Archivar ${file.name}`} title={file.status === "archivado" ? "Restaurar" : "Archivar"}>{file.status === "archivado" ? <FolderOpen size={15} /> : <Archive size={15} />}</button>
            <button className="danger" onClick={onDelete} aria-label={`Eliminar ${file.name}`} title="Eliminar"><Trash2 size={15} /></button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
