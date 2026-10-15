"use client";

import { useState } from "react";
import Link from "next/link";
import { deletePayslip, generatePayslip, getPayrollReviewList, type PayrollReviewItem } from "@/lib/payroll";

const yen = (n: number) => `¥${n.toLocaleString()}`;

function ReviewCard({
  item,
  periodStart,
  onChanged,
}: {
  item: PayrollReviewItem;
  periodStart: string;
  onChanged: () => void;
}) {
  const [commute, setCommute] = useState(item.defaultCommute);
  const [residentTax, setResidentTax] = useState(item.defaultResidentTax);
  const [days, setDays] = useState(item.daysWorked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const result = await generatePayslip(item.staffId, periodStart, {
      commuteAllowance: commute,
      residentTax,
      daysWorked: days,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChanged();
  }

  async function handleUndo() {
    if (!window.confirm(`${item.staffName}さんの確定済みの明細を取り消します(削除します)。よろしいですか?`)) return;
    setBusy(true);
    setError(null);
    for (const p of item.payslips) {
      const result = await deletePayslip(p.id);
      if (!result.ok) {
        setBusy(false);
        setError(result.error);
        return;
      }
    }
    setBusy(false);
    onChanged();
  }

  const created = item.status === "created";
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border p-3 ${
        created ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950" : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">{item.staffName}</span>
        <span className={`rounded px-2 py-0.5 text-xs ${created ? "bg-green-600 text-white" : "bg-amber-500 text-white"}`}>
          {created ? "確定済み" : "未確定"}
        </span>
        {item.unapprovedLessons > 0 && (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            未承認のレッスンが{item.unapprovedLessons}本あります
          </span>
        )}
        <Link href={`/staff/admin/staff/${item.staffId}`} className="ml-auto text-xs underline">
          詳細(日ごとの入力)を見る →
        </Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {created ? (
        <div className="flex flex-col gap-1 text-sm">
          {item.payslips.map((p) => (
            <p key={p.id}>
              {p.kind === "contract" ? "業務委託(レッスン)" : "受付(時給)"}: 総支給額 {yen(p.totalGross)} → 差引支給額{" "}
              <span className="font-semibold">{yen(p.net)}</span>
            </p>
          ))}
          <button
            onClick={handleUndo}
            disabled={busy}
            className="self-start text-xs text-red-600 underline disabled:opacity-40"
          >
            {busy ? "処理中..." : "確定を取り消す(明細を削除)"}
          </button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-0.5 text-sm">
            {item.hourlyLines.map((l) => (
              <li key={l.name}>
                {l.name}: {l.quantity}時間 × {yen(l.rate)} = {yen(l.subtotal)}
              </li>
            ))}
            {item.lessonGroups.map((g) => (
              <li key={`${g.label}|${g.rate}`} className={g.label === "該当ルールなし" ? "text-red-600" : undefined}>
                レッスン {g.label}: {g.count}本 × {yen(g.rate)} = {yen(g.amount)}
              </li>
            ))}
            <li className="font-semibold">支給額計: {yen(item.grossAmount)}</li>
          </ul>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1 text-xs">
              通勤費({item.commuteLabel})
              <input
                type="number"
                min={0}
                value={commute}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setCommute(Number(e.target.value))}
                className="w-28 rounded-lg border border-neutral-200 px-2 py-1 text-sm dark:border-neutral-800 dark:bg-neutral-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              住民税{item.defaultResidentTax > 0 ? "(前回の額を入れてあります)" : ""}
              <input
                type="number"
                min={0}
                value={residentTax}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setResidentTax(Number(e.target.value))}
                className="w-28 rounded-lg border border-neutral-200 px-2 py-1 text-sm dark:border-neutral-800 dark:bg-neutral-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              出勤日数
              <input
                type="number"
                min={0}
                value={days}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-20 rounded-lg border border-neutral-200 px-2 py-1 text-sm dark:border-neutral-800 dark:bg-neutral-900"
              />
            </label>
            <button
              onClick={handleConfirm}
              disabled={busy}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
            >
              {busy ? "確定中..." : "確認して確定する(明細を作成)"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function PayrollReviewPanel({ periodStart }: { periodStart: string }) {
  const [items, setItems] = useState<PayrollReviewItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await getPayrollReviewList(periodStart);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems(result.data);
  }

  const pendingCount = items?.filter((i) => i.status === "pending").length ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">① スタッフごとに確認して確定する</h2>
      <p className="text-xs text-neutral-500">
        対象期間の実績から計算した内容をスタッフごとに確認し、問題なければ「確認して確定する」を押すと、給与明細が作成されます。確定したあと間違いに気づいたら「確定を取り消す」で明細を削除して、やり直せます。
      </p>
      <button
        onClick={load}
        disabled={loading}
        className="self-start rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
      >
        {loading ? "読込中..." : items ? "最新の状態に更新する" : "スタッフ一覧を読み込む"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items && (
        <>
          <p className="text-sm">
            {items.length === 0
              ? "この期間に実績のあるスタッフはいません。"
              : pendingCount === 0
                ? "全員、確定済みです。"
                : `未確定: ${pendingCount}人 / 全${items.length}人`}
          </p>
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <ReviewCard key={`${item.staffId}-${item.status}`} item={item} periodStart={periodStart} onChanged={load} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
