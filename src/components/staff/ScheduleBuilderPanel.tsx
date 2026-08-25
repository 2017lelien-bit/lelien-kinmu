"use client";

import { useState } from "react";
import { getAllScheduleSubmissions, setScheduleEntryConfirmed } from "@/lib/schedule-submissions";
import { dayOfWeekForDate, monthEnd } from "@/lib/date";
import { CLOSED_DAY_OF_WEEK, DAY_OF_WEEK_LABEL } from "@/lib/types";
import type { ScheduleSubmission } from "@/lib/types";

type EntryWithName = ScheduleSubmission & { staffName: string };

function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `${y}年${Number(m)}月`;
}

function candidateLabel(e: EntryWithName): string {
  const time = e.start_time ? `${e.start_time.slice(0, 5)}${e.end_time ? `〜${e.end_time.slice(0, 5)}` : ""}` : "";
  const what = e.kind === "lesson" ? e.lesson_name : "受付";
  return [e.staffName, time, what].filter(Boolean).join(" ");
}

export default function ScheduleBuilderPanel({
  initialMonthStart,
  initialEntries,
}: {
  initialMonthStart: string;
  initialEntries: EntryWithName[];
}) {
  const [monthStart, setMonthStart] = useState(initialMonthStart);
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 候補の数だけプルダウンを出せば足りるが、最初は1行だけ表示し、「+追加」で増やす。
  const [extraSlots, setExtraSlots] = useState<Record<string, number>>({});

  async function handleShowMonth() {
    setLoading(true);
    setError(null);
    const data = await getAllScheduleSubmissions(monthStart, monthEnd(monthStart));
    setLoading(false);
    setEntries(data);
    setExtraSlots({});
  }

  async function handleSelect(key: string, prevId: string, nextId: string) {
    setError(null);
    // 通信を待たず、まず画面を即座に切り替える(体感速度のため)。失敗したら元に戻す。
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id === prevId) return { ...e, confirmed: false };
        if (e.id === nextId) return { ...e, confirmed: true };
        return e;
      }),
    );
    setSavingKey(key);
    const [prevResult, nextResult] = await Promise.all([
      prevId ? setScheduleEntryConfirmed(prevId, false) : null,
      nextId ? setScheduleEntryConfirmed(nextId, true) : null,
    ]);
    setSavingKey(null);
    const failed = (prevResult && !prevResult.ok && prevResult) || (nextResult && !nextResult.ok && nextResult);
    if (failed) {
      setError(failed.error);
      // 反映に失敗した分は元に戻す。
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id === prevId) return { ...e, confirmed: true };
          if (e.id === nextId) return { ...e, confirmed: false };
          return e;
        }),
      );
    }
  }

  const [y, m] = monthStart.split("-").map(Number);
  const daysInMonth = Number(monthEnd(monthStart).split("-")[2]);
  const dates = Array.from(
    { length: daysInMonth },
    (_, i) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
  );

  const entriesByDateKind = new Map<string, EntryWithName[]>();
  for (const e of entries) {
    if (e.kind === "unavailable") continue;
    const key = `${e.entry_date}|${e.kind}`;
    const list = entriesByDateKind.get(key) ?? [];
    list.push(e);
    entriesByDateKind.set(key, list);
  }

  function renderKindSection(date: string, kind: "reception" | "lesson", label: string) {
    const key = `${date}|${kind}`;
    const candidates = entriesByDateKind.get(key) ?? [];
    if (candidates.length === 0) return null;

    const confirmedIds = candidates.filter((c) => c.confirmed).map((c) => c.id);
    const slotCount = Math.min(candidates.length, Math.max(confirmedIds.length, 1, extraSlots[key] ?? 0));
    const slots = Array.from({ length: slotCount }, (_, i) => confirmedIds[i] ?? "");

    return (
      <div className="flex flex-col gap-1">
        <p className="text-xs text-neutral-500">
          {label}
          {savingKey === key && <span className="ml-1 text-neutral-400">保存中...</span>}
        </p>
        {slots.map((selectedId, i) => {
          const usedElsewhere = new Set(slots.filter((_, j) => j !== i).filter(Boolean));
          const options = candidates.filter((c) => !usedElsewhere.has(c.id) || c.id === selectedId);
          return (
            <select
              key={i}
              value={selectedId}
              onChange={(e) => handleSelect(key, selectedId, e.target.value)}
              className="w-full max-w-full rounded-lg border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800"
            >
              <option value="">-- 未選択 --</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {candidateLabel(c)}
                </option>
              ))}
            </select>
          );
        })}
        {slotCount < candidates.length && (
          <button
            onClick={() => setExtraSlots((prev) => ({ ...prev, [key]: slotCount + 1 }))}
            className="self-start text-xs underline"
          >
            + 追加
          </button>
        )}
      </div>
    );
  }

  const hasAnyCandidates = dates.some(
    (date) =>
      (entriesByDateKind.get(`${date}|reception`)?.length ?? 0) > 0 ||
      (entriesByDateKind.get(`${date}|lesson`)?.length ?? 0) > 0,
  );

  // カレンダーの見た目に合わせて、月初の曜日分だけ空マスを差し込む。
  const leadingBlanks = Array(dayOfWeekForDate(dates[0])).fill(null);
  const calendarCells: (string | null)[] = [...leadingBlanks, ...dates];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          対象月
          <input
            type="month"
            value={monthStart.slice(0, 7)}
            onChange={(e) => setMonthStart(`${e.target.value}-01`)}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
        <button
          onClick={handleShowMonth}
          disabled={loading}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          {loading ? "読込中..." : `${formatMonthLabel(monthStart)}を表示`}
        </button>
      </div>

      <p className="text-xs text-neutral-400">
        提出された候補の中から、日付ごとにプルダウンで選ぶと、その予定が確定します(スケジュール管理の「確定」チェックと連動しています)。
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!hasAnyCandidates ? (
        <p className="text-sm text-neutral-400">この月の提出はまだありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-7 gap-2">
            {DAY_OF_WEEK_LABEL.map((label) => (
              <div key={label} className="text-center text-xs text-neutral-400">
                {label}
              </div>
            ))}
            {calendarCells.map((date, i) => {
              if (!date) return <div key={`empty-${i}`} />;
              const day = Number(date.split("-")[2]);
              const isClosedDay = dayOfWeekForDate(date) === CLOSED_DAY_OF_WEEK;
              const reception = renderKindSection(date, "reception", "受付");
              const lesson = renderKindSection(date, "lesson", "レッスン");
              return (
                <div
                  key={date}
                  className={`flex min-h-24 flex-col gap-2 rounded-lg border p-2 ${
                    isClosedDay
                      ? "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950"
                      : "border-neutral-200 dark:border-neutral-800"
                  }`}
                >
                  <p className={`text-xs font-semibold ${isClosedDay ? "text-neutral-400" : ""}`}>{day}</p>
                  {isClosedDay ? (
                    <p className="text-xs text-neutral-400">定休</p>
                  ) : (
                    <>
                      {reception}
                      {lesson}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
