import { notFound } from "next/navigation";
import { getOwnPayCategories } from "@/lib/pay-categories";
import { getOwnHasPayRateRules, getOwnLessonLogEntries } from "@/lib/lesson-log";
import { getOwnPayEntries, getOwnPayslips, getOwnStaffProfile } from "@/lib/staff-self";
import { todayJstDateString } from "@/lib/date";
import MyStaffProfileForm from "@/components/staff/MyStaffProfileForm";
import PayEntryForm from "@/components/staff/PayEntryForm";
import LessonLogForm from "@/components/staff/LessonLogForm";
import MyPayslipList from "@/components/staff/MyPayslipList";

function currentMonthRange(): { periodStart: string; periodEnd: string } {
  const [y, m] = todayJstDateString().split("-").map(Number);
  const periodStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const periodEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { periodStart, periodEnd };
}

export default async function StaffMyPage() {
  const profile = await getOwnStaffProfile();
  if (!profile) notFound();

  const { periodStart, periodEnd } = currentMonthRange();
  const [payCategories, payEntries, hasPayRateRules, lessonLogEntries, payslips] = await Promise.all([
    getOwnPayCategories(),
    getOwnPayEntries(periodStart),
    getOwnHasPayRateRules(),
    getOwnLessonLogEntries(periodStart, periodEnd),
    getOwnPayslips(),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">マイページ</h1>

      <MyStaffProfileForm profile={profile} />

      {payCategories.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">当月の実績入力(区分ごと)({periodStart.slice(0, 7)})</h2>
          <PayEntryForm payCategories={payCategories} payEntries={payEntries} periodStart={periodStart} />
        </section>
      )}

      {hasPayRateRules && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">当月のレッスン実績({periodStart.slice(0, 7)})</h2>
          <LessonLogForm entries={lessonLogEntries} />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">給与明細</h2>
        <MyPayslipList payslips={payslips} />
      </section>
    </div>
  );
}
