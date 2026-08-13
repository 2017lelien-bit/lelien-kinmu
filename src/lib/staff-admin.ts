"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
import type { ActionResult, LessonLogEntry, PayCategory, PayRateRule, StaffProfile } from "@/lib/types";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function getAllStaff(): Promise<StaffProfile[]> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return [];

  const admin = createAdminClient();
  const { data } = await admin.from("staff_profiles").select("*").order("created_at", { ascending: true });
  return (data ?? []) as StaffProfile[];
}

export interface StaffDetail {
  profile: StaffProfile;
  payCategories: PayCategory[];
  payRateRules: PayRateRule[];
}

export async function getStaffDetail(id: string): Promise<StaffDetail | null> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return null;

  const admin = createAdminClient();
  const [{ data: profile }, { data: categories }, { data: rules }] = await Promise.all([
    admin.from("staff_profiles").select("*").eq("id", id).maybeSingle(),
    admin.from("pay_categories").select("*").eq("staff_id", id).order("sort_order", { ascending: true }),
    admin.from("pay_rate_rules").select("*").eq("staff_id", id).order("sort_order", { ascending: true }),
  ]);
  if (!profile) return null;

  return {
    profile: profile as StaffProfile,
    payCategories: (categories ?? []) as PayCategory[],
    payRateRules: (rules ?? []) as PayRateRule[],
  };
}

export async function getLessonLogEntriesForStaff(staffId: string): Promise<LessonLogEntry[]> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("lesson_log_entries")
    .select("*")
    .eq("staff_id", staffId)
    .order("entry_date", { ascending: false });

  return (data ?? []) as LessonLogEntry[];
}

export async function setLessonLogEntryApproval(id: string, approved: boolean): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lesson_log_entries")
    .update({ approved })
    .eq("id", id)
    .select("staff_id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "更新に失敗しました。" };

  revalidatePath(`/staff/admin/staff/${data.staff_id}`);
  return { ok: true, data: undefined };
}

export async function setStaffActive(staffId: string, isActive: boolean): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  const admin = createAdminClient();
  const { error } = await admin.from("staff_profiles").update({ is_active: isActive }).eq("id", staffId);
  if (error) return { ok: false, error: "更新に失敗しました。" };

  revalidatePath(`/staff/admin/staff/${staffId}`);
  revalidatePath("/staff/admin/staff");
  return { ok: true, data: undefined };
}

// Supabase Authの招待メール(パスワード設定リンク)を送信し、staff_profilesにレコードを作成する。
// パスワード自体はこの経路では一切扱わず、本人がメール内リンクから/staff/set-passwordで設定する。
// メールでの招待は届かないことがあるため、URLを直接発行してLINEなどで共有できるようにする
// (Supabaseからの自動送信は行わない)。
export async function inviteStaff(input: {
  email: string;
  name: string;
  role: "staff" | "admin";
}): Promise<ActionResult<{ id: string; inviteLink: string }>> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  if (!input.name.trim()) return { ok: false, error: "お名前を入力してください。" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return { ok: false, error: "メールアドレスの形式が正しくありません。" };
  }

  const admin = createAdminClient();
  const { data: linkData, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email: input.email,
    options: { redirectTo: `${siteUrl()}/staff/set-password` },
  });

  if (inviteError || !linkData.user) {
    return { ok: false, error: "招待の発行に失敗しました。既に登録済みのメールアドレスの可能性があります。" };
  }

  const { error: profileError } = await admin.from("staff_profiles").insert({
    id: linkData.user.id,
    name: input.name.trim(),
    role: input.role,
  });

  if (profileError) {
    return { ok: false, error: "スタッフ情報の登録に失敗しました。" };
  }

  revalidatePath("/staff/admin/staff");
  return { ok: true, data: { id: linkData.user.id, inviteLink: linkData.properties.action_link } };
}
