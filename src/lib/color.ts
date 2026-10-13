// 背景色の明るさから、読みやすい文字色(白 or 黒)を自動で選ぶ。
export function readableTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000000" : "#ffffff";
}

// 日付メモの表示スタイル。帯色があれば背景に敷き、文字色が未指定なら読みやすい色を自動で選ぶ。
export function noteStyle(note: { color: string | null; bg_color: string | null } | undefined): {
  color?: string;
  backgroundColor?: string;
} {
  if (!note) return {};
  const style: { color?: string; backgroundColor?: string } = {};
  if (note.bg_color) {
    style.backgroundColor = note.bg_color;
    style.color = note.color ?? readableTextColor(note.bg_color);
  } else if (note.color) {
    style.color = note.color;
  }
  return style;
}
