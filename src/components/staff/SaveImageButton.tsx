"use client";

import { useState } from "react";

// 印刷用ではなく、そのまま画像(PNG)として保存したい場合のボタン。
// 印刷時に隠す要素(print:hidden、色編集の操作部分など)は画像にも含めない。
// (A4用紙にぴったり合わせる調整は、実際に紙へ印刷する「印刷する」ボタン側で行う。
// 画像はカレンダー本来の縦横比のまま保存したほうが、余白ができず見やすい。)
// variant="instagram": Instagram投稿に使える縦長(4:5・1080×1350px)の画像にする。保存する画像の中だけ
// 幅・高さ・文字の大きさを調整し、画面上の表示には影響しない。
export default function SaveImageButton({
  targetId,
  filename,
  variant = "default",
  label,
}: {
  targetId: string;
  filename: string;
  variant?: "default" | "instagram";
  label?: string;
}) {
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
      const isInstagram = variant === "instagram";
      const canvas = await html2canvas(target, {
        backgroundColor: "#ffffff",
        scale: isInstagram ? 1 : 2,
        ...(isInstagram ? { windowWidth: 1200, width: 1080, height: 1350 } : {}),
        ignoreElements: (el) => el.classList.contains("print:hidden"),
        onclone: (doc, el) => {
          if (!isInstagram) return;
          const style = doc.createElement("style");
          style.textContent = `
            #${targetId} { width: 1080px !important; max-width: none !important; margin: 0 !important; height: 1350px !important; box-sizing: border-box; padding: 36px 32px !important; display: flex; flex-direction: column; gap: 20px !important; background: #fff; }
            #${targetId} h2 { font-size: 40px !important; line-height: 1.2; }
            #${targetId} [data-calendar-grid] { flex: 1; grid-template-rows: auto; grid-auto-rows: 1fr; font-size: 19px !important; }
            #${targetId} [data-calendar-grid] * { font-size: 19px !important; line-height: 1.25 !important; }
            #${targetId} [data-calendar-grid] > div { min-height: 0 !important; padding: 8px 6px !important; }
          `;
          el.ownerDocument.head.appendChild(style);
        },
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
        {saving ? "保存中..." : (label ?? "画像として保存")}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
