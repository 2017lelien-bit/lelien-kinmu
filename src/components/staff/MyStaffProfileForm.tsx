"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOwnStaffProfile } from "@/lib/staff-self";
import type { StaffProfile } from "@/lib/types";

export default function MyStaffProfileForm({ profile }: { profile: StaffProfile }) {
  const router = useRouter();
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [contactEmail, setContactEmail] = useState(profile.contact_email ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [dependentCount, setDependentCount] = useState(profile.dependent_count);
  const [hasSpouseDeduction, setHasSpouseDeduction] = useState(profile.has_spouse_deduction);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    setSaved(false);
    const result = await updateOwnStaffProfile({
      phone: phone || undefined,
      contactEmail: contactEmail || undefined,
      address: address || undefined,
      dependentCount,
      hasSpouseDeduction,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">基本情報</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">保存しました。</p>}

      <label className="flex flex-col gap-1 text-sm">
        電話番号
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        連絡先メールアドレス(給与明細の送付先になります)
        <input
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        住所
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>

      <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-900">
        <p className="text-xs text-neutral-400">
          以下は所得税(源泉徴収)の計算に使われます。扶養控除等申告書の内容に合わせて入力してください。
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hasSpouseDeduction}
            onChange={(e) => setHasSpouseDeduction(e.target.checked)}
          />
          源泉控除対象配偶者がいる
        </label>
        <label className="flex flex-col gap-1 text-sm">
          扶養親族等の人数
          <input
            type="number"
            min={0}
            value={dependentCount}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setDependentCount(Number(e.target.value))}
            className="w-24 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
      </div>

      <button
        onClick={handleSave}
        disabled={submitting}
        className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {submitting ? "保存中..." : "保存"}
      </button>
    </div>
  );
}
