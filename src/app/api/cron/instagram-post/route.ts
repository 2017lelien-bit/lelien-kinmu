import { NextResponse, type NextRequest } from "next/server";
import { runInstagramAutopost, previewNextStoryJpeg } from "@/lib/instagram/autopost";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cronから毎日2回(11時ごろ・16時ごろ。日本時間)呼び出される。1回の実行で、文字だけのストーリーズを1本出す。
// 2回目は、1回目で失敗した投稿の再試行も兼ねる。
//  - 環境変数 INSTAGRAM_AUTOPOST_ENABLED=true にするまで何も投稿しない(初期状態はOFF)。さらに、管理画面のスイッチもONのときだけ。
//  - ドライラン: ?dryRun=1 または INSTAGRAM_AUTOPOST_DRY_RUN=true。投稿する内容を返すだけで、
//    Instagramへの投稿・画像のアップロード・DBへの書き込みは一切しない(OFFのままでも使える)。
//      ?dryRun=1&image=1  と併せると、次に出る画像(JPEG)そのものを返す。
//  - 二重投稿の防止・再試行・1日の上限の仕組みは src/lib/instagram/autopost.ts を参照。
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const enabled = process.env.INSTAGRAM_AUTOPOST_ENABLED === "true";
  const dryRun = process.env.INSTAGRAM_AUTOPOST_DRY_RUN === "true" || params.get("dryRun") === "1";

  if (!enabled && !dryRun) {
    return NextResponse.json({ enabled: false, message: "INSTAGRAM_AUTOPOST_ENABLED が true ではないため何もしません。" });
  }

  try {
    // ドライラン専用: 次に出る画像のプレビュー(JPEGをそのまま返す。Storageには保存しない)。
    if (dryRun && params.get("image") === "1") {
      const jpeg = await previewNextStoryJpeg();
      if (!jpeg) return NextResponse.json({ preview: false, reason: "出せる文がありません(承認済みで、まだ出していない文が必要です)。" });
      return new NextResponse(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
    }

    const result = await runInstagramAutopost({ dryRun });
    // 画像の作成に失敗した等のエラーがあれば、Vercelのcronログで気づけるよう500で返す。
    return NextResponse.json(result, { status: result.errors && result.errors.length > 0 ? 500 : 200 });
  } catch (e) {
    console.error("[instagram-post] failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
