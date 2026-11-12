import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDaysToDateString, todayJstDateString } from "@/lib/date";
import { validateCaption } from "@/lib/instagram/copy-rules";
import { renderStoryTextJpeg } from "@/lib/instagram/image";
import { sendInstagramAlertEmail } from "@/lib/instagram/alerts";
import { buildMorningLines, scheduleCoverageDays } from "@/lib/instagram/morning";
import { MAX_ATTEMPTS, publishClaimedRow, takeOverForRetry, uploadJpeg } from "@/lib/instagram/autopost";
import { getInstagramSettings, listInstagramLibraryImages, type InstagramPostRow } from "@/lib/instagram/store";
import { CLASS_BACKGROUND_FOLDERS, pickLibraryImageFromFolders } from "@/lib/instagram/template-pick";
import { alertTokenProblem, resolveCredentials } from "@/lib/instagram/token";

// 朝のストーリーズ(あいさつ + 今日のレッスン + 前向きな一言)。/api/cron/instagram-morning から、毎朝(日本時間7時台)に呼ばれる。
//  - 環境変数 INSTAGRAM_AUTOPOST_ENABLED=true と、管理画面のスイッチの両方がONのときだけ投稿する(文字ストーリーズと同じ)。
//  - 1日1本。dedupe_key は story-morning:日付。確保(INSERT)の一意制約で、二重投稿を防ぐ。
//  - 失敗したら、この実行の中で最大 MAX_ATTEMPTS 回まで再試行する(時間がたってからの「おはよう」は出さない)。
//  - その日のデータ(morning-data.ts)がなければ、出さずにスタッフへメールで知らせる。

const MORNING_FOLDERS = CLASS_BACKGROUND_FOLDERS.map((c) => c.folder);
const RETRY_WAIT_MS = 20_000;
const COVERAGE_WARN_DAYS = 4; // 先のスケジュールのデータが、この日数を切ったらスタッフに知らせる

export interface MorningResponse {
  dryRun: boolean;
  enabled: boolean;
  switchOn: boolean;
  today: string;
  lines?: string[];
  imageNote?: string;
  coverageDays: number;
  skipped: { reason: string }[];
  posted?: { dedupeKey: string; mediaId: string | null; alreadyPublished: boolean };
  errors?: string[];
}

// 指定日の朝のストーリーズの画像を作る(Storageには保存しない)。プレビュー用。データがない日は null。
export async function previewMorningJpeg(date: string): Promise<Buffer | null> {
  const lines = buildMorningLines(date);
  if (!lines) return null;
  const photo = pickLibraryImageFromFolders(await listInstagramLibraryImages(), MORNING_FOLDERS);
  return renderStoryTextJpeg({ lines, photoUrl: photo?.imageUrl ?? null });
}

async function warnIfScheduleRunsOut(today: string): Promise<void> {
  const days = scheduleCoverageDays(today, COVERAGE_WARN_DAYS + 1);
  if (days > COVERAGE_WARN_DAYS) return;
  await sendInstagramAlertEmail("朝のストーリーズ用のスケジュールが、もうすぐなくなります", [
    `朝のストーリーズ用のレッスンスケジュールが、あと${days}日分しか入っていません(今日を含む)。`,
    "次の月の月間スケジュール(公開用の画像)を、Claudeに渡して、登録してもらってください。",
    "スケジュールがない日は、朝のストーリーズは出ません。",
  ]).catch((e) => console.error("[instagram-morning] schedule alert failed", e));
}

