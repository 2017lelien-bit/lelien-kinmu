import { notFound } from "next/navigation";
import { getStaffUser } from "@/lib/auth";
import { getAllScheduleSubmissions, getScheduleSubmissionStatusList } from "@/lib/schedule-submissions";
import { nextMonthStart, monthEnd } from "@/lib/date";
import ScheduleReviewPanel from "@/components/staff/ScheduleReviewPanel";

export default async function AdminSchedulePage() {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  const initialMonthStart = nextMonthStart();
  const [entries, statusList] = await Promise.all([
    getAllScheduleSubmissions(initialMonthStart, monthEnd(initialMonthStart)),
    getScheduleSubmissionStatusList(initialMonthStart),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold">スケジュール管理</h1>
      <p className="text-sm text-neutral-500">
        スタッフが提出した来月のスケジュール(受付・レッスン)を日付ごとに確認し、内容が確定したものにチェックを入れてください。
      </p>
      <ScheduleReviewPanel initialMonthStart={initialMonthStart} initialEntries={entries} initialStatusList={statusList} />
    </div>
  );
}
