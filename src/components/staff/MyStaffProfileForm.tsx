"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOwnStaffProfile } from "@/lib/staff-self";
import type { StaffProfile } from "@/lib/types";

export default function MyStaffProfileForm({ profile }: { profile: StaffProfile }) {
  const router = useRouter();
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [contactEmail, setContactEmail] = useState(profile.contact_email ?? "");
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
