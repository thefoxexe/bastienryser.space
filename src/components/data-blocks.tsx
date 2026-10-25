import { formatValue } from "@/components/charts/format";

export const CHANNELS: Record<string, string> = {
  "Organic Search": "Recherche naturelle",
  Direct: "Accès direct",
  Referral: "Sites référents",
  "Organic Social": "Réseaux sociaux",
  "Paid Search": "Recherche payante",
  "Paid Social": "Réseaux sociaux payants",
  Email: "E-mail",
  Display: "Display",
  Unassigned: "Non attribué",
};
export const channelLabel = (key: string) => CHANNELS[key] ?? key;

export function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-1 font-[family-name:var(--font-display)] text-[24px] font-semibold leading-none tracking-[-0.03em]">{value}</dd>
    </div>
  );
}

/** Chemin seul pour le domaine principal du site Search Console, domaine + chemin pour les autres. */
export function pageLabel(url: string, siteUrl?: string) {
  const main = (siteUrl ?? "").replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, "");
  const match = url.match(/^https?:\/\/([^/]+)(\/.*)?$/);
  if (!match) return url;
  const host = match[1].replace(/^www\./, "");
  const path = match[2] ?? "/";
  return host === main ? path : `${host}${path === "/" ? "" : path}`;
}

/** Classement compact : libellé à gauche, colonnes de chiffres alignées à droite. */
export function Ranking({ title, columns, rows }: { title: string; columns: string[]; rows: { id: string; label: string; values: number[] }[] }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-end justify-between gap-3 text-[12px] text-muted">
        <span className="text-[13px] font-medium text-text">{title}</span>
        <span className="flex shrink-0 gap-4">
          {columns.map((c) => (
            <span key={c} className="w-12 text-right">
              {c}
            </span>
          ))}
        </span>
      </div>
      {rows.length ? (
        <ol className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <span className="min-w-0 truncate" title={r.id}>
                {r.label}
              </span>
              <span className="tabular flex shrink-0 gap-4 text-muted">
                {r.values.map((v, i) => (
                  <span key={i} className="w-12 text-right">
                    {Number.isInteger(v) ? formatValue(v, { kind: "number" }, true) : v.toLocaleString("fr-CH")}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-2 text-[13px] text-muted">Pas encore de données.</p>
      )}
    </div>
  );
}

/** Barres horizontales fines, valeur au bout ; une seule série, donc une seule teinte. */
export function Bars({ title, rows, unit }: { title: string; rows: { key: string; value: number }[]; unit: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="min-w-0">
      <p className="mb-3 text-[13px] font-medium">{title}</p>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.key} className="text-[13px]">
            <div className="mb-1 flex justify-between gap-3">
              <span className="truncate">{r.key}</span>
              <span className="tabular shrink-0 text-muted">
                {formatValue(r.value, { kind: "number" })} {unit}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-fill">
              <div className="h-full rounded-full bg-green shadow-[0_0_10px_var(--green-glow)]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
