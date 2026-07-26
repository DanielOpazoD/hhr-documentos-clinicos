import { strFromU8, Unzip, UnzipInflate } from "fflate";
import { getResolvedPDFJS } from "unpdf";

const MAX_SOURCE_CHARACTERS = 48_000;
const MAX_PDF_PAGES = 80;
const MAX_PDF_EXTRACTION_MS = 12_000;
const MAX_PDF_TEXT_ITEMS = 24_000;
const MAX_DOCX_XML_BYTES = 4 * 1024 * 1024;
const MAX_DOCX_COMPRESSION_RATIO = 200;
const MAX_IMAGE_DIMENSION = 10_000;
const MAX_IMAGE_PIXELS = 25_000_000;
const DOCX_PART = /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/;
const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

function decodeXmlText(value: string): string {
  return value
    .replace(/<w:tab\s*\/?>/g, "\t")
    .replace(/<w:br\s*\/?>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function enforceContextLimit(text: string): string {
  if (text.length <= MAX_SOURCE_CHARACTERS) return text;
  throw new Error("El documento es demasiado extenso para Gemma local. Use OpenAI o divídalo en archivos más pequeños.");
}

function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string,
  onTimeout?: () => void | Promise<void>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (onTimeout) void Promise.resolve(onTimeout()).catch(() => undefined);
      reject(new Error(message));
    }, milliseconds);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function extractPdf(file: File): Promise<string> {
  const startedAt = Date.now();
  const pdfjs = await getResolvedPDFJS();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useSystemFonts: true,
  });
  try {
    const pdf = await withTimeout(
      loadingTask.promise,
      4_000,
      "El PDF tardó demasiado en abrirse.",
    );
    try {
      if (pdf.numPages > MAX_PDF_PAGES) {
        throw new Error(`Gemma local admite hasta ${MAX_PDF_PAGES} páginas por archivo.`);
      }
      const pages: string[] = [];
      const pagesWithoutText: number[] = [];
      let totalCharacters = 0;
      let totalItems = 0;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (Date.now() - startedAt > MAX_PDF_EXTRACTION_MS) {
          throw new Error("El PDF tardó demasiado en extraerse. Use OpenAI o divida el archivo.");
        }
        const page = await withTimeout(
          pdf.getPage(pageNumber),
          1_500,
          "No se pudo leer una página del PDF.",
        );
        const reader = page.streamTextContent().getReader();
        try {
          const fragments: string[] = [];
          while (true) {
            if (Date.now() - startedAt > MAX_PDF_EXTRACTION_MS) {
              await reader.cancel();
              throw new Error("El PDF tardó demasiado en extraerse. Use OpenAI o divida el archivo.");
            }
            const chunk = await withTimeout(reader.read(), 1_500, "Una página del PDF tardó demasiado en procesarse.");
            if (chunk.done) break;
            const items = chunk.value && typeof chunk.value === "object" && "items" in chunk.value && Array.isArray(chunk.value.items)
              ? chunk.value.items
              : [];
            totalItems += items.length;
            if (totalItems > MAX_PDF_TEXT_ITEMS) {
              await reader.cancel();
              throw new Error("El PDF contiene demasiado texto para procesarlo de forma segura.");
            }
            for (const item of items) {
              const fragment = item && typeof item === "object" && "str" in item && typeof item.str === "string"
                ? item.str
                : "";
              totalCharacters += fragment.length + 1;
              if (totalCharacters > MAX_SOURCE_CHARACTERS) {
                await reader.cancel();
                throw new Error("El documento es demasiado extenso para Gemma local. Use OpenAI o divídalo en archivos más pequeños.");
              }
              if (fragment) fragments.push(fragment);
            }
          }
          const pageText = fragments.join(" ")
            .replace(/[\u001e\u001f]/g, "")
            .replace(/\s+/g, " ")
            .trim();
          if (pageText) pages.push(`\u001eHHR_PAGE_${pageNumber}\u001f\n${pageText}`);
          else pagesWithoutText.push(pageNumber);
        } catch (error) {
          await reader.cancel().catch(() => undefined);
          throw error;
        } finally {
          page.cleanup();
        }
      }
      if (pagesWithoutText.length) {
        const pageList = pagesWithoutText.slice(0, 8).join(", ");
        const remainder = pagesWithoutText.length > 8 ? "…" : "";
        throw new Error(`El PDF incluye páginas sin texto seleccionable (${pageList}${remainder}). Use OpenAI o convierta esas páginas a JPG o PNG.`);
      }
      if (!pages.length) {
        throw new Error("Este PDF no contiene texto seleccionable. Para Gemma local, use las páginas como JPG o PNG.");
      }
      return enforceContextLimit(pages.join("\n\n"));
    } finally {
      await pdf.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}

