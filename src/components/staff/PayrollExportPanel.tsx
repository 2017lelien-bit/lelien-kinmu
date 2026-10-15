"use client";

import { useState } from "react";
import {
  exportPayrollXlsx,
  getPayrollPreview,
  getPayslipTextSummaries,
  type PayrollPreview,
  type PayrollPreviewTotals,
  type PayslipTextSummary,
} from "@/lib/payroll";

export default function PayrollExportPanel({ periodStart }: { periodStart: string }) {
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [summaries, setSummaries] = useState<PayslipTextSummary[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<PayrollPreview | null>(null);

  async function handleShowPreview() {
    setLoadingPreview(true);
    setError(null);
    setPreview(null);
    const result = await getPayrollPreview(periodStart);
    setLoadingPreview(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview(result.data);
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    const result = await exportPayrollXlsx(periodStart);
    setDownloading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    // base64文字列をバイナリに戻してExcelファイルとしてダウンロードする。
    const binary = atob(result.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `給与データ_${periodStart.slice(0, 7)}.xlsx`;
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
      <h2 className="text-sm font-semibold">② 全員分の確認とExcel出力</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}


      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleShowPreview}
          disabled={loadingPreview}
          className="self-start rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          {loadingPreview ? "読込中..." : "内容を画面で確認する"}
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {downloading ? "作成中..." : "Excelダウンロード(税理士さん用)"}
        </button>
        <button
          onClick={handleShowSummaries}
          disabled={loadingSummaries}
          className="self-start rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          {loadingSummaries ? "読込中..." : "1人ずつ確認してコピー"}
        </button>
      </div>

      {preview && <PreviewTables preview={preview} periodStart={periodStart} />}

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

const yen = (n: number) => `¥${n.toLocaleString()}`;

function sumTotals(rows: PayrollPreviewTotals[]): PayrollPreviewTotals {
  return rows.reduce(
    (acc, r) => ({
      gross: acc.gross + r.gross,
      commute: acc.commute + r.commute,
      totalGross: acc.totalGross + r.totalGross,
      taxable: acc.taxable + r.taxable,
      incomeTax: acc.incomeTax + r.incomeTax,
      residentTax: acc.residentTax + r.residentTax,
      net: acc.net + r.net,
    }),
    { gross: 0, commute: 0, totalGross: 0, taxable: 0, incomeTax: 0, residentTax: 0, net: 0 },
  );
}

const TOTAL_HEADERS = ["支給額計", "通勤費", "総支給額", "課税対象額", "所得税", "住民税", "差引支給額", "出勤日数"];

function totalCells(t: PayrollPreviewTotals, days: number | null) {
  return (
    <>
      <td className="px-2 py-1 text-right">{yen(t.gross)}</td>
      <td className="px-2 py-1 text-right">{yen(t.commute)}</td>
      <td className="bg-yellow-50 px-2 py-1 text-right font-semibold dark:bg-yellow-950">{yen(t.totalGross)}</td>
      <td className="bg-yellow-50 px-2 py-1 text-right font-semibold dark:bg-yellow-950">{yen(t.taxable)}</td>
      <td className="px-2 py-1 text-right">{yen(t.incomeTax)}</td>
      <td className="px-2 py-1 text-right">{yen(t.residentTax)}</td>
      <td className="bg-yellow-50 px-2 py-1 text-right font-semibold dark:bg-yellow-950">{yen(t.net)}</td>
      <td className="px-2 py-1 text-right">{days === null ? "" : `${days}日`}</td>
    </>
  );
}

function PreviewTables({ preview, periodStart }: { preview: PayrollPreview; periodStart: string }) {
  const hourlyTotals = sumTotals(preview.hourly);
  const lessonTotals = sumTotals(preview.lesson);
  const headClass = "whitespace-nowrap border-b border-neutral-300 px-2 py-1 text-left text-xs font-semibold dark:border-neutral-700";
  const rowClass = "border-b border-neutral-100 align-top dark:border-neutral-900";

  return (
    <div className="flex flex-col gap-6 border-t border-neutral-100 pt-4 dark:border-neutral-900">
      <p className="text-sm font-semibold">
        {Number(periodStart.slice(5, 7))}月分(開始日 {periodStart})の給与データ(Excelと同じ内容)
      </p>

      {preview.missing.length > 0 && (
        <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          ⚠️ この期間に出退勤・レッスンの記録があるのに、給与明細がまだ作られていない人がいます: {preview.missing.join("、")}
          (各スタッフのページで「この内容で明細を作成する」を押すと、ここに入ります)
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">受付(時給)</h3>
        {preview.hourly.length === 0 ? (
          <p className="text-sm text-neutral-400">この期間の受付の明細はありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr>
                  <th className={headClass}>氏名</th>
                  <th className={headClass}>Le lien(時間×時給)</th>
                  <th className={headClass}>むすひ(時間×時給)</th>
                  {TOTAL_HEADERS.map((h) => (
                    <th key={h} className={`${headClass} text-right`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.hourly.map((r) => (
                  <tr key={r.payslipId} className={rowClass}>
                    <td className="whitespace-nowrap px-2 py-1 font-semibold">{r.staffName}</td>
                    <td className="px-2 py-1">{r.leLien ?? "-"}</td>
                    <td className="px-2 py-1">{r.musuhi ?? "-"}</td>
                    {totalCells(r, r.days)}
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-2 py-1">合計</td>
                  <td />
                  <td />
                  {totalCells(hourlyTotals, null)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">業務委託(レッスン)</h3>
        {preview.lesson.length === 0 ? (
          <p className="text-sm text-neutral-400">この期間のレッスンの明細はありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr>
                  <th className={headClass}>氏名</th>
                  <th className={headClass}>レッスン(区分 @単価 × 本数)</th>
                  {TOTAL_HEADERS.map((h) => (
                    <th key={h} className={`${headClass} text-right`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.lesson.map((r) => (
                  <tr key={r.payslipId} className={rowClass}>
                    <td className="whitespace-nowrap px-2 py-1 font-semibold">{r.staffName}</td>
                    <td className="px-2 py-1">
                      {r.items.map((item) => (
                        <div key={item} className="whitespace-nowrap">
                          {item}
                        </div>
                      ))}
                    </td>
                    {totalCells(r, r.days)}
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-2 py-1">合計</td>
                  <td />
                  {totalCells(lessonTotals, null)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-neutral-400">
        通勤費が「@単価/日」のスタッフは、出勤日数×単価です。内容に問題なければ、上の「Excelダウンロード(税理士さん用)」を押してください。
      </p>
    </div>
  );
}
