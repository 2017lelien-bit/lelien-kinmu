"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser, resolveActingStaffId } from "@/lib/auth";
import { invalidateScheduleConfirmation } from "@/lib/schedule-confirmations";
import {
  bookingStateEquals,
  computeDesiredBookingState,
  createMusuhiYoyakuAdminClient,
  describeBookingState,
  readCurrentBookingState,
  restoreBookingDay,
  syncMusuhiBookingAvailability,
  type BookingDayState,
} from "@/lib/musuhi-booking-sync";
import { dayOfWeekForDate } from "@/lib/date";
import type { ActionResult } from "@/lib/types";

// むすひの営業終了時刻(平日20:00・土日18:00)。Le lienの受付を参考に埋めるとき、
// Le lien側の終了時刻がこれより遅い場合は、むすひの営業時間に合わせて短くする。
function musuhiClosingTime(dateStr: string): string {
  const dow = dayOfWeekForDate(dateStr);
  return dow === 0 || dow === 6 ? "18:00:00" : "20:00:00";
}

export interface MusuhiShift {
  id: string;
  staff_id: string;
  entry_date: string;
  start_time: string;
  end_time: string;
}

export interface MusuhiNote {
  entry_date: string;
  is_closed_override: boolean | null;
}

async function requireAdmin(): Promise<{ ok: false; error: string } | null> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };
  return null;
}

// むすひは定休日(月曜)以外にも、臨時休業・臨時営業を個別に指定できるようにする。
export async function getMusuhiNotes(monthStart: string, monthEnd: string): Promise<MusuhiNote[]> {
  const staff = await getStaffUser();
  if (!staff) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("musuhi_notes")
    .select("*")
    .gte("entry_date", monthStart)
    .lte("entry_date", monthEnd);
  return (data ?? []) as MusuhiNote[];
}

export async function upsertMusuhiNote(input: { entryDate: string; isClosedOverride: boolean | null }): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const admin = createAdminClient();
  const { error } = await admin
    .from("musuhi_notes")
    .upsert({ entry_date: input.entryDate, is_closed_override: input.isClosedOverride }, { onConflict: "entry_date" });
  if (error) return { ok: false, error: "保存に失敗しました。" };

  revalidatePath("/staff/admin/schedule");
  revalidatePath("/staff/mypage");
  return { ok: true, data: undefined };
}

export async function getMusuhiShifts(
  monthStart: string,
  monthEnd: string,
): Promise<(MusuhiShift & { staffName: string })[]> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("musuhi_shifts")
    .select("*, staff_profiles(name, schedule_display_name)")
    .gte("entry_date", monthStart)
    .lte("entry_date", monthEnd)
    .order("entry_date", { ascending: true })
    .order("start_time", { ascending: true });

  return (
    (data ?? []) as unknown as (MusuhiShift & {
      staff_profiles: { name: string; schedule_display_name: string | null } | null;
    })[]
  ).map((s) => ({
    ...s,
    staffName: s.staff_profiles?.schedule_display_name || s.staff_profiles?.name || "(不明)",
  }));
}

// スタッフ本人が、自分のむすひの担当分だけを確認できるようにする(スケジュールの最終確認画面用)。
export async function getOwnMusuhiShifts(monthStart: string, monthEnd: string, staffId?: string): Promise<MusuhiShift[]> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("musuhi_shifts")
    .select("*")
    .eq("staff_id", acting.id)
    .gte("entry_date", monthStart)
    .lte("entry_date", monthEnd)
    .order("entry_date", { ascending: true })
    .order("start_time", { ascending: true });
  return (data ?? []) as MusuhiShift[];
}

export async function addMusuhiShift(input: {
  staffId: string;
  entryDate: string;
  startTime: string;
  endTime: string;
}): Promise<ActionResult<MusuhiShift>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  if (input.endTime <= input.startTime) return { ok: false, error: "終了時刻は開始時刻より後にしてください。" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("musuhi_shifts")
    .insert({
      staff_id: input.staffId,
      entry_date: input.entryDate,
      start_time: input.startTime,
      end_time: input.endTime,
    })
    .select()
    .single();
  if (error || !data) return { ok: false, error: "登録に失敗しました。" };
  await invalidateScheduleConfirmation(input.staffId, input.entryDate);

  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: data as MusuhiShift };
}

