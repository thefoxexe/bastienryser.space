"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type EnrollState =
  | { status: "idle"; error?: string }
  | { status: "pending"; factorId: string; qrCode: string; secret: string; error?: string }
  | { status: "done" };

export async function startEnroll(): Promise<EnrollState> {
  await requireAdmin();
  const supabase = await createClient();

  // Nettoie un enrôlement abandonné, sinon Supabase refuse le nouveau.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Panel ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) {
    return { status: "idle", error: "Impossible de démarrer l'activation. Réessaie." };
  }
  return { status: "pending", factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmEnroll(prev: EnrollState, formData: FormData): Promise<EnrollState> {
  await requireAdmin();
  if (prev.status !== "pending") return prev;

  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) {
    return { ...prev, error: "Le code contient 6 chiffres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: prev.factorId, code });
  if (error) {
    return { ...prev, error: "Code incorrect. Vérifie l'heure de ton téléphone et réessaie." };
  }

  revalidatePath("/reglages");
  return { status: "done" };
}

export async function removeFactor(formData: FormData) {
  await requireAdmin();
  const factorId = String(formData.get("factorId") ?? "");
  const supabase = await createClient();
  await supabase.auth.mfa.unenroll({ factorId });
  // Le jeton actuel reste en aal2 jusqu'à son renouvellement : on le rafraîchit tout de suite.
  await supabase.auth.refreshSession();
  revalidatePath("/reglages");
}
