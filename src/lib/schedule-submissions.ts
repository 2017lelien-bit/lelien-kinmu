"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser, resolveActingStaffId } from "@/lib/auth";
import { addDaysToDateString, dayOfWeekForDate } from "@/lib/date";
import type { ActionResult, LessonOption, ScheduleSubmission, ScheduleTemplate } from "@/lib/types";

async function requireAdmin(): Promise<{ ok: false; error: string } | null> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };
  return null;
}

export async function getOwnScheduleSubmissions(
  monthStart: string,
  monthEnd: string,
  staffId?: string,
): Promise<ScheduleSubmission[]> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("schedule_submissions")
    .select("*")
    .eq("staff_id", acting.id)
    .gte("entry_date", monthStart)
    .lte("entry_date", monthEnd)
    .order("entry_date", { ascending: true });

  return (data ?? []) as ScheduleSubmission[];
}

export async function addScheduleEntry(
  input: {
    entryDate: string;
    kind: "reception" | "lesson" | "unavailable";
    startTime?: string;
    endTime?: string;
    lessonName?: string;
    note?: string;
  },
  staffId?: string,
): Promise<ActionResult<ScheduleSubmission>> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  if (input.kind === "reception" && (!input.startTime || !input.endTime)) {
    return { ok: false, error: "受付は開始・終了時刻を入力してください。" };
  }
  if (input.kind === "lesson" && (!input.startTime || !input.lessonName?.trim())) {
    return { ok: false, error: "レッスンは開始時刻とレッスン名を入力してください。" };
  }

  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("schedule_submissions")
    .insert({
      staff_id: acting.id,
      entry_date: input.entryDate,
      kind: input.kind,
      // 休み希望(unavailable)は、時刻を空欄にすれば終日休み、指定すればその時間帯だけの休みになる。
      start_time: input.kind === "unavailable" ? input.startTime || null : input.startTime,
      end_time: input.kind === "lesson" ? null : input.endTime || null,
      lesson_name: input.kind === "lesson" ? input.lessonName?.trim() : null,
      note: input.note || null,
    })
    .select()
    .single();
  if (error || !inserted) return { ok: false, error: "登録に失敗しました。" };

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${acting.id}`);
  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: inserted as ScheduleSubmission };
}

export async function deleteScheduleEntry(id: string, staffId?: string): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  const admin = createAdminClient();
  const { error } = await admin.from("schedule_submissions").delete().eq("id", id).eq("staff_id", acting.id);
  if (error) return { ok: false, error: "削除に失敗しました。" };

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${acting.id}`);
  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: undefined };
}

// 管理者が、対象月の全スタッフ分の提出内容をまとめて確認できるようにする。
export async function getAllScheduleSubmissions(
  monthStart: string,
  monthEnd: string,
): Promise<(ScheduleSubmission & { staffName: string })[]> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("schedule_submissions")
    .select("*, staff_profiles(name)")
    .gte("entry_date", monthStart)
    .lte("entry_date", monthEnd)
    .order("entry_date", { ascending: true });

  return ((data ?? []) as unknown as (ScheduleSubmission & { staff_profiles: { name: string } | null })[]).map(
    (e) => ({ ...e, staffName: e.staff_profiles?.name ?? "(不明)" }),
  );
}

export async function setScheduleEntryConfirmed(id: string, confirmed: boolean): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const admin = createAdminClient();
  const { error } = await admin.from("schedule_submissions").update({ confirmed }).eq("id", id);
  if (error) return { ok: false, error: "更新に失敗しました。" };

  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: undefined };
}

// 担当できるレッスンの一覧(スケジュール提出時のレッスン名の選択肢になる)。
export async function getOwnLessonOptions(staffId?: string): Promise<LessonOption[]> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("staff_lesson_options")
    .select("*")
    .eq("staff_id", acting.id)
    .order("sort_order", { ascending: true });
  return (data ?? []) as LessonOption[];
}

export async function addLessonOption(name: string, staffId?: string): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };
  if (!name.trim()) return { ok: false, error: "レッスン名を入力してください。" };

  const admin = createAdminClient();
  const { error } = await admin.from("staff_lesson_options").insert({ staff_id: acting.id, name: name.trim() });
  if (error) return { ok: false, error: "登録に失敗しました。" };

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${acting.id}`);
  return { ok: true, data: undefined };
}

export async function deleteLessonOption(id: string, staffId?: string): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  const admin = createAdminClient();
  const { error } = await admin.from("staff_lesson_options").delete().eq("id", id).eq("staff_id", acting.id);
  if (error) return { ok: false, error: "削除に失敗しました。" };

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${acting.id}`);
  return { ok: true, data: undefined };
}

// 毎週固定のスケジュールパターン。
export async function getOwnScheduleTemplates(staffId?: string): Promise<ScheduleTemplate[]> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("schedule_templates")
    .select("*")
    .eq("staff_id", acting.id)
    .order("day_of_week", { ascending: true });
  return (data ?? []) as ScheduleTemplate[];
}

