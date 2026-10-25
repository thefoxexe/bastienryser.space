import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";
import { Showcase } from "./showcase";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage() {
  // Le proxy n'amène ici une personne connectée que si son code TOTP manque encore.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const initialStep = data?.claims ? "totp" : "password";

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-5 py-16">
      {/* Trame fine qui s'efface vers les bords, et halo vert flou derrière le formulaire. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55] [background-image:radial-gradient(color-mix(in_oklab,var(--text)_14%,transparent)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--green-soft), transparent)" }}
      />
      <Showcase />

      <div className="relative w-full max-w-[380px]">
        <div className="animate-rise mb-8 flex flex-col items-center text-center">
          <LogoMark className="mb-6 size-14" title="bastienryser" />
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.035em]">Bon retour.</h1>
          <p className="mt-1.5 text-balance text-[15px] text-muted">Tes posts, tes chiffres, tes sites. Au même endroit.</p>
        </div>
        <div className="animate-rise rounded-[26px] bg-[color-mix(in_oklab,var(--surface)_82%,transparent)] p-5 pb-4 shadow-pop backdrop-blur-xl backdrop-saturate-150 [animation-delay:80ms] sm:p-6 sm:pb-5">
          <LoginForm initialStep={initialStep} />
        </div>
      </div>
      <p className="absolute bottom-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 text-[12px] text-faint">
        <span className="flex items-center gap-1.5">
          <Lock className="size-3" /> Accès privé · double authentification
        </span>
        <Link href="/confidentialite" className="transition hover:text-text">
          Confidentialité
        </Link>
        <Link href="/conditions" className="transition hover:text-text">
          Conditions
        </Link>
      </p>
    </main>
  );
}
