"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser, resolveActingStaffId } from "@/lib/auth";
import { notifyAdmins } from "@/lib/push";
import type { ActionResult } from "@/lib/types";

export interface CorrectionRequest {
  id: string;
  staff_id: string;
  entry_type: string;
  entry_date: string;
  note: string;
  requested_at: string;
  resolved_at: string | null;
}

const ENTRY_TYPE_LABEL: Record<string, string> = {
  time_log: "出退勤",
  lesson_log: "レッスン実績",
  pay_entry: "実績入力",
};

// 提出済み・承認済みで自分では書き換えられなくなった実績について、本人が自由に直すのではなく、
// 管理者に訂正内容を伝えて対応してもらうための依頼を作る(通知が管理者に届く)。
export async function requestCorrection(
  entryType: string,
  entryDate: string,
  note: string,
  staffId?: string,
): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };
  if (!note.trim()) return { ok: false, error: "訂正したい内容を入力してください。" };

  const staff = await getStaffUser();
  const admin = createAdminClient();
  const { error } = await admin.from("correction_requests").insert({
    staff_id: acting.id,
    entry_type: entryType,
    entry_date: entryDate,
    note: note.trim(),
  });
  if (error) return { ok: false, error: "依頼の送信に失敗しました。" };

  await notifyAdmins({
    title: "訂正の依頼が届きました",
    body: `${staff?.name ?? ""}さん: ${entryDate}の${ENTRY_TYPE_LABEL[entryType] ?? entryType}`,
    url: `/staff/admin/staff/${acting.id}`,
  });

  revalidatePath("/staff/admin/staff");
  return { ok: true, data: undefined };
}

export async function getPendingCorrectionRequests(): Promise<(CorrectionRequest & { staffName: string })[]> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("correction_requests")
    .select("*, staff_profiles(name)")
    .is("resolved_at", null)
    .order("requested_at", { ascending: true });

  return (
    (data ?? []) as unknown as (CorrectionRequest & { staff_profiles: { name: string } | null })[]
  ).map((r) => ({ ...r, staffName: r.staff_profiles?.name ?? "(不明)" }));
}

export async function resolveCorrectionRequest(id: string): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  const admin = createAdminClient();
  const { error } = await admin.from("correction_requests").update({ resolved_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "対応済みへの更新に失敗しました。" };

  revalidatePath("/staff/admin/staff");
  return { ok: true, data: undefined };
}
