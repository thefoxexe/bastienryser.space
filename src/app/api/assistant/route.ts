import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claude, friendlyError, MODEL, NO_KEY, textOf } from "@/lib/ai/claude";
import { businessDigest, DIGEST_GUIDE } from "@/lib/ai/insights";
import { isAdmin } from "@/lib/auth";
import { listBusinesses, listPosts } from "@/lib/data";
import { financeSummary, listEntries } from "@/lib/finance";
import { keywordRankings } from "@/lib/keywords";
import { lastDays } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const Body = z.object({
  slug: z.string().max(80).nullable().optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
});

const METRICS = {
  visiteurs_plausible: "visitors",
  visites_plausible: "visits",
  pages_vues_plausible: "pageviews",
  visiteurs_analytics: "ga_users",
  sessions_analytics: "ga_sessions",
  pages_vues_analytics: "ga_pageviews",
  clics_google: "search_clicks",
  impressions_google: "search_impressions",
  position_google: "search_position",
  encaissements_stripe: "revenue",
  remboursements_stripe: "refunds",
  frais_stripe: "fees",
} as const;

const SYSTEM = `Tu es l'assistant intégré au panel privé de Bastien (bastienryser.space), qui gère ses business suisses : réseaux sociaux, sites web, visites, recherche Google, finances.
Tu réponds à ses questions sur ses chiffres et tu l'aides à comprendre et régler les problèmes.

Règles :
- Français, tutoiement, réponses courtes et concrètes (souvent lues à voix haute) : 2 à 6 phrases, ou une courte liste à tirets si c'est plus clair. Pas d'emoji, pas de titres.
- Va chercher les chiffres avec les outils avant de répondre ; n'invente jamais un chiffre ni une donnée. Si une donnée n'existe pas, dis-le.
- Quand tu identifies un problème, donne la cause probable (annoncée comme probable) et l'action à faire, en citant l'endroit du panel s'il y en a un (Données › Connecteurs, Réseaux sociaux › Comptes…).
- Les business se désignent par leur slug dans les outils ; appelle liste_business si tu ne le connais pas.

${DIGEST_GUIDE}`;

async function businessBySlug(slug: string) {
  const all = await listBusinesses();
  const found = all.find((b) => b.slug === slug) ?? all.find((b) => b.name.toLowerCase().includes(slug.toLowerCase()));
  if (!found) throw new Error(`Business « ${slug} » introuvable. Disponibles : ${all.map((b) => b.slug).join(", ")}.`);
  return found;
}

