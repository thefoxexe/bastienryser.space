import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArchiveRestore, Pencil, Plus, ShieldCheck } from "lucide-react";
import { BusinessMark } from "@/components/business-mark";
import { Page } from "@/components/shell/page";
import { Badge, Button, ButtonLink, Card, CardHeader, PageHeader } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { listBusinesses } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { removeFactor } from "./actions";
import { setArchived } from "./business/actions";
import { TwoFactorSetup } from "./two-factor";

export const metadata: Metadata = { title: "Réglages" };

export default async function SettingsPage() {
  const viewer = await getViewer();
  const supabase = await createClient();
  const [{ data: factors }, businesses] = await Promise.all([supabase.auth.mfa.listFactors(), listBusinesses(true)]);
  const totp = (factors?.totp ?? []).filter((f) => f.status === "verified");
  const active = businesses.filter((b) => !b.archived_at);
  const archived = businesses.filter((b) => b.archived_at);

  return (
    <Page>
      <PageHeader title="Réglages" description="Profil, sécurité du compte et gestion des business." />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="hidden flex-col gap-1 text-sm lg:flex">
          <a href="#profil" className="rounded-lg px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-text">Profil</a>
          <a href="#securite" className="rounded-lg px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-text">Sécurité</a>
          <a href="#business" className="rounded-lg px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-text">Business</a>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title={<span id="profil">Profil</span>} description="Le compte se gère dans Supabase : aucune inscription n'est possible ici." />
            <div className="flex items-center gap-4 p-5">
              <span className="grid size-11 place-items-center rounded-full bg-ink text-base font-semibold text-ink-text">
                {(viewer.email ?? "?")[0]?.toUpperCase()}
              </span>
              <div>
                <p className="text-sm font-medium">{viewer.email}</p>
                <p className="text-[13px] text-muted">Administrateur</p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title={<span id="securite">Double authentification</span>}
              description="Un code TOTP est demandé à chaque connexion, en plus du mot de passe."
              action={totp.length > 0 ? <Badge tone="success" dot>Active</Badge> : <Badge tone="warning" dot>Inactive</Badge>}
            />
            <div className="p-5">
              {totp.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {totp.map((factor) => (
                    <li key={factor.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-fill p-3.5">
                      <span className="flex items-center gap-3 text-sm">
                        <ShieldCheck className="size-5 text-text" />
                        <span>
                          {factor.friendly_name ?? "Application d'authentification"}
                          <span className="block text-[13px] text-muted">Activée le {formatDate(factor.created_at)}</span>
                        </span>
                      </span>
                      <form action={removeFactor}>
                        <input type="hidden" name="factorId" value={factor.id} />
                        <Button type="submit" variant="danger" size="sm">Désactiver</Button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <TwoFactorSetup />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={<span id="business">Business</span>}
              description="Créer, modifier ou archiver. Un business archivé disparaît de la barre latérale, ses données restent."
              action={
                <ButtonLink href="/reglages/business/nouveau" size="sm" variant="brand">
                  <Plus /> Nouveau
                </ButtonLink>
              }
            />
            <ul className="divide-y divide-border p-2 pt-4">
              {active.map((b) => (
                <li key={b.id} className="flex items-center gap-3 rounded-lg px-3 py-3">
                  <BusinessMark name={b.name} color={b.color} logoUrl={b.logo_url} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/b/${b.slug}`} className="text-sm font-medium hover:underline">{b.name}</Link>
                    <p className="truncate text-[13px] text-muted">{b.websites.map((w) => w.replace(/^https?:\/\//, "")).join(" · ") || b.description || `/b/${b.slug}`}</p>
                  </div>
                  <ButtonLink href={`/reglages/business/${b.slug}`} variant="ghost" size="icon" aria-label="Modifier">
                    <Pencil />
                  </ButtonLink>
                  <form action={setArchived}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="archive" value="1" />
                    <Button type="submit" variant="ghost" size="icon" aria-label="Archiver" title="Archiver">
                      <Archive />
                    </Button>
                  </form>
                </li>
              ))}
              {archived.map((b) => (
                <li key={b.id} className="flex items-center gap-3 rounded-lg px-3 py-3 opacity-60">
                  <BusinessMark name={b.name} color={b.color} logoUrl={b.logo_url} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{b.name}</p>
                    <p className="text-[13px] text-muted">Archivé le {formatDate(b.archived_at)}</p>
                  </div>
                  <form action={setArchived}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="archive" value="0" />
                    <Button type="submit" variant="secondary" size="sm">
                      <ArchiveRestore /> Restaurer
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </Page>
  );
}
