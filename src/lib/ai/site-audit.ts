import "server-only";

/**
 * Lecture SEO d'une page des sites de Bastien (et uniquement de ceux-là : pas de navigation libre sur le web).
 * Retourne ce que Google voit : titre, description, titres, balises techniques, robots.txt et sitemap.
 */

const MAX_BYTES = 1_500_000;

const hostOf = (url: string) => {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** Récupère une URL en suivant les redirections, sans jamais sortir des domaines autorisés. */
async function fetchAllowed(url: string, allowed: Set<string>) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const host = hostOf(current);
    if (!host || !allowed.has(host)) throw new Error(`Domaine non autorisé : ${current}. Seuls les sites des business du panel peuvent être analysés.`);
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "bastienryser.space-audit/1.0", Accept: "text/html,application/xhtml+xml,text/plain,*/*" },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    const reader = res.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (reader) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      size += value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    return { url: current, status: res.status, redirected: current !== url, text, headers: res.headers };
  }
  throw new Error("Trop de redirections.");
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const strip = (html: string) => decode(html.replace(/<[^>]+>/g, " "));

function meta(html: string, key: string) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "") : null;
}

export async function auditPage(url: string, websites: string[]) {
  const allowed = new Set(websites.map(hostOf).filter((h): h is string => Boolean(h)));
  const target = url.startsWith("http") ? url : `https://${url}`;
  const page = await fetchAllowed(target, allowed);
  const html = page.text;
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ");
  const headings = (tag: string) => [...body.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))].map((m) => strip(m[1])).filter(Boolean);
  const images = [...body.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const links = [...body.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
  const origin = new URL(page.url).origin;
  const internal = links.filter((l) => l.startsWith("/") || l.startsWith(origin)).length;
  const jsonLd = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].flatMap((m) => {
    try {
      const data = JSON.parse(m[1]);
      const list = Array.isArray(data) ? data : data["@graph"] ?? [data];
      return list.map((d: { "@type"?: string | string[] }) => d["@type"]).flat().filter(Boolean);
    } catch {
      return ["(JSON-LD invalide)"];
    }
  });
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const words = strip(body.match(/<body[\s\S]*<\/body>/i)?.[0] ?? body).split(" ").filter((w) => w.length > 1).length;

  const result: Record<string, unknown> = {
    url_finale: page.url,
    statut_http: page.status,
    redirige: page.redirected,
    titre: title ? decode(title) : null,
    longueur_titre: title ? decode(title).length : 0,
    meta_description: meta(html, "description"),
    meta_robots: meta(html, "robots"),
    x_robots_tag: page.headers.get("x-robots-tag"),
    canonical: html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? null,
    langue: html.match(/<html[^>]*\blang=["']([^"']+)["']/i)?.[1] ?? null,
    viewport_mobile: /<meta[^>]+name=["']viewport["']/i.test(html),
    og_titre: meta(html, "og:title"),
    og_image: meta(html, "og:image"),
    h1: headings("h1").slice(0, 5),
    h2: headings("h2").slice(0, 15),
    nombre_mots: words,
    images: images.length,
    images_sans_alt: images.filter((i) => !/\balt=["'][^"']+["']/i.test(i)).length,
    liens_internes: internal,
    liens_externes: links.length - internal,
    donnees_structurees: jsonLd,
  };

  // À la racine du site : robots.txt et sitemap.
  if (new URL(page.url).pathname === "/") {
    const robots = await fetchAllowed(`${origin}/robots.txt`, allowed).catch(() => null);
    result.robots_txt = robots && robots.status === 200 ? robots.text.slice(0, 1500) : `absent (${robots?.status ?? "inaccessible"})`;
    const sitemapUrl = (robots?.text.match(/^sitemap:\s*(\S+)/im)?.[1] ?? `${origin}/sitemap.xml`).trim();
    const sitemap = await fetchAllowed(sitemapUrl, allowed).catch(() => null);
    result.sitemap = sitemap && sitemap.status === 200 ? { url: sitemapUrl, urls: (sitemap.text.match(/<loc>/g) ?? []).length } : `absent (${sitemap?.status ?? "inaccessible"})`;
  }
  return result;
}
