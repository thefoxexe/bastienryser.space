"use client";

/** Lit les dimensions d'une image. */
export function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible"));
    };
    img.src = url;
  });
}

/**
 * Instagram n'accepte que le JPEG : on convertit PNG/WebP côté navigateur, sans perte visible.
 * Les très grandes images sont ramenées à 2160 px de large (2 × 1080), largement suffisant.
 */
export async function toJpeg(file: File): Promise<File> {
  const { width, height } = await imageSize(file);
  const scale = Math.min(1, 2160 / width);
  if (file.type === "image/jpeg" && scale === 1) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; // la transparence devient blanche
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const bitmap = await createImageBitmap(file);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Conversion impossible"))), "image/jpeg", 0.92),
  );
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
