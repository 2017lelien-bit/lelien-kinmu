"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setLessonLogEntryApproval } from "@/lib/staff-admin";
import { updateLessonLogEntry } from "@/lib/lesson-log";
import { LESSON_NAMES } from "@/lib/types";
import type { TodayLessonSummary, TodayShiftSummary } from "@/lib/payroll";

export default function TodaySummaryPanel({
  staffId,
  lessons,
  shifts,
}: {
  staffId: string;
  lessons: TodayLessonSummary[];
  shifts: TodayShiftSummary[];
}) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ lessonName: "", durationMinutes: 60, headcount: 1, startTime: "" });
  const [error, setError] = useState<string | null>(null);

  const lessonsTotal = lessons.reduce((sum, l) => sum + l.rate, 0);
  const shiftsTotal = shifts.reduce((sum, s) => sum + s.amount, 0);
  const hasLeLienShift = shifts.some((s) => s.categoryName.toLowerCase().replace(/\s+/g, "").includes("lelien"));

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

  function startEdit(l: TodayLessonSummary) {
    setError(null);
    setEditingId(l.id);
    setEditValues({
      lessonName: l.lessonName,
      durationMinutes: l.durationMinutes,
      headcount: l.headcount,
      startTime: l.startTime?.slice(0, 5) ?? "",
    });
  }

  async function handleSaveEdit(l: TodayLessonSummary) {
    setSavingId(l.id);
    setError(null);
    const result = await updateLessonLogEntry(
      l.id,
      {
        entryDate: l.entryDate,
        lessonName: editValues.lessonName,
        durationMinutes: editValues.durationMinutes,
        headcount: editValues.headcount,
        startTime: editValues.startTime || undefined,
      },
      staffId,
    );
    setSavingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  if (lessons.length === 0 && shifts.length === 0) {
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

      {lessons.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-neutral-500">レッスン {lessons.length}本(合計 ¥{lessonsTotal.toLocaleString()})</p>
          <ul className="flex flex-col gap-2 text-sm">
            {lessons.map((l) =>
              editingId === l.id ? (
                <li key={l.id} className="flex flex-wrap items-center gap-2 border-b border-neutral-100 pb-2 dark:border-neutral-900">
                  <input
                    type="time"
                    value={editValues.startTime}
                    onChange={(e) => setEditValues((v) => ({ ...v, startTime: e.target.value }))}
                    className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
                  />
                  <select
                    value={editValues.lessonName}
                    onChange={(e) => setEditValues((v) => ({ ...v, lessonName: e.target.value }))}
                    className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
                  >
                    {LESSON_NAMES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={editValues.durationMinutes}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setEditValues((v) => ({ ...v, durationMinutes: Number(e.target.value) }))}
                    className="w-16 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
                  />
                  分
                  <input
                    type="number"
                    min={1}
                    value={editValues.headcount}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setEditValues((v) => ({ ...v, headcount: Number(e.target.value) }))}
                    className="w-16 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
                  />
                  人
                  <button
                    onClick={() => handleSaveEdit(l)}
                    disabled={savingId === l.id}
                    className="rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40 dark:bg-white dark:text-black"
                  >
                    {savingId === l.id ? "保存中..." : "保存"}
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-xs underline">
                    キャンセル
                  </button>
                </li>
              ) : (
                <li key={l.id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-2 dark:border-neutral-900">
                  {l.startTime && <span>{l.startTime.slice(0, 5)}〜</span>}
                  <span>{l.lessonName}</span>
                  <span>{l.headcount}人</span>
                  <span className="font-semibold">
                    {l.rate > 0 ? `¥${l.rate.toLocaleString()}` : "該当ルールなし"}
                  </span>
                  {l.approved ? (
                    <span className="text-neutral-400">承認済み</span>
                  ) : (
                    <button
                      onClick={() => handleApprove(l.id)}
                      disabled={savingId === l.id}
                      className="rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40 dark:bg-white dark:text-black"
                    >
                      {savingId === l.id ? "更新中..." : "承認する"}
                    </button>
                  )}
                  <button onClick={() => startEdit(l)} className="ml-auto text-xs underline">
                    訂正する
                  </button>
                </li>
              ),
            )}
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
          {hasLeLienShift && (
            <p className="text-xs text-neutral-400">
              「Le lien」区分は、同じ日にレッスンと時間が重なっていた場合、1レッスンにつき2時間分が実際の反映額から差し引かれます(むすひなど他の区分には適用されません)。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
