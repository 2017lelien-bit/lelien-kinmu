import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayOfWeekForDate, todayJstDateString } from "@/lib/date";
import { validateCaption } from "@/lib/instagram/copy-rules";
import { GraphError, publishImagePost, type GraphConfig } from "@/lib/instagram/graph";
import { renderStoryTextJpeg } from "@/lib/instagram/image";
import { storyLinesFromBody } from "@/lib/instagram/story-text";
import { sendInstagramAlertEmail } from "@/lib/instagram/alerts";
import {
  getInstagramSettings,
  listInstagramLibraryImages,
  listInstagramTemplates,
  type InstagramPostRow,
  type InstagramSettings,
} from "@/lib/instagram/store";
import { orderEligibleTemplates, pickBackgroundForTitle } from "@/lib/instagram/template-pick";
import { alertTokenProblem, resolveCredentials, type Credentials } from "@/lib/instagram/token";

// Instagram自動投稿の本体(/api/cron/instagram-post から呼ばれる)。Le lienは「文字だけのストーリーズ」だけを出す。
//
// 出すもの: 渡部さんが承認した文(テンプレート)を、1回ずつ順番に。一度出した文は二度と出さない。AIが文章を作ることはない。
// 回数: 1日2本まで(cronを11時ごろ・16時ごろの2回走らせ、1回の実行で1本)。
//
// 二重投稿を防ぐ仕組み(多重の防御):
//  1. 投稿の前に instagram_posts へ行を作って「確保」する。dedupe_key(story-text:日付:枠番号)が一意なので、
//     cronが二重に走っても、同時に走っても、確保できるのは1回だけ。確保できなければ何もしない。
//  2. 確保した行は status で管理する(claimed → published / failed / gave_up)。published は二度と触らない。
//  3. Instagramのコンテナを作った直後にコンテナ番号をDBへ保存する。再試行では、まずそのコンテナの状態を確認し、
//     公開済みなら「成功」として記録するだけ。公開の応答が途中で途切れても、同じ投稿を二度出さない。
//  4. 1日の投稿数の上限(DAILY_LIMIT)を、失敗・再試行待ちの行も含めて数える。確保の「後」にもう一度数え直し、
//     同時に走った別の実行が先に上限を使っていれば、確保を取り消す。
//
// 再試行の方針: 失敗した投稿は同じ日のうちに最大 MAX_ATTEMPTS 回まで(cronの2回目で再試行)。
// 一時的な失敗(通信・Metaの障害・レート制限)は再試行、トークンの問題は再試行しつつスタッフに通知、
// 内容の問題や回数超過は gave_up にしてスタッフに通知する。日をまたいだ再試行はしない。

export const MAX_ATTEMPTS = 3;
export const DAILY_LIMIT = 2; // 文字ストーリーズの1日の上限
const STALE_CLAIM_MIN = 15; // 確保したまま15分以上動いていない行は、落ちたものとみなして引き継ぐ
const RETRY_DELAY_MIN = 90;
const BUCKET = "instagram-posts";
const TEXT_STOCK_ALERT_AT = 4; // 承認済みで未投稿の文が、これ以下になったらスタッフにメール

// ストーリーズの背景の写真を入れておくフォルダ(写真ライブラリのフォルダ名)。
export const STORY_FOLDER = "ストーリー背景";

export interface PlannedPost {
  dedupeKey: string;
  captionProblems: string[];
  imageNote: string;
  templateId: string;
  templateTitle: string;
  lines: string[];
}

export interface AutopostResponse {
  dryRun: boolean;
  enabled: boolean; // 環境変数 INSTAGRAM_AUTOPOST_ENABLED
  switchOn: boolean; // 管理画面のスイッチ
  today: string;
  weekday: number;
  dailyLimit: number;
  countedToday: number;
  stockRemaining: number;
  credentials: "db" | "env" | "none";
  planned?: PlannedPost[];
  skipped: { reason: string }[];
  retried?: { id: string; dedupeKey: string; outcome: string }[];
  posted?: { dedupeKey: string; mediaId: string | null; alreadyPublished: boolean }[];
  errors?: string[];
}

export async function uploadJpeg(path: string, jpeg: Buffer): Promise<string> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
  if (error) throw new GraphError(`storage upload failed: ${error.message}`, "transient", null, null);
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

interface TextPlan {
  templateId: string;
  lines: string[];
  photoUrl: string | null;
  imageId: string | null;
  planned: PlannedPost;
}

