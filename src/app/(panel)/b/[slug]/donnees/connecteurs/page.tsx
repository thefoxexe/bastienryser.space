import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, RefreshCw, Unplug } from "lucide-react";
import { BrandMark, BrandTile, type Brand } from "@/components/brand-logos";
import { Badge, Button, Card } from "@/components/ui";
import { getBusiness } from "@/lib/data";
import { formatRelative } from "@/lib/format";
import { listConnectors, type Connector } from "@/lib/metrics";
import { disconnectConnector, startGoogleConnect, syncConnectorNow } from "../actions";
import { ChooseProperty } from "./choose-property";
import { ConnectorForm } from "./connector-form";

export const metadata: Metadata = { title: "Connecteurs" };

type CatalogItem = {
  kind: Connector["kind"];
  name: string;
  tagline: string;
  data: string;
  steps: string[];
  brand: Brand;
  auth: "key" | "google";
};

const CATALOG: CatalogItem[] = [
  {
    kind: "search_console",
    name: "Google Search Console",
    tagline: "Ce que Google montre de ton site, et ce qu'on y clique.",
    data: "Clics, impressions et position moyenne par jour, requêtes et pages qui rapportent le plus. Google a 2 à 3 jours de décalage.",
    brand: "search_console",
    auth: "google",
    steps: ["Clique sur « Connecter avec Google » et choisis le compte qui gère la Search Console.", "Si plusieurs sites sont disponibles, choisis le bon."],
  },
  {
    kind: "google_analytics",
    name: "Google Analytics 4",
    tagline: "Fréquentation et provenance des visiteurs.",
    data: "Utilisateurs, sessions et pages vues par jour, pages les plus vues et canaux d'acquisition.",
    brand: "google_analytics",
    auth: "google",
    steps: ["Clique sur « Connecter avec Google » et choisis le compte qui a accès à la propriété GA4.", "Si plusieurs propriétés sont disponibles, choisis la bonne."],
  },
  {
    kind: "stripe",
    name: "Stripe",
    tagline: "Paiements encaissés, par jour et par devise.",
    data: "Encaissements, remboursements (en négatif, le jour où ils ont lieu), frais et nombre de paiements, sur 13 mois, synchronisés chaque heure.",
    brand: "stripe",
    auth: "key",
    steps: [
      "Stripe → Développeurs → Clés API → Créer une clé restreinte.",
      "Donner « Balance : lecture » et « Charges : lecture » (tout le reste sur Aucun).",
      "Coller la clé rk_live_… ci-dessous.",
    ],
  },
  {
    kind: "plausible",
    name: "Plausible Analytics",
    tagline: "Fréquentation du site, sans cookies.",
    data: "Visiteurs, visites et pages vues par jour, synchronisés chaque heure.",
    brand: "plausible",
    auth: "key",
    steps: ["Plausible → Paramètres du compte → Clés d'API → Nouvelle clé (Stats API).", "Indiquer le domaine exactement comme dans Plausible, puis coller la clé."],
  },
];

const ERRORS: Record<string, string> = {
  refuse: "La connexion Google a été annulée.",
  expire: "Le lien de connexion a expiré, recommence.",
  aucun_compte_google: "Ce compte Google n'a accès à aucun site Search Console ou propriété Analytics.",
  config: "La connexion Google n'est pas encore configurée (GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans les secrets Supabase).",
  echec: "La connexion Google a échoué. Vérifie que les API sont activées dans Google Cloud, puis réessaie.",
};

