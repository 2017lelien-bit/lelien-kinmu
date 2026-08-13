"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addLessonLogEntry, deleteLessonLogEntry } from "@/lib/lesson-log";
import { todayJstDateString } from "@/lib/date";
import { LESSON_NAMES, type LessonLogEntry } from "@/lib/types";

export default function LessonLogForm({ entries }: { entries: LessonLogEntry[] }) {
  const router = useRouter();
  const [entryDate, setEntryDate] = useState(todayJstDateString());
  const [lessonName, setLessonName] = useState<string>(LESSON_NAMES[0]);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [headcount, setHeadcount] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd() {
    setSubmitting(true);
    setError(null);
    const result = await addLessonLogEntry({
      entryDate,
      lessonName,
      durationMinutes,
      headcount,
      note: note || undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNote("");
    router.refresh();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const result = await deleteLessonLogEntry(id);
    setDeletingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-sm font-semibold">レッスン実績の登録</h3>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          日付
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          レッスン名
          <select
            value={lessonName}
            onChange={(e) => setLessonName(e.target.value)}
            className="w-40 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          >
            {LESSON_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          時間(分)
          <input
            type="number"
            min={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-24 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          参加人数
          <input
            type="number"
            min={1}
            value={headcount}
            onChange={(e) => setHeadcount(Number(e.target.value))}
            className="w-24 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        メモ
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>

      <button
        onClick={handleAdd}
        disabled={submitting}
        className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {submitting ? "登録中..." : "登録する"}
      </button>

      <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-900">
        {entries.length === 0 ? (
          <p className="text-sm text-neutral-400">登録されたレッスンはありません。</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-2 dark:border-neutral-900">
                <span>{e.entry_date}</span>
                <span>{e.lesson_name}</span>
                <span>{e.duration_minutes}分</span>
                <span>{e.headcount}人</span>
                {e.note && <span className="text-neutral-400">{e.note}</span>}
                <button
                  onClick={() => handleDelete(e.id)}
                  disabled={deletingId === e.id}
                  className="text-red-600 underline disabled:opacity-40"
                >
                  {deletingId === e.id ? "削除中..." : "削除"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
