"use client";

import { useState } from "react";
import { exportPayrollCsv, getPayslipTextSummaries, type PayslipTextSummary } from "@/lib/payroll";
import { currentPayPeriod } from "@/lib/date";

export default function PayrollExportPanel() {
  const [periodStart, setPeriodStart] = useState(currentPayPeriod().periodStart);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [summaries, setSummaries] = useState<PayslipTextSummary[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  async function handleShowSummaries() {
    setLoadingSummaries(true);
    setError(null);
    const data = await getPayslipTextSummaries(periodStart);
    setLoadingSummaries(false);
    setSummaries(data);
  }

  async function handleCopy(summary: PayslipTextSummary) {
    try {
      await navigator.clipboard.writeText(summary.text);
      setCopiedId(summary.payslipId);
      setTimeout(() => setCopiedId((cur) => (cur === summary.payslipId ? null : cur)), 2000);
    } catch {
      setError("コピーに失敗しました。");
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <label className="flex flex-col gap-1 text-sm">
        対象期間の開始日(16日で締め)
        <input
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {downloading ? "作成中..." : "CSVダウンロード(税理士さん用)"}
        </button>
        <button
          onClick={handleShowSummaries}
          disabled={loadingSummaries}
          className="self-start rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          {loadingSummaries ? "読込中..." : "1人ずつ確認してコピー"}
        </button>
      </div>

      {summaries && (
        <div className="flex flex-col gap-3 border-t border-neutral-100 pt-4 dark:border-neutral-900">
          {summaries.length === 0 ? (
            <p className="text-sm text-neutral-400">この期間の明細はまだ作成されていません。</p>
          ) : (
            summaries.map((s) => (
              <div key={s.payslipId} className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{s.staffName}</span>
                  <span className="text-xs text-neutral-400">{s.sentAt ? "メール送信済み" : "メール未送信"}</span>
                  <button
                    onClick={() => handleCopy(s)}
                    className="rounded-lg border border-neutral-300 px-3 py-1 text-xs dark:border-neutral-700"
                  >
                    {copiedId === s.payslipId ? "コピーしました" : "コピーする"}
                  </button>
                </div>
                <pre className="whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs dark:bg-neutral-900">{s.text}</pre>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
