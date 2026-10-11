// 日本の祝日(振替休日・国民の休日を含む)。内閣府の祝日の定めに沿った計算で、1980〜2099年に対応。
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function dow(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// 第n月曜日の日付(日)を返す。
function nthMonday(y: number, m: number, n: number): number {
  const firstDow = dow(y, m, 1);
  return 1 + ((8 - firstDow) % 7) + (n - 1) * 7;
}

function vernalEquinoxDay(y: number): number {
  return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

function autumnalEquinoxDay(y: number): number {
  return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

const cache = new Map<number, Set<string>>();

function holidaysOfYear(y: number): Set<string> {
  const cached = cache.get(y);
  if (cached) return cached;

  const base = new Set<string>([
    ymd(y, 1, 1),
    ymd(y, 1, nthMonday(y, 1, 2)),
    ymd(y, 2, 11),
    ymd(y, 2, 23),
    ymd(y, 3, vernalEquinoxDay(y)),
    ymd(y, 4, 29),
    ymd(y, 5, 3),
    ymd(y, 5, 4),
    ymd(y, 5, 5),
    ymd(y, 7, nthMonday(y, 7, 3)),
    ymd(y, 8, 11),
    ymd(y, 9, nthMonday(y, 9, 3)),
    ymd(y, 9, autumnalEquinoxDay(y)),
    ymd(y, 10, nthMonday(y, 10, 2)),
    ymd(y, 11, 3),
    ymd(y, 11, 23),
  ]);

  const all = new Set(base);
  const dayMs = 24 * 60 * 60 * 1000;
  const addDays = (dateStr: string, n: number): string => {
    const [yy, mm, dd] = dateStr.split("-").map(Number);
    const t = new Date(Date.UTC(yy, mm - 1, dd) + n * dayMs);
    return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  };
  const dowOf = (dateStr: string): number => {
    const [yy, mm, dd] = dateStr.split("-").map(Number);
    return dow(yy, mm, dd);
  };

  // 振替休日: 祝日が日曜なら、その後の最初の祝日でない日が休みになる。
  for (const h of base) {
    if (dowOf(h) === 0) {
      let next = addDays(h, 1);
      while (all.has(next)) next = addDays(next, 1);
      all.add(next);
    }
  }
  // 国民の休日: 前日と翌日がどちらも祝日の平日(日曜以外)は休みになる。
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 31; d++) {
      const s = ymd(y, m, d);
      if (new Date(Date.UTC(y, m - 1, d)).getUTCMonth() !== m - 1) continue;
      if (all.has(s) || dowOf(s) === 0) continue;
      if (all.has(addDays(s, -1)) && all.has(addDays(s, 1))) all.add(s);
    }
  }

  cache.set(y, all);
  return all;
}

export function isJapaneseHoliday(dateStr: string): boolean {
  const y = Number(dateStr.split("-")[0]);
  return holidaysOfYear(y).has(dateStr);
}
