"use client";

/* eslint-disable @next/next/no-img-element -- Processed previews are local object URLs. */

import { Check, Download, FileImage, Loader2, Pencil, Save, Trash2, UploadCloud } from "@/app/components/Icons";
import { OperationFeedback } from "@/app/components/OperationFeedback";
import { uploadSavedFile } from "@/app/features/files/client";
import { detectDocumentCorners } from "@/app/features/scanner/document-detection";
import {
  cloneScanCorners,
  ScanReviewEditor,
  type ScanReviewState,
} from "@/app/features/scanner/ScanReviewEditor";
import { createScannedPdf } from "@/app/features/scanner/scanned-pdf";
import { formatBytes } from "@/app/lib/client/format-bytes";
import {
  operationFailure,
  toOperationFailure,
  type OperationFailure,
} from "@/app/lib/client/operation-feedback";
import {
  prepareScanSource,
  renderScannedPage,
  scanAdjustmentsForFilter,
  type ScanAdjustments,
  type ScanCorners,
  type ScanFilter,
  type ScanQuality,
} from "@/app/lib/scan-processing";
import { useEffect, useRef, useState } from "react";

type ImportedPage = {
  id: string;
  file: File;
  sourceFile: File;
  sourceWidth: number;
  sourceHeight: number;
  sourceUrl: string;
  corners: ScanCorners;
  url: string;
  filter: ScanFilter;
  adjustments: ScanAdjustments;
  edgeConfidence: number;
  quality: ScanQuality;
  outputWidth: number;
  outputHeight: number;
};

const MAX_IMAGES = 12;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const FILTERS: Array<{ value: ScanFilter; label: string }> = [
  { value: "auto", label: "Documento" },
  { value: "color", label: "Original" },
  { value: "gray", label: "Grises" },
  { value: "bw", label: "B/N" },
];

function hasPreset(page: ImportedPage, filter: ScanFilter, preset: ScanAdjustments) {
  return page.filter === filter
    && (page.adjustments.brightness ?? 50) === (preset.brightness ?? 50)
    && page.adjustments.contrast === preset.contrast
    && (page.adjustments.saturation ?? 50) === (preset.saturation ?? 50)
    && page.adjustments.whiten === preset.whiten
    && (page.adjustments.sharpness ?? 0) === (preset.sharpness ?? 0);
}

