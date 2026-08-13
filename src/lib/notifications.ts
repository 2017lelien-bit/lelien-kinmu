import "server-only";
import { Resend } from "resend";
import type { PayrollBreakdown } from "@/lib/types";

const FROM = process.env.RESEND_FROM_EMAIL ?? "Le lien給与 <onboarding@resend.dev>";

// ビルド時など環境変数が未設定の段階でモジュール評価が走ってもエラーにならないよう遅延生成する。
function getResendClient(): Resend {
  return new Resend(process.env.RESEND_API_KEY);
}

function payslipBreakdownHtml(breakdown: PayrollBreakdown): string {
  const categoryHtml =
    breakdown.lines.length > 0
      ? `
        <ul>
          ${breakdown.lines
            .map(
              (line) =>
                `<li>${line.name}: ${line.quantity}${line.unitType === "hourly" ? "時間" : "回"} × ¥${line.rate.toLocaleString()} = ¥${line.subtotal.toLocaleString()}</li>`,
            )
            .join("")}
        </ul>
      `
      : "";

  // レッスン実績方式では、単価が人数によって変わる仕組みをスタッフに見せないため、
  // 日付・レッスン名・金額のみを表示する(時間・人数・該当ルール名は表示しない)。
  const lessonHtml =
    breakdown.lessonLines.length > 0
      ? `
        <ul>
          ${breakdown.lessonLines
            .map((line) => `<li>${line.date} ${line.lessonName}: ¥${line.rate.toLocaleString()}</li>`)
            .join("")}
        </ul>
      `
      : "";

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
