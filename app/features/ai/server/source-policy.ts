export const MAX_SOURCE_FILE_SIZE = 15 * 1024 * 1024;
export const MAX_SOURCE_BATCH_SIZE = 15 * 1024 * 1024;
export const MAX_SOURCE_FILES = 8;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "jpg", "jpeg", "png"]);

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
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return `image/${extension === "jpg" ? "jpeg" : extension}`;
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
      throw new Error("Formato no permitido. Use PDF, DOCX, JPG o PNG.");
    }
    return resolvedMimeType(file, extension);
  });
}
