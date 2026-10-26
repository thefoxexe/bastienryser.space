"use server";

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claude as client, friendlyError, MODEL, NO_KEY } from "@/lib/ai/claude";
import { requireAdmin } from "@/lib/auth";
import { NETWORKS } from "@/lib/social/networks";
import type { SocialNetwork } from "@/lib/types";

const STYLE: Record<SocialNetwork, string> = {
  instagram: "Instagram : court, direct, accrocheur dès la première ligne, quelques emojis bienvenus, hashtags pertinents regroupés à la fin (10 au maximum).",
  facebook: "Page Facebook : ton chaleureux et clair, 1 à 3 paragraphes courts, 0 à 3 hashtags.",
  linkedin: "LinkedIn (profil personnel) : professionnel et personnel à la fois, phrase d'accroche, paragraphes aérés, valeur concrète pour le lecteur, 3 à 5 hashtags à la fin.",
  linkedin_page: "LinkedIn (page entreprise) : professionnel, centré sur la valeur pour les clients, paragraphes aérés, 3 à 5 hashtags à la fin.",
  threads: "Threads : très court (moins de 500 caractères), conversationnel, un seul hashtag au maximum.",
  youtube: "YouTube : description de vidéo, première phrase qui résume la vidéo (visible avant « plus »), puis détails utiles et liens, 3 hashtags à la fin.",
  tiktok: "TikTok : légende très courte et punchy, une accroche, 3 à 5 hashtags tendance et pertinents.",
  bluesky: "Bluesky : moins de 300 caractères, naturel et direct, 0 à 2 hashtags.",
  pinterest: "Pinterest : description inspirante et descriptive (mots-clés naturels pour la recherche), 2 à 3 phrases, sans hashtag.",
  x: "X : moins de 280 caractères, percutant, une idée forte, 0 à 2 hashtags.",
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Adapte une description commune à chaque réseau choisi. Rien n'est publié : Bastien relit toujours. */
export async function adaptCaptions(input: {
  caption: string;
  networks: SocialNetwork[];
  businessName: string;
  language: "fr" | "de" | "it";
}): Promise<Result<Partial<Record<SocialNetwork, string>>>> {
  await requireAdmin();
  const anthropic = client();
  if (!anthropic) return { ok: false, error: NO_KEY };
  const networks = [...new Set(input.networks)].filter((n) => n in NETWORKS);
  if (!input.caption.trim() || !networks.length) return { ok: false, error: "Écris une description et choisis au moins un compte." };

  const schema = z.object({
    captions: z.array(z.object({ network: z.enum(networks as [SocialNetwork, ...SocialNetwork[]]), text: z.string() })),
  });
  const language = { fr: "français", de: "allemand (Suisse : pas de ß, utiliser « ss »)", it: "italien" }[input.language];

  try {
    const response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(schema) },
      system:
        "Tu es le community manager de l'entreprise suisse « " +
        input.businessName +
        " ». Tu réécris une description de post pour chaque réseau social. " +
        "Garde exactement le sens, les faits, les chiffres, les noms et les liens de l'original : n'invente rien. " +
        "Respecte la limite de caractères de chaque réseau. Réponds dans la langue demandée.",
      messages: [
        {
          role: "user",
          content:
            `Langue : ${language}.\n\nRéseaux et consignes :\n` +
            networks.map((n) => `- ${n} (max ${NETWORKS[n].maxChars} caractères) : ${STYLE[n]}`).join("\n") +
            `\n\nDescription originale :\n"""\n${input.caption}\n"""`,
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return { ok: false, error: "L'IA n'a pas pu traiter cette description." };
    const out: Partial<Record<SocialNetwork, string>> = {};
    for (const c of response.parsed_output.captions) out[c.network] = c.text.trim();
    return { ok: true, data: out };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}

/** Traduit un texte en allemand ou en italien en gardant hashtags, emojis et mise en forme. */
export async function translateCaption(input: { text: string; target: "de" | "it" }): Promise<Result<string>> {
  await requireAdmin();
  const anthropic = client();
  if (!anthropic) return { ok: false, error: NO_KEY };
  if (!input.text.trim()) return { ok: false, error: "Rien à traduire." };

  const schema = z.object({ translation: z.string() });
  const language = input.target === "de" ? "allemand de Suisse (pas de ß, utiliser « ss »)" : "italien de Suisse";

  try {
    const response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(schema) },
      system:
        "Tu traduis des posts de réseaux sociaux d'une entreprise suisse. Traduis fidèlement, naturellement, " +
        "sans rien ajouter. Garde les emojis, les sauts de ligne, les liens et les mentions. Traduis le mot des hashtags quand c'est naturel.",
      messages: [{ role: "user", content: `Traduis en ${language} :\n"""\n${input.text}\n"""` }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return { ok: false, error: "L'IA n'a pas pu traduire ce texte." };
    return { ok: true, data: response.parsed_output.translation.trim() };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}
