"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acknowledgeSubmission, type PendingSubmission } from "@/lib/staff-admin";
import { formatDateTimeJst } from "@/lib/date";

export default function SubmissionStatusPanel({
  staffId,
  pending,
}: {
  staffId: string;
  pending: PendingSubmission[];
}) {
  const router = useRouter();
  const [submittingDate, setSubmittingDate] = useState<string | null>(null);

  if (pending.length === 0) {
    return <p className="text-sm text-neutral-400">確認待ちの提出はありません</p>;
  }

  async function handleAcknowledge(date: string) {
    setSubmittingDate(date);
    await acknowledgeSubmission(staffId, date);
    setSubmittingDate(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      {pending.map((p) => (
        <p key={p.date} className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-red-600">
            {p.date}の提出: {formatDateTimeJst(p.submittedAt)}(未確認)
          </span>
          <button
            onClick={() => handleAcknowledge(p.date)}
            disabled={submittingDate === p.date}
            className="underline disabled:opacity-40"
          >
            {submittingDate === p.date ? "更新中..." : "確認済みにする"}
          </button>
        </p>
      ))}
    </div>
  );
}
