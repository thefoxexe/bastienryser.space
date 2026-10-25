import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage() {
  // Le proxy n'amène ici une personne connectée que si son code TOTP manque encore.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const initialStep = data?.claims ? "totp" : "password";

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">Connexion</h1>
        <div className="rounded-lg border border-border bg-surface p-6">
          <LoginForm initialStep={initialStep} />
        </div>
      </div>
    </main>
  );
}
