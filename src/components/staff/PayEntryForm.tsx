"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertPayEntry } from "@/lib/staff-self";
import { PAY_UNIT_LABEL, type PayCategory, type PayEntry } from "@/lib/types";

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

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
            <th className="py-2 pr-4">区分</th>
            <th className="py-2 pr-4">単価</th>
            <th className="py-2 pr-4">{"実績(時間 or 回数)"}</th>
            <th className="py-2 pr-4">小計</th>
          </tr>
        </thead>
        <tbody>
          {payCategories.map((c) => (
            <tr key={c.id} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="py-2 pr-4">
                {c.name}
                <span className="ml-1 text-xs text-neutral-400">({PAY_UNIT_LABEL[c.unit_type]})</span>
              </td>
              <td className="py-2 pr-4">¥{c.rate.toLocaleString()}</td>
              <td className="py-2 pr-4">
                <input
                  type="number"
                  min={0}
                  step={c.unit_type === "hourly" ? 0.25 : 1}
                  value={quantities[c.id] ?? 0}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    setQuantities((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))
                  }
                  className="w-24 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
                />
              </td>
              <td className="py-2 pr-4">¥{((quantities[c.id] ?? 0) * c.rate).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

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
