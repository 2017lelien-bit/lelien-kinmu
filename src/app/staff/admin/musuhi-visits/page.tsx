import { notFound } from "next/navigation";
import { getStaffUser } from "@/lib/auth";
import { getMusuhiVisitStats, type PeriodStats } from "@/lib/musuhi-visit-stats";

// 予約サイトのデータを毎回読み直す(キャッシュしない)。
export const dynamic = "force-dynamic";

function changeLabel(current: number, base: number): { text: string; tone: "up" | "down" | "flat" } {
  if (base === 0) return { text: current === 0 ? "±0" : "比較なし", tone: "flat" };
  const diff = current - base;
  const pct = Math.round((diff / base) * 100);
  if (diff === 0) return { text: "±0 (同じ)", tone: "flat" };
  return { text: `${diff > 0 ? "+" : ""}${diff}人 (${pct > 0 ? "+" : ""}${pct}%)`, tone: diff > 0 ? "up" : "down" };
}

const TONE_CLASS = {
  up: "text-emerald-700 dark:text-emerald-400",
  down: "text-red-700 dark:text-red-400",
  flat: "text-neutral-500",
} as const;
const TONE_MARK = { up: "▲", down: "▼", flat: "" } as const;

function CompareTile({ title, current, base }: { title: string; current: PeriodStats; base: PeriodStats }) {
  const c = changeLabel(current.visitPeople, base.visitPeople);
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="text-xs text-neutral-500">{title}</div>
      <div className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        {base.start.slice(5).replace("-", "/")}〜{base.end.slice(5).replace("-", "/")}: {base.visitPeople}人
      </div>
      <div className={`mt-1 text-lg font-semibold ${TONE_CLASS[c.tone]}`}>
        {TONE_MARK[c.tone]} {c.text}
      </div>
    </div>
  );
}

function BarTable({ rows, caption, partialNote }: { rows: PeriodStats[]; caption: string; partialNote: string }) {
  const max = Math.max(1, ...rows.map((r) => r.visitPeople));
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{caption}</h2>
      <p className="text-xs text-neutral-500">{partialNote}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="py-1 pr-2 font-normal">期間</th>
              <th className="py-1 pr-2 font-normal">来店人数</th>
              <th className="py-1 pr-2 text-right font-normal">組数</th>
              <th className="py-1 pr-2 text-right font-normal">新規</th>
              <th className="py-1 pr-2 text-right font-normal">キャンセル</th>
              <th className="py-1 pr-2 text-right font-normal">無断</th>
              <th className="py-1 text-right font-normal">今後の予約</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isCurrent = i === rows.length - 1;
              return (
                <tr key={r.start} className="border-t border-neutral-100 dark:border-neutral-900">
                  <td className="whitespace-nowrap py-1.5 pr-2">
                    {r.label}
                    {isCurrent && <span className="ml-1 text-xs text-neutral-500">(途中)</span>}
                  </td>
                  <td className="w-1/2 py-1.5 pr-2">
                    <div
                      className="flex items-center gap-2"
                      title={`${r.label}: 来店${r.visitPeople}人(${r.visitGroups}組)`}
                    >
                      <div
                        className={`h-3 rounded-r ${isCurrent ? "bg-sky-300 dark:bg-sky-700" : "bg-sky-600 dark:bg-sky-400"}`}
                        style={{ width: `${(r.visitPeople / max) * 100}%`, minWidth: r.visitPeople > 0 ? 2 : 0 }}
                      />
                      <span className="tabular-nums">{r.visitPeople}</span>
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.visitGroups}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.newCustomers}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.cancelled}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.noShow}</td>
                  <td className="py-1.5 text-right tabular-nums text-neutral-500">{isCurrent ? r.upcoming : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function MusuhiVisitsPage() {
  const staff = await getStaffUser();
  if (!staff || staff.role !== "admin") notFound();

  const result = await getMusuhiVisitStats();

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-xl font-semibold">むすひ 来店人数</h1>
      <p className="text-sm text-neutral-500">
        むすひの予約サイトの予約データから集計しています(読み取りのみ・予約サイトには何も書き込みません)。
        「来店」は、来店済みにした予約と、予約時刻を過ぎてキャンセルされていない予約です。ペア蒸しは2名で数えます。
      </p>

      {!result.ok ? (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {result.error}
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <div>
              <div className="text-xs text-neutral-500">今月の来店人数({result.stats.monthToDate.current.end.slice(5).replace("-", "/")}まで)</div>
              <div className="text-4xl font-semibold tabular-nums">
                {result.stats.monthToDate.current.visitPeople}
                <span className="ml-1 text-base font-normal">人</span>
              </div>
              <div className="text-sm text-neutral-500">
                {result.stats.monthToDate.current.visitGroups}組・うち新規{result.stats.monthToDate.current.newCustomers}組
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <CompareTile title="先月の同じ時期と比べて" current={result.stats.monthToDate.current} base={result.stats.monthToDate.lastMonth} />
              <CompareTile title="去年の同じ時期と比べて" current={result.stats.monthToDate.current} base={result.stats.monthToDate.lastYear} />
            </div>
          </section>

          <BarTable rows={result.stats.months} caption="月ごとの来店人数" partialNote="今月は今日までの数字です(薄い色)。" />
          <BarTable rows={result.stats.weeks} caption="週ごとの来店人数(月曜はじまり)" partialNote="今週は今日までの数字です(薄い色)。" />
        </>
      )}
    </div>
  );
}
