"use client";

/* eslint-disable @next/next/no-img-element -- Private authenticated previews are served dynamically and must not pass through an image optimizer. */

import { Archive, Download, Eye, File, FileImage, FileText, Grid2X2, List, Pencil, Search, UploadCloud, X } from "@/app/components/Icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatBytes } from "@/app/lib/client-pdf";

type SavedFile = { id: string; name: string; mimeType: string; size: number; origin: string; status: string; createdAt: string };

export function FilesLibrary() {
  const [files, setFiles] = useState<SavedFile[]>([]);
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState("todos");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<SavedFile | null>(null);
  const [renaming, setRenaming] = useState<SavedFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() { const response = await fetch("/api/files"); const data = await response.json(); setFiles(data.files ?? []); }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  const filtered = useMemo(() => files.filter(file => file.name.toLowerCase().includes(query.toLowerCase()) && (origin === "todos" || file.origin === origin)), [files, query, origin]);
  async function upload(file: File) { setUploading(true); setMessage(null); const form = new FormData(); form.set("file", file); form.set("origin", "Escritorio"); const response = await fetch("/api/files", { method: "POST", body: form }); const data = await response.json(); setUploading(false); setMessage(response.ok ? "Archivo respaldado correctamente." : data.error ?? "No se pudo subir."); if (response.ok) await load(); }
  async function updateFile(id: string, changes: Record<string, string>) { const response = await fetch("/api/files", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }) }); if (response.ok) await load(); }
  function iconFor(file: SavedFile) { if (file.mimeType.startsWith("image/")) return <FileImage size={24} />; if (file.mimeType === "application/pdf") return <FileText size={24} />; return <File size={24} />; }

  return <div className="page-wrap"><header className="page-header"><div><span className="eyebrow">Respaldo privado</span><h1>Biblioteca de archivos</h1><p>PDF, DOCX e imágenes guardados con metadatos y descarga autorizada.</p></div><div className="header-actions"><input ref={inputRef} type="file" hidden accept=".pdf,.docx,.jpg,.jpeg,.png,.heic,.heif" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /><button className="button primary" onClick={() => inputRef.current?.click()} disabled={uploading}><UploadCloud size={16} /> {uploading ? "Subiendo…" : "Subir archivo"}</button></div></header>
    {message && <div className="notice success" role="status">{message}<button onClick={() => setMessage(null)} aria-label="Cerrar"><X size={15} /></button></div>}
    <div className="library-toolbar"><label className="search-box"><Search size={17} /><input aria-label="Buscar archivos" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nombre…" /></label><label>Origen<select value={origin} onChange={event => setOrigin(event.target.value)}><option value="todos">Todos</option><option value="Escritorio">Escritorio</option><option value="QR móvil">QR móvil</option></select></label><div className="segmented" aria-label="Vista"><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Vista cuadrícula"><Grid2X2 size={17} /></button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="Vista lista"><List size={17} /></button></div></div>
    {filtered.length ? <div className={`files-${view}`}>{filtered.map(file => <article className="file-card" key={file.id}><button className="file-preview-area" onClick={() => setPreview(file)} aria-label={`Previsualizar ${file.name}`}><span className="large-file-icon">{iconFor(file)}</span><span className="origin-chip">{file.origin}</span></button><div className="file-card-body"><div><strong title={file.name}>{file.name}</strong><small>{formatBytes(file.size)} · {new Date(file.createdAt).toLocaleDateString("es-CL")}</small></div><div className="file-actions"><button onClick={() => setPreview(file)} aria-label="Previsualizar"><Eye size={16} /></button><a href={`/api/files/${file.id}?download=1`} aria-label="Descargar"><Download size={16} /></a><button onClick={() => { setRenaming(file); setRenameValue(file.name); }} aria-label="Cambiar nombre"><Pencil size={15} /></button><button onClick={() => void updateFile(file.id, { status: "archivado" })} aria-label="Archivar"><Archive size={15} /></button></div></div></article>)}</div> : <div className="empty-state"><UploadCloud size={36} /><strong>No hay archivos para mostrar</strong><p>Suba un documento o cambie los filtros.</p><button className="button primary" onClick={() => inputRef.current?.click()}>Seleccionar archivo</button></div>}
    {preview && <div className="modal-backdrop" role="presentation"><section className="preview-modal" role="dialog" aria-modal="true" aria-label={`Vista previa de ${preview.name}`}><header><div><span className="eyebrow">Vista previa</span><h2>{preview.name}</h2></div><button onClick={() => setPreview(null)} aria-label="Cerrar"><X size={20} /></button></header><div className="preview-frame">{preview.mimeType.startsWith("image/") ? <img src={`/api/files/${preview.id}`} alt={preview.name} /> : preview.mimeType === "application/pdf" ? <iframe src={`/api/files/${preview.id}`} title={preview.name} /> : <div><File size={44} /><p>Este formato se puede descargar, pero no previsualizar en el navegador.</p></div>}</div><footer><span>{preview.origin} · {formatBytes(preview.size)}</span><a className="button primary" href={`/api/files/${preview.id}?download=1`}><Download size={16} /> Descargar</a></footer></section></div>}
    {renaming && <div className="modal-backdrop" role="presentation"><section className="rename-modal" role="dialog" aria-modal="true" aria-label="Cambiar nombre"><h2>Cambiar nombre</h2><label>Nombre del archivo<input value={renameValue} onChange={event => setRenameValue(event.target.value)} autoFocus /></label><div><button className="button secondary" onClick={() => setRenaming(null)}>Cancelar</button><button className="button primary" onClick={() => { void updateFile(renaming.id, { name: renameValue }); setRenaming(null); }}>Guardar</button></div></section></div>}
  </div>;
}
