"use client";

import { useState } from "react";
import {
  addScheduleEntry,
  getAllScheduleSubmissions,
  setScheduleEntryConfirmed,
  updateScheduleEntryStaff,
  updateScheduleEntryTime,
} from "@/lib/schedule-submissions";
import { getScheduleNotes, upsertScheduleNote, type ScheduleNote } from "@/lib/schedule-notes";
import { dayOfWeekForDate, monthEnd } from "@/lib/date";
import { CLOSED_DAY_OF_WEEK, DAY_OF_WEEK_LABEL, isClosedOnDate } from "@/lib/types";
import type { LessonOption, ScheduleSubmission } from "@/lib/types";

type EntryWithName = ScheduleSubmission & { staffName: string };

function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `${y}年${Number(m)}月`;
}

function candidateLabel(e: EntryWithName): string {
  const time = e.start_time ? `${e.start_time.slice(0, 5)}${e.end_time ? `〜${e.end_time.slice(0, 5)}` : ""}` : "";
  const what = e.kind === "lesson" ? (e.lesson_name ?? "レッスン希望(未定)") : "受付";
  return [e.staffName, time, what].filter(Boolean).join(" ");
}

export default function ScheduleBuilderPanel({
  initialMonthStart,
  initialEntries,
  initialNotes,
  staffList,
  lessonOptionsByStaff,
}: {
  initialMonthStart: string;
  initialEntries: EntryWithName[];
  initialNotes: ScheduleNote[];
  staffList: { id: string; name: string }[];
  lessonOptionsByStaff: Record<string, LessonOption[]>;
}) {
  const [monthStart, setMonthStart] = useState(initialMonthStart);
  const [entries, setEntries] = useState(initialEntries);
  const [notes, setNotes] = useState(initialNotes);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 候補の数だけプルダウンを出せば足りるが、最初は1行だけ表示し、「+追加」で増やす。
  const [extraSlots, setExtraSlots] = useState<Record<string, number>>({});
  // レッスン名の選択肢に無い名前(自由入力済みの名前)を編集中の枠だけ、テキスト入力に切り替える。
  const [customLessonNameIds, setCustomLessonNameIds] = useState<Set<string>>(new Set());

  // 提出を待たずに、管理者が直接「何時から・何のレッスンを・誰が」担当するかを決めて追加できるようにする。
  const [manualDate, setManualDate] = useState(initialMonthStart);
  const [manualKind, setManualKind] = useState<"reception" | "lesson">("lesson");
  const [manualStartTime, setManualStartTime] = useState("10:00");
  const [manualEndTime, setManualEndTime] = useState("21:00");
  const [manualLessonName, setManualLessonName] = useState("");
  const [manualStaffId, setManualStaffId] = useState(staffList[0]?.id ?? "");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  async function handleShowMonth() {
    setLoading(true);
    setError(null);
    const [data, notesData] = await Promise.all([
      getAllScheduleSubmissions(monthStart, monthEnd(monthStart)),
      getScheduleNotes(monthStart, monthEnd(monthStart)),
    ]);
    setLoading(false);
    setEntries(data);
    setNotes(notesData);
    setExtraSlots({});
  }

  // 休館日の上書き(臨時休業/臨時営業)とイベントなどのメモを保存する。
  async function handleNoteSave(date: string, patch: { isClosedOverride?: boolean | null; note?: string }) {
    setError(null);
    const existing = notes.find((n) => n.entry_date === date);
    const nextNote: ScheduleNote = {
      entry_date: date,
      is_closed_override: patch.isClosedOverride !== undefined ? patch.isClosedOverride : (existing?.is_closed_override ?? null),
      note: patch.note !== undefined ? patch.note : (existing?.note ?? null),
    };
    setNotes((prev) => [...prev.filter((n) => n.entry_date !== date), nextNote]);
    const result = await upsertScheduleNote({
      entryDate: date,
      isClosedOverride: nextNote.is_closed_override,
      note: nextNote.note ?? "",
    });
    if (!result.ok) {
      setError(result.error);
      if (existing) setNotes((prev) => [...prev.filter((n) => n.entry_date !== date), existing]);
    }
  }

  async function handleSelect(key: string, prevId: string, nextId: string) {
    setError(null);
    // 通信を待たず、まず画面を即座に切り替える(体感速度のため)。失敗したら元に戻す。
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id === prevId) return { ...e, confirmed: false };
        if (e.id === nextId) return { ...e, confirmed: true };
        return e;
      }),
    );
    setSavingKey(key);
    const [prevResult, nextResult] = await Promise.all([
      prevId ? setScheduleEntryConfirmed(prevId, false) : null,
      nextId ? setScheduleEntryConfirmed(nextId, true) : null,
    ]);
    setSavingKey(null);
    const failed = (prevResult && !prevResult.ok && prevResult) || (nextResult && !nextResult.ok && nextResult);
    if (failed) {
      setError(failed.error);
      // 反映に失敗した分は元に戻す。
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id === prevId) return { ...e, confirmed: true };
          if (e.id === nextId) return { ...e, confirmed: false };
          return e;
        }),
      );
    }
  }

  async function handleTimeEdit(entry: EntryWithName, startTime: string, endTime: string) {
    setError(null);
    const prevStart = entry.start_time;
    const prevEnd = entry.end_time;
    // 通信を待たず、まず画面を即座に反映する(体感速度のため)。失敗したら元に戻す。
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, start_time: startTime, end_time: endTime || null } : e)),
    );
    const result = await updateScheduleEntryTime(entry.id, { startTime, endTime: endTime || undefined });
    if (!result.ok) {
      setError(result.error);
      setEntries((prev) => (prev.map((e) => (e.id === entry.id ? { ...e, start_time: prevStart, end_time: prevEnd } : e))));
    }
  }

  // 確定済みの予定の担当スタッフを、別のスタッフに差し替える。
  async function handleStaffChange(entry: EntryWithName, staffId: string) {
    setError(null);
    const prevStaffId = entry.staff_id;
    const prevStaffName = entry.staffName;
    const nextStaffName = staffList.find((s) => s.id === staffId)?.name ?? "";
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, staff_id: staffId, staffName: nextStaffName } : e)),
    );
    const result = await updateScheduleEntryStaff(entry.id, staffId);
    if (!result.ok) {
      setError(result.error);
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, staff_id: prevStaffId, staffName: prevStaffName } : e)),
      );
    }
  }

  // レッスン名を決めずに時間帯だけ提出された候補に、実際に担当するレッスン名を割り当てる。
  async function handleAssignLesson(entry: EntryWithName, lessonName: string) {
    setError(null);
    const prevName = entry.lesson_name;
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, lesson_name: lessonName || null } : e)));
    const result = await updateScheduleEntryTime(entry.id, {
      startTime: entry.start_time ?? "",
      endTime: entry.end_time ?? undefined,
      lessonName,
    });
    if (!result.ok) {
      setError(result.error);
      setEntries((prev) => (prev.map((e) => (e.id === entry.id ? { ...e, lesson_name: prevName } : e))));
    }
  }

  async function handleManualAdd() {
    setManualError(null);
    if (!manualStaffId) {
      setManualError("担当スタッフを選んでください。");
      return;
    }
    if (manualKind === "lesson" && !manualLessonName.trim()) {
      setManualError("レッスン名を入力してください。");
      return;
    }
    setManualSubmitting(true);
    const result = await addScheduleEntry(
      {
        entryDate: manualDate,
        kind: manualKind,
        startTime: manualStartTime,
        endTime: manualKind === "reception" ? manualEndTime : undefined,
        lessonName: manualKind === "lesson" ? manualLessonName.trim() : undefined,
      },
      manualStaffId,
    );
    if (!result.ok) {
      setManualSubmitting(false);
      setManualError(result.error);
      return;
    }
    const confirmResult = await setScheduleEntryConfirmed(result.data.id, true);
    setManualSubmitting(false);
    if (!confirmResult.ok) {
      setManualError(confirmResult.error);
      return;
    }
    const staffName = staffList.find((s) => s.id === manualStaffId)?.name ?? "";
    setEntries((prev) => [...prev, { ...result.data, confirmed: true, staffName }]);
    setManualLessonName("");
  }

  const [y, m] = monthStart.split("-").map(Number);
  const daysInMonth = Number(monthEnd(monthStart).split("-")[2]);
  const dates = Array.from(
    { length: daysInMonth },
    (_, i) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
  );

  const entriesByDateKind = new Map<string, EntryWithName[]>();
  for (const e of entries) {
    if (e.kind === "unavailable") continue;
    const key = `${e.entry_date}|${e.kind}`;
    const list = entriesByDateKind.get(key) ?? [];
    list.push(e);
    entriesByDateKind.set(key, list);
  }
  // 入力した順番ではなく、開始時刻の早い順に並べる(組み立てやすいように)。
  for (const list of entriesByDateKind.values()) {
    list.sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  }

  function renderKindSection(date: string, kind: "reception" | "lesson", label: string) {
    const key = `${date}|${kind}`;
    const candidates = entriesByDateKind.get(key) ?? [];
    if (candidates.length === 0) return null;

    const confirmedIds = candidates.filter((c) => c.confirmed).map((c) => c.id);
    // レッスンは1日最大5本程度なので、最初から5枠分表示しておく(受付は1〜2人程度なので1枠から)。
    const defaultSlots = kind === "lesson" ? 5 : 1;
    const slotCount = Math.min(candidates.length, Math.max(confirmedIds.length, defaultSlots, extraSlots[key] ?? 0));
    const slots = Array.from({ length: slotCount }, (_, i) => confirmedIds[i] ?? "");

    return (
      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] text-neutral-500">
          {label}
          {savingKey === key && <span className="ml-1 text-neutral-400">保存中...</span>}
        </p>
        {slots.map((selectedId, i) => {
          const usedElsewhere = new Set(slots.filter((_, j) => j !== i).filter(Boolean));
          const options = candidates.filter((c) => !usedElsewhere.has(c.id) || c.id === selectedId);
          const selected = candidates.find((c) => c.id === selectedId);
          return (
            <div key={i} className="flex flex-col gap-0.5">
              <select
                value={selectedId}
                onChange={(e) => handleSelect(key, selectedId, e.target.value)}
                className="w-full max-w-full rounded border border-neutral-200 px-1 py-0.5 text-[10px] dark:border-neutral-800"
              >
                <option value="">-- 未選択 --</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {candidateLabel(c)}
                  </option>
                ))}
              </select>
              {selected && (
                <select
                  value={selected.staff_id}
                  onChange={(e) => handleStaffChange(selected, e.target.value)}
                  className="w-full max-w-full rounded border border-neutral-200 px-1 py-0.5 text-[10px] dark:border-neutral-800"
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              {selected && (
                <div className="flex items-center gap-0.5 text-[10px]">
                  <input
                    type="time"
                    value={selected.start_time?.slice(0, 5) ?? ""}
                    onChange={(e) => handleTimeEdit(selected, e.target.value, selected.end_time?.slice(0, 5) ?? "")}
                    className="w-14 rounded border border-neutral-200 px-0.5 py-0.5 text-[10px] dark:border-neutral-800"
                  />
                  {(kind === "reception" || (kind === "lesson" && !selected.lesson_name)) && (
                    <>
                      〜
                      <input
                        type="time"
                        value={selected.end_time?.slice(0, 5) ?? ""}
                        onChange={(e) => handleTimeEdit(selected, selected.start_time?.slice(0, 5) ?? "", e.target.value)}
                        className="w-14 rounded border border-neutral-200 px-0.5 py-0.5 text-[10px] dark:border-neutral-800"
                      />
                    </>
                  )}
                </div>
              )}
              {selected &&
                kind === "lesson" &&
                (() => {
                  const lessonOptions = lessonOptionsByStaff[selected.staff_id] ?? [];
                  const currentName = selected.lesson_name ?? "";
                  const inOptions = lessonOptions.some((o) => o.name === currentName);
                  const showCustomInput = customLessonNameIds.has(selected.id) || (currentName !== "" && !inOptions);
                  return (
                    <div className="flex flex-col gap-0.5">
                      <select
                        value={showCustomInput ? "__custom__" : currentName}
                        onChange={(e) => {
                          if (e.target.value === "__custom__") {
                            setCustomLessonNameIds((prev) => new Set(prev).add(selected.id));
                            return;
                          }
                          setCustomLessonNameIds((prev) => {
                            const next = new Set(prev);
                            next.delete(selected.id);
                            return next;
                          });
                          handleAssignLesson(selected, e.target.value);
                        }}
                        className={`w-full max-w-full rounded border px-1 py-0.5 text-[10px] ${
                          currentName
                            ? "border-neutral-200 dark:border-neutral-800"
                            : "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
                        }`}
                      >
                        <option value="">-- 未選択 --</option>
                        {lessonOptions.map((o) => (
                          <option key={o.id} value={o.name}>
                            {o.name}
                          </option>
                        ))}
                        <option value="__custom__">その他(自由入力)</option>
                      </select>
                      {showCustomInput && (
                        <input
                          defaultValue={inOptions ? "" : currentName}
                          placeholder="レッスン名を入力して確定"
                          onBlur={(e) => e.target.value.trim() && handleAssignLesson(selected, e.target.value.trim())}
                          className="w-full rounded border border-amber-400 bg-amber-50 px-1 py-0.5 text-[10px] dark:border-amber-700 dark:bg-amber-950"
                        />
                      )}
                    </div>
                  );
                })()}
            </div>
          );
        })}
        {slotCount < candidates.length && (
          <button
            onClick={() => setExtraSlots((prev) => ({ ...prev, [key]: slotCount + 1 }))}
            className="self-start text-[10px] underline"
          >
            + 追加
          </button>
        )}
      </div>
    );
  }

  const notesByDate = new Map(notes.map((n) => [n.entry_date, n]));

  // カレンダーの見た目に合わせて、月初の曜日分だけ空マスを差し込む。
  const leadingBlanks = Array(dayOfWeekForDate(dates[0])).fill(null);
  const calendarCells: (string | null)[] = [...leadingBlanks, ...dates];

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

      <p className="text-xs text-neutral-400">
        提出された候補の中から、日付ごとにプルダウンで選ぶと、その予定が確定します(スケジュール管理の「確定」チェックと連動しています)。
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <p className="text-sm font-semibold">手動で追加する</p>
        <p className="text-xs text-neutral-400">
          提出を待たずに、何時から・何のレッスン(または受付)を・誰が担当するかを直接決めて追加できます。
        </p>
        {manualError && <p className="text-sm text-red-600">{manualError}</p>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            日付
            <input
              type="date"
              value={manualDate}
              min={monthStart}
              max={monthEnd(monthStart)}
              onChange={(e) => setManualDate(e.target.value)}
              className="rounded-lg border border-neutral-200 px-2 py-1.5 text-sm dark:border-neutral-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            種別
            <select
              value={manualKind}
              onChange={(e) => setManualKind(e.target.value as "reception" | "lesson")}
              className="rounded-lg border border-neutral-200 px-2 py-1.5 text-sm dark:border-neutral-800"
            >
              <option value="lesson">レッスン</option>
              <option value="reception">受付</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            開始時刻
            <input
              type="time"
              value={manualStartTime}
              onChange={(e) => setManualStartTime(e.target.value)}
              className="rounded-lg border border-neutral-200 px-2 py-1.5 text-sm dark:border-neutral-800"
            />
          </label>
          {manualKind === "reception" && (
            <label className="flex flex-col gap-1 text-xs">
              終了時刻
              <input
                type="time"
                value={manualEndTime}
                onChange={(e) => setManualEndTime(e.target.value)}
                className="rounded-lg border border-neutral-200 px-2 py-1.5 text-sm dark:border-neutral-800"
              />
            </label>
          )}
          {manualKind === "lesson" && (
            <label className="flex flex-col gap-1 text-xs">
              レッスン名
              <input
                value={manualLessonName}
                onChange={(e) => setManualLessonName(e.target.value)}
                placeholder="例: 筋膜リリース75"
                className="w-40 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm dark:border-neutral-800"
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs">
            担当
            <select
              value={manualStaffId}
              onChange={(e) => setManualStaffId(e.target.value)}
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
            onClick={handleManualAdd}
            disabled={manualSubmitting}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {manualSubmitting ? "追加中..." : "追加する"}
          </button>
        </div>
      </div>

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
              const isClosedDay = isClosedOnDate(date, noteEntry?.is_closed_override);
              const isDefaultClosed = dayOfWeekForDate(date) === CLOSED_DAY_OF_WEEK;
              const reception = renderKindSection(date, "reception", "受付");
              const lesson = renderKindSection(date, "lesson", "レッスン");
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
                      noteEntry?.is_closed_override === true
                        ? "closed"
                        : noteEntry?.is_closed_override === false
                          ? "open"
                          : "default"
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      handleNoteSave(date, { isClosedOverride: v === "closed" ? true : v === "open" ? false : null });
                    }}
                    className="w-full rounded border border-neutral-200 text-[9px] dark:border-neutral-800"
                  >
                    <option value="default">{isDefaultClosed ? "定休" : "営業"}</option>
                    <option value="closed">臨時休業</option>
                    <option value="open">臨時営業</option>
                  </select>
                  <input
                    type="text"
                    defaultValue={noteEntry?.note ?? ""}
                    placeholder="イベント等メモ"
                    onBlur={(e) => handleNoteSave(date, { note: e.target.value })}
                    className="w-full rounded border border-neutral-200 px-0.5 text-[9px] dark:border-neutral-800"
                  />
                  {isClosedDay ? (
                    <p className="text-[10px] text-neutral-400">休館</p>
                  ) : (
                    <>
                      {reception}
                      {lesson}
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
