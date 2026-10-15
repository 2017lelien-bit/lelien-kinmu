"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addMusuhiShift,
  deleteMusuhiShift,
  fillMusuhiFromLelienReception,
  getMusuhiNotes,
  getMusuhiShifts,
  previewMusuhiPublish,
  publishMusuhiBooking,
  undoLastMusuhiPublish,
  updateMusuhiShift,
  upsertMusuhiNote,
  type MusuhiLastPublish,
  type MusuhiNote,
  type MusuhiPublishChange,
  type MusuhiShift,
} from "@/lib/musuhi-schedule";
import { dayOfWeekForDate, monthEnd } from "@/lib/date";
import { isJapaneseHoliday } from "@/lib/holidays";
import { CLOSED_DAY_OF_WEEK, DAY_OF_WEEK_LABEL, isClosedOnDate } from "@/lib/types";
import SaveImageButton from "@/components/staff/SaveImageButton";

type ShiftWithName = MusuhiShift & { staffName: string };

function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `${y}年${Number(m)}月`;
}

// 日付の横に詰めて書くための短い時刻表記("09:00"→"9"、"13:30"→"13:30")。
function formatTimeCompact(t: string): string {
  const [h, min] = t.slice(0, 5).split(":");
  return min === "00" ? String(Number(h)) : `${Number(h)}:${min}`;
}

