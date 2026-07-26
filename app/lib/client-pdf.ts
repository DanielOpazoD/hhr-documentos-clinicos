"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { clampSignatureY } from "./document-layout";

type PdfSection = { title: string; body: string };
type PdfSignature = { imageUrl: string; professionalName: string; professionalRut: string; specialty: string; x: number; y: number; width: number };

export async function downloadClinicalPdf(options: { fileName: string; title: string; subtitle?: string | string[]; sections: PdfSection[]; date?: string; footer?: string; signature?: PdfSignature }) {
  const { jsPDF } = await loadJsPdf();
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const left = 64;
  const width = 484;
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
    if (y > 690) { pdf.addPage(); y = 72; }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(17, 52, 65);
    pdf.text(section.title.toUpperCase(), left, y);
    y += 18;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10.5);
    pdf.setTextColor(31, 41, 45);
    const lines = pdf.splitTextToSize(section.body || "—", width);
    pdf.text(lines, left, y, { lineHeightFactor: 1.45 });
    y += lines.length * 15 + 22;
  }
  if (options.signature) {
    const signatureImage = await imageData(options.signature.imageUrl);
    const signatureWidth = Math.max(90, Math.min(210, 612 * options.signature.width / 100));
    const signatureHeight = Math.min(74, signatureWidth / signatureImage.ratio);
    const signatureX = Math.max(24, Math.min(612 - signatureWidth - 24, 612 * options.signature.x / 100 - signatureWidth / 2));
    const signatureY = pdf.internal.pageSize.getHeight() * clampSignatureY(options.signature.y) / 100;
    pdf.addImage(signatureImage.dataUrl, signatureImage.format, signatureX, signatureY, signatureWidth, signatureHeight, undefined, "FAST");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(31, 41, 45);
    pdf.text(options.signature.professionalName, signatureX + signatureWidth / 2, signatureY + signatureHeight + 11, { align: "center" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    const detail = [options.signature.specialty, options.signature.professionalRut ? `RUT: ${options.signature.professionalRut}` : ""].filter(Boolean).join(" · ");
    if (detail) pdf.text(detail, signatureX + signatureWidth / 2, signatureY + signatureHeight + 22, { align: "center" });
  }
  pdf.setDrawColor(207, 216, 218);
  pdf.line(left, 700, left + width, 700);
  pdf.setFontSize(8.5);
  pdf.setTextColor(90, 102, 108);
  pdf.text(options.footer ?? "Hospital Hanga Roa", 306, 722, { align: "center" });
  if (options.date) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(31, 41, 45);
    pdf.text(`Fecha: ${options.date}`, left + width, 746, { align: "right" });
  }
  pdf.save(options.fileName);
}

async function imageData(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo incluir la firma en el PDF.");
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer la firma."));
    reader.readAsDataURL(blob);
  });
  const ratio = await new Promise<number>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(Math.max(.5, image.naturalWidth / Math.max(1, image.naturalHeight)));
    image.onerror = () => reject(new Error("La imagen de firma no es válida."));
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
