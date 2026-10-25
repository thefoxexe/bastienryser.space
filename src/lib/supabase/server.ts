import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { hardenCookie, supabaseKey, supabaseUrl } from "./config";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, hardenCookie(options)),
          );
        } catch {
          // Appelé depuis un Server Component : le proxy rafraîchit déjà la session.
        }
      },
    },
  });
}
