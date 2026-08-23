"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
import { sendStaffPayslipEmail } from "@/lib/notifications";
import { calculateContractorWithholding, calculateEmployeeWithholding } from "@/lib/tax";
import { payPeriodEnd, computeWorkedMinutes, todayJstDateString } from "@/lib/date";
import type {
  ActionResult,
  EmploymentType,
  PayRateRule,
  PayrollBreakdown,
  PayrollBreakdownLessonLine,
  StaffPayslip,
} from "@/lib/types";
import { EMPLOYMENT_TYPE_LABEL } from "@/lib/types";

async function requireAdmin(): Promise<{ ok: false; error: string } | null> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };
  return null;
}

// レッスン実績(日付・レッスン名・時間・人数)に対して、最も条件の合う単価ルールを1件選ぶ。
// 1. レッスン名が一致するルール(人数は問わない、業務委託の定額レッスン用)を優先
// 2. レッスン名を問わないルール(時間・人数の範囲で決まる通常クラス用)
function matchPayRateRule(rules: PayRateRule[], entry: { lessonName: string; durationMinutes: number; headcount: number }): PayRateRule | null {
  const normalizedName = entry.lessonName.trim().toLowerCase();
  const named = rules.find(
    (r) =>
      r.lesson_name &&
      r.lesson_name.trim().toLowerCase() === normalizedName &&
      (r.duration_minutes === null || r.duration_minutes === entry.durationMinutes),
  );
  if (named) return named;

  return (
    rules.find(
      (r) =>
        !r.lesson_name &&
        (r.duration_minutes === null || r.duration_minutes === entry.durationMinutes) &&
        (r.min_headcount === null || entry.headcount >= r.min_headcount) &&
        (r.max_headcount === null || entry.headcount <= r.max_headcount),
    ) ?? null
  );
}

export interface TodayLessonSummary {
  id: string;
  entryDate: string;
  startTime: string | null;
  lessonName: string;
  durationMinutes: number;
  headcount: number;
  rate: number;
  approved: boolean;
}

export interface TodayShiftSummary {
  id: string;
  payCategoryId: string;
  entryDate: string;
  categoryName: string;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  hours: number;
  amount: number;
}

export interface TodaySummary {
  lessons: TodayLessonSummary[];
  shifts: TodayShiftSummary[];
}

export interface PeriodCategorySummary {
  categoryId: string;
  categoryName: string;
  unitType: "hourly" | "per_lesson";
  rate: number;
  quantity: number;
  subtotal: number;
}

// 区分(回数・時間をまとめて1つの数字で入力する方式)の、指定期間の合計を管理者が確認できるようにする。
// pay_entriesは期間ごとに1件(staff_id, pay_category_id, period_start)なので、日付ごとの内訳は出せないが、
// 「その期間にいくら分入力されているか」は確認できる。
export async function getPeriodCategorySummary(staffId: string, periodStart: string): Promise<PeriodCategorySummary[]> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return [];

  const admin = createAdminClient();
  const [{ data: categories }, { data: entries }] = await Promise.all([
    admin.from("pay_categories").select("id, name, unit_type, rate").eq("staff_id", staffId),
    admin.from("pay_entries").select("pay_category_id, quantity").eq("staff_id", staffId).eq("period_start", periodStart),
  ]);

  const qtyByCategory = new Map((entries ?? []).map((e) => [e.pay_category_id as string, e.quantity as number]));

  return (categories ?? []).map((c) => {
    const quantity = qtyByCategory.get(c.id) ?? 0;
    return {
      categoryId: c.id,
      categoryName: c.name,
      unitType: c.unit_type as "hourly" | "per_lesson",
      rate: c.rate,
      quantity,
      subtotal: Math.round(quantity * c.rate),
    };
  });
}

