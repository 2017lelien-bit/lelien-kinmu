"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
import { todayJstDateString } from "@/lib/date";
import type { ActionResult, CommuteType, PayCategory, PayRateRule, StaffProfile } from "@/lib/types";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function getPendingSubmissionCount(): Promise<number> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return 0;

  const admin = createAdminClient();
  const { count } = await admin
    .from("period_submissions")
    .select("id", { count: "exact", head: true })
    .is("acknowledged_at", null);

  return count ?? 0;
}

export interface SubmissionStatus {
  submittedAt: string | null;
  acknowledgedAt: string | null;
}

// 「本日の確認」は日ごとに管理する。締め期間をまたいでも古い提出の確認状態が残らないようにするため、
// 常に今日の日付の行だけを見る。
export async function getSubmissionStatus(staffId: string): Promise<SubmissionStatus> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { submittedAt: null, acknowledgedAt: null };

  const admin = createAdminClient();
  const { data } = await admin
    .from("period_submissions")
    .select("submitted_at, acknowledged_at")
    .eq("staff_id", staffId)
    .eq("submission_date", todayJstDateString())
    .maybeSingle();

  return { submittedAt: data?.submitted_at ?? null, acknowledgedAt: data?.acknowledged_at ?? null };
}

export async function getSubmissionStatusMap(): Promise<Record<string, SubmissionStatus>> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return {};

  const admin = createAdminClient();
  const { data } = await admin
    .from("period_submissions")
    .select("staff_id, submitted_at, acknowledged_at")
    .eq("submission_date", todayJstDateString());

  const map: Record<string, SubmissionStatus> = {};
  for (const row of data ?? []) {
    map[row.staff_id] = { submittedAt: row.submitted_at, acknowledgedAt: row.acknowledged_at };
  }
  return map;
}

export async function acknowledgeSubmission(staffId: string): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("period_submissions")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("staff_id", staffId)
    .eq("submission_date", todayJstDateString());
  if (error) return { ok: false, error: "更新に失敗しました。" };

  revalidatePath(`/staff/admin/staff/${staffId}`);
  revalidatePath("/staff/admin/staff");
  return { ok: true, data: undefined };
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

export async function updateCommuteSettings(
  staffId: string,
  input: { commuteType: CommuteType; commuteAmount: number },
): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  if (input.commuteAmount < 0) return { ok: false, error: "金額は0以上で入力してください。" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("staff_profiles")
    .update({ commute_type: input.commuteType, commute_amount: input.commuteAmount })
    .eq("id", staffId);
  if (error) return { ok: false, error: "設定の更新に失敗しました。" };

  revalidatePath(`/staff/admin/staff/${staffId}`);
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

// スケジュール作成画面(カレンダー)で使う短い表示名(例: "Miho")。空欄なら通常のスタッフ名を使う。
export async function updateScheduleDisplayName(staffId: string, name: string): Promise<ActionResult> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("staff_profiles")
    .update({ schedule_display_name: name.trim() || null })
    .eq("id", staffId);
  if (error) return { ok: false, error: "更新に失敗しました。" };

  revalidatePath(`/staff/admin/staff/${staffId}`);
  revalidatePath("/staff/admin/schedule");
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
  // action_linkをそのまま渡すと、LINEなどのトーク画面でリンクのプレビューを作るために自動でアクセスされ、
  // 1回しか使えないトークンがその時点で消費されてしまう(=本人が開いたときには「無効」になる)。
  // token_hashだけを自前のURLに載せ、実際にフォームを送信した瞬間にverifyOtpするようにして回避する。
  const inviteLink = `${siteUrl()}/staff/set-password?token_hash=${linkData.properties.hashed_token}&type=invite`;
  return { ok: true, data: { id: linkData.user.id, inviteLink } };
}

// パスワードを忘れたスタッフのために、再設定用リンクを発行する。招待と同じ理由(メールが届かないことがある)で
// Supabaseからの自動送信は行わず、URLを直接発行してLINEなどで共有できるようにする。
export async function resetStaffPassword(staffId: string): Promise<ActionResult<{ resetLink: string }>> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(staffId);
  if (userError || !userData.user?.email) {
    return { ok: false, error: "このスタッフのメールアドレスが見つかりませんでした。" };
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: userData.user.email,
    options: { redirectTo: `${siteUrl()}/staff/set-password` },
  });

  if (linkError || !linkData) {
    return { ok: false, error: "再設定リンクの発行に失敗しました。" };
  }

  // action_linkをそのまま渡すと、LINEなどのトーク画面でリンクのプレビューを作るために自動でアクセスされ、
  // 1回しか使えないトークンがその時点で消費されてしまう(=本人が開いたときには「無効」になる)。
  // token_hashだけを自前のURLに載せ、実際にフォームを送信した瞬間にverifyOtpするようにして回避する。
  const resetLink = `${siteUrl()}/staff/set-password?token_hash=${linkData.properties.hashed_token}&type=recovery`;
  return { ok: true, data: { resetLink } };
}
