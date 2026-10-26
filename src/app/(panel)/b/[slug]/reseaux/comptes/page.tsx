import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Unplug } from "lucide-react";
import { NetworkChip, NetworkIcon } from "@/components/network-icon";
import { AccountStatusBadge, Button, Card, CardHeader } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { getBusiness, listAccounts } from "@/lib/data";
import { formatDate, formatRelative } from "@/lib/format";
import { AUTO_REFRESH, NETWORKS } from "@/lib/social/networks";
import type { SocialAccount, SocialNetwork } from "@/lib/types";
import { disconnectAccount, setPinterestBoard, startOAuth } from "../actions";
import { BlueskyForm } from "./bluesky-form";

export const metadata: Metadata = { title: "Comptes connectés" };

type Provider = "meta" | "linkedin" | "linkedin_page" | "threads" | "youtube" | "tiktok" | "pinterest" | "x" | "bluesky";

const PROVIDERS: { id: Provider; networks: SocialNetwork[]; title: string; description: string; note?: string }[] = [
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
    id: "tiktok",
    networks: ["tiktok"],
    title: "TikTok",
    description: "Vidéos publiées sur ton compte, avec leurs vues et interactions.",
    note: "Tant que l'app TikTok n'a pas passé l'audit de TikTok, la vidéo arrive dans ta boîte de réception TikTok : tu la publies d'un geste depuis l'app.",
  },
  {
    id: "youtube",
    networks: ["youtube"],
    title: "YouTube",
    description: "Vidéos et Shorts sur ta chaîne, avec vues, likes et abonnés.",
    note: "Tant que le projet Google n'a pas passé l'audit YouTube, les vidéos envoyées par l'API restent privées : tu les passes en public dans YouTube Studio.",
  },
  {
    id: "meta",
    networks: ["instagram", "facebook"],
    title: "Instagram et Page Facebook",
    description: "Un seul flux Meta connecte la Page Facebook et le compte Instagram professionnel qui lui est relié. Images, carrousels et Reels.",
  },
  {
    id: "threads",
    networks: ["threads"],
    title: "Threads",
    description: "Texte, images, carrousels et vidéos.",
  },
  {
    id: "x",
    networks: ["x"],
    title: "X",
    description: "Posts et jusqu'à 4 images, avec impressions et interactions.",
    note: "L'API X est payante à l'usage : chaque post publié consomme des crédits de ton compte développeur X.",
  },
  {
    id: "bluesky",
    networks: ["bluesky"],
    title: "Bluesky",
    description: "Posts et jusqu'à 4 images. Connexion par mot de passe d'application, sans validation à attendre.",
  },
  {
    id: "pinterest",
    networks: ["pinterest"],
    title: "Pinterest",
    description: "Épingles (image ou carrousel) sur le tableau de ton choix, avec impressions et enregistrements.",
    note: "En accès « Trial », les épingles ne sont visibles que par toi ; l'accès « Standard » de Pinterest lève cette limite.",
  },
];

