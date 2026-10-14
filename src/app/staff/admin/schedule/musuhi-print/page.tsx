import { notFound } from "next/navigation";
import Link from "next/link";
import { getStaffUser } from "@/lib/auth";
import { getMusuhiNotes, getMusuhiShifts } from "@/lib/musuhi-schedule";
import { musuhiBusinessHoursLabel } from "@/lib/musuhi-booking-sync";
import { nextMonthStart, monthEnd, dayOfWeekForDate } from "@/lib/date";
import { isJapaneseHoliday } from "@/lib/holidays";
import { DAY_OF_WEEK_LABEL, isClosedOnDate } from "@/lib/types";
import PrintButton from "@/components/staff/PrintButton";
import PrintFitToPage from "@/components/staff/PrintFitToPage";
import SaveImageButton from "@/components/staff/SaveImageButton";

const PRINT_TYPES = ["staff", "customer"] as const;
type PrintType = (typeof PRINT_TYPES)[number];

const TYPE_LABEL: Record<PrintType, string> = {
  staff: "スタッフ用(担当者と時間)",
  customer: "お客様用(営業時間)",
};

function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `${y}年${Number(m)}月`;
}

// 日付の横に詰めて書くための短い時刻表記("09:00"→"9"、"13:30"→"13:30")。
function formatTimeCompact(t: string): string {
  const [h, min] = t.slice(0, 5).split(":");
  return min === "00" ? String(Number(h)) : `${Number(h)}:${min}`;
}

export default async function MusuhiSchedulePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; type?: string }>;
}) {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  const params = await searchParams;
  const monthStart = params.month ? `${params.month}-01` : nextMonthStart();
  const type: PrintType = PRINT_TYPES.includes(params.type as PrintType) ? (params.type as PrintType) : "staff";

  const [shifts, notes] = await Promise.all([
    getMusuhiShifts(monthStart, monthEnd(monthStart)),
    getMusuhiNotes(monthStart, monthEnd(monthStart)),
  ]);
  const notesByDate = new Map(notes.map((n) => [n.entry_date, n]));

  const [y, m] = monthStart.split("-").map(Number);
  const daysInMonth = Number(monthEnd(monthStart).split("-")[2]);
  const dates = Array.from(
    { length: daysInMonth },
    (_, i) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
  );

  const shiftsByDate = new Map<string, typeof shifts>();
  for (const s of shifts) {
    const list = shiftsByDate.get(s.entry_date) ?? [];
    list.push(s);
    shiftsByDate.set(s.entry_date, list);
  }
  for (const list of shiftsByDate.values()) {
    list.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

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
          {formatMonthLabel(monthStart)}むすひスケジュール({TYPE_LABEL[type]})
        </h1>
        <PrintButton />
        <SaveImageButton targetId="schedule-capture" filename={`${monthStart.slice(0, 7)}-musuhi-schedule-${type}.png`} />
      </div>

      <PrintFitToPage>
        <div id="schedule-capture" className="flex flex-col gap-3 bg-white p-2">
          <h2 className="text-center text-xl font-bold">{formatMonthLabel(monthStart)} むすひ 営業スケジュール</h2>

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
              if (!date) return <div key={`empty-${i}`} className="min-h-20 bg-white" />;

              const day = Number(date.split("-")[2]);
              const dow = dayOfWeekForDate(date);
              const dayShifts = shiftsByDate.get(date) ?? [];
              const isClosedDay = isClosedOnDate(date, notesByDate.get(date)?.is_closed_override);
              const hoursLabel = musuhiBusinessHoursLabel(dayShifts, isClosedDay);

              return (
                <div
                  key={date}
                  className={`flex min-h-20 flex-col gap-0.5 p-1 ${hoursLabel === null ? "bg-neutral-100" : "bg-white"}`}
                >
                  <span className={`font-semibold ${dow === 0 || isJapaneseHoliday(date) ? "text-red-600" : ""}`}>
                    {day}
                  </span>
                  {hoursLabel === null ? (
                    <p className="text-neutral-400">休業</p>
                  ) : type === "customer" ? (
                    <p className="text-[11px] font-medium leading-tight">{hoursLabel}</p>
                  ) : (
                    dayShifts.map((s) => (
                      <p key={s.id} className="leading-tight text-neutral-700">
                        {s.staffName} {formatTimeCompact(s.start_time)}-{formatTimeCompact(s.end_time)}
                      </p>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </PrintFitToPage>
    </div>
  );
}
