"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertPayEntry } from "@/lib/staff-self";
import type { PayCategory, PayEntry } from "@/lib/types";

export default function PayEntryForm({
  payCategories,
  payEntries,
  periodStart,
  staffId,
}: {
  payCategories: PayCategory[];
  payEntries: PayEntry[];
  periodStart: string;
  staffId?: string;
}) {
  const router = useRouter();
  const entryByCategory = new Map(payEntries.map((e) => [e.pay_category_id, e.quantity]));
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(payCategories.map((c) => [c.id, entryByCategory.get(c.id) ?? 0])),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const total = payCategories.reduce((sum, c) => sum + (quantities[c.id] ?? 0) * c.rate, 0);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    setSaved(false);

    for (const c of payCategories) {
      const result = await upsertPayEntry(
        {
          payCategoryId: c.id,
          periodStart,
          quantity: quantities[c.id] ?? 0,
        },
        staffId,
      );
      if (!result.ok) {
        setSubmitting(false);
        setError(result.error);
        return;
      }
    }

    setSubmitting(false);
    setSaved(true);
    router.refresh();
  }

  if (payCategories.length === 0) {
    return <p className="text-sm text-neutral-400">支払区分が設定されていません。管理者に設定を依頼してください。</p>;
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">保存しました。</p>}

      <div className="flex flex-col gap-3">
        {payCategories.map((c) => {
          const isHourly = c.unit_type === "hourly";
          const quantity = quantities[c.id] ?? 0;
          return (
            <div key={c.id} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{c.name}</span>
                <span className="text-xs text-neutral-400">
                  {isHourly ? "時給" : "1回あたり"} ¥{c.rate.toLocaleString()}
                </span>
              </div>
              <label className="mt-2 flex flex-col gap-1 text-sm">
                {isHourly ? "働いた時間(合計・時間)" : "行った回数"}
                <input
                  type="number"
                  min={0}
                  step={isHourly ? 0.25 : 1}
                  value={quantity}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    setQuantities((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))
                  }
                  className="w-32 rounded-lg border border-neutral-200 px-3 py-2 text-base dark:border-neutral-800"
                />
              </label>
              <p className="mt-2 text-sm text-neutral-500">
                小計: ¥{(quantity * c.rate).toLocaleString()}
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-sm font-semibold">当月の支給額計: ¥{total.toLocaleString()}</p>

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
