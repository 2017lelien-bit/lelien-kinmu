"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitSchedule, getOwnScheduleSubmissionStatus, getOwnScheduleSubmissionNote } from "@/lib/schedule-submissions";
import { formatDateTimeJst, addMonthsToMonthStart } from "@/lib/date";

export default function SubmitScheduleButton({
  monthStart,
  submittedAt,
  initialNote,
  staffId,
}: {
  monthStart: string;
  submittedAt: string | null;
  initialNote?: string | null;
  staffId?: string;
}) {
  const router = useRouter();
  const maxMonthStart = addMonthsToMonthStart(monthStart, 12);
  // スケジュール入力欄では来月より先の月も入力できるので、提出もどの月の分か選べるようにする
  // (以前は常に「来月」固定で提出していたため、先の月を入力して提出したつもりでも、
  // 実際には来月分の提出として記録されてしまう不具合があった)。
  const [targetMonth, setTargetMonth] = useState(monthStart);
  const [targetSubmittedAt, setTargetSubmittedAt] = useState(submittedAt);
  // 個々の予定とは別に、月全体についての伝言(「今月は入れません」等)。
  // 以前は日々の予定入力フォームの「メモ」欄に書いても、実際に予定を1件も登録しない限り
  // どこにも保存されなかった(=管理者に伝わらなかった)ため、ここで確実に保存できるようにする。
  const [note, setNote] = useState(initialNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);

  async function handleMonthChange(newMonth: string) {
    setTargetMonth(newMonth);
    setError(null);
    setLoadingStatus(true);
    const [status, noteData] = await Promise.all([
      getOwnScheduleSubmissionStatus(newMonth, staffId),
      getOwnScheduleSubmissionNote(newMonth, staffId),
    ]);
    setLoadingStatus(false);
    setTargetSubmittedAt(status);
    setNote(noteData ?? "");
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await submitSchedule(targetMonth, note, staffId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTargetSubmittedAt(new Date().toISOString());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <label className="flex items-center gap-2 text-sm">
        提出する月
        <input
          type="month"
          value={targetMonth.slice(0, 7)}
          min={monthStart.slice(0, 7)}
          max={maxMonthStart.slice(0, 7)}
          onChange={(e) => handleMonthChange(`${e.target.value}-01`)}
          className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        今月についてのメモ(任意。「今月は入れません」等、日付に紐づかない伝言はここに書いてください)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>
      <p className="text-sm text-neutral-500">
        その月の入力が終わったら押してください。管理者が一覧で確認できるようになります。
        {loadingStatus ? "(確認中...)" : targetSubmittedAt && `(提出済み: ${formatDateTimeJst(targetSubmittedAt)})`}
      </p>
      <button
        onClick={handleSubmit}
        disabled={submitting || loadingStatus}
        className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {submitting ? "提出中..." : targetSubmittedAt ? "再提出する" : "スケジュールを提出する"}
      </button>
    </div>
  );
}
