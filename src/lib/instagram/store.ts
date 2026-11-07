import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Instagram自動投稿(文字だけのストーリーズ)のDBアクセス(設定・文・写真・投稿ログ)。
// service roleでのみ使うので、呼び出し側で認可すること。

export interface InstagramSettings {
  accessToken: string | null;
  tokenExpiresAt: string | null;
  tokenRefreshedAt: string | null;
  tokenAlertSentAt: string | null;
  storyEnabled: boolean; // 管理画面のスイッチ。環境変数 INSTAGRAM_AUTOPOST_ENABLED と、両方ONのときだけ投稿される。
}

export const DEFAULT_SETTINGS: InstagramSettings = {
  accessToken: null,
  tokenExpiresAt: null,
  tokenRefreshedAt: null,
  tokenAlertSentAt: null,
  storyEnabled: false,
};

interface SettingsRow {
  access_token: string | null;
  token_expires_at: string | null;
  token_refreshed_at: string | null;
  token_alert_sent_at: string | null;
  story_enabled: boolean;
}

export async function getInstagramSettings(): Promise<InstagramSettings> {
  const admin = createAdminClient();
  const { data } = await admin.from("instagram_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  const r = data as SettingsRow;
  return {
    accessToken: r.access_token,
    tokenExpiresAt: r.token_expires_at,
    tokenRefreshedAt: r.token_refreshed_at,
    tokenAlertSentAt: r.token_alert_sent_at,
    storyEnabled: r.story_enabled ?? false,
  };
}

export interface InstagramTemplate {
  id: string;
  title: string;
  body: string;
  isApproved: boolean;
  approvedAt: string | null;
  isActive: boolean;
  sortOrder: number;
  lastPostedAt: string | null;
  postCount: number;
}

interface TemplateRow {
  id: string;
  title: string;
  body: string;
  is_approved: boolean;
  approved_at: string | null;
  is_active: boolean;
  sort_order: number;
  last_posted_at: string | null;
  post_count: number;
}

export async function listInstagramTemplates(): Promise<InstagramTemplate[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("instagram_post_templates").select("*").order("sort_order", { ascending: true });
  return ((data ?? []) as TemplateRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    isApproved: r.is_approved,
    approvedAt: r.approved_at,
    isActive: r.is_active,
    sortOrder: r.sort_order,
    lastPostedAt: r.last_posted_at,
    postCount: r.post_count,
  }));
}

export interface InstagramLibraryImage {
  id: string;
  folder: string;
  imageUrl: string;
  storagePath: string;
  isActive: boolean;
  lastUsedAt: string | null;
  useCount: number;
}

interface ImageRow {
  id: string;
  folder: string;
  image_url: string;
  storage_path: string;
  is_active: boolean;
  last_used_at: string | null;
  use_count: number;
}

// 写真ライブラリの一覧(管理画面・自動選択用)。
export async function listInstagramLibraryImages(): Promise<InstagramLibraryImage[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("instagram_images").select("*").order("created_at", { ascending: false });
  return ((data ?? []) as ImageRow[]).map((r) => ({
    id: r.id,
    folder: r.folder,
    imageUrl: r.image_url,
    storagePath: r.storage_path,
    isActive: r.is_active,
    lastUsedAt: r.last_used_at,
    useCount: r.use_count,
  }));
}

export type InstagramPostStatus = "claimed" | "published" | "failed" | "gave_up";

export interface InstagramPostRow {
  id: string;
  post_type: "story";
  dedupe_key: string;
  post_date: string;
  template_id: string | null;
  image_source: "story" | null;
  image_id: string | null;
  caption: string;
  image_url: string | null;
  status: InstagramPostStatus;
  attempts: number;
  container_id: string | null;
  media_id: string | null;
  last_error: string | null;
  error_kind: string | null;
  next_retry_at: string | null;
  claimed_at: string;
  published_at: string | null;
}

export async function listRecentInstagramPosts(limit = 15): Promise<InstagramPostRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("instagram_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as InstagramPostRow[];
}
