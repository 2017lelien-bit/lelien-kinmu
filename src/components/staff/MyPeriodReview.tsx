import type { PeriodReview } from "@/lib/period-review";

function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}時間${m > 0 ? `${m}分` : ""}`;
}

function formatDate(date: string): string {
  const [, m, d] = date.split("-");
  const dow = ["日", "月", "火", "水", "木", "金", "土"][new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${Number(m)}/${Number(d)}(${dow})`;
}

function hhmm(t: string): string {
  return t.slice(0, 5);
}

// 今期の自分の入力(レッスン・出退勤)を、間違いがないか見直すための一覧。金額は表示しない。
export default function MyPeriodReview({
  review,
  periodLabel,
  headcountMatters,
}: {
  review: PeriodReview;
  periodLabel: string;
  headcountMatters: boolean;
}) {
  const { lessons, categories } = review;
  if (lessons.length === 0 && categories.length === 0) return null;

  const lessonCountByName = new Map<string, number>();
  for (const l of lessons) lessonCountByName.set(l.lessonName, (lessonCountByName.get(l.lessonName) ?? 0) + 1);

  return (
    <details open className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <summary className="cursor-pointer text-lg font-semibold">今期の入力の確認({periodLabel})</summary>
      <div className="mt-3 flex flex-col gap-5">
        <p className="text-xs text-neutral-500">
          これまでに入力した内容の一覧です。間違いがないか確認してください(金額は表示されません)。直したい場合は、上の入力欄から直してください。提出済みの日や承認済みの分は、「訂正を依頼する」から管理者に連絡してください。
        </p>

        {lessons.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              レッスン 合計{lessons.length}本
              <span className="ml-2 font-normal text-neutral-500">
                ({Array.from(lessonCountByName.entries())
                  .map(([name, count]) => `${name}${count}本`)
                  .join("、")})
              </span>
            </h3>
            <ul className="flex flex-col gap-1 text-sm">
              {lessons.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 border-b border-neutral-100 pb-1 dark:border-neutral-900">
                  <span className="w-20 shrink-0">{formatDate(l.date)}</span>
                  <span className="w-12 shrink-0 text-neutral-500">{l.startTime ? hhmm(l.startTime) : ""}</span>
                  <span>{l.lessonName}</span>
                  <span className="text-neutral-500">{l.durationMinutes}分</span>
                  {headcountMatters && <span className="text-neutral-500">{l.headcount}人</span>}
                  <span className={l.approved ? "text-neutral-400" : "text-amber-700 dark:text-amber-400"}>
                    {l.approved ? "承認済み" : "確認待ち"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {categories.map((c) => (
          <section key={c.categoryId} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              {c.categoryName}(出退勤) 合計 {formatHM(c.countedMinutes)}
            </h3>
            <ul className="flex flex-col gap-1 text-sm">
              {c.shifts.map((s, i) => {
                const isLastOfDate = c.shifts[i + 1]?.date !== s.date;
                const deduction = c.deductionByDate[s.date] ?? 0;
                return (
                  <li key={s.id} className="flex flex-col gap-0.5 border-b border-neutral-100 pb-1 dark:border-neutral-900">
                    <div className="flex flex-wrap items-center gap-x-3">
                      <span className="w-20 shrink-0">{formatDate(s.date)}</span>
                      <span>
                        {hhmm(s.startTime)}〜{hhmm(s.endTime)}
                      </span>
                      {s.breakStart && s.breakEnd && (
                        <span className="text-neutral-500">
                          休憩 {hhmm(s.breakStart)}〜{hhmm(s.breakEnd)}
                        </span>
                      )}
                      <span className="text-neutral-500">実働{formatHM(s.workedMinutes)}</span>
                    </div>
                    {isLastOfDate && deduction > 0 && (
                      <p className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                        この日はレッスンと時間が重なっているため、-{formatHM(deduction)}されます
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            {c.deductionMinutes > 0 && (
              <p className="text-xs text-neutral-500">
                実働{formatHM(c.workedMinutes)} - レッスンと重なった分{formatHM(c.deductionMinutes)} = {formatHM(c.countedMinutes)}
              </p>
            )}
          </section>
        ))}
      </div>
    </details>
  );
}
