"use client";

import { useRef, useState } from "react";
import { getLeLienDeductionsByDate, getOwnTimeLogEntries } from "@/lib/time-log";
import { payPeriodEnd, payPeriodForDate } from "@/lib/date";
import type { PayCategory, TimeLogEntry } from "@/lib/types";
import TimeLogForm from "@/components/staff/TimeLogForm";

interface PeriodData {
  entries: Record<string, TimeLogEntry[]>;
  deductions: Record<string, Record<string, number>>;
}

// 管理者が、本人に代わって受付(時給)の出退勤を入力・訂正するための欄。
// 前の期間の入力漏れも直せるように、対象期間(16日締め)を選べる。
export default function AdminTimeLogSection({
  staffId,
  categories,
  initialPeriodStart,
  initialData,
}: {
  staffId: string;
  categories: PayCategory[];
  initialPeriodStart: string;
  initialData: PeriodData;
}) {
  const [selectedDate, setSelectedDate] = useState(initialPeriodStart);
  // どの日付を選んでも、その日を含む16日締めの期間(16日〜翌月15日)として扱う(15日を選んでも前の期間になる)。
  const periodStart = selectedDate ? payPeriodForDate(selectedDate).periodStart : initialPeriodStart;
  const [data, setData] = useState<PeriodData>(initialData);
  const [loading, setLoading] = useState(false);
  const periodEnd = payPeriodEnd(periodStart);
  // 日付を打ち込む途中の値(例: 0002-10-16)でも読み込みが走るため、最後に選んだ期間の結果だけを反映する。
  const latestRequest = useRef(0);

  async function load(start: string) {
    const requestId = ++latestRequest.current;
    setLoading(true);
    const end = payPeriodEnd(start);
    const [entries, deductions] = await Promise.all([
      Promise.all(categories.map(async (c) => [c.id, await getOwnTimeLogEntries(c.id, start, end, staffId)] as const)),
      Promise.all(categories.map(async (c) => [c.id, await getLeLienDeductionsByDate(c.id, start, end, staffId)] as const)),
    ]);
    if (requestId !== latestRequest.current) return;
    setData({ entries: Object.fromEntries(entries), deductions: Object.fromEntries(deductions) });
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">受付(時給)の出退勤の代理入力</h3>
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          対象期間の開始日(16日締め)
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              if (e.target.value) load(payPeriodForDate(e.target.value).periodStart);
            }}
            className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
          />
        </label>
        <span className="text-xs text-neutral-500">
          {periodStart}〜{periodEnd}
          {loading ? "(読込中...)" : ""}
        </span>
      </div>
      <p className="text-xs text-neutral-400">
        前の期間の入力漏れを直す場合は、その期間の開始日(例: 9/16)を選んでから入力してください。入力した日付が属する期間の実績に反映されます。
      </p>
      {categories.map((c) => (
        <TimeLogForm
          key={`${c.id}-${periodStart}`}
          payCategoryId={c.id}
          categoryName={c.name}
          entries={data.entries[c.id] ?? []}
          deductionsByDate={data.deductions[c.id]}
          periodStart={periodStart}
          periodEnd={periodEnd}
          staffId={staffId}
          onChanged={() => load(periodStart)}
        />
      ))}
    </div>
  );
}
