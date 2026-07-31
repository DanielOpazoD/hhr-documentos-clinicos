import { DEFAULT_SCAN_CORNERS, type ScanCorners } from "@/app/lib/scan-processing";

export type DocumentDetection = { corners: ScanCorners; confidence: number };

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

const cloneDefaultCorners = () => DEFAULT_SCAN_CORNERS.map(point => ({ ...point })) as ScanCorners;
const clamp = (value: number) => Math.max(.005, Math.min(.995, value));

function paddedCorners(corners: ScanCorners, padding = .018): ScanCorners {
  return corners.map((point, index) => ({
    x: clamp(point.x + (index === 0 || index === 3 ? -padding : padding)),
    y: clamp(point.y + (index === 0 || index === 1 ? -padding : padding)),
  })) as ScanCorners;
}

async function decode(file: File): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch { /* Safari puede requerir decodificación mediante HTMLImageElement. */ }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo detectar el documento.")); };
    image.src = url;
  });
}

function strongestLine(values: Uint8Array, width: number, height: number, axis: "x" | "y", start: number, end: number, crossStart: number, crossEnd: number) {
  const limit = axis === "x" ? width : height;
  const crossLimit = axis === "x" ? height : width;
  const from = Math.max(2, Math.round(start * limit));
  const to = Math.min(limit - 3, Math.round(end * limit));
  const crossFrom = Math.max(2, Math.round(crossStart * crossLimit));
  const crossTo = Math.min(crossLimit - 3, Math.round(crossEnd * crossLimit));
  let bestIndex = from;
  let bestScore = -1;
  let totalScore = 0;
  let samples = 0;
  for (let line = from; line <= to; line += 1) {
    let score = 0;
    for (let cross = crossFrom; cross <= crossTo; cross += 2) {
      const index = axis === "x" ? cross * width + line : line * width + cross;
      const before = axis === "x" ? index - 2 : index - width * 2;
      const after = axis === "x" ? index + 2 : index + width * 2;
      score += Math.abs(values[after] - values[before]);
    }
    totalScore += score;
    samples += 1;
    if (score > bestScore) { bestScore = score; bestIndex = line; }
  }
  const average = totalScore / Math.max(1, samples);
  return { position: bestIndex / limit, confidence: Math.min(1, Math.max(0, (bestScore / Math.max(1, average) - 1) / 4)) };
}

export async function detectDocumentCorners(file: File): Promise<DocumentDetection> {
  const image = await decode(file);
  try {
    const scale = Math.min(1, 720 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(80, Math.round(image.width * scale));
    canvas.height = Math.max(80, Math.round(image.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("No se pudo detectar el documento.");
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const luminance = new Uint8Array(canvas.width * canvas.height);
    for (let pixel = 0, offset = 0; pixel < luminance.length; pixel += 1, offset += 4) {
      luminance[pixel] = Math.round(rgba[offset] * .299 + rgba[offset + 1] * .587 + rgba[offset + 2] * .114);
    }

    const leftTop = strongestLine(luminance, canvas.width, canvas.height, "x", .015, .43, .08, .52);
    const leftBottom = strongestLine(luminance, canvas.width, canvas.height, "x", .015, .43, .48, .92);
    const rightTop = strongestLine(luminance, canvas.width, canvas.height, "x", .57, .985, .08, .52);
    const rightBottom = strongestLine(luminance, canvas.width, canvas.height, "x", .57, .985, .48, .92);
    const topLeft = strongestLine(luminance, canvas.width, canvas.height, "y", .015, .43, .08, .52);
    const topRight = strongestLine(luminance, canvas.width, canvas.height, "y", .015, .43, .48, .92);
    const bottomLeft = strongestLine(luminance, canvas.width, canvas.height, "y", .57, .985, .08, .52);
    const bottomRight = strongestLine(luminance, canvas.width, canvas.height, "y", .57, .985, .48, .92);
    const confidence = [leftTop, leftBottom, rightTop, rightBottom, topLeft, topRight, bottomLeft, bottomRight]
      .reduce((total, item) => total + item.confidence, 0) / 8;
    const corners: ScanCorners = [
      { x: leftTop.position, y: topLeft.position },
      { x: rightTop.position, y: topRight.position },
      { x: rightBottom.position, y: bottomRight.position },
      { x: leftBottom.position, y: bottomLeft.position },
    ];
    const minimumWidth = Math.min(corners[1].x - corners[0].x, corners[2].x - corners[3].x);
    const minimumHeight = Math.min(corners[3].y - corners[0].y, corners[2].y - corners[1].y);
    const coverage = minimumWidth * minimumHeight;
    if (minimumWidth < .55 || minimumHeight < .55 || coverage < .4 || confidence < .2) {
      return { corners: cloneDefaultCorners(), confidence: 0 };
    }
    return { corners: paddedCorners(corners), confidence };
  } finally { image.release(); }
}
