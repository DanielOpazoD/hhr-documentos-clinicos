"use client";

/* eslint-disable @next/next/no-img-element -- Camera blob URLs are edited in canvas/WebGL and must remain exact client-side sources. */

import { ArrowDown, ArrowUp, Camera, Check, FileImage, Loader2, Pencil, RotateCw, Trash2, UploadCloud, X } from "@/app/components/Icons";
import { useEffect, useRef, useState } from "react";
import { createScannedPdf } from "@/app/lib/client-pdf";
import { prepareScanSource, renderScannedPage, scanAdjustmentsForFilter, type ScanAdjustments, type ScanCorners, type ScanFilter, type ScanQuality } from "@/app/lib/scan-processing";
import { detectDocumentCorners } from "@/app/features/scanner/document-detection";
import { cloneScanCorners, SCAN_FILTER_OPTIONS, ScanReviewEditor, type ScanReviewState } from "@/app/features/scanner/ScanReviewEditor";
import { forgetStoredCaptureToken, getCaptureSession, MobileSessionClientError, uploadCapturedFile } from "@/app/features/files/mobile-session-client";
import { MOBILE_CAPTURE_MAX_FILES } from "@/app/features/files/mobile-session-policy";

type PageFile = {
  id: string;
  file: File;
  url: string;
  sourceFile: File;
  sourceUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  rotation: number;
  quality: ScanQuality;
  filter: ScanFilter;
  corners: ScanCorners;
  adjustments: ScanAdjustments;
  edgeConfidence: number;
};

function canvasFile(canvas: HTMLCanvasElement, name: string) {
  return new Promise<File>((resolve, reject) => canvas.toBlob(blob => blob
    ? resolve(new File([blob], name, { type: "image/jpeg" }))
    : reject(new Error("No se pudo preparar la imagen.")), "image/jpeg", .94));
}