async function buildSummaryForRange(staffId: string, startDate: string, endDate: string): Promise<TodaySummary> {
  const admin = createAdminClient();

  const [{ data: lessons }, { data: rules }, { data: timeEntries }, { data: categories }] = await Promise.all([
    admin
      .from("lesson_log_entries")
      .select("*")
      .eq("staff_id", staffId)
      .gte("entry_date", startDate)
      .lte("entry_date", endDate),
    admin.from("pay_rate_rules").select("*").eq("staff_id", staffId),
    admin
      .from("time_log_entries")
      .select("*")
      .eq("staff_id", staffId)
      .gte("entry_date", startDate)
      .lte("entry_date", endDate),
    admin.from("pay_categories").select("id, name, rate").eq("staff_id", staffId),
  ]);

  const categoryById = new Map((categories ?? []).map((c) => [c.id, c]));

  const lessonSummaries: TodayLessonSummary[] = (lessons ?? []).map((l) => {
    const matched = matchPayRateRule(rules ?? [], {
      lessonName: l.lesson_name,
      durationMinutes: l.duration_minutes,
      headcount: l.headcount,
    });
    return {
      id: l.id,
      entryDate: l.entry_date,
      startTime: l.start_time,
      lessonName: l.lesson_name,
      durationMinutes: l.duration_minutes,
      headcount: l.headcount,
      rate: matched?.rate ?? 0,
      approved: l.approved,
    };
  });

  const shiftSummaries: TodayShiftSummary[] = (timeEntries ?? []).map((e) => {
    const category = categoryById.get(e.pay_category_id);
    const hours = computeWorkedMinutes({
      startTime: e.start_time,
      endTime: e.end_time,
      breakStart: e.break_start,
      breakEnd: e.break_end,
    }) / 60;
    return {
      id: e.id,
      payCategoryId: e.pay_category_id,
      entryDate: e.entry_date,
      categoryName: category?.name ?? "(不明な区分)",
      startTime: e.start_time,
      endTime: e.end_time,
      breakStart: e.break_start,
      breakEnd: e.break_end,
      hours,
      amount: Math.round(hours * (category?.rate ?? 0)),
    };
  });

  lessonSummaries.sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  shiftSummaries.sort((a, b) => b.entryDate.localeCompare(a.entryDate));

  return { lessons: lessonSummaries, shifts: shiftSummaries };
}

// 管理者が「本日の確認」で内容を一目で見られるように、その日のレッスンと出退勤をまとめて金額付きで返す。
export async function getTodaySummary(staffId: string): Promise<TodaySummary> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return { lessons: [], shifts: [] };

  const today = todayJstDateString();
  return buildSummaryForRange(staffId, today, today);
}

// 管理者が過去の実績をまとめて見て、間違いにすぐ気づけるように、任意の期間のレッスンと出退勤を返す。
export async function getPeriodSummary(staffId: string, periodStart: string, periodEnd: string): Promise<TodaySummary> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return { lessons: [], shifts: [] };

  return buildSummaryForRange(staffId, periodStart, periodEnd);
}

export interface PayrollResult {
  breakdown: PayrollBreakdown;
  grossAmount: number;
  daysWorked: number;
}

// 支給額計(内訳)を計算する。通勤費・税額はこの時点では含めない。
// 区分×回数(pay_categories)とレッスン実績×単価ルール(lesson_log)の両方を持つスタッフがいるため、
// 該当するデータがあればどちらも計算して合算する(例: 時給の受付 + 業務委託のレッスンを兼任している場合)。
export async function calculatePayroll(staffId: string, periodStart: string): Promise<ActionResult<PayrollResult>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const admin = createAdminClient();
  const periodEnd = payPeriodEnd(periodStart);

  const [{ data: categories }, { data: entries }, { data: rules }, { data: logEntries }, { data: timeEntries }] =
    await Promise.all([
      admin.from("pay_categories").select("*").eq("staff_id", staffId).order("sort_order", { ascending: true }),
      admin.from("pay_entries").select("*").eq("staff_id", staffId).eq("period_start", periodStart),
      admin.from("pay_rate_rules").select("*").eq("staff_id", staffId),
      admin
        .from("lesson_log_entries")
        .select("*")
        .eq("staff_id", staffId)
        .gte("entry_date", periodStart)
        .lte("entry_date", periodEnd),
      admin
        .from("time_log_entries")
        .select("entry_date")
        .eq("staff_id", staffId)
        .gte("entry_date", periodStart)
        .lte("entry_date", periodEnd),
    ]);

  // 出勤日数は、出退勤記録またはレッスン実績のいずれかが入っている日の実日数を自動で数える。
  const workedDates = new Set<string>();
  for (const e of timeEntries ?? []) workedDates.add(e.entry_date as string);
  for (const e of logEntries ?? []) workedDates.add(e.entry_date as string);
  const daysWorked = workedDates.size;

  const entryByCategory = new Map((entries ?? []).map((e) => [e.pay_category_id as string, e.quantity as number]));
  const lines = (categories ?? []).map((c) => {
    const quantity = entryByCategory.get(c.id) ?? 0;
    return {
      payCategoryId: c.id as string,
      name: c.name as string,
      unitType: c.unit_type as "hourly" | "per_lesson",
      rate: c.rate as number,
      quantity,
      subtotal: Math.round(quantity * (c.rate as number)),
    };
  });

  const lessonLines: PayrollBreakdownLessonLine[] = (logEntries ?? []).map((e) => {
    const matched = matchPayRateRule((rules ?? []) as PayRateRule[], {
      lessonName: e.lesson_name,
      durationMinutes: e.duration_minutes,
      headcount: e.headcount,
    });
    return {
      entryId: e.id as string,
      date: e.entry_date as string,
      lessonName: e.lesson_name as string,
      durationMinutes: e.duration_minutes as number,
      headcount: e.headcount as number,
      matchedRuleLabel: matched?.label ?? null,
      rate: matched?.rate ?? 0,
    };
  });

  const grossAmount =
    lines.reduce((sum, l) => sum + l.subtotal, 0) + lessonLines.reduce((sum, l) => sum + l.rate, 0);

  return { ok: true, data: { breakdown: { lines, lessonLines }, grossAmount, daysWorked } };
}

