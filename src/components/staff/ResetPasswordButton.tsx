"use client";

import { useState } from "react";
import { resetStaffPassword } from "@/lib/staff-admin";

export default function ResetPasswordButton({ staffId }: { staffId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);
    const result = await resetStaffPassword(staffId);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResetLink(result.data.resetLink);
  }

  if (resetLink) {
    return (
      <div className="flex max-w-md flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-sm font-semibold">パスワード再設定リンクを発行しました。</p>
        <p className="text-xs text-neutral-500">
          以下のURLをLINEなどでご本人に送ってください。開いて新しいパスワードを設定すると、またログインできるようになります。
        </p>
        <input
          readOnly
          value={resetLink}
          onFocus={(e) => e.currentTarget.select()}
          className="rounded-lg border border-neutral-200 px-3 py-2 text-xs dark:border-neutral-800"
        />
        <button onClick={() => setResetLink(null)} className="self-start text-sm underline">
          閉じる
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={handleClick}
        disabled={submitting}
        className="self-start rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
      >
        {submitting ? "発行中..." : "パスワード再設定リンクを発行する"}
      </button>
    </div>
  );
}
