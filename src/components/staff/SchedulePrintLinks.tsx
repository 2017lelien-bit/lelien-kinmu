"use client";

import { useState } from "react";
import Link from "next/link";

export default function SchedulePrintLinks({ initialMonthStart }: { initialMonthStart: string }) {
  const [month, setMonth] = useState(initialMonthStart.slice(0, 7));

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        対象月
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>
      <span className="text-xs text-neutral-400 self-center">Le lien:</span>
      {[
        { type: "staff", label: "スタッフ用" },
        { type: "customer", label: "お客様用" },
        { type: "hp", label: "HP用" },
      ].map(({ type, label }) => (
        <Link
          key={type}
          href={`/staff/admin/schedule/print?month=${month}&type=${type}`}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
        >
          {label}を開く
        </Link>
      ))}
      <span className="text-xs text-neutral-400 self-center">むすひ:</span>
      {[
        { type: "staff", label: "スタッフ用(担当者と時間)" },
        { type: "customer", label: "お客様用(営業時間)" },
      ].map(({ type, label }) => (
        <Link
          key={type}
          href={`/staff/admin/schedule/musuhi-print?month=${month}&type=${type}`}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
        >
          {label}を開く
        </Link>
      ))}
      <span className="text-xs text-neutral-400 self-center">両方に通っている方用:</span>
      <Link
        href={`/staff/admin/schedule/combined-print?month=${month}`}
        className="rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
      >
        Le lien＋むすひ(お客様用)を開く
      </Link>
    </div>
  );
}
