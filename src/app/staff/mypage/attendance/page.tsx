import { notFound } from "next/navigation";
import { getStaffUser, resolveActingStaffId } from "@/lib/auth";
import { getOwnPayCategories } from "@/lib/pay-categories";
import { getStaffDetail } from "@/lib/staff-admin";
import { getOwnTimeLogEntries } from "@/lib/time-log";
import { currentPayPeriod } from "@/lib/date";
import TimeLogForm from "@/components/staff/TimeLogForm";

export default async function StaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ staffId?: string }>;
}) {
  const staff = await getStaffUser();
  if (!staff) notFound();

  const { staffId: targetStaffId } = await searchParams;
  const acting = await resolveActingStaffId(targetStaffId);
  if ("error" in acting) notFound();

  const { periodStart, periodEnd } = currentPayPeriod();
  const periodLabel = `${periodStart}〜${periodEnd}`;

  let payCategories;
  let staffName: string | null = null;
  if (targetStaffId) {
    const detail = await getStaffDetail(acting.id);
    if (!detail) notFound();
    payCategories = detail.payCategories;
    staffName = detail.profile.name;
  } else {
    payCategories = await getOwnPayCategories();
  }

  const hourlyCategories = payCategories.filter((c) => c.unit_type === "hourly");
  const timeLogEntriesByCategory = Object.fromEntries(
    await Promise.all(
      hourlyCategories.map(
        async (c) => [c.id, await getOwnTimeLogEntries(c.id, periodStart, periodEnd, targetStaffId)] as const,
      ),
    ),
  );

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <a href={targetStaffId ? `/staff/admin/staff/${targetStaffId}` : "/staff/mypage"} className="text-sm underline">
        ← {targetStaffId ? `${staffName} さんのページに戻る` : "マイページに戻る"}
      </a>
      <h1 className="text-xl font-semibold">
        {staffName ? `${staffName} さんの出退勤記録` : "出退勤記録"}({periodLabel})
      </h1>

      {hourlyCategories.length === 0 ? (
        <p className="text-sm text-neutral-400">時給の区分が設定されていません。管理者に設定を依頼してください。</p>
      ) : (
        <>
          <p className="text-xs text-neutral-400">
            出勤・退勤・休憩の時刻を入れると、労働時間が自動計算されて実績入力に反映されます。
          </p>
          {hourlyCategories.map((c) => (
            <TimeLogForm
              key={c.id}
              payCategoryId={c.id}
              categoryName={c.name}
              entries={timeLogEntriesByCategory[c.id]}
              periodStart={periodStart}
              periodEnd={periodEnd}
              staffId={targetStaffId}
            />
          ))}
        </>
      )}
    </div>
  );
}