type PlanResult = { ok: true; plan: TextPlan } | { ok: false; reason: string };

// 次に出す文(承認済みで、まだ出していないものを、並び順に1本)と、背景の写真(最近使っていないもの)を決める。
async function planStoryText(dedupeKey: string): Promise<PlanResult> {
  const templates = await listInstagramTemplates();
  const { ordered, skipped } = orderEligibleTemplates(templates);
  const notes: string[] = skipped.map((s) => `「${s.title}」:${s.reason}`);
  for (const t of ordered) {
    const lines = storyLinesFromBody(t.body);
    if (!lines) {
      notes.push(`「${t.title}」:文が長すぎて、ストーリーズの画像にできません`);
      continue;
    }
    const photo = pickBackgroundForTitle(await listInstagramLibraryImages(), t.title, STORY_FOLDER);
    const imageNote = photo
      ? `背景: フォルダ「${photo.folder}」から、最近使っていない写真を選びました`
      : `背景: 写真なし(シンプルな版)。フォルダ「${STORY_FOLDER}」に写真を入れると、写真つきになります`;
    return {
      ok: true,
      plan: {
        templateId: t.id,
        lines,
        photoUrl: photo?.imageUrl ?? null,
        imageId: photo?.id ?? null,
        planned: {
          dedupeKey,
          captionProblems: validateCaption(t.body),
          imageNote: `${imageNote}。実際の投稿時に1080×1920のJPEGを生成してStorageに保存します`,
          templateId: t.id,
          templateTitle: t.title,
          lines,
        },
      },
    };
  }
  return { ok: false, reason: `出せる文がありません(承認済みで、まだ出していないものが必要)。${notes.slice(0, 3).join(" / ")}` };
}

// ドライラン用: 次に出る文の画像(JPEG)を作る(Storageには保存しない)。
export async function previewNextStoryJpeg(): Promise<Buffer | null> {
  const result = await planStoryText("preview");
  if (!result.ok) return null;
  return renderStoryTextJpeg({ lines: result.plan.lines, photoUrl: result.plan.photoUrl });
}

// 管理画面用: 指定した文(未承認でも)の見た目を作る(Storageには保存しない)。
export async function previewBodyJpeg(body: string, title: string): Promise<Buffer | null> {
  const lines = storyLinesFromBody(body);
  if (!lines) return null;
  const photo = pickBackgroundForTitle(await listInstagramLibraryImages(), title, STORY_FOLDER);
  return renderStoryTextJpeg({ lines, photoUrl: photo?.imageUrl ?? null });
}

// 今日の文字ストーリーズの、空いている枠(1・2本目)のキー。両方使い済みなら null。
async function nextSlotKey(today: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("instagram_posts").select("dedupe_key").like("dedupe_key", `story-text:${today}:%`);
  const used = new Set((data ?? []).map((r) => (r as { dedupe_key: string }).dedupe_key));
  for (let n = 1; n <= DAILY_LIMIT; n++) {
    const key = `story-text:${today}:${n}`;
    if (!used.has(key)) return key;
  }
  return null;
}

// 今日(日本時間)すでに数に入っている投稿数(失敗・再試行待ちも含む。gave_upは含まない)。
async function countedToday(today: string): Promise<number> {
  const { count } = await createAdminClient()
    .from("instagram_posts")
    .select("id", { count: "exact", head: true })
    .eq("post_date", today)
    .like("dedupe_key", "story-text:%") // 朝のストーリーズ(story-morning:)は、文字ストーリーズの1日の上限には数えない
    .in("status", ["claimed", "published", "failed"]);
  return count ?? 0;
}

// 承認済みで、まだ出していない文の本数。
async function remainingStock(): Promise<number> {
  return orderEligibleTemplates(await listInstagramTemplates()).ordered.length;
}

// 文が残り少なくなったら、スタッフにメールでお知らせする(1日に最初の実行のときだけ)。
async function alertStockIfLow(today: string, remaining: number): Promise<void> {
  const { count } = await createAdminClient()
    .from("instagram_posts")
    .select("id", { count: "exact", head: true })
    .like("dedupe_key", `story-text:${today}:%`);
  if ((count ?? 0) > 0) return; // 今日はもう実行済み(メールは1日1回まで)
  if (remaining > TEXT_STOCK_ALERT_AT) return;
  await sendInstagramAlertEmail("ストーリーズ用の文が残り少なくなりました", [
    `文字だけのストーリーズ用の、まだ出していない承認済みの文が、残り${remaining}本です。`,
    "なくなると、ストーリーズは出なくなります。新しい文の準備と承認をお願いします。",
  ]);
}