const tools = [
  betaZodTool({
    name: "liste_business",
    description: "Liste les business gérés dans le panel (nom, slug, sites web).",
    inputSchema: z.object({}),
    run: async () => JSON.stringify((await listBusinesses()).map((b) => ({ name: b.name, slug: b.slug, websites: b.websites, description: b.description }))),
  }),
  betaZodTool({
    name: "analyse_business",
    description:
      "Vue d'ensemble chiffrée d'un business sur une période comparée à la précédente : visites, recherche Google (clics, impressions, position, requêtes qui montent ou baissent, nouvelles requêtes), finances, réseaux, et signaux d'alerte déjà détectés. À appeler en premier pour toute question sur un business.",
    inputSchema: z.object({ slug: z.string(), jours: z.number().int().min(7).max(180).default(28) }),
    run: async ({ slug, jours }) => JSON.stringify(await businessDigest(await businessBySlug(slug), jours)),
  }),
  betaZodTool({
    name: "serie_quotidienne",
    description: "Valeurs jour par jour d'une métrique pour un business (pour voir quand un changement a commencé).",
    inputSchema: z.object({
      slug: z.string(),
      metrique: z.enum(Object.keys(METRICS) as [keyof typeof METRICS, ...(keyof typeof METRICS)[]]),
      jours: z.number().int().min(7).max(400).default(60),
    }),
    run: async ({ slug, metrique, jours }) => {
      const b = await businessBySlug(slug);
      const supabase = await createClient();
      const { data } = await supabase
        .from("metric_points")
        .select("day,value,unit")
        .eq("business_id", b.id)
        .eq("metric", METRICS[metrique])
        .gte("day", lastDays(jours)[0])
        .order("day");
      if (!data?.length) return "Aucune donnée pour cette métrique (source pas connectée ou rien d'enregistré).";
      return JSON.stringify(data.map((p) => ({ day: p.day, value: Number(p.value), unit: p.unit })));
    },
  }),
  betaZodTool({
    name: "requetes_google",
    description:
      "Requêtes Search Console d'un business sur une période : clics, impressions, CTR (en %), position, position de la période précédente. Filtre facultatif sur le texte de la requête (ex. le nom de la marque).",
    inputSchema: z.object({ slug: z.string(), jours: z.number().int().min(7).max(90).default(28), contient: z.string().optional() }),
    run: async ({ slug, jours, contient }) => {
      const b = await businessBySlug(slug);
      const rows = await keywordRankings(b.id, jours);
      const filtered = contient ? rows.filter((r) => r.query.includes(contient.toLowerCase())) : rows;
      if (!filtered.length) return "Aucune requête trouvée.";
      return JSON.stringify(
        filtered.slice(0, 40).map((r) => ({ query: r.query, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position, previous_position: r.prev_position, suivi: r.tracked })),
      );
    },
  }),
  betaZodTool({
    name: "finances",
    description: "Encaissements Stripe et écritures saisies (revenus, charges, virements) d'un business sur une période.",
    inputSchema: z.object({ slug: z.string(), jours: z.number().int().min(7).max(365).default(30) }),
    run: async ({ slug, jours }) => {
      const b = await businessBySlug(slug);
      const [summary, entries] = await Promise.all([financeSummary(b.id, jours), listEntries(b.id, jours)]);
      return JSON.stringify({
        currency: summary.currency,
        totals: summary.totals,
        stripe_connecte: summary.hasStripe,
        ecritures: entries.slice(0, 40).map((e) => ({ day: e.day, kind: e.kind, amount: e.amount, label: e.label, category: e.category })),
      });
    },
  }),
  betaZodTool({
    name: "posts_recents",
    description: "Derniers posts d'un business (publiés, programmés, en échec) avec leurs réseaux et erreurs éventuelles.",
    inputSchema: z.object({ slug: z.string() }),
    run: async ({ slug }) => {
      const b = await businessBySlug(slug);
      const posts = await listPosts({ businessId: b.id, order: "recent", limit: 15 });
      return JSON.stringify(
        posts.map((p) => ({
          title: p.title,
          status: p.status,
          scheduled_at: p.scheduled_at,
          targets: p.targets.map((t) => ({ network: t.network, status: t.status, error: t.error_message })),
        })),
      );
    },
  }),
];

export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Non autorisé." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Requête invalide." }, { status: 400 });
  const anthropic = claude();
  if (!anthropic) return Response.json({ error: NO_KEY }, { status: 503 });

  const { slug, messages } = parsed.data;
  const context = slug ? `Bastien regarde actuellement la page du business « ${slug} ».` : "Bastien est sur l'accueil du panel (tous les business).";

  try {
    const runner = anthropic.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      max_iterations: 10,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: `${SYSTEM}\n\nDate du jour : ${lastDays(1)[0]}. ${context}`,
      tools,
      messages: messages.map((m): Anthropic.Beta.BetaMessageParam => ({ role: m.role, content: m.content })),
    });
    const final = await runner;
    if (final.stop_reason === "refusal") return Response.json({ error: "L'assistant n'a pas pu répondre à cette demande." }, { status: 200 });
    return Response.json({ text: textOf(final) || "Je n'ai pas trouvé de réponse." });
  } catch (error) {
    return Response.json({ error: friendlyError(error) }, { status: 502 });
  }
}
