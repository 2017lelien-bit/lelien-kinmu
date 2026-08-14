"use client";

import { useState } from "react";
import { exportPayrollCsv } from "@/lib/payroll";
import { todayJstDateString } from "@/lib/date";

function currentMonthStart(): string {
  const [y, m] = todayJstDateString().split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export default function PayrollExportPanel() {
  const [periodStart, setPeriodStart] = useState(currentMonthStart());
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    const result = await exportPayrollCsv(periodStart);
    setDownloading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const blob = new Blob([result.data], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `給与データ_${periodStart.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <label className="flex flex-col gap-1 text-sm">
        対象月(1日)
        <input
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>

      <button
        onClick={handleDownload}
        disabled={downloading}
        className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {downloading ? "作成中..." : "CSVダウンロード"}
      </button>
    </div>
  );
}
