"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
import { sendStaffPayslipEmail } from "@/lib/notifications";
import { calculateContractorWithholding, calculateEmployeeWithholding } from "@/lib/tax";
import { payPeriodEnd, computeWorkedMinutes, todayJstDateString } from "@/lib/date";
import { getLeLienDeductionsByDate } from "@/lib/time-log";
import type ExcelJS from "exceljs";
import type {
  ActionResult,
  EmploymentType,
  PayRateRule,
  PayrollBreakdown,
  PayrollBreakdownLessonLine,
  StaffPayslip,
} from "@/lib/types";

// 時給区分は現状「Le lien受付」系(名前の付け方は人によってばらつきがある)と「むすひ」の
// 2種類しかないため、"むすひ"を含まない=Le lien側、という判定にする方が確実。
function isLeLienCategoryName(name: string): boolean {
  return !name.trim().includes("むすひ");
}

async function requireAdmin(): Promise<{ ok: false; error: string } | null> {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") return { ok: false, error: "管理者としてログインしてください。" };
  return null;
}

// レッスン実績(日付・レッスン名・時間・人数)に対して、最も条件の合う単価ルールを1件選ぶ。
// 1. レッスン名が一致するルールを優先(人数上下限が未設定なら人数を問わない定額レッスン用だが、
//    同じレッスン名に人数ごとの段階(例: 1〜3名/4〜9名/満員)が設定されていることもあるため、
//    人数の範囲もあわせて絞り込む)
// 2. レッスン名を問わないルール(時間・人数の範囲で決まる通常クラス用)
function matchPayRateRule(rules: PayRateRule[], entry: { lessonName: string; durationMinutes: number; headcount: number }): PayRateRule | null {
  const normalizedName = entry.lessonName.normalize("NFKC").trim().toLowerCase();
  const named = rules.find(
    (r) =>
      r.lesson_name &&
      r.lesson_name.normalize("NFKC").trim().toLowerCase() === normalizedName &&
      (r.duration_minutes === null || r.duration_minutes === entry.durationMinutes) &&
      (r.min_headcount === null || entry.headcount >= r.min_headcount) &&
      (r.max_headcount === null || entry.headcount <= r.max_headcount),
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
  // 同じ日にレッスンと時間が重なっている場合の差し引き分(分)。0ならなし。
  deductionMinutes: number;
  // 差し引き後、実際に給与へ反映される時間・金額(deductionMinutesが0ならhours/amountと同じ)。
  netHours: number;
  netAmount: number;
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
    admin.from("pay_categories").select("id, name, unit_type, rate").eq("staff_id", staffId).eq("is_active", true),
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

  // 「Le lien」区分は、レッスンと時間が重なっていた分だけ日付ごとに差し引かれる。
  // 区分ごとに計算し、日付ごとの差し引き分数をまとめておく。
  const leLienCategoryIds = (categories ?? []).filter((c) => isLeLienCategoryName(c.name)).map((c) => c.id);
  const deductionsByCategoryDate = new Map<string, Record<string, number>>();
  for (const categoryId of leLienCategoryIds) {
    deductionsByCategoryDate.set(categoryId, await getLeLienDeductionsByDate(categoryId, startDate, endDate, staffId));
  }
  // 同じ日・同じ区分に複数の記録があっても、差し引き表示は1件だけにする(最後の1件にまとめる)。
  const deductionShownFor = new Set<string>();

  const shiftSummaries: TodayShiftSummary[] = (timeEntries ?? []).map((e) => {
    const category = categoryById.get(e.pay_category_id);
    const hours = computeWorkedMinutes({
      startTime: e.start_time,
      endTime: e.end_time,
      breakStart: e.break_start,
      breakEnd: e.break_end,
    }) / 60;
    const groupKey = `${e.pay_category_id}|${e.entry_date}`;
    const deductionMinutes = deductionsByCategoryDate.get(e.pay_category_id)?.[e.entry_date] ?? 0;
    const showDeduction = deductionMinutes > 0 && !deductionShownFor.has(groupKey);
    if (showDeduction) deductionShownFor.add(groupKey);
    const netHours = Math.max(0, hours - deductionMinutes / 60);
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
      deductionMinutes: showDeduction ? deductionMinutes : 0,
      netHours,
      netAmount: Math.round(netHours * (category?.rate ?? 0)),
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
      admin
        .from("pay_categories")
        .select("*")
        .eq("staff_id", staffId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
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

// 受付(時給・給与所得)とレッスン(業務委託・報酬)の両方がある人は、1枚にまとめると
// 「二重に税金が引かれているように見える」と税理士から指摘があったため、それぞれ
// 別々の明細(支払い)として作成する。税額の計算方法自体は変えていない
// (受付側=扶養控除等を踏まえた給与所得の月額表、レッスン側=報酬・料金等の一律10.21%)。
export async function generatePayslip(
  staffId: string,
  periodStart: string,
  input: { commuteAllowance: number; residentTax: number; daysWorked: number },
): Promise<ActionResult<StaffPayslip[]>> {
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

  const { breakdown } = result.data;
  const periodEnd = payPeriodEnd(periodStart);

  const categoryGross = breakdown.lines.reduce((sum, l) => sum + l.subtotal, 0);
  const lessonGross = breakdown.lessonLines.reduce((sum, l) => sum + l.rate, 0);

  // 通勤費は非課税なので受付(給与)側で持たせる。受付がなくレッスンのみの場合は、
  // これまで通りレッスン側の報酬に含めて課税する(税理士確認済み)。
  const commuteOnHourly = categoryGross > 0 ? input.commuteAllowance : 0;
  const commuteOnLesson = categoryGross > 0 ? 0 : input.commuteAllowance;
  // 住民税は主たる勤務先(受付側)からまとめて控除する想定。受付がなければレッスン側に付ける。
  const residentTaxOnHourly = categoryGross > 0 ? input.residentTax : 0;
  const residentTaxOnLesson = categoryGross > 0 ? 0 : input.residentTax;

  const rows: {
    employment_type: EmploymentType;
    breakdown: PayrollBreakdown;
    gross_amount: number;
    commute_allowance: number;
    total_gross: number;
    taxable_amount: number;
    income_tax: number;
    resident_tax: number;
    net_amount: number;
    days_worked: number;
  }[] = [];

  if (categoryGross > 0) {
    const employeeTax = calculateEmployeeWithholding({
      grossAfterSocialInsurance: categoryGross,
      dependentCount: profile.dependent_count,
      hasSpouseDeduction: profile.has_spouse_deduction,
    });
    const totalGross = categoryGross + commuteOnHourly;
    rows.push({
      employment_type: "hourly",
      breakdown: { lines: breakdown.lines, lessonLines: [] },
      gross_amount: categoryGross,
      commute_allowance: commuteOnHourly,
      total_gross: totalGross,
      taxable_amount: categoryGross,
      income_tax: employeeTax,
      resident_tax: residentTaxOnHourly,
      net_amount: totalGross - employeeTax - residentTaxOnHourly,
      days_worked: input.daysWorked,
    });
  }

  if (lessonGross > 0) {
    const taxableAmount = lessonGross + commuteOnLesson;
    const contractorTax = calculateContractorWithholding(taxableAmount);
    const totalGross = lessonGross + commuteOnLesson;
    rows.push({
      employment_type: "contract",
      breakdown: { lines: [], lessonLines: breakdown.lessonLines },
      gross_amount: lessonGross,
      commute_allowance: commuteOnLesson,
      total_gross: totalGross,
      taxable_amount: taxableAmount,
      income_tax: contractorTax,
      resident_tax: residentTaxOnLesson,
      net_amount: totalGross - contractorTax - residentTaxOnLesson,
      days_worked: input.daysWorked,
    });
  }

  if (rows.length === 0) {
    return { ok: false, error: "この期間の実績がありません。" };
  }

  const { data: inserted, error } = await admin
    .from("staff_payslips")
    .insert(rows.map((r) => ({ staff_id: staffId, period_start: periodStart, period_end: periodEnd, ...r })))
    .select("*");

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
  return { ok: true, data: inserted as StaffPayslip[] };
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

// メールが使えない場合に、LINEなどにそのまま貼り付けて個別に送れるよう、
// 明細メールと同じ内容をプレーンテキストで組み立てる。
// レッスン本数が多いスタッフだと1本ずつの明細が長くなりすぎるため、
// レッスンは合計本数だけにまとめ、時間制のカテゴリはむすひ/Lelienの時間合計で示す。
function formatPayslipText(staffName: string, p: StaffPayslip): string {
  const breakdown = p.breakdown as PayrollBreakdown;
  const lines: string[] = [];

  const musuhiHours = breakdown.lines
    .filter((l) => l.unitType === "hourly" && !isLeLienCategoryName(l.name))
    .reduce((sum, l) => sum + l.quantity, 0);
  const leLienHours = breakdown.lines
    .filter((l) => l.unitType === "hourly" && isLeLienCategoryName(l.name))
    .reduce((sum, l) => sum + l.quantity, 0);

  for (const l of breakdown.lines) {
    lines.push(`・${l.name}: ${l.quantity}${l.unitType === "hourly" ? "時間" : "回"} × ¥${l.rate.toLocaleString()} = ¥${l.subtotal.toLocaleString()}`);
  }
  if (leLienHours > 0) lines.push(`・Lelien時間合計: ${leLienHours}時間`);
  if (musuhiHours > 0) lines.push(`・むすひ時間合計: ${musuhiHours}時間`);
  if (breakdown.lessonLines.length > 0) {
    const lessonTotal = breakdown.lessonLines.reduce((sum, l) => sum + l.rate, 0);
    lines.push(`・レッスン合計: ${breakdown.lessonLines.length}本 = ¥${lessonTotal.toLocaleString()}`);
  }

  return [
    `${staffName}様`,
    "",
    `【給与明細のお知らせ】(${p.period_start}〜${p.period_end})`,
    "",
    ...lines,
    "",
    `支給額計: ¥${p.gross_amount.toLocaleString()}`,
    `通勤費: ¥${p.commute_allowance.toLocaleString()}`,
    `総支給額: ¥${p.total_gross.toLocaleString()}`,
    `所得税: ¥${p.income_tax.toLocaleString()}`,
    `住民税: ¥${p.resident_tax.toLocaleString()}`,
    `差引支給額: ¥${p.net_amount.toLocaleString()}`,
  ].join("\n");
}

export interface PayslipTextSummary {
  staffId: string;
  staffName: string;
  payslipId: string;
  sentAt: string | null;
  text: string;
}

// 対象月の全スタッフ分の明細を、確認しながら1人ずつコピーしてLINE等で送れるようにする。
export async function getPayslipTextSummaries(periodStart: string): Promise<PayslipTextSummary[]> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return [];

  const admin = createAdminClient();
  const { data: payslips } = await admin
    .from("staff_payslips")
    .select("*, staff_profiles(name)")
    .eq("period_start", periodStart)
    .order("staff_id");

  return (payslips ?? []).map((p) => {
    const staffName = (p as unknown as { staff_profiles: { name: string } | null }).staff_profiles?.name ?? "(不明)";
    return {
      staffId: p.staff_id,
      staffName,
      payslipId: p.id,
      sentAt: p.sent_at,
      text: formatPayslipText(staffName, p as StaffPayslip),
    };
  });
}

// スタッフ個別ページの明細履歴からも、その場でLINE等にコピーできるようにする。
export async function getPayslipText(payslipId: string): Promise<ActionResult<string>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const admin = createAdminClient();
  const { data: p } = await admin.from("staff_payslips").select("*, staff_profiles(name)").eq("id", payslipId).maybeSingle();
  if (!p) return { ok: false, error: "明細が見つかりませんでした。" };

  const staffName = (p as unknown as { staff_profiles: { name: string } | null }).staff_profiles?.name ?? "(不明)";
  return { ok: true, data: formatPayslipText(staffName, p as StaffPayslip) };
}

// レッスンの単価ルールを、税理士向け出力の列見出しとして使える形にする(単価はスタッフごとに
// 微妙に違うことがあるため、見出しには含めず、人数区分・時間・レッスン名だけで揃える)。
// 人数で単価が変わるルールは「{時間}分{人数区分}」、そうでない(本数だけで決まる)ルールは
// レッスン名をそのまま使う(例:「ティシュー」)。
function ruleColumnKey(rule: PayRateRule): string {
  const duration = rule.duration_minutes ? `${rule.duration_minutes}分` : "";
  if (rule.min_headcount !== null || rule.max_headcount !== null) {
    let tier: string;
    if (rule.min_headcount !== null && rule.max_headcount !== null) {
      tier = rule.min_headcount === rule.max_headcount ? `${rule.min_headcount}人` : `${rule.min_headcount}〜${rule.max_headcount}人`;
    } else if (rule.min_headcount !== null) {
      tier = `${rule.min_headcount}人以上`;
    } else {
      tier = `${rule.max_headcount}人以下`;
    }
    return `${duration}${tier}`;
  }
  return rule.lesson_name ?? "その他";
}

// 人数区分の列は時間・人数の小さい順、本数だけで決まるレッスン名の列は最後にまとめて
// 並べる(全スタッフ共通の列順にすることで、SUM関数で列ごとの合計が取れるようにする)。
function columnSortKey(key: string): [number, number, string] {
  const durationMatch = key.match(/^(\d+)分/);
  const headcountMatch = key.match(/(\d+)人/);
  const duration = durationMatch ? Number(durationMatch[1]) : 0;
  const headcount = headcountMatch ? Number(headcountMatch[1]) : 999;
  return [duration, headcount, key];
}

// Excel列番号(1始まり)をA1形式の列文字に変換する(例: 1→A, 27→AA)。
function colLetter(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const rem = (x - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

// 税理士など外部への共有用に、対象月の全スタッフ分の明細をExcelファイル(.xlsx)でまとめる
// (メール送信はドメイン未設定のため使えないので、管理者がダウンロードしていつも通りのメール/LINEで
// 送る想定)。これまで手作業でExcelに1人ずつ「見出し行・金額行・時間(回数)行」のブロックを
// 積み重ねていた形式(表記ゆれのある単価ルール名ではなく、人数区分だけで揃えたもの)を、
// そのまま自動生成する。
export async function exportPayrollXlsx(periodStart: string): Promise<ActionResult<string>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return adminCheck;

  const admin = createAdminClient();
  const { data: payslips } = await admin
    .from("staff_payslips")
    .select("*, staff_profiles(name, commute_type, commute_amount)")
    .eq("period_start", periodStart)
    .order("staff_id");

  const rulesByStaff = await getPayRateRulesByStaff();
  const parsed = (payslips ?? []).map((p) => {
    const profile = (p as unknown as { staff_profiles: { name: string; commute_type: string; commute_amount: number } | null })
      .staff_profiles;
    return {
      p,
      name: profile?.name ?? "",
      breakdown: p.breakdown as PayrollBreakdown,
      // 通勤費は合計額だけでなく、見出しに単価(1日あたり、または固定額)も出す。
      commuteLabel: profile?.commute_type === "per_day" ? `@${(profile.commute_amount ?? 0).toLocaleString()}` : "(固定)",
    };
  });

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const YELLOW: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
  const LIGHT_YELLOW: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFCC" } };
  const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
  // 「◯月分」は開始月で呼ぶ(例: 8/16〜9/15の期間は「8月分」)。
  const [yearStr, monthStr] = periodStart.split("-");
  const monthLabel = `${Number(monthStr)}月分`;

  // --- 受付(時給)シート: 元のExcelと同じ列構成(支給額計/通勤費/総支給額/非課税通勤/
  // 課税対象額/所得税/住民税/控除計/差引支給額/出勤日数)にし、実際の計算式を入れる。
  // Le lien / むすひの2区分は表記ゆれが出ないよう固定列にする。
  const hourlySheet = workbook.addWorksheet("給料(受付)");
  for (let i = 1; i <= 17; i++) hourlySheet.getColumn(i).width = 13;

  const hourlyFirstRow = hourlySheet.rowCount + 1;
  let hourlyGrossTotal = 0;
  let hourlyCommuteTotal = 0;
  let hourlyTotalGrossTotal = 0;
  let hourlyTaxableTotal = 0;
  let hourlyIncomeTaxTotal = 0;
  let hourlyResidentTaxTotal = 0;
  let hourlyDeductionTotal = 0;
  let hourlyNetTotal = 0;

  for (const { p, name, breakdown, commuteLabel } of parsed) {
    const leLienHourly = breakdown.lines.filter((l) => l.unitType === "hourly" && isLeLienCategoryName(l.name));
    const musuhiHourly = breakdown.lines.filter((l) => l.unitType === "hourly" && !isLeLienCategoryName(l.name));
    if (leLienHourly.length === 0 && musuhiHourly.length === 0) continue;

    const leLienHours = leLienHourly.reduce((sum, l) => sum + l.quantity, 0);
    const musuhiHours = musuhiHourly.reduce((sum, l) => sum + l.quantity, 0);
    const leLienRate = leLienHourly[0]?.rate ?? 0;
    const musuhiRate = musuhiHourly[0]?.rate ?? 0;

    // 「給与」と「ル リアン」を1マスにまとめ、「むすひ」はむすひの時給列(F列)の
    // 真上に表示して、どちらの区分の列かひと目でわかるようにする。
    const titleRow = hourlySheet.addRow([`${yearStr}年`, monthLabel, "給与 ル リアン", "", "", "むすひ"]);
    const headerRow = hourlySheet.addRow([
      "パート",
      "",
      `時給 @${leLienRate.toLocaleString()}- 時間`,
      "",
      "",
      `時給¥${musuhiRate.toLocaleString()} 時間`,
      "支給額計",
      `通勤費 ${commuteLabel}`,
      "総支給額",
      "非課税通勤",
      "課税対象額",
      "所得税",
      "住民税",
      "控除計",
      "差引支給額",
      "出勤日数",
      "有給使用有給残",
    ]);
    const valueRowNum = headerRow.number + 1;
    const hoursRowNum = valueRowNum + 1;
    const valueRow = hourlySheet.addRow([
      name,
      "",
      // 時給×時間は端数(0.5時間分など)が出ることがあるため、アプリ本体の計算(四捨五入)と
      // 合わせてROUNDで丸める(税務上、金額は整数円である必要がある)。
      { formula: `ROUND(C${hoursRowNum}*${leLienRate},0)`, result: Math.round(leLienHours * leLienRate) },
      "",
      "",
      { formula: `ROUND(F${hoursRowNum}*${musuhiRate},0)`, result: Math.round(musuhiHours * musuhiRate) },
      { formula: `C${valueRowNum}+F${valueRowNum}`, result: p.gross_amount }, // 支給額計
      p.commute_allowance, // 通勤費
      { formula: `G${valueRowNum}+H${valueRowNum}`, result: p.total_gross }, // 総支給額
      { formula: `H${valueRowNum}`, result: p.commute_allowance }, // 非課税通勤(通勤費と同額)
      { formula: `G${valueRowNum}`, result: p.taxable_amount }, // 課税対象額(通勤費を除く)
      p.income_tax, // 所得税(税額表に基づく計算結果。元のExcelもここは数式なしの手入力箇所)
      p.resident_tax, // 住民税
      { formula: `L${valueRowNum}+M${valueRowNum}`, result: p.income_tax + p.resident_tax }, // 控除計
      { formula: `I${valueRowNum}-N${valueRowNum}`, result: p.net_amount }, // 差引支給額
      p.days_worked,
    ]);
    const hoursRow = hourlySheet.addRow(["", "", leLienHours, "", "", musuhiHours]);
    hourlySheet.addRow([]);

    for (const row of [titleRow, headerRow, valueRow, hoursRow]) {
      for (let col = 1; col <= 17; col++) row.getCell(col).border = THIN_BORDER;
    }
    for (const col of [9, 11, 15]) {
      headerRow.getCell(col).fill = YELLOW;
      valueRow.getCell(col).fill = YELLOW;
    }
    for (const col of [3, 6]) {
      valueRow.getCell(col).fill = LIGHT_YELLOW;
      hoursRow.getCell(col).fill = LIGHT_YELLOW;
    }

    hourlyGrossTotal += p.gross_amount;
    hourlyCommuteTotal += p.commute_allowance;
    hourlyTotalGrossTotal += p.total_gross;
    hourlyTaxableTotal += p.taxable_amount;
    hourlyIncomeTaxTotal += p.income_tax;
    hourlyResidentTaxTotal += p.resident_tax;
    hourlyDeductionTotal += p.income_tax + p.resident_tax;
    hourlyNetTotal += p.net_amount;
  }

  const hourlyLastRow = hourlySheet.rowCount;
  if (hourlyLastRow >= hourlyFirstRow) {
    const r = (col: string) => `${col}${hourlyFirstRow}:${col}${hourlyLastRow}`;
    const totalRow = hourlySheet.addRow([
      "合計",
      "",
      "",
      "",
      "",
      "",
      { formula: `SUM(${r("G")})`, result: hourlyGrossTotal },
      { formula: `SUM(${r("H")})`, result: hourlyCommuteTotal },
      { formula: `SUM(${r("I")})`, result: hourlyTotalGrossTotal },
      { formula: `SUM(${r("J")})`, result: hourlyCommuteTotal },
      { formula: `SUM(${r("K")})`, result: hourlyTaxableTotal },
      { formula: `SUM(${r("L")})`, result: hourlyIncomeTaxTotal },
      { formula: `SUM(${r("M")})`, result: hourlyResidentTaxTotal },
      { formula: `SUM(${r("N")})`, result: hourlyDeductionTotal },
      { formula: `SUM(${r("O")})`, result: hourlyNetTotal },
    ]);
    for (let col = 1; col <= 15; col++) totalRow.getCell(col).font = { bold: true };
  }

  // --- 業務委託(レッスン)シート: 全スタッフ共通の列(人数区分・レッスン名)を使い、
  // 列ごとの合計もSUM関数で出せるようにする。 ---
  const lessonSheet = workbook.addWorksheet("業務委託(レッスン)");

  // 事前に全スタッフのレッスンを単価ルールごとに集計し、共通の列一覧を作る。
  const lessonAggByStaff = new Map<
    string,
    { byKey: Map<string, { rate: number; count: number; amount: number }>; unmatchedCount: number; unmatchedAmount: number }
  >();
  const globalLessonKeys = new Set<string>();
  for (const { p, breakdown } of parsed) {
    if (breakdown.lessonLines.length === 0) continue;
    const rules = rulesByStaff[p.staff_id] ?? [];
    const byKey = new Map<string, { rate: number; count: number; amount: number }>();
    let unmatchedCount = 0;
    let unmatchedAmount = 0;
    for (const l of breakdown.lessonLines) {
      const matched = matchPayRateRule(rules, { lessonName: l.lessonName, durationMinutes: l.durationMinutes, headcount: l.headcount });
      if (!matched) {
        unmatchedCount += 1;
        unmatchedAmount += l.rate;
        continue;
      }
      // 表示ラベルが同じになるルール(例:「ハンモック」と「フロアクラス」がどちらも
      // 60分1〜3人)は、別のルールIDでも同じ列にまとめる(レッスン名では分けない)。
      const key = ruleColumnKey(matched);
      globalLessonKeys.add(key);
      const cur = byKey.get(key) ?? { rate: matched.rate, count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += l.rate;
      byKey.set(key, cur);
    }
    lessonAggByStaff.set(p.staff_id, { byKey, unmatchedCount, unmatchedAmount });
  }
  const lessonColumnKeys = Array.from(globalLessonKeys).sort((a, b) => {
    const ka = columnSortKey(a);
    const kb = columnSortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
  });
  const n = lessonColumnKeys.length;
  // 列位置: 1=業務委託/氏名, 2=空欄, 3..(2+n)=人数区分・レッスン名, (3+n)=該当ルールなし,
  // (4+n)=支給額計, (5+n)=通勤費, (6+n)=総支給額, (7+n)=課税対象額, (8+n)=所得税,
  // (9+n)=住民税, (10+n)=差引支給額, (11+n)=出勤日数。
  const unmatchedCol = 3 + n;
  const grossCol = 4 + n;
  const commuteCol = 5 + n;
  const totalGrossCol = 6 + n;
  const taxableCol = 7 + n;
  const incomeTaxCol = 8 + n;
  const residentTaxCol = 9 + n;
  const netCol = 10 + n;
  const daysCol = 11 + n;
  for (let i = 1; i <= daysCol; i++) lessonSheet.getColumn(i).width = 13;

  const lessonFirstRow = lessonSheet.rowCount + 1;
  const lessonColumnTotals = new Array<number>(n).fill(0);
  let lessonUnmatchedTotal = 0;
  let lessonGrossTotal = 0;
  let lessonCommuteTotal = 0;
  let lessonTotalGrossTotal = 0;
  let lessonTaxableTotal = 0;
  let lessonIncomeTaxTotal = 0;
  let lessonResidentTaxTotal = 0;
  let lessonNetTotal = 0;

  for (const { p, name, commuteLabel, breakdown } of parsed) {
    // 受付とレッスンで明細が2枚に分かれているスタッフは、レッスン側の明細(breakdown.lessonLines
    // が入っている方)だけを使う。staff_idだけで判定すると、受付側の明細でも同じ集計結果が
    // 見つかってしまい、同じ人が2回出てきてしまうため。
    if (breakdown.lessonLines.length === 0) continue;
    const agg = lessonAggByStaff.get(p.staff_id);
    if (!agg) continue;

    const titleRow = lessonSheet.addRow([`${yearStr}年`, "", monthLabel, "給与"]);
    // 列の位置は全スタッフ共通だが、見出しの単価はこの人の実際の単価ルールを反映する
    // (税理士が検算できるよう、単価そのものが見えている必要があるため)。
    const headerCells: (string | number)[] = [
      "業務委託",
      "",
      ...lessonColumnKeys.map((key) => {
        const entry = agg.byKey.get(key);
        return entry ? `${key} @${entry.rate.toLocaleString()}-` : key;
      }),
      "該当ルールなし",
    ];
    headerCells.push("支給額計", `通勤費 ${commuteLabel}`, "総支給額", "課税対象額", "所得税", "住民税", "差引支給額", "出勤日数");
    const headerRow = lessonSheet.addRow(headerCells);

    const valueRowNum = headerRow.number + 1;
    const countRowNum = valueRowNum + 1;

    const valueCells: (string | number | { formula: string; result: number })[] = [name, ""];
    const countCells: (string | number)[] = ["", "回数"];
    for (let i = 0; i < n; i++) {
      const col = 3 + i;
      const letter = colLetter(col);
      const entry = agg.byKey.get(lessonColumnKeys[i]);
      if (entry) {
        valueCells.push({ formula: `${letter}${countRowNum}*${entry.rate}`, result: entry.amount });
        countCells.push(entry.count);
        lessonColumnTotals[i] += entry.amount;
      } else {
        valueCells.push(0);
        countCells.push(0);
      }
    }
    valueCells.push(agg.unmatchedAmount);
    countCells.push(agg.unmatchedCount);
    lessonUnmatchedTotal += agg.unmatchedAmount;

    const sumRange = `${colLetter(3)}${valueRowNum}:${colLetter(unmatchedCol)}${valueRowNum}`;
    valueCells.push(
      { formula: `SUM(${sumRange})`, result: p.gross_amount }, // 支給額計
      p.commute_allowance, // 通勤費
      { formula: `${colLetter(grossCol)}${valueRowNum}+${colLetter(commuteCol)}${valueRowNum}`, result: p.total_gross }, // 総支給額
      { formula: `${colLetter(totalGrossCol)}${valueRowNum}`, result: p.taxable_amount }, // 課税対象額(通勤費含む)
      {
        formula: `ROUNDDOWN(${colLetter(taxableCol)}${valueRowNum}*0.1021,0)`,
        result: p.income_tax,
      }, // 所得税
      p.resident_tax, // 住民税
      {
        formula: `${colLetter(taxableCol)}${valueRowNum}-${colLetter(incomeTaxCol)}${valueRowNum}-${colLetter(residentTaxCol)}${valueRowNum}`,
        result: p.net_amount,
      }, // 差引支給額
      p.days_worked,
    );
    const valueRow = lessonSheet.addRow(valueCells);
    const countRow = lessonSheet.addRow(countCells);
    lessonSheet.addRow([]);

    for (const col of [totalGrossCol, taxableCol, netCol]) {
      headerRow.getCell(col).fill = YELLOW;
      valueRow.getCell(col).fill = YELLOW;
    }
    for (const row of [titleRow, headerRow, valueRow, countRow]) {
      for (let col = 1; col <= daysCol; col++) row.getCell(col).border = THIN_BORDER;
    }

    lessonGrossTotal += p.gross_amount;
    lessonCommuteTotal += p.commute_allowance;
    lessonTotalGrossTotal += p.total_gross;
    lessonTaxableTotal += p.taxable_amount;
    lessonIncomeTaxTotal += p.income_tax;
    lessonResidentTaxTotal += p.resident_tax;
    lessonNetTotal += p.net_amount;
  }

  const lessonLastRow = lessonSheet.rowCount;
  if (lessonLastRow >= lessonFirstRow) {
    const totalCells: (string | number | { formula: string; result: number })[] = ["合計", ""];
    for (let i = 0; i < n; i++) {
      const letter = colLetter(3 + i);
      totalCells.push({ formula: `SUM(${letter}${lessonFirstRow}:${letter}${lessonLastRow})`, result: lessonColumnTotals[i] });
    }
    const summaryTotals: Record<number, number> = {
      [unmatchedCol]: lessonUnmatchedTotal,
      [grossCol]: lessonGrossTotal,
      [commuteCol]: lessonCommuteTotal,
      [totalGrossCol]: lessonTotalGrossTotal,
      [taxableCol]: lessonTaxableTotal,
      [incomeTaxCol]: lessonIncomeTaxTotal,
      [residentTaxCol]: lessonResidentTaxTotal,
      [netCol]: lessonNetTotal,
    };
    for (const col of [unmatchedCol, grossCol, commuteCol, totalGrossCol, taxableCol, incomeTaxCol, residentTaxCol, netCol]) {
      const letter = colLetter(col);
      totalCells.push({ formula: `SUM(${letter}${lessonFirstRow}:${letter}${lessonLastRow})`, result: summaryTotals[col] });
    }
    const totalRow = lessonSheet.addRow(totalCells);
    for (let col = 1; col <= daysCol; col++) totalRow.getCell(col).font = { bold: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return { ok: true, data: Buffer.from(buffer).toString("base64") };
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

// スケジュールを組み立てている時点で、おおよその人件費を確認できるようにする
// (全スタッフ分の単価ルールをまとめて返す。実績はまだ無いため、実際の人数・分数は使えない)。
export async function getPayRateRulesByStaff(): Promise<Record<string, PayRateRule[]>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return {};

  const admin = createAdminClient();
  const { data } = await admin.from("pay_rate_rules").select("*").order("sort_order", { ascending: true });

  const map: Record<string, PayRateRule[]> = {};
  for (const row of (data ?? []) as PayRateRule[]) {
    (map[row.staff_id] ??= []).push(row);
  }
  return map;
}

// スケジュールの受付時間から人件費を見積もれるように、スタッフごとの「Le lien」時給を返す。
export async function getLeLienHourlyRateByStaff(): Promise<Record<string, number>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return {};

  const admin = createAdminClient();
  const { data } = await admin.from("pay_categories").select("staff_id, name, rate, unit_type").eq("unit_type", "hourly");

  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    if (isLeLienCategoryName(row.name)) map[row.staff_id] = row.rate;
  }
  return map;
}

// むすひスケジュールの受付時間からも人件費を見積もれるように、スタッフごとの「むすひ」時給を返す。
export async function getMusuhiHourlyRateByStaff(): Promise<Record<string, number>> {
  const adminCheck = await requireAdmin();
  if (adminCheck) return {};

  const admin = createAdminClient();
  const { data } = await admin.from("pay_categories").select("staff_id, name, rate, unit_type").eq("unit_type", "hourly");

  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.name.trim().includes("むすひ")) map[row.staff_id] = row.rate;
  }
  return map;
}
