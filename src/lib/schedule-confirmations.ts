"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser, resolveActingStaffId } from "@/lib/auth";
import type { ActionResult } from "@/lib/types";

// 組み立てが終わった最終的なスケジュールを、スタッフ本人に「これでOKか」確認してもらう。
// (提出=希望を伝える、確認=決まった結果を承知した、で意味が異なる別のステータス)
export async function getOwnScheduleConfirmation(monthStart: string, staffId?: string): Promise<string | null> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("schedule_confirmations")
    .select("confirmed_at")
    .eq("staff_id", acting.id)
    .eq("month_start", monthStart)
    .maybeSingle();
  return data?.confirmed_at ?? null;
}

export async function confirmMonthlySchedule(monthStart: string, staffId?: string): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("schedule_confirmations")
    .upsert(
      { staff_id: acting.id, month_start: monthStart, confirmed_at: new Date().toISOString() },
      { onConflict: "staff_id,month_start" },
    );
  if (error) return { ok: false, error: "確認の記録に失敗しました。" };

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${acting.id}`);
  revalidatePath("/staff/admin/schedule");
  return { ok: true, data: undefined };
}

// 管理者が、組み立てた月のスケジュールについて誰が確認済みかをまとめて見られるようにする。
export async function getScheduleConfirmationStatusList(
  monthStart: string,
): Promise<{ staffId: string; staffName: string; confirmedAt: string | null }[]> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return [];

  const admin = createAdminClient();
  const [{ data: staffRows }, { data: statusRows }] = await Promise.all([
    admin
      .from("staff_profiles")
      .select("id, name, schedule_display_name")
      .eq("role", "staff")
      .eq("is_active", true)
      .order("name"),
    admin.from("schedule_confirmations").select("staff_id, confirmed_at").eq("month_start", monthStart),
  ]);

  const statusByStaff = new Map((statusRows ?? []).map((r) => [r.staff_id, r.confirmed_at as string]));
  return (staffRows ?? []).map((s) => ({
    staffId: s.id,
    staffName: s.schedule_display_name || s.name,
    confirmedAt: statusByStaff.get(s.id) ?? null,
  }));
}
