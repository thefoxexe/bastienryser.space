import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  ActivityEntry,
  Business,
  BusinessWithLogo,
  Post,
  PostMedia,
  PostMetrics,
  PostTarget,
  SocialAccount,
} from "@/lib/types";

const ACCOUNT_COLUMNS =
  "id,business_id,network,display_name,username,avatar_url,external_id,token_expires_at,status,last_error,connected_at";

async function signLogos(businesses: Business[]): Promise<BusinessWithLogo[]> {
  const supabase = await createClient();
  const paths = businesses.map((b) => b.logo_path).filter((p): p is string => Boolean(p));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("logos").createSignedUrls(paths, 3600);
    data?.forEach((d) => d.path && d.signedUrl && urls.set(d.path, d.signedUrl));
  }
  return businesses.map((b) => ({ ...b, logo_url: b.logo_path ? (urls.get(b.logo_path) ?? null) : null }));
}

export const listBusinesses = cache(async (includeArchived = false): Promise<BusinessWithLogo[]> => {
  const supabase = await createClient();
  let query = supabase.from("businesses").select("*").order("position").order("created_at");
  if (!includeArchived) query = query.is("archived_at", null);
  const { data } = await query;
  return signLogos((data ?? []) as Business[]);
});

export const getBusiness = cache(async (slug: string): Promise<BusinessWithLogo> => {
  const supabase = await createClient();
  const { data } = await supabase.from("businesses").select("*").eq("slug", slug).maybeSingle();
  if (!data) notFound();
  const [withLogo] = await signLogos([data as Business]);
  return withLogo;
});

export const listAccounts = cache(async (businessId?: string): Promise<SocialAccount[]> => {
  const supabase = await createClient();
  let query = supabase.from("social_accounts").select(ACCOUNT_COLUMNS).order("network").order("display_name");
  if (businessId) query = query.eq("business_id", businessId);
  const { data } = await query;
  return (data ?? []) as SocialAccount[];
});

export type PostSummary = Post & {
  targets: Pick<PostTarget, "id" | "network" | "status" | "permalink" | "error_message" | "caption" | "social_account_id">[];
  cover: { url: string | null; kind: PostMedia["kind"] } | null;
  media_count: number;
};

type PostRow = Post & {
  post_targets: PostSummary["targets"];
  post_media: Pick<PostMedia, "storage_path" | "kind" | "position">[];
};

export async function listPosts(options: {
  businessId?: string;
  from?: string;
  to?: string;
  statuses?: Post["status"][];
  order?: "scheduled_asc" | "recent";
  limit?: number;
  withCovers?: boolean;
}): Promise<PostSummary[]> {
  const supabase = await createClient();
  let query = supabase
    .from("posts")
    .select(
      "*, post_targets(id,network,status,permalink,error_message,caption,social_account_id), post_media(storage_path,kind,position)",
    );
  if (options.businessId) query = query.eq("business_id", options.businessId);
  if (options.statuses) query = query.in("status", options.statuses);
  if (options.from) query = query.gte("scheduled_at", options.from);
  if (options.to) query = query.lt("scheduled_at", options.to);
  query =
    options.order === "scheduled_asc"
      ? query.order("scheduled_at", { ascending: true })
      : query.order("updated_at", { ascending: false });
  query = query.limit(options.limit ?? 50);

  const { data } = await query;
  const rows = (data ?? []) as PostRow[];

  const coverPaths = rows
    .map((r) => [...r.post_media].sort((a, b) => a.position - b.position)[0])
    .filter((m) => m && m.kind === "image")
    .map((m) => m!.storage_path);
  const urls = new Map<string, string>();
  if (options.withCovers !== false && coverPaths.length) {
    const { data: signed } = await supabase.storage.from("media").createSignedUrls(coverPaths, 3600);
    signed?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  }

  return rows.map(({ post_targets, post_media, ...post }) => {
    const first = [...post_media].sort((a, b) => a.position - b.position)[0];
    return {
      ...post,
      targets: post_targets,
      media_count: post_media.length,
      cover: first ? { url: urls.get(first.storage_path) ?? null, kind: first.kind } : null,
    };
  });
}

export type PostDetail = Post & {
  media: (PostMedia & { url: string | null })[];
  targets: (PostTarget & { account: Pick<SocialAccount, "id" | "display_name" | "username" | "avatar_url" | "network"> | null; metrics: PostMetrics | null })[];
};

