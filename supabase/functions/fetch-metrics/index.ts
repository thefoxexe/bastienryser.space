// Tâche quotidienne : statistiques réelles des posts publiés depuis 30 jours (post_metrics)
// et chiffres de compte (abonnés, portée) dans account_insights.
// On n'enregistre que ce que les API renvoient : jamais d'estimation.

import { liFetch } from "../_shared/linkedin.ts";
import { insightsValues, metaGet } from "../_shared/meta.ts";
import { adminClient, authorize, heartbeat, json, readToken } from "../_shared/supabase.ts";

type Metrics = { impressions?: number; reach?: number; likes?: number; comments?: number; shares?: number; saves?: number };

Deno.serve(async (req) => {
  if (!(await authorize(req))) return json({ error: "unauthorized" }, 401);
  const db = adminClient();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();

  const { data: accounts } = await db.from("social_accounts").select("id, network, external_id, token_ref, meta").neq("status", "expired");
  const tokens = new Map<string, string | null>();
  for (const a of accounts ?? []) tokens.set(a.id, await readToken(db, a.token_ref).catch(() => null));
  const byId = new Map((accounts ?? []).map((a) => [a.id, a]));

  // --- Posts ---------------------------------------------------------------
  const { data: targets } = await db
    .from("post_targets")
    .select("id, network, external_post_id, social_account_id")
    .eq("status", "published")
    .gte("published_at", since)
    .not("external_post_id", "is", null);

  let posts = 0;
  for (const t of targets ?? []) {
    const account = t.social_account_id ? byId.get(t.social_account_id) : undefined;
    const token = account ? tokens.get(account.id) : null;
    if (!account || !token) continue;
    try {
      let m: Metrics | null = null;
      let raw: Record<string, unknown> = {};

      if (t.network === "instagram") {
        const v = await insightsValues(t.external_post_id!, token, ["reach", "likes", "comments", "shares", "saved", "views"]);
        raw = v;
        m = { reach: v.reach, likes: v.likes, comments: v.comments, shares: v.shares, saves: v.saved, impressions: v.views };
      } else if (t.network === "facebook") {
        const base = await metaGet<{
          reactions?: { summary?: { total_count?: number } };
          comments?: { summary?: { total_count?: number } };
          shares?: { count?: number };
        }>(t.external_post_id!, token, { fields: "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares" }).catch(() => null);
        const v = await insightsValues(t.external_post_id!, token, ["post_impressions_unique", "post_media_view"]);
        raw = { ...v, base };
        m = {
          reach: v.post_impressions_unique,
          impressions: v.post_media_view,
          likes: base?.reactions?.summary?.total_count,
          comments: base?.comments?.summary?.total_count,
          shares: base ? (base.shares?.count ?? 0) : undefined,
        };
      } else if (t.network === "linkedin_page") {
        const org = (account.meta as { author?: string }).author!;
        const urn = t.external_post_id!;
        const param = urn.includes(":ugcPost:") ? "ugcPosts" : "shares";
        const res = await liFetch(
          token,
          `/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(org)}&${param}=List(${encodeURIComponent(urn)})`,
        );
        const body = (await res.json()) as { elements?: { totalShareStatistics?: Record<string, number> }[] };
        const s = body.elements?.[0]?.totalShareStatistics;
        raw = s ?? {};
        if (s) m = { impressions: s.impressionCount, reach: s.uniqueImpressionsCount, likes: s.likeCount, comments: s.commentCount, shares: s.shareCount };
      }
      // LinkedIn profil personnel : pas de statistiques via l'API ouverte, rien n'est enregistré.

      if (m && Object.values(m).some((v) => typeof v === "number")) {
        await db.from("post_metrics").insert({
          post_target_id: t.id,
          impressions: m.impressions ?? null,
          reach: m.reach ?? null,
          likes: m.likes ?? null,
          comments: m.comments ?? null,
          shares: m.shares ?? null,
          saves: m.saves ?? null,
          raw,
        });
        posts++;
      }
    } catch (e) {
      console.error("metrics post", t.id, e);
    }
  }

  // --- Comptes -------------------------------------------------------------
  const today = new Date().toISOString().slice(0, 10);
  let accountsDone = 0;
  for (const a of accounts ?? []) {
    const token = tokens.get(a.id);
    if (!token) continue;
    try {
      let row: { followers?: number; reach?: number } | null = null;
      if (a.network === "instagram") {
        const info = await metaGet<{ followers_count?: number }>(a.external_id, token, { fields: "followers_count" });
        const until = Math.floor(Date.now() / 1000);
        const reach = await insightsValues(a.external_id, token, ["reach"], { period: "day", since: until - 86400, until });
        row = { followers: info.followers_count, reach: reach.reach };
      } else if (a.network === "facebook") {
        const info = await metaGet<{ followers_count?: number; fan_count?: number }>(a.external_id, token, { fields: "followers_count,fan_count" });
        row = { followers: info.followers_count ?? info.fan_count };
      } else if (a.network === "linkedin_page") {
        const org = (a.meta as { author?: string }).author!;
        const res = await liFetch(token, `/rest/networkSizes/${encodeURIComponent(org)}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`);
        const body = (await res.json()) as { firstDegreeSize?: number };
        row = { followers: body.firstDegreeSize };
      }
      if (row && (typeof row.followers === "number" || typeof row.reach === "number")) {
        await db.from("account_insights").upsert(
          { social_account_id: a.id, day: today, followers: row.followers ?? null, reach: row.reach ?? null, fetched_at: new Date().toISOString() },
          { onConflict: "social_account_id,day" },
        );
        accountsDone++;
      }
    } catch (e) {
      console.error("metrics account", a.id, e);
    }
  }

  await heartbeat(db, "fetch-metrics", true, `${posts} post(s) et ${accountsDone} compte(s) mis à jour`);
  return json({ posts, accounts: accountsDone });
});
