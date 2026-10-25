"use client";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client navigateur sans session : il sert uniquement à envoyer des fichiers
// vers une URL signée préparée côté serveur. La session reste en cookie httpOnly.
export function createUploadClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