export async function generatePayslip(
  staffId: string,
  periodStart: string,
  input: { commuteAllowance: number; residentTax: number; daysWorked: number },
): Promise<ActionResult<StaffPayslip>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  if (input.commuteAllowance < 0 || input.residentTax < 0 || input.daysWorked < 0) {
    return { ok: false, error: "通勤費・住民税・出勤日数は0以上で入力してください。" };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("staff_profiles")
    .select("dependent_count, has_spouse_deduction")
    .eq("id", staffId)
    .maybeSingle();
  if (!profile) return { ok: false, error: "スタッフが見つかりませんでした。" };

  const result = await calculatePayroll(staffId, periodStart);
  if (!result.ok) return result;

  const { grossAmount, breakdown } = result.data;
  const totalGross = grossAmount + input.commuteAllowance;

  // 収入の出どころによって税の扱いが異なるため、それぞれ別に計算して合算する。
  // 区分(支払区分)からの収入 = 給与所得として、扶養設定に応じた月額表(甲欄)の算式で計算する(通勤費は非課税)。
  // レッスン実績からの収入 = 報酬・料金等として、一律10.21%で源泉徴収する(通勤費も課税対象に含む)。
  // パートと業務委託が両方ある場合、通勤費は全額パート側(非課税)として扱う。業務委託のみの場合は、
  // 従来通り通勤費も課税対象に含める(税理士確認済み)。
  const categoryGross = breakdown.lines.reduce((sum, l) => sum + l.subtotal, 0);
  const lessonGross = breakdown.lessonLines.reduce((sum, l) => sum + l.rate, 0);

  const commuteForLessons = categoryGross > 0 ? 0 : input.commuteAllowance;

  const employeeTax =
    categoryGross > 0
      ? calculateEmployeeWithholding({
          grossAfterSocialInsurance: categoryGross,
          dependentCount: profile.dependent_count,
          hasSpouseDeduction: profile.has_spouse_deduction,
        })
      : 0;
  const contractorTax = calculateContractorWithholding(lessonGross + commuteForLessons);

  const taxableAmount = categoryGross + lessonGross + commuteForLessons;
  const incomeTax = employeeTax + contractorTax;
  const employmentType: EmploymentType =
    categoryGross > 0 && lessonGross > 0 ? "mixed" : lessonGross > 0 ? "contract" : "hourly";

  const netAmount = totalGross - incomeTax - input.residentTax;
  const periodEnd = payPeriodEnd(periodStart);

  const { data: inserted, error } = await admin
    .from("staff_payslips")
    .insert({
      staff_id: staffId,
      period_start: periodStart,
      period_end: periodEnd,
      employment_type: employmentType,
      breakdown,
      gross_amount: grossAmount,
      commute_allowance: input.commuteAllowance,
      total_gross: totalGross,
      taxable_amount: taxableAmount,
      income_tax: incomeTax,
      resident_tax: input.residentTax,
      net_amount: netAmount,
      days_worked: input.daysWorked,
    })
    .select("*")
    .single();

  if (error || !inserted) return { ok: false, error: "明細の作成に失敗しました。" };

  // 明細を作成した時点で、この締め期間内の提出をまとめて「確定」扱いとし、提出バッジから消す。
  await admin
    .from("period_submissions")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("staff_id", staffId)
    .gte("submission_date", periodStart)
    .lte("submission_date", periodEnd)
    .is("acknowledged_at", null);

  revalidatePath(`/staff/admin/staff/${staffId}`);
  revalidatePath("/staff/admin/staff");
  return { ok: true, data: inserted as StaffPayslip };
}

