"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser, resolveActingStaffId } from "@/lib/auth";
import type { ActionResult, ScheduleSubmission } from "@/lib/types";

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
    kind: "reception" | "lesson";
    startTime: string;
    endTime?: string;
    lessonName?: string;
    note?: string;
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
  const { error } = await admin.from("schedule_submissions").insert({
    staff_id: acting.id,
    entry_date: input.entryDate,
    kind: input.kind,
    start_time: input.startTime,
    end_time: input.kind === "reception" ? input.endTime : null,
    lesson_name: input.kind === "lesson" ? input.lessonName?.trim() : null,
    note: input.note || null,
  });
  if (error) return { ok: false, error: "登録に失敗しました。" };

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${acting.id}`);
  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: undefined };
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
