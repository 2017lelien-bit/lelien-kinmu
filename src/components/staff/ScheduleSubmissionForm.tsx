"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addScheduleEntry, applyTemplatesToMonth, deleteScheduleEntry } from "@/lib/schedule-submissions";
import { dayOfWeekForDate, monthEnd as monthEndOf } from "@/lib/date";
import { DAY_OF_WEEK_LABEL, SCHEDULE_KIND_LABEL } from "@/lib/types";
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
  const [kind, setKind] = useState<"reception" | "lesson" | "unavailable">("reception");
  const [entryDate, setEntryDate] = useState(monthStart);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [lessonName, setLessonName] = useState(lessonOptions[0]?.name ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [ngMode, setNgMode] = useState(false);
  const [togglingDate, setTogglingDate] = useState<string | null>(null);

  function resetForm() {
    setEntryDate(monthStart);
    setStartTime("09:00");
    setEndTime("13:00");
    setLessonName(lessonOptions[0]?.name ?? "");
    setNote("");
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await addScheduleEntry(
      {
        entryDate,
        kind,
        startTime: kind === "unavailable" ? undefined : startTime,
        endTime: kind === "reception" ? endTime : undefined,
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
    router.refresh();
  }

  const entriesByDate = new Map<string, ScheduleSubmission[]>();
  for (const e of entries) {
    const list = entriesByDate.get(e.entry_date) ?? [];
    list.push(e);
    entriesByDate.set(e.entry_date, list);
  }
  const calendarCells = buildCalendarCells(monthStart);

  // NG日モード中は、日付をタップするだけで休み希望のON/OFFを切り替える。
  // それ以外のときは、下の入力フォームの日付欄にその日をセットするだけ。
  async function handleDayClick(dateStr: string) {
    if (!ngMode) {
      setEntryDate(dateStr);
      return;
    }
    setTogglingDate(dateStr);
    setError(null);
    const existingUnavailable = (entriesByDate.get(dateStr) ?? []).find((e) => e.kind === "unavailable");
    const result = existingUnavailable
      ? await deleteScheduleEntry(existingUnavailable.id, staffId)
      : await addScheduleEntry({ entryDate: dateStr, kind: "unavailable" }, staffId);
    setTogglingDate(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleApplyTemplates() {
    setApplying(true);
    setError(null);
    setApplyMessage(null);
    const result = await applyTemplatesToMonth(monthStart, monthEndOf(monthStart), staffId);
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
      <h3 className="text-sm font-semibold">{formatMonthLabel(monthStart)}のスケジュール提出</h3>
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
            ? "日付をタップすると、その日が休み希望になります。もう一度タップすると解除されます。"
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
            const day = Number(dateStr.split("-")[2]);
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
                    : dayEntries.length > 0
                      ? "bg-neutral-100 dark:bg-neutral-900"
                      : ""
                }`}
              >
                <span>{day}</span>
                {isUnavailable && <span className="text-red-600">休</span>}
                {!isUnavailable && dayEntries.length > 0 && <span className="text-neutral-500">{dayEntries.length}件</span>}
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
            onChange={(e) => setKind(e.target.value as "reception" | "lesson" | "unavailable")}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          >
            <option value="reception">受付</option>
            <option value="lesson">レッスン</option>
            <option value="unavailable">休み希望(NG日)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          日付
          <input
            type="date"
            min={monthStart}
            max={monthEndOf(monthStart)}
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
        {kind !== "unavailable" && (
          <label className="flex flex-col gap-1 text-sm">
            開始時刻
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
            />
          </label>
        )}
        {kind === "reception" && (
          <label className="flex flex-col gap-1 text-sm">
            終了時刻
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
            />
          </label>
        )}
        {kind === "lesson" &&
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
        {entries.length === 0 ? (
          <p className="text-sm text-neutral-400">まだ提出されたスケジュールはありません。</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {entries.map((e) => (
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
        )}
      </div>
    </div>
  );
}
