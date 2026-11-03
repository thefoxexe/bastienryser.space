// Mise en forme de l'export Search Console (Edge Function `connectors`, action `gsc_export`) :
// un rapport Markdown prêt à donner à un agent SEO, et des CSV complets. Aucun chiffre calculé n'est estimé :
// tout vient des lignes renvoyées par Google (sommes, moyennes pondérées par les impressions, écarts).

export type Row = (string | number)[];

export type GscExport = {
  site: string;
  generated_at: string;
  last_day: string;
  windows: Record<"d90" | "d28" | "prev28", { startDate: string; endDate: string }>;
  daily: Row[];
  queries_90d: Row[];
  queries_28d: Row[];
  queries_prev_28d: Row[];
  pages_90d: Row[];
  pages_28d: Row[];
  pages_prev_28d: Row[];
  query_page_90d: Row[];
  countries_90d: Row[];
  devices_90d: Row[];
  appearance_90d: Row[];
};

type Stat = { clicks: number; impressions: number; ctr: number; position: number };

/** Lignes compactes [clés…, clics, impressions, ctr %, position] → clé jointe par « ␟ » et chiffres. */
function parse(rows: Row[], keys = 1): Map<string, Stat> {
  const out = new Map<string, Stat>();
  for (const r of rows) {
    const key = r.slice(0, keys).join("␟");
    const [clicks, impressions, ctr, position] = r.slice(keys).map(Number);
    out.set(key, { clicks, impressions, ctr, position });
  }
  return out;
}

function totals(stats: Iterable<Stat>) {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const s of stats) {
    clicks += s.clicks;
    impressions += s.impressions;
    weighted += s.position * s.impressions;
  }
  return { clicks, impressions, ctr: impressions ? (clicks / impressions) * 100 : 0, position: impressions ? weighted / impressions : null };
}

const n = (v: number) => Math.round(v).toLocaleString("fr-CH");
const p1 = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? "—" : (Math.round(v * 10) / 10).toLocaleString("fr-CH"));
const pct = (v: number) => `${(Math.round(v * 100) / 100).toLocaleString("fr-CH")} %`;
const delta = (now: number, before: number) => (before ? `${now >= before ? "+" : ""}${Math.round(((now - before) / before) * 100)} %` : now ? "nouveau" : "—");
const posDelta = (now: number | undefined, before: number | undefined) =>
  now === undefined || before === undefined ? "—" : `${now - before <= 0 ? "" : "+"}${p1(now - before)}`;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function table(head: string[], rows: string[][]) {
  if (!rows.length) return "_Aucune donnée._\n";
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n") + "\n";
}

/** Section d'une URL : langue (/de, /it, /en…) puis premier segment (/blog, /aide…). */
function section(url: string) {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* clé déjà relative */
  }
  const parts = path.split("/").filter(Boolean);
  const lang = /^[a-z]{2}$/.test(parts[0] ?? "") ? parts.shift()! : "fr (défaut)";
  return `${lang} · /${parts[0] ?? ""}`;
}

const shortUrl = (url: string, site: string) => {
  const base = site.replace(/^sc-domain:/, "https://").replace(/\/$/, "");
  return url.startsWith(base) ? url.slice(base.length) || "/" : url;
};

