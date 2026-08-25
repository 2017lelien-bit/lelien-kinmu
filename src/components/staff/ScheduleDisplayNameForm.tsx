"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateScheduleDisplayName } from "@/lib/staff-admin";

export default function ScheduleDisplayNameForm({
  staffId,
  initialName,
}: {
  staffId: string;
  initialName: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateScheduleDisplayName(staffId, name);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-sm font-semibold">スケジュール表示名</h3>
      <p className="text-xs text-neutral-400">
        スケジュール作成画面(カレンダー)で、このスタッフの名前の代わりに表示する短い名前です(例: Miho, Michi)。空欄なら通常の氏名が使われます。
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: Miho"
          className="w-40 rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}
