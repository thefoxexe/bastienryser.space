"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp, Loader2, Mic, Square, Volume2, VolumeX, X } from "lucide-react";
import type { Brief } from "@/app/(panel)/ai-actions";
import { AiAvatar, type AvatarState } from "@/components/ai/avatar";
import { BRIEF_EVENT } from "@/components/ai/brief-card";
import { cn } from "@/components/ui/cn";

type Message = { role: "user" | "assistant"; content: string; error?: boolean };

const SUGGESTIONS = ["Fais-moi le point", "Audit SEO de mon site", "Pourquoi ma position Google change ?", "Comment améliorer ma trésorerie ?", "Qu'est-ce qui ne va pas ?"];

/** Rendu léger des réponses : paragraphes, listes à tirets et **gras**. */
function Rich({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="ml-4 list-disc space-y-1">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split("\n")) {
    const item = line.match(/^\s*[-•]\s+(.*)/);
    if (item) list.push(item[1]);
    else {
      flush();
      if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ""))}</p>);
    }
  }
  flush();
  return <div className="flex flex-col gap-2">{blocks}</div>;
}

/** Texte lisible à voix haute : sans balisage. */
const spoken = (text: string) => text.replace(/\*\*/g, "").replace(/^\s*[-•]\s+/gm, "").replace(/#+\s*/g, "");

export function Assistant() {
  const pathname = usePathname();
  const slug = pathname.match(/^\/b\/([^/]+)/)?.[1] ?? null;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  // Lu côté client seulement : le panneau (seul à en dépendre) ne s'affiche qu'après un clic.
  const [voice, setVoice] = useState(() => {
    try {
      return typeof window === "undefined" || localStorage.getItem("assistant-voice") !== "off";
    } catch {
      return true;
    }
  });
  const recorder = useRef<MediaRecorder | null>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) speechSynthesis?.cancel();
  }, [open]);

  // Un clic sur le brief ouvre l'assistant, qui le détaille (et le lit) ; on enchaîne ensuite avec des questions.
  const speakRef = useRef<(text: string) => void>(() => {});
  useEffect(() => {
    speakRef.current = speak;
  });
  useEffect(() => {
    const onBrief = (e: Event) => {
      const brief = (e as CustomEvent<Brief>).detail;
      const text = `${brief.headline}\n${brief.points.map((p) => `- ${p.text}`).join("\n")}\n\nTu veux que je creuse un point ?`;
      setOpen(true);
      setMessages((m) => [...m, { role: "user", content: "Détaille-moi le brief du jour." }, { role: "assistant", content: text }]);
      speakRef.current(text);
    };
    window.addEventListener(BRIEF_EVENT, onBrief);
    return () => window.removeEventListener(BRIEF_EVENT, onBrief);
  }, []);

  function speak(text: string) {
    if (!voice || typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(spoken(text));
    u.lang = "fr-FR";
    const fr = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("fr"));
    u.voice = fr.find((v) => /premium|enhanced|natural|google/i.test(v.name)) ?? fr[0] ?? null;
    u.rate = 1.04;
    u.onstart = () => setSpeaking(true);
    u.onend = u.onerror = () => setSpeaking(false);
    speechSynthesis.speak(u);
  }

  function toggleVoice() {
    const next = !voice;
    setVoice(next);
    if (!next) speechSynthesis?.cancel();
    try {
      localStorage.setItem("assistant-voice", next ? "on" : "off");
    } catch {}
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const history = [...messages.filter((m) => !m.error), { role: "user" as const, content }];
    setMessages((m) => [...m, { role: "user", content }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, messages: history.slice(-20) }),
      });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (data.text) {
        setMessages((m) => [...m, { role: "assistant", content: data.text! }]);
        speak(data.text);
      } else setMessages((m) => [...m, { role: "assistant", content: data.error ?? "L'assistant n'a pas pu répondre.", error: true }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Connexion perdue, réessaie.", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    speechSynthesis?.cancel();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType });
        if (blob.size < 1200) return;
        setTranscribing(true);
        const form = new FormData();
        form.append("audio", blob);
        try {
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
          if (data.text) await send(data.text);
          else setMessages((m) => [...m, { role: "assistant", content: data.error ?? "Je n'ai rien entendu.", error: true }]);
        } finally {
          setTranscribing(false);
        }
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Le micro n'est pas accessible : autorise-le dans le navigateur.", error: true }]);
    }
  }

  const state: AvatarState = recording ? "listening" : busy || transcribing ? "thinking" : speaking ? "speaking" : "idle";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fermer l'assistant" : "Ouvrir l'assistant"}
        aria-expanded={open}
        className={cn(
          "fixed bottom-[calc(16px+env(safe-area-inset-bottom))] right-4 z-40 rounded-full transition-transform duration-300 ease-[var(--ease-apple)] hover:scale-105 active:scale-95 sm:right-6 sm:bottom-6",
          open && "max-sm:hidden",
        )}
      >
        <AiAvatar state={open ? state : "idle"} className="size-14" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Assistant"
          className="animate-rise fixed inset-0 z-50 flex flex-col bg-bg sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(620px,calc(100dvh-120px))] sm:w-[400px] sm:rounded-[24px] sm:bg-surface sm:shadow-pop"
        >
          <header className="flex items-center gap-3 border-b border-border px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] sm:pt-3">
            <AiAvatar state={state} className="size-9" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold tracking-tight">Assistant</p>
              <p className="truncate text-[12px] text-muted">
                {recording ? "Je t'écoute…" : transcribing ? "Je transcris…" : busy ? "Je regarde tes chiffres…" : speaking ? "Je parle" : slug ? `Sur ${slug}` : "Tous les business"}
              </p>
            </div>
            <button type="button" onClick={toggleVoice} className="grid size-8 place-items-center rounded-full text-muted transition hover:bg-fill hover:text-text" aria-label={voice ? "Couper la voix" : "Activer la voix"} title={voice ? "Couper la voix" : "Activer la voix"}>
              {voice ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-full text-muted transition hover:bg-fill hover:text-text" aria-label="Fermer">
              <X className="size-4" />
            </button>
          </header>

          <div ref={list} className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length ? (
              <div className="flex flex-col gap-3">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "max-w-[88%] rounded-[18px] px-3.5 py-2.5 text-[14px] leading-relaxed",
                      m.role === "user" ? "self-end bg-ink text-ink-text" : m.error ? "self-start bg-[color-mix(in_oklab,var(--danger)_9%,transparent)] text-danger" : "self-start bg-fill",
                    )}
                  >
                    {m.role === "assistant" && !m.error ? <Rich text={m.content} /> : m.content}
                  </div>
                ))}
                {busy ? (
                  <div className="flex items-center gap-2 self-start rounded-[18px] bg-fill px-3.5 py-2.5 text-[13px] text-muted">
                    <Loader2 className="size-3.5 animate-spin" /> Je regarde tes chiffres…
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <AiAvatar state="idle" className="size-16" />
                <div>
                  <p className="text-[16px] font-semibold tracking-tight">Pose-moi une question</p>
                  <p className="mt-1 text-[13px] text-muted">Je lis tes vrais chiffres : visites, Google, finances, réseaux.</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-full bg-fill px-3 py-1.5 text-[13px] transition hover:bg-fill-strong">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 border-t border-border px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 sm:pb-3"
          >
            <button
              type="button"
              onClick={toggleRecording}
              disabled={busy || transcribing}
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-full transition disabled:opacity-40",
                recording ? "bg-ink text-ink-text" : "bg-fill text-text hover:bg-fill-strong",
              )}
              aria-label={recording ? "Arrêter et envoyer" : "Parler"}
              title={recording ? "Arrêter et envoyer" : "Parler"}
            >
              {transcribing ? <Loader2 className="size-4 animate-spin" /> : recording ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder={recording ? "Parle, puis touche le carré" : "Écris ta question…"}
              className="max-h-32 min-h-10 flex-1 resize-none rounded-[20px] bg-fill px-4 py-2.5 text-[16px] outline-none placeholder:text-faint sm:text-[14px]"
              aria-label="Ta question"
            />
            <button type="submit" disabled={!input.trim() || busy} className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-ink-text transition disabled:opacity-30" aria-label="Envoyer">
              <ArrowUp className="size-4" />
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
