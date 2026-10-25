import type { Metadata } from "next";
import { Button, Card } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { removeFactor } from "./actions";
import { TwoFactorSetup } from "./two-factor";

export const metadata: Metadata = { title: "Réglages" };

export default async function SettingsPage() {
  const viewer = await getViewer();
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = (factors?.totp ?? []).filter((f) => f.status === "verified");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>

      <Card>
        <h2 className="font-medium">Profil</h2>
        <p className="mt-2 text-sm text-muted">
          Connecté en tant que <span className="text-text">{viewer.email}</span>
        </p>
      </Card>

      <Card>
        <h2 className="font-medium">Double authentification</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Un code TOTP est demandé à chaque connexion, en plus du mot de passe.
        </p>
        {totp.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {totp.map((factor) => (
              <li key={factor.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm">
                  <span className="text-success">Active</span>
                  <span className="text-muted">
                    {" "}
                    · {factor.friendly_name ?? "Application"} · depuis le{" "}
                    {new Date(factor.created_at).toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich" })}
                  </span>
                </span>
                <form action={removeFactor}>
                  <input type="hidden" name="factorId" value={factor.id} />
                  <Button type="submit" variant="danger">
                    Désactiver
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <TwoFactorSetup />
        )}
      </Card>
    </div>
  );
}
