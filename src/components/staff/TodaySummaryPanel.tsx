"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setLessonLogEntryApproval } from "@/lib/staff-admin";
import { updateLessonLogEntry, deleteLessonLogEntry } from "@/lib/lesson-log";
import { updateTimeLogEntry, deleteTimeLogEntry } from "@/lib/time-log";
import {
  getPeriodCategorySummary,
  getPeriodSummary,
  type PeriodCategorySummary,
  type TodayLessonSummary,
  type TodayShiftSummary,
} from "@/lib/payroll";
import { LESSON_NAMES } from "@/lib/types";
import { payPeriodForDate, currentPayPeriod, payPeriodEnd } from "@/lib/date";

export default function TodaySummaryPanel({
  staffId,
  lessons,
  shifts,
  headcountMatters,
}: {
  staffId: string;
  lessons: TodayLessonSummary[];
  shifts: TodayShiftSummary[];
  // 単価が人数で変わらないスタッフは、参加人数は常に1(意味を持たない値)なので表示・編集させない。
  headcountMatters: boolean;
}) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ lessonName: "", durationMinutes: 60, headcount: 1, startTime: "" });
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [shiftEditValues, setShiftEditValues] = useState({ startTime: "", endTime: "", breakStart: "", breakEnd: "" });
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 「本日」以外の期間もまとめて確認・訂正できるように、指定期間で見ている間はこちらのデータを表示する。
  const [viewingPeriod, setViewingPeriod] = useState<{ periodStart: string; periodEnd: string } | null>(null);
  const [viewPeriodStart, setViewPeriodStart] = useState(currentPayPeriod().periodStart);
  const [viewData, setViewData] = useState<{ lessons: TodayLessonSummary[]; shifts: TodayShiftSummary[] } | null>(null);
  const [categoryData, setCategoryData] = useState<PeriodCategorySummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const displayLessons = viewingPeriod ? (viewData?.lessons ?? []) : lessons;
  const displayShifts = viewingPeriod ? (viewData?.shifts ?? []) : shifts;

  async function handleShowPeriod() {
    setLoadingHistory(true);
    setError(null);
    const periodEnd = payPeriodEnd(viewPeriodStart);
    const [data, categories] = await Promise.all([
      getPeriodSummary(staffId, viewPeriodStart, periodEnd),
      getPeriodCategorySummary(staffId, viewPeriodStart),
    ]);
    setLoadingHistory(false);
    setViewingPeriod({ periodStart: viewPeriodStart, periodEnd });
    setViewData(data);
    setCategoryData(categories);
  }

  function handleBackToToday() {
    setViewingPeriod(null);
    setViewData(null);
    setCategoryData([]);
  }

  async function handleDeleteLesson(id: string) {
    setDeletingId(id);
    setError(null);
    const result = await deleteLessonLogEntry(id, staffId);
    setDeletingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (viewingPeriod) await handleShowPeriod();
    router.refresh();
  }

  async function handleDeleteShift(s: TodayShiftSummary) {
    setDeletingId(s.id);
    setError(null);
    const { periodStart, periodEnd } = payPeriodForDate(s.entryDate);
    const result = await deleteTimeLogEntry(s.id, s.payCategoryId, periodStart, periodEnd, staffId);
    setDeletingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (viewingPeriod) await handleShowPeriod();
    router.refresh();
  }

  const lessonsTotal = displayLessons.reduce((sum, l) => sum + l.rate, 0);
  const shiftsTotal = displayShifts.reduce((sum, s) => sum + s.amount, 0);
  const hasLeLienShift = displayShifts.some((s) => s.categoryName.toLowerCase().replace(/\s+/g, "").includes("lelien"));

  async function handleApprove(lessonId: string) {
    setSavingId(lessonId);
    setError(null);
    const result = await setLessonLogEntryApproval(lessonId, true);
    setSavingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (viewingPeriod) await handleShowPeriod();
    router.refresh();
  }

  function startEdit(l: TodayLessonSummary) {
    setError(null);
    setEditingId(l.id);
    setEditValues({
      lessonName: l.lessonName,
      durationMinutes: l.durationMinutes,
      headcount: l.headcount,
      startTime: l.startTime?.slice(0, 5) ?? "",
    });
  }

  async function handleSaveEdit(l: TodayLessonSummary) {
    setSavingId(l.id);
    setError(null);
    const result = await updateLessonLogEntry(
      l.id,
      {
        entryDate: l.entryDate,
        lessonName: editValues.lessonName,
        durationMinutes: editValues.durationMinutes,
        headcount: editValues.headcount,
        startTime: editValues.startTime || undefined,
      },
      staffId,
    );
    setSavingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditingId(null);
    if (viewingPeriod) await handleShowPeriod();
    router.refresh();
  }

  function startEditShift(s: TodayShiftSummary) {
    setError(null);
    setEditingShiftId(s.id);
    setShiftEditValues({
      startTime: s.startTime.slice(0, 5),
      endTime: s.endTime.slice(0, 5),
      breakStart: s.breakStart?.slice(0, 5) ?? "",
      breakEnd: s.breakEnd?.slice(0, 5) ?? "",
    });
  }

  async function handleSaveShiftEdit(s: TodayShiftSummary) {
    setSavingId(s.id);
    setError(null);
    const { periodStart, periodEnd } = payPeriodForDate(s.entryDate);
    const result = await updateTimeLogEntry(
      s.id,
      {
        payCategoryId: s.payCategoryId,
        entryDate: s.entryDate,
        startTime: shiftEditValues.startTime,
        endTime: shiftEditValues.endTime,
        breakStart: shiftEditValues.breakStart || undefined,
        breakEnd: shiftEditValues.breakEnd || undefined,
        periodStart,
        periodEnd,
      },
      staffId,
    );
    setSavingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditingShiftId(null);
    if (viewingPeriod) await handleShowPeriod();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{viewingPeriod ? `${viewingPeriod.periodStart}〜${viewingPeriod.periodEnd}の実績` : "本日の実績"}</h2>
        {viewingPeriod && (
          <button onClick={handleBackToToday} className="text-xs underline">
            本日の表示に戻す
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-b border-neutral-100 pb-3 text-sm dark:border-neutral-900">
        <label className="flex flex-col gap-1">
          期間を選んで確認(16日締め)
          <input
            type="date"
            value={viewPeriodStart}
            onChange={(e) => setViewPeriodStart(e.target.value)}
            className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
          />
        </label>
        <button
          onClick={handleShowPeriod}
          disabled={loadingHistory}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-40 dark:border-neutral-700"
        >
          {loadingHistory ? "読込中..." : "この期間の実績を確認する"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {viewingPeriod && categoryData.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-neutral-500">区分ごとの入力(この期間の合計)</p>
          <ul className="flex flex-col gap-1 text-sm">
            {categoryData.map((c) => (
              <li key={c.categoryId} className="flex flex-wrap items-center gap-3">
                <span>{c.categoryName}</span>
                <span className="text-neutral-400">
                  {c.quantity}
                  {c.unitType === "hourly" ? "時間" : "回"} × ¥{c.rate.toLocaleString()}
                </span>
                <span className="font-semibold">¥{c.subtotal.toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-neutral-400">
            日付ごとの内訳ではなく、この期間の合計(スタッフが入力した最新の数字)です。
          </p>
        </div>
      )}

      {displayLessons.length === 0 && displayShifts.length === 0 && categoryData.length === 0 && (
        <p className="text-sm text-neutral-400">{viewingPeriod ? "この期間の入力はありません。" : "本日の入力はまだありません。"}</p>
      )}

      {displayLessons.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-neutral-500">レッスン {displayLessons.length}本(合計 ¥{lessonsTotal.toLocaleString()})</p>
          <ul className="flex flex-col gap-2 text-sm">
            {displayLessons.map((l) =>
              editingId === l.id ? (
                <li key={l.id} className="flex flex-wrap items-center gap-2 border-b border-neutral-100 pb-2 dark:border-neutral-900">
                  <input
                    type="time"
                    value={editValues.startTime}
                    onChange={(e) => setEditValues((v) => ({ ...v, startTime: e.target.value }))}
                    className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
                  />
                  <select
                    value={editValues.lessonName}
                    onChange={(e) => setEditValues((v) => ({ ...v, lessonName: e.target.value }))}
                    className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
                  >
                    {LESSON_NAMES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={editValues.durationMinutes}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setEditValues((v) => ({ ...v, durationMinutes: Number(e.target.value) }))}
                    className="w-16 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
                  />
                  分
                  <input
                    type="number"
                    min={1}
                    value={editValues.headcount}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setEditValues((v) => ({ ...v, headcount: Number(e.target.value) }))}
                    className="w-16 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
                  />
                  人
                  <button
                    onClick={() => handleSaveEdit(l)}
                    disabled={savingId === l.id}
                    className="rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40 dark:bg-white dark:text-black"
                  >
                    {savingId === l.id ? "保存中..." : "保存"}
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-xs underline">
                    キャンセル
                  </button>
                </li>
              ) : (
                <li key={l.id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-2 dark:border-neutral-900">
                  {viewingPeriod && <span className="text-neutral-400">{l.entryDate}</span>}
                  {l.startTime && <span>{l.startTime.slice(0, 5)}〜</span>}
                  <span>{l.lessonName}</span>
                  {headcountMatters && <span>{l.headcount}人</span>}
                  <span className="font-semibold">
                    {l.rate > 0 ? `¥${l.rate.toLocaleString()}` : "該当ルールなし"}
                  </span>
                  {l.approved ? (
                    <span className="text-neutral-400">承認済み</span>
                  ) : (
                    <button
                      onClick={() => handleApprove(l.id)}
                      disabled={savingId === l.id}
                      className="rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40 dark:bg-white dark:text-black"
                    >
                      {savingId === l.id ? "更新中..." : "承認する"}
                    </button>
                  )}
                  <button onClick={() => startEdit(l)} className="ml-auto text-xs underline">
                    訂正する
                  </button>
                  <button
                    onClick={() => handleDeleteLesson(l.id)}
                    disabled={deletingId === l.id}
                    className="text-xs text-red-600 underline disabled:opacity-40"
                  >
                    {deletingId === l.id ? "削除中..." : "削除"}
                  </button>
                </li>
              ),
            )}
          </ul>
        </div>
      )}

      {displayShifts.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-900">
          <p className="text-xs text-neutral-500">出退勤(合計 ¥{shiftsTotal.toLocaleString()})</p>
          <ul className="flex flex-col gap-2 text-sm">
            {displayShifts.map((s) =>
              editingShiftId === s.id ? (
                <li key={s.id} className="flex flex-wrap items-center gap-2 border-b border-neutral-100 pb-2 dark:border-neutral-900">
                  <span>{s.categoryName}</span>
                  出勤
                  <input
                    type="time"
                    value={shiftEditValues.startTime}
                    onChange={(e) => setShiftEditValues((v) => ({ ...v, startTime: e.target.value }))}
                    className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
                  />
                  退勤
                  <input
                    type="time"
                    value={shiftEditValues.endTime}
                    onChange={(e) => setShiftEditValues((v) => ({ ...v, endTime: e.target.value }))}
                    className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
                  />
                  休憩
                  <input
                    type="time"
                    value={shiftEditValues.breakStart}
                    onChange={(e) => setShiftEditValues((v) => ({ ...v, breakStart: e.target.value }))}
                    className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
                  />
                  〜
                  <input
                    type="time"
                    value={shiftEditValues.breakEnd}
                    onChange={(e) => setShiftEditValues((v) => ({ ...v, breakEnd: e.target.value }))}
                    className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
                  />
                  <button
                    onClick={() => handleSaveShiftEdit(s)}
                    disabled={savingId === s.id}
                    className="rounded-lg bg-neutral-900 px-3 py-1 text-xs text-white disabled:opacity-40 dark:bg-white dark:text-black"
                  >
                    {savingId === s.id ? "保存中..." : "保存"}
                  </button>
                  <button onClick={() => setEditingShiftId(null)} className="text-xs underline">
                    キャンセル
                  </button>
                </li>
              ) : (
                <li key={s.id} className="flex flex-wrap items-center gap-3">
                  {viewingPeriod && <span className="text-neutral-400">{s.entryDate}</span>}
                  <span>{s.categoryName}</span>
                  <span>
                    {s.startTime.slice(0, 5)}〜{s.endTime.slice(0, 5)}({s.hours}時間)
                  </span>
                  <span className="font-semibold">¥{s.amount.toLocaleString()}</span>
                  <button onClick={() => startEditShift(s)} className="ml-auto text-xs underline">
                    訂正する
                  </button>
                  <button
                    onClick={() => handleDeleteShift(s)}
                    disabled={deletingId === s.id}
                    className="text-xs text-red-600 underline disabled:opacity-40"
                  >
                    {deletingId === s.id ? "削除中..." : "削除"}
                  </button>
                </li>
              ),
            )}
          </ul>
          {hasLeLienShift && (
            <p className="text-xs text-neutral-400">
              「Le lien」区分は、同じ日にレッスンと時間が重なっていた場合、1レッスンにつき2時間分が実際の反映額から差し引かれます(むすひなど他の区分には適用されません)。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
