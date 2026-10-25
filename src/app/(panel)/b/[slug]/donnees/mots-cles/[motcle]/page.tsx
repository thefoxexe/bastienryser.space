import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AreaChart } from "@/components/charts/area-chart";
import { formatValue } from "@/components/charts/format";
import { PositionChart } from "@/components/charts/position-chart";
import { Card, CardHeader } from "@/components/ui";
import { getBusiness } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { keywordHistory, keywordRankings } from "@/lib/keywords";
import { lastDays } from "@/lib/metrics";
import { KeywordStar } from "../keyword-star";

export const metadata: Metadata = { title: "Mot-clé" };

export default async function KeywordPage({ params }: PageProps<"/b/[slug]/donnees/mots-cles/[motcle]">) {
  const { slug, motcle } = await params;
  const business = await getBusiness(slug);
  const query = decodeURIComponent(motcle);
  const [history, rankings] = await Promise.all([keywordHistory(business.id, query, 90), keywordRankings(business.id, 28)]);
  const row = rankings.find((r) => r.query === query);

  // 90 jours continus, jusqu'au dernier jour livré (les jours sans impression restent vides).
  const lastDay = history.at(-1)?.day;
  const byDay = new Map(history.map((h) => [h.day, h]));
  const days = lastDay ? lastDays(90, new Date(`${lastDay}T12:00:00Z`)) : [];
  const points = days.map((day) => byDay.get(day) ?? { day, clicks: 0, impressions: 0, position: null });
  const best = history.reduce<number | null>((m, h) => (h.position !== null && (m === null || h.position < m) ? h.position : m), null);
  const totalClicks = history.reduce((s, h) => s + h.clicks, 0);
  const totalImpr = history.reduce((s, h) => s + h.impressions, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/b/${business.slug}/donnees/mots-cles`} className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-text">
            <ArrowLeft className="size-3.5" /> Mots-clés
          </Link>
          <h2 className="truncate text-[28px] font-semibold tracking-[-0.03em]">{query}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {row?.first_seen ? `Vu dans Google depuis le ${formatDate(row.first_seen)}` : "Pas encore vu dans Google"}
            {row?.tracked ? " · suivi" : ""}
          </p>
        </div>
        <KeywordStar query={query} tracked={Boolean(row?.tracked)} businessId={business.id} slug={business.slug} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Position · 28 j" value={row?.position !== null && row?.position !== undefined ? row.position.toLocaleString("fr-CH") : "—"} />
        <Figure label="Meilleure position · 90 j" value={best !== null ? best.toLocaleString("fr-CH") : "—"} />
        <Figure label="Clics · 90 j" value={formatValue(totalClicks, { kind: "number" })} />
        <Figure label="Impressions · 90 j" value={formatValue(totalImpr, { kind: "number" })} />
      </div>

      <Card>
        <CardHeader title="Position dans Google" description="Chaque jour, position moyenne pondérée par les impressions. La bande verte correspond à la première page." />
        <div className="p-5 pt-6 sm:p-6">
          <PositionChart points={points} />
        </div>
      </Card>

      {totalClicks + totalImpr > 0 ? (
        <Card>
          <CardHeader title="Clics depuis Google" />
          <div className="p-5 pt-6 sm:p-6">
            <AreaChart points={points.map((p) => ({ day: p.day, value: p.clicks }))} format={{ kind: "number" }} label={`Clics pour « ${query} »`} height={150} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col justify-between gap-3 p-4 sm:p-5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="font-[family-name:var(--font-display)] text-[28px] font-semibold leading-none tracking-[-0.03em]">{value}</span>
    </Card>
  );
}
