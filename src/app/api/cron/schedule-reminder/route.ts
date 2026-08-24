import { NextResponse } from "next/server";
import { notifyStaff } from "@/lib/push";
import { todayJstDateString } from "@/lib/date";

// Vercel Cronから1日1回呼び出される。毎月5日と10日にだけ、スケジュール提出の締切をスタッフに通知する。
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayJstDateString();
  const day = Number(today.split("-")[2]);

  if (day === 5) {
    await notifyStaff({
      title: "スケジュール提出のお願い",
      body: "来月のスケジュールを10日午前中までにご提出ください。",
      url: "/staff/mypage",
    });
  } else if (day === 10) {
    await notifyStaff({
      title: "本日締切です",
      body: "スケジュールは本日午前中で締め切ります。",
      url: "/staff/mypage",
    });
  }

  return NextResponse.json({ ok: true, day });
}