// 投稿と投稿のあいだを少しあける(続けて投稿すると、Instagram側で一時的なエラーになることがあったため)。
const PUBLISH_GAP_MS = 10_000;
let lastPublishEndedAt = 0;

function toGraphConfig(c: Credentials): GraphConfig {
  return { userId: c.userId, token: c.token };
}

// 確保済みの行を実際にInstagramへ投稿し、結果を行に記録する。
export async function publishClaimedRow(
  row: InstagramPostRow,
  creds: Credentials,
  settings: InstagramSettings,
): Promise<{ mediaId: string | null; alreadyPublished: boolean } | { error: string }> {
  const admin = createAdminClient();
  const wait = PUBLISH_GAP_MS - (Date.now() - lastPublishEndedAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  try {
    // 投稿直前の再チェック: 元の文がいまも承認済み・使う設定・禁止語なしであること(承認を取り消した場合は出さない)。
    if (row.template_id) {
      const { data: t } = await admin
        .from("instagram_post_templates")
        .select("body, is_approved, is_active")
        .eq("id", row.template_id)
        .maybeSingle();
      if (!t || !t.is_approved || !t.is_active) {
        throw new GraphError("template is no longer approved/active", "permanent", null, null);
      }
      const problems = validateCaption(t.body as string);
      if (problems.length > 0) {
        throw new GraphError(`text rejected by copy rules: ${problems.join(" / ")}`, "permanent", null, null);
      }
    }
    if (!row.image_url) throw new GraphError("image_url is empty", "permanent", null, null);

    const result = await publishImagePost(
      toGraphConfig(creds),
      { imageUrl: row.image_url, caption: "", existingContainerId: row.container_id, mediaType: "STORIES" },
      {
        pollIntervalMs: 3000,
        maxPolls: 10,
        onContainerCreated: async (containerId) => {
          await admin.from("instagram_posts").update({ container_id: containerId }).eq("id", row.id);
        },
      },
    );

    await admin
      .from("instagram_posts")
      .update({
        status: "published",
        media_id: result.mediaId,
        container_id: result.containerId,
        published_at: new Date().toISOString(),
        last_error: null,
        error_kind: null,
        next_retry_at: null,
      })
      .eq("id", row.id);

    if (row.image_id) {
      const { data: img } = await admin.from("instagram_images").select("use_count").eq("id", row.image_id).maybeSingle();
      await admin
        .from("instagram_images")
        .update({ last_used_at: new Date().toISOString(), use_count: ((img?.use_count as number | undefined) ?? 0) + 1 })
        .eq("id", row.image_id);
    }

    if (row.template_id) {
      const { data: t } = await admin.from("instagram_post_templates").select("post_count").eq("id", row.template_id).maybeSingle();
      await admin
        .from("instagram_post_templates")
        .update({ last_posted_at: new Date().toISOString(), post_count: ((t?.post_count as number | undefined) ?? 0) + 1 })
        .eq("id", row.template_id);
    }
    lastPublishEndedAt = Date.now();
    return { mediaId: result.mediaId, alreadyPublished: result.alreadyPublished };
  } catch (e) {
    lastPublishEndedAt = Date.now();
    const message = e instanceof Error ? e.message : String(e);
    const kind = e instanceof GraphError ? e.kind : "transient";
    const giveUp = kind === "permanent" || row.attempts >= MAX_ATTEMPTS;
    await admin
      .from("instagram_posts")
      .update({
        status: giveUp ? "gave_up" : "failed",
        last_error: message.slice(0, 1000),
        error_kind: kind,
        next_retry_at: giveUp ? null : new Date(Date.now() + RETRY_DELAY_MIN * 60_000).toISOString(),
      })
      .eq("id", row.id);

    if (kind === "token") {
      await alertTokenProblem(settings, "Instagramへの投稿がトークンの問題で失敗しました", [
        `投稿(${row.dedupe_key})が、アクセストークンの問題で失敗しました。`,
        `エラー: ${message}`,
        "Meta for Developersでアクセストークンを取得し直し、Vercelの環境変数 INSTAGRAM_ACCESS_TOKEN を更新してください。",
      ]);
    } else if (giveUp) {
      await sendInstagramAlertEmail("投稿をあきらめました", [
        `投稿(${row.dedupe_key})が${row.attempts}回失敗し、これ以上自動では再試行しません。`,
        `エラー: ${message}`,
        "管理画面のInstagramのページで、最近の投稿の状態をご確認ください。",
      ]);
    }
    return { error: message };
  }
}

// 確保済みの失敗行/止まった行を引き継ぐ。更新できた(=自分が引き継げた)ときだけ行を返す。
export async function takeOverForRetry(row: InstagramPostRow): Promise<InstagramPostRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("instagram_posts")
    .update({ status: "claimed", claimed_at: new Date().toISOString(), attempts: row.attempts + 1 })
    .eq("id", row.id)
    .eq("status", row.status) // 取得時から状態が変わっていなければ(他の実行に先を越されていなければ)
    .eq("attempts", row.attempts)
    .select("*");
  return ((data ?? [])[0] as InstagramPostRow | undefined) ?? null;
}

