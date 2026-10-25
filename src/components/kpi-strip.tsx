import { formatValue } from "@/components/charts/format";
import { KpiTile } from "@/components/kpi-tile";
import { PeriodChips } from "@/components/period-chips";
import { listPosts, metricsLast30Days } from "@/lib/data";
import { financeSummary, periodShort } from "@/lib/finance";
import { TIME_ZONE } from "@/lib/format";
import { metricSeries, siteStatuses, type SeriesPoint } from "@/lib/metrics";

type Biz = { id: string; slug: string; websites: string[] };

const sum = (s: SeriesPoint[] | null) => (s ? s.reduce((a, p) => a + p.value, 0) : null);

/** Fenêtre des posts à venir : depuis une heure (publication en cours) jusqu'à 14 jours. */
function upcomingWindow() {
  const now = Date.now();
  return { from: new Date(now - 3600_000).toISOString(), to: new Date(now + 14 * 86400_000).toISOString() };
}

/** Visiteurs par jour : Plausible si le business l'a, sinon Google Analytics (jamais les deux), additionnés entre business. */
export async function visitorSeries(businesses: { id: string }[], days: number) {
  const perBusiness = await Promise.all(
    businesses.map(async (b) => (await metricSeries({ businessId: b.id, metric: "visitors", days })) ?? (await metricSeries({ businessId: b.id, metric: "ga_users", days }))),
  );
  const present = perBusiness.filter((s): s is SeriesPoint[] => s !== null);
  return present.length ? present[0].map((p, i) => ({ day: p.day, value: present.reduce((a, s) => a + (s[i]?.value ?? 0), 0) })) : null;
}

/**
 * Les six chiffres clés, pour tous les business (accueil) ou un seul (son aperçu).
 * Chaque tuile mène à son détail : courbe dans le temps, classements, écritures.
 */
export async function KpiStrip({ businesses, business, period, base }: { businesses: Biz[]; business?: Biz; period: number; base: string }) {
  const scope = business ? [business] : businesses;
  const id = business?.id;
  const [visitors, finance, clicks, metrics, upcoming, sites] = await Promise.all([
    visitorSeries(scope, period),
    financeSummary(id, period),
    metricSeries({ businessId: id, metric: "search_clicks", trimTrailing: true, days: period }),
    metricsLast30Days(id),
    listPosts({
      businessId: id,
      statuses: ["scheduled", "publishing"],
      ...upcomingWindow(),
      order: "scheduled_asc",
      limit: 200,
    }),
    siteStatuses(businesses, id),
  ]);

  // Détails : pages du business, ou vues comparées entre business depuis l'accueil.
  const q = `?periode=${period}`;
  const link = business
    ? {
        visites: `/b/${business.slug}/donnees/visites${q}`,
        finances: `/b/${business.slug}/donnees/finances${q}`,
        recherche: `/b/${business.slug}/donnees/recherche${q}`,
        reseaux: `/b/${business.slug}/reseaux/historique`,
        posts: `/b/${business.slug}/reseaux/calendrier`,
        sites: `/b/${business.slug}/donnees/sites`,
        connect: `/b/${business.slug}/donnees/connecteurs`,
      }
    : {
        visites: `/stats/visites${q}`,
        finances: `/stats/finances${q}`,
        recherche: `/stats/recherche${q}`,
        reseaux: "/stats/reseaux",
        posts: "/#calendrier",
        sites: "/#sites",
        connect: businesses[0] ? `/b/${businesses[0].slug}/donnees/connecteurs` : "/reglages/business/nouveau",
      };

  const money = { kind: "currency", currency: finance.currency } as const;
  const hasMoney = finance.hasStripe || finance.hasEntries;
  const measured = sites.filter((s) => s.uptime30d !== null);
  const uptime = measured.length ? measured.reduce((a, s) => a + (s.uptime30d ?? 0), 0) / measured.length : null;
  const down = sites.filter((s) => s.last && !s.last.ok).length;
  const reach = metrics.reduce<number | null>((a, m) => (m.reach === null ? a : (a ?? 0) + m.reach), null);
  const published = metrics.reduce((a, m) => a + m.posts, 0);
  const next = upcoming[0]?.scheduled_at;

  return (
    <>
      <div className="-mb-2 flex justify-end">
        <PeriodChips base={base} current={period} />
      </div>
      <section aria-label="Chiffres clés" className="animate-rise grid grid-cols-2 gap-3 [animation-delay:40ms] md:grid-cols-3 2xl:grid-cols-6">
        <KpiTile
          label={`Visiteurs · ${periodShort(period)}`}
          amount={visitors ? sum(visitors) : null}
          format={{ kind: "number" }}
          trend={visitors?.map((p) => p.value)}
          empty="Connecter"
          href={link.connect}
          link={link.visites}
        />
        <KpiTile
          label={`Résultat · ${periodShort(period)}`}
          amount={hasMoney ? finance.totals.net : null}
          format={money}
          hint={`Encaissé : ${formatValue(finance.totals.income, money)}`}
          trend={finance.net.map((p) => p.value)}
          empty="Stripe ou saisie"
          href={link.finances}
          link={link.finances}
        />
        <KpiTile
          label={`Clics Google · ${periodShort(period)}`}
          amount={clicks ? sum(clicks) : null}
          format={{ kind: "number" }}
          trend={clicks?.map((p) => p.value)}
          empty="Connecter"
          href={link.connect}
          link={link.recherche}
        />
        <KpiTile
          label="Portée réseaux · 30 j"
          amount={reach}
          format={{ kind: "number" }}
          hint={`${published} publication${published > 1 ? "s" : ""}`}
          empty="Aucune statistique"
          href={link.reseaux}
          link={link.reseaux}
        />
        <KpiTile
          label="Posts prévus · 14 j"
          amount={upcoming.length}
          format={{ kind: "number" }}
          hint={
            next
              ? `Prochain : ${new Intl.DateTimeFormat("fr-CH", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" }).format(new Date(next))}`
              : "Rien de programmé"
          }
          empty=""
          href={link.posts}
          link={link.posts}
        />
        <KpiTile
          label="Disponibilité · 30 j"
          amount={uptime}
          format={{ kind: "percent" }}
          hint={down ? `${down} site${down > 1 ? "s" : ""} injoignable${down > 1 ? "s" : ""}` : `${measured.length} site${measured.length > 1 ? "s" : ""} surveillé${measured.length > 1 ? "s" : ""}`}
          alert={down > 0}
          empty="Ajouter un site"
          href={business ? `/reglages/business/${business.slug}` : "/reglages"}
          link={link.sites}
        />
      </section>
    </>
  );
}
