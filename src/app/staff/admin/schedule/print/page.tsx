import { notFound } from "next/navigation";
import Link from "next/link";
import { getStaffUser } from "@/lib/auth";
import { getAllScheduleSubmissions } from "@/lib/schedule-submissions";
import { nextMonthStart, monthEnd, dayOfWeekForDate } from "@/lib/date";
import { CLOSED_DAY_OF_WEEK, DAY_OF_WEEK_LABEL } from "@/lib/types";
import PrintButton from "@/components/staff/PrintButton";

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

// 実際に店で使っているカレンダー(色分け済み)に合わせた、レッスン名ごとの背景色。
// 決め打ちできない名前(単発のゲスト講師クラスなど)は、参考カレンダーで一番多く使われていた黄色を既定色にする。
const FIXED_LESSON_COLORS: Record<string, string> = {
  "筋膜リリース75": "#FFFF00",
  Fアクティブ: "#FFCCFF",
  Fストレッチ: "#FFCCFF",
  Fコアバランス: "#FFE8CC",
  Fアロマリラックス: "#A0FFA0",
  Fkids: "#FF0066",
  Kidsティシュー: "#FF0066",
  "ティシュー初級〜": "#CCE5FF",
  crystalbowl: "#0070C0",
};
// 色を付けない(参考カレンダーで無色だった)レッスン名。
const NO_COLOR_LESSONS = new Set(["Fエンジョイ", "4Dpro", "Fシニア", "バンジーフィットネス", "Fデトックス", "Fミックス"]);
const DEFAULT_COLOR = "#FFFF00";
const DARK_BG_LESSONS = new Set(["crystalbowl"]);

function lessonStyle(name: string): { backgroundColor?: string; color?: string } {
  if (NO_COLOR_LESSONS.has(name)) return {};
  const bg = FIXED_LESSON_COLORS[name] ?? DEFAULT_COLOR;
  return DARK_BG_LESSONS.has(name) ? { backgroundColor: bg, color: "#ffffff" } : { backgroundColor: bg };
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

  const entries = await getAllScheduleSubmissions(monthStart, monthEnd(monthStart));
  const confirmed = entries.filter((e) => e.confirmed && e.kind !== "unavailable");

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

  const lessonNamesUsed = Array.from(new Set(confirmed.filter((e) => e.kind === "lesson").map((e) => e.lesson_name!))).sort();

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
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {lessonNamesUsed.map((name) => (
            <span key={name} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-3 w-3 rounded-sm border border-black/10"
                style={{ backgroundColor: lessonStyle(name).backgroundColor ?? "#ffffff" }}
              />
              {name}
            </span>
          ))}
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
          const isClosedDay = dow === CLOSED_DAY_OF_WEEK;
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
                <p className="text-neutral-400">定休日</p>
              ) : (
                <>
                  {lessons.map((e) => (
                    <p key={e.id} className="rounded px-1 py-0.5 leading-tight" style={lessonStyle(e.lesson_name!)}>
                      {formatTime(e.start_time)} {e.lesson_name}
                      {type !== "hp" && `(${e.staffName})`}
                    </p>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
