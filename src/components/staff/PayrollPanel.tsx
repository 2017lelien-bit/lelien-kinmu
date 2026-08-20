"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { calculatePayroll, deletePayslip, generatePayslip, sendPayslipEmail, type PayrollResult } from "@/lib/payroll";
import { currentPayPeriod } from "@/lib/date";
import type { CommuteType, StaffPayslip } from "@/lib/types";

export default function PayrollPanel({
  staffId,
  payslips,
  commuteType,
  commuteAmount,
}: {
  staffId: string;
  payslips: StaffPayslip[];
  commuteType: CommuteType;
  commuteAmount: number;
}) {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState(currentPayPeriod().periodStart);
  const [preview, setPreview] = useState<PayrollResult | null>(null);
  const [commuteAllowance, setCommuteAllowance] = useState(0);
  const [residentTax, setResidentTax] = useState(0);
  const [daysWorked, setDaysWorked] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCalculate() {
    setCalculating(true);
    setError(null);
    setPreview(null);
    const result = await calculatePayroll(staffId, periodStart);
    setCalculating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview(result.data);
    // 出退勤記録・レッスン実績から実際に働いた日数を自動で数え、通勤費もそこから自動計算する。
    // 手入力が必要な場合(実績を入力していない日も出勤扱いにしたい等)は、後から出勤日数欄を直せる。
    const autoDaysWorked = result.data.daysWorked;
    setDaysWorked(autoDaysWorked);
    if (commuteType === "fixed") setCommuteAllowance(commuteAmount);
    else if (commuteType === "per_day") setCommuteAllowance(commuteAmount * autoDaysWorked);
  }

  function handleDaysWorkedChange(value: number) {
    setDaysWorked(value);
    if (commuteType === "per_day") setCommuteAllowance(commuteAmount * value);
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    const result = await generatePayslip(staffId, periodStart, { commuteAllowance, residentTax, daysWorked });
    setCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview(null);
    router.refresh();
  }

  async function handleSend(payslipId: string) {
    setSendingId(payslipId);
    setError(null);
    const result = await sendPayslipEmail(payslipId);
    setSendingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete(payslipId: string) {
    setDeletingId(payslipId);
    setError(null);
    const result = await deletePayslip(payslipId);
    setDeletingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">給与計算</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          対象期間の開始日(16日で締め)
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
        <button
          onClick={handleCalculate}
          disabled={calculating}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          {calculating ? "計算中..." : "実績を計算する"}
        </button>
      </div>

      {preview && (
        <div className="flex flex-col gap-3 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900">
          {preview.breakdown.lines.length > 0 && (
            <ul className="text-sm">
              {preview.breakdown.lines.map((line) => (
                <li key={line.payCategoryId}>
                  {line.name}: {line.quantity}
                  {line.unitType === "hourly" ? "時間" : "回"} × ¥{line.rate.toLocaleString()} = ¥
                  {line.subtotal.toLocaleString()}
                </li>
              ))}
            </ul>
          )}
          {preview.breakdown.lessonLines.length > 0 && (
            <ul className="text-sm">
              {preview.breakdown.lessonLines.map((line) => (
                <li key={line.entryId}>
                  {line.date} {line.lessonName}({line.durationMinutes}分・{line.headcount}人) →
                  {line.matchedRuleLabel ? ` ${line.matchedRuleLabel}` : " 該当ルールなし"} = ¥
                  {line.rate.toLocaleString()}
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm font-semibold">支給額計: ¥{preview.grossAmount.toLocaleString()}</p>

          <div className="flex flex-wrap gap-3 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
            <label className="flex flex-col gap-1">
              通勤費
              <input
                type="number"
                min={0}
                value={commuteAllowance}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setCommuteAllowance(Number(e.target.value))}
                className="w-28 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
              />
            </label>
            <label className="flex flex-col gap-1">
              住民税
              <input
                type="number"
                min={0}
                value={residentTax}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setResidentTax(Number(e.target.value))}
                className="w-28 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
              />
            </label>
            <label className="flex flex-col gap-1">
              出勤日数(実績から自動計算・修正可)
              <input
                type="number"
                min={0}
                value={daysWorked}
                onFocus={(e) => e.target.select()}
                onChange={(e) => handleDaysWorkedChange(Number(e.target.value))}
                className="w-24 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
              />
            </label>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating}
            className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {creating ? "作成中..." : "この内容で明細を作成する"}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-900">
        <h3 className="text-sm font-semibold">明細履歴</h3>
        {payslips.length === 0 ? (
          <p className="text-sm text-neutral-400">作成された明細はありません。</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {payslips.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-2 dark:border-neutral-900">
                <span>
                  {p.period_start} 〜 {p.period_end}
                </span>
                <span>総支給額 ¥{p.total_gross.toLocaleString()}</span>
                <span>所得税 ¥{p.income_tax.toLocaleString()}</span>
                <span className="font-semibold">差引支給額 ¥{p.net_amount.toLocaleString()}</span>
                <span className="text-neutral-400">{p.sent_at ? `送信済み(${p.sent_to_email})` : "未送信"}</span>
                <button
                  onClick={() => handleSend(p.id)}
                  disabled={sendingId === p.id}
                  className="underline disabled:opacity-40"
                >
                  {sendingId === p.id ? "送信中..." : p.sent_at ? "再送信する" : "明細をメール送信する"}
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  disabled={deletingId === p.id}
                  className="text-red-600 underline disabled:opacity-40"
                >
                  {deletingId === p.id ? "削除中..." : "削除"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
