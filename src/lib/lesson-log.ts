"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser, resolveActingStaffId } from "@/lib/auth";
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
    note?: string;
  },
  staffId?: string,
): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  if (!input.lessonName.trim()) return { ok: false, error: "レッスン名を入力してください。" };
  if (input.durationMinutes <= 0) return { ok: false, error: "時間は1分以上で入力してください。" };
  if (input.headcount <= 0) return { ok: false, error: "参加人数は1人以上で入力してください。" };

  const admin = createAdminClient();
  const { error } = await admin.from("lesson_log_entries").insert({
    staff_id: acting.id,
    entry_date: input.entryDate,
    lesson_name: input.lessonName.trim(),
    duration_minutes: input.durationMinutes,
    headcount: input.headcount,
    note: input.note || null,
  });

  if (error) return { ok: false, error: "実績の登録に失敗しました。" };

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
    note?: string;
  },
  staffId?: string,
): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  if (!input.lessonName.trim()) return { ok: false, error: "レッスン名を入力してください。" };
  if (input.durationMinutes <= 0) return { ok: false, error: "時間は1分以上で入力してください。" };
  if (input.headcount <= 0) return { ok: false, error: "参加人数は1人以上で入力してください。" };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("lesson_log_entries")
    .select("approved")
    .eq("id", id)
    .eq("staff_id", acting.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "実績が見つかりません。" };
  if (existing.approved) return { ok: false, error: "承認済みの実績は変更できません。管理者に取り消しを依頼してください。" };

  const { error } = await admin
    .from("lesson_log_entries")
    .update({
      entry_date: input.entryDate,
      lesson_name: input.lessonName.trim(),
      duration_minutes: input.durationMinutes,
      headcount: input.headcount,
      note: input.note || null,
    })
    .eq("id", id)
    .eq("staff_id", acting.id);

  if (error) return { ok: false, error: "実績の更新に失敗しました。" };

  revalidateMypageAndAdmin(acting.id);
  return { ok: true, data: undefined };
}

export async function deleteLessonLogEntry(id: string, staffId?: string): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("lesson_log_entries")
    .select("approved")
    .eq("id", id)
    .eq("staff_id", acting.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "実績が見つかりません。" };
  if (existing.approved) return { ok: false, error: "承認済みの実績は削除できません。管理者に取り消しを依頼してください。" };

  const { error } = await admin.from("lesson_log_entries").delete().eq("id", id).eq("staff_id", acting.id);
  if (error) return { ok: false, error: "削除に失敗しました。" };

  revalidateMypageAndAdmin(acting.id);
  return { ok: true, data: undefined };
}
