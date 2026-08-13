// 源泉徴収税額の計算。
//
// 業務委託(講師・インストラクター報酬)は、報酬・料金等の源泉徴収(所得税法204条)として
// 一律10.21%(1円未満切り捨て)。
//
// 時給制(給与所得者)は、国税庁「令和8年分 月額表の甲欄を適用する給与等に対する税額の
// 電算機計算の特例について」(https://www.nta.go.jp/publication/pamph/gensen/zeigakuhyo2026/data/denshi_01.pdf)
// の計算式をそのまま実装している。扶養控除等申告書を提出している主たる勤務先(甲欄)を前提とする。
// 社会保険料の控除には対応していない(該当者が出た場合は入力側で控除後の額を渡すこと)。

export function calculateContractorWithholding(taxableAmount: number): number {
  return Math.floor(taxableAmount * 0.1021);
}

// 第1表: 給与所得控除の額(その月の社会保険料等控除後の給与等の金額(A)に応じる)
function salaryDeduction(a: number): number {
  if (a <= 158333) return 54167;
  if (a <= 299999) return Math.ceil(a * 0.3 + 6667);
  if (a <= 549999) return Math.ceil(a * 0.2 + 36667);
  if (a <= 708330) return Math.ceil(a * 0.1 + 91667);
  return 162500;
}

// 第3表: 基礎控除の額(Aに応じる)
function basicDeduction(a: number): number {
  if (a <= 2120833) return 48334;
  if (a <= 2162499) return 40000;
  if (a <= 2204166) return 26667;
  if (a <= 2245833) return 13334;
  return 0;
}

// 第4表: その月の課税給与所得金額(B)に応じた税額の算式
function taxFromTaxableAmount(b: number): number {
  let raw: number;
  if (b <= 162500) raw = b * 0.05105;
  else if (b <= 275000) raw = b * 0.1021 - 8296;
  else if (b <= 579166) raw = b * 0.2042 - 36374;
  else if (b <= 750000) raw = b * 0.23483 - 54113;
  else if (b <= 1500000) raw = b * 0.33693 - 130688;
  else if (b <= 3333333) raw = b * 0.4084 - 237893;
  else raw = b * 0.45945 - 408061;

  // 10円未満四捨五入
  return Math.round(raw / 10) * 10;
}

export function calculateEmployeeWithholding(input: {
  grossAfterSocialInsurance: number;
  dependentCount: number;
  hasSpouseDeduction: boolean;
}): number {
  const a = input.grossAfterSocialInsurance;

  // 第2表: 配偶者控除・扶養控除の額(いずれも31,667円単位)
  const spouseDeduction = input.hasSpouseDeduction ? 31667 : 0;
  const dependentDeduction = 31667 * input.dependentCount;

  const totalDeductions = salaryDeduction(a) + spouseDeduction + dependentDeduction + basicDeduction(a);
  const taxableAmount = Math.max(0, a - totalDeductions);

  return taxFromTaxableAmount(taxableAmount);
}
