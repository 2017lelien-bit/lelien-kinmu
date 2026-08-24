"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addLessonOption, deleteLessonOption } from "@/lib/schedule-submissions";
import type { LessonOption } from "@/lib/types";

export default function LessonOptionsManager({
  options,
  staffId,
}: {
  options: LessonOption[];
  staffId?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd() {
    setAdding(true);
    setError(null);
    const result = await addLessonOption(name, staffId);
    setAdding(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName("");
    router.refresh();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const result = await deleteLessonOption(id, staffId);
    setDeletingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-sm font-semibold">担当できるレッスンの登録</h3>
      <p className="text-xs text-neutral-400">
        ここに登録しておくと、スケジュール提出時にレッスン名を選択肢から選べるようになります。
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {options.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm">
          {options.map((o) => (
            <li key={o.id} className="flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1 dark:border-neutral-800">
              {o.name}
              <button
                onClick={() => handleDelete(o.id)}
                disabled={deletingId === o.id}
                className="text-red-600 disabled:opacity-40"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 筋膜リリース75"
          className="w-48 rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !name.trim()}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          {adding ? "追加中..." : "追加する"}
        </button>
      </div>
    </div>
  );
}
