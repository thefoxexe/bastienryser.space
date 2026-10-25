"use client";

import { useEffect, useState } from "react";
import { Splash } from "@/components/splash";

const KEY = "br-splash";

// Décision prise une seule fois par chargement de page (les effets peuvent s'exécuter deux fois en développement).
let firstOfSession: boolean | null = null;

function isFirstOfSession() {
  if (firstOfSession !== null) return firstOfSession;
  try {
    firstOfSession = sessionStorage.getItem(KEY) !== "1";
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Stockage indisponible (navigation privée) : on garde la durée normale.
    firstOfSession = true;
  }
  return firstOfSession;
}

/**
 * Écran de lancement au premier affichage de la session (ouverture de l'app) : environ 2 secondes, puis fondu.
 * Les rechargements suivants dans la même session ne le montrent qu'un instant.
 */
export function SplashGate() {
  const [phase, setPhase] = useState<"show" | "leave" | "gone">("show");

  useEffect(() => {
    const seen = !isFirstOfSession();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t1 = setTimeout(() => setPhase("leave"), seen || reduce ? 150 : 1900);
    const t2 = setTimeout(() => setPhase("gone"), seen || reduce ? 450 : 2300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === "gone") return null;
  return (
    <div className={`fixed inset-0 z-[100] bg-bg transition-opacity duration-400 ease-[var(--ease-apple)] ${phase === "leave" ? "pointer-events-none opacity-0" : "opacity-100"}`}>
      <Splash />
    </div>
  );
}