export async function updateMusuhiShift(
  id: string,
  input: { staffId?: string; startTime?: string; endTime?: string },
): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const update: { staff_id?: string; start_time?: string; end_time?: string } = {};
  if (input.staffId !== undefined) update.staff_id = input.staffId;
  if (input.startTime !== undefined) update.start_time = input.startTime;
  if (input.endTime !== undefined) update.end_time = input.endTime;

  const admin = createAdminClient();
  const { data: existing } = await admin.from("musuhi_shifts").select("staff_id, entry_date").eq("id", id).maybeSingle();
  const { error } = await admin.from("musuhi_shifts").update(update).eq("id", id);
  if (error) return { ok: false, error: "更新に失敗しました。" };
  if (existing) {
    await invalidateScheduleConfirmation(existing.staff_id, existing.entry_date);
    if (input.staffId !== undefined && input.staffId !== existing.staff_id) {
      await invalidateScheduleConfirmation(input.staffId, existing.entry_date);
    }
  }

  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: undefined };
}

export async function deleteMusuhiShift(id: string): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const admin = createAdminClient();
  const { data: existing } = await admin.from("musuhi_shifts").select("staff_id, entry_date").eq("id", id).maybeSingle();
  const { error } = await admin.from("musuhi_shifts").delete().eq("id", id);
  if (error) return { ok: false, error: "削除に失敗しました。" };
  if (existing) {
    await invalidateScheduleConfirmation(existing.staff_id, existing.entry_date);
  }

  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: undefined };
}

function datesInMonth(monthStart: string, monthEndDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${monthStart}T00:00:00Z`);
  const end = new Date(`${monthEndDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export interface MusuhiPublishChange {
  date: string;
  before: string;
  after: string;
}

export interface MusuhiLastPublish {
  id: string;
  publishedAt: string;
  monthStart: string;
  changedDays: number;
}

// むすひスケジュールは、保存しただけではお客様向けの予約サイトに反映されない。
// 管理者が内容を確認してから「反映する」を押したときだけ、予約サイト側に書き込む。
// ここでは、いま反映したらどの日がどう変わるかを一覧にして返す(書き込みはしない)。
export async function previewMusuhiPublish(
  monthStart: string,
  monthEndDate: string,
): Promise<ActionResult<{ changes: MusuhiPublishChange[]; unchangedDays: number }>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const musuhiYoyaku = createMusuhiYoyakuAdminClient();
  if (!musuhiYoyaku) return { ok: false, error: "むすひ予約サイトとの連携設定が未設定です。" };

  const dates = datesInMonth(monthStart, monthEndDate);
  const [desired, current] = await Promise.all([
    computeDesiredBookingState(dates),
    readCurrentBookingState(musuhiYoyaku, dates),
  ]);

  const changes: MusuhiPublishChange[] = [];
  for (const date of dates) {
    const d = desired.get(date)!;
    const c = current.get(date)!;
    if (bookingStateEquals(c, d)) continue;
    changes.push({ date, before: describeBookingState(c), after: describeBookingState(d) });
  }
  return { ok: true, data: { changes, unchangedDays: dates.length - changes.length } };
}

// 確認した変更を予約サイトに反映する。反映前の予約サイト側の状態を保存しておき、取り消せるようにする。
export async function publishMusuhiBooking(
  monthStart: string,
  monthEndDate: string,
): Promise<ActionResult<{ published: number }>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const musuhiYoyaku = createMusuhiYoyakuAdminClient();
  if (!musuhiYoyaku) return { ok: false, error: "むすひ予約サイトとの連携設定が未設定です。" };

  const dates = datesInMonth(monthStart, monthEndDate);
  const [desired, current] = await Promise.all([
    computeDesiredBookingState(dates),
    readCurrentBookingState(musuhiYoyaku, dates),
  ]);
  const changedDates = dates.filter((date) => !bookingStateEquals(current.get(date)!, desired.get(date)!));
  if (changedDates.length === 0) return { ok: true, data: { published: 0 } };

  const snapshot = changedDates.map((date) => ({ date, ...current.get(date)! }));
  const admin = createAdminClient();
  const { data: history, error: historyError } = await admin
    .from("musuhi_publish_history")
    .insert({ month_start: monthStart, changed_days: changedDates.length, snapshot })
    .select("id")
    .single();
  if (historyError || !history) {
    return { ok: false, error: "取り消し用の記録を保存できなかったため、反映を中止しました(お客様向けの予約サイトは変更していません)。" };
  }

  const results = await Promise.all(changedDates.map((date) => syncMusuhiBookingAvailability(date)));
  const succeeded = results.filter((r) => r.ok).length;
  const firstError = results.find((r) => !r.ok);
  if (firstError && !firstError.ok) {
    return { ok: false, error: `${firstError.error}(${succeeded}/${changedDates.length}日分は反映済み。「直前の反映を取り消す」で元に戻せます)` };
  }
  return { ok: true, data: { published: succeeded } };
}

