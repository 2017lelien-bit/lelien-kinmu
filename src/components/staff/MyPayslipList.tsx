import type { StaffPayslip } from "@/lib/types";

export default function MyPayslipList({ payslips }: { payslips: StaffPayslip[] }) {
  if (payslips.length === 0) {
    return <p className="text-sm text-neutral-400">まだ給与明細は作成されていません。</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {payslips.map((p) => (
        <li key={p.id} className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          <p className="font-semibold">
            {p.period_start} 〜 {p.period_end}
          </p>

          {p.breakdown.lines.length > 0 && (
            <ul className="mt-2 flex flex-col gap-0.5 text-neutral-600 dark:text-neutral-400">
              {p.breakdown.lines.map((line) => (
                <li key={line.payCategoryId}>
                  {line.name}: {line.quantity}
                  {line.unitType === "hourly" ? "時間" : "回"} × ¥{line.rate.toLocaleString()} = ¥
                  {line.subtotal.toLocaleString()}
                </li>
              ))}
            </ul>
          )}

          {p.breakdown.lessonLines.length > 0 && (
            <ul className="mt-2 flex flex-col gap-0.5 text-neutral-600 dark:text-neutral-400">
              {p.breakdown.lessonLines.map((line) => (
                <li key={line.entryId}>
                  {line.date} {line.lessonName}({line.durationMinutes}分・{line.headcount}人) = ¥
                  {line.rate.toLocaleString()}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-col gap-1 border-t border-neutral-100 pt-2 dark:border-neutral-900">
            <p>支給額計: ¥{p.gross_amount.toLocaleString()}</p>
            <p>通勤費: ¥{p.commute_allowance.toLocaleString()}</p>
            <p>総支給額: ¥{p.total_gross.toLocaleString()}</p>
            <p>所得税: ¥{p.income_tax.toLocaleString()}</p>
            <p>住民税: ¥{p.resident_tax.toLocaleString()}</p>
            <p className="font-semibold">差引支給額: ¥{p.net_amount.toLocaleString()}</p>
            <p className="text-neutral-400">出勤日数: {p.days_worked}日</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
