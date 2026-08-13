"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
import type { ActionResult, PayRateRule } from "@/lib/types";

// 単価ルールは管理者専用。スタッフ本人には見せない(区分名・単価が人数によって変わることを隠すため)。
export async function getStaffPayRateRules(staffId: string): Promise<PayRateRule[]> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("pay_rate_rules")
    .select("*")
    .eq("staff_id", staffId)
    .order("sort_order", { ascending: true });
  return (data ?? []) as PayRateRule[];
}

export async function upsertPayRateRule(input: {
  id?: string;
  staffId: string;
  label: string;
  lessonName?: string;
  durationMinutes?: number;
  minHeadcount?: number;
  maxHeadcount?: number;
  rate: number;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  if (!input.label.trim()) return { ok: false, error: "ルール名を入力してください。" };
  if (input.rate < 0) return { ok: false, error: "単価は0以上で入力してください。" };
  if (
    input.minHeadcount !== undefined &&
    input.maxHeadcount !== undefined &&
    input.minHeadcount > input.maxHeadcount
  ) {
    return { ok: false, error: "人数の下限は上限以下にしてください。" };
  }

  const admin = createAdminClient();
  const values = {
    staff_id: input.staffId,
    label: input.label.trim(),
    lesson_name: input.lessonName?.trim() || null,
    duration_minutes: input.durationMinutes ?? null,
    min_headcount: input.minHeadcount ?? null,
    max_headcount: input.maxHeadcount ?? null,
    rate: input.rate,
  };

  if (input.id) {
    const { error } = await admin.from("pay_rate_rules").update(values).eq("id", input.id);
    if (error) return { ok: false, error: "ルールの更新に失敗しました。" };
  } else {
    const { count } = await admin
      .from("pay_rate_rules")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", input.staffId);
    const { error } = await admin.from("pay_rate_rules").insert({ ...values, sort_order: count ?? 0 });
    if (error) return { ok: false, error: "ルールの追加に失敗しました。" };
  }

  revalidatePath(`/staff/admin/staff/${input.staffId}`);
  return { ok: true, data: undefined };
}

export async function deletePayRateRule(id: string, staffId: string): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  const admin = createAdminClient();
  const { error } = await admin.from("pay_rate_rules").delete().eq("id", id);
  if (error) return { ok: false, error: "ルールの削除に失敗しました。" };

  revalidatePath(`/staff/admin/staff/${staffId}`);
  return { ok: true, data: undefined };
}
