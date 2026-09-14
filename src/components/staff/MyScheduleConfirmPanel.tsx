"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmMonthlySchedule } from "@/lib/schedule-confirmations";
import { formatDateTimeJst } from "@/lib/date";
import { SCHEDULE_KIND_LABEL } from "@/lib/types";
import type { ScheduleSubmission } from "@/lib/types";

function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `${y}年${Number(m)}月`;
}

export default function MyScheduleConfirmPanel({
  monthStart,
  entries,
  initialConfirmedAt,
  staffId,
}: {
  monthStart: string;
  entries: ScheduleSubmission[];
  initialConfirmedAt: string | null;
  staffId?: string;
}) {
  const router = useRouter();
  const [confirmedAt, setConfirmedAt] = useState(initialConfirmedAt);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = entries
    .filter((e) => e.confirmed && e.kind !== "unavailable")
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || (a.start_time ?? "").localeCompare(b.start_time ?? ""));

  if (confirmed.length === 0) return null;

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    const result = await confirmMonthlySchedule(monthStart, staffId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConfirmedAt(new Date().toISOString());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-sm font-semibold">{formatMonthLabel(monthStart)}のスケジュールはこちらになりますが、OKですか？</h3>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-1 text-sm">
        {confirmed.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-1 dark:border-neutral-900">
            <span>{e.entry_date}</span>
            {e.start_time && (
              <span>
                {e.start_time.slice(0, 5)}
                {e.end_time ? `〜${e.end_time.slice(0, 5)}` : ""}
              </span>
            )}
            <span>{e.kind === "lesson" ? (e.lesson_name ?? "レッスン(内容未定)") : SCHEDULE_KIND_LABEL[e.kind]}</span>
          </li>
        ))}
      </ul>
      {confirmedAt ? (
        <p className="text-sm text-neutral-500">確認済み({formatDateTimeJst(confirmedAt)})</p>
      ) : (
        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="self-start rounded-lg bg-neutral-900 px-6 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {submitting ? "送信中..." : "OK(このスケジュールで確定)"}
        </button>
      )}
    </div>
  );
}
