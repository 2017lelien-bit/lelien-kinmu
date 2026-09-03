import { notFound } from "next/navigation";
import Link from "next/link";
import { getStaffUser } from "@/lib/auth";
import { getAllStaff, getPendingSubmissionMap } from "@/lib/staff-admin";

export default async function StaffAdminStaffListPage() {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  const [allStaff, pendingMap] = await Promise.all([getAllStaff(), getPendingSubmissionMap()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">スタッフ管理</h1>
        <Link
          href="/staff/admin/staff/new"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
        >
          新規スタッフを招待
        </Link>
      </div>

      <div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
              <th className="py-2 pr-4">お名前</th>
              <th className="py-2 pr-4">権限</th>
              <th className="py-2 pr-4">連絡先</th>
              <th className="py-2 pr-4">状態</th>
              <th className="py-2 pr-4">提出確認</th>
            </tr>
          </thead>
          <tbody>
            {allStaff.map((s) => {
              const pending = pendingMap[s.id] ?? [];
              return (
                <tr key={s.id} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-2 pr-4">
                    <Link href={`/staff/admin/staff/${s.id}`} className="inline-flex items-center gap-1 underline">
                      {s.name}
                      {pending.length > 0 && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">
                          {pending.length}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{s.role === "admin" ? "管理者" : "スタッフ"}</td>
                  <td className="py-2 pr-4">{s.phone ?? s.contact_email ?? "-"}</td>
                  <td className="py-2 pr-4">
                    {s.is_active ? "在籍中" : (
                      <span className="text-neutral-400">退職済み</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {pending.length > 0 ? (
                      <span className="font-semibold text-red-600">未確認 {pending.length}件</span>
                    ) : (
                      <span className="text-neutral-400">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
