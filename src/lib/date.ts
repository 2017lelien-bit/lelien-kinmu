// JST(日本時間, DSTなし)を前提とした日付ユーティリティ。
export function todayJstDateString(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function formatDateJp(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("ja-JP", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

// 給与の締めは毎月16日〜翌15日。period_startは常にその期間の16日を表す。
export function payPeriodEnd(periodStart: string): string {
  const [y, m] = periodStart.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 15)); // m(1-12)をUTCの月indexとして渡すと翌月15日になる
  return end.toISOString().slice(0, 10);
}

// 任意の日付が属する締め期間(16日〜翌15日)を返す。
export function payPeriodForDate(dateStr: string): { periodStart: string; periodEnd: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = d >= 16 ? new Date(Date.UTC(y, m - 1, 16)) : new Date(Date.UTC(y, m - 2, 16));
  const periodStart = start.toISOString().slice(0, 10);
  return { periodStart, periodEnd: payPeriodEnd(periodStart) };
}

export function currentPayPeriod(): { periodStart: string; periodEnd: string } {
  return payPeriodForDate(todayJstDateString());
}

// スケジュール提出用。基準日の翌月の月初(YYYY-MM-01)を返す。
export function nextMonthStart(dateStr: string = todayJstDateString()): string {
  const [y, m] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

// 月初(YYYY-MM-01)から、n(0以上)ヶ月先の月初を返す(先の月まで選べるようにする月ピッカー用)。
export function addMonthsToMonthStart(monthStart: string, n: number): string {
  const [y, m] = monthStart.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

// 月初(YYYY-MM-01)から、その月の月末の日付を返す。
export function monthEnd(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function minutesSinceMidnight(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// 出勤〜退勤・休憩時刻(いずれも"HH:MM"形式)から実労働時間(分)を計算する。
export function computeWorkedMinutes(entry: {
  startTime: string;
  endTime: string;
  breakStart?: string | null;
  breakEnd?: string | null;
}): number {
  let minutes = minutesSinceMidnight(entry.endTime) - minutesSinceMidnight(entry.startTime);
  if (entry.breakStart && entry.breakEnd) {
    minutes -= minutesSinceMidnight(entry.breakEnd) - minutesSinceMidnight(entry.breakStart);
  }
  return Math.max(0, minutes);
}

export function jstDateStringFromIso(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// タイムゾーンに依存せず、カレンダー上の日付から曜日(0=日曜...6=土曜)を求める。
export function dayOfWeekForDate(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ISO日時から、日本時間での時(0〜23)を取り出す。
export function jstHourFromIso(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", hourCycle: "h23" }).format(
      new Date(iso),
    ),
  );
}

export function formatTimeJst(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTimeJst(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
