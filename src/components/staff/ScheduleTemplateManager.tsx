"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addScheduleTemplate, deleteScheduleTemplate } from "@/lib/schedule-submissions";
import { DAY_OF_WEEK_LABEL } from "@/lib/types";
import type { LessonOption, ScheduleTemplate } from "@/lib/types";

export default function ScheduleTemplateManager({
  templates,
  lessonOptions,
  staffId,
}: {
  templates: ScheduleTemplate[];
  lessonOptions: LessonOption[];
  staffId?: string;
}) {
  const router = useRouter();
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [kind, setKind] = useState<"reception" | "lesson">("reception");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [lessonName, setLessonName] = useState(lessonOptions[0]?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd() {
    setAdding(true);
    setError(null);
    const result = await addScheduleTemplate(
      {
        dayOfWeek,
        kind,
        startTime,
        endTime: kind === "reception" ? endTime : undefined,
        lessonName: kind === "lesson" ? lessonName : undefined,
      },
      staffId,
    );
    setAdding(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const result = await deleteScheduleTemplate(id, staffId);
    setDeletingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-sm font-semibold">毎週固定のスケジュール登録</h3>
      <p className="text-xs text-neutral-400">
        毎週決まっている受付・レッスンをここに登録しておくと、下の「今月に反映する」で自動的に入力できます。
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {templates.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 pb-2 dark:border-neutral-900">
              <span>毎週{DAY_OF_WEEK_LABEL[t.day_of_week]}曜日</span>
              <span>
                {t.start_time.slice(0, 5)}
                {t.end_time ? `〜${t.end_time.slice(0, 5)}` : ""}
              </span>
              <span>{t.kind === "reception" ? "受付" : t.lesson_name}</span>
              <button
                onClick={() => handleDelete(t.id)}
                disabled={deletingId === t.id}
                className="ml-auto text-xs text-red-600 underline disabled:opacity-40"
              >
                {deletingId === t.id ? "削除中..." : "削除"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          曜日
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          >
            {DAY_OF_WEEK_LABEL.map((label, i) => (
              <option key={label} value={i}>
                毎週{label}曜日
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          種別
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "reception" | "lesson")}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          >
            <option value="reception">受付</option>
            <option value="lesson">レッスン</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          開始時刻
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
          />
        </label>
        {kind === "reception" ? (
          <label className="flex flex-col gap-1 text-sm">
            終了時刻
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
            />
          </label>
        ) : lessonOptions.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            レッスン名
            <select
              value={lessonName}
              onChange={(e) => setLessonName(e.target.value)}
              className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
            >
              {lessonOptions.map((o) => (
                <option key={o.id} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            レッスン名
            <input
              value={lessonName}
              onChange={(e) => setLessonName(e.target.value)}
              placeholder="例: 筋膜リリース75"
              className="w-40 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
            />
          </label>
        )}
        <button
          onClick={handleAdd}
          disabled={adding}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
        >
          {adding ? "追加中..." : "追加する"}
        </button>
      </div>
    </div>
  );
}
