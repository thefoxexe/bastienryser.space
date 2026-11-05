"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PaymentState = { ok?: boolean; error?: string; nonce?: number };

const CURRENCIES = ["chf", "eur", "usd", "gbp"] as const;

const schema = z.object({
  businessId: z.string().uuid(),
  slug: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
  // Virgule ou point, apostrophes de milliers acceptées (1'250,50).
  amount: z
    .string()
    .transform((v) => Number(v.replace(/['\s]/g, "").replace(",", ".")))
    .refine((v) => Number.isFinite(v) && v > 0 && v < 1e10, "Montant invalide."),
  currency: z.enum(CURRENCIES),
  client: z.string().trim().max(120).optional(),
  label: z.string().trim().min(1, "Indique la prestation.").max(160),
  method: z.string().trim().max(60).optional(),
  reference: z.string().trim().max(60).optional(),
});

/** Paiement reçu (devis, prestation) : enregistré comme revenu, compté partout dans les totaux. */
export async function addPayment(_prev: PaymentState, formData: FormData): Promise<PaymentState> {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  const p = parsed.data;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date());
  if (p.day > today) return { error: "La date ne peut pas être dans le futur : relève le paiement quand il est reçu." };
  const supabase = await createClient();
  const { error } = await supabase.from("ledger_entries").insert({
    business_id: p.businessId,
    kind: "income",
    day: p.day,
    amount: Math.round(p.amount * 100) / 100,
    currency: p.currency,
    client: p.client || null,
    label: p.label,
    category: p.method || null,
    reference: p.reference || null,
  });
  if (error) return { error: "Enregistrement impossible." };
  revalidatePath(`/b/${p.slug}`, "layout");
  revalidatePath("/");
  return { ok: true, nonce: Date.now() };
}

export async function deletePayment(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("ledger_entries").delete().eq("id", String(formData.get("id"))).eq("kind", "income");
  revalidatePath(`/b/${String(formData.get("slug"))}`, "layout");
  revalidatePath("/");
}
