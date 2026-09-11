"use client";

import { useState } from "react";
import {
  addScheduleEntry,
  setScheduleEntryConfirmed,
  updateScheduleEntryStaff,
  updateScheduleEntryTime,
} from "@/lib/schedule-submissions";
import { upsertScheduleNote, type ScheduleNote } from "@/lib/schedule-notes";
import type { LessonColor } from "@/lib/lesson-colors";
import LessonColorEditor from "@/components/staff/LessonColorEditor";
import { dayOfWeekForDate, monthEnd } from "@/lib/date";
import { CLOSED_DAY_OF_WEEK, DAY_OF_WEEK_LABEL, isClosedOnDate } from "@/lib/types";
import type { LessonOption, ScheduleSubmission } from "@/lib/types";

type EntryWithName = ScheduleSubmission & { staffName: string };
type PrintType = "staff" | "customer" | "hp";

// レッスン名ごとの色は、凡例(このコンポーネント内)から自由に設定できる。まだ設定されていない
// 名前は、目立つように黄色の帯を既定色として使う。
const DEFAULT_COLOR = "#FFFF00";

// 背景色の明るさから、読みやすい文字色(白 or 黒)を自動で選ぶ。
function readableTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000000" : "#ffffff";
}

function lessonStyle(name: string, colorMap: Map<string, LessonColor>): { backgroundColor?: string; color?: string } {
  const config = colorMap.get(name);
  if (config?.style === "none") return {};
  if (config?.style === "text") return { color: config.color };
  const bg = config?.color ?? DEFAULT_COLOR;
  return { backgroundColor: bg, color: readableTextColor(bg) };
}

