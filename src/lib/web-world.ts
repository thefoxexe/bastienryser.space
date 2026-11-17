import "server-only";
import { listConnectors } from "@/lib/metrics";
import type { Business } from "@/lib/types";

/**
 * « Monde » d'un site sur Google : ses pages (continents, regroupés par rubrique) et les recherches pour lesquelles
 * Google les montre (satellites). Chiffres réels de la Search Console sur 90 jours ; pages lues dans le sitemap.
 */

export type WorldQuery = { q: string; clicks: number; impressions: number; position: number; page: string };
export type WorldPage = { path: string; url: string; section: string; clicks: number; impressions: number; position: number | null; inGoogle: boolean };
export type WorldSection = { name: string; clicks: number; impressions: number; pages: number };
export type World = {
  slug: string;
  name: string;
  color: string;
  domain: string;
  period: string;
  totals: { impressions: number; clicks: number; queries: number; top10: number; pages: number; unseen: number; position: number | null };
  sections: WorldSection[];
  pages: WorldPage[];
  queries: WorldQuery[];
};

type Pair = [string, string, number, number, number];
type PageRow = [string, number, number, number];

/** Adresse de page sans protocole, « www », barre finale ni paramètres : la même page n'apparaît qu'une fois. */
function normalize(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, "") || "/";
    return { key: `${host}${path}`, host, path };
  } catch {
    return null;
  }
}

/** Rubrique d'une page : sous-domaine, puis premier dossier de l'adresse. */
function sectionOf(host: string, mainHost: string, path: string) {
  const sub = host !== mainHost && host.endsWith(`.${mainHost}`) ? host.slice(0, -mainHost.length - 1) : host !== mainHost ? host : "";
  const first = path.split("/").filter(Boolean)[0] ?? "";
  // Préfixes de langue : on regarde le dossier suivant.
  const parts = path.split("/").filter(Boolean);
  const lang = /^(fr|de|it|en)$/.test(first) ? first : "";
  const folder = (lang ? parts[1] : parts[0]) ?? "";
  const name = folder ? folder.replace(/[-_]+/g, " ") : "accueil";
  return [sub, lang, name].filter(Boolean).join(" · ");
}

/** Toutes les adresses du sitemap (et de ses sous-sitemaps, 6 au plus), relu une fois par jour. */
async function sitemapUrls(site: string): Promise<string[]> {
  const read = async (url: string) => {
    try {
      const res = await fetch(url, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000), headers: { Accept: "application/xml,text/xml" } });
      if (!res.ok) return "";
      return await res.text();
    } catch {
      return "";
    }
  };
  const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  let origin: string;
  try {
    origin = new URL(site).origin;
  } catch {
    return [];
  }
  const root = await read(`${origin}/sitemap.xml`);
  if (!root) return [];
  if (!root.includes("<sitemapindex")) return locs(root);
  const children = locs(root).slice(0, 6);
  return (await Promise.all(children.map(read))).flatMap(locs);
}

export type WorldSource = { period: string; pairs: Pair[]; pages: PageRow[] };

export async function businessWorld(business: Business): Promise<World | null> {
  const gsc = (await listConnectors(business.id)).find((c) => c.kind === "search_console" && c.status === "connected");
  const world = (gsc?.snapshot as { world?: WorldSource } | undefined)?.world;
  if (!gsc || !world) return null;
  const mainUrl = business.websites[0] ?? (gsc.config.site_url ?? "").replace(/^sc-domain:/, "https://");
  const sitemap = (await Promise.all(business.websites.slice(0, 4).map(sitemapUrls))).flat();
  return buildWorld(business, mainUrl, world, sitemap);
}

