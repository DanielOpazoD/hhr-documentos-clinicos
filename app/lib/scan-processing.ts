"use client";

import { enhanceScan } from "@/app/features/scanner/scan-enhancement";
import { jpegExifOrientation } from "@/app/lib/image-orientation";

export type ScanFilter = "auto" | "color" | "gray" | "bw";
export type ScanPoint = { x: number; y: number };
export type ScanCorners = [ScanPoint, ScanPoint, ScanPoint, ScanPoint];
export type ScanQuality = { level: "good" | "warn"; label: string; detail: string };
export type ScanAdjustments = {
  brightness?: number;
  contrast: number;
  saturation?: number;
  whiten: number;
  sharpness?: number;
};

export const DEFAULT_SCAN_ADJUSTMENTS: ScanAdjustments = {
  brightness: 50,
  contrast: 52,
  saturation: 45,
  whiten: 28,
  sharpness: 18,
};

export function scanAdjustmentsForFilter(filter: ScanFilter): ScanAdjustments {
  if (filter === "color") return { brightness: 50, contrast: 50, saturation: 50, whiten: 0, sharpness: 0 };
  if (filter === "gray") return { brightness: 52, contrast: 54, saturation: 0, whiten: 20, sharpness: 16 };
  if (filter === "bw") return { brightness: 50, contrast: 56, saturation: 0, whiten: 0, sharpness: 12 };
  return { ...DEFAULT_SCAN_ADJUSTMENTS };
}

export const DEFAULT_SCAN_CORNERS: ScanCorners = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

type DecodedImage = { source: CanvasImageSource; width: number; height: number; release: () => void };
const MAX_PROCESSED_BYTES = 15 * 1024 * 1024;

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob
    ? resolve(blob)
    : reject(new Error("No se pudo preparar la imagen.")), "image/jpeg", quality));
}

async function canvasToFile(canvas: HTMLCanvasElement, name: string, quality = .985) {
  let current = canvas;
  let currentQuality = quality;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const blob = await canvasBlob(current, currentQuality);
    if (blob.size <= MAX_PROCESSED_BYTES) {
      return { file: new File([blob], name, { type: "image/jpeg" }), width: current.width, height: current.height };
    }
    const ratio = Math.min(.9, Math.sqrt(MAX_PROCESSED_BYTES / blob.size) * .94);
    const resized = document.createElement("canvas");
    resized.width = Math.max(1, Math.round(current.width * ratio));
    resized.height = Math.max(1, Math.round(current.height * ratio));
    const context = resized.getContext("2d");
    if (!context) throw new Error("No se pudo ajustar el tamaño de la imagen.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(current, 0, 0, resized.width, resized.height);
    current = resized;
    currentQuality = Math.max(.88, currentQuality - .03);
  }
  throw new Error("La imagen procesada supera el límite permitido.");
}

async function decodeImage(file: File): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch { /* Safari puede decodificar formatos que createImageBitmap no admite. */ }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("La imagen no pudo abrirse. Use JPG, PNG o tome una foto nueva.")); };
    image.src = url;
  });
}

export function scanQuality(canvas: HTMLCanvasElement): ScanQuality {
  const sample = document.createElement("canvas");
  sample.width = 160;
  sample.height = Math.max(1, Math.round(160 * canvas.height / canvas.width));
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return { level: "good", label: "Lista", detail: "Revise que el texto sea legible" };
  context.drawImage(canvas, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  let brightness = 0;
  let edges = 0;
  let previous = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = pixels[index] * .299 + pixels[index + 1] * .587 + pixels[index + 2] * .114;
    brightness += gray;
    if (index > 0) edges += Math.abs(gray - previous);
    previous = gray;
  }
  brightness /= pixels.length / 4;
  edges /= pixels.length / 4;
  if (brightness < 62) return { level: "warn", label: "Poca luz", detail: "Pruebe el modo Automático" };
  if (brightness > 242) return { level: "warn", label: "Mucho brillo", detail: "Evite reflejos directos" };
  if (edges < 5.2) return { level: "warn", label: "Revisar enfoque", detail: "Compruebe que las letras se vean nítidas" };
  return { level: "good", label: "Calidad alta", detail: "Iluminación y nitidez adecuadas" };
}