function formatTime(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

// 日付の横に詰めて書くための短い時刻表記("09:00"→"9"、"13:30"→"13:30")。
function formatTimeCompact(t: string | null): string {
  if (!t) return "";
  const [h, min] = t.slice(0, 5).split(":");
  return min === "00" ? String(Number(h)) : `${Number(h)}:${min}`;
}

function candidateLabel(e: EntryWithName): string {
  const time = e.start_time ? `${e.start_time.slice(0, 5)}${e.end_time ? `〜${e.end_time.slice(0, 5)}` : ""}` : "";
  const what = e.kind === "lesson" ? (e.lesson_name ?? "レッスン希望(未定)") : "受付";
  return [e.staffName, time, what].filter(Boolean).join(" ");
}

export default function SchedulePrintCalendar({
  monthStart,
  type,
  initialEntries,
  initialNotes,
  lessonColorRows,
  staffList,
  lessonOptionsByStaff,
}: {
  monthStart: string;
  type: PrintType;
  initialEntries: EntryWithName[];
  initialNotes: ScheduleNote[];
  lessonColorRows: LessonColor[];
  staffList: { id: string; name: string }[];
  lessonOptionsByStaff: Record<string, LessonOption[]>;
}) {
  // サーバー側の再取得(router.refresh)が反映されたら、そちらを正として同期する
  // (レンダー中にsetStateする、Reactが推奨する「propsからstateを導出し直す」パターン)。
  const [prevEntries, setPrevEntries] = useState(initialEntries);
  const [entries, setEntries] = useState(initialEntries);
  if (initialEntries !== prevEntries) {
    setPrevEntries(initialEntries);
    setEntries(initialEntries);
  }
  const [prevNotes, setPrevNotes] = useState(initialNotes);
  const [notes, setNotes] = useState(initialNotes);
  if (initialNotes !== prevNotes) {
    setPrevNotes(initialNotes);
    setNotes(initialNotes);
  }

  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // レッスン名の選択肢に無い名前(自由入力済みの名前)を編集中の枠だけ、テキスト入力に切り替える。
  const [customLessonNameIds, setCustomLessonNameIds] = useState<Set<string>>(new Set());

  // 提出を待たずに、管理者が直接「何時から・何のレッスンを・誰が」担当するかを決めて追加できるようにする。
  const [manualDate, setManualDate] = useState(monthStart);
  const [manualKind, setManualKind] = useState<"reception" | "lesson">("lesson");
  const [manualStartTime, setManualStartTime] = useState("10:00");
  const [manualEndTime, setManualEndTime] = useState("21:00");
  const [manualLessonName, setManualLessonName] = useState("");
  const [manualStaffId, setManualStaffId] = useState(staffList[0]?.id ?? "");
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const colorMap = new Map(lessonColorRows.map((c) => [c.lesson_name, c]));
  const notesByDate = new Map(notes.map((n) => [n.entry_date, n]));

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

  // 候補の確定/確定解除を切り替える(prevId・nextIdのどちらかは空文字でもよい)。
  async function handleSelect(key: string, prevId: string, nextId: string) {
    setError(null);
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
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, start_time: startTime, end_time: endTime || null } : e)),
    );
    const result = await updateScheduleEntryTime(entry.id, { startTime, endTime: endTime || undefined });
    if (!result.ok) {
      setError(result.error);
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, start_time: prevStart, end_time: prevEnd } : e)));
    }
  }

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
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, lesson_name: prevName } : e)));
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
  for (const list of entriesByDateKind.values()) {
    list.sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  }

  const lessonNamesUsed = Array.from(
    new Set(entries.filter((e) => e.kind === "lesson" && e.confirmed).map((e) => e.lesson_name ?? "(レッスン名未定)")),
  ).sort();

  // カレンダーの見た目に合わせて、月初の曜日分だけ空マスを差し込む。
  const leadingBlanks: (string | null)[] = Array(dayOfWeekForDate(dates[0])).fill(null);
  const calendarCells: (string | null)[] = [...leadingBlanks, ...dates];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  function renderLessonEditControls(entry: EntryWithName) {
    const lessonOptions = lessonOptionsByStaff[entry.staff_id] ?? [];
    const currentName = entry.lesson_name ?? "";
    const inOptions = lessonOptions.some((o) => o.name === currentName);
    const showCustomInput = customLessonNameIds.has(entry.id) || (currentName !== "" && !inOptions);
    return (
      <div className="flex flex-col gap-0.5 print:hidden">
        <select
          value={entry.staff_id}
          onChange={(e) => handleStaffChange(entry, e.target.value)}
          className="w-full rounded border border-neutral-300 px-1 py-0.5 text-[9px] dark:border-neutral-700"
        >
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={showCustomInput ? "__custom__" : currentName}
          onChange={(e) => {
            if (e.target.value === "__custom__") {
              setCustomLessonNameIds((prev) => new Set(prev).add(entry.id));
              return;
            }
            setCustomLessonNameIds((prev) => {
              const next = new Set(prev);
              next.delete(entry.id);
              return next;
            });
            handleAssignLesson(entry, e.target.value);
          }}
          className="w-full rounded border border-neutral-300 px-1 py-0.5 text-[9px] dark:border-neutral-700"
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
            onBlur={(e) => e.target.value.trim() && handleAssignLesson(entry, e.target.value.trim())}
            className="w-full rounded border border-amber-400 bg-amber-50 px-1 py-0.5 text-[9px] dark:border-amber-700 dark:bg-amber-950"
          />
        )}
        <div className="flex items-center gap-0.5">
          <input
            type="time"
            value={entry.start_time?.slice(0, 5) ?? ""}
            onChange={(e) => handleTimeEdit(entry, e.target.value, entry.end_time?.slice(0, 5) ?? "")}
            className="w-14 rounded border border-neutral-300 px-0.5 py-0.5 text-[9px] dark:border-neutral-700"
          />
          {!entry.lesson_name && (
            <>
              〜
              <input
                type="time"
                value={entry.end_time?.slice(0, 5) ?? ""}
                onChange={(e) => handleTimeEdit(entry, entry.start_time?.slice(0, 5) ?? "", e.target.value)}
                className="w-14 rounded border border-neutral-300 px-0.5 py-0.5 text-[9px] dark:border-neutral-700"
              />
            </>
          )}
          <button
            onClick={() => handleSelect(`${entry.entry_date}|lesson`, entry.id, "")}
            className="ml-auto text-[9px] text-red-600 underline"
          >
            外す
          </button>
        </div>
      </div>
    );
  }

  function renderReceptionEditControls(entry: EntryWithName) {
    return (
      <div className="flex flex-col gap-0.5 print:hidden">
        <select
          value={entry.staff_id}
          onChange={(e) => handleStaffChange(entry, e.target.value)}
          className="w-full rounded border border-neutral-300 px-1 py-0.5 text-[9px] dark:border-neutral-700"
        >
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-0.5">
          <input
            type="time"
            value={entry.start_time?.slice(0, 5) ?? ""}
            onChange={(e) => handleTimeEdit(entry, e.target.value, entry.end_time?.slice(0, 5) ?? "")}
            className="w-14 rounded border border-neutral-300 px-0.5 py-0.5 text-[9px] dark:border-neutral-700"
          />
          〜
          <input
            type="time"
            value={entry.end_time?.slice(0, 5) ?? ""}
            onChange={(e) => handleTimeEdit(entry, entry.start_time?.slice(0, 5) ?? "", e.target.value)}
            className="w-14 rounded border border-neutral-300 px-0.5 py-0.5 text-[9px] dark:border-neutral-700"
          />
          <button
            onClick={() => handleSelect(`${entry.entry_date}|reception`, entry.id, "")}
            className="ml-auto text-[9px] text-red-600 underline"
          >
            外す
          </button>
        </div>
      </div>
    );
  }

  // まだ確定していない候補(他のスタッフの提出など)から選んで確定させる。
  function renderAddCandidate(date: string, kind: "reception" | "lesson") {
    const key = `${date}|${kind}`;
    const candidates = (entriesByDateKind.get(key) ?? []).filter((c) => !c.confirmed);
    if (candidates.length === 0) return null;
    return (
      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) handleSelect(key, "", e.target.value);
          e.target.value = "";
        }}
        className="w-full rounded border border-dashed border-neutral-400 px-1 py-0.5 text-[9px] text-neutral-500 print:hidden dark:border-neutral-600"
      >
        <option value="">+ 候補から追加</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {candidateLabel(c)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-600 print:hidden">{error}</p>}

      {type === "staff" && (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 print:hidden dark:border-neutral-800">
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
      )}

      {lessonNamesUsed.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {lessonNamesUsed.map((name) => {
            const style = lessonStyle(name, colorMap);
            const config = colorMap.get(name);
            return (
              <span key={name} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm border border-black/10"
                  style={{ backgroundColor: style.backgroundColor ?? style.color ?? "#ffffff" }}
                />
                <span style={style}>{name}</span>
                <LessonColorEditor lessonName={name} style={config?.style ?? "band"} color={config?.color ?? DEFAULT_COLOR} />
              </span>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-neutral-400 bg-neutral-400 text-[10px]">
        {DAY_OF_WEEK_LABEL.map((label, i) => (
          <div
            key={label}
            className={`bg-neutral-100 py-1 text-center text-xs font-semibold ${i === 0 ? "text-red-600" : ""}`}
          >
            {label}
          </div>
        ))}
        {calendarCells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} className="min-h-28 bg-white" />;

          const day = Number(date.split("-")[2]);
          const dow = dayOfWeekForDate(date);
          const isDefaultClosed = dow === CLOSED_DAY_OF_WEEK;
          const noteEntry = notesByDate.get(date);
          const isClosedDay = isClosedOnDate(date, noteEntry?.is_closed_override);
          const reception = (entriesByDateKind.get(`${date}|reception`) ?? []).filter((e) => e.confirmed);
          const lessons = (entriesByDateKind.get(`${date}|lesson`) ?? []).filter((e) => e.confirmed);

          return (
            <div key={date} className={`flex min-h-28 flex-col gap-0.5 p-1 ${isClosedDay ? "bg-neutral-100" : "bg-white"}`}>
              <div className="flex flex-wrap items-baseline gap-x-1">
                <p className={`font-semibold ${dow === 0 ? "text-red-600" : ""}`}>{day}</p>
                {!isClosedDay &&
                  type === "staff" &&
                  reception.map((e) => (
                    <span key={e.id} className="text-neutral-600">
                      {e.staffName}
                      {formatTimeCompact(e.start_time)}-{formatTimeCompact(e.end_time)}
                    </span>
                  ))}
                {(savingKey === `${date}|reception` || savingKey === `${date}|lesson`) && (
                  <span className="text-neutral-400 print:hidden">保存中...</span>
                )}
              </div>

              {type === "staff" && (
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
                  className="w-full rounded border border-neutral-200 text-[9px] print:hidden dark:border-neutral-800"
                >
                  <option value="default">{isDefaultClosed ? "定休" : "営業"}</option>
                  <option value="closed">臨時休業</option>
                  <option value="open">臨時営業</option>
                </select>
              )}
              {type === "staff" && (
                <input
                  type="text"
                  defaultValue={noteEntry?.note ?? ""}
                  placeholder="イベント等メモ"
                  onBlur={(e) => handleNoteSave(date, { note: e.target.value })}
                  className="w-full rounded border border-neutral-200 px-0.5 text-[9px] print:hidden dark:border-neutral-800"
                />
              )}

              {isClosedDay ? (
                <p className="text-neutral-400">{noteEntry?.note || "定休日"}</p>
              ) : (
                <>
                  {noteEntry?.note && <p className="italic text-neutral-500">{noteEntry.note}</p>}

                  {type === "staff" &&
                    reception.map((e) => <div key={e.id}>{renderReceptionEditControls(e)}</div>)}
                  {type === "staff" && renderAddCandidate(date, "reception")}

                  {lessons.map((e) => {
                    const name = e.lesson_name ?? "(レッスン名未定)";
                    return (
                      <div key={e.id} className="flex flex-col gap-0.5">
                        <p className="rounded px-1 py-0.5 leading-tight" style={lessonStyle(name, colorMap)}>
                          {formatTime(e.start_time)} {name}
                          {type !== "hp" && `(${e.staffName})`}
                        </p>
                        {type === "staff" && renderLessonEditControls(e)}
                      </div>
                    );
                  })}
                  {type === "staff" && renderAddCandidate(date, "lesson")}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
