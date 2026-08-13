"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
import type { ActionResult, PayEntry, StaffProfile } from "@/lib/types";

export async function getOwnStaffProfile(): Promise<StaffProfile | null> {
  const staff = await getStaffUser();
  if (!staff) return null;

  const admin = createAdminClient();
  const { data } = await admin.from("staff_profiles").select("*").eq("id", staff.id).maybeSingle();
  return (data as StaffProfile) ?? null;
}

export async function updateOwnStaffProfile(input: {
  phone?: string;
  contactEmail?: string;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "スタッフとしてログインしてください。" };

  if (input.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)) {
    return { ok: false, error: "メールアドレスの形式が正しくありません。" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("staff_profiles")
    .update({
      phone: input.phone || null,
      contact_email: input.contactEmail || null,
    })
    .eq("id", staff.id);

  if (error) return { ok: false, error: "プロフィールの更新に失敗しました。" };

  revalidatePath("/staff/mypage");
  return { ok: true, data: undefined };
}

export async function getOwnPayEntries(periodStart: string): Promise<PayEntry[]> {
  const staff = await getStaffUser();
  if (!staff) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("pay_entries")
    .select("*")
    .eq("staff_id", staff.id)
    .eq("period_start", periodStart);

  return (data ?? []) as PayEntry[];
}

export async function upsertPayEntry(input: {
  payCategoryId: string;
  periodStart: string;
  quantity: number;
  note?: string;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "スタッフとしてログインしてください。" };

  if (input.quantity < 0) {
    return { ok: false, error: "数量は0以上で入力してください。" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("pay_entries").upsert(
    {
      staff_id: staff.id,
      pay_category_id: input.payCategoryId,
      period_start: input.periodStart,
      quantity: input.quantity,
      note: input.note || null,
    },
    { onConflict: "staff_id,pay_category_id,period_start" },
  );

  if (error) return { ok: false, error: "実績の登録に失敗しました。" };

  revalidatePath("/staff/mypage");
  return { ok: true, data: undefined };
}
