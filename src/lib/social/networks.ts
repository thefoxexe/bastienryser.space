import type { MediaKind, SocialNetwork } from "@/lib/types";

export type NetworkRules = {
  id: SocialNetwork;
  label: string;
  short: string;
  /** Couleur de marque, utilisée seulement pour les pastilles. */
  brand: string;
  maxChars: number;
  /** Limite stricte imposée par l'API. */
  maxHashtags: number | null;
  /** Au-delà, simple avertissement (bonne pratique). */
  recommendedHashtags: number | null;
  minImages: number;
  maxImages: number;
  allowsPdf: boolean;
  /** Une vidéo seule (pas de mélange avec des images). */
  allowsVideo: boolean;
  requiresVideo: boolean;
  requiresMedia: boolean;
  /** Poids maximal d'une image (Bluesky : 1 Mo). */
  maxImageBytes: number | null;
  available: boolean;
};

// Limites vérifiées dans les documentations officielles (octobre 2026) :
// - Instagram (API Graph v26) : légende 2 200 caractères, 30 hashtags, carrousel de 2 à 10 éléments, JPEG.
// - Page Facebook : 63 206 caractères, publication multi-photos via attached_media.
// - LinkedIn (Posts API 202609) : 3 000 caractères, multiImage de 2 à 20 images, ou un document PDF.
// - Threads : 500 caractères, un seul sujet (hashtag), carrousel jusqu'à 20, vidéo.
// - YouTube (Data API v3) : titre 100 caractères, description 5 000, une vidéo.
// - TikTok (Content Posting API) : légende 2 200 caractères, une vidéo.
// - Bluesky (AT Protocol) : 300 caractères, 4 images de 1 Mo maximum.
// - Pinterest (API v5) : description 800 caractères, une image ou un carrousel de 2 à 5.
// - X (API v2) : 280 caractères, 4 images.
export const NETWORKS: Record<SocialNetwork, NetworkRules> = {
  instagram: {
    id: "instagram",
    label: "Instagram",
    short: "IG",
    brand: "#d62976",
    maxChars: 2200,
    maxHashtags: 30,
    recommendedHashtags: 10,
    minImages: 1,
    maxImages: 10,
    allowsPdf: false,
    requiresMedia: true,
    allowsVideo: true,
    requiresVideo: false,
    maxImageBytes: null,
    available: true,
  },
  facebook: {
    id: "facebook",
    label: "Page Facebook",
    short: "FB",
    brand: "#1877f2",
    maxChars: 63206,
    maxHashtags: null,
    recommendedHashtags: 5,
    minImages: 0,
    maxImages: 10,
    allowsPdf: false,
    requiresMedia: false,
    allowsVideo: true,
    requiresVideo: false,
    maxImageBytes: null,
    available: true,
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn (profil)",
    short: "in",
    brand: "#0a66c2",
    maxChars: 3000,
    maxHashtags: null,
    recommendedHashtags: 5,
    minImages: 0,
    maxImages: 20,
    allowsPdf: true,
    requiresMedia: false,
    allowsVideo: false,
    requiresVideo: false,
    maxImageBytes: null,
    available: true,
  },
  linkedin_page: {
    id: "linkedin_page",
    label: "LinkedIn (page)",
    short: "in",
    brand: "#0a66c2",
    maxChars: 3000,
    maxHashtags: null,
    recommendedHashtags: 5,
    minImages: 0,
    maxImages: 20,
    allowsPdf: true,
    requiresMedia: false,
    allowsVideo: false,
    requiresVideo: false,
    maxImageBytes: null,
    available: true,
  },
  threads: {
    id: "threads",
    label: "Threads",
    short: "@",
    brand: "#101010",
    maxChars: 500,
    maxHashtags: 1,
    recommendedHashtags: 1,
    minImages: 0,
    maxImages: 20,
    allowsPdf: false,
    allowsVideo: true,
    requiresVideo: false,
    requiresMedia: false,
    maxImageBytes: null,
    available: true,
  },
  youtube: {
    id: "youtube",
    label: "YouTube",
    short: "YT",
    brand: "#ff0000",
    maxChars: 5000,
    maxHashtags: 60,
    recommendedHashtags: 3,
    minImages: 0,
    maxImages: 0,
    allowsPdf: false,
    allowsVideo: true,
    requiresVideo: true,
    requiresMedia: true,
    maxImageBytes: null,
    available: true,
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    short: "TT",
    brand: "#000000",
    maxChars: 2200,
    maxHashtags: null,
    recommendedHashtags: 5,
    minImages: 0,
    maxImages: 0,
    allowsPdf: false,
    allowsVideo: true,
    requiresVideo: true,
    requiresMedia: true,
    maxImageBytes: null,
    available: true,
  },
  bluesky: {
    id: "bluesky",
    label: "Bluesky",
    short: "BS",
    brand: "#1185fe",
    maxChars: 300,
    maxHashtags: null,
    recommendedHashtags: 3,
    minImages: 0,
    maxImages: 4,
    allowsPdf: false,
    allowsVideo: false,
    requiresVideo: false,
    requiresMedia: false,
    maxImageBytes: 1_000_000,
    available: true,
  },
  pinterest: {
    id: "pinterest",
    label: "Pinterest",
    short: "P",
    brand: "#e60023",
    maxChars: 800,
    maxHashtags: null,
    recommendedHashtags: 5,
    minImages: 1,
    maxImages: 5,
    allowsPdf: false,
    allowsVideo: false,
    requiresVideo: false,
    requiresMedia: true,
    maxImageBytes: null,
    available: true,
  },
  x: {
    id: "x",
    label: "X",
    short: "X",
    brand: "#000000",
    maxChars: 280,
    maxHashtags: null,
    recommendedHashtags: 2,
    minImages: 0,
    maxImages: 4,
    allowsPdf: false,
    allowsVideo: false,
    requiresVideo: false,
    requiresMedia: false,
    maxImageBytes: null,
    available: true,
  },
};

