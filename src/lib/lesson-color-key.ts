import type { LessonColor } from "@/lib/lesson-colors";

// レッスン名の表記ゆれ(全角/半角、大文字/小文字、スペース、括弧の全角/半角)を同じ名前として
// 扱うための比較用キー。例:「crystalbowl（有料）」と「Crystal bowl(有料)」は同じ色にする。
export function lessonColorKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

// 色の設定をレッスン名の表記ゆれをまとめた形で引けるようにする。
// 同じ名前とみなせる行が複数あるときは、半角に揃った(正規化済みの)名前の行を優先する。
export function buildLessonColorMap(rows: LessonColor[]): Map<string, LessonColor> {
  const map = new Map<string, LessonColor>();
  for (const row of rows) {
    const key = lessonColorKey(row.lesson_name);
    if (!map.has(key) || row.lesson_name === row.lesson_name.normalize("NFKC").trim()) map.set(key, row);
  }
  return map;
}
