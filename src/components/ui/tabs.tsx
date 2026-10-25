"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";

export function LinkTabs({
  tabs,
  exact = [],
  variant = "underline",
}: {
  tabs: { href: string; label: string }[];
  exact?: string[];
  variant?: "underline" | "segment";
}) {
  const pathname = usePathname();
  const isActive = (href: string) => (exact.includes(href) ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

  if (variant === "segment") {
    return (
      <nav className="scrollbar-none flex gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] transition",
              isActive(tab.href) ? "bg-surface font-medium text-text shadow-card ring-1 ring-border" : "text-muted hover:text-text",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {tabs.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn("relative whitespace-nowrap px-3 pb-3 pt-1 text-sm transition-colors", active ? "font-medium text-text" : "text-muted hover:text-text")}
          >
            {tab.label}
            {active ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
