"use client";

import { useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, FileText, Globe2, Heart, MessageCircle, MoreHorizontal, Repeat2, Send, Share2, ThumbsUp } from "lucide-react";
import { cn } from "@/components/ui/cn";
import type { SocialNetwork } from "@/lib/types";

export type PreviewMedia = { url: string | null; kind: "image" | "pdf"; width: number | null; height: number | null; name?: string };

type PreviewProps = {
  network: SocialNetwork;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  color: string;
  caption: string;
  media: PreviewMedia[];
};

export function NetworkPreview(props: PreviewProps) {
  if (props.network === "instagram") return <InstagramPreview {...props} />;
  if (props.network === "facebook") return <FacebookPreview {...props} />;
  return <LinkedInPreview {...props} />;
}

function Avatar({ url, name, color, className }: { url?: string | null; name: string; color: string; className?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={cn("rounded-full object-cover", className)} />;
  }
  return (
    <span className={cn("grid place-items-center rounded-full text-[11px] font-semibold text-white", className)} style={{ background: color }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Rich({ text }: { text: string }) {
  // Met en valeur hashtags, mentions et liens comme sur les réseaux.
  const parts = text.split(/(\s+)/);
  return (
    <>
      {parts.map((p, i) =>
        /^#[\p{L}\p{N}_]+/u.test(p) || /^@[\w.]+/.test(p) || /^https?:\/\//.test(p) ? (
          <span key={i} className="text-[#00376b] dark:text-[#e0f1ff]">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Truncated({ text, limit, moreLabel }: { text: string; limit: number; moreLabel: string }) {
  const [open, setOpen] = useState(false);
  if (open || text.length <= limit) return <Rich text={text} />;
  return (
    <>
      <Rich text={text.slice(0, limit).trimEnd()} />…{" "}
      <button type="button" onClick={() => setOpen(true)} className="text-[#737373]">
        {moreLabel}
      </button>
    </>
  );
}

function Placeholder({ className }: { className?: string }) {
  return <div className={cn("grid place-items-center bg-neutral-100 text-[12px] text-neutral-400 dark:bg-neutral-800", className)}>Pas d&apos;image</div>;
}

function InstagramPreview({ name, username, avatarUrl, color, caption, media }: PreviewProps) {
  const images = media.filter((m) => m.kind === "image");
  const [index, setIndex] = useState(0);
  const current = images[Math.min(index, images.length - 1)];
  const handle = username ?? name.toLowerCase().replace(/\s+/g, "");
  return (
    <div className="mx-auto w-full max-w-[380px] overflow-hidden rounded-xl border border-neutral-200 bg-white text-[14px] text-neutral-900 shadow-card dark:border-neutral-800 dark:bg-black dark:text-neutral-100">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="rounded-full bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] p-[2px]">
          <Avatar url={avatarUrl} name={name} color={color} className="size-8 ring-2 ring-white dark:ring-black" />
        </span>
        <span className="flex-1 text-[13px] font-semibold">{handle}</span>
        <MoreHorizontal className="size-5" />
      </div>
      <div className="relative aspect-[4/5] bg-neutral-100 dark:bg-neutral-900">
        {current?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.url} alt="" className="size-full object-cover" />
        ) : (
          <Placeholder className="size-full" />
        )}
        {images.length > 1 ? (
          <>
            <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[12px] font-medium text-white">
              {index + 1}/{images.length}
            </span>
            {index > 0 ? (
              <button type="button" onClick={() => setIndex(index - 1)} className="absolute left-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow">
                <ChevronLeft className="size-4" />
              </button>
            ) : null}
            {index < images.length - 1 ? (
              <button type="button" onClick={() => setIndex(index + 1)} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow">
                <ChevronRight className="size-4" />
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-4 px-3 pb-1 pt-3">
        <Heart className="size-6" />
        <MessageCircle className="size-6 -scale-x-100" />
        <Send className="size-6" />
        {images.length > 1 ? (
          <span className="flex flex-1 justify-center gap-1">
            {images.map((_, i) => (
              <span key={i} className={cn("size-1.5 rounded-full", i === index ? "bg-[#0095f6]" : "bg-neutral-300 dark:bg-neutral-600")} />
            ))}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <Bookmark className="size-6" />
      </div>
      <div className="px-3 pb-4 pt-1.5 leading-snug">
        {caption ? (
          <p className="whitespace-pre-line break-words">
            <span className="mr-1.5 font-semibold">{handle}</span>
            <Truncated text={caption} limit={125} moreLabel="plus" />
          </p>
        ) : (
          <p className="text-neutral-400">La légende apparaîtra ici.</p>
        )}
        <p className="mt-1.5 text-[11px] uppercase tracking-wide text-neutral-400">À l&apos;instant</p>
      </div>
    </div>
  );
}

function ImageGrid({ images, className }: { images: PreviewMedia[]; className?: string }) {
  if (!images.length) return null;
  const shown = images.slice(0, images.length > 4 ? 4 : images.length);
  const extra = images.length - shown.length;
  const img = (m: PreviewMedia, cls: string, overlay?: number) => (
    <div className={cn("relative overflow-hidden bg-neutral-100 dark:bg-neutral-800", cls)}>
      {m.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.url} alt="" className="size-full object-cover" />
      ) : null}
      {overlay ? <span className="absolute inset-0 grid place-items-center bg-black/45 text-2xl font-semibold text-white">+{overlay}</span> : null}
    </div>
  );
  if (shown.length === 1) return <div className={className}>{img(shown[0], "aspect-[4/5] max-h-[460px] w-full")}</div>;
  if (shown.length === 2) return <div className={cn("grid grid-cols-2 gap-0.5", className)}>{shown.map((m, i) => <div key={i}>{img(m, "aspect-[4/5]")}</div>)}</div>;
  if (shown.length === 3)
    return (
      <div className={cn("grid grid-cols-2 gap-0.5", className)}>
        <div className="row-span-2">{img(shown[0], "h-full min-h-[260px]")}</div>
        {img(shown[1], "aspect-square")}
        {img(shown[2], "aspect-square")}
      </div>
    );
  return (
    <div className={cn("grid grid-cols-2 gap-0.5", className)}>
      {shown.map((m, i) => (
        <div key={i}>{img(m, "aspect-square", i === 3 && extra > 0 ? extra : undefined)}</div>
      ))}
    </div>
  );
}

function FacebookPreview({ name, avatarUrl, color, caption, media }: PreviewProps) {
  const images = media.filter((m) => m.kind === "image");
  return (
    <div className="mx-auto w-full max-w-[500px] overflow-hidden rounded-xl border border-neutral-200 bg-white text-[15px] text-[#050505] shadow-card dark:border-neutral-800 dark:bg-[#242526] dark:text-[#e4e6eb]">
      <div className="flex items-center gap-2.5 px-4 pt-3">
        <Avatar url={avatarUrl} name={name} color={color} className="size-10" />
        <div className="flex-1 leading-tight">
          <p className="text-[15px] font-semibold">{name}</p>
          <p className="flex items-center gap-1 text-[13px] text-[#65676b] dark:text-[#b0b3b8]">
            À l&apos;instant · <Globe2 className="size-3" />
          </p>
        </div>
        <MoreHorizontal className="size-5 text-[#65676b]" />
      </div>
      <div className="whitespace-pre-line break-words px-4 py-3 leading-snug">
        {caption ? <Truncated text={caption} limit={280} moreLabel="Voir plus" /> : <span className="text-neutral-400">Le texte apparaîtra ici.</span>}
      </div>
      <ImageGrid images={images} />
      <div className="mx-4 flex items-center justify-between border-b border-neutral-200 py-2.5 text-[13px] text-[#65676b] dark:border-neutral-700 dark:text-[#b0b3b8]">
        <span className="flex items-center gap-1">
          <span className="grid size-[18px] place-items-center rounded-full bg-[#1877f2]">
            <ThumbsUp className="size-2.5 fill-white text-white" />
          </span>
          0
        </span>
        <span>0 commentaire</span>
      </div>
      <div className="grid grid-cols-3 px-2 py-1 text-[14px] font-semibold text-[#65676b] dark:text-[#b0b3b8]">
        {[
          [ThumbsUp, "J'aime"],
          [MessageCircle, "Commenter"],
          [Share2, "Partager"],
        ].map(([Icon, label]) => {
          const I = Icon as typeof ThumbsUp;
          return (
            <span key={label as string} className="flex items-center justify-center gap-1.5 py-2">
              <I className="size-[18px]" /> {label as string}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function LinkedInPreview({ name, avatarUrl, color, caption, media, network }: PreviewProps) {
  const images = media.filter((m) => m.kind === "image");
  const pdf = media.find((m) => m.kind === "pdf");
  return (
    <div className="mx-auto w-full max-w-[520px] overflow-hidden rounded-xl border border-neutral-200 bg-white text-[14px] text-[rgba(0,0,0,0.9)] shadow-card dark:border-neutral-800 dark:bg-[#1b1f23] dark:text-[rgba(255,255,255,0.9)]">
      <div className="flex items-start gap-2.5 px-4 pt-3">
        <Avatar url={avatarUrl} name={name} color={color} className={cn("size-12", network === "linkedin_page" && "rounded-md")} />
        <div className="flex-1 leading-tight">
          <p className="text-[14px] font-semibold">{name}</p>
          <p className="text-[12px] text-[rgba(0,0,0,0.6)] dark:text-[rgba(255,255,255,0.6)]">{network === "linkedin_page" ? "Page entreprise" : "Profil"}</p>
          <p className="flex items-center gap-1 text-[12px] text-[rgba(0,0,0,0.6)] dark:text-[rgba(255,255,255,0.6)]">
            Maintenant · <Globe2 className="size-3" />
          </p>
        </div>
        <MoreHorizontal className="size-5 text-neutral-500" />
      </div>
      <div className="whitespace-pre-line break-words px-4 py-3 leading-[1.45]">
        {caption ? <Truncated text={caption} limit={210} moreLabel="…plus" /> : <span className="text-neutral-400">Le texte apparaîtra ici.</span>}
      </div>
      {pdf ? (
        <div className="mx-0 border-y border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-[#24282c]">
          <div className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold">
            <FileText className="size-4 text-[#0a66c2]" />
            <span className="truncate">{pdf.name ?? "Document"}</span>
          </div>
          <div className="grid aspect-[4/5] max-h-[420px] place-items-center bg-white text-neutral-400 dark:bg-[#1b1f23]">
            <FileText className="size-12" />
          </div>
        </div>
      ) : (
        <ImageGrid images={images} />
      )}
      <div className="grid grid-cols-4 border-t border-neutral-200 px-1 py-1 text-[13px] font-semibold text-[rgba(0,0,0,0.6)] dark:border-neutral-700 dark:text-[rgba(255,255,255,0.6)]">
        {[
          [ThumbsUp, "J'aime"],
          [MessageCircle, "Commenter"],
          [Repeat2, "Republier"],
          [Send, "Envoyer"],
        ].map(([Icon, label]) => {
          const I = Icon as typeof ThumbsUp;
          return (
            <span key={label as string} className="flex items-center justify-center gap-1 py-2.5">
              <I className="size-4" /> <span className="hidden sm:inline">{label as string}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
