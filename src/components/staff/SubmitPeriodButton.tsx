"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitPeriodEntries } from "@/lib/staff-self";
import { formatDateTimeJst } from "@/lib/date";

export default function SubmitPeriodButton({
  periodStart,
  submittedAt,
}: {
  periodStart: string;
  submittedAt: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await submitPeriodEntries(periodStart);
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
        今日の分の入力が終わったら、その都度押してください。管理者に通知が届きます。
        {submittedAt && `(最終提出: ${formatDateTimeJst(submittedAt)})`}
      </p>
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {submitting ? "提出中..." : "本日の勤務を提出する"}
      </button>
    </div>
  );
}
