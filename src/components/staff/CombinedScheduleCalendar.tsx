import type { CSSProperties } from "react";
import FitText from "@/components/staff/FitText";
import { DAY_OF_WEEK_LABEL } from "@/lib/types";

// Le lienとむすひの両方に通っている方向けの月間カレンダー。
// 1日のマスに「むすひの営業時間」と「Le lienのレッスン」を並べて載せる。
// データの取得は呼び出し側(印刷ページ)で行い、ここは見た目だけを担当する。

// むすひの営業時間の帯の色(Le lienのレッスンの色=黄・ピンク等と見分けがつくように緑系にする)。
export const MUSUHI_BAND_STYLE: CSSProperties = { backgroundColor: "#c8f0e0", color: "#064e3b" };

export interface CombinedDay {
  date: string; // YYYY-MM-DD
  day: number;
  isRed: boolean; // 日曜・祝日(日付を赤字にする)
  lienClosed: boolean; // Le lienの休館日
  lienNote: { text: string; style: CSSProperties } | null; // Le lienのその日のメモ(休館日の理由など)
  lessons: { id: string; text: string; style: CSSProperties }[];
  // むすひの営業時間(例: "10:00～20:00")。nullは休業(営業時間が決まっていない日も含む)。
  musuhiHours: string | null;
}

export default function CombinedScheduleCalendar({ leadingBlanks, days }: { leadingBlanks: number; days: CombinedDay[] }) {
  const cells: (CombinedDay | null)[] = [...Array<null>(leadingBlanks).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  // 罫線は「マス同士の隙間(gap)に背景色を見せる」方式だと、縮小印刷で1px未満になり消えることがあるため、
  // 各マスに枠線(右・下)を持たせ、外枠は左・上で受ける方式にしている(印刷時の太さは PrintFitToPage が補正する)。
  return (
    <div className="print-cal-grid grid grid-cols-[repeat(7,minmax(0,1fr))] border-l border-t border-neutral-600 text-[10px]">
      {DAY_OF_WEEK_LABEL.map((label, i) => (
        <div
          key={label}
          className={`print-cal-cell border-b border-r border-neutral-600 bg-neutral-100 py-1 text-center text-xs font-semibold print:bg-white ${i === 0 ? "text-red-600" : ""}`}
        >
          {label}
        </div>
      ))}
      {cells.map((d, i) => {
        if (!d) {
          return <div key={`empty-${i}`} className="print-cal-cell print-cal-day min-h-28 border-b border-r border-neutral-600 bg-white" />;
        }
        const bothClosed = d.lienClosed && d.musuhiHours === null;
        return (
          <div
            key={d.date}
            className={`print-cal-cell print-cal-day flex min-h-28 flex-col gap-0.5 border-b border-r border-neutral-600 p-1 ${bothClosed ? "bg-neutral-100 print:bg-white" : "bg-white"}`}
          >
            <span className={`font-semibold ${d.isRed ? "text-red-600" : ""}`}>{d.day}</span>
            {d.musuhiHours !== null ? (
              <FitText className="rounded px-1 py-0.5 font-medium leading-tight" style={MUSUHI_BAND_STYLE}>
                むすひ {d.musuhiHours}
              </FitText>
            ) : (
              <p className="text-neutral-400">むすひ休業</p>
            )}
            {d.lienClosed ? (
              <p className="text-neutral-400" style={d.lienNote?.style}>
                {d.lienNote?.text || "Le lien休館日"}
              </p>
            ) : (
              <>
                {d.lienNote?.text && (
                  <p className="rounded px-1 italic text-neutral-500" style={d.lienNote.style}>
                    {d.lienNote.text}
                  </p>
                )}
                {d.lessons.map((l) => (
                  <FitText key={l.id} className="rounded px-1 py-0.5 leading-tight" style={l.style}>
                    {l.text}
                  </FitText>
                ))}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
