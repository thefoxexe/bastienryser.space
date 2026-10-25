"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ui/cn";

type Theme = "light" | "dark" | "system";

function persistTheme(theme: Theme) {
  document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

  function apply(next: Theme) {
    setTheme(next);
    persistTheme(next);
  }

  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Clair", icon: <Sun /> },
    { value: "dark", label: "Sombre", icon: <Moon /> },
    { value: "system", label: "Système", icon: <Monitor /> },
  ];

  return (
    <div role="radiogroup" aria-label="Thème" className="flex rounded-lg border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          title={o.label}
          onClick={() => apply(o.value)}
          className={cn(
            "grid h-7 flex-1 place-items-center rounded-md text-muted transition [&_svg]:size-3.5",
            theme === o.value ? "bg-surface text-text shadow-card" : "hover:text-text",
          )}
        >
          {o.icon}
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
