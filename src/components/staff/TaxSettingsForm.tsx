"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setStaffActive } from "@/lib/staff-admin";

export default function TaxSettingsForm({
  staffId,
  dependentCount,
  hasSpouseDeduction,
  isActive: initialIsActive,
}: {
  staffId: string;
  dependentCount: number;
  hasSpouseDeduction: boolean;
  isActive: boolean;
}) {
  const router = useRouter();
  const [isActive, setIsActive] = useState(initialIsActive);
  const [error, setError] = useState<string | null>(null);
  const [savingActive, setSavingActive] = useState(false);

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
      <h2 className="text-sm font-semibold">税設定(スタッフ本人がマイページで入力)</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-xs text-neutral-400">
        所得税は収入の出どころによって自動で計算方法が切り替わります。「支払区分」からの収入は給与として下記の扶養設定をもとに
        国税庁「月額表甲欄」の計算式で、「単価ルール(レッスン実績)」からの収入は報酬として一律10.21%で計算します。
        両方持つスタッフはそれぞれ別々に計算して合算します。
      </p>

      <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
        <dt className="text-neutral-500">源泉控除対象配偶者</dt>
        <dd>{hasSpouseDeduction ? "あり" : "なし"}</dd>
        <dt className="text-neutral-500">扶養親族等の人数</dt>
        <dd>{dependentCount}人</dd>
      </dl>

      <div className="flex items-center gap-3 border-t border-neutral-100 pt-4 text-sm dark:border-neutral-900">
        <span>状態: {isActive ? "在籍中" : "退職済み"}</span>
        <button onClick={handleToggleActive} disabled={savingActive} className="underline disabled:opacity-40">
          {savingActive ? "更新中..." : isActive ? "退職済みにする" : "在籍中に戻す"}
        </button>
      </div>
    </div>
  );
}
