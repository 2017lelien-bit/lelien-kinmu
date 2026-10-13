import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isClosedOnDate } from "@/lib/types";

// むすひの「お客様向け予約サイト」(musuhi-yoyaku)は、Le lienとは完全に別のプロジェクト・
// 別のSupabaseデータベース。ここでの「むすひスケジュール」(誰がいつ受付にいるか)を、
// そのままmusuhi-yoyaku側の「お客様が予約できる時間帯」(schedule_overrides /
// schedule_override_windows)に反映するための連携。ユーザーの明示的な許可のもとで実装している。
export function createMusuhiYoyakuAdminClient() {
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

// お客様が予約できるのは10:00以降。受付担当の実際のシフト(開店準備等で10:00より
// 早く始まることもある)はそのまま記録しつつ、予約可能時間の表示だけ10:00に合わせる。
const MUSUHI_BOOKING_OPEN_MINUTES = 10 * 60;

function clampWindowsToBookingHours(windows: Window[]): Window[] {
  return windows
    .map((w) => ({ start: Math.max(w.start, MUSUHI_BOOKING_OPEN_MINUTES), end: w.end }))
    .filter((w) => w.start < w.end);
}

export type MusuhiSyncResult = { ok: true } | { ok: false; error: string };

// 指定日について、Le lien側の「むすひスケジュール」から、むすひ予約サイト側の
// 予約可能時間(schedule_overrides + schedule_override_windows)を再計算して書き込む。
// 受付担当が誰もいない時間は「休業」扱いにする(定休日の上書きより、実際の受付有無を優先する)。
export async function syncMusuhiBookingAvailability(entryDate: string): Promise<MusuhiSyncResult> {
  const musuhiYoyaku = createMusuhiYoyakuAdminClient();
  if (!musuhiYoyaku) {
    const error = "MUSUHI_YOYAKU_SUPABASE_URL/SERVICE_ROLE_KEY が未設定のため、連携をスキップしました。";
    console.error(`[musuhi-booking-sync] ${error}`);
    return { ok: false, error };
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
  const mergedWindows = isExplicitlyClosed ? [] : clampWindowsToBookingHours(mergeWindows(rawWindows));
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
    return { ok: false, error: `schedule_overridesへの書き込みに失敗しました: ${error?.message ?? "unknown"}` };
  }

  await musuhiYoyaku.from("schedule_override_windows").delete().eq("schedule_override_id", upserted.id);
  if (!isClosed) {
    const { error: insertError } = await musuhiYoyaku.from("schedule_override_windows").insert(
      mergedWindows.map((w, index) => ({
        schedule_override_id: upserted.id,
        open_time: minutesToTime(w.start),
        close_time: minutesToTime(w.end),
        sort_order: index,
      })),
    );
    if (insertError) {
      console.error("[musuhi-booking-sync] schedule_override_windows insert failed", insertError);
      return { ok: false, error: `schedule_override_windowsへの書き込みに失敗しました: ${insertError.message}` };
    }
  }
  return { ok: true };
}

export interface BookingDayState {
  existed: boolean;
  isClosed: boolean;
  note: string | null;
  windows: { open: string; close: string }[];
}

type MusuhiYoyakuClient = NonNullable<ReturnType<typeof createMusuhiYoyakuAdminClient>>;

function hhmm(t: string): string {
  return t.slice(0, 5);
}

// Le lien側のむすひスケジュールから、その日の予約サイトの「あるべき状態」を計算する(書き込みはしない)。
export async function computeDesiredBookingState(dates: string[]): Promise<Map<string, BookingDayState>> {
  const lelien = createAdminClient();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const [{ data: shifts }, { data: notes }] = await Promise.all([
    lelien.from("musuhi_shifts").select("entry_date, start_time, end_time").gte("entry_date", first).lte("entry_date", last),
    lelien.from("musuhi_notes").select("entry_date, is_closed_override").gte("entry_date", first).lte("entry_date", last),
  ]);
  const noteByDate = new Map((notes ?? []).map((n) => [n.entry_date as string, n.is_closed_override as boolean | null]));
  const result = new Map<string, BookingDayState>();
  for (const date of dates) {
    const raw = (shifts ?? [])
      .filter((s) => s.entry_date === date)
      .map((s) => ({ start: timeToMinutes(s.start_time), end: timeToMinutes(s.end_time) }));
    const closedOverride = isClosedOnDate(date, noteByDate.get(date));
    const merged = closedOverride ? [] : clampWindowsToBookingHours(mergeWindows(raw));
    result.set(date, {
      existed: true,
      isClosed: merged.length === 0,
      note: null,
      windows: merged.map((w) => ({ open: hhmm(minutesToTime(w.start)), close: hhmm(minutesToTime(w.end)) })),
    });
  }
  return result;
}

// 予約サイト側の現在の状態を読む。
export async function readCurrentBookingState(
  musuhiYoyaku: MusuhiYoyakuClient,
  dates: string[],
): Promise<Map<string, BookingDayState>> {
  const { data: overrides } = await musuhiYoyaku
    .from("schedule_overrides")
    .select("id, date, is_closed, note")
    .gte("date", dates[0])
    .lte("date", dates[dates.length - 1]);
  const ids = (overrides ?? []).map((o) => o.id as string);
  const { data: windows } =
    ids.length > 0
      ? await musuhiYoyaku
          .from("schedule_override_windows")
          .select("schedule_override_id, open_time, close_time, sort_order")
          .in("schedule_override_id", ids)
          .order("sort_order", { ascending: true })
      : { data: [] as { schedule_override_id: string; open_time: string; close_time: string; sort_order: number }[] };

  const result = new Map<string, BookingDayState>();
  for (const date of dates) result.set(date, { existed: false, isClosed: false, note: null, windows: [] });
  for (const o of overrides ?? []) {
    result.set(o.date as string, {
      existed: true,
      isClosed: o.is_closed as boolean,
      note: (o.note as string | null) ?? null,
      windows: (windows ?? [])
        .filter((w) => w.schedule_override_id === o.id)
        .map((w) => ({ open: hhmm(w.open_time as string), close: hhmm(w.close_time as string) })),
    });
  }
  return result;
}

export function bookingStateEquals(current: BookingDayState, desired: BookingDayState): boolean {
  if (!current.existed) return false;
  if (current.isClosed !== desired.isClosed) return false;
  if (desired.isClosed) return true;
  if (current.windows.length !== desired.windows.length) return false;
  return current.windows.every((w, i) => w.open === desired.windows[i].open && w.close === desired.windows[i].close);
}

export function describeBookingState(state: BookingDayState): string {
  if (!state.existed) return "通常の営業時間(個別設定なし)";
  if (state.isClosed) return "休業";
  return state.windows.map((w) => `${w.open}〜${w.close}`).join("、");
}

// 取り消し用: 予約サイト側を、保存しておいた元の状態に戻す。
export async function restoreBookingDay(
  musuhiYoyaku: MusuhiYoyakuClient,
  date: string,
  state: BookingDayState,
): Promise<MusuhiSyncResult> {
  const { data: existing } = await musuhiYoyaku.from("schedule_overrides").select("id").eq("date", date).maybeSingle();

  if (!state.existed) {
    if (existing) {
      await musuhiYoyaku.from("schedule_override_windows").delete().eq("schedule_override_id", existing.id);
      const { error } = await musuhiYoyaku.from("schedule_overrides").delete().eq("id", existing.id);
      if (error) return { ok: false, error: `${date}を元に戻せませんでした: ${error.message}` };
    }
    return { ok: true };
  }

  const { data: upserted, error } = await musuhiYoyaku
    .from("schedule_overrides")
    .upsert({ date, is_closed: state.isClosed, note: state.note }, { onConflict: "date" })
    .select("id")
    .single();
  if (error || !upserted) return { ok: false, error: `${date}を元に戻せませんでした: ${error?.message ?? "unknown"}` };
  await musuhiYoyaku.from("schedule_override_windows").delete().eq("schedule_override_id", upserted.id);
  if (state.windows.length > 0) {
    const { error: insertError } = await musuhiYoyaku.from("schedule_override_windows").insert(
      state.windows.map((w, index) => ({
        schedule_override_id: upserted.id,
        open_time: `${w.open}:00`,
        close_time: `${w.close}:00`,
        sort_order: index,
      })),
    );
    if (insertError) return { ok: false, error: `${date}を元に戻せませんでした: ${insertError.message}` };
  }
  return { ok: true };
}
