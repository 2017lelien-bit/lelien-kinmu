import { notFound } from "next/navigation";
import { getOwnPayCategories } from "@/lib/pay-categories";
import { getOwnHasPayRateRules, getOwnHeadcountMatters, getOwnLessonLogEntries } from "@/lib/lesson-log";
import { getOwnPayEntries, getOwnPayslips, getOwnStaffProfile, getOwnSubmissionStatus } from "@/lib/staff-self";
import {
  getOwnLessonOptions,
  getOwnScheduleSubmissions,
  getOwnScheduleSubmissionStatus,
  getOwnScheduleTemplates,
} from "@/lib/schedule-submissions";
import { currentPayPeriod, nextMonthStart, monthEnd } from "@/lib/date";
import MyStaffProfileForm from "@/components/staff/MyStaffProfileForm";
import PayEntryForm from "@/components/staff/PayEntryForm";
import LessonLogForm from "@/components/staff/LessonLogForm";
import ScheduleSubmissionForm from "@/components/staff/ScheduleSubmissionForm";
import ScheduleTemplateManager from "@/components/staff/ScheduleTemplateManager";
import LessonOptionsManager from "@/components/staff/LessonOptionsManager";
import SubmitScheduleButton from "@/components/staff/SubmitScheduleButton";
import MyPayslipList from "@/components/staff/MyPayslipList";
import SubmitPeriodButton from "@/components/staff/SubmitPeriodButton";

export default async function StaffMyPage() {
  const profile = await getOwnStaffProfile();
  if (!profile) notFound();

  const { periodStart, periodEnd } = currentPayPeriod();
  const periodLabel = `${periodStart}〜${periodEnd}`;
  const scheduleMonthStart = nextMonthStart();
  const [
    payCategories,
    payEntries,
    hasPayRateRules,
    headcountMatters,
    lessonLogEntries,
    payslips,
    submittedAt,
    scheduleEntries,
    lessonOptions,
    scheduleTemplates,
    scheduleSubmittedAt,
  ] = await Promise.all([
    getOwnPayCategories(),
    getOwnPayEntries(periodStart),
    getOwnHasPayRateRules(),
    getOwnHeadcountMatters(),
    getOwnLessonLogEntries(periodStart, periodEnd),
    getOwnPayslips(),
    getOwnSubmissionStatus(),
    getOwnScheduleSubmissions(scheduleMonthStart, monthEnd(scheduleMonthStart)),
    getOwnLessonOptions(),
    getOwnScheduleTemplates(),
    getOwnScheduleSubmissionStatus(scheduleMonthStart),
  ]);
  const hasEntryInput = payCategories.length > 0 || hasPayRateRules;
  const hourlyCategories = payCategories.filter((c) => c.unit_type === "hourly");

  const scheduleMonthLabel = `${Number(scheduleMonthStart.slice(5, 7))}月`;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">マイページ</h1>

      <details className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <summary className="cursor-pointer font-semibold">プロフィール設定</summary>
        <div className="mt-4">
          <MyStaffProfileForm profile={profile} />
        </div>
      </details>

      {payCategories.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">今期の実績入力(区分ごと)({periodLabel})</h2>
          <PayEntryForm payCategories={payCategories} payEntries={payEntries} periodStart={periodStart} />
        </section>
      )}

      {hourlyCategories.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">出退勤</h2>
          <a
            href="/staff/mypage/attendance"
            className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
          >
            出退勤を記録する →
          </a>
        </section>
      )}

      {hasPayRateRules && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">今期のレッスン実績({periodLabel})</h2>
          <LessonLogForm entries={lessonLogEntries} headcountMatters={headcountMatters} />
        </section>
      )}

      {hasEntryInput && <SubmitPeriodButton submittedAt={submittedAt} />}

      <details className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <summary className="cursor-pointer font-semibold">{scheduleMonthLabel}のスケジュールを提出する</summary>
        <div className="mt-4 flex flex-col gap-4">
          <LessonOptionsManager options={lessonOptions} />
          <ScheduleTemplateManager templates={scheduleTemplates} lessonOptions={lessonOptions} />
          <ScheduleSubmissionForm entries={scheduleEntries} monthStart={scheduleMonthStart} lessonOptions={lessonOptions} />
          <SubmitScheduleButton monthStart={scheduleMonthStart} submittedAt={scheduleSubmittedAt} />
        </div>
      </details>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">給与明細</h2>
        <MyPayslipList payslips={payslips} />
      </section>
    </div>
  );
}
