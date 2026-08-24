"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addScheduleEntry, deleteScheduleEntry } from "@/lib/schedule-submissions";
import { monthEnd as monthEndOf } from "@/lib/date";
import type { ScheduleSubmission } from "@/lib/types";

function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `${y}年${Number(m)}月`;
}

export default function ScheduleSubmissionForm({
  entries,
  monthStart,
  staffId,
}: {
  entries: ScheduleSubmission[];
  monthStart: string;
  staffId?: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"reception" | "lesson">("reception");
  const [entryDate, setEntryDate] = useState(monthStart);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [lessonName, setLessonName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function resetForm() {
    setEntryDate(monthStart);
    setStartTime("09:00");
    setEndTime("13:00");
    setLessonName("");
    setNote("");
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await addScheduleEntry(
      {
        entryDate,
        kind,
        startTime,
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

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-sm font-semibold">{formatMonthLabel(monthStart)}のスケジュール提出</h3>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          種別
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "reception" | "lesson")}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          >
            <option value="reception">受付</option>
            <option value="lesson">レッスン</option>
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
        <label className="flex flex-col gap-1 text-sm">
          開始時刻
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
        {kind === "reception" ? (
          <label className="flex flex-col gap-1 text-sm">
            終了時刻
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
            />
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
        )}
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
                <span>{e.start_time.slice(0, 5)}{e.end_time ? `〜${e.end_time.slice(0, 5)}` : ""}</span>
                <span>{e.kind === "reception" ? "受付" : e.lesson_name}</span>
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
