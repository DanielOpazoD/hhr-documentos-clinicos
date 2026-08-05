"use client";

/* eslint-disable @next/next/no-img-element -- The editor must show the exact local source pixels. */

import { Check, Loader2, RefreshCw, X } from "@/app/components/Icons";
import { useDialogFocus } from "@/app/lib/client/use-dialog-focus";
import {
  DEFAULT_SCAN_CORNERS,
  scanAdjustmentsForFilter,
  type ScanAdjustments,
  type ScanCorners,
  type ScanFilter,
} from "@/app/lib/scan-processing";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

export type ScanReviewPage = {
  sourceUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  edgeConfidence: number;
};

export type ScanReviewState = {
  pageId: string;
  corners: ScanCorners;
  filter: ScanFilter;
  adjustments: ScanAdjustments;
};

export const SCAN_FILTER_OPTIONS: Array<{ id: ScanFilter; label: string; description: string }> = [
  { id: "auto", label: "Documento", description: "Papel blanco y texto nítido" },
  { id: "color", label: "Original", description: "Conserva color y detalle de la foto" },
  { id: "gray", label: "Grises", description: "Documento sobrio y legible" },
  { id: "bw", label: "Blanco y negro", description: "Texto limpio sin perder trazos" },
];

export const cloneScanCorners = (corners: ScanCorners) => corners.map(point => ({ ...point })) as ScanCorners;

const CORNER_STEP = {
  ArrowLeft: [-.01, 0],
  ArrowRight: [.01, 0],
  ArrowUp: [0, -.01],
  ArrowDown: [0, .01],
} as const;

function constrainCorner(corners: ScanCorners, index: number, requestedX: number, requestedY: number) {
  let x = Math.min(.995, Math.max(.005, requestedX));
  let y = Math.min(.995, Math.max(.005, requestedY));
  const next = cloneScanCorners(corners);
  x = index > 0 && index < 3 ? Math.max(x, next[index ^ 1].x + .03) : Math.min(x, next[index ^ 1].x - .03);
  y = index < 2 ? Math.min(y, next[3 - index].y - .03) : Math.max(y, next[3 - index].y + .03);
  next[index] = { x, y };
  return next;
}

function previewFilter(filter: ScanFilter, adjustments: ScanAdjustments) {
  const brightness = .5 + (adjustments.brightness ?? 50) / 100 + adjustments.whiten / 500;
  const contrast = .5 + adjustments.contrast / 100;
  const saturation = (adjustments.saturation ?? 50) / 50;
  if (filter === "gray") return `grayscale(1) brightness(${brightness}) contrast(${contrast})`;
  if (filter === "bw") return `grayscale(1) brightness(${brightness}) contrast(${Math.max(1.2, contrast + .18)})`;
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
}