export async function getPdfPageCount(file: File): Promise<number> {
  const pdfjs = await getResolvedPDFJS();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useSystemFonts: true,
  });
  try {
    const pdf = await withTimeout(
      loadingTask.promise,
      4_000,
      "El PDF tardó demasiado en abrirse.",
      () => loadingTask.destroy(),
    );
    try {
      return pdf.numPages;
    } finally {
      await pdf.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}

function joinChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function selectedDocxParts(bytes: Uint8Array): Map<string, Uint8Array> {
  const parts = new Map<string, Uint8Array>();
  let declaredBytes = 0;
  let actualBytes = 0;
  let hasEmbeddedMedia = false;
  let failure: Error | null = null;
  const archive = new Unzip((entry) => {
    if (/^word\/media\//i.test(entry.name)) {
      hasEmbeddedMedia = true;
      return;
    }
    if (!DOCX_PART.test(entry.name) || failure) return;
    const declaredSize = entry.originalSize ?? 0;
    const compressedSize = Math.max(entry.size ?? 1, 1);
    declaredBytes += declaredSize;
    if (
      declaredBytes > MAX_DOCX_XML_BYTES ||
      declaredSize / compressedSize > MAX_DOCX_COMPRESSION_RATIO
    ) {
      failure = new Error("El DOCX supera los límites seguros de descompresión.");
      return;
    }
    const chunks: Uint8Array[] = [];
    let entryBytes = 0;
    entry.ondata = (error, chunk, final) => {
      if (failure) return;
      if (error) {
        failure = new Error("No se pudo descomprimir el archivo DOCX.");
        return;
      }
      entryBytes += chunk.length;
      actualBytes += chunk.length;
      if (actualBytes > MAX_DOCX_XML_BYTES) {
        failure = new Error("El DOCX supera los límites seguros de descompresión.");
        throw failure;
      }
      chunks.push(chunk);
      if (final) parts.set(entry.name, joinChunks(chunks, entryBytes));
    };
    entry.start();
  });
  archive.register(UnzipInflate);
  archive.push(bytes, true);
  if (failure) throw failure;
  if (hasEmbeddedMedia) {
    throw new Error("El DOCX contiene imágenes incrustadas que Gemma local no puede analizar de forma completa. Use OpenAI o exporte el documento como PDF.");
  }
  return parts;
}

async function extractDocx(file: File): Promise<string> {
  const parts = selectedDocxParts(new Uint8Array(await file.arrayBuffer()));
  const documentXml = parts.get("word/document.xml");
  if (!documentXml) throw new Error("No se pudo leer el contenido del archivo DOCX.");
  const orderedParts = [...parts.entries()].sort(([left], [right]) => {
    if (left === "word/document.xml") return -1;
    if (right === "word/document.xml") return 1;
    return left.localeCompare(right);
  });
  const text = orderedParts
    .map(([name, bytes]) => `[${name}]\n${decodeXmlText(strFromU8(bytes))}`)
    .filter((part) => part.replace(/^\[[^\]]+\]\s*/, "").trim())
    .join("\n\n");
  if (!text) throw new Error("El DOCX no contiene texto utilizable.");
  return enforceContextLimit(text);
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("La imagen JPG no es válida.");
  }
  let offset = 2;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) break;
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += segmentLength;
  }
  throw new Error("No se pudieron verificar las dimensiones de la imagen JPG.");
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.length < 24 ||
    !pngSignature.every((value, index) => bytes[index] === value) ||
    String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR"
  ) {
    throw new Error("La imagen PNG no es válida.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function validateLocalImage(file: File, mimeType: string): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const dimensions = mimeType === "image/png"
    ? readPngDimensions(bytes)
    : mimeType === "image/jpeg"
      ? readJpegDimensions(bytes)
      : null;
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    throw new Error("Gemma local solo admite imágenes JPG o PNG válidas.");
  }
  if (
    dimensions.width > MAX_IMAGE_DIMENSION ||
    dimensions.height > MAX_IMAGE_DIMENSION ||
    dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
  ) {
    throw new Error("La imagen tiene dimensiones demasiado grandes para Gemma local. Redúzcala a 25 megapíxeles o menos.");
  }
}

export async function extractLocalSource(file: File, mimeType: string): Promise<string | null> {
  if (mimeType.startsWith("image/")) {
    await validateLocalImage(file, mimeType);
    return null;
  }
  if (mimeType === "application/pdf") return extractPdf(file);
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return extractDocx(file);
  throw new Error("Gemma local no admite este formato.");
}
