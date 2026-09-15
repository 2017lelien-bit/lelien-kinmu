"use client";

import { useState } from "react";

// 印刷用ではなく、そのまま画像(PNG)として保存したい場合のボタン。
// 印刷時に隠す要素(print:hidden、色編集の操作部分など)は画像にも含めない。
// (A4用紙にぴったり合わせる調整は、実際に紙へ印刷する「印刷する」ボタン側で行う。
// 画像はカレンダー本来の縦横比のまま保存したほうが、余白ができず見やすい。)
export default function SaveImageButton({ targetId, filename }: { targetId: string; filename: string }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const target = document.getElementById(targetId);
      if (!target) throw new Error("対象が見つかりません。");
      // Tailwind(oklch等)の色をそのまま解釈できるフォーク版を使う(本家html2canvasは対応していない)。
      const { default: html2canvas } = await import("html2canvas-pro");
      const canvas = await html2canvas(target, {
        backgroundColor: "#ffffff",
        scale: 2,
        ignoreElements: (el) => el.classList.contains("print:hidden"),
      });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      link.click();
    } catch (e) {
      console.error("[SaveImageButton] failed", e);
      setError("画像の保存に失敗しました。");
    }
    setSaving(false);
  }

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-700"
      >
        {saving ? "保存中..." : "画像として保存"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
