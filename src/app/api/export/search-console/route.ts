import { isAdmin } from "@/lib/auth";
import { listBusinesses } from "@/lib/data";
import { callEdgeFunction } from "@/lib/edge";
import { searchConsoleCsv, searchConsoleReport, type GscExport } from "@/lib/gsc-report";

export const maxDuration = 120;

const FILES = ["requetes", "pages", "requete-page", "jours"] as const;

/**
 * Export Search Console d'un business, en direct depuis Google :
 * `?slug=cantia` → rapport Markdown ; `&format=requetes|pages|requete-page|jours` → CSV complet.
 */
export async function GET(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Non autorisé." }, { status: 401 });
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? "";
  const format = url.searchParams.get("format") ?? "md";
  const business = (await listBusinesses()).find((b) => b.slug === slug);
  if (!business) return Response.json({ error: "Business introuvable." }, { status: 404 });

  const res = await callEdgeFunction<{ ok: boolean; data?: GscExport; error?: string }>("connectors", { action: "gsc_export", business_id: business.id }, 110_000);
  if (!res?.ok || !res.data) return Response.json({ error: res?.error ?? "Export impossible pour le moment." }, { status: 502 });

  const day = res.data.last_day;
  if ((FILES as readonly string[]).includes(format)) {
    const body = searchConsoleCsv(res.data)[`${format}.csv` as keyof ReturnType<typeof searchConsoleCsv>];
    return new Response(body, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="search-console-${slug}-${format}-${day}.csv"`, "Cache-Control": "no-store" },
    });
  }
  // La marque : le nom du business et ses domaines, sans l'extension.
  const brand = [...new Set([business.name, business.slug, ...business.websites.map((w) => w.replace(/^https?:\/\/(www\.)?/, "").split(/[./]/)[0])].map((s) => s.toLowerCase()).filter((s) => s.length >= 3))];
  const body = searchConsoleReport(res.data, { business: business.name, brand });
  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="search-console-${slug}-${day}.md"`, "Cache-Control": "no-store" },
  });
}
