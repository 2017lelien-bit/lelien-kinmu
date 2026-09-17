import "server-only";
import { Resend } from "resend";
import type { PayrollBreakdown } from "@/lib/types";

const FROM = process.env.RESEND_FROM_EMAIL ?? "Le lien給与 <onboarding@resend.dev>";

// ビルド時など環境変数が未設定の段階でモジュール評価が走ってもエラーにならないよう遅延生成する。
function getResendClient(): Resend {
  return new Resend(process.env.RESEND_API_KEY);
}

function isLeLienCategoryName(name: string): boolean {
  return !name.trim().includes("むすひ");
}

// 同じ支払区分が2行に分かれていれば、期の途中で単価が変わった区分がある、ということ。
function hasRateChangeSplit(lines: { payCategoryId: string }[]): boolean {
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.payCategoryId)) return true;
    seen.add(l.payCategoryId);
  }
  return false;
}

// レッスン本数が多いスタッフだと1本ずつの明細が長くなりすぎるため、レッスンは合計本数だけに
// まとめ、時間制のカテゴリはむすひ/Lelienの時間合計を添えて示す。
function payslipBreakdownHtml(breakdown: PayrollBreakdown): string {
  const musuhiHours = breakdown.lines
    .filter((l) => l.unitType === "hourly" && !isLeLienCategoryName(l.name))
    .reduce((sum, l) => sum + l.quantity, 0);
  const leLienHours = breakdown.lines
    .filter((l) => l.unitType === "hourly" && isLeLienCategoryName(l.name))
    .reduce((sum, l) => sum + l.quantity, 0);

  const categoryItems = breakdown.lines.map(
    (line) =>
      `<li>${line.name}: ${line.quantity}${line.unitType === "hourly" ? "時間" : "回"} × ¥${line.rate.toLocaleString()} = ¥${line.subtotal.toLocaleString()}</li>`,
  );
  if (leLienHours > 0) categoryItems.push(`<li>Lelien時間合計: ${leLienHours}時間</li>`);
  if (musuhiHours > 0) categoryItems.push(`<li>むすひ時間合計: ${musuhiHours}時間</li>`);

  const noteHtml = hasRateChangeSplit(breakdown.lines)
    ? "<p>※期間の途中で時給が変わったため、上記のように分けて計算しています。</p>"
    : "";
  const categoryHtml = categoryItems.length > 0 ? `<ul>${categoryItems.join("")}</ul>${noteHtml}` : noteHtml;

  const lessonTotal = breakdown.lessonLines.reduce((sum, l) => sum + l.rate, 0);
  const lessonHtml =
    breakdown.lessonLines.length > 0 ? `<ul><li>レッスン合計: ${breakdown.lessonLines.length}本 = ¥${lessonTotal.toLocaleString()}</li></ul>` : "";

  return categoryHtml + lessonHtml;
}

export async function sendStaffPayslipEmail(
  to: string,
  staffName: string,
  payslip: {
    periodStart: string;
    periodEnd: string;
    breakdown: PayrollBreakdown;
    grossAmount: number;
    commuteAllowance: number;
    totalGross: number;
    incomeTax: number;
    residentTax: number;
    netAmount: number;
  },
): Promise<boolean> {
  const { error } = await getResendClient().emails.send({
    from: FROM,
    to,
    subject: `【Le lien】給与明細のお知らせ(${payslip.periodStart}〜${payslip.periodEnd})`,
    html: `
      <p>${staffName} 様</p>
      <p>対象期間: ${payslip.periodStart} 〜 ${payslip.periodEnd}</p>
      ${payslipBreakdownHtml(payslip.breakdown)}
      <ul>
        <li>支給額計: ¥${payslip.grossAmount.toLocaleString()}</li>
        <li>通勤費: ¥${payslip.commuteAllowance.toLocaleString()}</li>
        <li>総支給額: ¥${payslip.totalGross.toLocaleString()}</li>
        <li>所得税: ¥${payslip.incomeTax.toLocaleString()}</li>
        <li>住民税: ¥${payslip.residentTax.toLocaleString()}</li>
      </ul>
      <p>差引支給額: ¥${payslip.netAmount.toLocaleString()}</p>
    `,
  });

  if (error) {
    console.error("[Resend] payslip email failed", error);
    return false;
  }
  return true;
}
