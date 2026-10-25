"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CalendarClock, Check, Languages, Loader2, Plug, RotateCcw, Send, Sparkles } from "lucide-react";
import { NetworkIcon } from "@/components/network-icon";
import { Button, Card, FormError, Input, Textarea } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { adaptCaptions, translateCaption } from "@/app/(panel)/b/[slug]/reseaux/ai";
import { createUploadTarget, savePost } from "@/app/(panel)/b/[slug]/reseaux/actions";
import { isoToZurichLocal, zurichLocalToIso } from "@/lib/format";
import { checkTarget, countChars, countHashtags, NETWORK_ORDER, NETWORKS, type Issue } from "@/lib/social/networks";
import { createUploadClient } from "@/lib/supabase/browser";
import type { SocialAccount, SocialNetwork } from "@/lib/types";
import { imageSize, toJpeg } from "./client-media";
import { MediaPicker, type MediaItem } from "./media-picker";
import { NetworkPreview } from "./previews";

export type ComposerInitial = {
  postId: string;
  title: string;
  media: MediaItem[];
  targets: { accountId: string; caption: string }[];
  scheduledAt: string | null;
};

type Props = {
  business: { id: string; slug: string; name: string; color: string };
  accounts: SocialAccount[];
  initial?: ComposerInitial;
};

function defaultScheduleLocal() {
  // Demain à 9 h, heure de Zurich.
  const tomorrow = new Date(Date.now() + 86400_000);
  return isoToZurichLocal(tomorrow.toISOString()).slice(0, 10) + "T09:00";
}

