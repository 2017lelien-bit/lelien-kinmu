import "server-only";
import { createMusuhiYoyakuAdminClient } from "@/lib/musuhi-booking-sync";
import { addDaysToDateString, addMonthsToMonthStart, dayOfWeekForDate, jstDateStringFromIso, todayJstDateString } from "@/lib/date";

// むすひ予約サイト(musuhi-yoyaku)の bookings を読み取り専用で集計し、来店人数の推移を出す。
// 書き込みは一切しない。
//
// 「来店」の数え方:
//   - status = completed(スタッフが来店済みにしたもの)
//   - status = confirmed で、開始時刻がもう過ぎているもの(来店済みの操作をし忘れた予約も来店として数える)
//   キャンセル(cancelled)・無断キャンセル(no_show)・仮予約(pending_confirmation)は来店に含めない。
// 人数: ペア蒸し(course = pair)は2名、シングル蒸しは1名として数える。

interface BookingRow {
  start_at: string;
  status: string;
  course: string;
  is_new_customer: boolean | null;
}

export interface PeriodStats {
  label: string;
  start: string; // YYYY-MM-DD(JST)
  end: string; // YYYY-MM-DD(JST、この日を含む)
  visitGroups: number; // 来店した予約の件数(組数)
  visitPeople: number; // 来店人数
  newCustomers: number; // 来店のうち新規のお客様の件数
  cancelled: number;
  noShow: number;
  upcoming: number; // まだ来ていない予約(これからの予約)
}

export interface MusuhiVisitStats {
  today: string;
  months: PeriodStats[]; // 古い順、最後が今月(今日まで)
  weeks: PeriodStats[]; // 古い順、最後が今週(月曜始まり、今日まで)
  monthToDate: { current: PeriodStats; lastMonth: PeriodStats; lastYear: PeriodStats };
}

export type MusuhiVisitStatsResult = { ok: true; stats: MusuhiVisitStats } | { ok: false; error: string };

function emptyStats(label: string, start: string, end: string): PeriodStats {
  return { label, start, end, visitGroups: 0, visitPeople: 0, newCustomers: 0, cancelled: 0, noShow: 0, upcoming: 0 };
}

function lastDayOfMonth(monthStart: string): string {
  return addDaysToDateString(addMonthsToMonthStart(monthStart, 1), -1);
}

// 「今月の今日まで」と比べるための、別の月の同じ日まで(その月にない日付は月末にそろえる)。
function sameDayInMonth(monthStart: string, day: number): string {
  const last = lastDayOfMonth(monthStart);
  const lastDay = Number(last.slice(8, 10));
  return `${monthStart.slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function tally(target: PeriodStats, row: BookingRow, nowMs: number) {
  const people = row.course === "pair" ? 2 : 1;
  const isPast = new Date(row.start_at).getTime() <= nowMs;
  if (row.status === "completed" || (row.status === "confirmed" && isPast)) {
    target.visitGroups += 1;
    target.visitPeople += people;
    if (row.is_new_customer) target.newCustomers += 1;
  } else if (row.status === "cancelled") {
    target.cancelled += 1;
  } else if (row.status === "no_show") {
    target.noShow += 1;
  } else if (row.status === "confirmed") {
    target.upcoming += 1;
  }
}

async function fetchBookings(fromDate: string, toDateExclusive: string): Promise<{ rows: BookingRow[]; error?: string }> {
  const client = createMusuhiYoyakuAdminClient();
  if (!client) {
    return { rows: [], error: "むすひ予約サイトへの接続設定(MUSUHI_YOYAKU_SUPABASE_URL / SERVICE_ROLE_KEY)がありません。" };
  }
  const rows: BookingRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("bookings")
      .select("start_at, status, course, is_new_customer")
      .gte("start_at", `${fromDate}T00:00:00+09:00`)
      .lt("start_at", `${toDateExclusive}T00:00:00+09:00`)
      .order("start_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return { rows: [], error: `予約データを読み込めませんでした: ${error.message}` };
    rows.push(...((data ?? []) as BookingRow[]));
    if (!data || data.length < pageSize) break;
  }
  return { rows };
}

export async function getMusuhiVisitStats(monthCount = 13, weekCount = 12): Promise<MusuhiVisitStatsResult> {
  const today = todayJstDateString();
  const thisMonthStart = `${today.slice(0, 7)}-01`;
  const dayOfMonth = Number(today.slice(8, 10));

  // 月別: 今月を含めて monthCount か月分。前年同月比のため、13か月より短くても前年同月は別途取る。
  const firstMonthStart = addMonthsToMonthStart(thisMonthStart, -(monthCount - 1));
  const lastYearMonthStart = addMonthsToMonthStart(thisMonthStart, -12);
  const fetchFrom = firstMonthStart < lastYearMonthStart ? firstMonthStart : lastYearMonthStart;
  const fetchTo = addMonthsToMonthStart(thisMonthStart, 1);

  const { rows, error } = await fetchBookings(fetchFrom, fetchTo);
  if (error) return { ok: false, error };

  const nowMs = Date.now();

  const months: PeriodStats[] = [];
  for (let i = 0; i < monthCount; i++) {
    const start = addMonthsToMonthStart(firstMonthStart, i);
    const end = start === thisMonthStart ? today : lastDayOfMonth(start);
    months.push(emptyStats(`${Number(start.slice(0, 4))}年${Number(start.slice(5, 7))}月`, start, end));
  }

  // 週別: 月曜始まり。最後が今週。
  const mondayOffset = (dayOfWeekForDate(today) + 6) % 7;
  const thisMonday = addDaysToDateString(today, -mondayOffset);
  const weeks: PeriodStats[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const start = addDaysToDateString(thisMonday, -7 * i);
    const end = i === 0 ? today : addDaysToDateString(start, 6);
    weeks.push(emptyStats(`${Number(start.slice(5, 7))}/${Number(start.slice(8, 10))}〜`, start, end));
  }

  const lastMonthStart = addMonthsToMonthStart(thisMonthStart, -1);
  const monthToDate = {
    current: emptyStats("今月(今日まで)", thisMonthStart, today),
    lastMonth: emptyStats("先月の同じ日まで", lastMonthStart, sameDayInMonth(lastMonthStart, dayOfMonth)),
    lastYear: emptyStats("去年の同じ月の同じ日まで", lastYearMonthStart, sameDayInMonth(lastYearMonthStart, dayOfMonth)),
  };

  const buckets = [...months, ...weeks, monthToDate.current, monthToDate.lastMonth, monthToDate.lastYear];
  for (const row of rows) {
    const date = jstDateStringFromIso(row.start_at);
    for (const b of buckets) {
      if (date >= b.start && date <= b.end) tally(b, row, nowMs);
    }
  }
  // 今月・今週は「今日まで」で切っているが、これからの予約数は今月末・今週末まで含めて見せたいので足しておく。
  for (const row of rows) {
    if (row.status !== "confirmed" || new Date(row.start_at).getTime() <= nowMs) continue;
    const date = jstDateStringFromIso(row.start_at);
    if (date <= today) continue;
    const thisMonth = months[months.length - 1];
    if (date <= lastDayOfMonth(thisMonthStart)) thisMonth.upcoming += 1;
    const thisWeek = weeks[weeks.length - 1];
    if (date <= addDaysToDateString(thisMonday, 6)) thisWeek.upcoming += 1;
  }

  return { ok: true, stats: { today, months, weeks, monthToDate } };
}
