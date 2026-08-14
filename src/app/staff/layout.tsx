import Link from "next/link";
import { getStaffUser } from "@/lib/auth";
import SignOutButton from "@/components/staff/SignOutButton";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaffUser();

  // 未ログイン(=ログインページ)はナビゲーションなしでそのまま表示する。
  if (!staff) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <div className="flex items-center gap-4">
          <span className="text-lg font-semibold tracking-wide">Le lien</span>
          <nav className="flex flex-wrap gap-4 text-sm">
            <Link href="/staff/mypage">マイページ</Link>
            {staff.role === "admin" && <Link href="/staff/admin/staff">スタッフ管理</Link>}
            {staff.role === "admin" && <Link href="/staff/admin/export">給与データ出力</Link>}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span>{staff.name} さん</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
