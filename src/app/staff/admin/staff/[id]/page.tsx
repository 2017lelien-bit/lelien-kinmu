import { notFound } from "next/navigation";
import Link from "next/link";
import { getStaffUser } from "@/lib/auth";
import { getStaffDetail, getSubmissionStatus } from "@/lib/staff-admin";
import { getPayslipsForStaff, getTodaySummary } from "@/lib/payroll";
import { getOwnPayEntries } from "@/lib/staff-self";
import { getOwnLessonLogEntries } from "@/lib/lesson-log";
import {
  getOwnLessonOptions,
  getOwnScheduleSubmissions,
  getOwnScheduleSubmissionStatus,
  getOwnScheduleTemplates,
} from "@/lib/schedule-submissions";
import { currentPayPeriod, nextMonthStart, monthEnd } from "@/lib/date";
import TaxSettingsForm from "@/components/staff/TaxSettingsForm";
import CommuteSettingsForm from "@/components/staff/CommuteSettingsForm";
import PayCategoryManager from "@/components/staff/PayCategoryManager";
import PayRateRuleManager from "@/components/staff/PayRateRuleManager";
import PayrollPanel from "@/components/staff/PayrollPanel";
import TodaySummaryPanel from "@/components/staff/TodaySummaryPanel";
import PayEntryForm from "@/components/staff/PayEntryForm";
import LessonLogForm from "@/components/staff/LessonLogForm";
import ScheduleSubmissionForm from "@/components/staff/ScheduleSubmissionForm";
import ScheduleTemplateManager from "@/components/staff/ScheduleTemplateManager";
import LessonOptionsManager from "@/components/staff/LessonOptionsManager";
import SubmitScheduleButton from "@/components/staff/SubmitScheduleButton";
import ScheduleDisplayNameForm from "@/components/staff/ScheduleDisplayNameForm";
import SubmissionStatusPanel from "@/components/staff/SubmissionStatusPanel";

export default async function StaffAdminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  const { periodStart, periodEnd } = currentPayPeriod();
  const scheduleMonthStart = nextMonthStart();
  const [
    detail,
    payslips,
    todaySummary,
    currentPayEntries,
    currentLessonLogEntries,
    submission,
    scheduleEntries,
    lessonOptions,
    scheduleTemplates,
    scheduleSubmittedAt,
  ] = await Promise.all([
    getStaffDetail(id),
    getPayslipsForStaff(id),
    getTodaySummary(id),
    getOwnPayEntries(periodStart, id),
    getOwnLessonLogEntries(periodStart, periodEnd, id),
    getSubmissionStatus(id),
    getOwnScheduleSubmissions(scheduleMonthStart, monthEnd(scheduleMonthStart), id),
    getOwnLessonOptions(id),
    getOwnScheduleTemplates(id),
    getOwnScheduleSubmissionStatus(scheduleMonthStart, id),
  ]);
  if (!detail) notFound();

  const { profile, payCategories, payRateRules } = detail;
  const headcountMatters = payRateRules.some((r) => r.min_headcount !== null || r.max_headcount !== null);
  const hourlyCategories = payCategories.filter((c) => c.unit_type === "hourly");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">{profile.name} さん</h1>

      <SubmissionStatusPanel
        staffId={profile.id}
        submittedAt={submission.submittedAt}
        acknowledgedAt={submission.acknowledgedAt}
      />

      <TodaySummaryPanel
        staffId={profile.id}
        lessons={todaySummary.lessons}
        shifts={todaySummary.shifts}
        headcountMatters={headcountMatters}
      />

      <ScheduleDisplayNameForm staffId={profile.id} initialName={profile.schedule_display_name} />

      <LessonOptionsManager options={lessonOptions} staffId={profile.id} />

      <ScheduleTemplateManager templates={scheduleTemplates} lessonOptions={lessonOptions} staffId={profile.id} />

      <ScheduleSubmissionForm
        entries={scheduleEntries}
        monthStart={scheduleMonthStart}
        lessonOptions={lessonOptions}
        staffId={profile.id}
      />

      <SubmitScheduleButton monthStart={scheduleMonthStart} submittedAt={scheduleSubmittedAt} staffId={profile.id} />

      <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
        <dt className="text-neutral-500">権限</dt>
        <dd>{profile.role === "admin" ? "管理者" : "スタッフ"}</dd>
        <dt className="text-neutral-500">電話番号</dt>
        <dd>{profile.phone ?? "-"}</dd>
        <dt className="text-neutral-500">連絡先メール</dt>
        <dd>{profile.contact_email ?? "-"}</dd>
        <dt className="text-neutral-500">住所</dt>
        <dd>{profile.address ?? "-"}</dd>
      </dl>

      <TaxSettingsForm
        staffId={profile.id}
        dependentCount={profile.dependent_count}
        hasSpouseDeduction={profile.has_spouse_deduction}
        isActive={profile.is_active}
      />

      <CommuteSettingsForm
        staffId={profile.id}
        commuteType={profile.commute_type}
        commuteAmount={profile.commute_amount}
      />

      <PayCategoryManager staffId={profile.id} payCategories={payCategories} />

      <PayRateRuleManager staffId={profile.id} payRateRules={payRateRules} />

      {(payCategories.length > 0 || payRateRules.length > 0) && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">実績の代理入力(本人がアプリを開けない場合)</h2>
          {payCategories.length > 0 && (
            <PayEntryForm
              payCategories={payCategories}
              payEntries={currentPayEntries}
              periodStart={periodStart}
              staffId={profile.id}
            />
          )}
          {payRateRules.length > 0 && (
            <LessonLogForm
              entries={currentLessonLogEntries}
              headcountMatters={headcountMatters}
              staffId={profile.id}
            />
          )}
          {hourlyCategories.length > 0 && (
            <Link
              href={`/staff/mypage/attendance?staffId=${profile.id}`}
              className="self-start rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
            >
              出退勤を見る/入力する →
            </Link>
          )}
        </section>
      )}

      <PayrollPanel
        staffId={profile.id}
        payslips={payslips}
        commuteType={profile.commute_type}
        commuteAmount={profile.commute_amount}
        headcountMatters={headcountMatters}
      />
    </div>
  );
}