export function Composer({ business, accounts, initial }: Props) {
  const router = useRouter();
  const usable = accounts.filter((a) => NETWORKS[a.network].available);

  // Description commune + surcharges par réseau, reconstituées depuis un post existant.
  const initialState = useMemo(() => {
    const common = initial?.targets[0]?.caption ?? "";
    const overrides: Partial<Record<SocialNetwork, string>> = {};
    for (const t of initial?.targets ?? []) {
      const account = accounts.find((a) => a.id === t.accountId);
      if (account && t.caption !== common) overrides[account.network] = t.caption;
    }
    return { common, overrides };
  }, [initial, accounts]);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [media, setMedia] = useState<MediaItem[]>(initial?.media ?? []);
  const [selected, setSelected] = useState<string[]>(initial?.targets.map((t) => t.accountId) ?? (usable.length === 1 ? [usable[0].id] : []));
  const [common, setCommon] = useState(initialState.common);
  const [overrides, setOverrides] = useState(initialState.overrides);
  const [tab, setTab] = useState<"common" | SocialNetwork>("common");
  const [mode, setMode] = useState<"now" | "schedule">(initial?.scheduledAt ? "schedule" : "now");
  const [scheduleLocal, setScheduleLocal] = useState(initial?.scheduledAt ? isoToZurichLocal(initial.scheduledAt) : defaultScheduleLocal());
  const [error, setError] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [aiBusy, setAiBusy] = useState<null | "adapt" | "de" | "it">(null);
  const [saving, startSaving] = useTransition();
  const [previewNetwork, setPreviewNetwork] = useState<SocialNetwork | null>(null);

  const selectedAccounts = usable.filter((a) => selected.includes(a.id));
  const networks = NETWORK_ORDER.filter((n) => selectedAccounts.some((a) => a.network === n));
  const captionFor = (n: SocialNetwork) => overrides[n] ?? common;
  const readyMedia = media.filter((m) => m.status === "ready");
  const uploading = media.some((m) => m.status === "uploading");

  const issues = new Map<SocialNetwork, Issue[]>();
  for (const n of networks) issues.set(n, checkTarget(n, captionFor(n), readyMedia));
  const blocking = [...issues.values()].flat().filter((i) => i.level === "error");

  const activeNetwork = previewNetwork && networks.includes(previewNetwork) ? previewNetwork : networks[0];
  const previewAccount = selectedAccounts.find((a) => a.network === activeNetwork);

  async function handleFiles(files: File[]) {
    const supabase = createUploadClient();
    for (const original of files) {
      const key = crypto.randomUUID();
      const isPdf = original.type === "application/pdf";
      setMedia((prev) => [
        ...prev,
        {
          key,
          status: "uploading",
          storagePath: null,
          kind: isPdf ? "pdf" : "image",
          mimeType: original.type,
          size: original.size,
          width: null,
          height: null,
          previewUrl: isPdf ? null : URL.createObjectURL(original),
          name: original.name,
        },
      ]);
      const update = (patch: Partial<MediaItem>) => setMedia((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
      try {
        if (!isPdf && !["image/jpeg", "image/png", "image/webp"].includes(original.type)) throw new Error("Format non pris en charge");
        const file = isPdf ? original : await toJpeg(original);
        const dims = isPdf ? null : await imageSize(file);
        const target = await createUploadTarget({ businessId: business.id, mimeType: file.type, size: file.size });
        if ("error" in target) throw new Error(target.error);
        const { error: uploadError } = await supabase.storage.from("media").uploadToSignedUrl(target.path, target.token, file, { contentType: file.type });
        if (uploadError) throw new Error("Envoi interrompu");
        update({
          status: "ready",
          storagePath: target.path,
          mimeType: file.type,
          size: file.size,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
        });
      } catch (e) {
        update({ status: "error", error: e instanceof Error ? e.message : "Erreur" });
      }
    }
  }

  function toggleAccount(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function runAdapt() {
    setAiBusy("adapt");
    setAiMessage(null);
    const res = await adaptCaptions({ caption: common, networks, businessName: business.name, language: "fr" });
    setAiBusy(null);
    if (!res.ok) return setAiMessage({ tone: "error", text: res.error });
    setOverrides((prev) => ({ ...prev, ...res.data }));
    setTab(networks[0] ?? "common");
    setAiMessage({ tone: "info", text: "Descriptions adaptées par réseau. Relis chaque onglet avant de publier." });
  }

  async function runTranslate(target: "de" | "it") {
    const current = tab === "common" ? common : captionFor(tab);
    setAiBusy(target);
    setAiMessage(null);
    const res = await translateCaption({ text: current, target });
    setAiBusy(null);
    if (!res.ok) return setAiMessage({ tone: "error", text: res.error });
    if (tab === "common") setCommon(res.data);
    else setOverrides((prev) => ({ ...prev, [tab]: res.data }));
    setAiMessage({ tone: "info", text: `Traduit en ${target === "de" ? "allemand" : "italien"}. Relis avant de publier.` });
  }

  function submit(kind: "draft" | "now" | "schedule") {
    setError(null);
    if (uploading) return setError("Attends la fin de l'envoi des fichiers.");
    if (media.some((m) => m.status === "error")) return setError("Retire les fichiers en erreur.");
    let scheduledAt: string | null = null;
    if (kind === "schedule") {
      if (!scheduleLocal) return setError("Choisis une date et une heure.");
      scheduledAt = zurichLocalToIso(scheduleLocal);
    }
    startSaving(async () => {
      const res = await savePost({
        postId: initial?.postId ?? null,
        businessId: business.id,
        title,
        media: readyMedia.map((m) => ({
          storagePath: m.storagePath!,
          kind: m.kind,
          mimeType: m.mimeType,
          size: m.size,
          width: m.width,
          height: m.height,
        })),
        targets: selectedAccounts.map((a) => ({ accountId: a.id, caption: captionFor(a.network) })),
        mode: kind,
        scheduledAt,
      });
      if (res.error) return setError(res.error);
      router.push(`/b/${business.slug}/reseaux/posts/${res.postId}`);
      router.refresh();
    });
  }

  const currentText = tab === "common" ? common : captionFor(tab);
  const currentRules = tab === "common" ? null : NETWORKS[tab];
  const strictestMax = networks.length ? Math.min(...networks.map((n) => NETWORKS[n].maxChars)) : null;

  return (
    <div className="grid gap-6 px-4 pb-16 sm:px-8 xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="flex min-w-0 flex-col gap-5">
        {/* 1. Médias */}
        <Card className="p-5">
          <SectionTitle step={1} title="Images" hint={readyMedia.length > 1 ? `Carrousel de ${readyMedia.length} · glisse pour réordonner` : undefined} />
          <MediaPicker items={media} onChange={setMedia} onFiles={handleFiles} />
        </Card>

        {/* 2. Comptes */}
        <Card className="p-5">
          <SectionTitle step={2} title="Comptes" hint={selected.length ? `${selected.length} sélectionné${selected.length > 1 ? "s" : ""}` : undefined} />
          {usable.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {usable.map((a) => {
                const on = selected.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAccount(a.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 text-left transition",
                      on ? "border-accent bg-[color-mix(in_oklab,var(--accent)_6%,var(--surface))] ring-1 ring-accent" : "border-border hover:border-border-strong",
                    )}
                  >
                    <span className="relative">
                      {a.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.avatar_url} alt="" className="size-9 rounded-full object-cover" />
                      ) : (
                        <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-[12px] font-semibold text-muted">{a.display_name[0]}</span>
                      )}
                      <span className="absolute -bottom-1 -right-1 grid size-[18px] place-items-center rounded-full border border-border bg-surface">
                        <NetworkIcon network={a.network} className="size-[11px]" />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.display_name}</span>
                      <span className="block text-[12px] text-muted">
                        {NETWORKS[a.network].label}
                        {a.status !== "connected" ? <span className="text-warning"> · {a.status === "expired" ? "expiré" : "à renouveler"}</span> : null}
                      </span>
                    </span>
                    <span className={cn("grid size-5 place-items-center rounded-md border transition", on ? "border-accent bg-accent text-accent-text" : "border-border-strong")}>
                      {on ? <Check className="size-3.5" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border-strong p-4 text-sm text-muted sm:flex-row sm:items-center">
              <Plug className="size-5" />
              <span className="flex-1">Aucun compte connecté pour {business.name}.</span>
              <Link href={`/b/${business.slug}/reseaux/comptes`} className="font-medium text-text underline-offset-4 hover:underline">
                Connecter un compte
              </Link>
            </div>
          )}
        </Card>

        {/* 3. Description */}
        <Card className="p-5">
          <SectionTitle step={3} title="Description" />
          <div className="mb-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre interne (facultatif, pour t'y retrouver)" className="h-9" />
          </div>

          <div className="scrollbar-none mb-3 flex gap-1 overflow-x-auto border-b border-border">
            <TabButton active={tab === "common"} onClick={() => setTab("common")}>
              Commune
            </TabButton>
            {networks.map((n) => {
              const errs = issues.get(n)?.some((i) => i.level === "error");
              return (
                <TabButton key={n} active={tab === n} onClick={() => setTab(n)}>
                  <NetworkIcon network={n} className="size-3.5" />
                  {NETWORKS[n].label}
                  {overrides[n] !== undefined ? <span className="size-1.5 rounded-full bg-accent" title="Personnalisée" /> : null}
                  {errs ? <AlertTriangle className="size-3.5 text-danger" /> : null}
                </TabButton>
              );
            })}
          </div>

          <Textarea
            value={currentText}
            onChange={(e) => {
              const v = e.target.value;
              if (tab === "common") setCommon(v);
              else setOverrides((prev) => ({ ...prev, [tab]: v }));
            }}
            placeholder={tab === "common" ? "Écris la description commune à tous les réseaux…" : `Version ${NETWORKS[tab].label}…`}
            className="min-h-48 text-[15px]"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
            <span className="tabular">
              {countChars(currentText).toLocaleString("fr-CH")}
              {currentRules ? ` / ${currentRules.maxChars.toLocaleString("fr-CH")}` : strictestMax ? ` · max ${strictestMax.toLocaleString("fr-CH")} (le plus strict)` : ""} caractères ·{" "}
              {countHashtags(currentText)} hashtag{countHashtags(currentText) > 1 ? "s" : ""}
              {currentRules?.maxHashtags ? ` / ${currentRules.maxHashtags}` : ""}
            </span>
            {tab !== "common" && overrides[tab] !== undefined ? (
              <button
                type="button"
                onClick={() =>
                  setOverrides((prev) => {
                    const next = { ...prev };
                    delete next[tab];
                    return next;
                  })
                }
                className="inline-flex items-center gap-1 hover:text-text"
              >
                <RotateCcw className="size-3" /> Revenir à la description commune
              </button>
            ) : null}
          </div>

          {tab !== "common" ? <IssueList issues={issues.get(tab) ?? []} /> : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-2 p-2">
            <span className="flex items-center gap-1.5 px-2 text-[12px] font-medium text-muted">
              <Sparkles className="size-3.5" /> IA
            </span>
            <Button type="button" size="sm" variant="secondary" disabled={!!aiBusy || !common.trim() || !networks.length} onClick={runAdapt}>
              {aiBusy === "adapt" ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Adapter à chaque réseau
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={!!aiBusy || !currentText.trim()} onClick={() => runTranslate("de")}>
              {aiBusy === "de" ? <Loader2 className="animate-spin" /> : <Languages />}
              Allemand
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={!!aiBusy || !currentText.trim()} onClick={() => runTranslate("it")}>
              {aiBusy === "it" ? <Loader2 className="animate-spin" /> : <Languages />}
              Italien
            </Button>
          </div>
          {aiMessage ? (
            <p className={cn("mt-2 text-[12px]", aiMessage.tone === "error" ? "text-danger" : "text-muted")}>{aiMessage.text}</p>
          ) : null}
        </Card>

        {/* 4. Publication */}
        <Card className="p-5">
          <SectionTitle step={4} title="Publication" />
          <div className="grid gap-2 sm:grid-cols-2">
            <ModeCard active={mode === "now"} onClick={() => setMode("now")} icon={<Send />} title="Publier maintenant" description="Envoyé dans la minute." />
            <ModeCard active={mode === "schedule"} onClick={() => setMode("schedule")} icon={<CalendarClock />} title="Programmer" description="Date et heure de Zurich." />
          </div>
          {mode === "schedule" ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Input type="datetime-local" value={scheduleLocal} onChange={(e) => setScheduleLocal(e.target.value)} className="w-auto" />
              <span className="text-[12px] text-muted">Fuseau Europe/Zurich</span>
            </div>
          ) : null}

          {networks.some((n) => (issues.get(n) ?? []).length) ? (
            <div className="mt-4 flex flex-col gap-2">
              {networks.map((n) =>
                (issues.get(n) ?? []).length ? (
                  <div key={n} className="flex items-start gap-2 text-[13px]">
                    <NetworkIcon network={n} className="mt-0.5 size-3.5" />
                    <IssueList issues={issues.get(n)!} compact />
                  </div>
                ) : null,
              )}
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-3">
            <FormError message={error} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="ghost" disabled={saving} onClick={() => submit("draft")}>
                Enregistrer le brouillon
              </Button>
              <Button
                type="button"
                disabled={saving || uploading || !selected.length || blocking.length > 0}
                onClick={() => submit(mode)}
                className="h-11 px-6"
              >
                {saving ? <Loader2 className="animate-spin" /> : mode === "now" ? <Send /> : <CalendarClock />}
                {mode === "now" ? "Publier maintenant" : "Programmer"}
              </Button>
            </div>
            <p className="text-[12px] text-muted">Rien ne part sans ton clic : l&apos;IA propose, tu valides.</p>
          </div>
        </Card>
      </div>

      {/* Aperçu */}
      <aside className="min-w-0">
        <div className="flex flex-col gap-3 xl:sticky xl:top-6">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium uppercase tracking-wide text-faint">Aperçu</span>
            {networks.length > 1 ? (
              <div className="flex gap-1 rounded-lg border border-border bg-surface-2 p-0.5">
                {networks.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPreviewNetwork(n)}
                    className={cn("grid size-7 place-items-center rounded-md transition", activeNetwork === n ? "bg-surface shadow-card" : "opacity-60 hover:opacity-100")}
                    title={NETWORKS[n].label}
                  >
                    <NetworkIcon network={n} className="size-3.5" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {activeNetwork && previewAccount ? (
            <NetworkPreview
              network={activeNetwork}
              name={previewAccount.display_name}
              username={previewAccount.username}
              avatarUrl={previewAccount.avatar_url}
              color={business.color}
              caption={captionFor(activeNetwork)}
              media={media.map((m) => ({ url: m.previewUrl, kind: m.kind, width: m.width, height: m.height, name: m.name }))}
            />
          ) : (
            <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-border-strong p-6 text-center text-[13px] text-muted">
              Choisis un compte pour voir l&apos;aperçu du post.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function SectionTitle({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="grid size-6 place-items-center rounded-full bg-surface-2 text-[12px] font-semibold text-muted ring-1 ring-border">{step}</span>
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {hint ? <span className="ml-auto text-[12px] text-muted">{hint}</span> : null}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 whitespace-nowrap px-3 pb-2.5 pt-1 text-[13px] transition",
        active ? "font-medium text-text" : "text-muted hover:text-text",
      )}
    >
      {children}
      {active ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
    </button>
  );
}

function ModeCard({ active, onClick, icon, title, description }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; description: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3.5 text-left transition [&_svg]:size-4",
        active ? "border-accent bg-[color-mix(in_oklab,var(--accent)_6%,var(--surface))] ring-1 ring-accent" : "border-border hover:border-border-strong",
      )}
    >
      <span className={cn("grid size-9 place-items-center rounded-lg", active ? "bg-accent text-accent-text" : "bg-surface-2 text-muted")}>{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[12px] text-muted">{description}</span>
      </span>
    </button>
  );
}

function IssueList({ issues, compact }: { issues: Issue[]; compact?: boolean }) {
  if (!issues.length) return null;
  return (
    <ul className={cn("flex flex-col gap-1", !compact && "mt-2")}>
      {issues.map((i, idx) => (
        <li key={idx} className={cn("text-[12px]", i.level === "error" ? "text-danger" : "text-warning")}>
          {i.message}
        </li>
      ))}
    </ul>
  );
}
