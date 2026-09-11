import { notFound } from "next/navigation";
import Link from "next/link";
import { getStaffUser } from "@/lib/auth";
import { getAllScheduleSubmissions } from "@/lib/schedule-submissions";
import { getLessonColors, type LessonColor } from "@/lib/lesson-colors";
import { getScheduleNotes } from "@/lib/schedule-notes";
import { nextMonthStart, monthEnd, dayOfWeekForDate } from "@/lib/date";
import { DAY_OF_WEEK_LABEL, isClosedOnDate } from "@/lib/types";
import PrintButton from "@/components/staff/PrintButton";
import LessonColorEditor from "@/components/staff/LessonColorEditor";

const PRINT_TYPES = ["staff", "customer", "hp"] as const;
type PrintType = (typeof PRINT_TYPES)[number];

const TYPE_LABEL: Record<PrintType, string> = {
  staff: "スタッフ用(受付名あり)",
  customer: "お客様用",
  hp: "HP用",
};

function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `${y}年${Number(m)}月`;
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

// レッスン名ごとの色は、管理画面(このページの凡例)から自由に設定できる。まだ設定されていない
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

export default async function SchedulePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; type?: string }>;
}) {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  const params = await searchParams;
  const monthStart = params.month ? `${params.month}-01` : nextMonthStart();
  const type: PrintType = PRINT_TYPES.includes(params.type as PrintType) ? (params.type as PrintType) : "staff";

  const [entries, lessonColorRows, scheduleNotes] = await Promise.all([
    getAllScheduleSubmissions(monthStart, monthEnd(monthStart)),
    getLessonColors(),
    getScheduleNotes(monthStart, monthEnd(monthStart)),
  ]);
  const confirmed = entries.filter((e) => e.confirmed && e.kind !== "unavailable");
  const colorMap = new Map(lessonColorRows.map((c) => [c.lesson_name, c]));
  const notesByDate = new Map(scheduleNotes.map((n) => [n.entry_date, n]));

  const [y, m] = monthStart.split("-").map(Number);
  const daysInMonth = Number(monthEnd(monthStart).split("-")[2]);
  const dates = Array.from(
    { length: daysInMonth },
    (_, i) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
  );

  const byDate = new Map<string, typeof confirmed>();
  for (const e of confirmed) {
    const list = byDate.get(e.entry_date) ?? [];
    list.push(e);
    byDate.set(e.entry_date, list);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  }

  const lessonNamesUsed = Array.from(
    new Set(confirmed.filter((e) => e.kind === "lesson").map((e) => e.lesson_name ?? "(レッスン名未定)")),
  ).sort();

  // カレンダーの見た目に合わせて、月初の曜日分だけ空マスを差し込む。
  const leadingBlanks: (string | null)[] = Array(dayOfWeekForDate(dates[0])).fill(null);
  const calendarCells: (string | null)[] = [...leadingBlanks, ...dates];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  return (
    <div className="print-calendar flex flex-col gap-3">
      <Link href="/staff/admin/schedule" className="text-sm underline print:hidden">
        ← スケジュール管理に戻る
      </Link>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <h1 className="text-lg font-semibold">
          {formatMonthLabel(monthStart)}スケジュール({TYPE_LABEL[type]})
        </h1>
        <PrintButton />
      </div>

      <h2 className="hidden text-center text-xl font-bold print:block">{formatMonthLabel(monthStart)}スケジュール</h2>

      {lessonNamesUsed.length > 0 && (
        <div className="flex flex-nowrap items-center gap-3 overflow-x-auto pb-1 text-xs print:gap-1.5 print:text-[8px]">
          {lessonNamesUsed.map((name) => {
            const style = lessonStyle(name, colorMap);
            const config = colorMap.get(name);
            return (
              <span key={name} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-sm border border-black/10 print:h-2 print:w-2"
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
          const noteEntry = notesByDate.get(date);
          const isClosedDay = isClosedOnDate(date, noteEntry?.is_closed_override);
          const dayEntries = byDate.get(date) ?? [];
          const reception = dayEntries.filter((e) => e.kind === "reception");
          const lessons = dayEntries.filter((e) => e.kind === "lesson");

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
              </div>
              {isClosedDay ? (
                <p className="text-neutral-400">{noteEntry?.note || "定休日"}</p>
              ) : (
                <>
                  {noteEntry?.note && <p className="italic text-neutral-500">{noteEntry.note}</p>}
                  {lessons.map((e) => {
                    const name = e.lesson_name ?? "(レッスン名未定)";
                    return (
                      <p key={e.id} className="rounded px-1 py-0.5 leading-tight" style={lessonStyle(name, colorMap)}>
                        {formatTime(e.start_time)} {name}
                        {type !== "hp" && `(${e.staffName})`}
                      </p>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
