import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/instagram/graph";
import { getInstagramSettings } from "@/lib/instagram/store";
import { maintainToken, resolveCredentials } from "@/lib/instagram/token";

export const dynamic = "force-dynamic";

// Vercel Cronから毎日1回呼び出され、Instagramのアクセストークン(有効60日)の期限を確認する。
//  - 期限の14日前から自動で更新する。更新できない・失効している場合はスタッフ(STAFF_NOTIFICATION_EMAILS)にメールで知らせる。
//  - INSTAGRAM_AUTOPOST_ENABLED=true にするまで何もしない。?dryRun=1 なら状態を返すだけで更新も通知もしない。
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const enabled = process.env.INSTAGRAM_AUTOPOST_ENABLED === "true";
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  // 接続の確認(読み取りのみ): ?dryRun=1&check=1。トークンが有効か、INSTAGRAM_USER_ID が合っているかを確かめる。
  // 投稿・トークンの更新・DBへの書き込みは一切しない。トークンの値は返さない。
  if (dryRun && request.nextUrl.searchParams.get("check") === "1") {
    const creds = resolveCredentials(await getInstagramSettings());
    if (!creds) return NextResponse.json({ check: true, ok: false, reason: "トークンまたはユーザーIDが未設定です。" });
    try {
      const me = await verifyToken({ userId: creds.userId, token: creds.token });
      return NextResponse.json({
        check: true,
        ok: true,
        tokenSource: creds.source,
        username: me.username,
        userIdMatches: me.userId !== null && me.userId === creds.userId,
      });
    } catch (e) {
      return NextResponse.json({ check: true, ok: false, reason: (e as Error).message });
    }
  }

  if (!enabled && !dryRun) {
    return NextResponse.json({ enabled: false, message: "INSTAGRAM_AUTOPOST_ENABLED が true ではないため何もしません。" });
  }

  try {
    const result = await maintainToken({ dryRun });
    return NextResponse.json({ dryRun, enabled, ...result });
  } catch (e) {
    console.error("[instagram-token] failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
