export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

// スタジオで開催しているレッスンの名前一覧(レッスン実績入力のプルダウンに使う)。
export const LESSON_NAMES = ["フロアクラス", "ハンモック", "ティシュー", "75分クラス"] as const;

// 給与明細に記録する、その月の収入内訳の分類(税計算方法は収入の出どころ(区分 or レッスン実績)によって
// 自動で決まるため、スタッフ本人の設定項目ではない。record-keeping用の表示ラベル)。
export type EmploymentType = "hourly" | "contract" | "mixed";

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  hourly: "時給制",
  contract: "業務委託",
  mixed: "時給+業務委託",
};

export interface StaffProfile {
  id: string;
  name: string;
  role: string; // 'staff' | 'admin'
  phone: string | null;
  contact_email: string | null;
  address: string | null;
  is_active: boolean;
  dependent_count: number;
  has_spouse_deduction: boolean;
  commute_type: CommuteType;
  commute_amount: number;
  created_at: string;
}

export type CommuteType = "none" | "fixed" | "per_day";

export const COMMUTE_TYPE_LABEL: Record<CommuteType, string> = {
  none: "都度手入力",
  fixed: "定額(毎月同じ金額)",
  per_day: "1日あたり(出勤日数×単価)",
};

export type PayUnitType = "hourly" | "per_lesson";

export const PAY_UNIT_LABEL: Record<PayUnitType, string> = {
  hourly: "時間あたり",
  per_lesson: "1回あたり",
};

export interface PayCategory {
  id: string;
  staff_id: string;
  name: string;
  unit_type: PayUnitType;
  rate: number;
  sort_order: number;
  is_active: boolean;
}

export interface PayEntry {
  id: string;
  staff_id: string;
  pay_category_id: string;
  period_start: string; // "YYYY-MM-DD" (締め期間の開始日。16日で固定)
  quantity: number;
  note: string | null;
}

export interface TimeLogEntry {
  id: string;
  staff_id: string;
  pay_category_id: string;
  entry_date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:MM:SS"
  end_time: string;
  break_start: string | null;
  break_end: string | null;
  note: string | null;
}

export interface PayrollBreakdownLine {
  payCategoryId: string;
  name: string;
  unitType: PayUnitType;
  rate: number;
  quantity: number;
  subtotal: number;
}

export interface PayRateRule {
  id: string;
  staff_id: string;
  label: string;
  lesson_name: string | null;
  duration_minutes: number | null;
  min_headcount: number | null;
  max_headcount: number | null;
  rate: number;
  sort_order: number;
}

export interface LessonLogEntry {
  id: string;
  staff_id: string;
  entry_date: string; // "YYYY-MM-DD"
  lesson_name: string;
  duration_minutes: number;
  headcount: number;
  note: string | null;
  approved: boolean;
}

export interface PayrollBreakdownLessonLine {
  entryId: string;
  date: string;
  lessonName: string;
  durationMinutes: number;
  headcount: number;
  matchedRuleLabel: string | null; // 管理者向け。該当ルールが見つからなければnull(単価0扱い)
  rate: number;
}

export interface PayrollBreakdown {
  lines: PayrollBreakdownLine[];
  lessonLines: PayrollBreakdownLessonLine[];
}

export interface StaffPayslip {
  id: string;
  staff_id: string;
  period_start: string;
  period_end: string;
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
  generated_at: string;
  sent_at: string | null;
  sent_to_email: string | null;
}
