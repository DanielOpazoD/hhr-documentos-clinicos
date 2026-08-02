"use client";

import { jpegExifOrientation } from "@/app/lib/image-orientation";
import { loadJsPdf } from "@/app/lib/client/js-pdf";

type PdfImageSource = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function readImage(file: File): Promise<PdfImageSource> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch { /* Safari fallback below. */ }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`No se pudo convertir ${file.name}. Use JPG o PNG para crear un PDF.`));
    };
    image.src = url;
  });
}

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function normalizedImage(file: File, rotation: number) {
  const image = await readImage(file);
  try {
    const turns = ((rotation % 360) + 360) % 360;
    const sourceFormat = file.type === "image/png" ? "PNG" : file.type === "image/jpeg" ? "JPEG" : null;
    const longestEdge = Math.max(image.width, image.height);
    const printScale = longestEdge < 2400 ? Math.min(3, 2400 / longestEdge) : 1;
    const orientation = await jpegExifOrientation(file);
    if (turns === 0 && sourceFormat && printScale === 1 && orientation === 1) {
      return { dataUrl: await fileDataUrl(file), width: image.width, height: image.height, format: sourceFormat };
    }
    const swapsSides = turns === 90 || turns === 270;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((swapsSides ? image.height : image.width) * printScale);
    canvas.height = Math.round((swapsSides ? image.width : image.height) * printScale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la imagen.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(turns * Math.PI / 180);
    context.drawImage(
      image.source,
      -image.width * printScale / 2,
      -image.height * printScale / 2,
      image.width * printScale,
      image.height * printScale,
    );
    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.995),
      width: canvas.width,
      height: canvas.height,
      format: "JPEG",
    };
  } finally {
    image.release();
  }
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
    const scale = Math.min(
      (pageWidth - margin * 2) / image.width,
      (pageHeight - margin * 2) / image.height,
    );
    const width = image.width * scale;
    const height = image.height * scale;
    pdf.addImage(
      image.dataUrl,
      image.format,
      (pageWidth - width) / 2,
      (pageHeight - height) / 2,
      width,
      height,
      undefined,
      image.format === "PNG" ? "FAST" : "NONE",
    );
  }
  return pdf.output("blob") as Blob;
}
