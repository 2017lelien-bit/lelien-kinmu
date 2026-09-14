"use client";

import { useState } from "react";
import { notifyPendingScheduleConfirmations } from "@/lib/schedule-confirmations";

export default function NotifyPendingConfirmationsButton({
  monthStart,
  monthEndDate,
}: {
  monthStart: string;
  monthEndDate: string;
}) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setSending(true);
    setError(null);
    setMessage(null);
    const result = await notifyPendingScheduleConfirmations(monthStart, monthEndDate);
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(
      result.data.notified > 0 ? `${result.data.notified}人に通知を送りました。` : "未確認のスタッフはいませんでした。",
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={handleSend}
        disabled={sending}
        className="rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
      >
        {sending ? "送信中..." : "未確認のスタッフに通知を送る"}
      </button>
      {message && <span className="text-xs text-neutral-500">{message}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
