import type { Metadata } from "next";
import { RefreshCw, Unplug } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { getBusiness } from "@/lib/data";
import { formatRelative } from "@/lib/format";
import { listConnectors, type Connector } from "@/lib/metrics";
import { disconnectConnector, syncConnectorNow } from "../actions";
import { ConnectorForm } from "./connector-form";

export const metadata: Metadata = { title: "Connecteurs" };

const CATALOG: {
  kind: Connector["kind"];
  name: string;
  tagline: string;
  data: string;
  steps: string[];
  mark: string;
}[] = [
  {
    kind: "stripe",
    name: "Stripe",
    tagline: "Paiements encaissés, par jour et par devise.",
    data: "Revenus (remboursements déduits) et nombre de paiements, synchronisés chaque heure.",
    mark: "S",
    steps: [
      "Stripe → Développeurs → Clés API → Créer une clé restreinte.",
      "Donner uniquement « Charges : lecture » (tout le reste sur Aucun).",
      "Coller la clé rk_live_… ci-dessous.",
    ],
  },
  {
    kind: "plausible",
    name: "Plausible Analytics",
    tagline: "Fréquentation du site, sans cookies.",
    data: "Visiteurs, visites et pages vues par jour, synchronisés chaque heure.",
    mark: "P",
    steps: ["Plausible → Paramètres du compte → Clés d'API → Nouvelle clé (Stats API).", "Indiquer le domaine exactement comme dans Plausible, puis coller la clé."],
  },
];

const SOON = [
  { name: "Google Search Console", text: "Clics et positions dans Google." },
  { name: "Google Analytics 4", text: "Pour les sites déjà équipés." },
  { name: "Bexio", text: "Factures et paiements en Suisse." },
];

export default async function ConnectorsPage({ params }: PageProps<"/b/[slug]/donnees/connecteurs">) {
  const { slug } = await params;
  const business = await getBusiness(slug);
  const connectors = await listConnectors(business.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {CATALOG.map((item) => {
          const c = connectors.find((x) => x.kind === item.kind);
          return (
            <Card key={item.kind} className="flex flex-col p-5 sm:p-6">
              <div className="flex items-start gap-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-ink font-[family-name:var(--font-display)] text-[18px] font-semibold text-ink-text">
                  {item.mark}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[17px] font-semibold">{item.name}</h2>
                    {c ? (
                      <Badge tone={c.status === "connected" ? "success" : "danger"} dot>
                        {c.status === "connected" ? "Connecté" : "Erreur"}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted">{item.tagline}</p>
                </div>
              </div>

              {c ? (
                <div className="mt-5 flex flex-col gap-4">
                  <div className="rounded-[14px] bg-fill p-4 text-[13px]">
                    <p className="font-medium">{c.label}</p>
                    <p className="mt-0.5 text-muted">
                      {c.last_sync_at ? `Dernière synchronisation ${formatRelative(c.last_sync_at)}` : "Pas encore synchronisé"} · ajouté {formatRelative(c.created_at)}
                    </p>
                    {c.last_error ? <p className="mt-2 text-danger">{c.last_error}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={syncConnectorNow}>
                      <input type="hidden" name="connectorId" value={c.id} />
                      <input type="hidden" name="slug" value={business.slug} />
                      <Button type="submit" size="sm" variant="secondary">
                        <RefreshCw /> Synchroniser
                      </Button>
                    </form>
                    <ConnectorForm kind={item.kind} businessId={business.id} slug={business.slug} defaultSiteId={c.config.site_id} reconnect />
                    <form action={disconnectConnector} className="ml-auto">
                      <input type="hidden" name="connectorId" value={c.id} />
                      <input type="hidden" name="slug" value={business.slug} />
                      <Button type="submit" size="sm" variant="ghost" title="Retire le connecteur, sa clé et ses chiffres">
                        <Unplug /> Retirer
                      </Button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="mt-5 flex flex-col gap-5">
                  <ol className="flex flex-col gap-2 text-[13px] text-muted">
                    {item.steps.map((s, i) => (
                      <li key={s} className="flex gap-2.5">
                        <span className="tabular mt-px grid size-5 shrink-0 place-items-center rounded-full bg-fill text-[11px] font-semibold text-text">{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                  <ConnectorForm kind={item.kind} businessId={business.id} slug={business.slug} defaultSiteId={business.websites[0]?.replace(/^https?:\/\//, "").replace(/\/.*$/, "")} />
                </div>
              )}
              <p className="mt-5 border-t border-border pt-4 text-[12px] text-faint">{item.data}</p>
            </Card>
          );
        })}
      </div>

      <div>
        <h2 className="mb-3 text-[17px] font-semibold">Bientôt</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SOON.map((s) => (
            <div key={s.name} className="rounded-2xl bg-fill p-4">
              <p className="text-[14px] font-medium">{s.name}</p>
              <p className="mt-0.5 text-[13px] text-muted">{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[12px] text-faint">
        Les clés sont testées puis chiffrées dans Supabase Vault ; seules les fonctions serveur les lisent. Seuls des chiffres réels venant des API sont affichés.
      </p>
    </div>
  );
}
