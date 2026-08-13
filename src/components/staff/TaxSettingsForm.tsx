"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setStaffActive, updateStaffTaxSettings } from "@/lib/staff-admin";

export default function TaxSettingsForm({
  staffId,
  dependentCount: initialDependentCount,
  hasSpouseDeduction: initialHasSpouseDeduction,
  isActive: initialIsActive,
}: {
  staffId: string;
  dependentCount: number;
  hasSpouseDeduction: boolean;
  isActive: boolean;
}) {
  const router = useRouter();
  const [dependentCount, setDependentCount] = useState(initialDependentCount);
  const [hasSpouseDeduction, setHasSpouseDeduction] = useState(initialHasSpouseDeduction);
  const [isActive, setIsActive] = useState(initialIsActive);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingActive, setSavingActive] = useState(false);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    const result = await updateStaffTaxSettings(staffId, { dependentCount, hasSpouseDeduction });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleToggleActive() {
    setSavingActive(true);
    const result = await setStaffActive(staffId, !isActive);
    setSavingActive(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setIsActive(!isActive);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">税設定(管理者のみ編集可)</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-xs text-neutral-400">
        所得税は収入の出どころによって自動で計算方法が切り替わります。「支払区分」からの収入は給与として下記の扶養設定をもとに
        国税庁「月額表甲欄」の計算式で、「単価ルール(レッスン実績)」からの収入は報酬として一律10.21%で計算します。
        両方持つスタッフはそれぞれ別々に計算して合算します。
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
          onChange={(e) => setDependentCount(Number(e.target.value))}
          className="w-24 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        />
      </label>

      <button
        onClick={handleSave}
        disabled={submitting}
        className="self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {submitting ? "保存中..." : "保存"}
      </button>

      <div className="flex items-center gap-3 border-t border-neutral-100 pt-4 text-sm dark:border-neutral-900">
        <span>状態: {isActive ? "在籍中" : "退職済み"}</span>
        <button onClick={handleToggleActive} disabled={savingActive} className="underline disabled:opacity-40">
          {savingActive ? "更新中..." : isActive ? "退職済みにする" : "在籍中に戻す"}
        </button>
      </div>
    </div>
  );
}
