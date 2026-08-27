"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser, resolveActingStaffId } from "@/lib/auth";
import { resyncLeLienCategoriesForPeriod } from "@/lib/time-log";
import { isEntryDateLocked } from "@/lib/staff-self";
import { payPeriodForDate } from "@/lib/date";
import type { ActionResult, LessonLogEntry } from "@/lib/types";

function revalidateMypageAndAdmin(staffId: string) {
  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${staffId}`);
}

// 単価ルールの中身(単価・人数条件)はスタッフに見せないが、
// 「レッスン実績を入力する意味があるか(=ルールが1件でも設定されているか)」だけを判定するために使う。
export async function getOwnHasPayRateRules(): Promise<boolean> {
  const staff = await getStaffUser();
  if (!staff) return false;

  const admin = createAdminClient();
  const { count } = await admin
    .from("pay_rate_rules")
    .select("id", { count: "exact", head: true })
    .eq("staff_id", staff.id);
  return (count ?? 0) > 0;
}

// 単価ルールが1件でも人数によって単価を変えていれば、参加人数の入力は正確に必要。
// 内容自体はスタッフに見せず、この判定結果だけを渡す。
export async function getOwnHeadcountMatters(staffId?: string): Promise<boolean> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return true;

  const admin = createAdminClient();
  const { data: rules } = await admin
    .from("pay_rate_rules")
    .select("min_headcount, max_headcount")
    .eq("staff_id", acting.id);

  return (rules ?? []).some((r) => r.min_headcount !== null || r.max_headcount !== null);
}

export async function getOwnLessonLogEntries(
  periodStart: string,
  periodEnd: string,
  staffId?: string,
): Promise<LessonLogEntry[]> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("lesson_log_entries")
    .select("*")
    .eq("staff_id", acting.id)
    .gte("entry_date", periodStart)
    .lte("entry_date", periodEnd)
    .order("entry_date", { ascending: false });

  return (data ?? []) as LessonLogEntry[];
}

export async function addLessonLogEntry(
  input: {
    entryDate: string;
    lessonName: string;
    durationMinutes: number;
    headcount: number;
    startTime?: string;
    note?: string;
  },
  staffId?: string,
): Promise<ActionResult> {
  const staffUser = await getStaffUser();
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  if (!input.lessonName.trim()) return { ok: false, error: "レッスン名を入力してください。" };
  if (input.durationMinutes <= 0) return { ok: false, error: "時間は1分以上で入力してください。" };
  if (input.headcount <= 0) return { ok: false, error: "参加人数は1人以上で入力してください。" };

  if (staffUser?.role !== "admin" && (await isEntryDateLocked(acting.id, input.entryDate))) {
    return { ok: false, error: "その日はすでに「本日の勤務」を提出済みのため、追加できません。管理者に修正を依頼してください。" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("lesson_log_entries").insert({
    staff_id: acting.id,
    entry_date: input.entryDate,
    lesson_name: input.lessonName.trim(),
    duration_minutes: input.durationMinutes,
    headcount: input.headcount,
    start_time: input.startTime || null,
    note: input.note || null,
  });

  if (error) return { ok: false, error: "実績の登録に失敗しました。" };

  const { periodStart, periodEnd } = payPeriodForDate(input.entryDate);
  await resyncLeLienCategoriesForPeriod(acting.id, periodStart, periodEnd);

  revalidateMypageAndAdmin(acting.id);
  return { ok: true, data: undefined };
}

export async function updateLessonLogEntry(
  id: string,
  input: {
    entryDate: string;
    lessonName: string;
    durationMinutes: number;
    headcount: number;
    startTime?: string;
    note?: string;
  },
  staffId?: string,
): Promise<ActionResult> {
  const staffUser = await getStaffUser();
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  if (!input.lessonName.trim()) return { ok: false, error: "レッスン名を入力してください。" };
  if (input.durationMinutes <= 0) return { ok: false, error: "時間は1分以上で入力してください。" };
  if (input.headcount <= 0) return { ok: false, error: "参加人数は1人以上で入力してください。" };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("lesson_log_entries")
    .select("approved, entry_date")
    .eq("id", id)
    .eq("staff_id", acting.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "実績が見つかりません。" };
  // 承認済みの実績は、スタッフ本人は変更できない。管理者は訂正できるようにする。
  if (existing.approved && staffUser?.role !== "admin") {
    return { ok: false, error: "承認済みの実績は変更できません。管理者に訂正を依頼してください。" };
  }
  if (staffUser?.role !== "admin") {
    const dateToCheck = existing.entry_date !== input.entryDate ? [existing.entry_date, input.entryDate] : [existing.entry_date];
    for (const d of dateToCheck) {
      if (await isEntryDateLocked(acting.id, d)) {
        return { ok: false, error: "その日はすでに「本日の勤務」を提出済みのため、変更できません。管理者に訂正を依頼してください。" };
      }
    }
  }

  const { error } = await admin
    .from("lesson_log_entries")
    .update({
      entry_date: input.entryDate,
      lesson_name: input.lessonName.trim(),
      duration_minutes: input.durationMinutes,
      headcount: input.headcount,
      start_time: input.startTime || null,
      note: input.note || null,
    })
    .eq("id", id)
    .eq("staff_id", acting.id);

  if (error) return { ok: false, error: "実績の更新に失敗しました。" };

  const oldPeriod = payPeriodForDate(existing.entry_date);
  await resyncLeLienCategoriesForPeriod(acting.id, oldPeriod.periodStart, oldPeriod.periodEnd);
  if (existing.entry_date !== input.entryDate) {
    const newPeriod = payPeriodForDate(input.entryDate);
    if (newPeriod.periodStart !== oldPeriod.periodStart) {
      await resyncLeLienCategoriesForPeriod(acting.id, newPeriod.periodStart, newPeriod.periodEnd);
    }
  }

  revalidateMypageAndAdmin(acting.id);
  return { ok: true, data: undefined };
}

export async function deleteLessonLogEntry(id: string, staffId?: string): Promise<ActionResult> {
  const staffUser = await getStaffUser();
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("lesson_log_entries")
    .select("approved, entry_date")
    .eq("id", id)
    .eq("staff_id", acting.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "実績が見つかりません。" };
  if (existing.approved && staffUser?.role !== "admin") {
    return { ok: false, error: "承認済みの実績は削除できません。管理者に訂正を依頼してください。" };
  }
  if (staffUser?.role !== "admin" && (await isEntryDateLocked(acting.id, existing.entry_date))) {
    return { ok: false, error: "その日はすでに「本日の勤務」を提出済みのため、削除できません。管理者に訂正を依頼してください。" };
  }

  const { error } = await admin.from("lesson_log_entries").delete().eq("id", id).eq("staff_id", acting.id);
  if (error) return { ok: false, error: "削除に失敗しました。" };

  const { periodStart, periodEnd } = payPeriodForDate(existing.entry_date);
  await resyncLeLienCategoriesForPeriod(acting.id, periodStart, periodEnd);

  revalidateMypageAndAdmin(acting.id);
  return { ok: true, data: undefined };
}
