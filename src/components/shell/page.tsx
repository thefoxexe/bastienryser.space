import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/** Conteneur standard d'une page du panel. */
export function Page({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <main className={cn("mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-8 sm:px-10 sm:py-12", className)} style={style}>
      {children}
    </main>
  );
}