/** Construit le monde à partir du relevé Search Console et des adresses du sitemap (sans accès réseau). */
export function buildWorld(business: Pick<Business, "slug" | "name" | "color">, mainUrl: string, world: WorldSource, sitemap: string[]): World {
  const mainHost = normalize(mainUrl)?.host ?? "";

  // Pages vues par Google, fusionnées (avec ou sans barre finale…).
  const pages = new Map<string, WorldPage & { weighted: number }>();
  const upsert = (url: string) => {
    const n = normalize(url);
    if (!n) return null;
    if (!pages.has(n.key)) {
      pages.set(n.key, { path: n.host === mainHost ? n.path : `${n.host}${n.path === "/" ? "" : n.path}`, url, section: sectionOf(n.host, mainHost, n.path), clicks: 0, impressions: 0, position: null, inGoogle: false, weighted: 0 });
    }
    return pages.get(n.key)!;
  };
  for (const [url, clicks, impressions, position] of world.pages) {
    const p = upsert(url);
    if (!p) continue;
    p.clicks += clicks;
    p.impressions += impressions;
    p.weighted += position * impressions;
    p.inGoogle = true;
  }

  // Recherches : chacune rattachée à la page que Google montre le plus pour elle.
  const queries = new Map<string, { q: string; clicks: number; impressions: number; weighted: number; best: { key: string; impressions: number } }>();
  for (const [q, url, clicks, impressions, position] of world.pairs) {
    const n = normalize(url);
    if (!n) continue;
    upsert(url);
    const e = queries.get(q) ?? { q, clicks: 0, impressions: 0, weighted: 0, best: { key: n.key, impressions: -1 } };
    e.clicks += clicks;
    e.impressions += impressions;
    e.weighted += position * impressions;
    if (impressions > e.best.impressions) e.best = { key: n.key, impressions };
    queries.set(q, e);
  }

  // Pages du sitemap que Google ne montre jamais : les zones mortes.
  for (const url of sitemap) upsert(url);

  const pageList = [...pages.values()].map(({ weighted, ...p }) => ({ ...p, position: p.impressions ? Math.round((weighted / p.impressions) * 10) / 10 : null }));
  const pathByKey = new Map([...pages.entries()].map(([k, v]) => [k, v.path]));

  const queryList: WorldQuery[] = [...queries.values()]
    .map((e) => ({ q: e.q, clicks: e.clicks, impressions: e.impressions, position: Math.round((e.weighted / Math.max(e.impressions, 1)) * 10) / 10, page: pathByKey.get(e.best.key) ?? "/" }))
    .sort((a, b) => b.impressions - a.impressions);

  // Rubriques (continents) : toutes les pages, vues ou non par Google.
  const sections = new Map<string, WorldSection>();
  for (const p of pageList) {
    const s = sections.get(p.section) ?? { name: p.section, clicks: 0, impressions: 0, pages: 0 };
    s.clicks += p.clicks;
    s.impressions += p.impressions;
    s.pages++;
    sections.set(p.section, s);
  }
  const sectionList = [...sections.values()].sort((a, b) => b.impressions - a.impressions || b.pages - a.pages);

  // Pour l'affichage : les pages qui comptent, et une partie des pages invisibles.
  const shown = [...pageList.filter((p) => p.inGoogle).sort((a, b) => b.impressions - a.impressions).slice(0, 140), ...pageList.filter((p) => !p.inGoogle).slice(0, 60)];
  const totalImpr = queryList.reduce((a, q) => a + q.impressions, 0);
  const weightedPos = queryList.reduce((a, q) => a + q.position * q.impressions, 0);

  return {
    slug: business.slug,
    name: business.name,
    color: business.color,
    domain: mainHost,
    period: world.period,
    totals: {
      impressions: pageList.reduce((a, p) => a + p.impressions, 0),
      clicks: pageList.reduce((a, p) => a + p.clicks, 0),
      queries: queryList.length,
      top10: queryList.filter((q) => q.position <= 10).length,
      pages: pageList.length,
      unseen: pageList.filter((p) => !p.inGoogle).length,
      position: totalImpr ? Math.round((weightedPos / totalImpr) * 10) / 10 : null,
    },
    sections: sectionList,
    pages: shown,
    queries: queryList.slice(0, 600),
  };
}

export async function allWorlds(businesses: Business[]) {
  return (await Promise.all(businesses.map(businessWorld))).filter((w): w is World => w !== null);
}
