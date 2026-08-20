"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addLessonLogEntry, deleteLessonLogEntry, updateLessonLogEntry } from "@/lib/lesson-log";
import { todayJstDateString } from "@/lib/date";
import { LESSON_NAMES, type LessonLogEntry } from "@/lib/types";

export default function LessonLogForm({ entries, staffId }: { entries: LessonLogEntry[]; staffId?: string }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(todayJstDateString());
  const [lessonName, setLessonName] = useState<string>(LESSON_NAMES[0]);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [headcount, setHeadcount] = useState(1);
  const [startTime, setStartTime] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 承認済みのものは管理者側でのみ確認できればよく、ここに残すと画面が見づらくなるため表示しない。
  const visibleEntries = entries.filter((e) => !e.approved);

  function resetForm() {
    setEditingId(null);
    setEntryDate(todayJstDateString());
    setLessonName(LESSON_NAMES[0]);
    setDurationMinutes(60);
    setHeadcount(1);
    setStartTime("");
    setNote("");
  }

  function startEdit(entry: LessonLogEntry) {
    setError(null);
    setEditingId(entry.id);
    setEntryDate(entry.entry_date);
    setLessonName(entry.lesson_name);
    setDurationMinutes(entry.duration_minutes);
    setHeadcount(entry.headcount);
    setStartTime(entry.start_time?.slice(0, 5) ?? "");
    setNote(entry.note ?? "");
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const input = {
      entryDate,
      lessonName,
      durationMinutes,
      headcount,
      startTime: startTime || undefined,
      note: note || undefined,
    };
    const result = editingId
      ? await updateLessonLogEntry(editingId, input, staffId)
      : await addLessonLogEntry(input, staffId);
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
    const result = await deleteLessonLogEntry(id, staffId);
    setDeletingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (editingId === id) resetForm();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-sm font-semibold">{editingId ? "レッスン実績の編集" : "レッスン実績の登録"}</h3>
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
            onFocus={(e) => e.target.select()}
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
            onFocus={(e) => e.target.select()}
            onChange={(e) => setHeadcount(Number(e.target.value))}
            className="w-24 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          開始時刻(任意)
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
      </div>
      <p className="text-xs text-neutral-400">
        開始時刻を入れると、同じ日の受付シフトと時間が重なっているレッスンだけが、受付の時給から差し引かれます。
      </p>

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
          スタッフ本人の画面では、自分の未承認レッスンの一覧を見せる。 */}
      {!staffId && (
        <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-900">
          {visibleEntries.length === 0 ? (
            <p className="text-sm text-neutral-400">登録されたレッスンはありません。</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {visibleEntries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-2 dark:border-neutral-900">
                  <span>{e.entry_date}</span>
                  {e.start_time && <span>{e.start_time.slice(0, 5)}〜</span>}
                  <span>{e.lesson_name}</span>
                  <span>{e.duration_minutes}分</span>
                  <span>{e.headcount}人</span>
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
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
