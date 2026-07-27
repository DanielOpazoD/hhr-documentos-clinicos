import { safeFileName } from "@/app/lib/server/security";
import type { AiSourceInput } from "../types";
import { validateSourceBatch } from "./source-policy";

export function importSources(form: FormData): AiSourceInput[] {
  const multiFiles = form.getAll("files").filter((value): value is File => value instanceof File);
  const legacyFile = form.get("file");
  const files = multiFiles.length
    ? multiFiles
    : legacyFile instanceof File ? [legacyFile] : [];

  const mimeTypes = validateSourceBatch(files);

  const usedNames = new Map<string, number>();
  return files.map((file, index) => {
    const baseName = safeFileName(file.name);
    const occurrence = (usedNames.get(baseName) ?? 0) + 1;
    usedNames.set(baseName, occurrence);
    const sourceName = occurrence === 1
      ? baseName
      : baseName.replace(/(\.[^.]+)?$/, ` (${occurrence})$1`);
    return {
      file,
      sourceName,
      mimeType: mimeTypes[index],
    };
  });
}
