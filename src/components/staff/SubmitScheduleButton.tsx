"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitSchedule } from "@/lib/schedule-submissions";
import { formatDateTimeJst } from "@/lib/date";

export default function SubmitScheduleButton({
  monthStart,
  submittedAt,
  staffId,
}: {
  monthStart: string;
  submittedAt: string | null;
  staffId?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await submitSchedule(monthStart, staffId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-sm text-neutral-500">
        来月分の入力が終わったら押してください。管理者が一覧で確認できるようになります。
        {submittedAt && `(提出済み: ${formatDateTimeJst(submittedAt)})`}
      </p>
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {submitting ? "提出中..." : submittedAt ? "再提出する" : "スケジュールを提出する"}
      </button>
    </div>
  );
}
