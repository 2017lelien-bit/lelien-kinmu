import { NextResponse, type NextRequest } from "next/server";
import { todayJstDateString } from "@/lib/date";
import { previewMorningJpeg, runMorningStory } from "@/lib/instagram/morning-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cronから毎朝1回(日本時間の7時台。無料プランは、指定の時刻から1時間以内にずれることがある)呼び出される。
// 朝のストーリーズ(あいさつ + 今日のレッスン + 前向きな一言)を1本出す。
//  - 環境変数 INSTAGRAM_AUTOPOST_ENABLED=true と、管理画面のスイッチの両方がONのときだけ投稿する(初期状態はOFF)。
//  - ドライラン: ?dryRun=1(&date=2026-11-13 で日付を指定)。載せる文だけを返し、Instagramへの投稿・画像の保存・DBへの書き込みはしない。
//      ?dryRun=1&image=1&date=... と併せると、画像(JPEG)そのものを返す。
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const dryRun = params.get("dryRun") === "1";
  const date = params.get("date") ?? undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });

  try {
    if (dryRun && params.get("image") === "1") {
      const jpeg = await previewMorningJpeg(date ?? todayJstDateString());
      if (!jpeg) return NextResponse.json({ preview: false, reason: "その日のスケジュールのデータがありません。" });
      return new NextResponse(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
    }
    const result = await runMorningStory({ dryRun, date });
    return NextResponse.json(result, { status: result.errors && result.errors.length > 0 ? 500 : 200 });
  } catch (e) {
    console.error("[instagram-morning] failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
