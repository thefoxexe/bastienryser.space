import { z } from "zod";
import { isAdmin } from "@/lib/auth";

export const maxDuration = 60;

const Body = z.object({ text: z.string().min(1).max(4000) });

/** Texte → voix naturelle (OpenAI). Sans clé, le navigateur se rabat sur sa voix intégrée. */
export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Non autorisé." }, { status: 401 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: "OPENAI_API_KEY absente." }, { status: 503 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Requête invalide." }, { status: 400 });

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: process.env.OPENAI_TTS_VOICE || "ash",
      input: parsed.data.text,
      instructions:
        "Français de Suisse romande. Ton naturel, détendu et chaleureux, comme un associé qui fait un point rapide à voix haute. Rythme vif, phrases fluides, aucune intonation de robot ou de présentateur.",
      response_format: "mp3",
    }),
  });
  if (!res.ok || !res.body) return Response.json({ error: `Synthèse vocale indisponible (${res.status}).` }, { status: 502 });
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
