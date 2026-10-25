import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Trouve le logo d'un site à partir de sa page d'accueil : icônes déclarées (apple-touch-icon, icon avec tailles,
 * manifeste), puis image de partage, puis le service d'icônes de Google. On garde la plus grande image carrée.
 * Seules les adresses publiques en http(s) sont lues (pas de localhost ni de réseau privé).
 */

export type FoundLogo = { url: string; type: string; bytes: Uint8Array; width: number | null };

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_HTML = 1024 * 1024;
export const MAX_LOGO = 3 * 1024 * 1024;
const TIMEOUT = 6000;

function isPrivateAddress(ip: string) {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Adresse non prise en charge.");
  if (url.username || url.password) throw new Error("Adresse non prise en charge.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Adresse privée refusée.");
  }
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("Adresse privée refusée.");
}

/** GET avec redirections suivies à la main (chaque saut est revérifié) et taille plafonnée. */
async function safeGet(start: string, maxBytes: number) {
  let url = new URL(start);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { "user-agent": "Mozilla/5.0 (compatible; bastienryser.space logo finder)", accept: "text/html,image/*;q=0.9,*/*;q=0.5" },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`Réponse ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new Error("Fichier trop lourd.");
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Fichier trop lourd.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    return { url, bytes, type: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() };
  }
  throw new Error("Trop de redirections.");
}

type Candidate = { href: string; size: number; rank: number };

function attr(tag: string, name: string) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : null;
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/").replace(/&quot;/g, '"');
}

function largestSize(sizes: string | null) {
  if (!sizes) return 0;
  if (sizes.toLowerCase() === "any") return 512;
  return Math.max(0, ...sizes.split(/\s+/).map((s) => Number(s.toLowerCase().split("x")[0]) || 0));
}

/** Icônes déclarées dans le HTML. `rank` départage : icône d'app > icône > image de partage. */
export function logoCandidates(html: string, base: URL): { icons: Candidate[]; manifest: string | null } {
  const icons: Candidate[] = [];
  let manifest: string | null = null;
  const head = html.slice(0, 200_000);
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    const href = attr(tag, "href");
    if (!href) continue;
    const abs = new URL(decodeEntities(href), base).toString();
    if (rel.split(/\s+/).includes("manifest")) manifest = abs;
    else if (rel.includes("apple-touch-icon")) icons.push({ href: abs, size: largestSize(attr(tag, "sizes")) || 180, rank: 3 });
    else if (rel.split(/\s+/).includes("icon")) {
      const svg = (attr(tag, "type") ?? "").includes("svg") || /\.svg(\?|$)/i.test(abs);
      icons.push({ href: abs, size: svg ? 512 : largestSize(attr(tag, "sizes")) || 32, rank: 2 });
    }
  }
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const prop = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
    const content = attr(tag, "content");
    if (content && (prop === "og:image" || prop === "og:logo")) {
      icons.push({ href: new URL(decodeEntities(content), base).toString(), size: 0, rank: prop === "og:logo" ? 2 : 0 });
    }
  }
  return { icons, manifest };
}

/** Largeur réelle d'une image PNG, JPEG ou WebP (null si illisible ou vectorielle). */
export function imageWidth(bytes: Uint8Array, type: string): number | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === "image/png" && bytes.length > 24) return v.getUint32(16);
  if (type === "image/webp" && bytes.length > 30) {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X") return 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    if (chunk === "VP8 ") return v.getUint16(26, true) & 0x3fff;
    if (chunk === "VP8L") return 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]);
  }
  if (type === "image/jpeg") {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return v.getUint16(i + 7);
      i += 2 + v.getUint16(i + 2);
    }
  }
  return null;
}

function sniffType(bytes: Uint8Array, declared: string) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  const text = new TextDecoder().decode(bytes.slice(0, 1000)).trimStart().toLowerCase();
  if (declared === "image/svg+xml" || text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"))) return "image/svg+xml";
  return null;
}

/** Télécharge une image et vérifie qu'elle est utilisable comme logo (format réel, poids, SVG sans script). */
export async function downloadLogo(url: string): Promise<FoundLogo> {
  const { url: final, bytes, type: declared } = await safeGet(url, MAX_LOGO);
  const type = sniffType(bytes, declared);
  if (!type || !LOGO_TYPES.includes(type)) throw new Error("Format d'image non pris en charge.");
  if (type === "image/svg+xml") {
    const svg = new TextDecoder().decode(bytes).toLowerCase();
    if (/<script|\bon[a-z]+\s*=|javascript:|<foreignobject/.test(svg)) throw new Error("SVG refusé.");
  }
  return { url: final.toString(), type, bytes, width: type === "image/svg+xml" ? 512 : imageWidth(bytes, type) };
}

export async function findSiteLogo(site: string): Promise<FoundLogo> {
  const base = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`);
  const candidates: Candidate[] = [];
  try {
    const page = await safeGet(base.toString(), MAX_HTML);
    const html = new TextDecoder().decode(page.bytes);
    const { icons, manifest } = logoCandidates(html, page.url);
    candidates.push(...icons);
    if (manifest) {
      try {
        const m = await safeGet(manifest, 200_000);
        const json = JSON.parse(new TextDecoder().decode(m.bytes)) as { icons?: { src?: string; sizes?: string; purpose?: string }[] };
        for (const icon of json.icons ?? []) {
          if (icon.src && !(icon.purpose ?? "").includes("monochrome")) {
            candidates.push({ href: new URL(icon.src, m.url).toString(), size: largestSize(icon.sizes ?? null), rank: 2 });
          }
        }
      } catch {
        // Manifeste illisible : on continue avec les autres icônes.
      }
    }
  } catch {
    // Page d'accueil inaccessible : seul le service d'icônes reste possible.
  }
  // Icônes déclarées (les plus grandes d'abord), puis le service d'icônes de Google, puis l'image de partage
  // (souvent un bandeau, donc en dernier).
  const ordered = [
    ...candidates.filter((c) => c.rank > 0).sort((a, b) => b.size - a.size || b.rank - a.rank),
    { href: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(base.hostname)}&sz=256`, size: 0, rank: -1 },
    ...candidates.filter((c) => c.rank === 0),
  ].filter((c, i, all) => all.findIndex((o) => o.href === c.href) === i);

  let fallback: FoundLogo | null = null;
  for (const c of ordered.slice(0, 8)) {
    try {
      const logo = await downloadLogo(c.href);
      // Une petite favicon (moins de 64 px) ne sert qu'en dernier recours.
      if (logo.width !== null && logo.width < 64) {
        if (!fallback || (fallback.width ?? 0) < logo.width) fallback = logo;
        continue;
      }
      return logo;
    } catch {
      // Candidat suivant.
    }
  }
  if (fallback && (fallback.width ?? 0) >= 32) return fallback;
  throw new Error("Aucun logo trouvé sur ce site.");
}
