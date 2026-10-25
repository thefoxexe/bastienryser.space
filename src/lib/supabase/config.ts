import type { CookieOptions } from "@supabase/ssr";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/** Noms des variables Supabase manquantes (vide quand tout est configuré). */
export const missingConfig = [
  !process.env.NEXT_PUBLIC_SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
  !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
].filter((v): v is string => Boolean(v));

export const SETUP_PATH = "/configuration";

// Toute l'authentification passe par le serveur : le navigateur n'a jamais
// besoin de lire la session, on peut donc la garder en cookie httpOnly.
export function hardenCookie(options: CookieOptions): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
}
