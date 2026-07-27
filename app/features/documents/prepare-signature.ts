import { enhanceScan } from "@/app/features/scanner/scan-enhancement";
import type { ScanAdjustments, ScanFilter } from "@/app/lib/scan-processing";

const MAX_SIGNATURE_DIMENSION = 1200;
const JPEG_QUALITY = 0.92;

export type SignatureImageSettings = ScanAdjustments & {
  filter: ScanFilter;
  brightness: number;
  saturation: number;
};

export const DEFAULT_SIGNATURE_IMAGE_SETTINGS: SignatureImageSettings = {
  filter: "auto",
  whiten: 88,
  contrast: 68,
  brightness: 8,
  saturation: 35,
};

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function decodeImage(file: File): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch { /* Safari puede abrir formatos de cámara que createImageBitmap no admite. */ }

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
      reject(new Error("La foto no pudo abrirse. Use JPG, PNG o tome una foto nueva."));
    };
    image.src = url;
  });
}

export async function renderSignatureImage(
  file: File,
  settings: SignatureImageSettings,
  maxDimension = MAX_SIGNATURE_DIMENSION,
): Promise<HTMLCanvasElement> {
  const image = await decodeImage(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const source = document.createElement("canvas");
    source.width = Math.max(1, Math.round(image.width * scale));
    source.height = Math.max(1, Math.round(image.height * scale));
    const context = source.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("No se pudo preparar la firma.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, source.width, source.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = `brightness(${1 + settings.brightness / 100}) saturate(${Math.max(0, settings.saturation) / 100})`;
    context.drawImage(image.source, 0, 0, source.width, source.height);
    context.filter = "none";
    return enhanceScan(source, settings.filter, {
      whiten: settings.whiten,
      contrast: settings.contrast,
    });
  } finally {
    image.release();
  }
}

export async function prepareSignatureUpload(file: File, settings: SignatureImageSettings): Promise<File> {
  const canvas = await renderSignatureImage(file, settings);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("No se pudo preparar la firma.")),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
  return new File([blob], "firma.jpg", { type: "image/jpeg" });
}
