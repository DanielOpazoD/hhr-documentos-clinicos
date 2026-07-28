"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { SIGNATURE_Y_MAX_PERCENT, SIGNATURE_Y_MIN_PERCENT } from "./document-layout";

type PdfSection = { title?: string; body: string };
type PdfSignature = { imageUrl: string; professionalName: string; professionalRut: string; specialty: string; x: number; y: number; width: number };
type PdfSigner = { name: string; rut: string; specialty: string };

export async function downloadClinicalPdf(options: { fileName: string; title: string; subtitle?: string | string[]; sections: PdfSection[]; date?: string; footer?: string; signatureAssets?: PdfSignature[]; signer?: PdfSigner; fontSize?: number }) {
  const { jsPDF } = await loadJsPdf();
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const left = 64;
  const width = 484;
  const bodyFontSize = Math.max(11, Math.min(16, options.fontSize ?? 13));
  const bodyLineHeight = bodyFontSize * 1.45;
  let y = 72;
  pdf.setTextColor(17, 52, 65);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text(options.title.toUpperCase(), 306, y, { align: "center" });
  if (options.subtitle) {
    const subtitleLines = Array.isArray(options.subtitle) ? options.subtitle : [options.subtitle];
    y += 20;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(82, 103, 112);
    pdf.text(subtitleLines, 306, y, { align: "center", lineHeightFactor: 1.35 });
    y += (subtitleLines.length - 1) * 12;
  }
  y += 28;
  pdf.setDrawColor(207, 216, 218);
  pdf.line(left, y, left + width, y);
  y += 28;
  for (const section of options.sections) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(bodyFontSize);
    const lines = pdf.splitTextToSize(section.body || "—", width);
    const headingHeight = section.title ? 18 : 0;
    if (y + headingHeight + bodyLineHeight > 680) { pdf.addPage(); y = 72; }
    if (section.title) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(Math.max(10, bodyFontSize - 1));
      pdf.setTextColor(17, 52, 65);
      pdf.text(section.title.toUpperCase(), left, y);
      y += 18;
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(bodyFontSize);
    pdf.setTextColor(31, 41, 45);
    let lineIndex = 0;
    while (lineIndex < lines.length) {
      const availableLines = Math.max(1, Math.floor((680 - y) / bodyLineHeight));
      const pageLines = lines.slice(lineIndex, lineIndex + availableLines);
      pdf.text(pageLines, left, y, { lineHeightFactor: 1.45 });
      y += pageLines.length * bodyLineHeight;
      lineIndex += pageLines.length;
      if (lineIndex < lines.length) { pdf.addPage(); y = 72; }
    }
    y += 22;
  }
  const signatureAssets = options.signatureAssets ?? [];
  if (signatureAssets.length || options.signer?.name || options.date) {
    const signatureBlockHeight = 280;
    if (y + signatureBlockHeight > 680) { pdf.addPage(); y = 82; }
    const images = await Promise.all(signatureAssets.map(async (asset) => ({ asset, image: await imageData(asset.imageUrl) })));
    for (const { asset, image } of images) {
      const imageWidth = Math.max(58, Math.min(width * .72, width * asset.width / 100));
      const imageHeight = Math.min(140, imageWidth / image.ratio);
      const imageX = Math.max(left, Math.min(left + width - imageWidth, left + width * asset.x / 100 - imageWidth / 2));
      const clampedY = Math.min(SIGNATURE_Y_MAX_PERCENT, Math.max(SIGNATURE_Y_MIN_PERCENT, asset.y));
      const assetCanvasHeight = 212;
      const imageCenterY = y + assetCanvasHeight * clampedY / 100;
      const imageY = Math.max(y, Math.min(y + assetCanvasHeight - imageHeight, imageCenterY - imageHeight / 2));
      pdf.addImage(image.dataUrl, image.format, imageX, imageY, imageWidth, imageHeight, undefined, "FAST");
    }
    const signerX = left + width - 105;
    const signerY = y + 230;
    if (options.signer?.name) {
      pdf.setDrawColor(70, 78, 80);
      pdf.line(signerX - 105, signerY - 10, signerX + 105, signerY - 10);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(31, 41, 45);
      pdf.text(options.signer.name, signerX, signerY, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      const detail = [options.signer.specialty, options.signer.rut ? `RUT: ${options.signer.rut}` : ""].filter(Boolean).join(" · ");
      if (detail) pdf.text(detail, signerX, signerY + 11, { align: "center" });
    }
    if (options.date) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(82, 92, 96);
      pdf.text(`Fecha: ${options.date}`, left + width, signerY + 30, { align: "right" });
    }
    y += signatureBlockHeight;
  }
  pdf.setDrawColor(207, 216, 218);
  pdf.line(left, 700, left + width, 700);
  pdf.setFontSize(8.5);
  pdf.setTextColor(90, 102, 108);
  pdf.text(options.footer ?? "Hospital Hanga Roa", 306, 722, { align: "center" });
  pdf.save(options.fileName);
}

async function imageData(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo incluir una imagen de firma en el PDF.");
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer una imagen de firma."));
    reader.readAsDataURL(blob);
  });
  const ratio = await new Promise<number>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(Math.max(.5, image.naturalWidth / Math.max(1, image.naturalHeight)));
    image.onerror = () => reject(new Error("Una imagen de firma no es válida."));
    image.src = dataUrl;
  });
  return { dataUrl, ratio, format: blob.type === "image/png" ? "PNG" : "JPEG" };
}

let jsPdfPromise: Promise<{ jsPDF: any }> | null = null;

function loadJsPdf() {
  if (typeof window === "undefined") throw new Error("La exportación PDF solo está disponible en el navegador.");
  const current = (window as any).jspdf;
  if (current?.jsPDF) return Promise.resolve(current);
  if (jsPdfPromise) return jsPdfPromise;
  jsPdfPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/jspdf.umd.min.js";
    script.async = true;
    script.onload = () => {
      const loaded = (window as any).jspdf;
      if (loaded?.jsPDF) resolve(loaded);
      else reject(new Error("No se pudo iniciar el generador PDF."));
    };
    script.onerror = () => reject(new Error("No se pudo cargar el generador PDF."));
    document.head.appendChild(script);
  });
  return jsPdfPromise;
}

function readImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`No se pudo convertir ${file.name}. Use JPG o PNG para crear un PDF.`)); };
    image.src = url;
  });
}

async function normalizedImage(file: File, rotation: number) {
  const image = await readImage(file);
  const turns = ((rotation % 360) + 360) % 360;
  const swapsSides = turns === 90 || turns === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swapsSides ? image.naturalHeight : image.naturalWidth;
  canvas.height = swapsSides ? image.naturalWidth : image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar la imagen.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(turns * Math.PI / 180);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.95), width: canvas.width, height: canvas.height };
}

export async function createScannedPdf(pages: Array<{ file: File; rotation: number }>) {
  if (!pages.length) throw new Error("Agregue al menos una página.");
  const { jsPDF } = await loadJsPdf();
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  for (let index = 0; index < pages.length; index++) {
    const image = await normalizedImage(pages[index].file, pages[index].rotation);
    const landscape = image.width > image.height;
    if (index > 0) pdf.addPage("a4", landscape ? "landscape" : "portrait");
    else if (landscape) { pdf.deletePage(1); pdf.addPage("a4", "landscape"); }
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    pdf.addImage(image.dataUrl, "JPEG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "SLOW");
  }
  return pdf.output("blob") as Blob;
}

export const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
