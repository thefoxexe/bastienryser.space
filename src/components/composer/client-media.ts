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

/** Dimensions et durée d'une vidéo (lues par le navigateur, sans l'envoyer). */
export function videoSize(file: Blob): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Vidéo illisible"));
    };
    video.src = url;
  });
}

/** Poids visé : sous 1 Mo, la limite de Bluesky, sans perte visible sur les autres réseaux. */
const TARGET_BYTES = 950_000;

/**
 * Instagram n'accepte que le JPEG : on convertit PNG/WebP côté navigateur.
 * Largeur ramenée à 2160 px au plus, puis qualité et taille réduites par paliers jusqu'à passer sous 1 Mo.
 */
export async function toJpeg(file: File): Promise<File> {
  const { width, height } = await imageSize(file);
  if (file.type === "image/jpeg" && width <= 2160 && file.size <= TARGET_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  const steps: [number, number][] = [
    [2160, 0.9],
    [2160, 0.82],
    [1620, 0.85],
    [1350, 0.82],
    [1080, 0.8],
  ];
  let blob: Blob | null = null;
  for (const [maxWidth, quality] of steps) {
    const scale = Math.min(1, maxWidth / width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; // la transparence devient blanche
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Conversion impossible"))), "image/jpeg", quality));
    if (blob.size <= TARGET_BYTES) break;
  }
  return new File([blob!], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
