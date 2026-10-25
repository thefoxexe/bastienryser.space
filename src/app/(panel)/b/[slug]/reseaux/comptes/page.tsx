import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Unplug } from "lucide-react";
import { NetworkChip, NetworkIcon } from "@/components/network-icon";
import { AccountStatusBadge, Badge, Button, Card } from "@/components/ui";
import { getBusiness, listAccounts } from "@/lib/data";
import { formatDate, formatRelative } from "@/lib/format";
import { NETWORKS } from "@/lib/social/networks";
import type { SocialNetwork } from "@/lib/types";
import { disconnectAccount, startOAuth } from "../actions";

export const metadata: Metadata = { title: "Comptes connectés" };

const PROVIDERS: {
  id: "meta" | "linkedin" | "linkedin_page" | null;
  networks: SocialNetwork[];
  title: string;
  description: string;
  note?: string;
}[] = [
  {
    id: "meta",
    networks: ["instagram", "facebook"],
    title: "Instagram et Page Facebook",
    description: "Un seul flux Meta connecte la Page Facebook et le compte Instagram professionnel qui lui est relié.",
  },
  {
    id: "linkedin",
    networks: ["linkedin"],
    title: "LinkedIn, profil personnel",
    description: "Posts, images et documents PDF sur ton profil.",
    note: "LinkedIn ne donne pas de statistiques détaillées pour un profil personnel via son API.",
  },
  {
    id: "linkedin_page",
    networks: ["linkedin_page"],
    title: "LinkedIn, page entreprise",
    description: "Nécessite l'accès « Community Management API » accordé par LinkedIn.",
  },
  {
    id: null,
    networks: ["threads"],
    title: "Threads",
    description: "Prévu dans un second temps.",
  },
];

const ERRORS: Record<string, string> = {
  refuse: "La connexion a été annulée.",
  expire: "Le lien de connexion a expiré, recommence.",
  aucun_compte: "Aucun compte trouvé. Vérifie que le compte Instagram est professionnel et relié à une Page dont tu es admin.",
  config: "L'application du réseau n'est pas encore configurée (identifiants manquants dans les secrets Supabase).",
  echec: "La connexion a échoué. Réessaie dans un instant.",
};

export default async function AccountsPage({ params, searchParams }: PageProps<"/b/[slug]/reseaux/comptes">) {
  const { slug } = await params;
  const query = await searchParams;
  const business = await getBusiness(slug);
  const accounts = await listAccounts(business.id);
  const connected = typeof query.connecte === "string" ? Number(query.nombre ?? 0) : null;
  const error = typeof query.erreur === "string" ? (ERRORS[query.erreur] ?? ERRORS.echec) : null;

  return (
    <div className="flex flex-col gap-5 px-4 pb-16 sm:px-8">
      {connected !== null ? (
        <div className="flex items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--success)_25%,transparent)] bg-[color-mix(in_oklab,var(--success)_8%,transparent)] px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4" />
          Connexion réussie{connected ? ` : ${connected} compte${connected > 1 ? "s" : ""} relié${connected > 1 ? "s" : ""}` : ""}.
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-[color-mix(in_oklab,var(--danger)_25%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-4 py-3 text-sm text-danger">
          <AlertTriangle className="size-4" />
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {PROVIDERS.map((p) => {
          const list = accounts.filter((a) => p.networks.includes(a.network));
          return (
            <Card key={p.title} className="flex flex-col">
              <div className="flex items-start gap-3 p-5">
                <div className="flex -space-x-2">
                  {p.networks.map((n) => (
                    <NetworkChip key={n} network={n} className="size-9 ring-2 ring-surface" />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold tracking-tight">{p.title}</h3>
                  <p className="mt-0.5 text-[13px] text-muted">{p.description}</p>
                </div>
                {p.id ? (
                  <form action={startOAuth}>
                    <input type="hidden" name="provider" value={p.id} />
                    <input type="hidden" name="businessId" value={business.id} />
                    <Button type="submit" size="sm" variant={list.length ? "secondary" : "primary"}>
                      {list.length ? <RefreshCw /> : null}
                      {list.length ? "Reconnecter" : "Connecter"}
                    </Button>
                  </form>
                ) : (
                  <Badge>Bientôt</Badge>
                )}
              </div>

              {list.length ? (
                <ul className="mx-5 mb-5 divide-y divide-border rounded-xl border border-border">
                  {list.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 p-3">
                      {a.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.avatar_url} alt="" className="size-9 rounded-full object-cover" />
                      ) : (
                        <span className="grid size-9 place-items-center rounded-full bg-surface-2">
                          <NetworkIcon network={a.network} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {a.display_name}
                          {a.username ? <span className="font-normal text-muted"> @{a.username}</span> : null}
                        </p>
                        <p className="flex items-center gap-1 text-[12px] text-muted">
                          <NetworkIcon network={a.network} className="size-3" />
                          {NETWORKS[a.network].label} · connecté {formatRelative(a.connected_at)}
                          {a.token_expires_at ? (
                            <>
                              {" "}
                              · <Clock className="size-3" /> expire le {formatDate(a.token_expires_at)}
                            </>
                          ) : null}
                        </p>
                        {a.last_error ? <p className="mt-1 text-[12px] text-danger">{a.last_error}</p> : null}
                      </div>
                      <AccountStatusBadge status={a.status} />
                      <form action={disconnectAccount}>
                        <input type="hidden" name="accountId" value={a.id} />
                        <Button type="submit" variant="ghost" size="icon" title="Déconnecter" aria-label="Déconnecter">
                          <Unplug />
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : null}
              {p.note ? <p className="mx-5 -mt-2 mb-5 text-[12px] text-faint">{p.note}</p> : null}
            </Card>
          );
        })}
      </div>

      <p className="text-[12px] text-faint">
        Les tokens d&apos;accès sont chiffrés dans Supabase Vault et ne sont lus que par les fonctions serveur. TikTok et YouTube arriveront plus tard.
      </p>
    </div>
  );
}
