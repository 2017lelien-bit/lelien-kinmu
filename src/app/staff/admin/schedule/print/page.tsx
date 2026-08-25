import { notFound } from "next/navigation";
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

// レッスン名ごとに色を固定で割り当てる。スタジオでよく使う名前は決め打ち、
// それ以外(スタッフが自由入力した名前)は名前のハッシュ値でパレットから選ぶ。
const FIXED_LESSON_COLORS: Record<string, string> = {
  フロアクラス: "#FDE68A",
  ハンモック: "#BFDBFE",
  ティシュー: "#FBCFE8",
  "75分クラス": "#BBF7D0",
};
const FALLBACK_PALETTE = ["#E9D5FF", "#FED7AA", "#A5F3FC", "#FCA5A5", "#D9F99D", "#C7D2FE"];

function lessonColor(name: string): string {
  if (FIXED_LESSON_COLORS[name]) return FIXED_LESSON_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <h1 className="text-lg font-semibold">
          {formatMonthLabel(monthStart)}スケジュール({TYPE_LABEL[type]})
        </h1>
        <PrintButton />
      </div>

      {lessonNamesUsed.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {lessonNamesUsed.map((name) => (
            <span key={name} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-3 w-3 rounded-sm border border-black/10"
                style={{ backgroundColor: lessonColor(name) }}
              />
              {name}
            </span>
          ))}
        </div>
      )}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-neutral-400 px-2 py-1 text-left">日付</th>
            {type === "staff" && <th className="border border-neutral-400 px-2 py-1 text-left">受付</th>}
            <th className="border border-neutral-400 px-2 py-1 text-left">レッスン</th>
          </tr>
        </thead>
        <tbody>
          {dates.map((date) => {
            const day = Number(date.split("-")[2]);
            const dow = dayOfWeekForDate(date);
            const isClosedDay = dow === CLOSED_DAY_OF_WEEK;
            const dayEntries = byDate.get(date) ?? [];
            const reception = dayEntries.filter((e) => e.kind === "reception");
            const lessons = dayEntries.filter((e) => e.kind === "lesson");

            return (
              <tr key={date} className={isClosedDay ? "bg-neutral-100" : undefined}>
                <td className="border border-neutral-400 px-2 py-1 align-top whitespace-nowrap">
                  {m}/{day}({DAY_OF_WEEK_LABEL[dow]})
                </td>
                {type === "staff" && (
                  <td className="border border-neutral-400 px-2 py-1 align-top">
                    {isClosedDay
                      ? "定休"
                      : reception
                          .map((e) => `${formatTime(e.start_time)}〜${formatTime(e.end_time)} ${e.staffName}`)
                          .join(" / ") || ""}
                  </td>
                )}
                <td className="border border-neutral-400 px-2 py-1 align-top">
                  {isClosedDay ? (
                    type !== "staff" && "定休"
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {lessons.map((e) => {
                        const time = formatTime(e.start_time);
                        const text = type === "hp" ? `${time} ${e.lesson_name}` : `${time} ${e.lesson_name}(${e.staffName})`;
                        return (
                          <span
                            key={e.id}
                            className="rounded px-1.5 py-0.5"
                            style={{ backgroundColor: lessonColor(e.lesson_name!) }}
                          >
                            {text}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
