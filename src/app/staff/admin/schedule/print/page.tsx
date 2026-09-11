import { notFound } from "next/navigation";
import Link from "next/link";
import { getStaffUser } from "@/lib/auth";
import { getAllScheduleSubmissions, getLessonOptionsByStaff } from "@/lib/schedule-submissions";
import { getLessonColors } from "@/lib/lesson-colors";
import { getScheduleNotes } from "@/lib/schedule-notes";
import { getAllStaff } from "@/lib/staff-admin";
import { nextMonthStart, monthEnd } from "@/lib/date";
import PrintButton from "@/components/staff/PrintButton";
import SchedulePrintCalendar from "@/components/staff/SchedulePrintCalendar";

const PRINT_TYPES = ["staff", "customer", "hp"] as const;
type PrintType = (typeof PRINT_TYPES)[number];

const TYPE_LABEL: Record<PrintType, string> = {
  staff: "スタッフ用(受付名あり・この画面で編集できます)",
  customer: "お客様用",
  hp: "HP用",
};

function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `${y}年${Number(m)}月`;
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

  const [entries, lessonColorRows, scheduleNotes, allStaff, lessonOptionsByStaff] = await Promise.all([
    getAllScheduleSubmissions(monthStart, monthEnd(monthStart)),
    getLessonColors(),
    getScheduleNotes(monthStart, monthEnd(monthStart)),
    getAllStaff(),
    getLessonOptionsByStaff(),
  ]);
  const staffList = allStaff
    .filter((s) => s.is_active)
    .map((s) => ({ id: s.id, name: s.schedule_display_name || s.name }));

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

      <SchedulePrintCalendar
        monthStart={monthStart}
        type={type}
        initialEntries={entries}
        initialNotes={scheduleNotes}
        lessonColorRows={lessonColorRows}
        staffList={staffList}
        lessonOptionsByStaff={lessonOptionsByStaff}
      />
    </div>
  );
}
