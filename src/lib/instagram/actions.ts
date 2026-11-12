"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";
import { validateCaption } from "@/lib/instagram/copy-rules";
import { storyLinesFromBody } from "@/lib/instagram/story-text";
import { verifyToken } from "@/lib/instagram/graph";
import { getInstagramSettings } from "@/lib/instagram/store";
import { resolveCredentials } from "@/lib/instagram/token";

// Instagram自動投稿の管理画面用Server Action。すべて管理者(admin)のみ。
// このファイルから公開してよいのは「認可チェック付きの操作」だけ(Server Actionは外部から直接呼べるため)。

const PAGE = "/staff/admin/instagram";
const BUCKET = "instagram-posts";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function requireAdmin(): Promise<boolean> {
  const staff = await getStaffUser();
  return !!staff && staff.role === "admin";
}

const NOT_ADMIN = { ok: false, error: "管理者としてログインしてください。" } as const;

// 登録・更新のときの共通チェック: 禁止語、ストーリーズの画像に収まる長さ。
function bodyProblems(body: string): string[] {
  const problems = validateCaption(body);
  if (problems.length === 0 && !storyLinesFromBody(body)) {
    problems.push("文が長すぎて、ストーリーズの画像に収まりません。短くしてください。");
  }
  return problems;
}

// 自動投稿のスイッチ(管理画面)。環境変数 INSTAGRAM_AUTOPOST_ENABLED=true と両方ONのときだけ投稿される。
export async function setInstagramStoryEnabled(enabled: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return NOT_ADMIN;
  const admin = createAdminClient();
  const { error } = await admin
    .from("instagram_settings")
    .upsert({ id: 1, story_enabled: enabled, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "保存に失敗しました。" };
  revalidatePath(PAGE);
  return { ok: true, data: undefined };
}

// 接続の確認(読み取りのみ)。トークンが使えるか、INSTAGRAM_USER_ID のアカウントが見えるかを確かめる。
// 投稿・トークンの更新・DBへの書き込みは一切しない。トークンの値は返さない。
export async function checkInstagramConnection(): Promise<ActionResult<{ username: string | null }>> {
  if (!(await requireAdmin())) return NOT_ADMIN;
  const creds = resolveCredentials(await getInstagramSettings());
  if (!creds) return { ok: false, error: "トークンまたはユーザーIDが設定されていません。" };
  try {
    const me = await verifyToken({ userId: creds.userId, token: creds.token });
    if (me.userId !== null && me.userId !== creds.userId) {
      return { ok: false, error: "つながりましたが、INSTAGRAM_USER_ID のアカウントと一致しません。" };
    }
    return { ok: true, data: { username: me.username } };
  } catch (e) {
    return { ok: false, error: `つながりませんでした: ${(e as Error).message}` };
  }
}

// アクセストークンの保存(管理画面から貼り付け)。保存前に、そのトークンで INSTAGRAM_USER_ID のアカウントが読めることを確かめる。
// 保存したトークンは、環境変数 INSTAGRAM_ACCESS_TOKEN より優先して使われる(期限なし扱い・自動更新はしない)。
// トークンの値は、画面にも返事にも出さない。
export async function saveInstagramToken(input: { token: string }): Promise<ActionResult<{ username: string | null }>> {
  if (!(await requireAdmin())) return NOT_ADMIN;
  const token = input.token.trim();
  if (token.length < 50 || /\s/.test(token)) {
    return { ok: false, error: "トークンの形が正しくありません。コピーした文字を、そのまま貼り付けてください。" };
  }
  const userId = process.env.INSTAGRAM_USER_ID?.trim();
  if (!userId) return { ok: false, error: "INSTAGRAM_USER_ID が設定されていません。" };
  let username: string | null;
  try {
    const me = await verifyToken({ userId, token });
    if (me.userId !== null && me.userId !== userId) {
      return { ok: false, error: "このトークンでは、INSTAGRAM_USER_ID のアカウントを読めませんでした。" };
    }
    username = me.username;
  } catch (e) {
    return { ok: false, error: `このトークンは使えませんでした: ${(e as Error).message}` };
  }
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("instagram_settings")
    .upsert({ id: 1, access_token: token, token_expires_at: null, token_refreshed_at: now, updated_at: now });
  if (error) return { ok: false, error: "保存に失敗しました。" };
  revalidatePath(PAGE);
  return { ok: true, data: { username } };
}

export async function createInstagramTemplate(input: { title: string; body: string }): Promise<ActionResult> {
  if (!(await requireAdmin())) return NOT_ADMIN;
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { ok: false, error: "名前を入力してください。" };
  const problems = bodyProblems(body);
  if (problems.length > 0) return { ok: false, error: problems.join("\n") };

  const admin = createAdminClient();
  const { data: last } = await admin
    .from("instagram_post_templates")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin
    .from("instagram_post_templates")
    .insert({ title, body, sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1 });
  if (error) return { ok: false, error: "登録に失敗しました。" };
  revalidatePath(PAGE);
  return { ok: true, data: undefined };
}

// 文を変更すると承認が外れる(変更後の文を、もう一度渡部さんが見て承認するまで出ない)。
export async function updateInstagramTemplate(id: string, input: { title: string; body: string }): Promise<ActionResult> {
  if (!(await requireAdmin())) return NOT_ADMIN;
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { ok: false, error: "名前を入力してください。" };
  const problems = bodyProblems(body);
  if (problems.length > 0) return { ok: false, error: problems.join("\n") };

  const admin = createAdminClient();
  const { error } = await admin
    .from("instagram_post_templates")
    .update({ title, body, is_approved: false, approved_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "更新に失敗しました。" };
  revalidatePath(PAGE);
  return { ok: true, data: undefined };
}

export async function approveInstagramTemplate(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return NOT_ADMIN;
  const admin = createAdminClient();
  const { data } = await admin.from("instagram_post_templates").select("body").eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "見つかりません。" };
  const problems = bodyProblems(data.body as string);
  if (problems.length > 0) return { ok: false, error: problems.join("\n") };

  const now = new Date().toISOString();
  const { error } = await admin
    .from("instagram_post_templates")
    .update({ is_approved: true, approved_at: now, updated_at: now })
    .eq("id", id);
  if (error) return { ok: false, error: "承認に失敗しました。" };
  revalidatePath(PAGE);
  return { ok: true, data: undefined };
}

export async function unapproveInstagramTemplate(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return NOT_ADMIN;
  const admin = createAdminClient();
  const { error } = await admin
    .from("instagram_post_templates")
    .update({ is_approved: false, approved_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "更新に失敗しました。" };
  revalidatePath(PAGE);
  return { ok: true, data: undefined };
}

export async function setInstagramTemplateActive(id: string, active: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return NOT_ADMIN;
  const admin = createAdminClient();
  const { error } = await admin
    .from("instagram_post_templates")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "更新に失敗しました。" };
  revalidatePath(PAGE);
  return { ok: true, data: undefined };
}

// 文を削除する。過去の投稿の記録は残る(記録側のtemplate_idだけが空になる)。
export async function deleteInstagramTemplate(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return NOT_ADMIN;
  const admin = createAdminClient();
  const { error } = await admin.from("instagram_post_templates").delete().eq("id", id);
  if (error) return { ok: false, error: "削除に失敗しました。" };
  revalidatePath(PAGE);
  return { ok: true, data: undefined };
}

// 選ばれた画像ファイルを、Instagramが受け付けるJPEGに変換する(向きを直し、大きすぎれば縮小)。
// ストーリーズの背景は、投稿の直前に9:16に切り出して使うので、縦横比はここでは整えない。
async function toBackgroundJpeg(file: File): Promise<{ ok: true; jpeg: Buffer } | { ok: false; error: string }> {
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "8MB以下の画像を選択してください。" };
  try {
    const jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 1440, height: 2560, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 88 })
      .toBuffer();
    return { ok: true, jpeg };
  } catch {
    return { ok: false, error: "この形式の画像は変換できませんでした。JPEGまたはPNGを選んでください。" };
  }
}

