import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isClosedOnDate } from "@/lib/types";

// むすひの「お客様向け予約サイト」(musuhi-yoyaku)は、Le lienとは完全に別のプロジェクト・
// 別のSupabaseデータベース。ここでの「むすひスケジュール」(誰がいつ受付にいるか)を、
// そのままmusuhi-yoyaku側の「お客様が予約できる時間帯」(schedule_overrides /
// schedule_override_windows)に反映するための連携。ユーザーの明示的な許可のもとで実装している。
function createMusuhiYoyakuAdminClient() {
  const url = process.env.MUSUHI_YOYAKU_SUPABASE_URL;
  const key = process.env.MUSUHI_YOYAKU_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function timeToMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

interface Window {
  start: number;
  end: number;
}

// 重なっている・接している受付シフトを1つの時間帯にまとめる
// (例: Miho 9-13, Michi 13-20 → 1本の「9:00〜20:00」にする)。
function mergeWindows(windows: Window[]): Window[] {
  if (windows.length === 0) return [];
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  const merged: Window[] = [sorted[0]];
  for (const w of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (w.start <= last.end) {
      last.end = Math.max(last.end, w.end);
    } else {
      merged.push({ ...w });
    }
  }
  return merged;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

// 指定日について、Le lien側の「むすひスケジュール」から、むすひ予約サイト側の
// 予約可能時間(schedule_overrides + schedule_override_windows)を再計算して書き込む。
// 受付担当が誰もいない時間は「休業」扱いにする(定休日の上書きより、実際の受付有無を優先する)。
export async function syncMusuhiBookingAvailability(entryDate: string): Promise<void> {
  const musuhiYoyaku = createMusuhiYoyakuAdminClient();
  if (!musuhiYoyaku) {
    console.error("[musuhi-booking-sync] MUSUHI_YOYAKU_SUPABASE_URL/SERVICE_ROLE_KEY が未設定のため、連携をスキップしました。");
    return;
  }

  const lelien = createAdminClient();
  const [{ data: shifts }, { data: noteRow }] = await Promise.all([
    lelien.from("musuhi_shifts").select("start_time, end_time").eq("entry_date", entryDate),
    lelien.from("musuhi_notes").select("is_closed_override").eq("entry_date", entryDate).maybeSingle(),
  ]);

  const isExplicitlyClosed = isClosedOnDate(entryDate, noteRow?.is_closed_override);
  const rawWindows = (shifts ?? []).map((s) => ({
    start: timeToMinutes(s.start_time),
    end: timeToMinutes(s.end_time),
  }));
  const mergedWindows = isExplicitlyClosed ? [] : mergeWindows(rawWindows);
  const isClosed = mergedWindows.length === 0;

  // 既存のnote(手動で入れた特別なお知らせ)を消してしまわないよう、あれば引き継ぐ。
  const { data: existingOverride } = await musuhiYoyaku
    .from("schedule_overrides")
    .select("id, note")
    .eq("date", entryDate)
    .maybeSingle();

  const { data: upserted, error } = await musuhiYoyaku
    .from("schedule_overrides")
    .upsert(
      { date: entryDate, is_closed: isClosed, note: existingOverride?.note ?? null },
      { onConflict: "date" },
    )
    .select("id")
    .single();
  if (error || !upserted) {
    console.error("[musuhi-booking-sync] schedule_overrides upsert failed", error);
    return;
  }

  await musuhiYoyaku.from("schedule_override_windows").delete().eq("schedule_override_id", upserted.id);
  if (!isClosed) {
    await musuhiYoyaku.from("schedule_override_windows").insert(
      mergedWindows.map((w, index) => ({
        schedule_override_id: upserted.id,
        open_time: minutesToTime(w.start),
        close_time: minutesToTime(w.end),
        sort_order: index,
      })),
    );
  }
}
