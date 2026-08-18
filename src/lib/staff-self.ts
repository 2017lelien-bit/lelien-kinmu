"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser, resolveActingStaffId } from "@/lib/auth";
import type { ActionResult, PayEntry, StaffPayslip, StaffProfile } from "@/lib/types";

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
  address?: string;
  dependentCount: number;
  hasSpouseDeduction: boolean;
}): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "スタッフとしてログインしてください。" };

  if (input.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)) {
    return { ok: false, error: "メールアドレスの形式が正しくありません。" };
  }
  if (input.dependentCount < 0) return { ok: false, error: "扶養人数は0以上で入力してください。" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("staff_profiles")
    .update({
      phone: input.phone || null,
      contact_email: input.contactEmail || null,
      address: input.address || null,
      dependent_count: input.dependentCount,
      has_spouse_deduction: input.hasSpouseDeduction,
    })
    .eq("id", staff.id);

  if (error) return { ok: false, error: "プロフィールの更新に失敗しました。" };

  revalidatePath("/staff/mypage");
  return { ok: true, data: undefined };
}

export async function getOwnPayEntries(periodStart: string, staffId?: string): Promise<PayEntry[]> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("pay_entries")
    .select("*")
    .eq("staff_id", acting.id)
    .eq("period_start", periodStart);

  return (data ?? []) as PayEntry[];
}

export async function upsertPayEntry(
  input: {
    payCategoryId: string;
    periodStart: string;
    quantity: number;
    note?: string;
  },
  staffId?: string,
): Promise<ActionResult> {
  const acting = await resolveActingStaffId(staffId);
  if ("error" in acting) return { ok: false, error: acting.error };

  if (input.quantity < 0) {
    return { ok: false, error: "数量は0以上で入力してください。" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("pay_entries").upsert(
    {
      staff_id: acting.id,
      pay_category_id: input.payCategoryId,
      period_start: input.periodStart,
      quantity: input.quantity,
      note: input.note || null,
    },
    { onConflict: "staff_id,pay_category_id,period_start" },
  );

  if (error) return { ok: false, error: "実績の登録に失敗しました。" };

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${acting.id}`);
  return { ok: true, data: undefined };
}

export async function getOwnSubmissionStatus(periodStart: string): Promise<string | null> {
  const staff = await getStaffUser();
  if (!staff) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("period_submissions")
    .select("submitted_at")
    .eq("staff_id", staff.id)
    .eq("period_start", periodStart)
    .maybeSingle();

  return data?.submitted_at ?? null;
}

export async function submitPeriodEntries(periodStart: string): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff) return { ok: false, error: "スタッフとしてログインしてください。" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("period_submissions")
    .upsert(
      { staff_id: staff.id, period_start: periodStart, submitted_at: new Date().toISOString() },
      { onConflict: "staff_id,period_start" },
    );

  if (error) return { ok: false, error: "提出に失敗しました。" };

  revalidatePath("/staff/mypage");
  revalidatePath(`/staff/admin/staff/${staff.id}`);
  return { ok: true, data: undefined };
}

export async function getOwnPayslips(): Promise<StaffPayslip[]> {
  const staff = await getStaffUser();
  if (!staff) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("staff_payslips")
    .select("*")
    .eq("staff_id", staff.id)
    .order("period_start", { ascending: false });

  return (data ?? []) as StaffPayslip[];
}
