import { notFound } from "next/navigation";
import { getOwnPayCategories } from "@/lib/pay-categories";
import { getOwnHasPayRateRules, getOwnLessonLogEntries } from "@/lib/lesson-log";
import { getOwnPayEntries, getOwnPayslips, getOwnStaffProfile, getOwnSubmissionStatus } from "@/lib/staff-self";
import { currentPayPeriod } from "@/lib/date";
import MyStaffProfileForm from "@/components/staff/MyStaffProfileForm";
import PayEntryForm from "@/components/staff/PayEntryForm";
import LessonLogForm from "@/components/staff/LessonLogForm";
import MyPayslipList from "@/components/staff/MyPayslipList";
import SubmitPeriodButton from "@/components/staff/SubmitPeriodButton";

export default async function StaffMyPage() {
  const profile = await getOwnStaffProfile();
  if (!profile) notFound();

  const { periodStart, periodEnd } = currentPayPeriod();
  const periodLabel = `${periodStart}〜${periodEnd}`;
  const [payCategories, payEntries, hasPayRateRules, lessonLogEntries, payslips, submittedAt] = await Promise.all([
    getOwnPayCategories(),
    getOwnPayEntries(periodStart),
    getOwnHasPayRateRules(),
    getOwnLessonLogEntries(periodStart, periodEnd),
    getOwnPayslips(),
    getOwnSubmissionStatus(periodStart),
  ]);
  const hasEntryInput = payCategories.length > 0 || hasPayRateRules;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">マイページ</h1>

      <MyStaffProfileForm profile={profile} />

      {payCategories.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">今期の実績入力(区分ごと)({periodLabel})</h2>
          <PayEntryForm payCategories={payCategories} payEntries={payEntries} periodStart={periodStart} />
        </section>
      )}

      {hasPayRateRules && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">今期のレッスン実績({periodLabel})</h2>
          <LessonLogForm entries={lessonLogEntries} />
        </section>
      )}

      {hasEntryInput && <SubmitPeriodButton periodStart={periodStart} submittedAt={submittedAt} />}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">給与明細</h2>
        <MyPayslipList payslips={payslips} />
      </section>
    </div>
  );
}
