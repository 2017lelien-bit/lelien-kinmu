"use client";

import { useState } from "react";
import { currentPayPeriod, payPeriodForDate } from "@/lib/date";
import PayrollReviewPanel from "@/components/staff/PayrollReviewPanel";
import PayrollExportPanel from "@/components/staff/PayrollExportPanel";

// 対象期間を1つにそろえ、「スタッフごとの確認・確定」と「全員分の確認・Excel出力」で共有する。
export default function PayrollWorkspace() {
  const [selectedDate, setPeriodStart] = useState(currentPayPeriod().periodStart);
  // どの日付を選んでも、その日を含む16日締めの期間(16日〜翌月15日)として扱う(15日を選んでも前の期間になる)。
  const period = selectedDate ? payPeriodForDate(selectedDate) : currentPayPeriod();
  const periodStart = period.periodStart;

  return (
    <div className="flex flex-col gap-6">
      <label className="flex flex-col gap-1 text-sm">
        対象期間の日付(15日締め。その日を含む期間になります)
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setPeriodStart(e.target.value)}
          className="w-48 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
        <span className="text-xs text-neutral-500">
          対象期間: {period.periodStart}〜{period.periodEnd}
        </span>
      </label>
      <PayrollReviewPanel key={`review-${periodStart}`} periodStart={periodStart} />
      <PayrollExportPanel key={`export-${periodStart}`} periodStart={periodStart} />
    </div>
  );
}
