import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AUTO_REFRESH } from "@/lib/social/networks";
import type { SocialAccount } from "@/lib/types";

export type Alert =
  | { kind: "failed_post"; business_id: string; post_id: string; title: string; network: SocialAccount["network"]; message: string | null; target_id: string }
  | { kind: "account"; business_id: string; account: Pick<SocialAccount, "id" | "network" | "display_name" | "status" | "token_expires_at" | "last_error"> };

const SEVEN_DAYS = 7 * 86400_000;

/** Ce qui demande une action : publications en échec, connexions qui expirent ou ont expiré. */
export async function listAlerts(): Promise<Alert[]> {
  const supabase = await createClient();
  const soon = new Date(Date.now() + SEVEN_DAYS).toISOString();

  const [{ data: failed }, { data: accounts }] = await Promise.all([
    supabase
      .from("post_targets")
      .select("id, network, error_message, post_id, posts!inner(id, title, business_id)")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("social_accounts")
      .select("id, business_id, network, display_name, status, token_expires_at, last_error")
      .or(`status.in.(expiring,expired,error),token_expires_at.lt.${soon}`),
  ]);

  type AccountRow = Pick<SocialAccount, "id" | "business_id" | "network" | "display_name" | "status" | "token_expires_at" | "last_error">;
  type FailedRow = { id: string; network: SocialAccount["network"]; error_message: string | null; post_id: string; posts: { id: string; title: string | null; business_id: string } };

  return [
    ...((failed ?? []) as unknown as FailedRow[]).map(
      (f): Alert => ({
        kind: "failed_post",
        business_id: f.posts.business_id,
        post_id: f.post_id,
        title: f.posts.title || "Post sans titre",
        network: f.network,
        message: f.error_message,
        target_id: f.id,
      }),
    ),
    ...((accounts ?? []) as AccountRow[])
      .filter((a) => !AUTO_REFRESH.includes(a.network) || a.status === "expired" || a.status === "error")
      .map((a): Alert => ({ kind: "account", business_id: a.business_id, account: a })),
  ];
}
