import { notFound } from "next/navigation";
import { getStaffUser } from "@/lib/auth";
import { getAllScheduleSubmissions, getScheduleSubmissionStatusList } from "@/lib/schedule-submissions";
import { getMusuhiShifts } from "@/lib/musuhi-schedule";
import { getAllStaff } from "@/lib/staff-admin";
import { nextMonthStart, monthEnd } from "@/lib/date";
import ScheduleReviewPanel from "@/components/staff/ScheduleReviewPanel";
import MusuhiScheduleBuilderPanel from "@/components/staff/MusuhiScheduleBuilderPanel";
import SchedulePrintLinks from "@/components/staff/SchedulePrintLinks";

export default async function AdminSchedulePage() {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  const initialMonthStart = nextMonthStart();
  const [entries, statusList, allStaff, musuhiShifts] = await Promise.all([
    getAllScheduleSubmissions(initialMonthStart, monthEnd(initialMonthStart)),
    getScheduleSubmissionStatusList(initialMonthStart),
    getAllStaff(),
    getMusuhiShifts(initialMonthStart, monthEnd(initialMonthStart)),
  ]);
  const staffList = allStaff
    .filter((s) => s.is_active)
    .map((s) => ({ id: s.id, name: s.schedule_display_name || s.name }));

  return (
    <div className="flex max-w-6xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">① 提出内容の確認</h1>
        <p className="text-sm text-neutral-500">
          スタッフが提出した来月のスケジュール(受付・レッスン)を1人ずつ確認し、内容が確定したものにチェックを入れてください。
        </p>
        <ScheduleReviewPanel initialMonthStart={initialMonthStart} initialEntries={entries} initialStatusList={statusList} />
      </div>

      <div className="flex flex-col gap-4 border-t border-neutral-200 pt-8 dark:border-neutral-800">
        <h1 className="text-xl font-semibold">② むすひスケジュール</h1>
        <p className="text-sm text-neutral-500">
          むすひの受付を、日付ごとに担当者と時間帯で組み立てます(Le lienのスケジュールとは別の予定です)。
        </p>
        <MusuhiScheduleBuilderPanel initialMonthStart={initialMonthStart} initialShifts={musuhiShifts} staffList={staffList} />
      </div>

      <div className="flex flex-col gap-4 border-t border-neutral-200 pt-8 dark:border-neutral-800">
        <h1 className="text-xl font-semibold">③ スケジュールの組み立て・印刷</h1>
        <p className="text-sm text-neutral-500">
          「スタッフ用」を開くと、そのままカレンダー上で受付・レッスンの担当や時間を編集できます(編集内容は自動で保存されます)。用途に合わせて3種類から選んでください。
        </p>
        <SchedulePrintLinks initialMonthStart={initialMonthStart} />
      </div>
    </div>
  );
}
