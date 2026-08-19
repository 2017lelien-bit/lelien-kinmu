"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setLessonLogEntryApproval } from "@/lib/staff-admin";
import type { TodayLessonSummary, TodayShiftSummary } from "@/lib/payroll";

export default function TodaySummaryPanel({
  lessons,
  shifts,
}: {
  lessons: TodayLessonSummary[];
  shifts: TodayShiftSummary[];
}) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingLessons = lessons.filter((l) => !l.approved);
  const lessonsTotal = pendingLessons.reduce((sum, l) => sum + l.rate, 0);
  const shiftsTotal = shifts.reduce((sum, s) => sum + s.amount, 0);

  async function handleApprove(lessonId: string) {
    setSavingId(lessonId);
    setError(null);
    const result = await setLessonLogEntryApproval(lessonId, true);
    setSavingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (pendingLessons.length === 0 && shifts.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-semibold">本日の実績</h2>
        <p className="mt-2 text-sm text-neutral-400">本日の入力はまだありません。</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">本日の実績</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {pendingLessons.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-neutral-500">レッスン {pendingLessons.length}本(合計 ¥{lessonsTotal.toLocaleString()})</p>
          <ul className="flex flex-col gap-2 text-sm">
            {pendingLessons.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-2 dark:border-neutral-900">
                {l.startTime && <span>{l.startTime.slice(0, 5)}〜</span>}
                <span>{l.lessonName}</span>
                <span>{l.headcount}人</span>
                <span className="font-semibold">
                  {l.rate > 0 ? `¥${l.rate.toLocaleString()}` : "該当ルールなし"}
                </span>
                <button
                  onClick={() => handleApprove(l.id)}
                  disabled={savingId === l.id}
                  className="ml-auto rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40 dark:bg-white dark:text-black"
                >
                  {savingId === l.id ? "更新中..." : "承認する"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shifts.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-900">
          <p className="text-xs text-neutral-500">出退勤(合計 ¥{shiftsTotal.toLocaleString()})</p>
          <ul className="flex flex-col gap-1 text-sm">
            {shifts.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3">
                <span>{s.categoryName}</span>
                <span>
                  {s.startTime.slice(0, 5)}〜{s.endTime.slice(0, 5)}({s.hours}時間)
                </span>
                <span className="font-semibold">¥{s.amount.toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-neutral-400">
            同じ日にレッスンと時間が重なっていた場合、1レッスンにつき2時間分が実際の反映額から差し引かれます。
          </p>
        </div>
      )}
    </div>
  );
}
