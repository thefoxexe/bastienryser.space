import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  userId: string;
  email: string | null;
  isAdmin: boolean;
};

// Lu une seule fois par requête, même si plusieurs composants l'appellent.
export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/connexion");

  // La RLS ne laisse lire que sa propre ligne : si elle revient, on est admin.
  const { data: admin } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", claims.sub)
    .maybeSingle();

  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    isAdmin: Boolean(admin),
  };
});

// À appeler au début de chaque Server Action : ne jamais faire confiance au client.
export async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer.isAdmin) redirect("/connexion");
  return viewer;
}
