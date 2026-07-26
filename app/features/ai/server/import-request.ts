import { safeFileName } from "@/app/lib/server/security";
import type { AiSourceInput } from "../types";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_BATCH_SIZE = 15 * 1024 * 1024;
const MAX_FILES = 8;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "jpg", "jpeg", "png"]);

function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function resolveMimeType(file: File, extension: string): string {
  if (ALLOWED_MIME_TYPES.has(file.type)) return file.type;
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return `image/${extension === "jpg" ? "jpeg" : extension}`;
}

export function importSources(form: FormData): AiSourceInput[] {
  const multiFiles = form.getAll("files").filter((value): value is File => value instanceof File);
  const legacyFile = form.get("file");
  const files = multiFiles.length
    ? multiFiles
    : legacyFile instanceof File ? [legacyFile] : [];

  if (!files.length) throw new Error("Seleccione al menos un archivo.");
  if (files.length > MAX_FILES) throw new Error(`Puede analizar hasta ${MAX_FILES} archivos por vez.`);
  if (files.some((file) => !file.size)) throw new Error("Uno de los archivos está vacío.");
  if (files.some((file) => file.size > MAX_FILE_SIZE)) throw new Error("Cada archivo puede pesar hasta 15 MB.");
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_SIZE) {
    throw new Error("El conjunto de archivos supera 15 MB.");
  }

  const usedNames = new Map<string, number>();
  return files.map((file) => {
    const extension = fileExtension(file.name);
    if (!ALLOWED_MIME_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.has(extension)) {
      throw new Error("Formato no permitido. Use PDF, DOCX, JPG o PNG.");
    }
    const baseName = safeFileName(file.name);
    const occurrence = (usedNames.get(baseName) ?? 0) + 1;
    usedNames.set(baseName, occurrence);
    const sourceName = occurrence === 1
      ? baseName
      : baseName.replace(/(\.[^.]+)?$/, ` (${occurrence})$1`);
    return {
      file,
      sourceName,
      mimeType: resolveMimeType(file, extension),
    };
  });
}
