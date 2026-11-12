import { dayOfWeekForDate } from "@/lib/date";
import { CLOSED_DAY_LINES, MORNING_MESSAGES, MORNING_SCHEDULE } from "@/lib/instagram/morning-data";

// 朝のストーリーズ(あいさつ + 今日のレッスン + 前向きな一言)の、画像に載せる行を作る。
// 文章は、渡部さんが確認した一言(morning-data.ts)と、スケジュールの項目をそのまま並べるだけ。AIが文章を作ることはしない。

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// "2026-11-12" → "11/12(木)"
export function formatMorningDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}(${WEEKDAYS[dayOfWeekForDate(date)]})`;
}

// 日替わりの前向きな一言。日付から決めるので、同じ日は何度作っても同じ(連続しない・8日で一巡)。
export function pickMorningMessage(date: string): string[] {
  const [y, m, d] = date.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return MORNING_MESSAGES[dayNumber % MORNING_MESSAGES.length];
}

// その日の行。スケジュールのデータがない日は null(出さない)。
export function buildMorningLines(date: string): string[] | null {
  const day = MORNING_SCHEDULE[date];
  if (!day) return null;
  const head = ["おはようございます", "", ...(day.closed ? [formatMorningDate(date), ...CLOSED_DAY_LINES] : [`${formatMorningDate(date)} 今日のクラス`, ...day.items])];
  if (day.closed) return head;
  return [...head, "", ...pickMorningMessage(date)];
}

// 日付のデータが、この日から何日先まで入っているか(今日を含む)。入っていない日から数えて 0。
export function scheduleCoverageDays(fromDate: string, maxDays = 14): number {
  let n = 0;
  for (let i = 0; i < maxDays; i++) {
    const [y, m, d] = fromDate.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    if (!MORNING_SCHEDULE[date]) break;
    n++;
  }
  return n;
}
