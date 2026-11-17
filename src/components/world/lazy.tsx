"use client";

import dynamic from "next/dynamic";

// three.js ne tourne que dans le navigateur : chargé à la demande, jamais côté serveur.
const fallback = () => <div className="size-full animate-pulse rounded-[inherit] bg-white/[0.03]" />;
export const PlanetMini = dynamic(() => import("./planet-mini"), { ssr: false, loading: fallback });
export const Universe = dynamic(() => import("./universe"), { ssr: false, loading: fallback });
export const WorldExplorer = dynamic(() => import("./explorer"), { ssr: false, loading: fallback });
