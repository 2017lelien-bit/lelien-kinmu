"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
import type { ActionResult, PayCategory, PayUnitType } from "@/lib/types";

export async function getOwnPayCategories(): Promise<PayCategory[]> {
  const staff = await getStaffUser();
  if (!staff) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("pay_categories")
    .select("*")
    .eq("staff_id", staff.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []) as PayCategory[];
}

export async function getStaffPayCategories(staffId: string): Promise<PayCategory[]> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("pay_categories")
    .select("*")
    .eq("staff_id", staffId)
    .order("sort_order", { ascending: true });
  return (data ?? []) as PayCategory[];
}

export async function upsertPayCategory(input: {
  id?: string;
  staffId: string;
  name: string;
  unitType: PayUnitType;
  rate: number;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  if (!input.name.trim()) return { ok: false, error: "区分名を入力してください。" };
  if (input.rate < 0) return { ok: false, error: "単価は0以上で入力してください。" };

  const admin = createAdminClient();

  if (input.id) {
    const { error } = await admin
      .from("pay_categories")
      .update({ name: input.name.trim(), unit_type: input.unitType, rate: input.rate })
      .eq("id", input.id);
    if (error) return { ok: false, error: "支払区分の更新に失敗しました。" };
  } else {
    const { count } = await admin
      .from("pay_categories")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", input.staffId);
    const { error } = await admin.from("pay_categories").insert({
      staff_id: input.staffId,
      name: input.name.trim(),
      unit_type: input.unitType,
      rate: input.rate,
      sort_order: count ?? 0,
    });
    if (error) return { ok: false, error: "支払区分の追加に失敗しました。" };
  }

  revalidatePath(`/staff/admin/staff/${input.staffId}`);
  revalidatePath("/staff/mypage");
  return { ok: true, data: undefined };
}

export async function deletePayCategory(id: string, staffId: string): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  const admin = createAdminClient();
  const { error } = await admin.from("pay_categories").delete().eq("id", id);
  if (error) return { ok: false, error: "支払区分の削除に失敗しました。" };

  revalidatePath(`/staff/admin/staff/${staffId}`);
  revalidatePath("/staff/mypage");
  return { ok: true, data: undefined };
}