export async function getLastMusuhiPublish(): Promise<MusuhiLastPublish | null> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("musuhi_publish_history")
    .select("id, published_at, month_start, changed_days")
    .is("undone_at", null)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, publishedAt: data.published_at, monthStart: data.month_start, changedDays: data.changed_days };
}

// 直前の反映を取り消し、予約サイト側をその反映の前の状態に戻す。
export async function undoLastMusuhiPublish(): Promise<ActionResult<{ restored: number }>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const musuhiYoyaku = createMusuhiYoyakuAdminClient();
  if (!musuhiYoyaku) return { ok: false, error: "むすひ予約サイトとの連携設定が未設定です。" };

  const admin = createAdminClient();
  const { data: last } = await admin
    .from("musuhi_publish_history")
    .select("id, snapshot")
    .is("undone_at", null)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return { ok: false, error: "取り消せる反映がありません。" };

  const snapshot = last.snapshot as ({ date: string } & BookingDayState)[];
  const results = await Promise.all(snapshot.map((s) => restoreBookingDay(musuhiYoyaku, s.date, s)));
  const firstError = results.find((r) => !r.ok);
  if (firstError && !firstError.ok) return { ok: false, error: firstError.error };

  await admin.from("musuhi_publish_history").update({ undone_at: new Date().toISOString() }).eq("id", last.id);
  return { ok: true, data: { restored: snapshot.length } };
}

function timeToMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

// Le lienの受付は2人体制で回っており、片方がLe lienの受付に入っている間は、
// もう片方がむすひの受付に入る(2人が入れ替わる)。まだむすひ側に何も入っていない
// 時間帯だけ、Le lienの受付を参考に同じ時間で自動的に埋める(すでに何か入っている
// 時間帯には触れないので、後から自由に微調整できる)。
export async function fillMusuhiFromLelienReception(input: {
  monthStart: string;
  monthEnd: string;
  staffAId: string;
  staffBId: string;
}): Promise<ActionResult<{ created: number }>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;
  if (input.staffAId === input.staffBId) return { ok: false, error: "2人の異なるスタッフを選んでください。" };

  const admin = createAdminClient();
  const pairOf = (id: string) => (id === input.staffAId ? input.staffBId : id === input.staffBId ? input.staffAId : null);

  const [{ data: reception }, { data: existingShifts }] = await Promise.all([
    admin
      .from("schedule_submissions")
      .select("staff_id, entry_date, start_time, end_time")
      .eq("kind", "reception")
      .eq("confirmed", true)
      .in("staff_id", [input.staffAId, input.staffBId])
      .gte("entry_date", input.monthStart)
      .lte("entry_date", input.monthEnd),
    admin
      .from("musuhi_shifts")
      .select("staff_id, entry_date, start_time, end_time")
      .gte("entry_date", input.monthStart)
      .lte("entry_date", input.monthEnd),
  ]);

  const rows: { staff_id: string; entry_date: string; start_time: string; end_time: string }[] = [];
  for (const r of reception ?? []) {
    if (!r.start_time || !r.end_time) continue;
    const pairedStaffId = pairOf(r.staff_id);
    if (!pairedStaffId) continue;
    const alreadyCovered = (existingShifts ?? []).some(
      (s) => s.entry_date === r.entry_date && s.staff_id === pairedStaffId && timesOverlap(r.start_time!, r.end_time!, s.start_time, s.end_time),
    );
    if (alreadyCovered) continue;
    const closing = musuhiClosingTime(r.entry_date);
    const cappedEnd = timeToMinutes(r.end_time) > timeToMinutes(closing) ? closing : r.end_time;
    rows.push({ staff_id: pairedStaffId, entry_date: r.entry_date, start_time: r.start_time, end_time: cappedEnd });
  }

  if (rows.length > 0) {
    const { error } = await admin.from("musuhi_shifts").insert(rows);
    if (error) return { ok: false, error: "反映に失敗しました。" };
    const affected = new Set(rows.map((r) => `${r.staff_id}|${r.entry_date}`));
    for (const key of affected) {
      const [staffId, entryDate] = key.split("|");
      await invalidateScheduleConfirmation(staffId, entryDate);
    }
  }

  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: { created: rows.length } };
}