export async function getPost(id: string): Promise<PostDetail> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select(
      "*, post_media(*), post_targets(*, social_accounts(id,display_name,username,avatar_url,network), post_metrics(id,post_target_id,fetched_at,impressions,reach,likes,comments,shares,saves))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  type Row = Post & {
    post_media: PostMedia[];
    post_targets: (PostTarget & {
      social_accounts: PostDetail["targets"][number]["account"];
      post_metrics: PostMetrics[];
    })[];
  };
  const row = data as Row;
  const media = [...row.post_media].sort((a, b) => a.position - b.position);
  const urls = new Map<string, string>();
  if (media.length) {
    const { data: signed } = await supabase.storage.from("media").createSignedUrls(
      media.map((m) => m.storage_path),
      3600,
    );
    signed?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  }

  const { post_media: _m, post_targets, ...post } = row;
  void _m;
  return {
    ...post,
    media: media.map((m) => ({ ...m, url: urls.get(m.storage_path) ?? null })),
    targets: post_targets.map(({ social_accounts, post_metrics, ...t }) => ({
      ...t,
      account: social_accounts,
      metrics: [...post_metrics].sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))[0] ?? null,
    })),
  };
}

export async function listActivity(options: { businessId?: string; limit?: number } = {}): Promise<ActivityEntry[]> {
  const supabase = await createClient();
  let query = supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(options.limit ?? 20);
  if (options.businessId) query = query.eq("business_id", options.businessId);
  const { data } = await query;
  return (data ?? []) as ActivityEntry[];
}

export type MetricsTotals = {
  network: SocialAccount["network"];
  business_id: string;
  posts: number;
  reach: number | null;
  impressions: number | null;
  interactions: number | null;
  followers: number | null;
};

/** Chiffres réels des 30 derniers jours, par business et par réseau. Null = l'API ne fournit pas la donnée. */
export async function metricsLast30Days(businessId?: string): Promise<MetricsTotals[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();

  let targetsQuery = supabase
    .from("post_targets")
    .select("id, network, social_account_id, published_at, posts!inner(business_id), post_metrics(fetched_at,impressions,reach,likes,comments,shares,saves)")
    .eq("status", "published")
    .gte("published_at", since);
  if (businessId) targetsQuery = targetsQuery.eq("posts.business_id", businessId);

  let accountsQuery = supabase
    .from("social_accounts")
    .select("id, network, business_id, account_insights(day,followers)")
    .order("day", { referencedTable: "account_insights", ascending: false })
    .limit(1, { referencedTable: "account_insights" });
  if (businessId) accountsQuery = accountsQuery.eq("business_id", businessId);

  const [{ data: targets }, { data: accounts }] = await Promise.all([targetsQuery, accountsQuery]);

  const totals = new Map<string, MetricsTotals>();
  const key = (b: string, n: string) => `${b}:${n}`;
  const add = (a: number | null, b: number | null | undefined) => (b === null || b === undefined ? a : (a ?? 0) + b);

  type TargetRow = {
    network: SocialAccount["network"];
    posts: { business_id: string };
    post_metrics: Omit<PostMetrics, "id" | "post_target_id">[];
  };
  for (const t of (targets ?? []) as unknown as TargetRow[]) {
    const k = key(t.posts.business_id, t.network);
    const entry =
      totals.get(k) ??
      ({ network: t.network, business_id: t.posts.business_id, posts: 0, reach: null, impressions: null, interactions: null, followers: null } as MetricsTotals);
    entry.posts += 1;
    const latest = [...t.post_metrics].sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))[0];
    if (latest) {
      entry.reach = add(entry.reach, latest.reach);
      entry.impressions = add(entry.impressions, latest.impressions);
      const parts = [latest.likes, latest.comments, latest.shares, latest.saves].filter((v): v is number => v !== null);
      if (parts.length) entry.interactions = add(entry.interactions, parts.reduce((s, v) => s + v, 0));
    }
    totals.set(k, entry);
  }

  type AccountRow = { network: SocialAccount["network"]; business_id: string; account_insights: { followers: number | null }[] };
  for (const a of (accounts ?? []) as unknown as AccountRow[]) {
    const followers = a.account_insights[0]?.followers ?? null;
    const k = key(a.business_id, a.network);
    const entry =
      totals.get(k) ??
      ({ network: a.network, business_id: a.business_id, posts: 0, reach: null, impressions: null, interactions: null, followers: null } as MetricsTotals);
    entry.followers = add(entry.followers, followers);
    totals.set(k, entry);
  }

  return [...totals.values()];
}
