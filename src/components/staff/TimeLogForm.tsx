"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addTimeLogEntry, updateTimeLogEntry, deleteTimeLogEntry } from "@/lib/time-log";
import { todayJstDateString, computeWorkedMinutes } from "@/lib/date";
import type { TimeLogEntry } from "@/lib/types";

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}時間${m > 0 ? `${m}分` : ""}`;
}

export default function TimeLogForm({
  payCategoryId,
  categoryName,
  entries,
  periodStart,
  periodEnd,
  staffId,
}: {
  payCategoryId: string;
  categoryName: string;
  entries: TimeLogEntry[];
  periodStart: string;
  periodEnd: string;
  staffId?: string;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(todayJstDateString());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null);
    setEntryDate(todayJstDateString());
    setStartTime("09:00");
    setEndTime("17:00");
    setBreakStart("");
    setBreakEnd("");
    setNote("");
  }

  function startEdit(entry: TimeLogEntry) {
    setError(null);
    setEditingId(entry.id);
    setEntryDate(entry.entry_date);
    setStartTime(entry.start_time.slice(0, 5));
    setEndTime(entry.end_time.slice(0, 5));
    setBreakStart(entry.break_start?.slice(0, 5) ?? "");
    setBreakEnd(entry.break_end?.slice(0, 5) ?? "");
    setNote(entry.note ?? "");
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const input = {
      payCategoryId,
      entryDate,
      startTime,
      endTime,
      breakStart: breakStart || undefined,
      breakEnd: breakEnd || undefined,
      note: note || undefined,
      periodStart,
      periodEnd,
    };
    const result = editingId ? await updateTimeLogEntry(editingId, input, staffId) : await addTimeLogEntry(input, staffId);
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
    const result = await deleteTimeLogEntry(id, payCategoryId, periodStart, periodEnd, staffId);
    setDeletingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (editingId === id) resetForm();
    router.refresh();
  }

  const totalMinutes = entries.reduce(
    (sum, e) =>
      sum +
      computeWorkedMinutes({
        startTime: e.start_time,
        endTime: e.end_time,
        breakStart: e.break_start,
        breakEnd: e.break_end,
      }),
    0,
  );

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-sm font-semibold">{categoryName}(出退勤の記録)</h3>
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
          出勤
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          退勤
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          休憩開始(任意)
          <input
            type="time"
            value={breakStart}
            onChange={(e) => setBreakStart(e.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          休憩終了(任意)
          <input
            type="time"
            value={breakEnd}
            onChange={(e) => setBreakEnd(e.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
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

      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {submitting ? "保存中..." : editingId ? "更新する" : "登録する"}
        </button>
        {editingId && (
          <button onClick={resetForm} className="self-start rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700">
            キャンセル
          </button>
        )}
      </div>

      {/* 管理者の代理入力では、過去の一覧を出すと画面が煩雑になるため入力欄だけにする。
          スタッフ本人の画面では、自分の記録の一覧と今期の合計を見せる。 */}
      {!staffId && (
        <>
          <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-900">
            {entries.length === 0 ? (
              <p className="text-sm text-neutral-400">記録はまだありません。</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {entries.map((e) => {
                  const minutes = computeWorkedMinutes({
                    startTime: e.start_time,
                    endTime: e.end_time,
                    breakStart: e.break_start,
                    breakEnd: e.break_end,
                  });
                  return (
                    <li key={e.id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-2 dark:border-neutral-900">
                      <span>{e.entry_date}</span>
                      <span>
                        {e.start_time.slice(0, 5)}〜{e.end_time.slice(0, 5)}
                      </span>
                      {e.break_start && e.break_end && (
                        <span className="text-neutral-400">
                          (休憩 {e.break_start.slice(0, 5)}〜{e.break_end.slice(0, 5)})
                        </span>
                      )}
                      <span className="font-semibold">{formatMinutes(minutes)}</span>
                      {e.note && <span className="text-neutral-400">{e.note}</span>}
                      <button onClick={() => startEdit(e)} className="underline">
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(e.id)}
                        disabled={deletingId === e.id}
                        className="text-red-600 underline disabled:opacity-40"
                      >
                        {deletingId === e.id ? "削除中..." : "削除"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="text-sm font-semibold">今期の合計: {formatMinutes(totalMinutes)}</p>
        </>
      )}
    </div>
  );
}
