import { notFound } from "next/navigation";
import Link from "next/link";
import { getStaffUser } from "@/lib/auth";
import { getAllScheduleSubmissions } from "@/lib/schedule-submissions";
import { getLessonColors } from "@/lib/lesson-colors";
import { buildLessonColorMap } from "@/lib/lesson-color-key";
import { lessonStyle } from "@/lib/lesson-style";
import { getScheduleNotes } from "@/lib/schedule-notes";
import { getMusuhiNotes, getMusuhiShifts } from "@/lib/musuhi-schedule";
import { musuhiBusinessHoursLabel } from "@/lib/musuhi-booking-sync";
import { noteStyle } from "@/lib/color";
import { nextMonthStart, monthEnd, dayOfWeekForDate } from "@/lib/date";
import { isJapaneseHoliday } from "@/lib/holidays";
import { isClosedOnDate } from "@/lib/types";
import PrintButton from "@/components/staff/PrintButton";
import PrintFitToPage from "@/components/staff/PrintFitToPage";
import SaveImageButton from "@/components/staff/SaveImageButton";
import CombinedScheduleCalendar, { MUSUHI_BAND_STYLE, type CombinedDay } from "@/components/staff/CombinedScheduleCalendar";

function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `${y}年${Number(m)}月`;
}

function formatTime(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

// Le lienとむすひの両方に通っている方向けの、お客様用スケジュール。
// 「むすひの営業時間」(むすひお客様用と同じ計算)と「Le lienのレッスン」(Le lienお客様用と同じ内容)を、
// 1つのカレンダーに並べて印刷・画像保存できる。担当の受付名など、お客様に見せない情報は載せない。
export default async function CombinedSchedulePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; orient?: string }>;
}) {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  const params = await searchParams;
  const orientation: "landscape" | "portrait" = params.orient === "portrait" ? "portrait" : "landscape";
  const monthStart = params.month ? `${params.month}-01` : nextMonthStart();
  const monthLast = monthEnd(monthStart);

  const [entries, lessonColorRows, lienNotes, musuhiShifts, musuhiNotes] = await Promise.all([
    getAllScheduleSubmissions(monthStart, monthLast),
    getLessonColors(),
    getScheduleNotes(monthStart, monthLast),
    getMusuhiShifts(monthStart, monthLast),
    getMusuhiNotes(monthStart, monthLast),
  ]);
  const colorMap = buildLessonColorMap(lessonColorRows);
  const lienNotesByDate = new Map(lienNotes.map((n) => [n.entry_date, n]));
  const musuhiNotesByDate = new Map(musuhiNotes.map((n) => [n.entry_date, n]));

  const lessonsByDate = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!e.confirmed || e.kind !== "lesson") continue;
    const list = lessonsByDate.get(e.entry_date) ?? [];
    list.push(e);
    lessonsByDate.set(e.entry_date, list);
  }
  for (const list of lessonsByDate.values()) {
    list.sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  }

  const musuhiShiftsByDate = new Map<string, typeof musuhiShifts>();
  for (const s of musuhiShifts) {
    const list = musuhiShiftsByDate.get(s.entry_date) ?? [];
    list.push(s);
    musuhiShiftsByDate.set(s.entry_date, list);
  }

  const [y, m] = monthStart.split("-").map(Number);
  const daysInMonth = Number(monthLast.split("-")[2]);
  const days: CombinedDay[] = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const lienNote = lienNotesByDate.get(date);
    // 「片付け」など社内向けのメモは、お客様用には出さない。
    const shownLienNote = lienNote?.hide_on_customer ? undefined : lienNote;
    const isMusuhiClosed = isClosedOnDate(date, musuhiNotesByDate.get(date)?.is_closed_override);
    return {
      date,
      day,
      isRed: dayOfWeekForDate(date) === 0 || isJapaneseHoliday(date),
      lienClosed: isClosedOnDate(date, lienNote?.is_closed_override),
      lienNote: shownLienNote?.note ? { text: shownLienNote.note, style: noteStyle(shownLienNote) } : null,
      lessons: (lessonsByDate.get(date) ?? []).map((e) => {
        const name = e.lesson_name ?? "(レッスン名未定)";
        return { id: e.id, text: `${formatTime(e.start_time)} ${name}(${e.staffName})`, style: lessonStyle(name, colorMap) };
      }),
      musuhiHours: musuhiBusinessHoursLabel(musuhiShiftsByDate.get(date) ?? [], isMusuhiClosed),
    };
  });

  return (
    <div className={`${orientation === "portrait" ? "print-calendar-portrait" : "print-calendar"} flex flex-col gap-3`}>
      <Link href="/staff/admin/schedule" className="text-sm underline print:hidden">
        ← スケジュール管理に戻る
      </Link>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <h1 className="text-lg font-semibold">{formatMonthLabel(monthStart)}スケジュール(Le lien・むすひ両方に通っている方用)</h1>
        <PrintButton />
        <span className="flex items-center gap-1 text-sm">
          用紙の向き:
          {(["landscape", "portrait"] as const).map((o) => (
            <Link
              key={o}
              href={`/staff/admin/schedule/combined-print?month=${monthStart.slice(0, 7)}&orient=${o}`}
              className={`rounded border px-2 py-1 ${orientation === o ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-black" : "border-neutral-300 dark:border-neutral-700"}`}
            >
              {o === "landscape" ? "横" : "縦"}
            </Link>
          ))}
        </span>
        {/* 印刷と同じ収まり(1行・同じ罫線)で、A4用紙にそのまま印刷してもはみ出さない画像として保存する。 */}
        <SaveImageButton
          targetId="schedule-capture"
          filename={`${monthStart.slice(0, 7)}-schedule-lelien-musuhi.png`}
          variant="a4"
          layoutWidth={orientation === "portrait" ? 760 : 1090}
          label="画像として保存(A4)"
        />
      </div>

      <PrintFitToPage orientation={orientation}>
        <div id="schedule-capture" className="flex flex-col gap-3 bg-white p-2">
          <h2 className="text-center text-xl font-bold">{formatMonthLabel(monthStart)}スケジュール</h2>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-neutral-600">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-8 rounded-sm border border-black/10" style={MUSUHI_BAND_STYLE} />
              むすひの営業時間
            </span>
            <span>Le lienのレッスンは、時間・クラス名・担当(色はクラスごと)</span>
          </div>
          <CombinedScheduleCalendar leadingBlanks={dayOfWeekForDate(days[0].date)} days={days} />
        </div>
      </PrintFitToPage>
    </div>
  );
}
