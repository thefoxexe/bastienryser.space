export const TIME_ZONE = "Europe/Zurich";

const dateTime = new Intl.DateTimeFormat("fr-CH", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dateOnly = new Intl.DateTimeFormat("fr-CH", { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric" });
const timeOnly = new Intl.DateTimeFormat("fr-CH", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const compact = new Intl.NumberFormat("fr-CH", { notation: "compact", maximumFractionDigits: 1 });
const relative = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

export function formatDateTime(iso: string | null | undefined) {
  return iso ? dateTime.format(new Date(iso)) : "—";
}
export function formatDate(iso: string | null | undefined) {
  return iso ? dateOnly.format(new Date(iso)) : "—";
}
export function formatTime(iso: string) {
  return timeOnly.format(new Date(iso));
}
export function formatNumber(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : compact.format(n);
}

export function formatRelative(iso: string, now = Date.now()) {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "à l'instant";
  if (abs < 3600) return relative.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return relative.format(Math.round(diff / 86400), "day");
  return formatDate(iso);
}

/** Clé de jour AAAA-MM-JJ dans le fuseau de Zurich. */
export function zurichDayKey(date: Date | string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
  return parts;
}

/** Décalage (en minutes) de Zurich par rapport à UTC à un instant donné. */
function zurichOffsetMinutes(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Convertit « 2026-11-03T09:30 » (heure de Zurich) en instant ISO UTC. */
export function zurichLocalToIso(local: string) {
  const [d, t] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, day, hh, mm));
  const offset = zurichOffsetMinutes(guess);
  const result = new Date(guess.getTime() - offset * 60000);
  // Second passage pour les changements d'heure.
  const offset2 = zurichOffsetMinutes(result);
  return new Date(guess.getTime() - offset2 * 60000).toISOString();
}

/** Inverse : instant ISO → valeur d'un <input type="datetime-local"> à l'heure de Zurich. */
export function isoToZurichLocal(iso: string) {
  const at = new Date(iso);
  const shifted = new Date(at.getTime() + zurichOffsetMinutes(at) * 60000);
  return shifted.toISOString().slice(0, 16);
}