export function MobileCapture({ token }: { token: string }) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [pages, setPages] = useState<PageFile[]>([]);
  const [access, setAccess] = useState<"checking" | "active" | "unavailable" | "error">("checking");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [expiresAt, setExpiresAt] = useState("");
  const [remainingFiles, setRemainingFiles] = useState(MOBILE_CAPTURE_MAX_FILES);
  const [documentUploadId, setDocumentUploadId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("Documento escaneado");
  const [output, setOutput] = useState<"images" | "pdf">("pdf");
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [flash, setFlash] = useState(false);
  const [review, setReview] = useState<ScanReviewState | null>(null);
  const [uploadLocked, setUploadLocked] = useState(false);
  const [deletedUpload, setDeletedUpload] = useState(false);
  const [sentPageCount, setSentPageCount] = useState(0);
  const sentPagesRef = useRef(0);
  const pageLimit = output === "images"
    ? Math.min(MOBILE_CAPTURE_MAX_FILES, sentPageCount + remainingFiles)
    : MOBILE_CAPTURE_MAX_FILES;
  const controlsLocked = busy || uploadLocked;
  const sentPrefixLocked = sentPageCount > 0;
  const unsentPageCount = Math.max(0, pages.length - sentPageCount);

  useEffect(() => {
    const controller = new AbortController();
    void getCaptureSession(token, controller.signal).then(session => {
      setExpiresAt(session.expiresAt);
      setRemainingFiles(session.remainingFiles);
      setAccess("active");
    }).catch(cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof MobileSessionClientError && (cause.status === 404 || cause.status === 410)) {
        forgetStoredCaptureToken();
        setAccess("unavailable");
        return;
      }
      setAccessError(cause instanceof Error ? cause.message : "No se pudo verificar la sesión.");
      setAccess("error");
    });
    return () => controller.abort();
  }, [token, validationAttempt]);
  const pagesRef = useRef<PageFile[]>([]);
  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => () => { pagesRef.current.forEach(page => { URL.revokeObjectURL(page.url); URL.revokeObjectURL(page.sourceUrl); }); streamRef.current?.getTracks().forEach(track => track.stop()); }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
    setCameraReady(false);
    setTorchOn(false);
  }

  async function startCamera() {
    if (controlsLocked) return;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) { cameraInputRef.current?.click(); return; }
    try {
      setCameraOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 3072 } } });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] };
      setTorchAvailable(Boolean(capabilities?.torch));
      if (capabilities?.focusMode?.includes("continuous")) await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] } as unknown as MediaTrackConstraints).catch(() => undefined);
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); setCameraReady(true); }
    } catch {
      stopCamera();
      setError("No se pudo abrir la cámara. Puede usar la cámara del sistema o elegir imágenes.");
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints).catch(() => undefined);
    setTorchOn(next);
  }

  async function addFiles(files: File[]): Promise<boolean> {
    if (!files.length || controlsLocked) return false;
    setProcessing(true);
    setError(null);
    const added: PageFile[] = [];
    try {
      for (let index = 0; index < files.length; index++) {
        const pageNumber = pages.length + index + 1;
        const source = await prepareScanSource(files[index], pageNumber);
        const detection = await detectDocumentCorners(source.file);
        const corners = cloneScanCorners(detection.corners);
        const adjustments = scanAdjustmentsForFilter("auto");
        const processed = await renderScannedPage(source.file, source.width, source.height, corners, "auto", pageNumber, adjustments);
        added.push({ id: crypto.randomUUID(), file: processed.file, url: URL.createObjectURL(processed.file), sourceFile: source.file, sourceUrl: URL.createObjectURL(source.file), sourceWidth: source.width, sourceHeight: source.height, rotation: 0, quality: processed.quality, filter: "auto", corners, adjustments, edgeConfidence: detection.confidence });
      }
      setPages(value => [...value, ...added]);
      if (added[0]) setReview({ pageId: added[0].id, corners: cloneScanCorners(added[0].corners), filter: added[0].filter, adjustments: { ...added[0].adjustments } });
      return true;
    } catch {
      added.forEach(page => { URL.revokeObjectURL(page.url); URL.revokeObjectURL(page.sourceUrl); });
      setError("Una imagen no pudo procesarse. Pruebe con JPG, PNG o una foto nueva.");
      return false;
    }
    finally { setProcessing(false); }
  }

  async function addFileList(list: FileList | null) {
    if (!list) return;
    const available = Math.max(0, pageLimit - pages.length);
    const selected = Array.from(list);
    const accepted = selected.slice(0, available);
    const processed = accepted.length ? await addFiles(accepted) : true;
    if (processed && selected.length > available) {
      setError(`Esta sesión permite agregar ${available} ${available === 1 ? "página más" : "páginas más"}.`);
    }
  }

  async function capturePage() {
    const video = videoRef.current;
    if (!video?.videoWidth || controlsLocked || pages.length >= pageLimit) return;
    const track = streamRef.current?.getVideoTracks()[0];
    type StillCapture = new (mediaTrack: MediaStreamTrack) => { takePhoto: () => Promise<Blob> };
    const ImageCaptureClass = (globalThis as typeof globalThis & { ImageCapture?: StillCapture }).ImageCapture;
    let file: File;
    if (track && ImageCaptureClass) {
      try {
        const blob = await new ImageCaptureClass(track).takePhoto();
        file = new File([blob], `captura-${pages.length + 1}.jpg`, { type: blob.type || "image/jpeg" });
      } catch { file = await captureVideoFrame(video, pages.length + 1); }
    } else file = await captureVideoFrame(video, pages.length + 1);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 140);
    stopCamera();
    await addFiles([file]);
  }

  async function applyReview() {
    if (!review) return;
    const page = pages.find(item => item.id === review.pageId);
    if (!page) return;
    setProcessing(true);
    setError(null);
    try {
      const pageNumber = pages.findIndex(item => item.id === page.id) + 1;
      const processed = await renderScannedPage(page.sourceFile, page.sourceWidth, page.sourceHeight, review.corners, review.filter, pageNumber, review.adjustments);
      const nextUrl = URL.createObjectURL(processed.file);
      setPages(value => value.map(item => {
        if (item.id !== page.id) return item;
        URL.revokeObjectURL(item.url);
        return { ...item, file: processed.file, url: nextUrl, quality: processed.quality, filter: review.filter, corners: cloneScanCorners(review.corners), adjustments: { ...review.adjustments } };
      }));
      setReview(null);
    } catch { setError("No se pudo aplicar el recorte. Restablezca los bordes e intente nuevamente."); }
    finally { setProcessing(false); }
  }

  async function redetectPage() {
    if (!review) return;
    const page = pages.find(item => item.id === review.pageId);
    if (!page) return;
    setDetecting(true);
    try {
      const detection = await detectDocumentCorners(page.sourceFile);
      setReview(value => value ? { ...value, corners: cloneScanCorners(detection.corners) } : value);
      setPages(value => value.map(item => item.id === page.id ? { ...item, edgeConfidence: detection.confidence } : item));
    } catch { setError("No se pudieron detectar los bordes. Puede ajustarlos manualmente."); }
    finally { setDetecting(false); }
  }

  function isEditablePage(id: string) { return !controlsLocked && pages.findIndex(page => page.id === id) >= sentPageCount; }
  function editPage(page: PageFile) { if (isEditablePage(page.id)) setReview({ pageId: page.id, corners: cloneScanCorners(page.corners), filter: page.filter, adjustments: { ...page.adjustments } }); }
  function update(id: string, change: Partial<PageFile>) { if (isEditablePage(id)) setPages(value => value.map(page => page.id === id ? { ...page, ...change } : page)); }
  function remove(id: string) { if (isEditablePage(id)) setPages(value => value.filter(page => { if (page.id === id) { URL.revokeObjectURL(page.url); URL.revokeObjectURL(page.sourceUrl); } return page.id !== id; })); }
  function move(index: number, direction: -1 | 1) { if (controlsLocked) return; const next = [...pages]; const target = index + direction; if (index < sentPageCount || target < sentPageCount || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setPages(next); }
  async function sendFile(file: File, fileName: string, uploadId: string) { return uploadCapturedFile(token, file, fileName, uploadId); }
  async function upload() {
    if (output === "images" && unsentPageCount > remainingFiles) {
      setError(`Esta sesión permite guardar ${remainingFiles} ${remainingFiles === 1 ? "imagen más" : "imágenes más"}.`);
      return;
    }
    setBusy(true);
    setError(null);
    setUploadLocked(true);
    let requestStarted = false;
    try {
      if (output === "pdf") {
        const blob = await createScannedPdf(pages);
        requestStarted = true;
        const uploaded = await sendFile(new File([blob], `${name}.pdf`, { type: "application/pdf" }), `${name}.pdf`, documentUploadId);
        setRemainingFiles(uploaded.remainingFiles);
      } else {
        for (let index = sentPagesRef.current; index < pages.length; index++) {
          requestStarted = true;
          const extension = pages[index].file.type === "image/png" ? "png" : "jpg";
          const uploaded = await sendFile(pages[index].file, `${name} - página ${index + 1}.${extension}`, pages[index].id);
          sentPagesRef.current = index + 1;
          setSentPageCount(index + 1);
          setRemainingFiles(uploaded.remainingFiles);
        }
      }
      setDone(true);
    } catch (cause) {
      const canUnlock = !requestStarted || (
        cause instanceof MobileSessionClientError
        && (cause.status === 400 || cause.code === "capacity_exhausted")
      );
      if (canUnlock) setUploadLocked(false);
      if (cause instanceof MobileSessionClientError && cause.code === "capacity_exhausted") {
        setRemainingFiles(0);
      }
      if (cause instanceof MobileSessionClientError && cause.code === "upload_deleted") {
        setDeletedUpload(true);
      }
      if (cause instanceof MobileSessionClientError && (cause.status === 404 || cause.status === 410)) {
        forgetStoredCaptureToken();
        setAccess("unavailable");
      }
      setError(cause instanceof Error ? cause.message : "No se pudo enviar el documento.");
    } finally {
      setBusy(false);
    }
  }

  function restartAfterDeletedUpload() {
    pages.forEach(page => {
      URL.revokeObjectURL(page.url);
      URL.revokeObjectURL(page.sourceUrl);
    });
    sentPagesRef.current = 0;
    setSentPageCount(0);
    setDocumentUploadId(crypto.randomUUID());
    setUploadLocked(false);
    setDeletedUpload(false);
    setPages([]);
    setError(null);
    setAccess("checking");
    setValidationAttempt(value => value + 1);
  }
  const reviewPage = review ? pages.find(page => page.id === review.pageId) ?? null : null;

  if (access === "checking") return <main className="capture-shell"><div className="capture-status"><Loader2 className="spin" /><p>Abriendo escáner…</p></div></main>;
  if (access === "unavailable") return <main className="capture-shell"><div className="capture-status error"><h1>Enlace no disponible</h1><p>La sesión expiró o fue revocada. Genere un QR nuevo en el escritorio.</p></div></main>;
  if (access === "error") return <main className="capture-shell"><div className="capture-status error"><h1>No se pudo verificar la sesión</h1><p>{accessError ?? "Revise su conexión e intente nuevamente."}</p><button className="button secondary" onClick={() => { setAccess("checking"); setAccessError(null); setValidationAttempt(value => value + 1); }}>Reintentar</button></div></main>;
  if (deletedUpload) return <main className="capture-shell"><div className="capture-status error"><h1>La carga anterior fue eliminada</h1><p>Para respetar esa eliminación, este intento no se volverá a crear automáticamente.</p><button className="button secondary" onClick={restartAfterDeletedUpload}>Iniciar un escaneo nuevo</button></div></main>;
  if (done) return <main className="capture-shell"><div className="capture-success"><span><Check size={32} /></span><h1>Documento guardado</h1><p>{pages.length} {pages.length === 1 ? "página quedó disponible" : "páginas quedaron disponibles"} en la biblioteca.</p>{remainingFiles > 0 ? <button className="button secondary" onClick={() => { pages.forEach(page => { URL.revokeObjectURL(page.url); URL.revokeObjectURL(page.sourceUrl); }); sentPagesRef.current = 0; setSentPageCount(0); setDocumentUploadId(crypto.randomUUID()); setUploadLocked(false); setPages([]); setDone(false); }}>Escanear otro</button> : <p>La sesión alcanzó su límite. Genere un QR nuevo desde el escritorio para continuar.</p>}</div></main>;
  if (remainingFiles === 0) return <main className="capture-shell"><div className="capture-status"><h1>Sesión completa</h1><p>Este QR ya recibió {MOBILE_CAPTURE_MAX_FILES} archivos. Genere uno nuevo desde el escritorio para continuar.</p></div></main>;

  return <main className="capture-shell"><header className="capture-header"><img src="/hhr-logo.svg" alt="Hospital Hanga Roa" /><div><strong>Escáner HHR</strong><small>Sesión temporal · {expiresAt && `hasta ${new Date(expiresAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`}</small></div><span className="capture-page-count">{pages.length}/{pageLimit}</span></header>
    <section className="capture-content"><div className="capture-intro"><span className="eyebrow">Documento multipágina</span><h1>Escanee con la cámara</h1><p>Capture, ajuste los bordes y elija el estilo de cada página.</p></div>
      <input ref={cameraInputRef} type="file" hidden accept="image/*" capture="environment" onChange={event => { void addFileList(event.target.files); event.target.value = ""; }} />
      <input ref={galleryInputRef} type="file" hidden accept="image/*" multiple onChange={event => { void addFileList(event.target.files); event.target.value = ""; }} />
      <div className="capture-primary-actions"><button className="scan-start" disabled={pages.length >= pageLimit || processing || controlsLocked} onClick={() => void startCamera()}><Camera size={24} /><span><strong>{pages.length ? "Escanear otra página" : "Abrir cámara"}</strong><small>Captura en alta resolución</small></span></button><button className="gallery-start" disabled={pages.length >= pageLimit || processing || controlsLocked} onClick={() => galleryInputRef.current?.click()}><FileImage size={20} /><span>{processing ? "Procesando…" : "Elegir imágenes"}</span></button></div>
      {error ? <p className="form-error capture-error">{error}</p> : null}
      {pages.length ? <div className="mobile-pages"><div className="mobile-pages-title"><strong>{pages.length} {pages.length === 1 ? "página" : "páginas"}</strong><span>Orden de salida</span></div>{pages.map((page, index) => { const pageLocked = controlsLocked || index < sentPageCount; return <article key={page.id}><button className="page-thumb" disabled={pageLocked} onClick={() => editPage(page)} aria-label={`Editar página ${index + 1}`}><img src={page.url} alt={`Página ${index + 1}`} style={{ transform: `rotate(${page.rotation}deg)` }} /><span>{index + 1}</span></button><div><strong>Página {index + 1} · {SCAN_FILTER_OPTIONS.find(item => item.id === page.filter)?.label}</strong><small className={`quality-${page.quality.level}`}>{page.quality.label} · {page.quality.detail}</small><div><button onClick={() => move(index, -1)} disabled={pageLocked || index === sentPageCount} aria-label="Mover arriba"><ArrowUp size={16} /></button><button onClick={() => move(index, 1)} disabled={pageLocked || index === pages.length - 1} aria-label="Mover abajo"><ArrowDown size={16} /></button><button disabled={pageLocked} onClick={() => editPage(page)} aria-label="Editar bordes y estilo"><Pencil size={16} /></button><button disabled={pageLocked} onClick={() => update(page.id, { rotation: (page.rotation + 90) % 360 })} aria-label="Rotar"><RotateCw size={16} /></button><button className="danger" disabled={pageLocked} onClick={() => remove(page.id)} aria-label="Quitar"><Trash2 size={16} /></button></div></div></article>; })}</div> : null}
      {pages.length ? <div className="scan-finish"><label>Nombre<input value={name} maxLength={80} disabled={controlsLocked || sentPrefixLocked} onChange={event => setName(event.target.value)} /></label><div className="format-switch"><button className={output === "pdf" ? "active" : ""} disabled={controlsLocked || sentPrefixLocked} onClick={() => { sentPagesRef.current = 0; setSentPageCount(0); setOutput("pdf"); }}>PDF único</button><button className={output === "images" ? "active" : ""} disabled={controlsLocked || sentPrefixLocked} onClick={() => { sentPagesRef.current = 0; setSentPageCount(0); setOutput("images"); }}>Imágenes</button></div>{output === "images" && unsentPageCount > remainingFiles ? <p className="form-error">Esta sesión permite guardar {remainingFiles} {remainingFiles === 1 ? "imagen más" : "imágenes más"}.</p> : null}<button className="button primary full capture-submit" disabled={busy || processing || detecting || Boolean(review) || !name.trim() || (output === "images" && unsentPageCount > remainingFiles)} onClick={() => void upload()}>{busy ? <Loader2 size={18} className="spin" /> : <UploadCloud size={18} />}{busy ? "Guardando…" : "Guardar en HHR-documentos"}</button></div> : null}
    </section>
    {cameraOpen ? <div className="camera-stage"><video ref={videoRef} autoPlay muted playsInline /><div className={flash ? "camera-flash visible" : "camera-flash"} /><header><button onClick={stopCamera} aria-label="Cerrar cámara"><X size={23} /></button><span>{pages.length ? `${pages.length} capturadas` : "Encuadre el documento"}</span>{torchAvailable ? <button className={torchOn ? "active" : ""} onClick={() => void toggleTorch()} aria-label="Luz">{torchOn ? "Luz on" : "Luz"}</button> : <i />}</header><div className="document-guide"><i /><i /><i /><i /><span>{cameraReady ? "Mantenga el teléfono paralelo al papel" : "Iniciando cámara…"}</span></div><footer>{pages.length ? <img src={pages[pages.length - 1].url} alt="Última página" /> : <i />}<button className="camera-shutter" disabled={!cameraReady || controlsLocked || pages.length >= pageLimit} onClick={() => void capturePage()} aria-label="Capturar página"><span /></button><button className="camera-done" onClick={stopCamera}>{pages.length ? "Listo" : "Cancelar"}</button></footer></div> : null}
    {review && reviewPage ? <ScanReviewEditor page={reviewPage} review={review} processing={processing} detecting={detecting} onChange={change => setReview(value => value ? { ...value, ...change } : value)} onApply={() => void applyReview()} onRedetect={() => void redetectPage()} onClose={() => setReview(null)} /> : null}
  </main>;
}

async function captureVideoFrame(video: HTMLVideoElement, pageNumber: number) {
  const scale = Math.min(1, 3600 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo capturar la imagen.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvasFile(canvas, `captura-${pageNumber}.jpg`);
}
