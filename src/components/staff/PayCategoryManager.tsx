"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePayCategory, upsertPayCategory } from "@/lib/pay-categories";
import { PAY_UNIT_LABEL, type PayCategory, type PayUnitType } from "@/lib/types";

const ALL_UNIT_TYPES: PayUnitType[] = ["hourly", "per_lesson"];

function CategoryRow({
  staffId,
  category,
}: {
  staffId: string;
  category: PayCategory;
}) {
  const router = useRouter();
  const [name, setName] = useState(category.name);
  const [unitType, setUnitType] = useState<PayUnitType>(category.unit_type);
  const [rate, setRate] = useState(category.rate);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    const result = await upsertPayCategory({ id: category.id, staffId, name, unitType, rate });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deletePayCategory(category.id, staffId);
    setDeleting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 py-2 text-sm dark:border-neutral-900">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-40 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
      />
      <select
        value={unitType}
        onChange={(e) => setUnitType(e.target.value as PayUnitType)}
        className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
      >
        {ALL_UNIT_TYPES.map((u) => (
          <option key={u} value={u}>
            {PAY_UNIT_LABEL[u]}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        value={rate}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setRate(Number(e.target.value))}
        className="w-28 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
      />
      <button onClick={handleSave} disabled={submitting} className="underline disabled:opacity-40">
        {submitting ? "保存中..." : "保存"}
      </button>
      <button onClick={handleDelete} disabled={deleting} className="text-red-600 underline disabled:opacity-40">
        {deleting ? "削除中..." : "削除"}
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}

export default function PayCategoryManager({ staffId, payCategories }: { staffId: string; payCategories: PayCategory[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [newUnitType, setNewUnitType] = useState<PayUnitType>("per_lesson");
  const [newRate, setNewRate] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    setAdding(true);
    setError(null);
    const result = await upsertPayCategory({ staffId, name: newName, unitType: newUnitType, rate: newRate });
    setAdding(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNewName("");
    setNewRate(0);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">支払区分(管理者のみ編集可)</h2>
      <p className="text-xs text-neutral-400">
        時給の受付業務など、名前と単価をそのままスタッフに見せてよいものに使います(店舗によって時給が違う場合は
        「むすひ受付」「Le lien受付」のように分けて登録してください)。人数によって単価が変わるレッスンは、下の
        「単価ルール」を使ってください。
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {payCategories.length === 0 ? (
        <p className="text-sm text-neutral-400">支払区分がまだありません。下記から追加してください。</p>
      ) : (
        <div>
          {payCategories.map((c) => (
            <CategoryRow key={c.id} staffId={staffId} category={c} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-4 text-sm dark:border-neutral-900">
        <label className="flex flex-col gap-1">
          区分名
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例: むすひ受付"
            className="w-40 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
          />
        </label>
        <label className="flex flex-col gap-1">
          単位
          <select
            value={newUnitType}
            onChange={(e) => setNewUnitType(e.target.value as PayUnitType)}
            className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
          >
            {ALL_UNIT_TYPES.map((u) => (
              <option key={u} value={u}>
                {PAY_UNIT_LABEL[u]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          単価(円)
          <input
            type="number"
            min={0}
            value={newRate}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setNewRate(Number(e.target.value))}
            className="w-28 rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-800"
          />
        </label>
        <button
          onClick={handleAdd}
          disabled={adding || !newName.trim()}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {adding ? "追加中..." : "追加する"}
        </button>
      </div>
    </div>
  );
}
