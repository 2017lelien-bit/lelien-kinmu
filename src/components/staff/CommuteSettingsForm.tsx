"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCommuteSettings } from "@/lib/staff-admin";
import { COMMUTE_TYPE_LABEL, type CommuteType } from "@/lib/types";

export default function CommuteSettingsForm({
  staffId,
  commuteType: initialCommuteType,
  commuteAmount: initialCommuteAmount,
}: {
  staffId: string;
  commuteType: CommuteType;
  commuteAmount: number;
}) {
  const router = useRouter();
  const [commuteType, setCommuteType] = useState<CommuteType>(initialCommuteType);
  const [commuteAmount, setCommuteAmount] = useState(initialCommuteAmount);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    const result = await updateCommuteSettings(staffId, { commuteType, commuteAmount });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">通勤費の設定(管理者のみ編集可)</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <label className="flex flex-col gap-1 text-sm">
        設定方法
        <select
          value={commuteType}
          onChange={(e) => setCommuteType(e.target.value as CommuteType)}
          className="w-56 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        >
          {Object.entries(COMMUTE_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {commuteType !== "none" && (
        <label className="flex flex-col gap-1 text-sm">
          {commuteType === "fixed" ? "毎月の金額(円)" : "1日あたりの単価(円)"}
          <input
            type="number"
            min={0}
            value={commuteAmount}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setCommuteAmount(Number(e.target.value))}
            className="w-32 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
      )}

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
