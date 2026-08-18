import Link from "next/link";
import { getStaffUser } from "@/lib/auth";
import { getPendingSubmissionCount } from "@/lib/staff-admin";
import SignOutButton from "@/components/staff/SignOutButton";
import NotificationOptIn from "@/components/staff/NotificationOptIn";
import AppBadgeSync from "@/components/staff/AppBadgeSync";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaffUser();

  // 未ログイン(=ログインページ)はナビゲーションなしでそのまま表示する。
  if (!staff) {
    return <>{children}</>;
  }

  const pendingCount = staff.role === "admin" ? await getPendingSubmissionCount() : 0;

  return (
    <div className="flex min-h-screen flex-col">
      {staff.role === "admin" && <AppBadgeSync pendingCount={pendingCount} />}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <div className="flex items-center gap-4">
          <span className="text-lg font-semibold tracking-wide">Le lien</span>
          <nav className="flex flex-wrap gap-4 text-sm">
            <Link href="/staff/mypage">マイページ</Link>
            {staff.role === "admin" && (
              <Link href="/staff/admin/staff" className="inline-flex items-center gap-1">
                スタッフ管理
                {pendingCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">
                    {pendingCount}
                  </span>
                )}
              </Link>
            )}
            {staff.role === "admin" && <Link href="/staff/admin/export">給与データ出力</Link>}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span>{staff.name} さん</span>
          <SignOutButton />
        </div>
        {staff.role === "admin" && (
          <div className="w-full border-t border-neutral-100 pt-2 dark:border-neutral-900">
            <NotificationOptIn />
          </div>
        )}
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
