"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveActingStaffId } from "@/lib/auth";
import { computeWorkedMinutes } from "@/lib/date";
import type { ActionResult, TimeLogEntry } from "@/lib/types";

export async function getOwnTimeLogEntries(
  payCategoryId: string,
  periodStart: string,
  periodEnd: string,
  staffId?: string,
): Promise<TimeLogEntry[]> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("time_log_entries")
    .select("*")
    .eq("staff_id", acting.id)
    .eq("pay_category_id", payCategoryId)
    .gte("entry_date", periodStart)
    .lte("entry_date", periodEnd)
    .order("entry_date", { ascending: false });

  return (data ?? []) as TimeLogEntry[];
}

// 受付シフトの時間と実際に重なっているレッスンがあれば、その分は受付をしていないとみなし、
// 「Le lien」区分の時給から1レッスンにつき2時間差し引く。開始時刻が入力されていないレッスンは、
// 重なりを確認できないため差し引きの対象にしない。
const LESSON_DEDUCTION_MINUTES_PER_LESSON = 120;

function isLeLienCategoryName(name: string): boolean {
  return name.toLowerCase().replace(/\s+/g, "").includes("lelien");
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

async function syncPayEntryFromTimeLog(
  admin: ReturnType<typeof createAdminClient>,
  staffId: string,
  payCategoryId: string,
  periodStart: string,
  periodEnd: string,
): Promise<void> {
  const [{ data: category }, { data: timeEntries }] = await Promise.all([
    admin.from("pay_categories").select("name").eq("id", payCategoryId).maybeSingle(),
    admin
      .from("time_log_entries")
      .select("entry_date, start_time, end_time, break_start, break_end")
      .eq("staff_id", staffId)
      .eq("pay_category_id", payCategoryId)
      .gte("entry_date", periodStart)
      .lte("entry_date", periodEnd),
  ]);

  const minutesByDate = new Map<string, number>();
  const shiftsByDate = new Map<string, { start: number; end: number }[]>();
  for (const e of timeEntries ?? []) {
    const minutes = computeWorkedMinutes({
      startTime: e.start_time,
      endTime: e.end_time,
      breakStart: e.break_start,
      breakEnd: e.break_end,
    });
    minutesByDate.set(e.entry_date, (minutesByDate.get(e.entry_date) ?? 0) + minutes);
    const shifts = shiftsByDate.get(e.entry_date) ?? [];
    shifts.push({ start: toMinutes(e.start_time), end: toMinutes(e.end_time) });
    shiftsByDate.set(e.entry_date, shifts);
  }

  if (category && isLeLienCategoryName(category.name) && minutesByDate.size > 0) {
    const { data: lessons } = await admin
      .from("lesson_log_entries")
      .select("entry_date, start_time, duration_minutes")
      .eq("staff_id", staffId)
      .gte("entry_date", periodStart)
      .lte("entry_date", periodEnd)
      .not("start_time", "is", null);

    const overlappingLessonCountByDate = new Map<string, number>();
    for (const l of lessons ?? []) {
      const shifts = shiftsByDate.get(l.entry_date);
      if (!shifts) continue;
      const lessonStart = toMinutes(l.start_time);
      const lessonEnd = lessonStart + l.duration_minutes;
      const overlaps = shifts.some((s) => intervalsOverlap(lessonStart, lessonEnd, s.start, s.end));
      if (overlaps) {
        overlappingLessonCountByDate.set(l.entry_date, (overlappingLessonCountByDate.get(l.entry_date) ?? 0) + 1);
      }
    }

    for (const [date, minutes] of minutesByDate) {
      const lessonCount = overlappingLessonCountByDate.get(date) ?? 0;
      if (lessonCount > 0) {
        minutesByDate.set(date, Math.max(0, minutes - lessonCount * LESSON_DEDUCTION_MINUTES_PER_LESSON));
      }
    }
  }

  const totalMinutes = [...minutesByDate.values()].reduce((sum, m) => sum + m, 0);

  await admin.from("pay_entries").upsert(
    {
      staff_id: staffId,
      pay_category_id: payCategoryId,
      period_start: periodStart,
      quantity: Math.round((totalMinutes / 60) * 100) / 100,
    },
    { onConflict: "staff_id,pay_category_id,period_start" },
  );
}

// レッスン実績(lesson_log_entries)側の変更でも、重なりを再計算して受付の実績を更新する必要があるため、
// lesson-log.tsから呼べるように公開する。
export async function resyncLeLienCategoriesForPeriod(
  staffId: string,
  periodStart: string,
  periodEnd: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: categories } = await admin
    .from("pay_categories")
    .select("id, name")
    .eq("staff_id", staffId)
    .eq("unit_type", "hourly");

  for (const c of categories ?? []) {
    if (isLeLienCategoryName(c.name)) {
      await syncPayEntryFromTimeLog(admin, staffId, c.id, periodStart, periodEnd);
    }
  }
}

