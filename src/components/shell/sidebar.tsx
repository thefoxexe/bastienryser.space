"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FolderKanban, LayoutGrid, LogOut, Menu, Plus, Settings, X } from "lucide-react";
import { BusinessMark } from "@/components/business-mark";
import { Logo, LogoMark } from "@/components/logo";
import { cn } from "@/components/ui/cn";
import { ThemeToggle } from "./theme-toggle";

export type SidebarBusiness = {
  slug: string;
  name: string;
  color: string;
  logo_url: string | null;
  alerts: number;
};

export function Sidebar({
  businesses,
  email,
  theme,
  alerts,
  dueTasks = 0,
}: {
  businesses: SidebarBusiness[];
  email: string | null;
  theme: "light" | "dark" | "system";
  alerts: number;
  /** Tâches de projet dues aujourd'hui ou en retard. */
  dueTasks?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = businesses.find((b) => pathname === `/b/${b.slug}` || pathname.startsWith(`/b/${b.slug}/`));

  const nav = (
    // Ferme le menu mobile dès qu'un lien est suivi.
    <div className="flex h-full flex-col" onClickCapture={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
      <div className="flex h-16 items-center px-5">
        <Link href="/" aria-label="Tableau de bord">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto grid size-8 place-items-center rounded-full text-muted hover:bg-[color-mix(in_oklab,var(--text)_6%,transparent)] lg:hidden"
          aria-label="Fermer le menu"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
        <NavLink href="/" active={pathname === "/"} icon={<LayoutGrid />} badge={alerts}>
          Tableau de bord
        </NavLink>
        <NavLink href="/projets" active={pathname === "/projets"} icon={<FolderKanban />} badge={dueTasks}>
          Projets
        </NavLink>

        <div className="mb-1 mt-7 flex items-center justify-between px-3">
          <span className="text-[12px] font-medium text-faint">Business</span>
          <Link
            href="/reglages/business/nouveau"
            className="grid size-6 place-items-center rounded-full text-faint transition hover:bg-[color-mix(in_oklab,var(--text)_6%,transparent)] hover:text-text"
            aria-label="Nouveau business"
          >
            <Plus className="size-3.5" />
          </Link>
        </div>
        <ul className="flex flex-col gap-px">
          {businesses.map((b) => {
            const active = current?.slug === b.slug;
            return (
              <li key={b.slug}>
                <Link
                  href={`/b/${b.slug}`}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[10px] px-3 py-[7px] text-[14px] transition-colors duration-150",
                    active ? "bg-[color-mix(in_oklab,var(--text)_8%,transparent)] font-medium text-text" : "text-muted hover:bg-[color-mix(in_oklab,var(--text)_5%,transparent)] hover:text-text",
                  )}
                >
                  <BusinessMark name={b.name} color={b.color} logoUrl={b.logo_url} size="sm" />
                  <span className="truncate">{b.name}</span>
                  {b.alerts > 0 ? <span className="ml-auto size-2 rounded-full bg-danger" aria-label={`${b.alerts} alerte(s)`} /> : null}
                </Link>
              </li>
            );
          })}
          {businesses.length === 0 ? <li className="px-3 py-1.5 text-[13px] text-faint">Aucun business</li> : null}
        </ul>
      </nav>

      <div className="flex flex-col gap-3 p-3">
        <NavLink href="/reglages" active={pathname.startsWith("/reglages")} icon={<Settings />}>
          Réglages
        </NavLink>
        <ThemeToggle initial={theme} />
        <div className="flex items-center gap-2.5 px-2 pb-1">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-ink-text">
            {(email ?? "?")[0]?.toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{email}</span>
          <form action="/deconnexion" method="post">
            <button
              type="submit"
              title="Se déconnecter"
              className="grid size-7 place-items-center rounded-full text-faint transition hover:bg-[color-mix(in_oklab,var(--text)_6%,transparent)] hover:text-text"
            >
              <LogOut className="size-3.5" />
              <span className="sr-only">Se déconnecter</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Barre du haut sur mobile */}
      <div className="sticky top-0 z-30 bg-[color-mix(in_oklab,var(--bg)_94%,transparent)] backdrop-blur-xl backdrop-saturate-150 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-3 border-b border-border px-4 pt-[env(safe-area-inset-top)] lg:hidden">
        <button type="button" onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-full" aria-label="Ouvrir le menu">
          <Menu className="size-[18px]" />
        </button>
        {current ? (
          <span className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">
            <BusinessMark name={current.name} color={current.color} logoUrl={current.logo_url} size="sm" />
            <span className="truncate">{current.name}</span>
          </span>
        ) : (
          <Link href="/" aria-label="Tableau de bord">
            <LogoMark small className="size-6" />
          </Link>
        )}
      </div>

      {/* Tiroir mobile */}
      <div className={cn("fixed inset-0 z-40 lg:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open}>
        <div className={cn("absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-300", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 w-[284px] max-w-[85vw] border-r border-border bg-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-pop transition-transform duration-300 ease-[var(--ease-apple)]",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {nav}
        </aside>
      </div>

      {/* Barre latérale fixe sur grand écran */}
      <aside className="material sticky top-0 hidden h-dvh w-[264px] shrink-0 border-r border-border lg:block">{nav}</aside>
    </>
  );
}

function NavLink({
  href,
  active,
  icon,
  badge,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-[10px] px-3 py-[7px] text-[14px] transition-colors duration-150 [&_svg]:size-[17px] [&_svg]:stroke-[1.75]",
        active ? "bg-[color-mix(in_oklab,var(--text)_8%,transparent)] font-medium text-text" : "text-muted hover:bg-[color-mix(in_oklab,var(--text)_5%,transparent)] hover:text-text",
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {badge ? (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1.5 text-[11px] font-semibold text-ink-text">{badge}</span>
      ) : null}
    </Link>
  );
}
