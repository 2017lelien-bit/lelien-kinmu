import { notFound } from "next/navigation";
import { getOwnPayCategories } from "@/lib/pay-categories";
import { getOwnHasPayRateRules, getOwnHeadcountMatters, getOwnLessonLogEntries } from "@/lib/lesson-log";
import { getOwnPayEntries, getOwnPayslips, getOwnStaffProfile, getOwnSubmissionStatus } from "@/lib/staff-self";
import { getOwnTimeLogEntries } from "@/lib/time-log";
import { currentPayPeriod } from "@/lib/date";
import MyStaffProfileForm from "@/components/staff/MyStaffProfileForm";
import PayEntryForm from "@/components/staff/PayEntryForm";
import LessonLogForm from "@/components/staff/LessonLogForm";
import TimeLogForm from "@/components/staff/TimeLogForm";
import MyPayslipList from "@/components/staff/MyPayslipList";
import SubmitPeriodButton from "@/components/staff/SubmitPeriodButton";

export default async function StaffMyPage() {
  const profile = await getOwnStaffProfile();
  if (!profile) notFound();

  const { periodStart, periodEnd } = currentPayPeriod();
  const periodLabel = `${periodStart}〜${periodEnd}`;
  const [payCategories, payEntries, hasPayRateRules, headcountMatters, lessonLogEntries, payslips, submittedAt] =
    await Promise.all([
      getOwnPayCategories(),
      getOwnPayEntries(periodStart),
      getOwnHasPayRateRules(),
      getOwnHeadcountMatters(),
      getOwnLessonLogEntries(periodStart, periodEnd),
      getOwnPayslips(),
      getOwnSubmissionStatus(),
    ]);
  const hasEntryInput = payCategories.length > 0 || hasPayRateRules;
  const hourlyCategories = payCategories.filter((c) => c.unit_type === "hourly");
  const timeLogEntriesByCategory = Object.fromEntries(
    await Promise.all(
      hourlyCategories.map(async (c) => [c.id, await getOwnTimeLogEntries(c.id, periodStart, periodEnd)] as const),
    ),
  );

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

      {hourlyCategories.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">今期の出退勤記録({periodLabel})</h2>
          <p className="text-xs text-neutral-400">
            出勤・退勤・休憩の時刻を入れると、労働時間が自動計算されて上の実績入力に反映されます。
          </p>
          {hourlyCategories.map((c) => (
            <TimeLogForm
              key={c.id}
              payCategoryId={c.id}
              categoryName={c.name}
              entries={timeLogEntriesByCategory[c.id]}
              periodStart={periodStart}
              periodEnd={periodEnd}
            />
          ))}
        </section>
      )}

      {hasPayRateRules && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">今期のレッスン実績({periodLabel})</h2>
          <LessonLogForm entries={lessonLogEntries} headcountMatters={headcountMatters} />
        </section>
      )}

      {hasEntryInput && <SubmitPeriodButton submittedAt={submittedAt} />}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">給与明細</h2>
        <MyPayslipList payslips={payslips} />
      </section>
    </div>
  );
}
