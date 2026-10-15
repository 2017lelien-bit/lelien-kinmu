"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/auth";
import { computeWorkedMinutes } from "@/lib/date";
import { computeCategoryMinutesByDate } from "@/lib/time-log";

export interface ReviewLesson {
  id: string;
  date: string;
  startTime: string | null;
  lessonName: string;
  durationMinutes: number;
  headcount: number;
  approved: boolean;
}

export interface ReviewShift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  workedMinutes: number;
}

export interface ReviewCategory {
  categoryId: string;
  categoryName: string;
  shifts: ReviewShift[];
  workedMinutes: number;
  // レッスンと時間が重なった分の差し引き(Le lien区分のみ)。差し引き後が実際に給与へ反映される時間。
  deductionMinutes: number;
  countedMinutes: number;
  // 日付ごとの差し引き分(分)。
  deductionByDate: Record<string, number>;
}

export interface PeriodReview {
  lessons: ReviewLesson[];
  categories: ReviewCategory[];
}

// スタッフ本人が、今期の自分の入力に間違いがないか確認するための一覧。
// 単価・金額は含めない(スタッフには見せない方針のため)。承認済みのレッスンも含める。
export async function getOwnPeriodReview(periodStart: string, periodEnd: string): Promise<PeriodReview> {
  // 確認用の補助表示のため、何かあっても、マイページ全体が開けなくならないようにする。
  try {
    return await buildPeriodReview(periodStart, periodEnd);
  } catch (e) {
    console.error("[getOwnPeriodReview] failed", e);
    return { lessons: [], categories: [] };
  }
}

async function buildPeriodReview(periodStart: string, periodEnd: string): Promise<PeriodReview> {
  const staff = await getStaffUser();
  if (!staff) return { lessons: [], categories: [] };

  const admin = createAdminClient();
  const [{ data: lessons }, { data: categories }, { data: timeEntries }] = await Promise.all([
    admin
      .from("lesson_log_entries")
      .select("id, entry_date, start_time, lesson_name, duration_minutes, headcount, approved")
      .eq("staff_id", staff.id)
      .gte("entry_date", periodStart)
      .lte("entry_date", periodEnd)
      .order("entry_date", { ascending: true })
      .order("start_time", { ascending: true }),
    admin
      .from("pay_categories")
      .select("id, name")
      .eq("staff_id", staff.id)
      .eq("unit_type", "hourly")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    admin
      .from("time_log_entries")
      .select("id, pay_category_id, entry_date, start_time, end_time, break_start, break_end")
      .eq("staff_id", staff.id)
      .gte("entry_date", periodStart)
      .lte("entry_date", periodEnd)
      .order("entry_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  const reviewCategories: ReviewCategory[] = [];
  for (const c of categories ?? []) {
    const shifts: ReviewShift[] = (timeEntries ?? [])
      .filter((e) => e.pay_category_id === c.id)
      .map((e) => ({
        id: e.id,
        date: e.entry_date,
        startTime: e.start_time,
        endTime: e.end_time,
        breakStart: e.break_start,
        breakEnd: e.break_end,
        workedMinutes: computeWorkedMinutes({
          startTime: e.start_time,
          endTime: e.end_time,
          breakStart: e.break_start,
          breakEnd: e.break_end,
        }),
      }));
    if (shifts.length === 0) continue;

    const workedMinutes = shifts.reduce((sum, s) => sum + s.workedMinutes, 0);
    const grossByDate = new Map<string, number>();
    for (const s of shifts) grossByDate.set(s.date, (grossByDate.get(s.date) ?? 0) + s.workedMinutes);
    const netByDate = await computeCategoryMinutesByDate(admin, staff.id, c.id, periodStart, periodEnd);

    const deductionByDate: Record<string, number> = {};
    let countedMinutes = 0;
    for (const [date, gross] of grossByDate) {
      const net = netByDate.get(date) ?? gross;
      countedMinutes += net;
      if (gross - net > 0) deductionByDate[date] = gross - net;
    }

    reviewCategories.push({
      categoryId: c.id,
      categoryName: c.name,
      shifts,
      workedMinutes,
      deductionMinutes: workedMinutes - countedMinutes,
      countedMinutes,
      deductionByDate,
    });
  }

  return {
    lessons: (lessons ?? []).map((l) => ({
      id: l.id,
      date: l.entry_date,
      startTime: l.start_time,
      lessonName: l.lesson_name,
      durationMinutes: l.duration_minutes,
      headcount: l.headcount,
      approved: l.approved,
    })),
    categories: reviewCategories,
  };
}