const ERRORS: Record<string, string> = {
  refuse: "La connexion a été annulée.",
  expire: "Le lien de connexion a expiré, recommence.",
  aucun_compte: "Aucun compte trouvé. Pour Instagram : compte professionnel relié à une Page dont tu es admin. Pour YouTube : le compte Google doit avoir une chaîne.",
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
    <div className="flex flex-col gap-5 px-4 pb-16 sm:px-10">
      {connected !== null ? (
        <div className="flex items-center gap-2 rounded-[14px] bg-[color-mix(in_oklab,var(--success)_10%,transparent)] px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4" />
          Connexion réussie{connected ? ` : ${connected} compte${connected > 1 ? "s" : ""} relié${connected > 1 ? "s" : ""}` : ""}.
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center gap-2 rounded-[14px] bg-[color-mix(in_oklab,var(--danger)_9%,transparent)] px-4 py-3 text-sm text-danger">
          <AlertTriangle className="size-4" />
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Comptes connectés"
          description={accounts.length ? `${accounts.length} compte${accounts.length > 1 ? "s" : ""} relié${accounts.length > 1 ? "s" : ""} à ${business.name}.` : `Aucun compte relié à ${business.name} pour l'instant.`}
        />
        {accounts.length ? (
          <ul className="divide-y divide-border px-2 pb-2 pt-1">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-[12px] px-3 py-3 sm:flex-nowrap">
                <span className="relative shrink-0">
                  {a.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.avatar_url} alt="" className="size-10 rounded-full object-cover" />
                  ) : (
                    <span className="grid size-10 place-items-center rounded-full bg-fill">
                      <NetworkIcon network={a.network} />
                    </span>
                  )}
                  <NetworkChip network={a.network} className="absolute -bottom-1 -right-1 size-5 rounded-full ring-2 ring-surface [&_svg]:size-[11px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">
                    {a.display_name}
                    {a.username ? <span className="font-normal text-muted"> @{a.username}</span> : null}
                  </p>
                  <p className="flex flex-wrap items-center gap-1 text-[12px] text-muted">
                    {NETWORKS[a.network].label} · connecté {formatRelative(a.connected_at)}
                    {AUTO_REFRESH.includes(a.network) ? (
                      " · renouvelé automatiquement"
                    ) : a.token_expires_at ? (
                      <>
                        {" "}
                        · <Clock className="size-3" /> expire le {formatDate(a.token_expires_at)}
                      </>
                    ) : null}
                  </p>
                  {a.last_error ? <p className="mt-1 text-[12px] text-danger">{a.last_error}</p> : null}
                  {a.network === "pinterest" ? <BoardPicker account={a} /> : null}
                </div>
                <AccountStatusBadge status={a.status} />
                <form action={disconnectAccount}>
                  <input type="hidden" name="accountId" value={a.id} />
                  <Button type="submit" variant="ghost" size="icon" title="Déconnecter" aria-label={`Déconnecter ${a.display_name}`}>
                    <Unplug />
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-[13px] text-muted sm:px-6">Choisis un réseau ci-dessous pour commencer.</p>
        )}
      </Card>

      <div>
        <h2 className="mb-3 px-1 text-[17px] font-semibold tracking-tight">Réseaux</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PROVIDERS.map((p) => {
            const count = accounts.filter((a) => p.networks.includes(a.network)).length;
            return (
              <Card key={p.id} className="flex flex-col p-5">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {p.networks.map((n) => (
                      <NetworkChip key={n} network={n} className="size-9 rounded-full bg-surface-2 ring-2 ring-surface" />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-semibold tracking-tight">{p.title}</h3>
                    <p className={cn("text-[12px]", count ? "font-medium text-green-text" : "text-faint")}>
                      {count ? `${count} compte${count > 1 ? "s" : ""} connecté${count > 1 ? "s" : ""}` : "Pas connecté"}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[13px] text-muted">{p.description}</p>
                {p.note ? <p className="mt-2 text-[12px] text-faint">{p.note}</p> : null}
                <div className="mt-auto pt-4">
                  {p.id === "bluesky" ? (
                    <>
                      <Button type="button" size="sm" variant={count ? "secondary" : "primary"} popoverTarget="bluesky-popover">
                        {count ? <RefreshCw /> : null}
                        {count ? "Reconnecter" : "Connecter"}
                      </Button>
                      <div
                        id="bluesky-popover"
                        popover="auto"
                        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[22px] bg-surface p-6 text-text shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-sm"
                      >
                        <h3 className="mb-1 text-[17px] font-semibold">Connecter Bluesky</h3>
                        <p className="mb-4 text-[13px] text-muted">Ton identifiant et un mot de passe d&apos;application, révocable à tout moment.</p>
                        <BlueskyForm businessId={business.id} connected={count > 0} />
                      </div>
                    </>
                  ) : (
                    <form action={startOAuth}>
                      <input type="hidden" name="provider" value={p.id} />
                      <input type="hidden" name="businessId" value={business.id} />
                      <Button type="submit" size="sm" variant={count ? "secondary" : "primary"}>
                        {count ? <RefreshCw /> : null}
                        {count ? "Reconnecter" : "Connecter"}
                      </Button>
                    </form>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <p className="text-[12px] text-faint">
        Les tokens d&apos;accès et mots de passe d&apos;application sont chiffrés dans Supabase Vault et ne sont lus que par les fonctions serveur.
      </p>
    </div>
  );
}

/** Tableau Pinterest où partent les épingles. */
function BoardPicker({ account }: { account: SocialAccount }) {
  const meta = (account.meta ?? {}) as { boards?: { id: string; name: string }[]; board_id?: string };
  const boards = meta.boards ?? [];
  if (!boards.length) return <p className="mt-1 text-[12px] text-danger">Aucun tableau : crée-en un sur Pinterest puis reconnecte le compte.</p>;
  return (
    <form action={setPinterestBoard} className="mt-2 flex items-center gap-2">
      <input type="hidden" name="accountId" value={account.id} />
      <label className="text-[12px] text-muted" htmlFor={`board-${account.id}`}>
        Tableau
      </label>
      <select
        id={`board-${account.id}`}
        name="boardId"
        defaultValue={meta.board_id ?? boards[0].id}
        className="h-8 rounded-lg bg-surface px-2 text-[13px] shadow-[0_0_0_0.5px_var(--border-strong)]"
      >
        {boards.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="ghost">
        Enregistrer
      </Button>
    </form>
  );
}
