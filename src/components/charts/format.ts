export type ValueFormat = { kind: "number" } | { kind: "currency"; currency: string } | { kind: "ms" } | { kind: "percent" };

export function formatValue(v: number, f: ValueFormat, compact = false) {
  switch (f.kind) {
    case "currency":
      return new Intl.NumberFormat("fr-CH", {
        style: "currency",
        currency: f.currency.toUpperCase(),
        notation: compact && Math.abs(v) >= 10000 ? "compact" : "standard",
        maximumFractionDigits: compact ? 0 : 2,
      }).format(v);
    case "ms":
      return `${Math.round(v).toLocaleString("fr-CH")} ms`;
    case "percent":
      return `${v.toLocaleString("fr-CH", { maximumFractionDigits: v >= 99.95 || v === 0 ? 0 : 2 })} %`;
    default:
      return new Intl.NumberFormat("fr-CH", { notation: compact && Math.abs(v) >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(v);
  }
}

export function formatDay(day: string, withWeekday = false) {
  return new Intl.DateTimeFormat("fr-CH", { timeZone: "UTC", day: "numeric", month: "short", ...(withWeekday ? { weekday: "short" } : {}) }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

/** Graduation « propre » au-dessus du maximum (1, 2, 2.5, 5 × 10^n). */
export function niceMax(max: number) {
  if (max <= 0) return 1;
  const exp = Math.floor(Math.log10(max));
  const base = 10 ** exp;
  for (const m of [1, 2, 2.5, 5, 10]) if (m * base >= max) return m * base;
  return 10 * base;
}
