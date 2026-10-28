"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, VolumeX, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { videoFrame } from "./client-media";
import type { MediaItem } from "./media-picker";

const FRAMES = 6;

const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString("fr-CH", { maximumFractionDigits: 1 })} Mo`;

/** Vidéo seule : aperçu, infos (Reel, durée, conversion) et choix de la couverture. */
export function VideoPanel({
  item,
  onCover,
  onUploadCover,
}: {
  item: MediaItem;
  onCover: (patch: Partial<MediaItem>) => void;
  onUploadCover: (file: File) => Promise<void>;
}) {
  const player = useRef<HTMLVideoElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [frames, setFrames] = useState<{ ms: number; url: string }[]>([]);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const ready = item.status === "ready";
  const duration = item.durationMs ?? 0;
  const vertical = !!item.width && !!item.height && item.height > item.width;

  // Vignettes réparties sur la durée, extraites dans le navigateur.
  useEffect(() => {
    if (!ready || !item.previewUrl || !duration) return;
    let cancelled = false;
    const made: string[] = [];
    (async () => {
      const list: { ms: number; url: string }[] = [];
      for (let i = 0; i < FRAMES; i++) {
        const ms = Math.round((duration * (i + 0.5)) / FRAMES);
        try {
          const url = URL.createObjectURL(await videoFrame(item.previewUrl!, ms, 240));
          made.push(url);
          list.push({ ms, url });
        } catch {
          break;
        }
        if (cancelled) return;
      }
      if (!cancelled) setFrames(list);
    })();
    return () => {
      cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [ready, item.previewUrl, duration]);

  const pick = (ms: number) => {
    onCover({ coverMs: ms, coverPath: null, coverUrl: null });
    if (player.current) {
      player.current.pause();
      player.current.currentTime = ms / 1000;
    }
  };

  return (
    <div className="mt-4 grid gap-4 rounded-[16px] bg-fill p-3 sm:grid-cols-[168px_minmax(0,1fr)] sm:p-4">
      <div className="relative mx-auto aspect-[9/16] w-40 overflow-hidden rounded-[12px] bg-black sm:w-full">
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.coverUrl} alt="Couverture" className="size-full object-cover" />
        ) : item.previewUrl ? (
          <video ref={player} src={item.previewUrl} controls playsInline preload="metadata" className="size-full object-contain" />
        ) : null}
        {item.status === "uploading" ? (
          <div className="absolute inset-0 grid place-items-center bg-black/50">
            <Loader2 className="size-6 animate-spin text-white" />
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap gap-1.5 text-[12px]">
          <span className="rounded-full bg-ink px-2.5 py-0.5 font-medium text-ink-text">{vertical ? "Reel" : "Vidéo"}</span>
          {duration ? <Chip>{clock(duration)}</Chip> : null}
          {item.width && item.height ? (
            <Chip>
              {item.width} × {item.height}
            </Chip>
          ) : null}
          {item.status !== "uploading" || item.stage === "upload" ? <Chip>{mb(item.size)}</Chip> : null}
          {item.note ? <Chip>{item.note}</Chip> : null}
          {item.muted ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-warning">
              <VolumeX className="size-3" /> Son non conservé
            </span>
          ) : null}
        </div>

        {item.status === "uploading" ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[13px] text-muted">
              {item.stage === "convert"
                ? "Conversion pour les réseaux (1080p, H.264), sur ton appareil. Garde la page ouverte."
                : item.stage === "analyse"
                  ? "Analyse de la vidéo…"
                  : "Envoi de la vidéo…"}
            </p>
            {item.stage === "convert" ? (
              <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{ width: `${Math.round((item.progress ?? 0) * 100)}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}

        {item.status === "error" ? <p className="text-[13px] text-danger">{item.error}</p> : null}

        {ready ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium">Couverture</span>
              <span className="text-[12px] text-muted">{item.coverPath ? "Image importée" : clock(item.coverMs ?? 0)}</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {frames.length
                ? frames.map((f) => (
                    <button
                      key={f.ms}
                      type="button"
                      onClick={() => pick(f.ms)}
                      className={cn(
                        "aspect-[9/16] overflow-hidden rounded-[8px] bg-black transition",
                        !item.coverPath && Math.abs((item.coverMs ?? 0) - f.ms) < duration / FRAMES / 2 ? "shadow-[0_0_0_2px_var(--ink)]" : "opacity-75 hover:opacity-100",
                      )}
                      aria-label={`Couverture à ${clock(f.ms)}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt="" className="size-full object-cover" />
                    </button>
                  ))
                : Array.from({ length: FRAMES }, (_, i) => <span key={i} className="aspect-[9/16] animate-pulse rounded-[8px] bg-surface" />)}
            </div>
            <input
              type="range"
              min={0}
              max={duration}
              step={100}
              value={item.coverPath ? 0 : (item.coverMs ?? 0)}
              onChange={(e) => pick(Number(e.target.value))}
              aria-label="Choisir l'instant de la couverture"
              className="w-full accent-[var(--ink)]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={coverBusy}
                onClick={() => picker.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[12px] font-medium hover:bg-fill-strong"
              >
                {coverBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />} Importer une image
              </button>
              {item.coverPath ? (
                <button type="button" onClick={() => pick(item.coverMs ?? 0)} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-text">
                  <X className="size-3.5" /> Reprendre une image de la vidéo
                </button>
              ) : null}
              <input
                ref={picker}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setCoverBusy(true);
                  setCoverError(null);
                  try {
                    await onUploadCover(file);
                  } catch (err) {
                    setCoverError(err instanceof Error ? err.message : "Envoi impossible");
                  } finally {
                    setCoverBusy(false);
                  }
                }}
              />
            </div>
            {coverError ? <p className="text-[12px] text-danger">{coverError}</p> : null}
            <p className="text-[12px] text-muted">
              Utilisée par Instagram{item.coverPath ? "" : " et TikTok"}. Facebook et YouTube choisissent la leur.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="tabular rounded-full bg-surface px-2.5 py-0.5 text-muted">{children}</span>;
}
