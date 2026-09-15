"use client";

import { useState } from "react";
import { requestCorrection } from "@/lib/correction-requests";

// 提出済み・承認済みで自分では書き換えられなくなった記録について、管理者に訂正を
// 依頼するためのボタン。押すと管理者に通知が届く。
export default function CorrectionRequestButton({
  entryType,
  entryDate,
  staffId,
}: {
  entryType: string;
  entryDate: string;
  staffId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await requestCorrection(entryType, entryDate, note, staffId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSent(true);
    setOpen(false);
  }

  if (sent) {
    return <span className="text-xs text-neutral-400">管理者に依頼を送りました</span>;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-blue-600 underline">
        訂正を依頼する
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="どこをどう直したいか入力してください"
        rows={2}
        className="rounded border border-neutral-200 px-2 py-1 text-xs dark:border-neutral-800"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {submitting ? "送信中..." : "管理者に送る"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded border border-neutral-300 px-3 py-1 text-xs dark:border-neutral-700">
          キャンセル
        </button>
      </div>
    </div>
  );
}
