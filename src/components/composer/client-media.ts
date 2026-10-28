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

/** Limite d'envoi de Supabase (plan gratuit : 50 Mo), avec une marge. */
export const VIDEO_MAX_BYTES = 48 * 1024 * 1024;
/** Instagram et Threads refusent plus de 1920 px sur le plus grand côté. */
const VIDEO_MAX_SIDE = 1920;

export type PreparedVideo = {
  file: File;
  width: number;
  height: number;
  duration: number;
  /** Ce qui a été fait, pour l'afficher (« 4K → 1080p », « compressée »…). */
  note: string | null;
  /** Le son n'a pas pu être gardé (codec non pris en charge par le navigateur). */
  mutedByConversion: boolean;
};

/**
 * Rend une vidéo publiable partout : MP4 H.264, 1920 px au plus, sous la limite d'envoi.
 * Une vidéo déjà conforme est gardée telle quelle ; sinon elle est convertie dans le navigateur
 * (WebCodecs, encodeur matériel de l'appareil), sans passer par un serveur.
 */
export async function prepareVideo(original: File, onProgress: (p: number) => void): Promise<PreparedVideo> {
  const { ALL_FORMATS, BlobSource, BufferTarget, canEncodeVideo, Conversion, Input, Mp4OutputFormat, Output, Quality } = await import("mediabunny");

  const input = new Input({ source: new BlobSource(original), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("Aucune piste vidéo dans ce fichier");
  const [codec, srcWidth, srcHeight, duration, hdr] = await Promise.all([
    track.getCodec(),
    track.getDisplayWidth(),
    track.getDisplayHeight(),
    input.computeDuration(),
    track.hasHighDynamicRange(),
  ]);
  if (!duration || duration < 1) throw new Error("Vidéo trop courte");

  const longest = Math.max(srcWidth, srcHeight);
  const isMp4 = original.type === "video/mp4" || original.type === "video/quicktime";
  const conforming = isMp4 && codec === "avc" && !hdr && longest <= VIDEO_MAX_SIDE && original.size <= VIDEO_MAX_BYTES;
  if (conforming) {
    return { file: original, width: srcWidth, height: srcHeight, duration, note: null, mutedByConversion: false };
  }

  if (!(await canEncodeVideo("avc"))) {
    throw new Error("Ce navigateur ne sait pas convertir la vidéo : utilise Chrome ou Safari à jour");
  }

  // Débit visé : assez pour rester sous la limite, plafonné à 8 Mb/s (au-delà, aucun gain visible en 1080p).
  const audioBits = 160_000;
  const budget = (VIDEO_MAX_BYTES * 8 * 0.92) / duration - audioBits;
  const bitrate = Math.min(8_000_000, Math.floor(budget));
  // Vidéo longue : on descend en 720p pour garder une image propre avec peu de débit.
  const maxSide = bitrate < 2_500_000 ? 1280 : VIDEO_MAX_SIDE;
  if (bitrate < 700_000) throw new Error(`Vidéo trop longue pour l'envoi (${Math.round(duration / 60)} min) : 10 min au plus`);

  const scale = Math.min(1, maxSide / longest);
  // Dimensions paires, exigées par l'encodeur H.264.
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const width = even(srcWidth * scale);
  const height = even(srcHeight * scale);

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const conversion = await Conversion.init({
    input,
    output,
    video: { codec: "avc", width, height, fit: "fill", quality: new Quality({ bitrate }), forceTranscode: true },
    audio: { codec: "aac" },
  });
  if (!conversion.isValid || conversion.discardedTracks.some((t) => t.track.type === "video")) {
    throw new Error("Ce navigateur ne sait pas convertir cette vidéo : essaie avec Chrome ou Safari à jour");
  }
  const mutedByConversion = conversion.discardedTracks.some((t) => t.track.type === "audio");
  conversion.onProgress = (p) => onProgress(p);
  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error("Conversion impossible");
  if (buffer.byteLength > VIDEO_MAX_BYTES * 1.04) throw new Error("Vidéo encore trop lourde après conversion");

  const label = (w: number, h: number) => {
    const side = Math.min(w, h);
    return side >= 2000 ? "4K" : side >= 1400 ? "1440p" : side >= 1000 ? "1080p" : side >= 700 ? "720p" : `${side}p`;
  };
  const note =
    longest > maxSide ? `${label(srcWidth, srcHeight)} → ${label(width, height)}` : codec !== "avc" || hdr || !isMp4 ? "Convertie en MP4 H.264" : "Compressée";

  return {
    file: new File([buffer], original.name.replace(/\.\w+$/, "") + ".mp4", { type: "video/mp4" }),
    width,
    height,
    duration,
    note,
    mutedByConversion,
  };
}

/** Image JPEG d'une vidéo à l'instant `ms` (couverture). */
export function videoFrame(url: string, ms: number, maxWidth = 1080): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(ms / 1000, Math.max(0, video.duration - 0.05));
    };
    video.onseeked = () => {
      const scale = Math.min(1, maxWidth / video.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image impossible"))), "image/jpeg", 0.85);
    };
    video.onerror = () => reject(new Error("Vidéo illisible"));
    video.src = url;
  });
}
