import { Suspense } from "react";
import SetPasswordForm from "@/components/staff/SetPasswordForm";

export default function StaffSetPasswordPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-10">
      <h1 className="text-xl font-semibold">パスワードの設定</h1>
      <p className="text-sm text-neutral-500">初回ログイン用のパスワードを設定してください。</p>
      <Suspense fallback={<p className="text-sm text-neutral-500">確認中...</p>}>
        <SetPasswordForm />
      </Suspense>
    </div>
  );
}
