"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  getAllScheduleSubmissions,
  getScheduleSubmissionStatusList,
  setScheduleEntryConfirmed,
} from "@/lib/schedule-submissions";
import { formatDateTimeJst, monthEnd } from "@/lib/date";
import { SCHEDULE_KIND_LABEL } from "@/lib/types";
import type { ScheduleSubmission } from "@/lib/types";

type EntryWithName = ScheduleSubmission & { staffName: string };
type StatusRow = { staffId: string; staffName: string; submittedAt: string | null };

function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `${y}年${Number(m)}月`;
}

export default function ScheduleReviewPanel({
  initialMonthStart,
  initialEntries,
  initialStatusList,
}: {
  initialMonthStart: string;
  initialEntries: EntryWithName[];
  initialStatusList: StatusRow[];
}) {
  const router = useRouter();
  const [monthStart, setMonthStart] = useState(initialMonthStart);
  const [entries, setEntries] = useState(initialEntries);
  const [statusList, setStatusList] = useState(initialStatusList);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleShowMonth() {
    setLoading(true);
    setError(null);
    const [data, status] = await Promise.all([
      getAllScheduleSubmissions(monthStart, monthEnd(monthStart)),
      getScheduleSubmissionStatusList(monthStart),
    ]);
    setLoading(false);
    setEntries(data);
    setStatusList(status);
  }

  async function handleToggleConfirmed(entry: EntryWithName) {
    setSavingId(entry.id);
    setError(null);
    const result = await setScheduleEntryConfirmed(entry.id, !entry.confirmed);
    setSavingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, confirmed: !e.confirmed } : e)));
    router.refresh();
  }

  // 日付ごとではなく、1人ずつまとめて見やすくする。
  const entriesByStaff = new Map<string, { staffName: string; entries: EntryWithName[] }>();
  for (const e of entries) {
    const group = entriesByStaff.get(e.staff_id) ?? { staffName: e.staffName, entries: [] };
    group.entries.push(e);
    entriesByStaff.set(e.staff_id, group);
  }
  for (const group of entriesByStaff.values()) {
    group.entries.sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  }
  const staffIds = Array.from(entriesByStaff.keys()).sort((a, b) =>
    (entriesByStaff.get(a)?.staffName ?? "").localeCompare(entriesByStaff.get(b)?.staffName ?? "", "ja"),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          対象月
          <input
            type="month"
            value={monthStart.slice(0, 7)}
            onChange={(e) => setMonthStart(`${e.target.value}-01`)}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
        <button
          onClick={handleShowMonth}
          disabled={loading}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          {loading ? "読込中..." : `${formatMonthLabel(monthStart)}を表示`}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <p className="mb-2 text-sm font-semibold">
          提出状況({statusList.filter((s) => s.submittedAt).length}/{statusList.length}人)
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          {statusList.map((s) => (
            <li key={s.staffId} className="flex flex-wrap items-center gap-3">
              <span>{s.staffName}</span>
              {s.submittedAt ? (
                <span className="text-neutral-400">提出済み({formatDateTimeJst(s.submittedAt)})</span>
              ) : (
                <span className="text-red-600">未提出</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {staffIds.length === 0 ? (
        <p className="text-sm text-neutral-400">この月の提出はまだありません。</p>
      ) : (
        <div className="flex flex-col gap-4">
          {staffIds.map((staffId) => {
            const group = entriesByStaff.get(staffId)!;
            const status = statusList.find((s) => s.staffId === staffId);
            return (
              <div key={staffId} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{group.staffName}</p>
                  <span className="text-xs text-neutral-400">({group.entries.length}件)</span>
                  {status?.submittedAt ? (
                    <span className="text-xs text-neutral-400">提出済み</span>
                  ) : (
                    <span className="text-xs text-red-600">未提出</span>
                  )}
                </div>
                <ul className="flex flex-col gap-2 text-sm">
                  {group.entries.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-3">
                      <span className="text-neutral-400">{e.entry_date}</span>
                      {e.start_time && (
                        <span>
                          {e.start_time.slice(0, 5)}
                          {e.end_time ? `〜${e.end_time.slice(0, 5)}` : ""}
                        </span>
                      )}
                      <span>{e.kind === "lesson" ? e.lesson_name : SCHEDULE_KIND_LABEL[e.kind]}</span>
                      {e.note && <span className="text-neutral-400">{e.note}</span>}
                      <label className="ml-auto flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={e.confirmed}
                          disabled={savingId === e.id}
                          onChange={() => handleToggleConfirmed(e)}
                        />
                        確定
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
