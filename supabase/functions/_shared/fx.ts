// Taux de change officiels de la BCE (Frankfurter, sans clé) : une unité de devise vaut `chf` francs suisses.
// Premier passage : tout l'historique depuis 2015 ; ensuite seulement les jours manquants.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const CURRENCIES = ["EUR", "USD", "GBP", "CAD", "AUD", "JPY", "SEK", "NOK", "DKK", "PLN", "CZK"];

export async function syncFxRates(db: SupabaseClient): Promise<{ ok: boolean; days: number; error?: string }> {
  try {
    const { data: last } = await db.from("fx_rates").select("day").eq("currency", "eur").order("day", { ascending: false }).limit(1).maybeSingle();
    const today = new Date().toISOString().slice(0, 10);
    // Le dernier jour connu est relu : la BCE publie vers 16 h, un relevé du matin peut manquer.
    const start = last?.day ?? "2015-01-01";
    if (last?.day === today) return { ok: true, days: 0 };
    const res = await fetch(`https://api.frankfurter.dev/v1/${start}..?base=CHF&symbols=${CURRENCIES.join(",")}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { ok: false, days: 0, error: `Frankfurter a répondu ${res.status}.` };
    const body = (await res.json()) as { rates?: Record<string, Record<string, number>> };
    const rows = Object.entries(body.rates ?? {}).flatMap(([day, rates]) =>
      Object.entries(rates)
        .filter(([, r]) => r > 0)
        .map(([cur, r]) => ({ day, currency: cur.toLowerCase(), chf: Math.round((1 / r) * 1e8) / 1e8 })),
    );
    for (let i = 0; i < rows.length; i += 2000) {
      const { error } = await db.from("fx_rates").upsert(rows.slice(i, i + 2000), { onConflict: "currency,day" });
      if (error) return { ok: false, days: 0, error: "Enregistrement des taux impossible." };
    }
    return { ok: true, days: Object.keys(body.rates ?? {}).length };
  } catch (e) {
    console.error("fx", e);
    return { ok: false, days: 0, error: "Taux de change indisponibles." };
  }
}
