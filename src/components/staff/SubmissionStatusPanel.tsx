"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acknowledgeSubmission } from "@/lib/staff-admin";
import { formatDateTimeJst } from "@/lib/date";

export default function SubmissionStatusPanel({
  staffId,
  periodStart,
  submittedAt,
  acknowledgedAt,
}: {
  staffId: string;
  periodStart: string;
  submittedAt: string | null;
  acknowledgedAt: string | null;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  if (!submittedAt) {
    return <p className="text-sm text-neutral-400">今期の提出: まだありません</p>;
  }

  const pending = !acknowledgedAt;

  async function handleAcknowledge() {
    setSubmitting(true);
    await acknowledgeSubmission(staffId, periodStart);
    setSubmitting(false);
    router.refresh();
  }

  return (
    <p className="flex flex-wrap items-center gap-3 text-sm">
      <span className={pending ? "font-semibold text-red-600" : "text-neutral-500"}>
        今期の提出: {formatDateTimeJst(submittedAt)}{pending ? "(未確認)" : "(確認済み)"}
      </span>
      {pending && (
        <button onClick={handleAcknowledge} disabled={submitting} className="underline disabled:opacity-40">
          {submitting ? "更新中..." : "確認済みにする"}
        </button>
      )}
    </p>
  );
}