export async function addScheduleTemplate(
  input: {
    dayOfWeek: number;
    kind: "reception" | "lesson";
    startTime: string;
    endTime?: string;
    lessonName?: string;
    note?: string;
    weeksOfMonth?: number[];
  },
  staffId?: string,
): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  if (input.kind === "reception" && !input.endTime) {
    return { ok: false, error: "受付は終了時刻を入力してください。" };
  }
  if (input.kind === "lesson" && !input.lessonName?.trim()) {
    return { ok: false, error: "レッスン名を入力してください。" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("schedule_templates").insert({
    staff_id: acting.id,
    day_of_week: input.dayOfWeek,
    kind: input.kind,
    start_time: input.startTime,
    end_time: input.kind === "reception" ? input.endTime : null,
    lesson_name: input.kind === "lesson" ? input.lessonName?.trim() : null,
    note: input.note || null,
    weeks_of_month: input.weeksOfMonth && input.weeksOfMonth.length > 0 ? input.weeksOfMonth : null,
  });
  if (error) return { ok: false, error: "登録に失敗しました。" };

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${acting.id}`);
  return { ok: true, data: undefined };
}

export async function deleteScheduleTemplate(id: string, staffId?: string): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  const admin = createAdminClient();
  const { error } = await admin.from("schedule_templates").delete().eq("id", id).eq("staff_id", acting.id);
  if (error) return { ok: false, error: "削除に失敗しました。" };

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${acting.id}`);
  return { ok: true, data: undefined };
}

// 登録済みの固定パターンを、対象月の該当する曜日すべてに反映する(すでに同じ内容が
// 登録済みの日はスキップするので、複数回押しても重複登録されない)。
export async function applyTemplatesToMonth(
  monthStart: string,
  monthEndDate: string,
  staffId?: string,
): Promise<ActionResult<{ created: number }>> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  const admin = createAdminClient();
  const { data: templates } = await admin.from("schedule_templates").select("*").eq("staff_id", acting.id);
  if (!templates?.length) return { ok: true, data: { created: 0 } };

  const { data: existing } = await admin
    .from("schedule_submissions")
    .select("entry_date, kind, start_time, lesson_name")
    .eq("staff_id", acting.id)
    .gte("entry_date", monthStart)
    .lte("entry_date", monthEndDate);
  const existingKeys = new Set(
    (existing ?? []).map((e) => `${e.entry_date}|${e.kind}|${e.start_time}|${e.lesson_name ?? ""}`),
  );

  const rows: {
    staff_id: string;
    entry_date: string;
    kind: string;
    start_time: string;
    end_time: string | null;
    lesson_name: string | null;
    note: string | null;
  }[] = [];

  let cursor = monthStart;
  while (cursor <= monthEndDate) {
    const dow = dayOfWeekForDate(cursor);
    const weekOfMonth = Math.ceil(Number(cursor.split("-")[2]) / 7); // 1〜5(第何週か)
    for (const t of templates as ScheduleTemplate[]) {
      if (t.day_of_week !== dow) continue;
      if (t.weeks_of_month && t.weeks_of_month.length > 0 && !t.weeks_of_month.includes(weekOfMonth)) continue;
      const key = `${cursor}|${t.kind}|${t.start_time}|${t.lesson_name ?? ""}`;
      if (existingKeys.has(key)) continue;
      rows.push({
        staff_id: acting.id,
        entry_date: cursor,
        kind: t.kind,
        start_time: t.start_time,
        end_time: t.kind === "reception" ? t.end_time : null,
        lesson_name: t.kind === "lesson" ? t.lesson_name : null,
        note: t.note,
      });
      existingKeys.add(key);
    }
    cursor = addDaysToDateString(cursor, 1);
  }

  if (rows.length > 0) {
    const { error } = await admin.from("schedule_submissions").insert(rows);
    if (error) return { ok: false, error: "反映に失敗しました。" };
  }

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${acting.id}`);
  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: { created: rows.length } };
}

// スタッフが「対象月のスケジュール入力が終わった」ことを明示的に提出する。
export async function getOwnScheduleSubmissionStatus(monthStart: string, staffId?: string): Promise<string | null> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("schedule_submission_status")
    .select("submitted_at")
    .eq("staff_id", acting.id)
    .eq("month_start", monthStart)
    .maybeSingle();
  return data?.submitted_at ?? null;
}

export async function submitSchedule(monthStart: string, staffId?: string): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("schedule_submission_status")
    .upsert(
      { staff_id: acting.id, month_start: monthStart, submitted_at: new Date().toISOString() },
      { onConflict: "staff_id,month_start" },
    );
  if (error) return { ok: false, error: "提出に失敗しました。" };

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${acting.id}`);
  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: undefined };
}

// 管理者が、対象月の全スタッフ分の提出状況を一覧で確認できるようにする。
export async function getScheduleSubmissionStatusList(
  monthStart: string,
): Promise<{ staffId: string; staffName: string; submittedAt: string | null }[]> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return [];

  const admin = createAdminClient();
  const [{ data: staffRows }, { data: statusRows }] = await Promise.all([
    admin.from("staff_profiles").select("id, name").eq("role", "staff").eq("is_active", true).order("name"),
    admin.from("schedule_submission_status").select("staff_id, submitted_at").eq("month_start", monthStart),
  ]);

  const statusByStaff = new Map((statusRows ?? []).map((r) => [r.staff_id, r.submitted_at as string]));
  return (staffRows ?? []).map((s) => ({
    staffId: s.id,
    staffName: s.name,
    submittedAt: statusByStaff.get(s.id) ?? null,
  }));
}
