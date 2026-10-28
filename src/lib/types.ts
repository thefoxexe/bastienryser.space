export type SocialNetwork =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "linkedin_page"
  | "threads"
  | "youtube"
  | "tiktok"
  | "bluesky"
  | "pinterest"
  | "x";
export type AccountStatus = "connected" | "expiring" | "expired" | "error";
export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "partial" | "failed";
export type TargetStatus = "pending" | "publishing" | "published" | "failed";
export type MediaKind = "image" | "video" | "pdf";

export type Business = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string;
  logo_path: string | null;
  websites: string[];
  modules: string[];
  position: number;
  archived_at: string | null;
  created_at: string;
};

export type BusinessWithLogo = Business & { logo_url: string | null };

export type SocialAccount = {
  id: string;
  business_id: string;
  network: SocialNetwork;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  external_id: string;
  token_expires_at: string | null;
  status: AccountStatus;
  last_error: string | null;
  connected_at: string;
  /** Réglages non secrets (auteur LinkedIn, tableaux Pinterest…). Jamais de token. */
  meta?: Record<string, unknown>;
};

export type Post = {
  id: string;
  business_id: string;
  title: string | null;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PostMedia = {
  id: string;
  post_id: string;
  position: number;
  storage_path: string;
  kind: MediaKind;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  /** Couverture d'une vidéo : instant choisi (ms) ou image importée. */
  cover_ms: number | null;
  cover_path: string | null;
};

export type PostTarget = {
  id: string;
  post_id: string;
  social_account_id: string | null;
  network: SocialNetwork;
  caption: string;
  status: TargetStatus;
  external_post_id: string | null;
  permalink: string | null;
  error_message: string | null;
  attempts: number;
  next_attempt_at: string | null;
  published_at: string | null;
};

export type PostMetrics = {
  id: string;
  post_target_id: string;
  fetched_at: string;
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
};

export type ActivityEntry = {
  id: string;
  business_id: string | null;
  kind: string;
  message: string;
  meta: Record<string, unknown>;
  created_at: string;
};
