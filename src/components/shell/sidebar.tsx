"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, LogOut, Menu, Plus, Settings, X } from "lucide-react";
import { BusinessMark } from "@/components/business-mark";
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
}: {
  businesses: SidebarBusiness[];
  email: string | null;
  theme: "light" | "dark" | "system";
  alerts: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);


  const current = businesses.find((b) => pathname === `/b/${b.slug}` || pathname.startsWith(`/b/${b.slug}/`));

  const nav = (
    // Ferme le menu mobile dès qu'un lien est suivi.
    <div className="flex h-full flex-col" onClickCapture={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
      <div className="flex h-14 items-center gap-2.5 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-text text-[13px] font-bold text-bg">B</span>
          <span className="text-[15px] font-semibold tracking-tight">Panel</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 lg:hidden"
          aria-label="Fermer le menu"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <NavLink href="/" active={pathname === "/"} icon={<LayoutDashboard />} badge={alerts}>
          Tableau de bord
        </NavLink>

        <div className="mb-1.5 mt-6 flex items-center justify-between px-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Business</span>
          <Link
            href="/reglages/business/nouveau"
            className="grid size-5 place-items-center rounded-md text-faint hover:bg-surface-2 hover:text-text"
            aria-label="Nouveau business"
          >
            <Plus className="size-3.5" />
          </Link>
        </div>
        <ul className="flex flex-col gap-0.5">
          {businesses.map((b) => {
            const active = current?.slug === b.slug;
            return (
              <li key={b.slug}>
                <Link
                  href={`/b/${b.slug}`}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                    active ? "bg-surface text-text shadow-card ring-1 ring-border" : "text-muted hover:bg-surface-2 hover:text-text",
                  )}
                >
                  <BusinessMark name={b.name} color={b.color} logoUrl={b.logo_url} size="sm" />
                  <span className="truncate">{b.name}</span>
                  {b.alerts > 0 ? (
                    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] px-1.5 text-[11px] font-semibold text-danger">
                      {b.alerts}
                    </span>
                  ) : null}
                  {active ? <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full" style={{ background: b.color }} /> : null}
                </Link>
              </li>
            );
          })}
          {businesses.length === 0 ? <li className="px-2 py-1.5 text-[13px] text-faint">Aucun business</li> : null}
        </ul>
      </nav>

      <div className="flex flex-col gap-3 border-t border-border p-3">
        <NavLink href="/reglages" active={pathname.startsWith("/reglages")} icon={<Settings />}>
          Réglages
        </NavLink>
        <ThemeToggle initial={theme} />
        <div className="flex items-center gap-2 px-1">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-muted ring-1 ring-border">
            {(email ?? "?")[0]?.toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{email}</span>
          <form action="/deconnexion" method="post">
            <button type="submit" title="Se déconnecter" className="grid size-7 place-items-center rounded-md text-faint hover:bg-surface-2 hover:text-text">
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
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-[color-mix(in_oklab,var(--bg)_85%,transparent)] px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid size-9 place-items-center rounded-lg border border-border bg-surface shadow-card"
          aria-label="Ouvrir le menu"
        >
          <Menu className="size-4" />
        </button>
        {current ? (
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <BusinessMark name={current.name} color={current.color} logoUrl={current.logo_url} size="sm" />
            <span className="truncate">{current.name}</span>
          </span>
        ) : (
          <span className="text-sm font-semibold tracking-tight">Panel</span>
        )}
      </div>

      {/* Tiroir mobile */}
      <div className={cn("fixed inset-0 z-40 lg:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open}>
        <div
          className={cn("absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity", open ? "opacity-100" : "opacity-0")}
          onClick={() => setOpen(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 w-[280px] border-r border-border bg-bg shadow-pop transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {nav}
        </aside>
      </div>

      {/* Barre latérale fixe sur grand écran */}
      <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 border-r border-border bg-bg lg:block">{nav}</aside>
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
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors [&_svg]:size-4",
        active ? "bg-surface font-medium text-text shadow-card ring-1 ring-border" : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {badge ? (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] px-1.5 text-[11px] font-semibold text-danger">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
