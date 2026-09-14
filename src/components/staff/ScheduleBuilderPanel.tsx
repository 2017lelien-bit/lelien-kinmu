"use client";

import { useState } from "react";
import {
  addScheduleEntry,
  assignScheduleEntryLessonName,
  getAllScheduleSubmissions,
  setScheduleEntryConfirmed,
  updateScheduleEntryStaff,
  updateScheduleEntryTime,
} from "@/lib/schedule-submissions";
import { getScheduleNotes, upsertScheduleNote, type ScheduleNote } from "@/lib/schedule-notes";
import { getMusuhiShifts, type MusuhiShift } from "@/lib/musuhi-schedule";
import type { LessonColor } from "@/lib/lesson-colors";
import { dayOfWeekForDate, monthEnd } from "@/lib/date";
import { CLOSED_DAY_OF_WEEK, DAY_OF_WEEK_LABEL, isClosedOnDate } from "@/lib/types";
import type { LessonOption, PayRateRule, ScheduleSubmission } from "@/lib/types";

type EntryWithName = ScheduleSubmission & { staffName: string };
type MusuhiShiftWithName = MusuhiShift & { staffName: string };

function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `${y}年${Number(m)}月`;
}

function candidateLabel(e: EntryWithName): string {
  const time = e.start_time ? `${e.start_time.slice(0, 5)}${e.end_time ? `〜${e.end_time.slice(0, 5)}` : ""}` : "";
  const what = e.kind === "lesson" ? (e.lesson_name ?? "レッスン希望(未定)") : "受付";
  return [e.staffName, time, what].filter(Boolean).join(" ");
}

// プレビュー(印刷イメージ)用。印刷ページと同じ配色ルールを使う。
const DEFAULT_COLOR = "#FFFF00";

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

function formatTimeCompact(t: string | null): string {
  if (!t) return "";
  const [h, min] = t.slice(0, 5).split(":");
  return min === "00" ? String(Number(h)) : `${Number(h)}:${min}`;
}

// 人件費の概算用。"HH:MM:SS"同士の差を時間(小数)で返す。
function hoursBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.slice(0, 5).split(":").map(Number);
  const [eh, em] = end.slice(0, 5).split(":").map(Number);
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
}

// スケジュール上のクラス名(例:「Fアクティブ」「バンジーフィットネス」)は集客・掲示用の名称で、
// 実績入力(給与計算のもと)の単価ルールは「フロアクラス」「ハンモック」等の大分類でしか設定されて
// いないため、クラス名では単価に一切マッチしない。そのため、そのスタッフの単価ルール全体の
// 平均額を「1レッスンあたりの目安単価」として使う(実績入力後の実際の金額とは異なる)。
function estimateStaffLessonRate(rules: PayRateRule[]): number {
  if (rules.length === 0) return 0;
  return rules.reduce((sum, r) => sum + r.rate, 0) / rules.length;
}

