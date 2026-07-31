import type { ScanAdjustments, ScanFilter } from "@/app/lib/scan-processing";

function percentile(histogram: Uint32Array, pixelCount: number, ratio: number) {
  const target = pixelCount * ratio;
  let total = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    total += histogram[value];
    if (total >= target) return value;
  }
  return 255;
}

function otsuThreshold(histogram: Uint32Array, pixelCount: number) {
  let sum = 0;
  for (let index = 0; index < 256; index += 1) sum += index * histogram[index];
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let maximumVariance = -1;
  let threshold = 150;
  for (let index = 0; index < 256; index += 1) {
    backgroundWeight += histogram[index];
    if (!backgroundWeight) continue;
    const foregroundWeight = pixelCount - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += index * histogram[index];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > maximumVariance) { maximumVariance = variance; threshold = index; }
  }
  return threshold;
}

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const smoothStep = (edge0: number, edge1: number, value: number) => {
  const normalized = Math.max(0, Math.min(1, (value - edge0) / Math.max(.001, edge1 - edge0)));
  return normalized * normalized * (3 - 2 * normalized);
};

function resolveTonalRange(histogram: Uint32Array, pixelCount: number) {
  const low = percentile(histogram, pixelCount, .015);
  const high = percentile(histogram, pixelCount, .975);
  if (high - low < 24) return { blackPoint: 0, range: 255 };
  return { blackPoint: low, range: high - low };
}

export function enhanceScan(source: HTMLCanvasElement, filter: ScanFilter, adjustments: ScanAdjustments): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No se pudo aplicar el acabado del escaneo.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0);
  const brightnessValue = Math.max(0, Math.min(100, adjustments.brightness ?? 50));
  const contrastValue = Math.max(0, Math.min(100, adjustments.contrast));
  const saturationValue = Math.max(0, Math.min(100, adjustments.saturation ?? 50));
  const sharpnessValue = Math.max(0, Math.min(100, adjustments.sharpness ?? 0));
  if (filter === "color" && brightnessValue === 50 && contrastValue === 50 && saturationValue === 50 && adjustments.whiten === 0 && sharpnessValue === 0) return canvas;

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const histogram = new Uint32Array(256);
  const pixelCount = image.data.length / 4;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    histogram[Math.round(image.data[offset] * .299 + image.data[offset + 1] * .587 + image.data[offset + 2] * .114)] += 1;
  }
  const { blackPoint, range } = resolveTonalRange(histogram, pixelCount);
  const whitenStrength = Math.max(0, Math.min(1, adjustments.whiten / 100));
  const contrast = .5 + contrastValue / 100;
  const brightness = (brightnessValue - 50) * 2;
  const saturation = saturationValue / 50;
  const bwThreshold = otsuThreshold(histogram, pixelCount);
  const bwSoftness = Math.max(7, 18 - (contrastValue - 50) * .18);

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const red = image.data[offset];
    const green = image.data[offset + 1];
    const blue = image.data[offset + 2];
    const light = red * .299 + green * .587 + blue * .114;
    if (filter === "bw") {
      const threshold = bwThreshold + (50 - contrastValue) * .18 - (brightnessValue - 50) * 1.1;
      // Preserve antialiasing around handwriting and thin table rules instead of
      // collapsing every pixel to pure black or white.
      const value = clampByte(smoothStep(threshold - bwSoftness, threshold + bwSoftness, light) * 255);
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      continue;
    }
    const normalizedLight = Math.max(0, Math.min(1, (light - blackPoint) / range));
    const paper = smoothStep(.7, .98, normalizedLight) * whitenStrength;
    const adjust = (channel: number) => clampByte((channel - 127.5) * contrast + 127.5 + brightness);
    if (filter === "gray") {
      const adjustedLight = adjust(light);
      const gray = clampByte(adjustedLight + (255 - adjustedLight) * paper);
      image.data[offset] = gray;
      image.data[offset + 1] = gray;
      image.data[offset + 2] = gray;
    } else {
      const adjustedRed = adjust(red);
      const adjustedGreen = adjust(green);
      const adjustedBlue = adjust(blue);
      const adjustedLight = adjustedRed * .299 + adjustedGreen * .587 + adjustedBlue * .114;
      const saturate = (channel: number) => adjustedLight + (channel - adjustedLight) * saturation;
      image.data[offset] = clampByte(saturate(adjustedRed) + (255 - saturate(adjustedRed)) * paper);
      image.data[offset + 1] = clampByte(saturate(adjustedGreen) + (255 - saturate(adjustedGreen)) * paper);
      image.data[offset + 2] = clampByte(saturate(adjustedBlue) + (255 - saturate(adjustedBlue)) * paper);
    }
  }
  const sharpness = sharpnessValue;
  if (sharpness > 0 && canvas.width > 2 && canvas.height > 2) {
    const original = new Uint8ClampedArray(image.data);
    const amount = sharpness / 500;
    const rowStride = canvas.width * 4;
    for (let y = 1; y < canvas.height - 1; y += 1) {
      for (let x = 1; x < canvas.width - 1; x += 1) {
        const offset = y * rowStride + x * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const center = original[offset + channel];
          const neighbors = original[offset - 4 + channel] + original[offset + 4 + channel] + original[offset - rowStride + channel] + original[offset + rowStride + channel];
          image.data[offset + channel] = clampByte(center + amount * (center * 4 - neighbors));
        }
      }
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}
