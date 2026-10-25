import Link from "next/link";
import { Button } from "@/components/ui";
import { getViewer } from "@/lib/auth";

export default async function PanelLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();

  if (!viewer.isAdmin) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
          <h1 className="text-lg font-semibold">Accès refusé</h1>
          <p className="mt-2 text-sm text-muted">
            Ce compte n&apos;est pas autorisé. Si la double authentification est active, reconnecte-toi avec ton code.
          </p>
          <form action="/deconnexion" method="post" className="mt-5">
            <Button type="submit" className="w-full">
              Se déconnecter
            </Button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="font-semibold tracking-tight">
            Panel
          </Link>
          <nav className="flex flex-1 items-center gap-4 text-sm text-muted">
            <Link href="/" className="hover:text-text">
              Tableau de bord
            </Link>
            <Link href="/reglages" className="hover:text-text">
              Réglages
            </Link>
          </nav>
          <form action="/deconnexion" method="post">
            <button type="submit" className="text-sm text-muted hover:text-text">
              Déconnexion
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