export function searchConsoleReport(data: GscExport, options: { business: string; brand: string[] }) {
  const brand = new RegExp(options.brand.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") || "^$", "i");
  const q90 = parse(data.queries_90d);
  const q28 = parse(data.queries_28d);
  const qPrev = parse(data.queries_prev_28d);
  const pg90 = parse(data.pages_90d);
  const pg28 = parse(data.pages_28d);
  const pgPrev = parse(data.pages_prev_28d);
  const qp = parse(data.query_page_90d, 2);
  const daily = parse(data.daily);
  const site = data.site;
  const out: string[] = [];

  const all = totals(daily.values());
  const days = [...daily.keys()].sort();
  const inRange = (from: string, to: string) => totals([...daily.entries()].filter(([d]) => d >= from && d <= to).map(([, s]) => s));
  const t90 = inRange(data.windows.d90.startDate, data.windows.d90.endDate);
  const t28 = inRange(data.windows.d28.startDate, data.windows.d28.endDate);
  const tPrev = inRange(data.windows.prev28.startDate, data.windows.prev28.endDate);

  out.push(`# Export Search Console · ${options.business} (${site})`);
  out.push("");
  out.push(`Données réelles de Google Search Console (API), extraites le ${data.generated_at.slice(0, 10)}. Dernier jour disponible : ${data.last_day} (Google a 2 à 3 jours de décalage).`);
  out.push("");
  out.push("- **Clics** : visites venues de Google. **Impressions** : affichages dans les résultats. **CTR** : clics ÷ impressions. **Position** : moyenne pondérée par les impressions (1 = premier résultat).");
  out.push("- Google masque les requêtes très rares (anonymisées) : la somme des requêtes est inférieure au total du site. Les totaux du site viennent de la série par jour.");
  out.push(`- Fenêtres : 90 jours = ${data.windows.d90.startDate} → ${data.windows.d90.endDate} ; 28 jours = ${data.windows.d28.startDate} → ${data.windows.d28.endDate} ; 28 jours précédents = ${data.windows.prev28.startDate} → ${data.windows.prev28.endDate}.`);
  out.push(`- Marque (requêtes contenant : ${options.brand.join(", ")}) séparée du reste.`);
  out.push("");

  // 1. Synthèse
  const brandSplit = (m: Map<string, Stat>) => {
    const b = totals([...m.entries()].filter(([k]) => brand.test(k)).map(([, s]) => s));
    const o = totals([...m.entries()].filter(([k]) => !brand.test(k)).map(([, s]) => s));
    return { b, o };
  };
  const split28 = brandSplit(q28);
  const splitPrev = brandSplit(qPrev);
  const split90 = brandSplit(q90);
  out.push("## 1. Synthèse");
  out.push("");
  out.push(
    table(
      ["Période", "Clics", "Impressions", "CTR", "Position"],
      [
        [`Tout l'historique (${days[0] ?? "—"} → ${days.at(-1) ?? "—"})`, n(all.clicks), n(all.impressions), pct(all.ctr), p1(all.position)],
        ["90 derniers jours", n(t90.clicks), n(t90.impressions), pct(t90.ctr), p1(t90.position)],
        ["28 derniers jours", n(t28.clicks), n(t28.impressions), pct(t28.ctr), p1(t28.position)],
        ["28 jours précédents", n(tPrev.clicks), n(tPrev.impressions), pct(tPrev.ctr), p1(tPrev.position)],
        ["Évolution 28 j", delta(t28.clicks, tPrev.clicks), delta(t28.impressions, tPrev.impressions), "", posDelta(t28.position ?? undefined, tPrev.position ?? undefined)],
      ],
    ),
  );
  out.push("**Marque / hors marque** (somme des requêtes visibles) :");
  out.push("");
  out.push(
    table(
      ["Période", "Clics marque", "Clics hors marque", "Impressions hors marque", "Position hors marque", "Requêtes hors marque"],
      [
        ["90 jours", n(split90.b.clicks), n(split90.o.clicks), n(split90.o.impressions), p1(split90.o.position), n([...q90.keys()].filter((k) => !brand.test(k)).length)],
        ["28 jours", n(split28.b.clicks), n(split28.o.clicks), n(split28.o.impressions), p1(split28.o.position), n([...q28.keys()].filter((k) => !brand.test(k)).length)],
        ["28 jours précédents", n(splitPrev.b.clicks), n(splitPrev.o.clicks), n(splitPrev.o.impressions), p1(splitPrev.o.position), n([...qPrev.keys()].filter((k) => !brand.test(k)).length)],
      ],
    ),
  );

  // 2. Évolution
  const months = new Map<string, Stat[]>();
  const weeks = new Map<string, Stat[]>();
  for (const [d, s] of daily) {
    const m = d.slice(0, 7);
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(s);
    const date = new Date(`${d}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const wk = date.toISOString().slice(0, 10);
    if (!weeks.has(wk)) weeks.set(wk, []);
    weeks.get(wk)!.push(s);
  }
  out.push("## 2. Évolution");
  out.push("");
  out.push("### Par mois");
  out.push("");
  out.push(table(["Mois", "Clics", "Impressions", "CTR", "Position"], [...months.entries()].sort().map(([m, list]) => { const t = totals(list); return [m, n(t.clicks), n(t.impressions), pct(t.ctr), p1(t.position)]; })));
  out.push("### Par semaine (13 dernières, semaine commençant le lundi)");
  out.push("");
  out.push(table(["Semaine du", "Jours", "Clics", "Impressions", "CTR", "Position"], [...weeks.entries()].sort().slice(-13).map(([w, list]) => { const t = totals(list); return [w, String(list.length), n(t.clicks), n(t.impressions), pct(t.ctr), p1(t.position)]; })));

  // Jours anormaux : clics très au-dessus de la médiane des 90 derniers jours.
  const recent = [...daily.entries()].filter(([d]) => d >= data.windows.d90.startDate).map(([d, s]) => ({ d, ...s }));
  const sorted = recent.map((r) => r.clicks).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const spikes = recent.filter((r) => r.clicks >= Math.max(10, median * 5));
  out.push("### Jours anormaux (90 jours)");
  out.push("");
  out.push(
    spikes.length
      ? `Médiane : ${n(median)} clic(s) par jour. Ces jours dépassent 5 fois la médiane (au moins 10 clics) : à vérifier avant de conclure (tests, robots, campagne, pic réel).\n\n` +
          table(["Jour", "Clics", "Impressions", "Position"], spikes.map((r) => [r.d, n(r.clicks), n(r.impressions), p1(r.position)]))
      : `_Aucun jour anormal (médiane : ${n(median)} clic(s) par jour)._\n`,
  );

  // 3. Sections du site
  const sections = new Map<string, Stat[]>();
  for (const [url, s] of pg90) {
    const key = section(url);
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(s);
  }
  out.push("## 3. Sections du site (90 jours)");
  out.push("");
  out.push("Langue puis premier dossier de l'URL. Nombre de pages = pages ayant reçu au moins une impression.");
  out.push("");
  out.push(
    table(
      ["Section", "Pages", "Clics", "Impressions", "CTR", "Position"],
      [...sections.entries()]
        .map(([k, list]) => ({ k, list, t: totals(list) }))
        .sort((a, b) => b.t.impressions - a.t.impressions)
        .map(({ k, list, t }) => [k, String(list.length), n(t.clicks), n(t.impressions), pct(t.ctr), p1(t.position)]),
    ),
  );

  // 4. Pages
  const pages = [...pg90.entries()].sort((a, b) => b[1].impressions - a[1].impressions);
  out.push(`## 4. Pages (90 jours, ${pages.length} pages avec impressions${pages.length > 300 ? ", 300 premières par impressions ; liste complète dans le CSV" : ""})`);
  out.push("");
  out.push(
    table(
      ["Page", "Clics 90 j", "Impr. 90 j", "CTR", "Pos. 90 j", "Clics 28 j", "Clics 28 j préc.", "Impr. 28 j", "Impr. 28 j préc.", "Pos. 28 j", "Pos. préc.", "Δ pos."],
      pages.slice(0, 300).map(([url, s]) => {
        const a = pg28.get(url);
        const b = pgPrev.get(url);
        return [shortUrl(url, site), n(s.clicks), n(s.impressions), pct(s.ctr), p1(s.position), n(a?.clicks ?? 0), n(b?.clicks ?? 0), n(a?.impressions ?? 0), n(b?.impressions ?? 0), p1(a?.position), p1(b?.position), posDelta(a?.position, b?.position)];
      }),
    ),
  );

  // 5. Requêtes
  const queries = [...q90.entries()].sort((a, b) => b[1].impressions - a[1].impressions);
  const topPage = new Map<string, { page: string; impressions: number; count: number }>();
  for (const [key, s] of qp) {
    const [q, page] = key.split("␟");
    const cur = topPage.get(q);
    if (!cur) topPage.set(q, { page, impressions: s.impressions, count: 1 });
    else {
      cur.count++;
      if (s.impressions > cur.impressions) Object.assign(cur, { page, impressions: s.impressions });
    }
  }
  out.push(`## 5. Requêtes (90 jours, ${queries.length} requêtes visibles${queries.length > 300 ? ", 300 premières par impressions ; liste complète dans le CSV" : ""})`);
  out.push("");
  out.push(
    table(
      ["Requête", "Marque", "Clics 90 j", "Impr. 90 j", "CTR", "Pos. 90 j", "Pos. 28 j", "Pos. préc.", "Δ pos.", "Impr. 28 j", "Page principale", "Nb pages"],
      queries.slice(0, 300).map(([q, s]) => {
        const a = q28.get(q);
        const b = qPrev.get(q);
        const tp = topPage.get(q);
        return [q, brand.test(q) ? "oui" : "", n(s.clicks), n(s.impressions), pct(s.ctr), p1(s.position), p1(a?.position), p1(b?.position), posDelta(a?.position, b?.position), n(a?.impressions ?? 0), tp ? shortUrl(tp.page, site) : "—", String(tp?.count ?? "—")];
      }),
    ),
  );

  // 6. Opportunités
  const nonBrand = queries.filter(([q]) => !brand.test(q));
  const quick = nonBrand.filter(([, s]) => s.position >= 3.5 && s.position <= 15 && s.impressions >= 10).sort((a, b) => b[1].impressions - a[1].impressions);
  const push = nonBrand.filter(([, s]) => s.position > 15 && s.position <= 30 && s.impressions >= 15).sort((a, b) => b[1].impressions - a[1].impressions);
  out.push("## 6. Opportunités (hors marque, 90 jours)");
  out.push("");
  out.push("### Presque en tête : position 3,5 à 15, au moins 10 impressions");
  out.push("Gain rapide : title, meta description, contenu et liens internes de la page principale.");
  out.push("");
  out.push(table(["Requête", "Impr.", "Clics", "CTR", "Pos.", "Page principale"], quick.slice(0, 80).map(([q, s]) => [q, n(s.impressions), n(s.clicks), pct(s.ctr), p1(s.position), topPage.get(q) ? shortUrl(topPage.get(q)!.page, site) : "—"])));
  out.push("### À pousser : position 15 à 30, au moins 15 impressions");
  out.push("Page à renforcer ou à créer (contenu dédié, maillage, liens entrants).");
  out.push("");
  out.push(table(["Requête", "Impr.", "Clics", "Pos.", "Page principale"], push.slice(0, 80).map(([q, s]) => [q, n(s.impressions), n(s.clicks), p1(s.position), topPage.get(q) ? shortUrl(topPage.get(q)!.page, site) : "—"])));

  // 7. Mouvements
  const moves = [...q28.entries()]
    .filter(([q, s]) => qPrev.has(q) && s.impressions + qPrev.get(q)!.impressions >= 8)
    .map(([q, s]) => ({ q, s, b: qPrev.get(q)!, d: s.position - qPrev.get(q)!.position }));
  const fresh = [...q28.entries()].filter(([q]) => !qPrev.has(q)).sort((a, b) => b[1].impressions - a[1].impressions);
  const lost = [...qPrev.entries()].filter(([q]) => !q28.has(q)).sort((a, b) => b[1].impressions - a[1].impressions);
  out.push("## 7. Mouvements (28 derniers jours / 28 précédents)");
  out.push("");
  out.push("### Plus fortes hausses de position (au moins 8 impressions sur les deux périodes)");
  out.push("");
  out.push(table(["Requête", "Pos. préc.", "Pos. 28 j", "Δ", "Impr. 28 j", "Clics 28 j"], moves.filter((m) => m.d <= -2).sort((a, b) => a.d - b.d).slice(0, 40).map((m) => [m.q, p1(m.b.position), p1(m.s.position), p1(m.d), n(m.s.impressions), n(m.s.clicks)])));
  out.push("### Plus fortes baisses de position");
  out.push("");
  out.push(table(["Requête", "Pos. préc.", "Pos. 28 j", "Δ", "Impr. 28 j", "Clics 28 j"], moves.filter((m) => m.d >= 2).sort((a, b) => b.d - a.d).slice(0, 40).map((m) => [m.q, p1(m.b.position), p1(m.s.position), `+${p1(m.d)}`, n(m.s.impressions), n(m.s.clicks)])));
  out.push(`### Nouvelles requêtes (absentes les 28 jours précédents : ${fresh.length})`);
  out.push("");
  out.push(table(["Requête", "Impr.", "Clics", "Pos."], fresh.slice(0, 50).map(([q, s]) => [q, n(s.impressions), n(s.clicks), p1(s.position)])));
  out.push(`### Requêtes disparues (présentes avant, absentes ces 28 jours : ${lost.length})`);
  out.push("");
  out.push(table(["Requête", "Impr. préc.", "Clics préc.", "Pos. préc."], lost.slice(0, 40).map(([q, s]) => [q, n(s.impressions), n(s.clicks), p1(s.position)])));

  // 8. Cannibalisation
  const byQuery = new Map<string, { page: string; s: Stat }[]>();
  for (const [key, s] of qp) {
    const [q, page] = key.split("␟");
    if (s.impressions < 3) continue;
    if (!byQuery.has(q)) byQuery.set(q, []);
    byQuery.get(q)!.push({ page, s });
  }
  const cannibal = [...byQuery.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([q, list]) => ({ q, list: list.sort((a, b) => b.s.impressions - a.s.impressions), impressions: list.reduce((a, x) => a + x.s.impressions, 0) }))
    .sort((a, b) => b.impressions - a.impressions);
  out.push(`## 8. Cannibalisation (90 jours) : requêtes où plusieurs pages se partagent les impressions (${cannibal.length})`);
  out.push("");
  out.push("Chaque page listée a au moins 3 impressions sur la requête. À trancher : une page principale, les autres fusionnées ou recentrées.");
  out.push("");
  out.push(table(["Requête", "Impr. totales", "Pages (impressions · position)"], cannibal.slice(0, 60).map((c) => [c.q, n(c.impressions), c.list.slice(0, 5).map((x) => `${shortUrl(x.page, site)} (${n(x.s.impressions)} · ${p1(x.s.position)})`).join(" ; ")])));

  // 9. Requête × page
  const pairs = [...qp.entries()].sort((a, b) => b[1].impressions - a[1].impressions);
  out.push(`## 9. Requête × page (90 jours, ${pairs.length} couples${pairs.length > 300 ? ", 300 premiers ; liste complète dans le CSV" : ""})`);
  out.push("");
  out.push(table(["Requête", "Page", "Clics", "Impr.", "CTR", "Pos."], pairs.slice(0, 300).map(([k, s]) => { const [q, page] = k.split("␟"); return [q, shortUrl(page, site), n(s.clicks), n(s.impressions), pct(s.ctr), p1(s.position)]; })));

  // 10. Pays, appareils, apparences
  const simple = (title: string, rows: Row[], label: string) => {
    out.push(`### ${title}`);
    out.push("");
    out.push(table([label, "Clics", "Impressions", "CTR", "Position"], [...parse(rows).entries()].sort((a, b) => b[1].impressions - a[1].impressions).slice(0, 25).map(([k, s]) => [k, n(s.clicks), n(s.impressions), pct(s.ctr), p1(s.position)])));
  };
  out.push("## 10. Audience (90 jours)");
  out.push("");
  simple("Pays (code ISO à 3 lettres)", data.countries_90d, "Pays");
  simple("Appareils", data.devices_90d, "Appareil");
  simple("Apparences dans les résultats", data.appearance_90d, "Apparence");

  return out.join("\n");
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (head: string[], rows: (string | number)[][]) => [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

/** CSV complets (sans plafond) : requêtes, pages, requête × page, par jour. */
export function searchConsoleCsv(data: GscExport) {
  const q28 = parse(data.queries_28d);
  const qPrev = parse(data.queries_prev_28d);
  const pg28 = parse(data.pages_28d);
  const pgPrev = parse(data.pages_prev_28d);
  return {
    "requetes.csv": csv(
      ["requete", "clics_90j", "impressions_90j", "ctr_90j", "position_90j", "clics_28j", "impressions_28j", "position_28j", "clics_28j_prec", "impressions_28j_prec", "position_28j_prec"],
      [...parse(data.queries_90d).entries()].sort((a, b) => b[1].impressions - a[1].impressions).map(([q, s]) => {
        const a = q28.get(q);
        const b = qPrev.get(q);
        return [q, s.clicks, s.impressions, s.ctr, s.position, a?.clicks ?? 0, a?.impressions ?? 0, a?.position ?? "", b?.clicks ?? 0, b?.impressions ?? 0, b?.position ?? ""];
      }),
    ),
    "pages.csv": csv(
      ["page", "clics_90j", "impressions_90j", "ctr_90j", "position_90j", "clics_28j", "impressions_28j", "position_28j", "clics_28j_prec", "impressions_28j_prec", "position_28j_prec"],
      [...parse(data.pages_90d).entries()].sort((a, b) => b[1].impressions - a[1].impressions).map(([p, s]) => {
        const a = pg28.get(p);
        const b = pgPrev.get(p);
        return [p, s.clicks, s.impressions, s.ctr, s.position, a?.clicks ?? 0, a?.impressions ?? 0, a?.position ?? "", b?.clicks ?? 0, b?.impressions ?? 0, b?.position ?? ""];
      }),
    ),
    "requete-page.csv": csv(["requete", "page", "clics_90j", "impressions_90j", "ctr_90j", "position_90j"], [...data.query_page_90d].sort((a, b) => Number(b[3]) - Number(a[3]))),
    "jours.csv": csv(["jour", "clics", "impressions", "ctr", "position"], [...data.daily].sort((a, b) => String(a[0]).localeCompare(String(b[0])))),
  };
}