export default function MusuhiScheduleBuilderPanel({
  initialMonthStart,
  initialShifts,
  initialNotes,
  initialLastPublish,
  staffList,
}: {
  initialMonthStart: string;
  initialShifts: ShiftWithName[];
  initialNotes: MusuhiNote[];
  initialLastPublish: MusuhiLastPublish | null;
  staffList: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [monthStart, setMonthStart] = useState(initialMonthStart);
  const [shifts, setShifts] = useState(initialShifts);
  const [notes, setNotes] = useState(initialNotes);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  // Le lienの受付を参考に埋める機能。2人が入れ替わる組み合わせを選ぶ。
  const [pairStaffAId, setPairStaffAId] = useState(staffList[0]?.id ?? "");
  const [pairStaffBId, setPairStaffBId] = useState(staffList[1]?.id ?? "");
  const [filling, setFilling] = useState(false);
  const [fillMessage, setFillMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<{
    changes: MusuhiPublishChange[];
    unchangedDays: number;
    monthStart: string;
  } | null>(null);
  const [lastPublish, setLastPublish] = useState(initialLastPublish);

  async function handleShowMonth() {
    setLoading(true);
    setError(null);
    const [data, notesData] = await Promise.all([
      getMusuhiShifts(monthStart, monthEnd(monthStart)),
      getMusuhiNotes(monthStart, monthEnd(monthStart)),
    ]);
    setLoading(false);
    setShifts(data);
    setNotes(notesData);
  }

  // 定休日(月曜)以外にも、臨時休業・臨時営業を個別に指定できるようにする。
  async function handleNoteSave(date: string, isClosedOverride: boolean | null) {
    setError(null);
    const existing = notes.find((n) => n.entry_date === date);
    setNotes((prev) => [...prev.filter((n) => n.entry_date !== date), { entry_date: date, is_closed_override: isClosedOverride }]);
    const result = await upsertMusuhiNote({ entryDate: date, isClosedOverride });
    if (!result.ok) {
      setError(result.error);
      setNotes((prev) => (existing ? [...prev.filter((n) => n.entry_date !== date), existing] : prev.filter((n) => n.entry_date !== date)));
      return;
    }
    router.refresh();
  }

  async function handleFillFromLelien() {
    setFilling(true);
    setError(null);
    setFillMessage(null);
    const result = await fillMusuhiFromLelienReception({
      monthStart,
      monthEnd: monthEnd(monthStart),
      staffAId: pairStaffAId,
      staffBId: pairStaffBId,
    });
    setFilling(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFillMessage(result.data.created > 0 ? `${result.data.created}件を反映しました。` : "反映できる新しい予定はありませんでした。");
    await handleShowMonth();
    router.refresh();
  }

  // 保存しただけでは予約サイトは変わらない。まず「反映内容を確認」で変更点を見て、
  // 問題なければ「この内容で反映する」を押す。反映後も「取り消す」で元に戻せる。
  async function handleCheckPublish() {
    setChecking(true);
    setError(null);
    setPublishMessage(null);
    setPendingChanges(null);
    let result;
    try {
      result = await previewMusuhiPublish(monthStart, monthEnd(monthStart));
    } catch (e) {
      console.error("[handleCheckPublish] failed", e);
      setChecking(false);
      setError("確認に失敗しました(通信エラーまたはタイムアウト)。もう一度お試しください。");
      return;
    }
    setChecking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPendingChanges({ ...result.data, monthStart });
  }

  async function handlePublish() {
    if (!pendingChanges) return;
    setPublishing(true);
    setError(null);
    let result;
    try {
      result = await publishMusuhiBooking(pendingChanges.monthStart, monthEnd(pendingChanges.monthStart));
    } catch (e) {
      console.error("[handlePublish] failed", e);
      setPublishing(false);
      setError("反映に失敗しました(通信エラーまたはタイムアウト)。もう一度お試しください。");
      return;
    }
    setPublishing(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPendingChanges(null);
    setPublishMessage(`${formatMonthLabel(pendingChanges.monthStart)}分(${result.data.published}日分)をむすひ予約サイトへ反映しました。`);
    setLastPublish({
      id: "latest",
      publishedAt: new Date().toISOString(),
      monthStart: pendingChanges.monthStart,
      changedDays: result.data.published,
    });
  }

  async function handleUndoPublish() {
    if (!window.confirm("直前の反映を取り消して、むすひ予約サイトを反映前の状態に戻します。よろしいですか?")) return;
    setUndoing(true);
    setError(null);
    setPublishMessage(null);
    let result;
    try {
      result = await undoLastMusuhiPublish();
    } catch (e) {
      console.error("[handleUndoPublish] failed", e);
      setUndoing(false);
      setError("取り消しに失敗しました(通信エラーまたはタイムアウト)。もう一度お試しください。");
      return;
    }
    setUndoing(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLastPublish(null);
    setPendingChanges(null);
    setPublishMessage(`直前の反映を取り消しました(${result.data.restored}日分を元に戻しました)。`);
    router.refresh();
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
    router.refresh();
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
    } else {
      router.refresh();
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
    } else {
      router.refresh();
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
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const shiftsByDate = new Map<string, ShiftWithName[]>();
  for (const s of shifts) {
    const list = shiftsByDate.get(s.entry_date) ?? [];
    list.push(s);
    shiftsByDate.set(s.entry_date, list);
  }
  const notesByDate = new Map(notes.map((n) => [n.entry_date, n]));

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

      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <p className="text-sm font-semibold">Le lienの受付を参考に埋める</p>
        <p className="text-xs text-neutral-400">
          選んだ2人が入れ替わる関係として、Le lienの受付に入っている時間と同じ時間で、むすひ側にまだ何も入っていない枠だけ自動で追加します(すでに何か入っている枠はそのまま。追加後に自由に微調整できます)。
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Le lienが
            <select
              value={pairStaffAId}
              onChange={(e) => setPairStaffAId(e.target.value)}
              className="rounded-lg border border-neutral-200 px-2 py-1.5 text-sm dark:border-neutral-800"
            >
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <span className="pb-2 text-xs text-neutral-400">のとき、むすひは</span>
          <label className="flex flex-col gap-1 text-xs">
            &nbsp;
            <select
              value={pairStaffBId}
              onChange={(e) => setPairStaffBId(e.target.value)}
              className="rounded-lg border border-neutral-200 px-2 py-1.5 text-sm dark:border-neutral-800"
            >
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={handleFillFromLelien}
            disabled={filling || !pairStaffAId || !pairStaffBId}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {filling ? "反映中..." : "反映する"}
          </button>
          {fillMessage && <span className="text-xs text-neutral-500">{fillMessage}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <p className="text-sm font-semibold">むすひの予約サイトへ反映(確認してから反映)</p>
        <p className="text-xs text-neutral-400">
          ここで保存したスケジュールは、まだお客様向けの予約サイトには反映されません。「反映内容を確認」で変更点を見て、問題なければ「この内容で反映する」を押してください。反映したあとでも「直前の反映を取り消す」で元に戻せます。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleCheckPublish}
            disabled={checking || publishing || undoing}
            className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {checking ? "確認中..." : `${formatMonthLabel(monthStart)}分の反映内容を確認`}
          </button>
          {lastPublish && (
            <button
              onClick={handleUndoPublish}
              disabled={checking || publishing || undoing}
              className="self-start rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 disabled:opacity-40 dark:border-red-800"
            >
              {undoing ? "取り消し中..." : "直前の反映を取り消す"}
            </button>
          )}
          {publishMessage && <span className="text-xs text-neutral-500">{publishMessage}</span>}
        </div>
        {lastPublish && (
          <p className="text-xs text-neutral-400">
            直前の反映: {new Date(lastPublish.publishedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}(
            {formatMonthLabel(lastPublish.monthStart)}分・{lastPublish.changedDays}日分)
          </p>
        )}
        {pendingChanges && (
          <div className="flex flex-col gap-2 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-900">
            {pendingChanges.changes.length === 0 ? (
              <p className="text-sm">
                {formatMonthLabel(pendingChanges.monthStart)}分は、すべて予約サイトと同じ内容です。反映する変更はありません。
              </p>
            ) : (
              <>
                <p className="text-sm font-semibold">
                  {formatMonthLabel(pendingChanges.monthStart)}分: {pendingChanges.changes.length}日分が変わります
                  (変更なし{pendingChanges.unchangedDays}日)
                </p>
                <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto text-sm">
                  {pendingChanges.changes.map((c) => (
                    <li key={c.date} className="flex flex-wrap gap-x-2">
                      <span className="font-semibold">
                        {Number(c.date.split("-")[1])}/{Number(c.date.split("-")[2])}
                      </span>
                      <span className="text-neutral-500">{c.before}</span>
                      <span>→</span>
                      <span>{c.after}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button
                    onClick={handlePublish}
                    disabled={publishing}
                    className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
                  >
                    {publishing ? "反映中..." : "この内容で反映する"}
                  </button>
                  <button
                    onClick={() => setPendingChanges(null)}
                    disabled={publishing}
                    className="rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
                  >
                    やめる
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

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
            const noteEntry = notesByDate.get(date);
            const isDefaultClosed = dayOfWeekForDate(date) === CLOSED_DAY_OF_WEEK;
            const isClosedDay = isClosedOnDate(date, noteEntry?.is_closed_override);
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
                <select
                  value={
                    noteEntry?.is_closed_override === true ? "closed" : noteEntry?.is_closed_override === false ? "open" : "default"
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    handleNoteSave(date, v === "closed" ? true : v === "open" ? false : null);
                  }}
                  className="w-full rounded border border-neutral-200 text-[9px] dark:border-neutral-800"
                >
                  <option value="default">{isDefaultClosed ? "休館日" : "営業"}</option>
                  <option value="closed">臨時休業</option>
                  <option value="open">臨時営業</option>
                </select>
                {isClosedDay ? (
                  <p className="text-[10px] text-neutral-400">休館</p>
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

      <div className="flex flex-col gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-neutral-500">プレビュー(むすひスケジュールのみ)</p>
          <SaveImageButton targetId="musuhi-only-preview" filename={`${monthStart.slice(0, 7)}-musuhi-schedule.png`} />
        </div>
        <div className="overflow-x-auto">
          <div id="musuhi-only-preview" className="flex min-w-[700px] flex-col gap-2 bg-white p-2">
            <p className="text-center text-lg font-bold text-black">{formatMonthLabel(monthStart)}むすひスケジュール</p>
            <div className="grid grid-cols-7 gap-px rounded border border-neutral-400 bg-neutral-400 text-[10px]">
              {DAY_OF_WEEK_LABEL.map((label, i) => (
                <div
                  key={label}
                  className={`bg-neutral-100 py-1 text-center text-xs font-semibold ${i === 0 ? "text-red-600" : ""}`}
                >
                  {label}
                </div>
              ))}
              {calendarCells.map((date, i) => {
                if (!date) return <div key={`empty-preview-${i}`} className="min-h-20 bg-white" />;
                const day = Number(date.split("-")[2]);
                const dow = dayOfWeekForDate(date);
                const noteEntry = notesByDate.get(date);
                const isClosedDay = isClosedOnDate(date, noteEntry?.is_closed_override);
                const dayShifts = (shiftsByDate.get(date) ?? []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
                return (
                  <div key={date} className={`flex min-h-20 flex-col gap-0.5 p-1 ${isClosedDay ? "bg-neutral-100" : "bg-white"}`}>
                    <p className={`font-semibold ${dow === 0 || isJapaneseHoliday(date) ? "text-red-600" : ""}`}>{day}</p>
                    {isClosedDay ? (
                      <p className="text-neutral-400">休業</p>
                    ) : (
                      dayShifts.map((s) => (
                        <p key={s.id} className="text-neutral-800">
                          {s.staffName} {formatTimeCompact(s.start_time)}-{formatTimeCompact(s.end_time)}
                        </p>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
