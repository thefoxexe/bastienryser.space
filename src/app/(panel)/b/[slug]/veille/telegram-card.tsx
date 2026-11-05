"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Loader2, Search, Send } from "lucide-react";
import { Button, FormError, FormSuccess, Input } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { VeilleSettings } from "@/lib/veille";
import { connectTelegram, findChats, sendTest, setTarget, type TelegramChat } from "./actions";

/** Bot (jeton rangé dans Vault), puis choix du groupe et du sujet où poster, détectés par Telegram. */
export function TelegramCard({ businessId, slug, settings }: { businessId: string; slug: string; settings: VeilleSettings }) {
  const [state, connect, connecting] = useActionState(connectTelegram, {});
  const [chats, setChats] = useState<TelegramChat[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(!settings.connected);

  const search = () =>
    start(async () => {
      setMessage(null);
      const res = await findChats(businessId);
      if (res.error) setMessage({ ok: false, text: res.error });
      else setChats(res.chats ?? []);
    });
  const choose = (chat: TelegramChat, threadId: number | null) =>
    start(async () => {
      const title = threadId ? `${chat.title} › ${chat.topics.find((t) => t.id === threadId)?.name ?? "sujet"}` : chat.title;
      const res = await setTarget({ businessId, slug, chatId: chat.id, chatTitle: title, threadId });
      setMessage(res.error ? { ok: false, text: res.error } : { ok: true, text: `Les messages partiront dans « ${title} ».` });
      if (!res.error) setChats(null);
    });
  const test = () =>
    start(async () => {
      const res = await sendTest(businessId);
      setMessage(res.error ? { ok: false, text: res.error } : { ok: true, text: "Message d'essai envoyé : regarde ton groupe." });
    });

  return (
    <div className="flex flex-col gap-4 p-5 pt-4 sm:p-6 sm:pt-4">
      {settings.connected && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-fill px-4 py-3">
          <span className="text-[14px]">
            Bot <span className="font-medium">@{settings.bot_username}</span>
          </span>
          <button type="button" onClick={() => setEditing(true)} className="text-[13px] text-muted hover:text-text">
            Changer de bot
          </button>
        </div>
      ) : (
        <form key={state.nonce ?? 0} action={connect} className="flex flex-col gap-2">
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="slug" value={slug} />
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted">
            <li>Dans Telegram, ouvre @BotFather, envoie /newbot et choisis un nom.</li>
            <li>Ajoute le bot à ton groupe et nomme-le administrateur (droit de publier).</li>
            <li>Colle ici le jeton que BotFather t&apos;a donné : il est vérifié puis rangé dans le coffre-fort.</li>
          </ol>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input name="token" required autoComplete="off" placeholder="123456789:AA…" aria-label="Jeton du bot" className="font-mono text-[13px]" />
            <Button type="submit" disabled={connecting} className="shrink-0">
              {connecting ? <Loader2 className="animate-spin" /> : null} Connecter le bot
            </Button>
          </div>
          <FormError message={state.error} />
        </form>
      )}

      {settings.connected ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted">Destination :</span>
            <span className={cn("text-[14px] font-medium", !settings.chat_id && "text-warning")}>{settings.chat_title ?? "aucun groupe choisi"}</span>
          </div>
          <p className="text-[12px] text-muted">
            Pour trouver ton groupe : écris un message dans le groupe (ou dans le sujet voulu, si le groupe a des sujets), puis appuie sur « Chercher ».
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={search} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Search />} Chercher mes groupes
            </Button>
            {settings.chat_id ? (
              <Button type="button" variant="secondary" size="sm" onClick={test} disabled={pending}>
                <Send /> Envoyer un essai
              </Button>
            ) : null}
          </div>
          {chats ? (
            chats.length ? (
              <ul className="flex flex-col gap-1.5">
                {chats.map((c) => (
                  <li key={c.id} className="rounded-[14px] bg-fill p-2">
                    <button type="button" onClick={() => choose(c, null)} className="flex w-full items-center justify-between gap-2 rounded-[10px] px-2 py-1.5 text-left hover:bg-surface">
                      <span className="min-w-0 truncate text-[14px] font-medium">{c.title}</span>
                      <span className="flex shrink-0 items-center gap-1 text-[12px] text-muted">
                        {settings.chat_id === c.id && !settings.thread_id ? <Check className="size-3.5 text-green" /> : null}
                        {c.type === "channel" ? "canal" : "groupe entier"}
                      </span>
                    </button>
                    {c.topics.map((t) => (
                      <button key={t.id} type="button" onClick={() => choose(c, t.id)} className="flex w-full items-center justify-between gap-2 rounded-[10px] px-2 py-1.5 pl-5 text-left hover:bg-surface">
                        <span className="min-w-0 truncate text-[13px]">› {t.name}</span>
                        <span className="flex shrink-0 items-center gap-1 text-[12px] text-muted">
                          {settings.chat_id === c.id && settings.thread_id === t.id ? <Check className="size-3.5 text-green" /> : null}
                          sujet
                        </span>
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">Aucun groupe vu par le bot. Vérifie qu&apos;il est bien dans le groupe, écris-y un message, puis réessaie.</p>
            )
          ) : null}
        </div>
      ) : null}
      {message ? message.ok ? <FormSuccess message={message.text} /> : <FormError message={message.text} /> : null}
      {state.ok ? <FormSuccess message="Bot connecté. Choisis maintenant le groupe." /> : null}
    </div>
  );
}
