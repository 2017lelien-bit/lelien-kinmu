"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertLessonColor, type LessonColorStyle } from "@/lib/lesson-colors";

const STYLE_LABEL: Record<LessonColorStyle, string> = {
  band: "帯",
  text: "文字色",
  none: "色なし",
};

export default function LessonColorEditor({
  lessonName,
  style,
  color,
}: {
  lessonName: string;
  style: LessonColorStyle;
  color: string;
}) {
  const router = useRouter();
  const [localStyle, setLocalStyle] = useState(style);
  const [localColor, setLocalColor] = useState(color);
  const [saving, setSaving] = useState(false);

  async function save(nextStyle: LessonColorStyle, nextColor: string) {
    setSaving(true);
    await upsertLessonColor({ lessonName, style: nextStyle, color: nextColor });
    setSaving(false);
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-1 print:hidden">
      <select
        value={localStyle}
        onChange={(e) => {
          const next = e.target.value as LessonColorStyle;
          setLocalStyle(next);
          save(next, localColor);
        }}
        className="rounded border border-neutral-200 text-[10px] dark:border-neutral-800"
      >
        {(Object.keys(STYLE_LABEL) as LessonColorStyle[]).map((s) => (
          <option key={s} value={s}>
            {STYLE_LABEL[s]}
          </option>
        ))}
      </select>
      {localStyle !== "none" && (
        <input
          type="color"
          value={localColor}
          onChange={(e) => {
            setLocalColor(e.target.value);
            save(localStyle, e.target.value);
          }}
          className="h-5 w-6 rounded border border-neutral-200 dark:border-neutral-800"
        />
      )}
      {saving && <span className="text-neutral-400">保存中...</span>}
    </span>
  );
}
