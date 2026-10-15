"use client";

import { useState } from "react";
import { currentPayPeriod } from "@/lib/date";
import PayrollReviewPanel from "@/components/staff/PayrollReviewPanel";
import PayrollExportPanel from "@/components/staff/PayrollExportPanel";

// 対象期間を1つにそろえ、「スタッフごとの確認・確定」と「全員分の確認・Excel出力」で共有する。
export default function PayrollWorkspace() {
  const [periodStart, setPeriodStart] = useState(currentPayPeriod().periodStart);

  return (
    <div className="flex flex-col gap-6">
      <label className="flex flex-col gap-1 text-sm">
        対象期間の開始日(16日で締め)
        <input
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          className="w-48 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>
      <PayrollReviewPanel key={`review-${periodStart}`} periodStart={periodStart} />
      <PayrollExportPanel key={`export-${periodStart}`} periodStart={periodStart} />
    </div>
  );
}
