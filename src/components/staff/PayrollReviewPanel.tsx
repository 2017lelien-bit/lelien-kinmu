"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { approveLessonLogsInPeriod } from "@/lib/staff-admin";
import { deletePayslip, generatePayslip, getPayrollReviewList, type PayrollReviewItem } from "@/lib/payroll";

const yen = (n: number) => `¥${n.toLocaleString()}`;

function formatDay(date: string): string {
  const [, m, d] = date.split("-");
  const dow = ["日", "月", "火", "水", "木", "金", "土"][new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${Number(m)}/${Number(d)}(${dow})`;
}

type EnteredValues = Record<string, { commute: number; residentTax: number; days: number }>;

function ReviewCard({
  item,
  periodStart,
  onChanged,
  onValues,
}: {
  item: PayrollReviewItem;
  periodStart: string;
  onChanged: () => void;
  // 「全員まとめて確定」で、各カードに入力・修正済みの通勤費などをそのまま使えるよう、現在の値を親に渡す。
  onValues: (staffId: string, values: EnteredValues[string]) => void;
}) {
  const [commute, setCommute] = useState(item.defaultCommute);
  const [residentTax, setResidentTax] = useState(item.defaultResidentTax);
  const [days, setDays] = useState(item.daysWorked);
  useEffect(() => {
    onValues(item.staffId, { commute, residentTax, days });
  }, [onValues, item.staffId, commute, residentTax, days]);
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

  async function handleApprove() {
    setBusy(true);
    setError(null);
    const result = await approveLessonLogsInPeriod(item.staffId, periodStart);
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
          <span className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
            未承認のレッスンが{item.unapprovedLessons}本あります
            <button
              onClick={handleApprove}
              disabled={busy}
              className="rounded border border-amber-600 px-2 py-0.5 text-amber-800 disabled:opacity-40 dark:text-amber-300"
            >
              この期間の分を、すべて承認する
            </button>
          </span>
        )}
        <Link href={`/staff/admin/staff/${item.staffId}`} className="ml-auto text-xs underline">
          詳細(日ごとの入力)を見る →
        </Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <details open className="text-sm">
        <summary className="cursor-pointer text-xs font-semibold">
          出勤した日(出退勤・レッスンの記録がある日): {item.workDays.length}日
        </summary>
        {item.workDays.length === 0 ? (
          <p className="mt-1 text-xs text-neutral-400">この期間の記録はありません。</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5">
            {item.workDays.map((day) => (
              <li key={day.date} className="flex flex-wrap gap-x-3 border-b border-neutral-100 pb-0.5 text-xs dark:border-neutral-900">
                <span className="w-20 shrink-0 font-semibold">{formatDay(day.date)}</span>
                <span className="flex flex-col">
                  {day.lines.map((line, i) => (
                    <span key={i}>{line}</span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>

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

  // 全員まとめて確定(確認画面を出してから実行する)。
  const [entered, setEntered] = useState<EnteredValues>({});
  const handleValues = useCallback((staffId: string, values: EnteredValues[string]) => {
    setEntered((prev) => {
      const cur = prev[staffId];
      if (cur && cur.commute === values.commute && cur.residentTax === values.residentTax && cur.days === values.days) return prev;
      return { ...prev, [staffId]: values };
    });
  }, []);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkApprove, setBulkApprove] = useState(true);
  const pendingItems = items?.filter((i) => i.status === "pending") ?? [];
  const valuesFor = (item: PayrollReviewItem) =>
    entered[item.staffId] ?? { commute: item.defaultCommute, residentTax: item.defaultResidentTax, days: item.daysWorked };

  async function handleBulkConfirm() {
    setBulkBusy(true);
    setBulkMessage(null);
    const failed: string[] = [];
    let done = 0;
    for (const item of pendingItems) {
      if (bulkApprove && item.unapprovedLessons > 0) await approveLessonLogsInPeriod(item.staffId, periodStart);
      const v = valuesFor(item);
      const result = await generatePayslip(item.staffId, periodStart, {
        commuteAllowance: v.commute,
        residentTax: v.residentTax,
        daysWorked: v.days,
      });
      if (result.ok) done += 1;
      else failed.push(`${item.staffName}(${result.error})`);
    }
    setBulkBusy(false);
    setBulkOpen(false);
    setBulkMessage(
      failed.length === 0
        ? `${done}人分を確定しました。下の「② 全員分の確認とExcel出力」に進めます。`
        : `${done}人分を確定しました。確定できなかった人: ${failed.join("、")}`,
    );
    await load();
  }

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
          {bulkMessage && <p className="text-sm text-green-700 dark:text-green-400">{bulkMessage}</p>}
          {pendingCount > 0 && !bulkOpen && (
            <button
              onClick={() => setBulkOpen(true)}
              className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
            >
              未確定の{pendingCount}人を、まとめて確定する
            </button>
          )}
          {bulkOpen && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
              <p className="font-semibold">次の{pendingItems.length}人の給与明細を、この内容でまとめて作成します</p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                通勤費・住民税・出勤日数は、各カードに入っている値(変更していれば変更後の値)を使います。確定したあとで間違いに気づいたら、人ごとに「確定を取り消す」でやり直せます。
              </p>
              <ul className="flex flex-col gap-1">
                {pendingItems.map((item) => {
                  const v = valuesFor(item);
                  const noRule = item.lessonGroups.some((g) => g.label === "該当ルールなし");
                  return (
                    <li key={item.staffId} className="flex flex-wrap gap-x-3 border-b border-amber-200 pb-1 dark:border-amber-900">
                      <span className="w-28 shrink-0 font-semibold">{item.staffName}</span>
                      <span>支給額計 {yen(item.grossAmount)}</span>
                      <span>通勤費 {yen(v.commute)}</span>
                      <span>住民税 {yen(v.residentTax)}</span>
                      <span>出勤{v.days}日</span>
                      {item.unapprovedLessons > 0 && (
                        <span className="text-amber-700 dark:text-amber-400">未承認レッスン{item.unapprovedLessons}本</span>
                      )}
                      {noRule && <span className="text-red-600">単価ルールなしのレッスンあり(¥0)</span>}
                    </li>
                  );
                })}
              </ul>
              {pendingItems.some((i) => i.unapprovedLessons > 0) && (
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={bulkApprove} onChange={(e) => setBulkApprove(e.target.checked)} />
                  未承認のレッスンも、まとめて承認する(承認は目印のみで、金額の計算には影響しません)
                </label>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleBulkConfirm}
                  disabled={bulkBusy}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
                >
                  {bulkBusy ? "確定中..." : `この内容で${pendingItems.length}人を確定する`}
                </button>
                <button
                  onClick={() => setBulkOpen(false)}
                  disabled={bulkBusy}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
                >
                  やめる
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <ReviewCard
                key={`${item.staffId}-${item.status}`}
                item={item}
                periodStart={periodStart}
                onChanged={load}
                onValues={handleValues}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
