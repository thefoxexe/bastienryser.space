"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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

/** Pages hors panel : pas d'écran de lancement. */
const OUTSIDE = /^\/(connexion|deconnexion|configuration|confidentialite|conditions)(\/|$)/;

/** Appelé par le panel quand son contenu est affiché : l'écran de lancement peut partir. */
export const READY_EVENT = "br:panel-ready";

/**
 * Écran de lancement, rendu dans le HTML initial (avant même le chargement des données) pour enchaîner
 * directement après l'écran de démarrage du téléphone. Première ouverture de la session : environ 2 secondes,
 * et jamais avant que le panel soit prêt. Les rechargements suivants ne le montrent qu'un instant.
 */
export function SplashGate() {
  const pathname = usePathname();
  const outside = OUTSIDE.test(pathname);
  const [phase, setPhase] = useState<"show" | "leave" | "gone">("show");

  useEffect(() => {
    if (outside) return;
    const seen = !isFirstOfSession();
    // Les chiffres animés attendent la fin de l'écran de lancement.
    document.documentElement.dataset.splash = "on";
    const done = () => {
      delete document.documentElement.dataset.splash;
      window.dispatchEvent(new Event("br:splash-done"));
    };
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let minDone = false;
    let ready = Boolean((window as { __brReady?: boolean }).__brReady);
    let t2: ReturnType<typeof setTimeout> | undefined;
    const leave = () => {
      if (!minDone || !ready || t2) return;
      setPhase("leave");
      done();
      t2 = setTimeout(() => setPhase("gone"), 400);
    };
    const onReady = () => {
      ready = true;
      leave();
    };
    window.addEventListener(READY_EVENT, onReady);
    const t1 = setTimeout(() => {
      minDone = true;
      leave();
    }, seen || reduce ? 150 : 1900);
    // Filet de sécurité : jamais bloqué derrière l'écran de lancement.
    const t3 = setTimeout(onReady, 12000);
    return () => {
      window.removeEventListener(READY_EVENT, onReady);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      done();
    };
  }, [outside]);

  if (outside || phase === "gone") return null;
  return (
    <div className={`fixed inset-0 z-[100] bg-bg transition-opacity duration-400 ease-[var(--ease-apple)] ${phase === "leave" ? "pointer-events-none opacity-0" : "opacity-100"}`}>
      <Splash />
    </div>
  );
}

/** Posé dans le panel : signale que le contenu est affiché. */
export function SplashReady() {
  useEffect(() => {
    (window as { __brReady?: boolean }).__brReady = true;
    window.dispatchEvent(new Event(READY_EVENT));
  }, []);
  return null;
}
