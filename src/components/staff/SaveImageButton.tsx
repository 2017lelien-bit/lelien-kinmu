"use client";

import { useState } from "react";

// A4横向き用紙にぴったり合うよう、保存する画像は常にこのピクセルサイズ(縦横比297:210)に統一する。
// 内容がこれより大きくても小さくても、中に収まるよう自動で拡大縮小して中央に配置する。
const A4_LANDSCAPE_WIDTH = 2245;
const A4_LANDSCAPE_HEIGHT = 1587;

// 印刷用ではなく、そのまま画像(PNG)として保存したい場合のボタン。
// 印刷時に隠す要素(print:hidden、色編集の操作部分など)は画像にも含めない。
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
      const captured = await html2canvas(target, {
        backgroundColor: "#ffffff",
        scale: 2,
        ignoreElements: (el) => el.classList.contains("print:hidden"),
      });

      const page = document.createElement("canvas");
      page.width = A4_LANDSCAPE_WIDTH;
      page.height = A4_LANDSCAPE_HEIGHT;
      const ctx = page.getContext("2d");
      if (!ctx) throw new Error("キャンバスの作成に失敗しました。");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, page.width, page.height);
      const fitScale = Math.min(A4_LANDSCAPE_WIDTH / captured.width, A4_LANDSCAPE_HEIGHT / captured.height);
      const drawWidth = captured.width * fitScale;
      const drawHeight = captured.height * fitScale;
      ctx.drawImage(
        captured,
        (A4_LANDSCAPE_WIDTH - drawWidth) / 2,
        (A4_LANDSCAPE_HEIGHT - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );

      const dataUrl = page.toDataURL("image/png");
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
