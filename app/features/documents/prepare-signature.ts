const MAX_SIGNATURE_DIMENSION = 1200;
const JPEG_QUALITY = 0.84;

export async function prepareSignatureUpload(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(
      1,
      MAX_SIGNATURE_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la firma.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("No se pudo preparar la firma.")),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
    return new File([blob], "firma.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
