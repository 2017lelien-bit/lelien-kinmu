import { notFound } from "next/navigation";
import { getStaffUser } from "@/lib/auth";
import { getMusuhiShifts } from "@/lib/musuhi-schedule";
import { getAllStaff } from "@/lib/staff-admin";
import { nextMonthStart, monthEnd } from "@/lib/date";
import MusuhiScheduleBuilderPanel from "@/components/staff/MusuhiScheduleBuilderPanel";

export default async function AdminMusuhiSchedulePage() {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  const initialMonthStart = nextMonthStart();
  const [shifts, allStaff] = await Promise.all([
    getMusuhiShifts(initialMonthStart, monthEnd(initialMonthStart)),
    getAllStaff(),
  ]);
  const staffList = allStaff
    .filter((s) => s.is_active)
    .map((s) => ({ id: s.id, name: s.schedule_display_name || s.name }));

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <h1 className="text-xl font-semibold">むすひ 受付スケジュール</h1>
      <p className="text-sm text-neutral-500">
        むすひの受付を、日付ごとに担当者と時間帯で組み立てます(Le lienのスケジュールとは別の予定です)。
      </p>
      <MusuhiScheduleBuilderPanel initialMonthStart={initialMonthStart} initialShifts={shifts} staffList={staffList} />
    </div>
  );
}
