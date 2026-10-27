// Calculs de durée partagés entre serveur et navigateur (pointage des heures).

/** Durée d'une session en minutes (une session en cours compte jusqu'à maintenant). */
export const minutesOf = (e: { started_at: string; ended_at: string | null }, now = Date.now()) =>
  Math.max(0, Math.round(((e.ended_at ? new Date(e.ended_at).getTime() : now) - new Date(e.started_at).getTime()) / 60000));

/** « 2 h 05 », « 45 min ». */
export const formatMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`);