export async function runInstagramAutopost(opts: { dryRun: boolean }): Promise<AutopostResponse> {
  const envOn = process.env.INSTAGRAM_AUTOPOST_ENABLED === "true";
  const admin = createAdminClient();
  const now = new Date();
  const today = todayJstDateString();
  const settings = await getInstagramSettings();
  const creds = resolveCredentials(settings);
  const enabled = envOn && settings.storyEnabled; // 環境変数と、管理画面のスイッチの両方がONのときだけ投稿する

  const response: AutopostResponse = {
    dryRun: opts.dryRun,
    enabled: envOn,
    switchOn: settings.storyEnabled,
    today,
    weekday: dayOfWeekForDate(today),
    dailyLimit: DAILY_LIMIT,
    countedToday: await countedToday(today),
    stockRemaining: await remainingStock(),
    credentials: creds?.source ?? "none",
    skipped: [],
  };

  if (!enabled && !opts.dryRun) {
    response.skipped.push({
      reason: !envOn ? "INSTAGRAM_AUTOPOST_ENABLED が true ではありません。" : "管理画面の自動投稿のスイッチがOFFです。",
    });
    return response;
  }

  if (!opts.dryRun && !creds) {
    response.errors = ["InstagramのトークンまたはユーザーIDが未設定です。"];
    await alertTokenProblem(settings, "アクセストークンが設定されていません", [
      "Instagram自動投稿のアクセストークン(INSTAGRAM_ACCESS_TOKEN)またはユーザーID(INSTAGRAM_USER_ID)が設定されていません。",
    ]);
    return response;
  }

  // 1) 今日の失敗・止まった投稿の再試行(ドライランでは対象を表示するだけ)
  const { data: retryable } = await admin
    .from("instagram_posts")
    .select("*")
    .eq("post_date", today)
    .in("status", ["failed", "claimed"])
    .lt("attempts", MAX_ATTEMPTS + 1);
  const retryRows = ((retryable ?? []) as InstagramPostRow[]).filter((r) => {
    if (r.dedupe_key.startsWith("story-morning:")) return false; // 朝のストーリーズは、朝の実行の中だけで再試行する(昼過ぎに「おはよう」は出さない)
    if (r.status === "failed") return !r.next_retry_at || new Date(r.next_retry_at).getTime() <= now.getTime();
    return now.getTime() - new Date(r.claimed_at).getTime() > STALE_CLAIM_MIN * 60_000; // 止まった確保
  });

  response.retried = [];
  for (const r of retryRows) {
    if (opts.dryRun) {
      response.retried.push({ id: r.id, dedupeKey: r.dedupe_key, outcome: `再試行対象(これまで${r.attempts}回目まで実行): ${r.last_error ?? "前回の実行が途中で止まっています"}` });
      continue;
    }
    if (r.attempts >= MAX_ATTEMPTS) {
      await admin.from("instagram_posts").update({ status: "gave_up" }).eq("id", r.id).eq("status", r.status);
      await sendInstagramAlertEmail("投稿をあきらめました", [
        `投稿(${r.dedupe_key})が${r.attempts}回で完了しませんでした。これ以上自動では再試行しません。`,
        `最後のエラー: ${r.last_error ?? "(前回の実行が途中で止まりました)"}`,
      ]);
      response.retried.push({ id: r.id, dedupeKey: r.dedupe_key, outcome: "gave_up" });
      continue;
    }
    const taken = await takeOverForRetry(r);
    if (!taken) {
      response.retried.push({ id: r.id, dedupeKey: r.dedupe_key, outcome: "他の実行が処理中のためスキップ" });
      continue;
    }
    const res = await publishClaimedRow(taken, creds!, settings);
    response.retried.push({ id: r.id, dedupeKey: r.dedupe_key, outcome: "error" in res ? `失敗: ${res.error}` : "投稿しました" });
  }

  // 2) 新規の投稿(1回の実行で1本)
  if (!opts.dryRun) {
    await alertStockIfLow(today, response.stockRemaining).catch((e) => console.error("[instagram] stock alert failed", e));
  }

  if ((await countedToday(today)) >= DAILY_LIMIT) {
    response.skipped.push({ reason: `今日の数が上限(${DAILY_LIMIT}件)に達しているため、新しくは出しません。` });
    return response;
  }
  const dedupeKey = await nextSlotKey(today);
  if (!dedupeKey) {
    response.skipped.push({ reason: "今日の枠は、すべて記録があります。" });
    return response;
  }

  let planResult: PlanResult;
  try {
    planResult = await planStoryText(dedupeKey);
  } catch (e) {
    (response.errors ??= []).push(`投稿内容の作成に失敗しました: ${(e as Error).message}`);
    return response;
  }
  if (!planResult.ok) {
    response.skipped.push({ reason: planResult.reason });
    return response;
  }
  const { plan } = planResult;
  if (plan.planned.captionProblems.length > 0) {
    response.skipped.push({ reason: `文面ルール違反のため投稿しません: ${plan.planned.captionProblems.join(" / ")}` });
    return response;
  }

  if (opts.dryRun) {
    response.planned = [plan.planned];
    return response;
  }

  // 画像を作ってStorageへ。失敗しても確保前なので行は残らず、次のcron実行でやり直す。
  let imageUrl: string;
  try {
    const jpeg = await renderStoryTextJpeg({ lines: plan.lines, photoUrl: plan.photoUrl });
    imageUrl = await uploadJpeg(`stories/${today}-text-${crypto.randomUUID()}.jpg`, jpeg);
  } catch (e) {
    (response.errors ??= []).push(`画像の作成に失敗しました(次の実行でやり直します): ${(e as Error).message}`);
    return response;
  }

  // 確保(INSERT)。dedupe_key の一意制約により、同時に走った他の実行がいれば片方だけが成功する。
  const { data: claimed, error: claimError } = await admin
    .from("instagram_posts")
    .insert({
      post_type: "story",
      dedupe_key: dedupeKey,
      post_date: today,
      template_id: plan.templateId,
      caption: "", // ストーリーズには文面(キャプション)を付けない
      image_url: imageUrl,
      image_source: "story",
      image_id: plan.imageId,
      status: "claimed",
      attempts: 1,
    })
    .select("*")
    .single();
  if (claimError || !claimed) {
    response.skipped.push({
      reason: claimError?.code === "23505" ? "他の実行が先に確保したためスキップしました。" : `確保に失敗しました: ${claimError?.message}`,
    });
    return response;
  }

  // 1日の上限を、確保の「後」にもう一度確かめる(同時に走った場合も、どちらか一方だけが残る)。
  const { data: todayRows } = await admin
    .from("instagram_posts")
    .select("id, created_at")
    .eq("post_date", today)
    .like("dedupe_key", "story-text:%")
    .in("status", ["claimed", "published", "failed"]);
  const ordered = ((todayRows ?? []) as { id: string; created_at: string }[]).sort((x, y) =>
    x.created_at === y.created_at ? x.id.localeCompare(y.id) : x.created_at < y.created_at ? -1 : 1,
  );
  const rank = ordered.findIndex((r) => r.id === (claimed as InstagramPostRow).id);
  if (rank >= DAILY_LIMIT) {
    await admin.from("instagram_posts").delete().eq("id", (claimed as InstagramPostRow).id);
    response.skipped.push({ reason: `同時に実行された別の投稿が先に上限(${DAILY_LIMIT}件)を使ったため、取りやめました。` });
    return response;
  }

  const res = await publishClaimedRow(claimed as InstagramPostRow, creds!, settings);
  response.posted = [];
  if ("error" in res) (response.errors ??= []).push(`投稿に失敗しました: ${res.error}`);
  else response.posted.push({ dedupeKey, mediaId: res.mediaId, alreadyPublished: res.alreadyPublished });
  return response;
}
