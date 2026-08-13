import { notFound } from "next/navigation";
import { getStaffUser } from "@/lib/auth";
import InviteStaffForm from "@/components/staff/InviteStaffForm";

export default async function StaffAdminInvitePage() {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">新規スタッフを招待</h1>
      <p className="text-sm text-neutral-500">
        入力したメールアドレスに招待メールが送信されます。本人がメール内のリンクからパスワードを設定するとログインできるようになります。
      </p>
      <InviteStaffForm />
    </div>
  );
}
