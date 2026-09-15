"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveCorrectionRequest, type CorrectionRequest } from "@/lib/correction-requests";

const ENTRY_TYPE_LABEL: Record<string, string> = {
  time_log: "出退勤",
  lesson_log: "レッスン実績",
  pay_entry: "実績入力",
};

export default function CorrectionRequestsPanel({ requests }: { requests: (CorrectionRequest & { staffName: string })[] }) {
  const router = useRouter();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  if (requests.length === 0) return null;

  async function handleResolve(id: string) {
    setResolvingId(id);
    await resolveCorrectionRequest(id);
    setResolvingId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-400 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
      <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">訂正の依頼({requests.length}件)</h2>
      <ul className="flex flex-col gap-2 text-sm">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start gap-3 border-b border-amber-200 pb-2 dark:border-amber-800">
            <div className="flex flex-col">
              <span className="font-semibold">
                {r.staffName}さん・{r.entry_date}・{ENTRY_TYPE_LABEL[r.entry_type] ?? r.entry_type}
              </span>
              <span>{r.note}</span>
            </div>
            <button
              onClick={() => handleResolve(r.id)}
              disabled={resolvingId === r.id}
              className="ml-auto shrink-0 rounded-lg border border-amber-400 px-3 py-1 text-xs disabled:opacity-40 dark:border-amber-700"
            >
              {resolvingId === r.id ? "更新中..." : "対応済みにする"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
