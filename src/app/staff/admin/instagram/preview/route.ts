import { NextResponse, type NextRequest } from "next/server";
import { getStaffUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { previewBodyJpeg } from "@/lib/instagram/autopost";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 管理画面用: 登録した文(未承認でも)が、ストーリーズでどう見えるかの画像を返す(投稿はしない・保存もしない)。
// 管理者としてログインしている人だけ。/staff 以下なので、ログインの確認(proxy)も通っている。
export async function GET(request: NextRequest) {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { data } = await createAdminClient().from("instagram_post_templates").select("body,title").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const jpeg = await previewBodyJpeg(data.body as string, (data.title as string) ?? "");
    if (!jpeg) return NextResponse.json({ error: "文が長すぎて画像にできません。" }, { status: 422 });
    return new NextResponse(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[instagram-preview] failed", e);
    return NextResponse.json({ error: "画像を作れませんでした。" }, { status: 500 });
  }
}