export async function prepareScanSource(file: File, index: number) {
  const image = await decodeImage(file);
  try {
    const scale = Math.min(1, 4800 / Math.max(image.width, image.height));
    const sourceType = file.type.toLowerCase();
    const orientation = await jpegExifOrientation(file);
    if (scale === 1 && (sourceType === "image/png" || (sourceType === "image/jpeg" && orientation === 1))) {
      return { file, width: image.width, height: image.height };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la imagen.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    return await canvasToFile(canvas, `pagina-${index}-original.jpg`, .995);
  } finally { image.release(); }
}

function isFullFrame(corners: ScanCorners) {
  return corners.every((point, index) => {
    const target = DEFAULT_SCAN_CORNERS[index];
    return Math.abs(point.x - target.x) < .0001 && Math.abs(point.y - target.y) < .0001;
  });
}

function isNeutralOriginal(filter: ScanFilter, adjustments: ScanAdjustments) {
  return filter === "color"
    && (adjustments.brightness ?? 50) === 50
    && adjustments.contrast === 50
    && (adjustments.saturation ?? 50) === 50
    && adjustments.whiten === 0
    && (adjustments.sharpness ?? 0) === 0;
}

function distance(a: ScanPoint, b: ScanPoint, width: number, height: number) {
  return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("No se pudo iniciar el procesador gráfico.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("No se pudo compilar el filtro de escaneo.");
  return shader;
}

function drawWebGl(canvas: HTMLCanvasElement, image: DecodedImage, corners: ScanCorners, filter: ScanFilter) {
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: false });
  if (!gl) return false;
  const vertex = compile(gl, gl.VERTEX_SHADER, `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); v_texCoord = a_texCoord; }
  `);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D u_image;
    uniform int u_filter;
    varying vec2 v_texCoord;
    void main() {
      vec3 color = texture2D(u_image, v_texCoord).rgb;
      float light = dot(color, vec3(0.299, 0.587, 0.114));
      if (u_filter == 1) {
        color = clamp((color - 0.12) * 1.24 + 0.20, 0.0, 1.0);
        float paper = smoothstep(0.48, 0.95, light);
        color = mix(color, vec3(1.0), paper * 0.18);
        float adjustedLight = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(adjustedLight), color, 0.88);
      } else if (u_filter == 2) {
        float gray = clamp((light - 0.12) * 1.30 + 0.20, 0.0, 1.0);
        color = vec3(gray);
      } else if (u_filter == 3) {
        color = vec3(smoothstep(0.48, 0.72, light));
      }
      gl_FragColor = vec4(color, 1.0);
    }
  `);
  const program = gl.createProgram();
  if (!program) throw new Error("No se pudo iniciar el filtro de escaneo.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("No se pudo enlazar el filtro de escaneo.");
  gl.useProgram(program);

  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  const vertices: number[] = [];
  const grid = 24;
  const add = (u: number, v: number) => {
    const top = { x: topLeft.x + (topRight.x - topLeft.x) * u, y: topLeft.y + (topRight.y - topLeft.y) * u };
    const bottom = { x: bottomLeft.x + (bottomRight.x - bottomLeft.x) * u, y: bottomLeft.y + (bottomRight.y - bottomLeft.y) * u };
    const source = { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
    // The browser already exposes the flipped DOM upload with a top-origin
    // sampling coordinate here. Inverting this value mirrors perspective crops.
    vertices.push(u * 2 - 1, 1 - v * 2, source.x, source.y);
  };
  for (let row = 0; row < grid; row++) {
    for (let column = 0; column < grid; column++) {
      const u0 = column / grid, u1 = (column + 1) / grid, v0 = row / grid, v1 = (row + 1) / grid;
      add(u0, v0); add(u1, v0); add(u0, v1);
      add(u0, v1); add(u1, v0); add(u1, v1);
    }
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  const textureCoordinate = gl.getAttribLocation(program, "a_texCoord");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(textureCoordinate);
  gl.vertexAttribPointer(textureCoordinate, 2, gl.FLOAT, false, 16, 8);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image.source as TexImageSource);
  const filterValue = filter === "auto" ? 1 : filter === "gray" ? 2 : filter === "bw" ? 3 : 0;
  gl.uniform1i(gl.getUniformLocation(program, "u_filter"), filterValue);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(1, 1, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 4);
  return true;
}

function drawFallback(canvas: HTMLCanvasElement, image: DecodedImage, corners: ScanCorners, filter: ScanFilter) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar la página.");
  const minX = Math.min(...corners.map(point => point.x)) * image.width;
  const maxX = Math.max(...corners.map(point => point.x)) * image.width;
  const minY = Math.min(...corners.map(point => point.y)) * image.height;
  const maxY = Math.max(...corners.map(point => point.y)) * image.height;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.filter = filter === "auto" ? "brightness(1.1) contrast(1.22) saturate(.88)" : filter === "gray" ? "grayscale(1) brightness(1.08) contrast(1.25)" : filter === "bw" ? "grayscale(1) brightness(1.15) contrast(1.85)" : "none";
  context.drawImage(image.source, minX, minY, maxX - minX, maxY - minY, 0, 0, canvas.width, canvas.height);
  context.filter = "none";
}

export async function renderScannedPage(sourceFile: File, sourceWidth: number, sourceHeight: number, corners: ScanCorners, filter: ScanFilter, pageNumber: number, adjustments: ScanAdjustments = DEFAULT_SCAN_ADJUSTMENTS) {
  const topWidth = distance(corners[0], corners[1], sourceWidth, sourceHeight);
  const bottomWidth = distance(corners[3], corners[2], sourceWidth, sourceHeight);
  const leftHeight = distance(corners[0], corners[3], sourceWidth, sourceHeight);
  const rightHeight = distance(corners[1], corners[2], sourceWidth, sourceHeight);
  const rawWidth = Math.max(1, Math.round((topWidth + bottomWidth) / 2));
  const rawHeight = Math.max(1, Math.round((leftHeight + rightHeight) / 2));
  const longestEdge = Math.max(rawWidth, rawHeight);
  // Low-resolution phone exports look jagged when a PDF viewer expands them to A4.
  // Processed styles get a bounded high-quality 3x supersample.
  const printScale = longestEdge < 2400 ? Math.min(3, 2400 / longestEdge) : 1;
  const scale = Math.min(printScale, 4800 / longestEdge);
  const rawCanvas = document.createElement("canvas");
  rawCanvas.width = Math.max(1, Math.round(rawWidth * scale));
  rawCanvas.height = Math.max(1, Math.round(rawHeight * scale));
  const image = await decodeImage(sourceFile);
  try {
    if (isFullFrame(corners) && isNeutralOriginal(filter, adjustments) && (sourceFile.type === "image/jpeg" || sourceFile.type === "image/png")) {
      const originalCanvas = document.createElement("canvas");
      originalCanvas.width = sourceWidth;
      originalCanvas.height = sourceHeight;
      drawFallback(originalCanvas, image, DEFAULT_SCAN_CORNERS, "color");
      const output = await canvasToFile(originalCanvas, `pagina-${pageNumber}.jpg`, .995);
      return { ...output, quality: scanQuality(originalCanvas) };
    }
    if (isFullFrame(corners)) drawFallback(rawCanvas, image, corners, "color");
    else if (!drawWebGl(rawCanvas, image, corners, "color")) drawFallback(rawCanvas, image, corners, "color");
    const canvas = enhanceScan(rawCanvas, filter, adjustments);
    const output = await canvasToFile(canvas, `pagina-${pageNumber}.jpg`, .985);
    return { ...output, quality: scanQuality(canvas) };
  } finally { image.release(); }
}
