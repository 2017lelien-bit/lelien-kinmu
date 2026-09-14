"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
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
  const { error } = await admin.from("musuhi_shifts").update(update).eq("id", id);
  if (error) return { ok: false, error: "更新に失敗しました。" };

  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: undefined };
}

export async function deleteMusuhiShift(id: string): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const admin = createAdminClient();
  const { error } = await admin.from("musuhi_shifts").delete().eq("id", id);
  if (error) return { ok: false, error: "削除に失敗しました。" };

  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: undefined };
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
  }

  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: { created: rows.length } };
}
