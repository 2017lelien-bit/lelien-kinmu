"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePayRateRule, upsertPayRateRule } from "@/lib/pay-rate-rules";
import { LESSON_NAMES, type PayRateRule } from "@/lib/types";

interface RuleFormValues {
  label: string;
  lessonName: string;
  durationMinutes: string;
  minHeadcount: string;
  maxHeadcount: string;
  rate: string;
}

function emptyValues(): RuleFormValues {
  return { label: "", lessonName: "", durationMinutes: "", minHeadcount: "", maxHeadcount: "", rate: "0" };
}

function valuesFromRule(rule: PayRateRule): RuleFormValues {
  return {
    label: rule.label,
    lessonName: rule.lesson_name ?? "",
    durationMinutes: rule.duration_minutes?.toString() ?? "",
    minHeadcount: rule.min_headcount?.toString() ?? "",
    maxHeadcount: rule.max_headcount?.toString() ?? "",
    rate: rule.rate.toString(),
  };
}

function RuleFields({
  values,
  onChange,
}: {
  values: RuleFormValues;
  onChange: (values: RuleFormValues) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        ルール名(管理用)
        <input
          value={values.label}
          onChange={(e) => onChange({ ...values, label: e.target.value })}
          placeholder="例: 60分1〜3人"
          className="w-36 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
        />
      </label>
      <label className="flex flex-col gap-1">
        レッスン名一致(空欄=問わない)
        <select
          value={values.lessonName}
          onChange={(e) => onChange({ ...values, lessonName: e.target.value })}
          className="w-32 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
        >
          <option value="">(問わない)</option>
          {LESSON_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        時間(分・空欄可)
        <input
          type="number"
          min={0}
          value={values.durationMinutes}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange({ ...values, durationMinutes: e.target.value })}
          className="w-20 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
        />
      </label>
      <label className="flex flex-col gap-1">
        人数下限(空欄可)
        <input
          type="number"
          min={0}
          value={values.minHeadcount}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange({ ...values, minHeadcount: e.target.value })}
          className="w-20 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
        />
      </label>
      <label className="flex flex-col gap-1">
        人数上限(空欄可)
        <input
          type="number"
          min={0}
          value={values.maxHeadcount}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange({ ...values, maxHeadcount: e.target.value })}
          className="w-20 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
        />
      </label>
      <label className="flex flex-col gap-1">
        単価(円)
        <input
          type="number"
          min={0}
          value={values.rate}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange({ ...values, rate: e.target.value })}
          className="w-24 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
        />
      </label>
    </div>
  );
}

function RuleRow({ staffId, rule }: { staffId: string; rule: PayRateRule }) {
  const router = useRouter();
  const [values, setValues] = useState<RuleFormValues>(valuesFromRule(rule));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    const result = await upsertPayRateRule({
      id: rule.id,
      staffId,
      label: values.label,
      lessonName: values.lessonName || undefined,
      durationMinutes: values.durationMinutes ? Number(values.durationMinutes) : undefined,
      minHeadcount: values.minHeadcount ? Number(values.minHeadcount) : undefined,
      maxHeadcount: values.maxHeadcount ? Number(values.maxHeadcount) : undefined,
      rate: Number(values.rate),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deletePayRateRule(rule.id, staffId);
    setDeleting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-neutral-100 py-2 text-sm dark:border-neutral-900">
      <RuleFields values={values} onChange={setValues} />
      <button onClick={handleSave} disabled={submitting} className="underline disabled:opacity-40">
        {submitting ? "保存中..." : "保存"}
      </button>
      <button onClick={handleDelete} disabled={deleting} className="text-red-600 underline disabled:opacity-40">
        {deleting ? "削除中..." : "削除"}
      </button>
      {error && <span className="w-full text-red-600">{error}</span>}
    </div>
  );
}

export default function PayRateRuleManager({ staffId, payRateRules }: { staffId: string; payRateRules: PayRateRule[] }) {
  const router = useRouter();
  const [newValues, setNewValues] = useState<RuleFormValues>(emptyValues());
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    setAdding(true);
    setError(null);
    const result = await upsertPayRateRule({
      staffId,
      label: newValues.label,
      lessonName: newValues.lessonName || undefined,
      durationMinutes: newValues.durationMinutes ? Number(newValues.durationMinutes) : undefined,
      minHeadcount: newValues.minHeadcount ? Number(newValues.minHeadcount) : undefined,
      maxHeadcount: newValues.maxHeadcount ? Number(newValues.maxHeadcount) : undefined,
      rate: Number(newValues.rate),
    });
    setAdding(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNewValues(emptyValues());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">単価ルール(管理者専用・スタッフには表示されません)</h2>
      <p className="text-xs text-neutral-400">
        「レッスン名一致」を入力すると、そのレッスン名なら人数を問わず定額になります(空欄なら時間・人数の範囲で判定)。
        両方空欄の項目は「問わない」という意味です。
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {payRateRules.length === 0 ? (
        <p className="text-sm text-neutral-400">ルールがまだありません。下記から追加してください。</p>
      ) : (
        <div>
          {payRateRules.map((rule) => (
            <RuleRow key={rule.id} staffId={staffId} rule={rule} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-900">
        <RuleFields values={newValues} onChange={setNewValues} />
        <button
          onClick={handleAdd}
          disabled={adding || !newValues.label.trim()}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {adding ? "追加中..." : "追加する"}
        </button>
      </div>
    </div>
  );
}
