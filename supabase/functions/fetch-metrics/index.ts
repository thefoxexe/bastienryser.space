// Tâche quotidienne : statistiques réelles des posts publiés depuis 30 jours (post_metrics)
// et chiffres de compte (abonnés, portée) dans account_insights.
// On n'enregistre que ce que les API renvoient : jamais d'estimation.

import { blueskyProfile, blueskyStats } from "../_shared/bluesky.ts";
import { liFetch } from "../_shared/linkedin.ts";
import { insightsValues, metaGet } from "../_shared/meta.ts";
import { pinterestStats, pinterestUser } from "../_shared/pinterest.ts";
import { adminClient, authorize, heartbeat, json } from "../_shared/supabase.ts";
import { threadsFollowers, threadsInsights } from "../_shared/threads.ts";
import { tiktokStats, tiktokUser } from "../_shared/tiktok.ts";
import { accessToken, ACCOUNT_COLUMNS, type AccountRow } from "../_shared/tokens.ts";
import { xMe, xStats } from "../_shared/x.ts";
import { youtubeChannel, youtubeStats } from "../_shared/youtube.ts";

type Metrics = { impressions?: number; reach?: number; likes?: number; comments?: number; shares?: number; saves?: number };

Deno.serve(async (req) => {
  if (!(await authorize(req))) return json({ error: "unauthorized" }, 401);
  const db = adminClient();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();

  const { data } = await db.from("social_accounts").select(ACCOUNT_COLUMNS).neq("status", "expired");
  const accounts = (data ?? []) as AccountRow[];
  // Bluesky : statistiques publiques, sans jeton.
  const tokens = new Map<string, string | null>();
  for (const a of accounts) tokens.set(a.id, a.network === "bluesky" ? "public" : await accessToken(db, a).catch(() => null));
  const byId = new Map(accounts.map((a) => [a.id, a]));

  // --- Posts ---------------------------------------------------------------
  const { data: targets } = await db
    .from("post_targets")
    .select("id, network, external_post_id, social_account_id")
    .eq("status", "published")
    .gte("published_at", since)
    .not("external_post_id", "is", null);

  // Réseaux interrogés par lots (une requête pour plusieurs posts du même compte).
  const batched = new Map<string, Metrics & { raw: Record<string, unknown> }>();
  const groups = new Map<string, { network: string; ids: string[] }>();
  for (const t of targets ?? []) {
    if (!["youtube", "tiktok", "x", "bluesky"].includes(t.network) || !t.social_account_id) continue;
    const g = groups.get(t.social_account_id) ?? { network: t.network as string, ids: [] as string[] };
    g.ids.push(t.external_post_id!);
    groups.set(t.social_account_id, g);
  }
  for (const [accountId, g] of groups) {
    const token = tokens.get(accountId);
    if (!token) continue;
    try {
      if (g.network === "youtube") {
        for (const [id, v] of await youtubeStats(token, g.ids)) batched.set(id, { impressions: v.views, likes: v.likes, comments: v.comments, raw: v });
      } else if (g.network === "tiktok") {
        for (const [id, v] of await tiktokStats(token, g.ids)) batched.set(id, { impressions: v.views, likes: v.likes, comments: v.comments, shares: v.shares, raw: v });
      } else if (g.network === "x") {
        for (const [id, v] of await xStats(token, g.ids)) {
          batched.set(id, { impressions: v.impressions, likes: v.likes, comments: v.replies, shares: (v.reposts ?? 0) + (v.quotes ?? 0), saves: v.bookmarks, raw: v });
        }
      } else if (g.network === "bluesky") {
        for (const [id, v] of await blueskyStats(g.ids)) {
          batched.set(id, { likes: v.likes, comments: v.replies, shares: (v.reposts ?? 0) + (v.quotes ?? 0), raw: v });
        }
      }
    } catch (e) {
      console.error("metrics batch", accountId, e);
    }
  }

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
      } else if (t.network === "threads") {
        const v = await threadsInsights(token, t.external_post_id!);
        raw = v;
        m = { impressions: v.views, likes: v.likes, comments: v.replies, shares: v.reposts !== undefined || v.quotes !== undefined ? (v.reposts ?? 0) + (v.quotes ?? 0) : undefined };
      } else if (t.network === "pinterest") {
        const v = await pinterestStats(token, t.external_post_id!, since.slice(0, 10));
        raw = v;
        m = { impressions: v.IMPRESSION, saves: v.SAVE };
      } else if (batched.has(t.external_post_id!)) {
        const { raw: r, ...values } = batched.get(t.external_post_id!)!;
        raw = r;
        m = values;
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
  for (const a of accounts) {
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
      } else if (a.network === "threads") {
        row = { followers: await threadsFollowers(token, a.external_id) };
      } else if (a.network === "youtube") {
        row = { followers: (await youtubeChannel(token))?.subscribers ?? undefined };
      } else if (a.network === "tiktok") {
        row = { followers: (await tiktokUser(token)).follower_count };
      } else if (a.network === "bluesky") {
        row = { followers: (await blueskyProfile(a.external_id)).followersCount };
      } else if (a.network === "pinterest") {
        row = { followers: (await pinterestUser(token)).follower_count };
      } else if (a.network === "x") {
        row = { followers: (await xMe(token)).public_metrics?.followers_count };
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
