"use client";

import { useState } from "react";
import {
  addMusuhiShift,
  deleteMusuhiShift,
  getMusuhiShifts,
  updateMusuhiShift,
  type MusuhiShift,
} from "@/lib/musuhi-schedule";
import { dayOfWeekForDate, monthEnd } from "@/lib/date";
import { CLOSED_DAY_OF_WEEK, DAY_OF_WEEK_LABEL } from "@/lib/types";

type ShiftWithName = MusuhiShift & { staffName: string };

function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `${y}年${Number(m)}月`;
}

export default function MusuhiScheduleBuilderPanel({
  initialMonthStart,
  initialShifts,
  staffList,
}: {
  initialMonthStart: string;
  initialShifts: ShiftWithName[];
  staffList: { id: string; name: string }[];
}) {
  const [monthStart, setMonthStart] = useState(initialMonthStart);
  const [shifts, setShifts] = useState(initialShifts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function handleShowMonth() {
    setLoading(true);
    setError(null);
    const data = await getMusuhiShifts(monthStart, monthEnd(monthStart));
    setLoading(false);
    setShifts(data);
  }

  async function handleAdd(date: string) {
    setError(null);
    const staffId = staffList[0]?.id;
    if (!staffId) return;
    const result = await addMusuhiShift({ staffId, entryDate: date, startTime: "09:00", endTime: "13:00" });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const staffName = staffList.find((s) => s.id === staffId)?.name ?? "";
    setShifts((prev) => [...prev, { ...result.data, staffName }]);
  }

  async function handleChange(shift: ShiftWithName, patch: { staffId?: string; startTime?: string; endTime?: string }) {
    setError(null);
    const prev = shift;
    const staffName = patch.staffId ? (staffList.find((s) => s.id === patch.staffId)?.name ?? shift.staffName) : shift.staffName;
    setShifts((cur) =>
      cur.map((s) =>
        s.id === shift.id
          ? {
              ...s,
              staff_id: patch.staffId ?? s.staff_id,
              start_time: patch.startTime ?? s.start_time,
              end_time: patch.endTime ?? s.end_time,
              staffName,
            }
          : s,
      ),
    );
    setSavingId(shift.id);
    const result = await updateMusuhiShift(shift.id, patch);
    setSavingId(null);
    if (!result.ok) {
      setError(result.error);
      setShifts((cur) => cur.map((s) => (s.id === shift.id ? prev : s)));
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    const prevShifts = shifts;
    setShifts((cur) => cur.filter((s) => s.id !== id));
    const result = await deleteMusuhiShift(id);
    if (!result.ok) {
      setError(result.error);
      setShifts(prevShifts);
    }
  }

  const [y, m] = monthStart.split("-").map(Number);
  const daysInMonth = Number(monthEnd(monthStart).split("-")[2]);
  const dates = Array.from(
    { length: daysInMonth },
    (_, i) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
  );
  const leadingBlanks = Array(dayOfWeekForDate(dates[0])).fill(null);
  const calendarCells: (string | null)[] = [...leadingBlanks, ...dates];

  const shiftsByDate = new Map<string, ShiftWithName[]>();
  for (const s of shifts) {
    const list = shiftsByDate.get(s.entry_date) ?? [];
    list.push(s);
    shiftsByDate.set(s.entry_date, list);
  }

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

      <p className="text-xs text-neutral-400">日付ごとに「+追加」で受付枠を作り、担当者と時間を選んでください。変更は自動で保存されます。</p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7 gap-1">
          {DAY_OF_WEEK_LABEL.map((label) => (
            <div key={label} className="text-center text-xs text-neutral-400">
              {label}
            </div>
          ))}
          {calendarCells.map((date, i) => {
            if (!date) return <div key={`empty-${i}`} />;
            const day = Number(date.split("-")[2]);
            const isClosedDay = dayOfWeekForDate(date) === CLOSED_DAY_OF_WEEK;
            const dayShifts = shiftsByDate.get(date) ?? [];
            return (
              <div
                key={date}
                className={`flex min-h-16 flex-col gap-1 rounded-lg border p-1 ${
                  isClosedDay
                    ? "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950"
                    : "border-neutral-200 dark:border-neutral-800"
                }`}
              >
                <p className={`text-xs font-semibold ${isClosedDay ? "text-neutral-400" : ""}`}>{day}</p>
                {isClosedDay ? (
                  <p className="text-[10px] text-neutral-400">定休</p>
                ) : (
                  <>
                    {dayShifts.map((s) => (
                      <div key={s.id} className="flex flex-col gap-0.5 rounded border border-neutral-200 p-0.5 dark:border-neutral-800">
                        <div className="flex items-center gap-0.5">
                          <select
                            value={s.staff_id}
                            onChange={(e) => handleChange(s, { staffId: e.target.value })}
                            className="w-full rounded border border-neutral-200 px-0.5 py-0.5 text-[10px] dark:border-neutral-800"
                          >
                            {staffList.map((st) => (
                              <option key={st.id} value={st.id}>
                                {st.name}
                              </option>
                            ))}
                          </select>
                          <button onClick={() => handleDelete(s.id)} className="shrink-0 text-[10px] text-red-600">
                            ×
                          </button>
                        </div>
                        <div className="flex items-center gap-0.5 text-[10px]">
                          <input
                            type="time"
                            value={s.start_time.slice(0, 5)}
                            onChange={(e) => handleChange(s, { startTime: e.target.value })}
                            className="w-14 rounded border border-neutral-200 px-0.5 py-0.5 text-[10px] dark:border-neutral-800"
                          />
                          〜
                          <input
                            type="time"
                            value={s.end_time.slice(0, 5)}
                            onChange={(e) => handleChange(s, { endTime: e.target.value })}
                            className="w-14 rounded border border-neutral-200 px-0.5 py-0.5 text-[10px] dark:border-neutral-800"
                          />
                        </div>
                        {savingId === s.id && <span className="text-[9px] text-neutral-400">保存中...</span>}
                      </div>
                    ))}
                    <button onClick={() => handleAdd(date)} className="self-start text-[10px] underline">
                      + 追加
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
