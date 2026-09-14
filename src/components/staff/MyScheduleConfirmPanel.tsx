"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmMonthlySchedule } from "@/lib/schedule-confirmations";
import { formatDateTimeJst } from "@/lib/date";
import { SCHEDULE_KIND_LABEL } from "@/lib/types";
import type { ScheduleSubmission } from "@/lib/types";
import type { MusuhiShift } from "@/lib/musuhi-schedule";

function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `${y}年${Number(m)}月`;
}

export default function MyScheduleConfirmPanel({
  monthStart,
  entries,
  musuhiShifts,
  initialConfirmedAt,
  staffId,
}: {
  monthStart: string;
  entries: ScheduleSubmission[];
  musuhiShifts: MusuhiShift[];
  initialConfirmedAt: string | null;
  staffId?: string;
}) {
  const router = useRouter();
  const [confirmedAt, setConfirmedAt] = useState(initialConfirmedAt);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le lienの確定分と、むすひの担当分をまとめて1つの一覧にする
  // (どちらか一方だけ見て「OK」を押してしまうと、確認漏れになるため)。
  interface Row {
    key: string;
    entryDate: string;
    startTime: string | null;
    endTime: string | null;
    label: string;
    source: "lelien" | "musuhi";
  }
  const rows: Row[] = [
    ...entries
      .filter((e) => e.confirmed && e.kind !== "unavailable")
      .map((e) => ({
        key: `lelien-${e.id}`,
        entryDate: e.entry_date,
        startTime: e.start_time,
        endTime: e.end_time,
        label: e.kind === "lesson" ? (e.lesson_name ?? "レッスン(内容未定)") : SCHEDULE_KIND_LABEL[e.kind],
        source: "lelien" as const,
      })),
    ...musuhiShifts.map((s) => ({
      key: `musuhi-${s.id}`,
      entryDate: s.entry_date,
      startTime: s.start_time,
      endTime: s.end_time,
      label: "むすひ受付",
      source: "musuhi" as const,
    })),
  ].sort((a, b) => a.entryDate.localeCompare(b.entryDate) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  if (rows.length === 0) return null;

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
        {rows.map((r) => (
          <li key={r.key} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-1 dark:border-neutral-900">
            <span>{r.entryDate}</span>
            {r.startTime && (
              <span>
                {r.startTime.slice(0, 5)}
                {r.endTime ? `〜${r.endTime.slice(0, 5)}` : ""}
              </span>
            )}
            <span>{r.label}</span>
            {r.source === "musuhi" && (
              <span className="rounded bg-emerald-50 px-1 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                むすひ
              </span>
            )}
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
