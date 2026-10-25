"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { step: "password" | "totp"; error?: string; email?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  switch (formData.get("intent")) {
    case "password":
      return signInWithPassword(formData);
    case "totp":
      return verifyTotp(formData);
    default:
      return cancel();
  }
}

async function signInWithPassword(formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { step: "password", error: "Saisis ton e-mail et ton mot de passe.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Message volontairement vague : ne pas indiquer lequel des deux est faux.
    return { step: "password", error: "E-mail ou mot de passe incorrect.", email };
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    return { step: "totp" };
  }

  redirect("/");
}

async function verifyTotp(formData: FormData): Promise<LoginState> {
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) {
    return { step: "totp", error: "Le code contient 6 chiffres." };
  }

  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (listError || !factor) {
    return { step: "password", error: "Session expirée, reconnecte-toi." };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) {
    return { step: "totp", error: "Code incorrect ou expiré." };
  }

  redirect("/");
}

async function cancel(): Promise<LoginState> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return { step: "password" };
}
