"use client";

import { Trash2, UploadCloud } from "@/app/components/Icons";
import { OperationFeedback } from "@/app/components/OperationFeedback";
import { EmptyState, PageHeader } from "@/app/components/VisualPrimitives";
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

      {library.message ? <OperationFeedback tone="success" title={library.message} onDismiss={() => library.setMessage(null)} /> : null}
      {library.error ? (
        <OperationFeedback
          tone="error"
          title={{
            load: "No se pudieron cargar los archivos",
            rename: "No se pudo cambiar el nombre",
            delete: "No se pudieron eliminar los archivos",
            upload: "No se pudo subir el archivo",
            archive: "No se pudo actualizar el archivo",
          }[library.error.operation]}
          message={library.error.message}
          supportId={library.error.supportId}
          code={library.error.code}
          onDismiss={() => library.setError(null)}
          actions={library.error.operation === "load" && library.error.retryable ? (
            <button type="button" className="text-button" onClick={() => void library.retryLoad()}>Reintentar</button>
          ) : null}
        />
      ) : null}

      <FilesToolbar {...library} />

      {library.selectionMode ? (
        <div className="file-selection-bar">
          <label><input type="checkbox" checked={library.allVisibleSelected} onChange={library.toggleAllVisible} /> Todos visibles</label>
          <span>{selectedVisibleIds.length} seleccionados</span>
          <button className="button danger-button" disabled={!selectedVisibleIds.length} onClick={() => library.setPendingDeleteIds(selectedVisibleIds)}><Trash2 size={14} /> Eliminar</button>
        </div>
      ) : null}

      {library.loading ? (
        <EmptyState title="Cargando archivos…" />
      ) : library.filteredFiles.length ? (
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
        <EmptyState icon={<UploadCloud size={36} />} title="No hay archivos" description={library.files.length ? "Cambie los filtros para ver otros resultados." : "Suba el primer documento a su respaldo."} action={<button className="button primary" onClick={() => inputRef.current?.click()}>Seleccionar archivo</button>} />
      )}

      <FileDialogs {...library} />
    </div>
  );
}