export async function runMorningStory(opts: { dryRun: boolean; date?: string }): Promise<MorningResponse> {
  const envOn = process.env.INSTAGRAM_AUTOPOST_ENABLED === "true";
  const admin = createAdminClient();
  const today = opts.dryRun && opts.date ? opts.date : todayJstDateString();
  const settings = await getInstagramSettings();
  const creds = resolveCredentials(settings);
  const enabled = envOn && settings.storyEnabled;
  const response: MorningResponse = {
    dryRun: opts.dryRun,
    enabled: envOn,
    switchOn: settings.storyEnabled,
    today,
    coverageDays: scheduleCoverageDays(today),
    skipped: [],
  };

  if (!enabled && !opts.dryRun) {
    response.skipped.push({
      reason: !envOn ? "INSTAGRAM_AUTOPOST_ENABLED が true ではありません。" : "管理画面の自動投稿のスイッチがOFFです。",
    });
    return response;
  }

  const lines = buildMorningLines(today);
  if (!lines) {
    response.skipped.push({ reason: `${today} のスケジュールのデータがありません。朝のストーリーズは出しません。` });
    if (!opts.dryRun) {
      await sendInstagramAlertEmail("朝のストーリーズを出せませんでした(スケジュール未登録)", [
        `${today} のレッスンスケジュールが登録されていないため、朝のストーリーズを出しませんでした。`,
        "月間スケジュール(公開用の画像)を、Claudeに渡して、登録してもらってください。",
      ]).catch((e) => console.error("[instagram-morning] alert failed", e));
    }
    return response;
  }
  response.lines = lines;

  const problems = validateCaption(lines.join("\n"));
  if (problems.length > 0) {
    response.skipped.push({ reason: `文面ルール違反のため出しません: ${problems.join(" / ")}` });
    if (!opts.dryRun) {
      await sendInstagramAlertEmail("朝のストーリーズを出しませんでした(文面ルール)", [
        `${today} の朝のストーリーズに、使えない表現が含まれていました。`,
        ...problems,
        "スケジュールの項目名か、前向きな一言を見直してください。",
      ]).catch((e) => console.error("[instagram-morning] alert failed", e));
    }
    return response;
  }

  const photo = pickLibraryImageFromFolders(await listInstagramLibraryImages(), MORNING_FOLDERS);
  response.imageNote = photo ? `背景: クラス別フォルダから、最近使っていない写真を選びました(フォルダ「${photo.folder}」)` : "背景: 写真なし(シンプルな版)";

  if (opts.dryRun) return response; // ドライランは、ここまで(投稿・画像の保存・DBへの書き込みはしない)

  if (!creds) {
    response.errors = ["InstagramのトークンまたはユーザーIDが未設定です。"];
    await alertTokenProblem(settings, "アクセストークンが設定されていません", [
      "Instagram自動投稿のアクセストークンまたはユーザーIDが設定されていません。",
    ]);
    return response;
  }

  const dedupeKey = `story-morning:${today}`;
  const { data: existing } = await admin.from("instagram_posts").select("*").eq("dedupe_key", dedupeKey).maybeSingle();
  let row = (existing as InstagramPostRow | null) ?? null;

  if (row?.status === "published") {
    response.skipped.push({ reason: "今日の朝のストーリーズは、すでに出しています。" });
    return response;
  }
  if (row?.status === "gave_up") {
    response.skipped.push({ reason: "今日の朝のストーリーズは、再試行を終了しています。" });
    return response;
  }

  if (!row) {
    // 画像を作ってStorageへ。失敗しても確保前なので行は残らない(次の実行でやり直せる)。
    let imageUrl: string;
    try {
      const jpeg = await renderStoryTextJpeg({ lines, photoUrl: photo?.imageUrl ?? null });
      imageUrl = await uploadJpeg(`stories/${today}-morning-${crypto.randomUUID()}.jpg`, jpeg);
    } catch (e) {
      (response.errors ??= []).push(`画像の作成に失敗しました: ${(e as Error).message}`);
      return response;
    }
    const { data: claimed, error: claimError } = await admin
      .from("instagram_posts")
      .insert({
        post_type: "story",
        dedupe_key: dedupeKey,
        post_date: today,
        template_id: null,
        caption: "",
        image_url: imageUrl,
        image_source: "story",
        image_id: photo?.id ?? null,
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
    row = claimed as InstagramPostRow;
  } else {
    const taken = await takeOverForRetry(row); // 前の実行で失敗した・止まった行を引き継ぐ
    if (!taken) {
      response.skipped.push({ reason: "他の実行が処理中のためスキップしました。" });
      return response;
    }
    row = taken;
  }

  // 投稿。失敗したら、この実行の中で、少し待って再試行する。
  for (;;) {
    const res = await publishClaimedRow(row, creds, settings);
    if (!("error" in res)) {
      response.posted = { dedupeKey, mediaId: res.mediaId, alreadyPublished: res.alreadyPublished };
      break;
    }
    (response.errors ??= []).push(`投稿に失敗しました(${row.attempts}回目): ${res.error}`);
    const { data: latest } = await admin.from("instagram_posts").select("*").eq("id", row.id).maybeSingle();
    const current = latest as InstagramPostRow | null;
    if (!current || current.status === "gave_up" || current.attempts >= MAX_ATTEMPTS) break;
    await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));
    const taken = await takeOverForRetry(current);
    if (!taken) break;
    row = taken;
  }

  await warnIfScheduleRunsOut(addDaysToDateString(today, 1));
  return response;
}
