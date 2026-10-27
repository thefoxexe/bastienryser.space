"use server";

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claude, friendlyError, MODEL, NO_KEY } from "@/lib/ai/claude";
import { businessDigest, DIGEST_GUIDE } from "@/lib/ai/insights";
import { requireAdmin } from "@/lib/auth";
import { getBusiness, listBusinesses } from "@/lib/data";
import { lastDays } from "@/lib/metrics";
import { createClient } from "@/lib/supabase/server";

const BriefSchema = z.object({
  headline: z.string().describe("Une seule phrase d'accroche, 15 mots au plus : l'essentiel du jour, chiffré si possible."),
  spoken: z
    .string()
    .describe(
      "Le brief tel que tu le dirais à voix haute à Bastien, en 2 ou 3 phrases naturelles et parlées (« Salut, alors aujourd'hui… ») : l'essentiel et le point à régler en priorité. Pas de liste, chiffres arrondis comme à l'oral, sans relire les points.",
    ),
  points: z
    .array(
      z.object({
        tone: z.enum(["good", "warning", "bad", "info"]).describe("good : bonne nouvelle ; warning : à surveiller ; bad : problème réel ; info : neutre."),
        text: z.string().describe("Une ou deux phrases : le fait chiffré, sa cause probable, l'action concrète."),
      }),
    )
    .describe("3 à 6 points, du plus important au moins important."),
});

export type Brief = z.infer<typeof BriefSchema> & { created_at: string };
export type BriefResult = { ok: true; brief: Brief } | { ok: false; error: string };

const SYSTEM = `Tu es l'assistant intégré au panel privé de Bastien, « Bastien's Space » (bastienryser.space), qui gère ses business suisses.
Tu lui écris le brief du jour quand il ouvre le panel : ce qui a bougé, ce qui ne va pas, et quoi faire.

Règles :
- Français, tutoiement, ton direct et bienveillant, phrases courtes. Pas d'emoji, pas de titre, pas de gras.
- N'utilise que les chiffres fournis. N'invente aucun chiffre, aucune donnée, aucune cause certaine : une cause déduite s'annonce comme probable.
- Commence par les problèmes réels (signals), puis les évolutions marquantes, puis une bonne nouvelle s'il y en a une.
- Pour chaque problème : la cause probable et une action concrète faisable aujourd'hui.
- Si une source manque (null), ne parle pas de ses chiffres ; signale seulement si c'est gênant.
- Si tout va bien, dis-le simplement.

${DIGEST_GUIDE}`;

/** Brief du jour d'un business (ou de tous, depuis l'accueil). Mis en cache pour la journée ; `force` le régénère. */
export async function getBrief(slug: string | null, force = false): Promise<BriefResult> {
  await requireAdmin();
  const supabase = await createClient();
  const today = lastDays(1)[0];
  const business = slug ? await getBusiness(slug) : null;

  const cached = supabase.from("ai_briefs").select("content,created_at").eq("day", today).order("created_at", { ascending: false }).limit(1);
  const { data: hit } = await (business ? cached.eq("business_id", business.id) : cached.is("business_id", null)).maybeSingle();
  if (hit && !force) {
    try {
      return { ok: true, brief: { ...BriefSchema.parse(JSON.parse(hit.content)), created_at: hit.created_at } };
    } catch {
      // Ancien format : on régénère.
    }
  }

  const anthropic = claude();
  if (!anthropic) return { ok: false, error: NO_KEY };

  const scope = business ? [business] : await listBusinesses();
  const memoriesQ = supabase.from("ai_memories").select("content").order("created_at").limit(100);
  const [digests, { data: memories }] = await Promise.all([
    Promise.all(scope.map((b) => businessDigest(b, 28))),
    business ? memoriesQ.or(`business_id.eq.${business.id},business_id.is.null`) : memoriesQ,
  ]);
  const known = memories?.length ? `\n\nCe que tu sais déjà (mémorisé avec Bastien) :\n${memories.map((m) => `- ${m.content}`).join("\n")}` : "";

  try {
    const response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(BriefSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `Date du jour : ${today}. ${business ? `Brief pour ${business.name}.` : "Brief de l'accueil : tous les business réunis, un point par business qui le mérite."}\n\n` +
            `Données (JSON, 28 derniers jours comparés aux 28 précédents) :\n${JSON.stringify(digests)}${known}`,
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return { ok: false, error: "L'IA n'a pas pu préparer le brief." };
    const created_at = new Date().toISOString();
    const content = JSON.stringify(response.parsed_output);
    // Cache du jour : sans la table (migration pas encore appliquée), le brief s'affiche quand même.
    const old = supabase.from("ai_briefs").delete().eq("day", today);
    await (business ? old.eq("business_id", business.id) : old.is("business_id", null));
    await supabase.from("ai_briefs").insert({ business_id: business?.id ?? null, day: today, content });
    return { ok: true, brief: { ...response.parsed_output, created_at } };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}