export default function ScheduleBuilderPanel({
  initialMonthStart,
  initialEntries,
  initialNotes,
  staffList,
  lessonOptionsByStaff,
  lessonColorRows,
  payRateRulesByStaff,
  leLienHourlyRateByStaff,
  musuhiHourlyRateByStaff,
  initialMusuhiShifts,
  costExcludedStaffIds,
}: {
  initialMonthStart: string;
  initialEntries: EntryWithName[];
  initialNotes: ScheduleNote[];
  staffList: { id: string; name: string }[];
  lessonOptionsByStaff: Record<string, LessonOption[]>;
  lessonColorRows: LessonColor[];
  payRateRulesByStaff: Record<string, PayRateRule[]>;
  leLienHourlyRateByStaff: Record<string, number>;
  musuhiHourlyRateByStaff: Record<string, number>;
  initialMusuhiShifts: MusuhiShiftWithName[];
  costExcludedStaffIds: string[];
}) {
  const [monthStart, setMonthStart] = useState(initialMonthStart);
  const [entries, setEntries] = useState(initialEntries);
  const [notes, setNotes] = useState(initialNotes);
  const [musuhiShifts, setMusuhiShifts] = useState(initialMusuhiShifts);
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
    const [data, notesData, musuhiData] = await Promise.all([
      getAllScheduleSubmissions(monthStart, monthEnd(monthStart)),
      getScheduleNotes(monthStart, monthEnd(monthStart)),
      getMusuhiShifts(monthStart, monthEnd(monthStart)),
    ]);
    setLoading(false);
    setEntries(data);
    setNotes(notesData);
    setMusuhiShifts(musuhiData);
    setExtraSlots({});
  }

  // 休館日の上書き(臨時休業/臨時営業)とイベントなどのメモ・その表示色を保存する。
  async function handleNoteSave(date: string, patch: { isClosedOverride?: boolean | null; note?: string; color?: string | null }) {
    setError(null);
    const existing = notes.find((n) => n.entry_date === date);
    const nextNote: ScheduleNote = {
      entry_date: date,
      is_closed_override: patch.isClosedOverride !== undefined ? patch.isClosedOverride : (existing?.is_closed_override ?? null),
      note: patch.note !== undefined ? patch.note : (existing?.note ?? null),
      color: patch.color !== undefined ? patch.color : (existing?.color ?? null),
    };
    setNotes((prev) => [...prev.filter((n) => n.entry_date !== date), nextNote]);
    const result = await upsertScheduleNote({
      entryDate: date,
      isClosedOverride: nextNote.is_closed_override,
      note: nextNote.note ?? "",
      color: nextNote.color,
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
    const result = await assignScheduleEntryLessonName(entry.id, lessonName);
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

  // スタッフごとのレッスン数(確定分のみ)。偏りが無いか一目で確認できるように、多い順に並べる。
  const lessonCountByStaff = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== "lesson" || !e.confirmed) continue;
    lessonCountByStaff.set(e.staffName, (lessonCountByStaff.get(e.staffName) ?? 0) + 1);
  }
  const lessonCountRows = Array.from(lessonCountByStaff.entries()).sort((a, b) => b[1] - a[1]);

  // クラス(レッスン名)ごとの本数。特定のクラスに偏っていないか確認できるように、多い順に並べる。
  // 全角/半角の違い(例:「４Dpro」と「4Dpro」)で別の名前として数えられないよう、正規化したキーでまとめる。
  const lessonCountByName = new Map<string, { label: string; count: number }>();
  for (const e of entries) {
    if (e.kind !== "lesson" || !e.confirmed) continue;
    const label = e.lesson_name ?? "(レッスン名未定)";
    const key = label.normalize("NFKC").trim().toLowerCase();
    const existing = lessonCountByName.get(key);
    if (existing) existing.count += 1;
    else lessonCountByName.set(key, { label, count: 1 });
  }
  const lessonCountByNameRows = Array.from(lessonCountByName.values()).sort((a, b) => b.count - a.count);

  // スケジュールの時点で分かる範囲での、おおよその人件費(オーナー自身の時間は除く)。
  // 受付は時給×時間で計算するが、レッスンと時間が重なっている場合の差し引き(実績入力時に自動適用)は含めていない。
  const excludedStaffIds = new Set(costExcludedStaffIds);
  interface StaffCostEstimate {
    name: string;
    lessonCost: number;
    receptionCost: number;
    musuhiCost: number;
    hasUnpriced: boolean;
  }
  const costByStaff = new Map<string, StaffCostEstimate>();
  for (const e of entries) {
    if (!e.confirmed || excludedStaffIds.has(e.staff_id)) continue;
    const current = costByStaff.get(e.staff_id) ?? {
      name: e.staffName,
      lessonCost: 0,
      receptionCost: 0,
      musuhiCost: 0,
      hasUnpriced: false,
    };
    if (e.kind === "lesson" && e.lesson_name) {
      const rate = estimateStaffLessonRate(payRateRulesByStaff[e.staff_id] ?? []);
      if (rate === 0) current.hasUnpriced = true;
      current.lessonCost += rate;
    } else if (e.kind === "reception") {
      const rate = leLienHourlyRateByStaff[e.staff_id] ?? 0;
      current.receptionCost += hoursBetween(e.start_time, e.end_time) * rate;
    }
    costByStaff.set(e.staff_id, current);
  }
  for (const s of musuhiShifts) {
    if (excludedStaffIds.has(s.staff_id)) continue;
    const current = costByStaff.get(s.staff_id) ?? {
      name: s.staffName,
      lessonCost: 0,
      receptionCost: 0,
      musuhiCost: 0,
      hasUnpriced: false,
    };
    const rate = musuhiHourlyRateByStaff[s.staff_id] ?? 0;
    current.musuhiCost += hoursBetween(s.start_time, s.end_time) * rate;
    costByStaff.set(s.staff_id, current);
  }
  const costRows = Array.from(costByStaff.values())
    .map((c) => ({ ...c, total: c.lessonCost + c.receptionCost + c.musuhiCost }))
    .sort((a, b) => b.total - a.total);
  const grandTotal = costRows.reduce((sum, c) => sum + c.total, 0);
  const hasUnpriced = costRows.some((c) => c.hasUnpriced);

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

  // 確定済みの予定だけを、印刷ページと同じ配色・同じ文字サイズで表示するプレビュー
  // (文字を小さくしすぎると名前が読めなくなるため、幅は縮めず下に表示する)。
  const colorMap = new Map(lessonColorRows.map((c) => [c.lesson_name, c]));
  function renderPreview() {
    return (
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-neutral-400 bg-neutral-400 text-[10px] dark:border-neutral-700 dark:bg-neutral-700">
        {DAY_OF_WEEK_LABEL.map((label, i) => (
          <div
            key={label}
            className={`bg-neutral-100 py-1 text-center text-xs font-semibold dark:bg-neutral-900 ${i === 0 ? "text-red-600" : ""}`}
          >
            {label}
          </div>
        ))}
        {calendarCells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} className="min-h-28 bg-white dark:bg-neutral-950" />;
          const day = Number(date.split("-")[2]);
          const dow = dayOfWeekForDate(date);
          const noteEntry = notesByDate.get(date);
          const isClosedDay = isClosedOnDate(date, noteEntry?.is_closed_override);
          const dayEntries = entriesByDateKind;
          const reception = (dayEntries.get(`${date}|reception`) ?? []).filter((e) => e.confirmed);
          const lessons = (dayEntries.get(`${date}|lesson`) ?? []).filter((e) => e.confirmed);
          return (
            <div
              key={date}
              className={`flex min-h-28 flex-col gap-0.5 p-1 ${isClosedDay ? "bg-neutral-100 dark:bg-neutral-900" : "bg-white dark:bg-neutral-950"}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-1">
                <p className={`font-semibold ${dow === 0 ? "text-red-600" : ""}`}>{day}</p>
                {!isClosedDay &&
                  reception.map((e) => (
                    <span key={e.id} className="text-neutral-600">
                      {e.staffName}
                      {formatTimeCompact(e.start_time)}-{formatTimeCompact(e.end_time)}
                    </span>
                  ))}
              </div>
              {isClosedDay ? (
                <p className="text-neutral-400" style={noteEntry?.color ? { color: noteEntry.color } : undefined}>
                  {noteEntry?.note || "定休日"}
                </p>
              ) : (
                <>
                  {noteEntry?.note && (
                    <p className="italic text-neutral-500" style={noteEntry.color ? { color: noteEntry.color } : undefined}>
                      {noteEntry.note}
                    </p>
                  )}
                  {lessons.map((e) => {
                    const name = e.lesson_name ?? "(レッスン名未定)";
                    return (
                      <p key={e.id} className="rounded px-1 py-0.5 leading-tight" style={lessonStyle(name, colorMap)}>
                        {formatTime(e.start_time)} {name}({e.staffName})
                      </p>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
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

      {lessonCountByNameRows.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <p className="text-sm font-semibold">クラス別レッスン数(確定分・{formatMonthLabel(monthStart)})</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {lessonCountByNameRows.map((row) => (
              <li key={row.label} className="flex items-center gap-1">
                <span>{row.label}</span>
                <span className="font-semibold">{row.count}本</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lessonCountRows.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <p className="text-sm font-semibold">スタッフ別レッスン数(確定分・{formatMonthLabel(monthStart)})</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {lessonCountRows.map(([name, count]) => (
              <li key={name} className="flex items-center gap-1">
                <span>{name}</span>
                <span className="font-semibold">{count}本</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {costRows.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <p className="text-sm font-semibold">おおよその人件費(概算・確定分・{formatMonthLabel(monthStart)})</p>
          <ul className="flex flex-col gap-1 text-sm">
            {costRows.map((c) => (
              <li key={c.name} className="flex flex-wrap items-center gap-3">
                <span>{c.name}</span>
                <span className="text-neutral-400">
                  レッスン ¥{Math.round(c.lessonCost).toLocaleString()} + 受付(Le lien) ¥{Math.round(c.receptionCost).toLocaleString()}
                  {c.musuhiCost > 0 && ` + 受付(むすひ) ¥${Math.round(c.musuhiCost).toLocaleString()}`}
                </span>
                <span className="ml-auto font-semibold">¥{Math.round(c.total).toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-neutral-100 pt-2 text-sm font-semibold dark:border-neutral-900">
            合計: ¥{Math.round(grandTotal).toLocaleString()}
          </p>
          <p className="text-xs text-neutral-400">
            ※あくまで概算です。スケジュールのクラス名(Fアクティブ等)は実績入力の単価ルール(フロアクラス/ハンモック等の大分類)と紐付いていないため、レッスン単価はそのスタッフの単価ルール全体の平均額を使っています。受付はレッスンと時間が重なる場合の差し引きも含まれていません。オーナー自身の時間はこの合計に含めていません。実際の金額は実績入力後の給与明細でご確認ください。
            {hasUnpriced && "単価ルールが1件も設定されていないスタッフのレッスンは0円として計算されています。"}
          </p>
        </div>
      )}

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
                  <div className="flex items-center gap-0.5">
                    <input
                      type="text"
                      defaultValue={noteEntry?.note ?? ""}
                      placeholder="イベント等メモ"
                      onBlur={(e) => handleNoteSave(date, { note: e.target.value })}
                      className="w-full min-w-0 rounded border border-neutral-200 px-0.5 text-[9px] dark:border-neutral-800"
                    />
                    <input
                      type="color"
                      title="メモの文字色"
                      value={noteEntry?.color ?? "#737373"}
                      onChange={(e) => handleNoteSave(date, { color: e.target.value })}
                      className="h-4 w-4 shrink-0 rounded border border-neutral-200 p-0 dark:border-neutral-800"
                    />
                  </div>
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

      <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-sm font-semibold">手動で追加する</p>
        <p className="text-xs text-neutral-400">
          提出を待たずに、何時から・何のレッスン(または受付)を・誰が担当するかを直接決めて追加できます。
        </p>
        {manualError && <p className="text-sm text-red-600">{manualError}</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:items-end">
          <label className="flex flex-col gap-1 text-sm">
            日付
            <input
              type="date"
              value={manualDate}
              min={monthStart}
              max={monthEnd(monthStart)}
              onChange={(e) => setManualDate(e.target.value)}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            種別
            <select
              value={manualKind}
              onChange={(e) => setManualKind(e.target.value as "reception" | "lesson")}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
            >
              <option value="lesson">レッスン</option>
              <option value="reception">受付</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            開始時刻
            <input
              type="time"
              value={manualStartTime}
              onChange={(e) => setManualStartTime(e.target.value)}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
            />
          </label>
          {manualKind === "reception" && (
            <label className="flex flex-col gap-1 text-sm">
              終了時刻
              <input
                type="time"
                value={manualEndTime}
                onChange={(e) => setManualEndTime(e.target.value)}
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
              />
            </label>
          )}
          {manualKind === "lesson" && (
            <label className="flex flex-col gap-1 text-sm">
              レッスン名
              <input
                value={manualLessonName}
                onChange={(e) => setManualLessonName(e.target.value)}
                placeholder="例: 筋膜リリース75"
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            担当
            <select
              value={manualStaffId}
              onChange={(e) => setManualStaffId(e.target.value)}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
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
            className="col-span-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black sm:col-span-1 lg:col-span-1"
          >
            {manualSubmitting ? "追加中..." : "追加する"}
          </button>
        </div>
      </div>
    </div>

      <div className="flex flex-col gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <p className="text-sm font-semibold text-neutral-500">プレビュー(このまま印刷した場合の見た目・確定済みの予定のみ表示)</p>
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">{renderPreview()}</div>
        </div>
      </div>
    </div>
  );
}
