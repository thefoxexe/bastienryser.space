import { isAdmin } from "@/lib/auth";

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

/** Voix → texte pour l'assistant, via Whisper (OpenAI). L'audio n'est ni stocké ni journalisé. */
export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "Non autorisé." }, { status: 401 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: "Ajoute OPENAI_API_KEY dans les variables d'environnement de Vercel pour parler à l'assistant." }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || !audio.size) return Response.json({ error: "Aucun son reçu." }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ error: "Message vocal trop long." }, { status: 413 });

  const body = new FormData();
  const ext = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
  body.append("file", audio, `voix.${ext}`);
  body.append("model", "whisper-1");
  body.append("language", "fr");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body,
  });
  if (res.status === 401) return Response.json({ error: "Clé OpenAI invalide : vérifie OPENAI_API_KEY." }, { status: 502 });
  if (!res.ok) return Response.json({ error: `La transcription a échoué (${res.status}).` }, { status: 502 });
  const { text } = (await res.json()) as { text?: string };
  return Response.json({ text: (text ?? "").trim() });
}
