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
    <main className="login-backdrop flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-5 grid size-11 place-items-center rounded-2xl bg-text text-lg font-bold text-bg shadow-pop">B</span>
          <h1 className="text-xl font-semibold tracking-tight">Connexion au panel</h1>
          <p className="mt-1 text-sm text-muted">Espace privé.</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-pop sm:p-7">
          <LoginForm initialStep={initialStep} />
        </div>
      </div>
    </main>
  );
}
