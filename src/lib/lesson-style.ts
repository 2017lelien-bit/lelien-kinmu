import type { LessonColor } from "@/lib/lesson-colors";
import { lessonColorKey } from "@/lib/lesson-color-key";
import { readableTextColor } from "@/lib/color";

// レッスン名ごとの色は、管理画面(印刷ページの凡例)から自由に設定できる。まだ設定されていない
// 名前は、目立つように黄色の帯を既定色として使う。
export const DEFAULT_COLOR = "#FFFF00";

export function lessonStyle(
  name: string,
  colorMap: Map<string, LessonColor>,
): { backgroundColor?: string; color?: string } {
  const config = colorMap.get(lessonColorKey(name));
  if (config?.style === "none") return {};
  if (config?.style === "text") return { color: config.color };
  const bg = config?.color ?? DEFAULT_COLOR;
  return { backgroundColor: bg, color: readableTextColor(bg) };
}
