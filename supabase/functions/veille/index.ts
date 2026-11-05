// Veille : nouvelles vidéos TikTok → retranscription (Whisper) → explication (Claude) → groupe Telegram.
//
// Appelée par la tâche GitHub Actions `veille` (en-tête x-veille-secret, valeur rangée dans Vault) :
//   POST { action: "config" }                                    comptes à surveiller, vidéos déjà vues, liens en attente
//   POST { action: "seen", source_id, items: [...] }             vidéos présentes au démarrage (jamais envoyées)
//   POST multipart action=ingest + audio                         une vidéo à traiter
//   POST { action: "checked", source_id, error? }                résultat de la vérification d'un compte
//   POST { action: "run_end", ok, detail }                       fin de passage (suivi + alerte push si panne)
// Et par le panel (admin connecté) :
//   telegram_connect, telegram_chats, telegram_target, telegram_test, retry, secret
// Le jeton du bot ne quitte jamais cette fonction ; les clés OpenAI et Anthropic sont des secrets Supabase.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAll } from "../_shared/push.ts";
import { adminClient, heartbeat, isAdminRequest, json, logActivity, readToken, storeToken } from "../_shared/supabase.ts";

const MODEL = "claude-opus-5-5";
const TELEGRAM = "https://api.telegram.org";

type Settings = {
  business_id: string;
  telegram_ref: string | null;
  bot_username: string | null;
  chat_id: string | null;
  chat_title: string | null;
  thread_id: number | null;
  instructions: string;
  disclaimer: boolean;
  enabled: boolean;
};

// ---------------------------------------------------------------------------
// Authentification de la tâche GitHub
// ---------------------------------------------------------------------------

function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function isRunner(db: SupabaseClient, req: Request) {
  const provided = req.headers.get("x-veille-secret");
  if (!provided) return false;
  const { data } = await db.from("veille_runner").select("secret_ref").maybeSingle();
  const expected = await readToken(db, data?.secret_ref ?? null);
  return !!expected && safeEqual(provided, expected);
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

async function telegram<T>(token: string, method: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${TELEGRAM}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram : ${data.description ?? `erreur ${res.status}`}`);
  return data.result as T;
}

async function botToken(db: SupabaseClient, s: Settings) {
  const token = await readToken(db, s.telegram_ref);
  if (!token) throw new Error("Bot Telegram non connecté.");
  return token;
}

/** Envoie un message HTML, découpé sous la limite de 4 096 caractères de Telegram. Renvoie l'id du premier message. */
async function sendTelegram(db: SupabaseClient, s: Settings, html: string) {
  if (!s.chat_id) throw new Error("Aucun groupe Telegram choisi.");
  const token = await botToken(db, s);
  const chunks: string[] = [];
  let current = "";
  for (const block of html.split("\n\n")) {
    if ((current + "\n\n" + block).length > 3900 && current) {
      chunks.push(current);
      current = block;
    } else current = current ? `${current}\n\n${block}` : block;
  }
  if (current) chunks.push(current);
  let first: number | null = null;
  for (const text of chunks) {
    const sent = await telegram<{ message_id: number }>(token, "sendMessage", {
      chat_id: s.chat_id,
      ...(s.thread_id ? { message_thread_id: s.thread_id } : {}),
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    first ??= sent.message_id;
  }
  return first;
}

// ---------------------------------------------------------------------------
// Retranscription et explication
// ---------------------------------------------------------------------------

async function transcribe(audio: Blob, name: string) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY absente des secrets Supabase.");
  const form = new FormData();
  form.append("file", audio, name);
  form.append("model", "whisper-1");
  form.append("language", "fr");
  form.append("response_format", "text");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Whisper : erreur ${res.status} ${(await res.text()).slice(0, 200)}`);
  const text = (await res.text()).trim();
  if (!text) throw new Error("Whisper n'a rien entendu dans cette vidéo.");
  return text;
}

type Explanation = { titre: string; essentiel: string; points: string[]; a_retenir: string; a_surveiller: string[] };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titre", "essentiel", "points", "a_retenir", "a_surveiller"],
  properties: {
    titre: { type: "string", description: "Titre court et accrocheur, sans emoji, 90 caractères au plus." },
    essentiel: { type: "string", description: "L'idée principale en 2 ou 3 phrases simples." },
    points: { type: "array", items: { type: "string" }, description: "3 à 6 points clés, chacun en une ou deux phrases, avec les chiffres cités." },
    a_retenir: { type: "string", description: "Ce que ça veut dire concrètement pour les marchés (or, actions, crypto, devises), en 2 ou 3 phrases." },
    a_surveiller: { type: "array", items: { type: "string" }, description: "0 à 4 rendez-vous ou signaux à suivre ensuite (dates, annonces, niveaux)." },
  },
};