export async function getPayslipsForStaff(staffId: string): Promise<StaffPayslip[]> {
  const staff = await getStaffUser();
  if (!staff || (staff.role !== "admin" && staff.id !== staffId)) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("staff_payslips")
    .select("*")
    .eq("staff_id", staffId)
    .order("period_start", { ascending: false });
  return (data ?? []) as StaffPayslip[];
}

const CSV_HEADERS = [
  "氏名",
  "対象期間",
  "雇用形態",
  "支給額計",
  "通勤費",
  "総支給額",
  "課税対象額",
  "所得税",
  "住民税",
  "差引支給額",
  "出勤日数",
];

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// 税理士など外部への共有用に、対象月の全スタッフ分の明細をCSVでまとめる(メール送信はドメイン未設定のため使えないので、
// 管理者がダウンロードしていつも通りのメール/LINEで送る想定)。
export async function exportPayrollCsv(periodStart: string): Promise<ActionResult<string>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const admin = createAdminClient();
  const { data: payslips } = await admin
    .from("staff_payslips")
    .select("*, staff_profiles(name)")
    .eq("period_start", periodStart)
    .order("staff_id");

  const rows = (payslips ?? []).map((p) => {
    const name = (p as unknown as { staff_profiles: { name: string } | null }).staff_profiles?.name ?? "";
    return [
      csvField(name),
      csvField(`${p.period_start}〜${p.period_end}`),
      csvField(EMPLOYMENT_TYPE_LABEL[p.employment_type as EmploymentType]),
      csvField(p.gross_amount),
      csvField(p.commute_allowance),
      csvField(p.total_gross),
      csvField(p.taxable_amount),
      csvField(p.income_tax),
      csvField(p.resident_tax),
      csvField(p.net_amount),
      csvField(p.days_worked),
    ].join(",");
  });

  const csv = [CSV_HEADERS.join(","), ...rows].join("\n");
  return { ok: true, data: `﻿${csv}` };
}

export async function deletePayslip(payslipId: string): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const admin = createAdminClient();
  const { data: payslip, error: fetchError } = await admin
    .from("staff_payslips")
    .select("staff_id")
    .eq("id", payslipId)
    .maybeSingle();
  if (fetchError || !payslip) return { ok: false, error: "明細が見つかりませんでした。" };

  const { error } = await admin.from("staff_payslips").delete().eq("id", payslipId);
  if (error) return { ok: false, error: "削除に失敗しました。" };

  revalidatePath(`/staff/admin/staff/${payslip.staff_id}`);
  revalidatePath("/staff/mypage");
  return { ok: true, data: undefined };
}

export async function sendPayslipEmail(payslipId: string): Promise<ActionResult> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const admin = createAdminClient();
  const { data: payslip } = await admin.from("staff_payslips").select("*").eq("id", payslipId).maybeSingle();
  if (!payslip) return { ok: false, error: "明細が見つかりませんでした。" };

  const { data: profile } = await admin
    .from("staff_profiles")
    .select("name, contact_email")
    .eq("id", payslip.staff_id)
    .maybeSingle();
  if (!profile) return { ok: false, error: "スタッフが見つかりませんでした。" };

  let email = profile.contact_email as string | null;
  if (!email) {
    const { data: authUser } = await admin.auth.admin.getUserById(payslip.staff_id);
    email = authUser.user?.email ?? null;
  }
  if (!email) return { ok: false, error: "送付先メールアドレスが設定されていません。" };

  const sent = await sendStaffPayslipEmail(email, profile.name, {
    periodStart: payslip.period_start,
    periodEnd: payslip.period_end,
    breakdown: payslip.breakdown as PayrollBreakdown,
    grossAmount: payslip.gross_amount,
    commuteAllowance: payslip.commute_allowance,
    totalGross: payslip.total_gross,
    incomeTax: payslip.income_tax,
    residentTax: payslip.resident_tax,
    netAmount: payslip.net_amount,
  });
  if (!sent) return { ok: false, error: "メール送信に失敗しました。" };

  await admin
    .from("staff_payslips")
    .update({ sent_at: new Date().toISOString(), sent_to_email: email })
    .eq("id", payslipId);

  revalidatePath(`/staff/admin/staff/${payslip.staff_id}`);
  return { ok: true, data: undefined };
}