function isSupportedImage(file: File) {
  return ACCEPTED_IMAGE_TYPES.has(file.type.toLowerCase()) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

function fileStem(value: string) {
  const normalized = value.trim().replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ");
  return normalized.slice(0, 80) || "Documento escaneado";
}

function imageExtension(file: File) {
  return file.type === "image/png" ? "png" : "jpg";
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function releasePageUrls(page: Pick<ImportedPage, "url" | "sourceUrl">) {
  URL.revokeObjectURL(page.url);
  URL.revokeObjectURL(page.sourceUrl);
}

export function DesktopImageScanner() {
  const [pages, setPages] = useState<ImportedPage[]>([]);
  const [name, setName] = useState("Documento escaneado");
  const [filter, setFilter] = useState<ScanFilter>("auto");
  const [busy, setBusy] = useState<"processing" | "download" | "save" | null>(null);
  const [error, setErrorState] = useState<OperationFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [review, setReview] = useState<ScanReviewState | null>(null);
  const [detecting, setDetecting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pagesRef = useRef<ImportedPage[]>([]);

  function setError(value: string | OperationFailure | null) {
    setErrorState(typeof value === "string" ? operationFailure(value) : value);
  }

  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => () => pagesRef.current.forEach(releasePageUrls), []);

  async function processFiles(files: File[]) {
    if (busy || !files.length) return;
    const remaining = MAX_IMAGES - pages.length;
    const candidates = files.slice(0, remaining);
    const invalid = candidates.find(file => !isSupportedImage(file) || file.size > MAX_SOURCE_BYTES);
    if (invalid) {
      setError(`“${invalid.name}” no es una imagen compatible o supera 15 MB.`);
      return;
    }
    if (!remaining) {
      setError(`Puede procesar hasta ${MAX_IMAGES} imágenes por documento.`);
      return;
    }

    setBusy("processing");
    setError(null);
    setNotice(null);
    const added: ImportedPage[] = [];
    try {
      for (let index = 0; index < candidates.length; index += 1) {
        const pageNumber = pages.length + index + 1;
        const source = await prepareScanSource(candidates[index], pageNumber);
        const detection = await detectDocumentCorners(source.file);
        const adjustments = scanAdjustmentsForFilter(filter);
        const processed = await renderScannedPage(
          source.file,
          source.width,
          source.height,
          detection.corners,
          filter,
          pageNumber,
          adjustments,
        );
        added.push({
          id: crypto.randomUUID(),
          file: processed.file,
          sourceFile: source.file,
          sourceWidth: source.width,
          sourceHeight: source.height,
          sourceUrl: URL.createObjectURL(source.file),
          corners: cloneScanCorners(detection.corners),
          url: URL.createObjectURL(processed.file),
          filter,
          adjustments,
          edgeConfidence: detection.confidence,
          quality: processed.quality,
          outputWidth: processed.width,
          outputHeight: processed.height,
        });
      }
      setPages(current => [...current, ...added]);
      if (added[0]) setReview({ pageId: added[0].id, corners: cloneScanCorners(added[0].corners), filter: added[0].filter, adjustments: { ...added[0].adjustments } });
      if (pages.length === 0 && candidates[0]) setName(fileStem(candidates[0].name));
      setNotice(`${added.length} ${added.length === 1 ? "imagen convertida" : "imágenes convertidas"} con acabado de escáner.`);
      if (files.length > candidates.length) setError(`Se agregaron ${candidates.length}; el límite es de ${MAX_IMAGES} páginas.`);
    } catch {
      added.forEach(releasePageUrls);
      setError("Una imagen no pudo procesarse. Pruebe con JPG, PNG o WEBP.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function changeFilter(nextFilter: ScanFilter) {
    const preset = scanAdjustmentsForFilter(nextFilter);
    if (busy || (nextFilter === filter && pages.every(page => hasPreset(page, nextFilter, preset)))) return;
    if (!pages.length) {
      setFilter(nextFilter);
      return;
    }
    setBusy("processing");
    setError(null);
    setNotice(null);
    const updated: ImportedPage[] = [];
    try {
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index];
        const adjustments = { ...preset };
        const processed = await renderScannedPage(
          page.sourceFile,
          page.sourceWidth,
          page.sourceHeight,
          page.corners,
          nextFilter,
          index + 1,
          adjustments,
        );
        updated.push({ ...page, file: processed.file, url: URL.createObjectURL(processed.file), filter: nextFilter, adjustments, quality: processed.quality, outputWidth: processed.width, outputHeight: processed.height });
      }
      pages.forEach(page => URL.revokeObjectURL(page.url));
      setPages(updated);
      setFilter(nextFilter);
      setNotice("Estilo aplicado a todas las páginas.");
    } catch {
      updated.forEach(page => URL.revokeObjectURL(page.url));
      setError("No se pudo aplicar el estilo. Las páginas anteriores se conservaron.");
    } finally {
      setBusy(null);
    }
  }

  function editPage(page: ImportedPage) {
    if (busy) return;
    setReview({ pageId: page.id, corners: cloneScanCorners(page.corners), filter: page.filter, adjustments: { ...page.adjustments } });
  }

  async function applyReview() {
    if (!review || busy) return;
    const pageIndex = pages.findIndex(page => page.id === review.pageId);
    if (pageIndex < 0) return;
    const page = pages[pageIndex];
    setBusy("processing");
    setError(null);
    try {
      const processed = await renderScannedPage(
        page.sourceFile,
        page.sourceWidth,
        page.sourceHeight,
        review.corners,
        review.filter,
        pageIndex + 1,
        review.adjustments,
      );
      const nextUrl = URL.createObjectURL(processed.file);
      setPages(current => current.map(candidate => candidate.id === page.id ? {
        ...candidate,
        file: processed.file,
        url: nextUrl,
        corners: cloneScanCorners(review.corners),
        filter: review.filter,
        adjustments: { ...review.adjustments },
        quality: processed.quality,
        outputWidth: processed.width,
        outputHeight: processed.height,
      } : candidate));
      URL.revokeObjectURL(page.url);
      setReview(null);
      setNotice("Bordes y calidad aplicados conservando la resolución útil de la imagen.");
    } catch {
      setError("No se pudo aplicar el ajuste. La página anterior se conservó.");
    } finally {
      setBusy(null);
    }
  }

  async function redetectPage() {
    if (!review || detecting) return;
    const page = pages.find(candidate => candidate.id === review.pageId);
    if (!page) return;
    setDetecting(true);
    try {
      const detection = await detectDocumentCorners(page.sourceFile);
      setPages(current => current.map(candidate => candidate.id === page.id ? { ...candidate, edgeConfidence: detection.confidence } : candidate));
      setReview(current => current?.pageId === page.id ? { ...current, corners: cloneScanCorners(detection.corners) } : current);
    } catch {
      setError("No se pudieron detectar los bordes. Puede ajustarlos manualmente.");
    } finally {
      setDetecting(false);
    }
  }

  async function pdfFile() {
    const blob = await createScannedPdf(pages.map(page => ({ file: page.file, rotation: 0 })));
    return new File([blob], `${fileStem(name)}.pdf`, { type: "application/pdf" });
  }

  async function downloadPdf() {
    if (!pages.length || busy) return;
    setBusy("download");
    setError(null);
    try {
      const file = await pdfFile();
      downloadBlob(file, file.name);
      setNotice("PDF preparado y descargado.");
    } catch {
      setError("No se pudo preparar el PDF.");
    } finally { setBusy(null); }
  }

  async function savePdf() {
    if (!pages.length || busy) return;
    setBusy("save");
    setError(null);
    try {
      const file = await pdfFile();
      if (file.size > MAX_SOURCE_BYTES) throw new Error("El PDF supera el límite de 15 MB. Descárguelo o divídalo en dos documentos.");
      const saved = await uploadSavedFile(file);
      setNotice(`“${saved.name}” quedó guardado de forma privada en Archivos.`);
    } catch (cause) {
      setError(toOperationFailure(cause, "No se pudo guardar el documento."));
    } finally { setBusy(null); }
  }

  function removePage(id: string) {
    if (busy) return;
    setPages(current => current.filter(page => {
      if (page.id === id) releasePageUrls(page);
      return page.id !== id;
    }));
    setNotice(null);
  }

  function clearPages() {
    if (busy) return;
    pages.forEach(releasePageUrls);
    setPages([]);
    setNotice(null);
    setError(null);
  }

  const reviewPage = review ? pages.find(page => page.id === review.pageId) : null;

  return <section className="panel scanner-import" aria-labelledby="scanner-import-title">
    <div className="scanner-import-copy">
      <span className="scanner-import-icon"><FileImage size={22} /></span>
      <div><span className="eyebrow">Desde este equipo</span><h2 id="scanner-import-title">Convertir fotos en documento</h2><p>Importe JPG, PNG, WEBP o HEIC. El fondo se limpia y el texto se realza localmente antes de guardar.</p></div>
    </div>
    <div
      className={dragActive ? "scanner-dropzone active" : "scanner-dropzone"}
      onDragEnter={event => { event.preventDefault(); setDragActive(true); }}
      onDragOver={event => event.preventDefault()}
      onDragLeave={event => { if (event.currentTarget === event.target) setDragActive(false); }}
      onDrop={event => { event.preventDefault(); setDragActive(false); void processFiles(Array.from(event.dataTransfer.files)); }}
    >
      <input id="desktop-scan-images" className="scanner-file-input" aria-label="Imágenes para convertir" ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" multiple disabled={Boolean(busy)} onChange={event => void processFiles(Array.from(event.target.files ?? []))} />
      <UploadCloud size={22} />
      <div><strong>{busy === "processing" ? "Procesando imágenes…" : "Arrastre imágenes aquí"}</strong><small>o selecciónelas desde el equipo · hasta {MAX_IMAGES} páginas</small></div>
      <label className="button secondary scanner-file-label" aria-disabled={Boolean(busy)} htmlFor="desktop-scan-images" onClick={event => { if (busy) event.preventDefault(); }}>{busy === "processing" ? <Loader2 size={16} className="spin" /> : <FileImage size={16} />}{busy === "processing" ? "Procesando…" : "Seleccionar imágenes"}</label>
    </div>

    {pages.length ? <div className="scanner-import-workspace">
      <div className="scanner-import-toolbar">
        <label>Nombre del documento<input value={name} maxLength={80} disabled={Boolean(busy)} onChange={event => setName(event.target.value)} /></label>
        <div className="scanner-style-control" role="group" aria-label="Estilo de escaneo">{FILTERS.map(option => <button key={option.value} className={filter === option.value ? "active" : ""} disabled={Boolean(busy)} onClick={() => void changeFilter(option.value)}>{option.label}</button>)}</div>
        <button className="text-button danger" disabled={Boolean(busy)} onClick={clearPages}><Trash2 size={14} /> Limpiar</button>
      </div>
      <div className="scanner-import-pages" aria-label="Páginas procesadas">{pages.map((page, index) => <article key={page.id}>
        <button className="scanner-import-preview" aria-label={`Editar bordes y calidad de la página ${index + 1}`} disabled={Boolean(busy)} onClick={() => editPage(page)}><img src={page.url} alt={`Vista previa de la página ${index + 1}`} /><span>{index + 1}</span></button>
        <div><strong>Página {index + 1}</strong><small className={page.quality.level === "good" ? "quality-good" : "quality-warn"}>{page.quality.label} · {page.outputWidth}×{page.outputHeight} · {formatBytes(page.file.size)}</small></div>
        <div className="scanner-page-actions"><button aria-label={`Editar bordes y calidad de la página ${index + 1}`} title="Editar bordes y calidad" disabled={Boolean(busy)} onClick={() => editPage(page)}><Pencil size={15} /></button><button aria-label={`Descargar página ${index + 1} como imagen`} title="Descargar imagen" disabled={Boolean(busy)} onClick={() => downloadBlob(page.file, `${fileStem(name)} - página ${index + 1}.${imageExtension(page.file)}`)}><Download size={15} /></button><button className="danger" aria-label={`Quitar página ${index + 1}`} title="Quitar página" disabled={Boolean(busy)} onClick={() => removePage(page.id)}><Trash2 size={15} /></button></div>
      </article>)}</div>
      <div className="scanner-import-footer">
        <p><Check size={15} /> Solo el resultado procesado se guarda cuando usted lo solicita.</p>
        <div><button className="button secondary" disabled={Boolean(busy) || !name.trim()} onClick={() => void downloadPdf()}>{busy === "download" ? <Loader2 size={16} className="spin" /> : <Download size={16} />}{busy === "download" ? "Preparando…" : "Descargar PDF"}</button><button className="button primary" disabled={Boolean(busy) || !name.trim()} onClick={() => void savePdf()}>{busy === "save" ? <Loader2 size={16} className="spin" /> : <Save size={16} />}{busy === "save" ? "Guardando…" : "Guardar en Archivos"}</button></div>
      </div>
    </div> : null}
    <div className="scanner-import-feedback">{error ? (
      <OperationFeedback compact tone="error" title="No se pudo completar el procesamiento" message={error.message} supportId={error.supportId} onDismiss={() => setError(null)} />
    ) : notice ? <OperationFeedback compact tone="success" title={notice} onDismiss={() => setNotice(null)} /> : null}</div>
    {review && reviewPage ? <ScanReviewEditor page={reviewPage} review={review} processing={busy === "processing"} detecting={detecting} onChange={change => setReview(current => current ? { ...current, ...change } : current)} onApply={() => void applyReview()} onRedetect={() => void redetectPage()} onClose={() => setReview(null)} /> : null}
  </section>;
}