const FOLDER_MAX = 40;
function cleanFolder(raw: string): string | null {
  const f = raw.trim();
  return f && f.length <= FOLDER_MAX ? f : null;
}

// 写真ライブラリに1枚追加する(画面側で1枚ずつ呼ぶ)。
export async function uploadInstagramLibraryImage(folder: string, formData: FormData): Promise<ActionResult<{ url: string }>> {
  if (!(await requireAdmin())) return NOT_ADMIN;
  const f = cleanFolder(folder);
  if (!f) return { ok: false, error: `フォルダ名を入力してください(${FOLDER_MAX}文字まで)。` };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "画像を選択してください。" };
  const converted = await toBackgroundJpeg(file);
  if (!converted.ok) return converted;

  const admin = createAdminClient();
  const path = `library/${Date.now()}-${crypto.randomUUID()}.jpg`;
  const { error: upError } = await admin.storage.from(BUCKET).upload(path, converted.jpeg, { contentType: "image/jpeg" });
  if (upError) return { ok: false, error: "アップロードに失敗しました。" };
  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { error } = await admin.from("instagram_images").insert({ folder: f, image_url: url, storage_path: path });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "保存に失敗しました。" };
  }
  revalidatePath(PAGE);
  return { ok: true, data: { url } };
}

export async function setInstagramLibraryImageActive(id: string, active: boolean): Promise<ActionResult> {
  if (!(await requireAdmin())) return NOT_ADMIN;
  const admin = createAdminClient();
  const { error } = await admin.from("instagram_images").update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, error: "更新に失敗しました。" };
  revalidatePath(PAGE);
  return { ok: true, data: undefined };
}

export async function moveInstagramLibraryImage(id: string, folder: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return NOT_ADMIN;
  const f = cleanFolder(folder);
  if (!f) return { ok: false, error: "フォルダ名を入力してください。" };
  const admin = createAdminClient();
  const { error } = await admin.from("instagram_images").update({ folder: f }).eq("id", id);
  if (error) return { ok: false, error: "更新に失敗しました。" };
  revalidatePath(PAGE);
  return { ok: true, data: undefined };
}

// 写真を削除する(Storageのファイルも消す)。過去の投稿の記録は残る(image_idだけ空になる)。
export async function deleteInstagramLibraryImage(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return NOT_ADMIN;
  const admin = createAdminClient();
  const { data } = await admin.from("instagram_images").select("storage_path").eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "見つかりません。" };
  const { error } = await admin.from("instagram_images").delete().eq("id", id);
  if (error) return { ok: false, error: "削除に失敗しました。" };
  await admin.storage.from(BUCKET).remove([data.storage_path as string]);
  revalidatePath(PAGE);
  return { ok: true, data: undefined };
}
