import { cookies } from "next/headers";
import { ShieldAlert } from "lucide-react";
import { Sidebar } from "@/components/shell/sidebar";
import { SplashGate } from "@/components/splash-gate";
import { Assistant } from "@/components/ai/assistant";
import { Button } from "@/components/ui";
import { listAlerts } from "@/lib/alerts";
import { getViewer } from "@/lib/auth";
import { listBusinesses } from "@/lib/data";

export default async function PanelLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();

  if (!viewer.isAdmin) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm rounded-[22px] bg-surface p-7 shadow-pop">
          <div className="mb-4 grid size-10 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-danger">
            <ShieldAlert className="size-5" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Accès refusé</h1>
          <p className="mt-1.5 text-sm text-muted">
            Ce compte n&apos;est pas autorisé. Si la double authentification est active, reconnecte-toi avec ton code.
          </p>
          <form action="/deconnexion" method="post" className="mt-6">
            <Button type="submit" variant="brand" className="w-full">
              Se déconnecter
            </Button>
          </form>
        </div>
      </main>
    );
  }

  const [businesses, alerts, cookieStore] = await Promise.all([listBusinesses(), listAlerts(), cookies()]);
  const themeCookie = cookieStore.get("theme")?.value;
  const theme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : "system";

  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <Sidebar
        email={viewer.email}
        theme={theme}
        alerts={alerts.length}
        businesses={businesses.map((b) => ({
          slug: b.slug,
          name: b.name,
          color: b.color,
          logo_url: b.logo_url,
          alerts: alerts.filter((a) => a.business_id === b.id).length,
        }))}
      />
      {/* Marge basse : le bouton de l'assistant ne cache jamais la fin d'une page. */}
      <div className="min-w-0 flex-1 pb-[calc(84px+env(safe-area-inset-bottom))]">{children}</div>
      <Assistant />
      <SplashGate />
    </div>
  );
}
