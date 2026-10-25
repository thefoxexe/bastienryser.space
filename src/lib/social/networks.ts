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
  requiresMedia: boolean;
  available: boolean;
};

// Limites vérifiées dans les documentations officielles (octobre 2026) :
// - Instagram (API Graph v26) : légende 2 200 caractères, 30 hashtags, carrousel de 2 à 10 éléments, JPEG.
// - Page Facebook : 63 206 caractères, publication multi-photos via attached_media.
// - LinkedIn (Posts API 202609) : 3 000 caractères, multiImage de 2 à 20 images, ou un document PDF.
// - Threads : 500 caractères, un seul sujet (hashtag), carrousel jusqu'à 20.
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
    requiresMedia: false,
    available: false,
  },
};

export const NETWORK_ORDER: SocialNetwork[] = ["instagram", "facebook", "linkedin", "linkedin_page", "threads"];

export function countHashtags(text: string) {
  return (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
}

export function countChars(text: string) {
  // Les réseaux comptent les caractères visibles (graphèmes), pas les octets.
  return [...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(text)].length;
}

export type MediaSummary = { kind: MediaKind }[];

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
  if (videos > 0) {
    issues.push({ level: "error", message: "Les vidéos ne sont pas encore prises en charge." });
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
  if (rules.requiresMedia && images === 0) {
    issues.push({ level: "error", message: `${rules.label} demande au moins une image.` });
  }
  if (images > rules.maxImages) {
    issues.push({ level: "error", message: `${images} images, ${rules.label} en accepte ${rules.maxImages} au maximum.` });
  }
  if (!caption.trim() && images === 0 && pdfs === 0) {
    issues.push({ level: "error", message: "Le post est vide." });
  }
  return issues;
}