async function explain(s: Settings, title: string | null, transcript: string): Promise<Explanation> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY absente des secrets Supabase.");
  const system = [
    "Tu rédiges pour un groupe Telegram privé de passionnés de marchés (actions, or, crypto, devises), en français de Suisse romande.",
    "On te donne la retranscription d'une vidéo d'analyse. Explique clairement et fidèlement ce qu'elle dit : le raisonnement, les causes, les conséquences.",
    "Règles : reste fidèle à la vidéo ; garde les chiffres, dates et niveaux exactement comme ils sont dits ; n'ajoute aucun chiffre ni fait qui n'y est pas ;",
    "si un passage est flou dans la retranscription, ne l'invente pas, laisse-le de côté. Ne parle pas de « la vidéo » ni de son auteur : présente l'analyse directement.",
    "Ton : direct, clair, accessible à quelqu'un qui débute, sans jargon inutile (explique un terme technique en quelques mots s'il est indispensable). Pas d'emoji.",
    s.instructions.trim() ? `Consignes de l'administrateur du groupe : ${s.instructions.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2500,
      system,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `Titre de la publication : ${title ?? "(aucun)"}\n\nRetranscription :\n${transcript.slice(0, 60_000)}` }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = (await res.json().catch(() => ({}))) as { content?: { type: string; text?: string }[]; error?: { message?: string }; stop_reason?: string };
  if (!res.ok) throw new Error(`Claude : ${data.error?.message ?? `erreur ${res.status}`}`);
  if (data.stop_reason === "refusal") throw new Error("Claude n'a pas voulu traiter ce contenu.");
  const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return JSON.parse(text) as Explanation;
  } catch {
    throw new Error("Réponse de Claude illisible.");
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function toHtml(e: Explanation, disclaimer: boolean) {
  const parts = [`<b>${esc(e.titre)}</b>`, esc(e.essentiel)];
  if (e.points.length) parts.push(e.points.map((p) => `• ${esc(p)}`).join("\n"));
  if (e.a_retenir) parts.push(`<b>À retenir</b>\n${esc(e.a_retenir)}`);
  if (e.a_surveiller.length) parts.push(`<b>À surveiller</b>\n${e.a_surveiller.map((p) => `• ${esc(p)}`).join("\n")}`);
  if (disclaimer) parts.push("<i>Information, pas un conseil en investissement.</i>");
  return parts.join("\n\n");
}

/** Explique une retranscription et l'envoie ; met l'élément à jour (envoyé ou en échec). */
async function explainAndSend(db: SupabaseClient, s: Settings, itemId: string, title: string | null, transcript: string) {
  try {
    const html = toHtml(await explain(s, title, transcript), s.disclaimer);
    const messageId = await sendTelegram(db, s, html);
    await db.from("veille_items").update({ status: "sent", message: html, error: null, telegram_message_id: messageId, sent_at: new Date().toISOString() }).eq("id", itemId);
    return { ok: true as const };
  } catch (e) {
    const error = (e as Error).message ?? String(e);
    await db.from("veille_items").update({ status: "failed", error }).eq("id", itemId);
    return { ok: false as const, error };
  }
}

async function settingsFor(db: SupabaseClient, businessId: string): Promise<Settings | null> {
  const { data } = await db.from("veille_settings").select("*").eq("business_id", businessId).maybeSingle();
  return (data as Settings | null) ?? null;
}

// ---------------------------------------------------------------------------
// Actions de la tâche GitHub
// ---------------------------------------------------------------------------

async function runnerConfig(db: SupabaseClient) {
  const { data: settings } = await db.from("veille_settings").select("business_id").eq("enabled", true).not("chat_id", "is", null).not("telegram_ref", "is", null);
  const ready = (settings ?? []).map((s) => s.business_id);
  if (!ready.length) return { sources: [], queued: [] };
  const { data: sources } = await db.from("veille_sources").select("id, business_id, platform, handle").eq("enabled", true).in("business_id", ready);
  const out = [];
  for (const src of sources ?? []) {
    const { data: items } = await db.from("veille_items").select("external_id").eq("source_id", src.id).order("created_at", { ascending: false }).limit(100);
    out.push({ ...src, known: (items ?? []).map((i) => i.external_id).filter(Boolean), baseline: !(items ?? []).length });
  }
  const { data: queued } = await db.from("veille_items").select("id, business_id, url").eq("status", "queued").in("business_id", ready).limit(10);
  return { sources: out, queued: queued ?? [] };
}

async function ingest(db: SupabaseClient, form: FormData) {
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || !audio.size) return { ok: false, error: "Audio manquant." };
  const itemId = String(form.get("item_id") ?? "");
  const sourceId = String(form.get("source_id") ?? "");
  const externalId = String(form.get("external_id") ?? "") || null;
  const url = String(form.get("url") ?? "");
  const title = String(form.get("title") ?? "") || null;
  const postedAt = String(form.get("posted_at") ?? "") || null;

  // Élément : un lien ajouté à la main (item_id), ou une nouvelle vidéo d'un compte surveillé.
  let item: { id: string; business_id: string; status: string; attempts: number } | null = null;
  if (itemId) {
    const { data } = await db.from("veille_items").select("id, business_id, status, attempts").eq("id", itemId).maybeSingle();
    item = data;
  } else {
    const { data: src } = await db.from("veille_sources").select("id, business_id").eq("id", sourceId).maybeSingle();
    if (!src) return { ok: false, error: "Compte surveillé introuvable." };
    const { data: existing } = await db.from("veille_items").select("id, business_id, status, attempts").eq("business_id", src.business_id).eq("external_id", externalId).maybeSingle();
    if (existing) item = existing;
    else {
      const { data: created } = await db
        .from("veille_items")
        .insert({ business_id: src.business_id, source_id: src.id, external_id: externalId, url, title, posted_at: postedAt, status: "processing" })
        .select("id, business_id, status, attempts")
        .single();
      item = created;
    }
  }
  if (!item) return { ok: false, error: "Élément introuvable." };
  if (item.status === "sent") return { ok: true, skipped: true };

  const s = await settingsFor(db, item.business_id);
  if (!s) return { ok: false, error: "Veille non configurée pour ce business." };
  await db
    .from("veille_items")
    .update({ status: "processing", attempts: item.attempts + 1, external_id: externalId, title, posted_at: postedAt, ...(url ? { url } : {}) })
    .eq("id", item.id);

  let transcript: string;
  try {
    transcript = await transcribe(audio, `${externalId ?? "video"}.mp3`);
    await db.from("veille_items").update({ transcript }).eq("id", item.id);
  } catch (e) {
    const error = (e as Error).message ?? String(e);
    await db.from("veille_items").update({ status: "failed", error }).eq("id", item.id);
    return { ok: false, error };
  }
  const result = await explainAndSend(db, s, item.id, title, transcript);
  if (result.ok) await logActivity(db, { business_id: item.business_id, kind: "veille.sent", message: `Veille envoyée sur Telegram : ${title?.slice(0, 80) ?? url}` });
  return result;
}

/** Alerte push quand la veille tombe en panne (une fois par panne), ou qu'un envoi échoue. */
async function runEnd(db: SupabaseClient, ok: boolean, detail: string) {
  const { data: prev } = await db.from("veille_runner").select("last_ok").maybeSingle();
  await db.from("veille_runner").update({ last_run_at: new Date().toISOString(), last_ok: ok, last_detail: detail.slice(0, 500) }).eq("id", true);
  await heartbeat(db, "veille", ok, detail.slice(0, 300));
  if (!ok && prev?.last_ok !== false) {
    await sendAll(db, { title: "Veille TikTok en panne", body: detail.slice(0, 180), url: "/", tag: "veille" }).catch(() => null);
  }
  if (ok && prev?.last_ok === false) {
    await sendAll(db, { title: "Veille TikTok rétablie", body: "La surveillance fonctionne de nouveau.", url: "/", tag: "veille" }).catch(() => null);
  }
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const db = adminClient();
  const runner = await isRunner(db, req);
  const admin = runner ? false : await isAdminRequest(req);
  if (!runner && !admin) return json({ error: "unauthorized" }, 401);

  try {
    if (runner && (req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const form = await req.formData();
      if (form.get("action") === "ingest") return json(await ingest(db, form));
      return json({ error: "unknown_action" }, 400);
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (runner) {
      if (action === "config") return json(await runnerConfig(db));
      if (action === "seen") {
        const { data: src } = await db.from("veille_sources").select("id, business_id").eq("id", body.source_id).maybeSingle();
        if (!src) return json({ ok: false, error: "Compte introuvable." }, 404);
        const items = (body.items as { external_id: string; url: string; title?: string; posted_at?: string }[]) ?? [];
        if (items.length) {
          await db.from("veille_items").upsert(
            items.map((i) => ({ business_id: src.business_id, source_id: src.id, external_id: i.external_id, url: i.url, title: i.title ?? null, posted_at: i.posted_at ?? null, status: "seen" })),
            { onConflict: "business_id,external_id", ignoreDuplicates: true },
          );
        }
        return json({ ok: true });
      }
      if (action === "checked") {
        await db.from("veille_sources").update({ last_checked_at: new Date().toISOString(), last_error: body.error ? String(body.error).slice(0, 500) : null }).eq("id", body.source_id);
        return json({ ok: true });
      }
      if (action === "queued_failed") {
        await db.from("veille_items").update({ status: "failed", error: String(body.error ?? "Téléchargement impossible.").slice(0, 500) }).eq("id", body.item_id).eq("status", "queued");
        return json({ ok: true });
      }
      if (action === "run_end") {
        await runEnd(db, Boolean(body.ok), String(body.detail ?? ""));
        return json({ ok: true });
      }
      return json({ error: "unknown_action" }, 400);
    }

    // Actions du panel (admin connecté).
    const businessId = String(body.business_id ?? "");
    if (action === "secret") {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const secret = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c] ?? "");
      const { data: row } = await db.from("veille_runner").select("secret_ref").maybeSingle();
      const ref = await storeToken(db, secret, "veille_runner_secret", row?.secret_ref ?? null);
      await db.from("veille_runner").upsert({ id: true, secret_ref: ref });
      return json({ ok: true, secret });
    }
    if (action === "telegram_connect") {
      const token = String(body.token ?? "").trim();
      if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) return json({ ok: false, error: "Ce n'est pas un jeton de bot Telegram (format 123456:ABC…)." });
      const me = await telegram<{ username: string }>(token, "getMe").catch(() => null);
      if (!me) return json({ ok: false, error: "Telegram refuse ce jeton : vérifie-le dans @BotFather." });
      const current = await settingsFor(db, businessId);
      const ref = await storeToken(db, token, `telegram_${businessId}`, current?.telegram_ref ?? null);
      await db.from("veille_settings").upsert({ business_id: businessId, telegram_ref: ref, bot_username: me.username, updated_at: new Date().toISOString() });
      return json({ ok: true, bot: me.username });
    }
    const s = await settingsFor(db, businessId);
    if (!s) return json({ ok: false, error: "Connecte d'abord le bot Telegram." });

    if (action === "telegram_chats") {
      const token = await botToken(db, s);
      type Msg = { chat: { id: number; title?: string; type: string; is_forum?: boolean }; message_thread_id?: number; is_topic_message?: boolean; forum_topic_created?: { name: string }; reply_to_message?: { forum_topic_created?: { name: string } } };
      const updates = await telegram<{ message?: Msg; channel_post?: Msg; my_chat_member?: { chat: Msg["chat"] } }[]>(token, "getUpdates", { limit: 100, allowed_updates: ["message", "channel_post", "my_chat_member"] });
      const chats = new Map<string, { id: string; title: string; type: string; topics: Map<number, string> }>();
      for (const u of updates) {
        const msg = u.message ?? u.channel_post;
        const chat = msg?.chat ?? u.my_chat_member?.chat;
        if (!chat || chat.type === "private") continue;
        const key = String(chat.id);
        if (!chats.has(key)) chats.set(key, { id: key, title: chat.title ?? key, type: chat.type, topics: new Map() });
        if (msg?.is_topic_message && msg.message_thread_id) {
          const name = msg.forum_topic_created?.name ?? msg.reply_to_message?.forum_topic_created?.name;
          const topics = chats.get(key)!.topics;
          if (name || !topics.has(msg.message_thread_id)) topics.set(msg.message_thread_id, name ?? topics.get(msg.message_thread_id) ?? `Sujet n° ${msg.message_thread_id}`);
        }
      }
      return json({ ok: true, chats: [...chats.values()].map((c) => ({ ...c, topics: [...c.topics.entries()].map(([id, name]) => ({ id, name })) })) });
    }
    if (action === "telegram_target") {
      await db
        .from("veille_settings")
        .update({ chat_id: body.chat_id ? String(body.chat_id) : null, chat_title: body.chat_title ? String(body.chat_title) : null, thread_id: body.thread_id ? Number(body.thread_id) : null, updated_at: new Date().toISOString() })
        .eq("business_id", businessId);
      return json({ ok: true });
    }
    if (action === "telegram_test") {
      await sendTelegram(db, s, "<b>Veille connectée</b>\n\nLes prochaines analyses arriveront ici automatiquement.");
      return json({ ok: true });
    }
    if (action === "retry") {
      const { data: item } = await db.from("veille_items").select("id, business_id, title, transcript, url").eq("id", body.item_id).eq("business_id", businessId).maybeSingle();
      if (!item) return json({ ok: false, error: "Élément introuvable." });
      if (!item.transcript) {
        // Pas encore retranscrit : la tâche GitHub le retéléchargera à son prochain passage.
        await db.from("veille_items").update({ status: "queued", error: null }).eq("id", item.id);
        return json({ ok: true, queued: true });
      }
      await db.from("veille_items").update({ status: "processing" }).eq("id", item.id);
      return json(await explainAndSend(db, s, item.id, item.title, item.transcript));
    }
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("veille", e);
    return json({ ok: false, error: (e as Error).message ?? "Erreur inattendue." }, 500);
  }
});
