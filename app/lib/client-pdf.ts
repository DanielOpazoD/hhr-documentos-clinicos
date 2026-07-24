"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

type PdfSection = { title: string; body: string };

export async function downloadClinicalPdf(options: { fileName: string; title: string; subtitle?: string; sections: PdfSection[]; footer?: string }) {
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
    y += 23;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(82, 103, 112);
    pdf.text(options.subtitle, 306, y, { align: "center" });
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
  pdf.setDrawColor(207, 216, 218);
  pdf.line(left, 700, left + width, 700);
  pdf.setFontSize(8.5);
  pdf.setTextColor(90, 102, 108);
  pdf.text(options.footer ?? "Prototipo de evaluación · Documento no válido para uso clínico", 306, 722, { align: "center" });
  pdf.save(options.fileName);
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
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.9), width: canvas.width, height: canvas.height };
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
    const margin = 22;
    const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    pdf.addImage(image.dataUrl, "JPEG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "FAST");
  }
  return pdf.output("blob") as Blob;
}

export const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
