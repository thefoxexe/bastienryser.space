"use client";

import { useEffect, useRef, useState } from "react";
import { type ValueFormat } from "@/components/charts/format";

/** Format des tuiles : pas de centimes au-delà de 1 000 pour que le chiffre tienne sur un téléphone. */
export function tileFormat(v: number, f: ValueFormat) {
  if (f.kind === "currency") {
    return new Intl.NumberFormat("fr-CH", {
      style: "currency",
      currency: f.currency.toUpperCase(),
      maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2,
      minimumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2,
    }).format(v);
  }
  if (f.kind === "percent") return `${v.toLocaleString("fr-CH", { maximumFractionDigits: v >= 99.95 || v === 0 ? 0 : 2 })} %`;
  return new Intl.NumberFormat("fr-CH", { maximumFractionDigits: Number.isInteger(v) ? 0 : 1 }).format(v);
}

/**
 * Chiffre qui monte de 0 à sa valeur (0,9 s), à chaque changement de période.
 * Attend la fin de l'écran de lancement pour que l'animation soit visible.
 */
export function CountUp({ value, format }: { value: number; format: ValueFormat }) {
  const [shown, setShown] = useState(value);
  const frame = useRef(0);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const integer = Number.isInteger(value) && format.kind !== "currency";
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 900);
        const eased = 1 - (1 - t) ** 3;
        const v = value * eased;
        setShown(t === 1 ? value : integer ? Math.round(v) : Math.round(v * 100) / 100);
        if (t < 1) frame.current = requestAnimationFrame(step);
      };
      setShown(0);
      frame.current = requestAnimationFrame(step);
    };

    if (document.documentElement.dataset.splash === "on") window.addEventListener("br:splash-done", run, { once: true });
    else run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame.current);
      window.removeEventListener("br:splash-done", run);
    };
  }, [value, format.kind]);

  return <>{tileFormat(shown, format)}</>;
}
