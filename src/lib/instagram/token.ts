import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshLongLivedToken, verifyToken } from "@/lib/instagram/graph";
import { sendInstagramAlertEmail } from "@/lib/instagram/alerts";
import { getInstagramSettings, type InstagramSettings } from "@/lib/instagram/store";

// アクセストークン(長期・有効60日)の管理。
//  - 使うトークンは、DB(自動更新後のもの・期限内)を優先し、なければ環境変数 INSTAGRAM_ACCESS_TOKEN。
//    (DBのトークンが期限切れで、環境変数に新しいトークンを入れ直した場合は、環境変数が使われる)
//  - 期限の REFRESH_BEFORE_DAYS 日前になったら自動で更新する(更新は発行から24時間以上・失効前のみ可能)。
//  - 更新できない・失効している場合は、スタッフ宛にメールで知らせる(同じ通知は ALERT_INTERVAL_HOURS 時間に1回まで)。

const REFRESH_BEFORE_DAYS = 14;
const ALERT_INTERVAL_HOURS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Credentials {
  userId: string;
  token: string;
  source: "db" | "env";
  expiresAt: string | null; // dbのときだけ分かる
}

function dbTokenExpired(settings: InstagramSettings, nowMs: number): boolean {
  return !!settings.tokenExpiresAt && new Date(settings.tokenExpiresAt).getTime() <= nowMs;
}

export function resolveCredentials(settings: InstagramSettings, nowMs = Date.now()): Credentials | null {
  const userId = process.env.INSTAGRAM_USER_ID?.trim();
  if (!userId) return null;
  if (settings.accessToken && !dbTokenExpired(settings, nowMs)) {
    return { userId, token: settings.accessToken, source: "db", expiresAt: settings.tokenExpiresAt };
  }
  const envToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (envToken && envToken !== settings.accessToken) {
    return { userId, token: envToken, source: "env", expiresAt: null };
  }
  return null;
}

// 同じ内容の通知を何度も送らないよう、最後に通知した時刻を見て送る。送れた場合のみ記録する。
export async function alertTokenProblem(settings: InstagramSettings, subject: string, lines: string[]): Promise<boolean> {
  if (
    settings.tokenAlertSentAt &&
    Date.now() - new Date(settings.tokenAlertSentAt).getTime() < ALERT_INTERVAL_HOURS * 60 * 60 * 1000
  ) {
    return false;
  }
  const sent = await sendInstagramAlertEmail(subject, lines);
  if (sent) {
    const admin = createAdminClient();
    await admin.from("instagram_settings").upsert({ id: 1, token_alert_sent_at: new Date().toISOString() });
  }
  return sent;
}

export type TokenMaintenanceResult =
  | { status: "no_credentials"; alerted: boolean }
  | { status: "ok"; daysLeft: number }
  | { status: "would_refresh"; daysLeft: number | null }
  | { status: "refreshed"; expiresAt: string }
  | { status: "refresh_failed"; error: string; daysLeft: number | null; alerted: boolean };

const RENEW_GUIDE =
  "Meta for Developersでアクセストークンを取得し直し、Vercelの環境変数 INSTAGRAM_ACCESS_TOKEN を新しい値に更新して再デプロイしてください。";

export async function maintainToken(opts: { dryRun: boolean }): Promise<TokenMaintenanceResult> {
  const settings = await getInstagramSettings();
  const now = Date.now();
  const creds = resolveCredentials(settings, now);

  if (!creds) {
    const expired = !!settings.accessToken && dbTokenExpired(settings, now);
    const alerted = opts.dryRun
      ? false
      : await alertTokenProblem(
          settings,
          expired ? "アクセストークンの期限が切れています" : "アクセストークンが設定されていません",
          expired
            ? ["Instagramのアクセストークンの有効期限が切れたため、自動投稿ができません。", RENEW_GUIDE]
            : [
                "Instagram自動投稿のアクセストークン(INSTAGRAM_ACCESS_TOKEN)またはユーザーID(INSTAGRAM_USER_ID)が設定されていません。",
                "自動投稿は動きません。設定手順をご確認ください。",
              ],
        );
    return { status: "no_credentials", alerted };
  }

  const expiresAtMs = creds.expiresAt ? new Date(creds.expiresAt).getTime() : null;
  const daysLeft = expiresAtMs === null ? null : Math.floor((expiresAtMs - now) / DAY_MS);

  // 期限が分かっていて十分先なら何もしない。期限が不明(環境変数から取り込んだ直後)・期限が近いときは更新する。
  if (daysLeft !== null && daysLeft > REFRESH_BEFORE_DAYS) return { status: "ok", daysLeft };
  if (opts.dryRun) return { status: "would_refresh", daysLeft };

  try {
    const refreshed = await refreshLongLivedToken(creds.token);
    const expiresAt = new Date(now + refreshed.expiresInSec * 1000).toISOString();
    const admin = createAdminClient();
    const { error } = await admin.from("instagram_settings").upsert({
      id: 1,
      access_token: refreshed.accessToken,
      token_expires_at: expiresAt,
      token_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`failed to save refreshed token: ${error.message}`);
    return { status: "refreshed", expiresAt };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // 更新に失敗しても、トークン自体がまだ使えるなら慌てない(発行から24時間未満だと更新できないため)。
    // 期限が7日を切っている、またはトークンが使えない状態のときはスタッフに通知する。
    let tokenUsable = false;
    try {
      await verifyToken({ userId: creds.userId, token: creds.token });
      tokenUsable = true;
    } catch {
      tokenUsable = false;
    }
    const urgent = !tokenUsable || (daysLeft !== null && daysLeft <= 7);
    const alerted = urgent
      ? await alertTokenProblem(settings, "アクセストークンを更新できませんでした", [
          daysLeft !== null
            ? `アクセストークンの有効期限まであと約${daysLeft}日です。自動更新に失敗しました。`
            : "アクセストークンの確認・自動更新に失敗しました。",
          `エラー: ${message}`,
          RENEW_GUIDE,
        ])
      : false;
    return { status: "refresh_failed", error: message, daysLeft, alerted };
  }
}
