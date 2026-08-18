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

async function syncPayEntryFromTimeLog(
  admin: ReturnType<typeof createAdminClient>,
  staffId: string,
  payCategoryId: string,
  periodStart: string,
  periodEnd: string,
): Promise<void> {
  const { data } = await admin
    .from("time_log_entries")
    .select("start_time, end_time, break_start, break_end")
    .eq("staff_id", staffId)
    .eq("pay_category_id", payCategoryId)
    .gte("entry_date", periodStart)
    .lte("entry_date", periodEnd);

  const totalMinutes = (data ?? []).reduce(
    (sum, e) =>
      sum +
      computeWorkedMinutes({
        startTime: e.start_time,
        endTime: e.end_time,
        breakStart: e.break_start,
        breakEnd: e.break_end,
      }),
    0,
  );

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
