import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { missingConfig } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Configuration" };

// Affichée uniquement tant que Supabase n'est pas branché (voir src/proxy.ts).
export default function SetupPage() {
  if (!missingConfig.length) redirect("/connexion");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-16">
      <div className="animate-rise w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="mb-7 size-14" title="bastienryser" />
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em]">Presque prêt</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Le site est en ligne, mais la base de données n&apos;est pas encore branchée.
          </p>
        </div>
        <div className="rounded-2xl bg-surface p-5 shadow-card">
          <p className="text-[13px] font-medium">Variables manquantes dans Vercel</p>
          <ul className="mt-3 flex flex-col gap-2">
            {missingConfig.map((name) => (
              <li key={name} className="rounded-[10px] bg-fill px-3 py-2 font-mono text-[12px]">
                {name}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            Ajoute-les dans Vercel → Settings → Environment Variables, puis relance un déploiement (Deployments → Redeploy).
          </p>
        </div>
      </div>
    </main>
  );
}
