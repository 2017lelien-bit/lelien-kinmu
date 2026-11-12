import { NextResponse, type NextRequest } from "next/server";
import { getStaffUser } from "@/lib/auth";
import { previewMorningJpeg } from "@/lib/instagram/morning-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 管理画面用: 指定した日の「朝のストーリーズ」が、どう見えるかの画像を返す(投稿はしない・保存もしない)。
// 管理者としてログインしている人だけ。
export async function GET(request: NextRequest) {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
  try {
    const jpeg = await previewMorningJpeg(date);
    if (!jpeg) return NextResponse.json({ error: "その日のスケジュールのデータがありません。" }, { status: 404 });
    return new NextResponse(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[instagram-morning-preview] failed", e);
    return NextResponse.json({ error: "画像を作れませんでした。" }, { status: 500 });
  }
}