export async function addTimeLogEntry(
  input: {
    payCategoryId: string;
    entryDate: string;
    startTime: string;
    endTime: string;
    breakStart?: string;
    breakEnd?: string;
    note?: string;
    periodStart: string;
    periodEnd: string;
  },
  staffId?: string,
): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  if (input.endTime <= input.startTime) return { ok: false, error: "終了時刻は開始時刻より後にしてください。" };
  if (input.breakStart && input.breakEnd && input.breakEnd <= input.breakStart) {
    return { ok: false, error: "休憩の終了時刻は開始時刻より後にしてください。" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("time_log_entries").insert({
    staff_id: acting.id,
    pay_category_id: input.payCategoryId,
    entry_date: input.entryDate,
    start_time: input.startTime,
    end_time: input.endTime,
    break_start: input.breakStart || null,
    break_end: input.breakEnd || null,
    note: input.note || null,
  });
  if (error) return { ok: false, error: "登録に失敗しました。" };

  await syncPayEntryFromTimeLog(admin, acting.id, input.payCategoryId, input.periodStart, input.periodEnd);

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${acting.id}`);
  return { ok: true, data: undefined };
}

export async function updateTimeLogEntry(
  id: string,
  input: {
    payCategoryId: string;
    entryDate: string;
    startTime: string;
    endTime: string;
    breakStart?: string;
    breakEnd?: string;
    note?: string;
    periodStart: string;
    periodEnd: string;
  },
  staffId?: string,
): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  if (input.endTime <= input.startTime) return { ok: false, error: "終了時刻は開始時刻より後にしてください。" };
  if (input.breakStart && input.breakEnd && input.breakEnd <= input.breakStart) {
    return { ok: false, error: "休憩の終了時刻は開始時刻より後にしてください。" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("time_log_entries")
    .update({
      entry_date: input.entryDate,
      start_time: input.startTime,
      end_time: input.endTime,
      break_start: input.breakStart || null,
      break_end: input.breakEnd || null,
      note: input.note || null,
    })
    .eq("id", id)
    .eq("staff_id", acting.id);
  if (error) return { ok: false, error: "更新に失敗しました。" };

  await syncPayEntryFromTimeLog(admin, acting.id, input.payCategoryId, input.periodStart, input.periodEnd);

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${acting.id}`);
  return { ok: true, data: undefined };
}

export async function deleteTimeLogEntry(
  id: string,
  payCategoryId: string,
  periodStart: string,
  periodEnd: string,
  staffId?: string,
): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  const admin = createAdminClient();
  const { error } = await admin.from("time_log_entries").delete().eq("id", id).eq("staff_id", acting.id);
  if (error) return { ok: false, error: "削除に失敗しました。" };

  await syncPayEntryFromTimeLog(admin, acting.id, payCategoryId, periodStart, periodEnd);

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${acting.id}`);
  return { ok: true, data: undefined };
}