export default async function ConnectorsPage({ params, searchParams }: PageProps<"/b/[slug]/donnees/connecteurs">) {
  const { slug } = await params;
  const query = await searchParams;
  const business = await getBusiness(slug);
  const connectors = await listConnectors(business.id);
  const error = typeof query.erreur === "string" ? (ERRORS[query.erreur] ?? ERRORS.echec) : null;
  const google = typeof query.google === "string" ? query.google : null;

  return (
    <div className="flex flex-col gap-6">
      {google ? (
        <div className="flex items-center gap-2 rounded-[14px] bg-[color-mix(in_oklab,var(--success)_10%,transparent)] px-4 py-3 text-[14px] text-success">
          <CheckCircle2 className="size-4" />
          {google === "choisir" ? "Compte Google connecté. Choisis maintenant le site ou la propriété à suivre." : "Compte Google connecté, premiers chiffres importés."}
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center gap-2 rounded-[14px] bg-[color-mix(in_oklab,var(--danger)_9%,transparent)] px-4 py-3 text-[14px] text-danger">
          <AlertTriangle className="size-4" />
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {CATALOG.map((item) => {
          const c = connectors.find((x) => x.kind === item.kind);
          return (
            <Card key={item.kind} className="flex flex-col p-5 sm:p-6">
              <div className="flex items-start gap-3.5">
                <BrandTile brand={item.brand} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[17px] font-semibold">{item.name}</h2>
                    {c ? (
                      <Badge tone={c.status === "connected" ? "success" : c.status === "pending" ? "warning" : "danger"} dot>
                        {c.status === "connected" ? "Connecté" : c.status === "pending" ? "À finaliser" : "Erreur"}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted">{item.tagline}</p>
                </div>
              </div>

              {c ? (
                <div className="mt-5 flex flex-1 flex-col gap-4">
                  {c.status === "pending" ? (
                    <ChooseProperty
                      connectorId={c.id}
                      slug={business.slug}
                      options={c.config.options ?? []}
                      label={item.kind === "search_console" ? "Site à suivre" : "Propriété à suivre"}
                    />
                  ) : (
                    <div className="rounded-[14px] bg-fill p-4 text-[13px]">
                      <p className="font-medium">{c.label}</p>
                      <p className="mt-0.5 text-muted">
                        {c.last_sync_at ? `Dernière synchronisation ${formatRelative(c.last_sync_at)}` : "Pas encore synchronisé"} · ajouté {formatRelative(c.created_at)}
                      </p>
                      {c.last_error ? <p className="mt-2 text-danger">{c.last_error}</p> : null}
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    {c.status !== "pending" ? (
                      <form action={syncConnectorNow}>
                        <input type="hidden" name="connectorId" value={c.id} />
                        <input type="hidden" name="slug" value={business.slug} />
                        <Button type="submit" size="sm" variant="secondary">
                          <RefreshCw /> Synchroniser
                        </Button>
                      </form>
                    ) : null}
                    {item.auth === "google" ? (
                      <GoogleButton kind={item.kind} businessId={business.id} label="Reconnecter" variant="secondary" />
                    ) : (
                      <ConnectorForm kind={item.kind as "stripe" | "plausible"} businessId={business.id} slug={business.slug} defaultSiteId={c.config.site_id} reconnect />
                    )}
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
                <div className="mt-5 flex flex-1 flex-col gap-5">
                  <ol className="flex flex-col gap-2 text-[13px] text-muted">
                    {item.steps.map((s, i) => (
                      <li key={s} className="flex gap-2.5">
                        <span className="tabular mt-px grid size-5 shrink-0 place-items-center rounded-full bg-fill text-[11px] font-semibold text-text">{i + 1}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                  <div className="mt-auto">
                    {item.auth === "google" ? (
                      <GoogleButton kind={item.kind} businessId={business.id} label="Connecter avec Google" />
                    ) : (
                      <ConnectorForm
                        kind={item.kind as "stripe" | "plausible"}
                        businessId={business.id}
                        slug={business.slug}
                        defaultSiteId={business.websites[0]?.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}
                      />
                    )}
                  </div>
                </div>
              )}
              <p className="mt-5 border-t border-border pt-4 text-[12px] text-faint">{item.data}</p>
            </Card>
          );
        })}
      </div>

      <p className="text-[12px] text-faint">
        Les clés et les connexions Google sont chiffrées dans Supabase Vault ; seules les fonctions serveur les lisent. Accès en lecture seule. Seuls des chiffres réels venant des API sont
        affichés.
      </p>
    </div>
  );
}

function GoogleButton({ kind, businessId, label, variant = "primary" }: { kind: string; businessId: string; label: string; variant?: "primary" | "secondary" }) {
  return (
    <form action={startGoogleConnect}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="businessId" value={businessId} />
      {/* Bouton conforme à la charte Google : fond clair, « G » multicolore. */}
      <Button
        type="submit"
        size={variant === "primary" ? "md" : "sm"}
        variant="secondary"
        className={variant === "primary" ? "bg-white text-[#1f1f1f] shadow-[0_0_0_1px_#dadce0] hover:bg-[#f8f9fa]" : undefined}
      >
        <BrandMark brand="google" className="size-[16px]" />
        {label}
      </Button>
    </form>
  );
}