export function ScanReviewEditor({ page, review, processing, detecting, onChange, onApply, onRedetect, onClose }: {
  page: ScanReviewPage;
  review: ScanReviewState;
  processing: boolean;
  detecting: boolean;
  onChange: (change: Partial<ScanReviewState>) => void;
  onApply: () => void;
  onRedetect: () => void;
  onClose: () => void;
}) {
  const [dialogRef, onDialogKeyDown] = useDialogFocus<HTMLDivElement>(onClose);

  function moveCorner(index: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const frame = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!frame) return;
    onChange({ corners: constrainCorner(
      review.corners,
      index,
      (event.clientX - frame.left) / frame.width,
      (event.clientY - frame.top) / frame.height,
    ) });
  }

  function moveCornerWithKeyboard(index: number, event: ReactKeyboardEvent<HTMLButtonElement>) {
    const step = CORNER_STEP[event.key as keyof typeof CORNER_STEP];
    if (!step) return;
    event.preventDefault();
    const point = review.corners[index];
    onChange({ corners: constrainCorner(review.corners, index, point.x + step[0], point.y + step[1]) });
  }

  const points = review.corners.map(point => `${point.x * 100},${point.y * 100}`).join(" ");
  const ratio = page.sourceWidth / page.sourceHeight;
  return <div ref={dialogRef} className="scan-review" role="dialog" aria-modal="true" aria-label="Ajustar escaneo" tabIndex={-1} onKeyDown={onDialogKeyDown}><header><button onClick={onClose} aria-label="Cerrar"><X size={22} /></button><div><strong>Ajustar escaneo</strong><small>Arrastre o use flechas</small></div><i /></header>
    <section className="scan-review-workspace"><div className="scan-source-frame" style={{ aspectRatio: `${page.sourceWidth} / ${page.sourceHeight}`, width: `min(100%, calc(62vh * ${ratio}))` }}><img src={page.sourceUrl} alt="Original para ajustar bordes" style={{ filter: previewFilter(review.filter, review.adjustments) }} /><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={points} /></svg>{review.corners.map((point, index) => <button key={index} className="corner-handle" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-label={`Esquina ${index + 1}`} onKeyDown={event => moveCornerWithKeyboard(index, event)} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }} onPointerMove={event => moveCorner(index, event)}><span /></button>)}</div><div className="scan-edge-tools"><span>{page.edgeConfidence ? "Bordes sugeridos: confirme las esquinas" : "Encuadre completo: ajuste solo si es necesario"}</span><button disabled={detecting} onClick={onRedetect}><RefreshCw size={13} className={detecting ? "spin" : ""} /> {detecting ? "Detectando…" : "Detectar de nuevo"}</button></div></section>
    <section className="scan-filter-panel"><strong>Acabado</strong><div>{SCAN_FILTER_OPTIONS.map(option => <button key={option.id} className={review.filter === option.id ? "active" : ""} onClick={() => onChange({ filter: option.id, adjustments: scanAdjustmentsForFilter(option.id) })}><span className={`filter-swatch ${option.id}`} /><span><strong>{option.label}</strong><small>{option.description}</small></span>{review.filter === option.id ? <Check size={15} /> : null}</button>)}</div><details className="scan-adjustments"><summary>Ajustes manuales</summary><header><small>Personalice el acabado seleccionado · salida HD automática</small><button onClick={() => onChange({ adjustments: scanAdjustmentsForFilter(review.filter) })}>Restablecer</button></header><div><label><span>Brillo <b>{review.adjustments.brightness ?? 50}%</b></span><input type="range" min="0" max="100" value={review.adjustments.brightness ?? 50} onChange={event => onChange({ adjustments: { ...review.adjustments, brightness: Number(event.target.value) } })} /></label><label><span>Contraste <b>{review.adjustments.contrast}%</b></span><input type="range" min="0" max="100" value={review.adjustments.contrast} onChange={event => onChange({ adjustments: { ...review.adjustments, contrast: Number(event.target.value) } })} /></label><label><span>Saturación <b>{review.adjustments.saturation ?? 50}%</b></span><input type="range" min="0" max="100" value={review.adjustments.saturation ?? 50} disabled={review.filter === "gray" || review.filter === "bw"} onChange={event => onChange({ adjustments: { ...review.adjustments, saturation: Number(event.target.value) } })} /></label><label><span>Nitidez <b>{review.adjustments.sharpness ?? 0}%</b></span><input type="range" min="0" max="100" value={review.adjustments.sharpness ?? 0} onChange={event => onChange({ adjustments: { ...review.adjustments, sharpness: Number(event.target.value) } })} /></label><label><span>Fondo blanco <b>{review.adjustments.whiten}%</b></span><input type="range" min="0" max="100" value={review.adjustments.whiten} disabled={review.filter === "bw"} onChange={event => onChange({ adjustments: { ...review.adjustments, whiten: Number(event.target.value) } })} /></label></div></details></section>
    <footer><button className="button secondary" onClick={() => onChange({ corners: cloneScanCorners(DEFAULT_SCAN_CORNERS) })}>Usar hoja completa</button><button className="button primary" disabled={processing || detecting} onClick={onApply}>{processing ? <Loader2 size={17} className="spin" /> : <Check size={17} />}{processing ? "Procesando…" : "Aplicar escaneo"}</button></footer>
  </div>;
}
