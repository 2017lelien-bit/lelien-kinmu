"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setLessonLogEntryApproval } from "@/lib/staff-admin";
import type { LessonLogEntry } from "@/lib/types";

export default function LessonLogApprovalPanel({ entries }: { entries: LessonLogEntry[] }) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingEntries = entries.filter((e) => !e.approved);

  async function handleApprove(entry: LessonLogEntry) {
    setSavingId(entry.id);
    setError(null);
    const result = await setLessonLogEntryApproval(entry.id, true);
    setSavingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">レッスン実績の確認</h2>
      <p className="text-xs text-neutral-400">承認すると、この一覧から消えます。</p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {pendingEntries.length === 0 ? (
        <p className="text-sm text-neutral-400">確認待ちのレッスン実績はありません。</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {pendingEntries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-2 dark:border-neutral-900">
              <span>{entry.entry_date}</span>
              <span>{entry.lesson_name}</span>
              <span>{entry.duration_minutes}分</span>
              <span className="font-semibold">{entry.headcount}人</span>
              {entry.note && <span className="text-neutral-400">{entry.note}</span>}
              <button
                onClick={() => handleApprove(entry)}
                disabled={savingId === entry.id}
                className="ml-auto rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40 dark:bg-white dark:text-black"
              >
                {savingId === entry.id ? "更新中..." : "承認する"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
