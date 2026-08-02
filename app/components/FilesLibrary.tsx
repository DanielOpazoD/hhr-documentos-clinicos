"use client";

import { Trash2, UploadCloud, X } from "@/app/components/Icons";
import { PageHeader } from "@/app/components/VisualPrimitives";
import { FileCard } from "@/app/features/files/FileCard";
import { FileDialogs } from "@/app/features/files/FileDialogs";
import { FilesToolbar } from "@/app/features/files/FilesToolbar";
import { useFilesLibrary } from "@/app/features/files/use-files-library";
import { useRef } from "react";

export function FilesLibrary() {
  const library = useFilesLibrary();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedVisibleIds = library.filteredFiles.filter((file) => library.selectedIds.has(file.id)).map((file) => file.id);

  return (
    <div className="page-wrap">
      <PageHeader
        title="Archivos"
        description="Organice y recupere documentos privados desde una única biblioteca."
        actions={<>
          <input ref={inputRef} type="file" hidden accept=".pdf,.docx,.jpg,.jpeg,.png,.heic,.heif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void library.upload(file); event.target.value = ""; }} />
          <button className="button primary" onClick={() => inputRef.current?.click()} disabled={library.uploading}><UploadCloud size={16} /> {library.uploading ? "Subiendo…" : "Subir archivo"}</button>
        </>}
      />

      {library.message ? <div className="notice success" role="status">{library.message}<button onClick={() => library.setMessage(null)} aria-label="Cerrar"><X size={15} /></button></div> : null}
      {library.error ? <div className="notice error" role="alert">{library.error}<button onClick={() => library.setError(null)} aria-label="Cerrar"><X size={15} /></button></div> : null}

      <FilesToolbar {...library} />

      {library.selectionMode ? (
        <div className="file-selection-bar">
          <label><input type="checkbox" checked={library.allVisibleSelected} onChange={library.toggleAllVisible} /> Todos visibles</label>
          <span>{selectedVisibleIds.length} seleccionados</span>
          <button className="button danger-button" disabled={!selectedVisibleIds.length} onClick={() => library.setPendingDeleteIds(selectedVisibleIds)}><Trash2 size={14} /> Eliminar</button>
        </div>
      ) : null}

      {library.filteredFiles.length ? (
        <div className={`files-${library.view}`}>
          {library.filteredFiles.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              selected={library.selectedIds.has(file.id)}
              selectionMode={library.selectionMode}
              onPreview={() => library.setPreview(file)}
              onRename={() => library.startRename(file)}
              onToggleArchive={() => void library.toggleArchive(file)}
              onToggleSelected={() => library.toggleSelected(file.id)}
              onDelete={() => library.setPendingDeleteIds([file.id])}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state"><UploadCloud size={36} /><strong>No hay archivos</strong><p>{library.files.length ? "Cambie los filtros para ver otros resultados." : "Suba el primer documento a su respaldo."}</p><button className="button primary" onClick={() => inputRef.current?.click()}>Seleccionar archivo</button></div>
      )}

      <FileDialogs {...library} />
    </div>
  );
}
