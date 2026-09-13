"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser, resolveActingStaffId } from "@/lib/auth";
import { addDaysToDateString, dayOfWeekForDate } from "@/lib/date";
import { CLOSED_DAY_OF_WEEK } from "@/lib/types";
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
  if (input.kind === "lesson") {
    if (!input.startTime) return { ok: false, error: "レッスンは開始時刻を入力してください。" };
    // レッスン名を決めない場合は、代わりに終了時刻(可能な時間帯)を必須にする。
    if (!input.lessonName?.trim() && !input.endTime) {
      return { ok: false, error: "レッスン名か、終了時刻(時間帯だけ伝える場合)のどちらかを入力してください。" };
    }
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
      // レッスン名を決めている場合は開始時刻だけ、決めていない場合(時間帯だけ伝える)は終了時刻も持つ。
      end_time: input.kind === "lesson" ? (input.lessonName?.trim() ? null : input.endTime || null) : input.endTime || null,
      lesson_name: input.kind === "lesson" ? input.lessonName?.trim() || null : null,
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
    .select("*, staff_profiles(name, schedule_display_name)")
    .gte("entry_date", monthStart)
    .lte("entry_date", monthEnd)
    .order("entry_date", { ascending: true });

  return (
    (data ?? []) as unknown as (ScheduleSubmission & {
      staff_profiles: { name: string; schedule_display_name: string | null } | null;
    })[]
  ).map((e) => ({
    ...e,
    staffName: e.staff_profiles?.schedule_display_name || e.staff_profiles?.name || "(不明)",
  }));
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

// 管理者がスケジュール組み立て中に、確定した予定の時間を微調整できるようにする
// (元の提出内容そのものを上書きする。組み立て済みの最終スケジュールとして扱うため)。
// レッスン名を決めずに時間帯だけ提出された候補には、ここでレッスン名を割り当てられるようにする。
export async function updateScheduleEntryTime(
  id: string,
  input: { startTime: string; endTime?: string; lessonName?: string },
): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const admin = createAdminClient();
  const update: { start_time: string; end_time: string | null; lesson_name?: string | null } = {
    start_time: input.startTime,
    end_time: input.endTime || null,
  };
  if (input.lessonName !== undefined) update.lesson_name = input.lessonName.trim() || null;

  const { error } = await admin.from("schedule_submissions").update(update).eq("id", id);
  if (error) return { ok: false, error: "更新に失敗しました。" };

  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: undefined };
}

// レッスン名だけを更新する(時刻の列には一切触れない)。
// 時刻編集とレッスン名の割り当てがほぼ同時に起きたとき、片方が古い値で
// もう片方を上書きしてしまう(入力したのに戻る)不具合を避けるため、
// レッスン名を割り当てる処理は必ずこちらを使う。
export async function assignScheduleEntryLessonName(id: string, lessonName: string): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const admin = createAdminClient();
  const { error } = await admin
    .from("schedule_submissions")
    .update({ lesson_name: lessonName.trim() || null })
    .eq("id", id);
  if (error) return { ok: false, error: "更新に失敗しました。" };

  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: undefined };
}

// 確定済みの予定の担当スタッフを、管理者が直接差し替えられるようにする
// (元々提出した本人ではなく、別のスタッフに変更したい場合)。
export async function updateScheduleEntryStaff(id: string, staffId: string): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const admin = createAdminClient();
  const { error } = await admin.from("schedule_submissions").update({ staff_id: staffId }).eq("id", id);
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

// 管理者がスケジュール組み立て時に、担当スタッフを変更したときそのスタッフが担当できる
// レッスン名をプルダウンで選べるように、全スタッフ分のレッスン選択肢をまとめて取得する。
export async function getLessonOptionsByStaff(): Promise<Record<string, LessonOption[]>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return {};

  const admin = createAdminClient();
  const { data } = await admin.from("staff_lesson_options").select("*").order("sort_order", { ascending: true });

  const map: Record<string, LessonOption[]> = {};
  for (const row of (data ?? []) as LessonOption[]) {
    (map[row.staff_id] ??= []).push(row);
  }
  return map;
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
    if (dow === CLOSED_DAY_OF_WEEK) {
      cursor = addDaysToDateString(cursor, 1);
      continue;
    }
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

// 個々の予定に紐づかない、月全体についてのメモ(「今月は入れません」等)。
// 「提出する」ボタンを押すタイミングで一緒に保存する。
export async function getOwnScheduleSubmissionNote(monthStart: string, staffId?: string): Promise<string | null> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("schedule_submission_status")
    .select("note")
    .eq("staff_id", acting.id)
    .eq("month_start", monthStart)
    .maybeSingle();
  return data?.note ?? null;
}

export async function submitSchedule(monthStart: string, note?: string, staffId?: string): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("schedule_submission_status")
    .upsert(
      { staff_id: acting.id, month_start: monthStart, submitted_at: new Date().toISOString(), note: note?.trim() || null },
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
): Promise<{ staffId: string; staffName: string; submittedAt: string | null; note: string | null }[]> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return [];

  const admin = createAdminClient();
  const [{ data: staffRows }, { data: statusRows }] = await Promise.all([
    admin
      .from("staff_profiles")
      .select("id, name, schedule_display_name")
      .eq("role", "staff")
      .eq("is_active", true)
      .order("name"),
    admin.from("schedule_submission_status").select("staff_id, submitted_at, note").eq("month_start", monthStart),
  ]);

  const statusByStaff = new Map((statusRows ?? []).map((r) => [r.staff_id, r]));
  return (staffRows ?? []).map((s) => ({
    staffId: s.id,
    staffName: s.schedule_display_name || s.name,
    submittedAt: statusByStaff.get(s.id)?.submitted_at ?? null,
    note: statusByStaff.get(s.id)?.note ?? null,
  }));
}
