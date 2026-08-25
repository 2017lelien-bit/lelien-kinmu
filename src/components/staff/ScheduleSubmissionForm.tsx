"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addScheduleEntry,
  applyTemplatesToMonth,
  deleteScheduleEntry,
  getOwnScheduleSubmissions,
} from "@/lib/schedule-submissions";
import { addMonthsToMonthStart, dayOfWeekForDate, monthEnd as monthEndOf } from "@/lib/date";
import { CLOSED_DAY_OF_WEEK, DAY_OF_WEEK_LABEL, SCHEDULE_KIND_LABEL } from "@/lib/types";
import type { LessonOption, ScheduleSubmission } from "@/lib/types";

function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `${y}年${Number(m)}月`;
}

// 対象月の日付("YYYY-MM-DD")を、カレンダーのマス目に並べる形で返す(前後の空マスはnull)。
function buildCalendarCells(monthStart: string): (string | null)[] {
  const [y, m] = monthStart.split("-").map(Number);
  const daysInMonth = Number(monthEndOf(monthStart).split("-")[2]);
  const firstDow = dayOfWeekForDate(monthStart);
  const cells: (string | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return cells;
}

export default function ScheduleSubmissionForm({
  entries,
  monthStart,
  lessonOptions,
  staffId,
}: {
  entries: ScheduleSubmission[];
  monthStart: string;
  lessonOptions: LessonOption[];
  staffId?: string;
}) {
  const router = useRouter();
  const maxMonthStart = addMonthsToMonthStart(monthStart, 12);
  const [viewMonth, setViewMonth] = useState(monthStart);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [kind, setKind] = useState<"reception" | "lesson" | "both" | "unavailable">("reception");
  const [entryDate, setEntryDate] = useState(monthStart);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  // 「両方可能」のときは、受付の時間(startTime/endTime)とは別にレッスンの開始時刻を持つ。
  // レッスンは任意なので、希望する人だけチェックを入れて入力する。
  const [lessonStartTime, setLessonStartTime] = useState("10:00");
  const [wantsLesson, setWantsLesson] = useState(false);
  const [lessonName, setLessonName] = useState(lessonOptions[0]?.name ?? "");
  const [note, setNote] = useState("");
  const [partialUnavailable, setPartialUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [ngMode, setNgMode] = useState(false);
  const [togglingDate, setTogglingDate] = useState<string | null>(null);
  // サーバーの再取得(router.refresh)が反映されるまでの間、連打で二重登録されないように
  // ローカルでも即座に反映しておく。propsが更新されたら、そちらを正として同期する
  // (レンダー中にsetStateする、Reactが推奨する「propsからstateを導出し直す」パターン)。
  // ただし、月を切り替えて表示中(viewMonth !== monthStart)は、propsは常に初期月(monthStart)分の
  // データのままなので、同期の対象外にする。
  const [prevEntries, setPrevEntries] = useState(entries);
  const [localEntries, setLocalEntries] = useState(entries);
  if (viewMonth === monthStart && entries !== prevEntries) {
    setPrevEntries(entries);
    setLocalEntries(entries);
  }

  function resetForm() {
    setEntryDate(viewMonth);
    setStartTime("09:00");
    setEndTime("13:00");
    setLessonStartTime("10:00");
    setWantsLesson(false);
    setLessonName(lessonOptions[0]?.name ?? "");
    setNote("");
    setPartialUnavailable(false);
  }

  async function handleChangeMonth(newMonth: string) {
    setViewMonth(newMonth);
    setEntryDate(newMonth);
    setLoadingMonth(true);
    setError(null);
    const data = await getOwnScheduleSubmissions(newMonth, monthEndOf(newMonth), staffId);
    setLoadingMonth(false);
    setLocalEntries(data);
    setPrevEntries(data);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    if (kind === "both") {
      const receptionResult = await addScheduleEntry(
        { entryDate, kind: "reception", startTime, endTime, note: note || undefined },
        staffId,
      );
      if (!receptionResult.ok) {
        setSubmitting(false);
        setError(receptionResult.error);
        return;
      }
      if (!wantsLesson) {
        setSubmitting(false);
        setLocalEntries((prev) => [...prev, receptionResult.data]);
        resetForm();
        router.refresh();
        return;
      }
      const lessonResult = await addScheduleEntry(
        { entryDate, kind: "lesson", startTime: lessonStartTime, lessonName, note: note || undefined },
        staffId,
      );
      setSubmitting(false);
      if (!lessonResult.ok) {
        setError(lessonResult.error);
        setLocalEntries((prev) => [...prev, receptionResult.data]);
        return;
      }
      setLocalEntries((prev) => [...prev, receptionResult.data, lessonResult.data]);
      resetForm();
      router.refresh();
      return;
    }

    const unavailableWithTime = kind === "unavailable" && partialUnavailable;
    const result = await addScheduleEntry(
      {
        entryDate,
        kind,
        startTime: kind === "unavailable" ? (unavailableWithTime ? startTime : undefined) : startTime,
        endTime: kind === "reception" || unavailableWithTime ? endTime : undefined,
        lessonName: kind === "lesson" ? lessonName : undefined,
        note: note || undefined,
      },
      staffId,
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLocalEntries((prev) => [...prev, result.data]);
    resetForm();
    router.refresh();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const result = await deleteScheduleEntry(id, staffId);
    setDeletingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLocalEntries((prev) => prev.filter((e) => e.id !== id));
    router.refresh();
  }

  const entriesByDate = new Map<string, ScheduleSubmission[]>();
  for (const e of localEntries) {
    const list = entriesByDate.get(e.entry_date) ?? [];
    list.push(e);
    entriesByDate.set(e.entry_date, list);
  }
  const calendarCells = buildCalendarCells(viewMonth);

  // NG日モード中は、日付をタップするだけで休み希望のON/OFFを切り替える(他の予定はそのまま残す)。
  // それ以外のときは、下の入力フォームの日付欄にその日をセットするだけ。
  async function handleDayClick(dateStr: string) {
    if (!ngMode) {
      setEntryDate(dateStr);
      return;
    }
    setTogglingDate(dateStr);
    setError(null);
    const existingUnavailable = (entriesByDate.get(dateStr) ?? []).find((e) => e.kind === "unavailable");
    if (existingUnavailable) {
      const result = await deleteScheduleEntry(existingUnavailable.id, staffId);
      setTogglingDate(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLocalEntries((prev) => prev.filter((e) => e.id !== existingUnavailable.id));
      router.refresh();
      return;
    }

    const result = await addScheduleEntry({ entryDate: dateStr, kind: "unavailable" }, staffId);
    setTogglingDate(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLocalEntries((prev) => [...prev, result.data]);
    router.refresh();
  }

  async function handleApplyTemplates() {
    setApplying(true);
    setError(null);
    setApplyMessage(null);
    const result = await applyTemplatesToMonth(viewMonth, monthEndOf(viewMonth), staffId);
    setApplying(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setApplyMessage(
      result.data.created > 0 ? `${result.data.created}件を反映しました。` : "新しく反映できる予定はありませんでした。",
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{formatMonthLabel(viewMonth)}のスケジュール提出</h3>
        <label className="flex items-center gap-1 text-sm">
          対象月
          <input
            type="month"
            value={viewMonth.slice(0, 7)}
            min={monthStart.slice(0, 7)}
            max={maxMonthStart.slice(0, 7)}
            onChange={(e) => handleChangeMonth(`${e.target.value}-01`)}
            className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
          />
        </label>
      </div>
      {loadingMonth && <p className="text-xs text-neutral-400">読込中...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 pb-4 dark:border-neutral-900">
        <button
          onClick={handleApplyTemplates}
          disabled={applying}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          {applying ? "反映中..." : "毎週固定のスケジュールを今月に反映する"}
        </button>
        {applyMessage && <span className="text-xs text-neutral-500">{applyMessage}</span>}
      </div>

      <div className="flex flex-col gap-2 border-b border-neutral-100 pb-4 dark:border-neutral-900">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setNgMode(false)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              !ngMode
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-black"
                : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            予定を入力する
          </button>
          <button
            onClick={() => setNgMode(true)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              ngMode
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-black"
                : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            休み希望(NG日)だけ入力する
          </button>
        </div>
        <p className="text-xs text-neutral-400">
          {ngMode
            ? "日付をタップすると、その日が休み希望になります(他の予定は消えず、そのまま残ります)。もう一度タップすると解除されます。"
            : "日付をタップすると、下の入力欄の日付が切り替わります。"}
        </p>

        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {DAY_OF_WEEK_LABEL.map((label) => (
            <div key={label} className="text-neutral-400">
              {label}
            </div>
          ))}
          {calendarCells.map((dateStr, i) => {
            if (!dateStr) return <div key={`empty-${i}`} />;
            const dayEntries = entriesByDate.get(dateStr) ?? [];
            const isUnavailable = dayEntries.some((e) => e.kind === "unavailable");
            const otherCount = dayEntries.filter((e) => e.kind !== "unavailable").length;
            const day = Number(dateStr.split("-")[2]);
            const isClosedDay = dayOfWeekForDate(dateStr) === CLOSED_DAY_OF_WEEK;
            return (
              <button
                key={dateStr}
                onClick={() => handleDayClick(dateStr)}
                disabled={togglingDate === dateStr}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg border p-1 disabled:opacity-40 ${
                  dateStr === entryDate ? "border-neutral-900 dark:border-white" : "border-neutral-200 dark:border-neutral-800"
                } ${
                  isUnavailable
                    ? "bg-red-50 dark:bg-red-950"
                    : isClosedDay
                      ? "bg-neutral-50 dark:bg-neutral-950"
                      : dayEntries.length > 0
                        ? "bg-neutral-100 dark:bg-neutral-900"
                        : ""
                }`}
              >
                <span className={isClosedDay ? "text-neutral-400" : ""}>{day}</span>
                {isClosedDay && !isUnavailable && <span className="text-neutral-400">定休</span>}
                {isUnavailable && <span className="text-red-600">休</span>}
                {otherCount > 0 && <span className="text-neutral-500">{otherCount}件</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          種別
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "reception" | "lesson" | "both" | "unavailable")}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          >
            <option value="reception">受付</option>
            <option value="lesson">レッスン</option>
            <option value="both">受付・レッスンどちらも可能</option>
            <option value="unavailable">休み希望(NG日)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          日付
          <input
            type="date"
            min={viewMonth}
            max={monthEndOf(viewMonth)}
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
        {kind === "unavailable" && (
          <label className="flex items-center gap-1 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={partialUnavailable}
              onChange={(e) => setPartialUnavailable(e.target.checked)}
            />
            時間帯を指定する(空欄なら終日休み)
          </label>
        )}
        {(kind !== "unavailable" || partialUnavailable) && (
          <label className="flex flex-col gap-1 text-sm">
            {kind === "both" ? "受付 開始時刻" : "開始時刻"}
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
            />
          </label>
        )}
        {(kind === "reception" || kind === "both" || (kind === "unavailable" && partialUnavailable)) && (
          <label className="flex flex-col gap-1 text-sm">
            {kind === "both" ? "受付 終了時刻" : "終了時刻"}
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
            />
          </label>
        )}
        {kind === "both" && (
          <label className="flex items-center gap-1 self-end pb-2 text-sm">
            <input type="checkbox" checked={wantsLesson} onChange={(e) => setWantsLesson(e.target.checked)} />
            レッスンの希望も入力する
          </label>
        )}
        {kind === "both" && wantsLesson && (
          <label className="flex flex-col gap-1 text-sm">
            レッスン開始時刻
            <input
              type="time"
              value={lessonStartTime}
              onChange={(e) => setLessonStartTime(e.target.value)}
              className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
            />
          </label>
        )}
        {(kind === "lesson" || (kind === "both" && wantsLesson)) &&
          (lessonOptions.length > 0 ? (
            <label className="flex flex-col gap-1 text-sm">
              レッスン名
              <select
                value={lessonName}
                onChange={(e) => setLessonName(e.target.value)}
                className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
              >
                {lessonOptions.map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              レッスン名
              <input
                value={lessonName}
                onChange={(e) => setLessonName(e.target.value)}
                placeholder="例: 筋膜リリース75"
                className="w-40 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
              />
            </label>
          ))}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        メモ(任意)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {submitting ? "登録中..." : "登録する"}
      </button>

      <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-900">
        {(() => {
          const visibleEntries = localEntries.filter((e) => e.kind !== "unavailable");
          if (visibleEntries.length === 0) {
            return <p className="text-sm text-neutral-400">まだ提出されたスケジュールはありません。</p>;
          }
          return (
            <ul className="flex flex-col gap-2 text-sm">
              {visibleEntries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-2 dark:border-neutral-900">
                <span>{e.entry_date}</span>
                {e.start_time && (
                  <span>
                    {e.start_time.slice(0, 5)}
                    {e.end_time ? `〜${e.end_time.slice(0, 5)}` : ""}
                  </span>
                )}
                <span>{e.kind === "lesson" ? e.lesson_name : SCHEDULE_KIND_LABEL[e.kind]}</span>
                {e.note && <span className="text-neutral-400">{e.note}</span>}
                {e.confirmed ? (
                  <span className="text-neutral-400">確定済み</span>
                ) : (
                  <button
                    onClick={() => handleDelete(e.id)}
                    disabled={deletingId === e.id}
                    className="ml-auto text-xs text-red-600 underline disabled:opacity-40"
                  >
                    {deletingId === e.id ? "削除中..." : "削除"}
                  </button>
                )}
              </li>
              ))}
            </ul>
          );
        })()}
      </div>
    </div>
  );
}
