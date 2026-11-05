import type { Metadata } from "next";
import { Fragment } from "react";
import { ExternalLink, Radar, RotateCw, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { getBusiness } from "@/lib/data";
import { formatDateTime, formatRelative } from "@/lib/format";
import { getVeille, type VeilleItem } from "@/lib/veille";
import { deleteItem, deleteSource, retryItem, toggleSource } from "./actions";
import { AddSourceForm, QueueLinkForm, RunnerSecret, SettingsForm } from "./forms";
import { TelegramCard } from "./telegram-card";

export const metadata: Metadata = { title: "Veille" };
// « Relancer » retranscrit et réécrit un message : jusqu'à deux minutes.
export const maxDuration = 300;

const STATUS: Record<VeilleItem["status"], { label: string; tone: string }> = {
  queued: { label: "En attente", tone: "text-muted" },
  processing: { label: "En cours", tone: "text-warning" },
  sent: { label: "Envoyé", tone: "text-success" },
  failed: { label: "Échec", tone: "text-danger" },
  seen: { label: "Ignoré", tone: "text-faint" },
};

/** Le message envoyé est du HTML Telegram produit par la fonction (gras, italique, texte échappé) : rendu sans HTML brut. */
function TelegramText({ html }: { html: string }) {
  const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return (
    <div className="flex flex-col gap-2 text-[13px] leading-relaxed">
      {html.split("\n\n").map((block, i) => (
        <p key={i} className="whitespace-pre-line">
          {block.split(/(<b>[\s\S]*?<\/b>|<i>[\s\S]*?<\/i>)/).map((part, j) =>
            part.startsWith("<b>") ? (
              <strong key={j}>{unescape(part.slice(3, -4))}</strong>
            ) : part.startsWith("<i>") ? (
              <em key={j} className="text-muted">
                {unescape(part.slice(3, -4))}
              </em>
            ) : (
              <Fragment key={j}>{unescape(part)}</Fragment>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

export default async function VeillePage({ params }: PageProps<"/b/[slug]/veille">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const { settings, sources, items, runner } = await getVeille(business.id);
  const ready = settings.connected && !!settings.chat_id;
  const sourceName = new Map(sources.map((s) => [s.id, s.handle]));

  return (
    <>
      <p className="max-w-2xl text-[13px] text-muted">
        Toutes les heures, chaque nouvelle vidéo des comptes surveillés est téléchargée, retranscrite, expliquée par l&apos;IA puis envoyée dans ton
        groupe Telegram. En cas de panne, une notification arrive sur ton téléphone.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Status label="Telegram" value={ready ? settings.chat_title! : settings.connected ? "Groupe à choisir" : "À connecter"} ok={ready} />
        <Status label="Comptes surveillés" value={String(sources.filter((s) => s.enabled).length)} ok={sources.some((s) => s.enabled)} />
        <Status
          label="Dernier passage"
          value={runner.last_run_at ? formatRelative(runner.last_run_at) : runner.configured ? "Pas encore" : "Tâche à activer"}
          ok={runner.last_ok === true}
          alert={runner.last_ok === false}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Groupe Telegram" description="Le bot qui publie, et où." />
          <TelegramCard businessId={business.id} slug={business.slug} settings={settings} />
        </Card>

        <Card>
          <CardHeader title="Comptes TikTok surveillés" description="Vérifiés toutes les heures. Au premier passage, seule la dernière vidéo est envoyée." />
          <div className="flex flex-col gap-3 p-5 pt-4 sm:p-6 sm:pt-4">
            {sources.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {sources.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <a href={`https://www.tiktok.com/@${s.handle}`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[14px] font-medium hover:underline">
                        @{s.handle}
                        <ExternalLink className="size-3 text-faint" />
                      </a>
                      <p className={cn("truncate text-[12px]", s.last_error ? "text-danger" : "text-muted")}>
                        {s.last_error ?? (s.last_checked_at ? `Vérifié ${formatRelative(s.last_checked_at)}` : "Pas encore vérifié")}
                      </p>
                    </div>
                    <form action={toggleSource}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="slug" value={business.slug} />
                      <input type="hidden" name="enabled" value={String(!s.enabled)} />
                      <button type="submit" className={cn("rounded-full px-2.5 py-1 text-[12px] font-medium", s.enabled ? "bg-fill text-text" : "bg-fill text-faint")}>
                        {s.enabled ? "Actif" : "En pause"}
                      </button>
                    </form>
                    <form action={deleteSource}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="slug" value={business.slug} />
                      <button type="submit" className="grid size-8 place-items-center rounded-full text-faint hover:bg-fill hover:text-danger" aria-label={`Ne plus surveiller @${s.handle}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
            <AddSourceForm businessId={business.id} slug={business.slug} />
            <div className="mt-2 border-t border-border pt-4">
              <p className="mb-2 text-[13px] font-medium">Traiter une vidéo précise</p>
              <QueueLinkForm businessId={business.id} slug={business.slug} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Style des messages" description="Consignes ajoutées à chaque explication." />
          <SettingsForm businessId={business.id} slug={business.slug} settings={settings} />
        </Card>

        <Card>
          <CardHeader title="Tâche automatique" description="Tourne sur GitHub toutes les heures (téléchargement des vidéos)." />
          <div className="flex flex-col gap-3 p-5 pt-4 text-[13px] sm:p-6 sm:pt-4">
            {runner.last_detail ? <p className={runner.last_ok === false ? "text-danger" : "text-muted"}>{runner.last_detail}</p> : null}
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>Génère la clé ci-dessous et copie-la.</li>
              <li>
                GitHub → dépôt <span className="font-medium text-text">bastienryser.space</span> → Settings → Secrets and variables → Actions → New repository
                secret : nom <code className="rounded bg-fill px-1">VEILLE_SECRET</code>, valeur = la clé.
              </li>
              <li>Onglet Actions → « veille » → Run workflow pour un premier passage tout de suite.</li>
            </ol>
            <RunnerSecret slug={business.slug} configured={runner.configured} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Historique" description={items.length ? `${items.length} dernière${items.length > 1 ? "s" : ""} vidéo${items.length > 1 ? "s" : ""} traitée${items.length > 1 ? "s" : ""}.` : undefined} />
        {items.length ? (
          <ul className="flex flex-col divide-y divide-border px-5 pb-2 pt-2 sm:px-6">
            {items.map((item) => (
              <li key={item.id} className="group flex flex-col gap-2 py-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-muted">
                      <span className={cn("font-medium", STATUS[item.status].tone)}>{STATUS[item.status].label}</span>
                      {" · "}
                      {item.source_id && sourceName.get(item.source_id) ? `@${sourceName.get(item.source_id)} · ` : ""}
                      {formatDateTime(item.sent_at ?? item.posted_at ?? item.created_at)}
                    </p>
                    <a href={item.url} target="_blank" rel="noreferrer noopener" className="mt-0.5 line-clamp-2 text-[14px] font-medium hover:underline">
                      {item.title || item.url}
                    </a>
                    {item.error ? <p className="mt-1 text-[12px] text-danger">{item.error}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {item.status === "failed" ? (
                      <form action={retryItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="businessId" value={business.id} />
                        <input type="hidden" name="slug" value={business.slug} />
                        <Button type="submit" size="sm" variant="secondary">
                          <RotateCw /> Relancer
                        </Button>
                      </form>
                    ) : null}
                    <form action={deleteItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="slug" value={business.slug} />
                      <button type="submit" className="grid size-8 place-items-center rounded-full text-faint hover:bg-fill hover:text-danger sm:opacity-0 sm:group-hover:opacity-100" aria-label="Supprimer de l'historique">
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  </div>
                </div>
                {item.message ? (
                  <details className="rounded-[14px] bg-fill px-4 py-3">
                    <summary className="cursor-pointer text-[13px] font-medium">Message envoyé</summary>
                    <div className="mt-3">
                      <TelegramText html={item.message} />
                    </div>
                  </details>
                ) : null}
                {item.transcript ? (
                  <details className="rounded-[14px] bg-fill px-4 py-3">
                    <summary className="cursor-pointer text-[13px] font-medium">Retranscription</summary>
                    <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-muted">{item.transcript}</p>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Radar />} title="Rien pour l'instant" description="Les vidéos traitées apparaîtront ici, avec le message envoyé et la retranscription." />
        )}
      </Card>
    </>
  );
}

function Status({ label, value, ok, alert }: { label: string; value: string; ok: boolean; alert?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-surface p-4 shadow-card">
      <span className={cn("size-2 shrink-0 rounded-full", alert ? "bg-danger" : ok ? "bg-green" : "bg-fill-strong")} />
      <div className="min-w-0">
        <p className="text-[12px] text-muted">{label}</p>
        <p className={cn("truncate text-[15px] font-semibold", alert && "text-danger")}>{value}</p>
      </div>
    </div>
  );
}
