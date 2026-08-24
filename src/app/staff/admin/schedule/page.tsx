import { notFound } from "next/navigation";
import { getStaffUser } from "@/lib/auth";
import { getAllScheduleSubmissions, getScheduleSubmissionStatusList } from "@/lib/schedule-submissions";
import { nextMonthStart, monthEnd } from "@/lib/date";
import ScheduleReviewPanel from "@/components/staff/ScheduleReviewPanel";
import ScheduleBuilderPanel from "@/components/staff/ScheduleBuilderPanel";

export default async function AdminSchedulePage() {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  const initialMonthStart = nextMonthStart();
  const [entries, statusList] = await Promise.all([
    getAllScheduleSubmissions(initialMonthStart, monthEnd(initialMonthStart)),
    getScheduleSubmissionStatusList(initialMonthStart),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">① 提出内容の確認</h1>
        <p className="text-sm text-neutral-500">
          スタッフが提出した来月のスケジュール(受付・レッスン)を1人ずつ確認し、内容が確定したものにチェックを入れてください。
        </p>
        <ScheduleReviewPanel initialMonthStart={initialMonthStart} initialEntries={entries} initialStatusList={statusList} />
      </div>

      <div className="flex flex-col gap-4 border-t border-neutral-200 pt-8 dark:border-neutral-800">
        <h1 className="text-xl font-semibold">② スケジュールの組み立て</h1>
        <p className="text-sm text-neutral-500">
          全員の提出が揃ったら、日付ごとに提出された候補からプルダウンで選んで、その日の受付・レッスンを決めてください。
        </p>
        <ScheduleBuilderPanel initialMonthStart={initialMonthStart} initialEntries={entries} />
      </div>
    </div>
  );
}
