import { unzipSync } from "fflate";

export const MAX_SOURCE_FILE_SIZE = 15 * 1024 * 1024;
export const MAX_SOURCE_BATCH_SIZE = 15 * 1024 * 1024;
export const MAX_SOURCE_FILES = 8;

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_DOCX_REQUIRED_PART_BYTES = 4 * 1024 * 1024;
const MAX_DOCX_COMPRESSION_RATIO = 200;
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/json",
  DOCX_MIME_TYPE,
  "image/jpeg",
  "image/png",
]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "json", "jpg", "jpeg", "png"]);

export type SourceDescriptor = {
  name: string;
  size: number;
  type: string;
};

function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function resolvedMimeType(file: SourceDescriptor, extension: string): string {
  if (ALLOWED_MIME_TYPES.has(file.type)) return file.type;
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") return DOCX_MIME_TYPE;
  if (extension === "json") return "application/json";
  return `image/${extension === "jpg" ? "jpeg" : extension}`;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function validateDocx(bytes: Uint8Array): boolean {
  const requiredParts = new Set(["[Content_Types].xml", "word/document.xml"]);
  try {
    const parts = unzipSync(bytes, {
      filter(entry) {
        if (!requiredParts.has(entry.name)) return false;
        const compressedSize = Math.max(entry.size, 1);
        if (
          entry.originalSize > MAX_DOCX_REQUIRED_PART_BYTES ||
          entry.originalSize / compressedSize > MAX_DOCX_COMPRESSION_RATIO
        ) {
          throw new Error("DOCX unsafe to decompress");
        }
        return true;
      },
    });
    return [...requiredParts].every((part) => Boolean(parts[part]?.length));
  } catch {
    return false;
  }
}

export function readJsonSource(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    JSON.parse(text);
  } catch {
    throw new Error("El archivo JSON no contiene datos válidos en UTF-8.");
  }
  return text;
}

function validateJson(bytes: Uint8Array): boolean {
  try {
    readJsonSource(bytes);
    return true;
  } catch {
    return false;
  }
}

export async function validateSourceContents(files: readonly File[], mimeTypes: readonly string[]): Promise<void> {
  for (const [index, file] of files.entries()) {
    const mimeType = mimeTypes[index];
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valid = mimeType === "application/pdf"
      ? startsWith(bytes, PDF_SIGNATURE)
      : mimeType === "application/json"
        ? validateJson(bytes)
        : mimeType === "image/png"
          ? startsWith(bytes, PNG_SIGNATURE)
          : mimeType === "image/jpeg"
            ? startsWith(bytes, JPEG_SIGNATURE)
            : mimeType === DOCX_MIME_TYPE && validateDocx(bytes);
    if (!valid) {
      throw new Error(`El contenido de ${file.name} no coincide con su formato.`);
    }
  }
}

export function validateSourceBatch(files: readonly SourceDescriptor[]): string[] {
  if (!files.length) throw new Error("Seleccione al menos un archivo.");
  if (files.length > MAX_SOURCE_FILES) throw new Error(`Puede analizar hasta ${MAX_SOURCE_FILES} archivos por vez.`);
  if (files.some((file) => !file.size)) throw new Error("Uno de los archivos está vacío.");
  if (files.some((file) => file.size > MAX_SOURCE_FILE_SIZE)) throw new Error("Cada archivo puede pesar hasta 15 MB.");
  if (files.reduce((total, file) => total + file.size, 0) > MAX_SOURCE_BATCH_SIZE) {
    throw new Error("El conjunto de archivos supera 15 MB.");
  }

  return files.map((file) => {
    const extension = fileExtension(file.name);
    if (!ALLOWED_MIME_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.has(extension)) {
      throw new Error("Formato no permitido. Use PDF, DOCX, JSON, JPG o PNG.");
    }
    return resolvedMimeType(file, extension);
  });
}
