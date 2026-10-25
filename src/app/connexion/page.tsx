import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage() {
  // Le proxy n'amène ici une personne connectée que si son code TOTP manque encore.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const initialStep = data?.claims ? "totp" : "password";

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-5 py-16">
      {/* Halo très discret derrière le monogramme. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[18%] size-[560px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--text) 7%, transparent), transparent)" }}
      />
      <div className="relative w-full max-w-[360px]">
        <div className="animate-rise mb-10 flex flex-col items-center text-center">
          <LogoMark className="mb-7 size-14" title="bastienryser" />
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em]">Connexion</h1>
          <p className="mt-1.5 text-[15px] text-muted">bastienryser.space</p>
        </div>
        <div className="animate-rise [animation-delay:80ms]">
          <LoginForm initialStep={initialStep} />
        </div>
      </div>
      <p className="absolute bottom-8 flex items-center gap-1.5 text-[12px] text-faint">
        <Lock className="size-3" /> Accès privé
      </p>
    </main>
  );
}