export const NETWORK_ORDER: SocialNetwork[] = [
  "instagram",
  "facebook",
  "linkedin",
  "linkedin_page",
  "threads",
  "tiktok",
  "youtube",
  "x",
  "bluesky",
  "pinterest",
];

/** Jeton renouvelé automatiquement (refresh token) : pas d'alerte d'échéance, seulement en cas d'erreur. */
export const AUTO_REFRESH: SocialNetwork[] = ["threads", "youtube", "tiktok", "pinterest", "x"];

export function countHashtags(text: string) {
  return (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
}

export function countChars(text: string) {
  // Les réseaux comptent les caractères visibles (graphèmes), pas les octets.
  return [...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(text)].length;
}

export type MediaSummary = { kind: MediaKind; size?: number; durationMs?: number | null; width?: number | null; height?: number | null }[];

/** Durées acceptées par les API (secondes). */
const VIDEO_LIMITS: Partial<Record<SocialNetwork, { min: number; max: number }>> = {
  instagram: { min: 3, max: 15 * 60 },
  facebook: { min: 1, max: 4 * 3600 },
  threads: { min: 1, max: 5 * 60 },
  youtube: { min: 1, max: 12 * 3600 },
  tiktok: { min: 3, max: 10 * 60 },
};

/** Une vidéo verticale et courte devient un Reel Facebook ; sinon une vidéo classique de la Page. */
export function isFacebookReel(v: { durationMs?: number | null; width?: number | null; height?: number | null }) {
  const s = (v.durationMs ?? 0) / 1000;
  return !!v.width && !!v.height && v.height > v.width && s >= 3 && s <= 90;
}

export type Issue = { level: "error" | "warning"; message: string };

export function checkTarget(network: SocialNetwork, caption: string, media: MediaSummary): Issue[] {
  const rules = NETWORKS[network];
  const issues: Issue[] = [];
  const images = media.filter((m) => m.kind === "image").length;
  const pdfs = media.filter((m) => m.kind === "pdf").length;
  const videos = media.filter((m) => m.kind === "video").length;
  const chars = countChars(caption);
  const tags = countHashtags(caption);

  if (chars > rules.maxChars) {
    issues.push({ level: "error", message: `${chars - rules.maxChars} caractères de trop (max ${rules.maxChars.toLocaleString("fr-CH")}).` });
  }
  if (rules.maxHashtags !== null && tags > rules.maxHashtags) {
    issues.push({ level: "error", message: `${tags} hashtags, ${rules.label} en accepte ${rules.maxHashtags} au maximum.` });
  } else if (rules.recommendedHashtags !== null && tags > rules.recommendedHashtags) {
    issues.push({ level: "warning", message: `${tags} hashtags : au-delà de ${rules.recommendedHashtags}, la portée baisse souvent.` });
  }
  if (videos > 0 && !rules.allowsVideo) {
    issues.push({ level: "error", message: `${rules.label} : les vidéos ne sont pas prises en charge ici.` });
  }
  if (videos > 1) {
    issues.push({ level: "error", message: "Une seule vidéo par post." });
  }
  if (videos > 0 && (images > 0 || pdfs > 0)) {
    issues.push({ level: "error", message: "Une vidéo se publie seule : retire les images et le PDF." });
  }
  const video = media.find((m) => m.kind === "video");
  const limits = VIDEO_LIMITS[network];
  if (video?.durationMs && limits) {
    const s = video.durationMs / 1000;
    const fmt = (n: number) => (n >= 60 ? `${Math.round(n / 60)} min` : `${n} s`);
    if (s < limits.min) issues.push({ level: "error", message: `Vidéo trop courte pour ${rules.label} (${fmt(limits.min)} minimum).` });
    if (s > limits.max) issues.push({ level: "error", message: `Vidéo trop longue pour ${rules.label} (${fmt(limits.max)} maximum).` });
  }
  if (video?.width && video.height) {
    const vertical = video.height > video.width;
    if (network === "instagram" && !vertical) issues.push({ level: "warning", message: "Vidéo horizontale : le Reel aura des bandes. Le format idéal est 9:16 (vertical)." });
    if (network === "facebook" && !isFacebookReel(video)) {
      issues.push({ level: "warning", message: "Publiée en vidéo classique sur la Page : un Reel Facebook doit être vertical et durer 3 à 90 s." });
    }
    if (network === "youtube" && !(vertical && (video.durationMs ?? 0) <= 180_000)) {
      issues.push({ level: "warning", message: "Vidéo YouTube classique : un Short doit être vertical et durer 3 min au plus." });
    }
  }
  if (rules.requiresVideo && videos === 0) {
    issues.push({ level: "error", message: `${rules.label} demande une vidéo.` });
  }
  if (pdfs > 0 && !rules.allowsPdf) {
    issues.push({ level: "error", message: `${rules.label} n'accepte pas de PDF.` });
  }
  if (pdfs > 1) {
    issues.push({ level: "error", message: "Un seul PDF par post." });
  }
  if (pdfs > 0 && images > 0 && rules.allowsPdf) {
    issues.push({ level: "error", message: "LinkedIn : choisis soit des images, soit un PDF, pas les deux." });
  }
  if (rules.requiresMedia && !rules.requiresVideo && images === 0 && !(rules.allowsVideo && videos > 0)) {
    issues.push({ level: "error", message: `${rules.label} demande ${rules.allowsVideo ? "une image ou une vidéo" : "au moins une image"}.` });
  }
  if (rules.maxImageBytes !== null) {
    const heavy = media.filter((m) => m.kind === "image" && (m.size ?? 0) > rules.maxImageBytes!).length;
    if (heavy) {
      issues.push({ level: "error", message: `${heavy} image${heavy > 1 ? "s" : ""} trop lourde${heavy > 1 ? "s" : ""} pour ${rules.label} (1 Mo max).` });
    }
  }
  if (images > rules.maxImages) {
    issues.push({ level: "error", message: `${images} images, ${rules.label} en accepte ${rules.maxImages} au maximum.` });
  }
  if (!caption.trim() && images === 0 && pdfs === 0 && videos === 0) {
    issues.push({ level: "error", message: "Le post est vide." });
  }
  return issues;
}
