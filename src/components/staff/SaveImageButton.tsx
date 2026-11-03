"use client";

import { useState } from "react";
import { fitSingleLine } from "@/lib/print-fit";

// 印刷用ではなく、そのまま画像(PNG)として保存したい場合のボタン。
// 印刷時に隠す要素(print:hidden、色編集の操作部分など)は画像にも含めない。
// (A4用紙にぴったり合わせる調整は、実際に紙へ印刷する「印刷する」ボタン側で行う。
// 画像はカレンダー本来の縦横比のまま保存したほうが、余白ができず見やすい。)
// variant="a4": 画像をA4用紙にそのまま印刷してもはみ出さないよう、カレンダーの縦横比を保ったまま
// A4(300dpi・横長なら3508×2480px、縦長なら2480×3508px)の白い台紙の中央に収めて保存する。
// variant="instagram": Instagram投稿に使える縦長(4:5・1080×1350px)の画像にする。保存する画像の中だけ
// 幅・高さ・文字の大きさを調整し、画面上の表示には影響しない。
// layoutWidth(px)を指定すると、保存する画像の中だけ、その幅でカレンダーを並べ直し、1行に収める文字を
// その幅に合わせて縮め直す(紙に印刷したときと同じ見た目・収まり方になる)。画面上の表示には影響しない。
export default function SaveImageButton({
  targetId,
  filename,
  variant = "default",
  label,
  layoutWidth,
}: {
  targetId: string;
  filename: string;
  variant?: "default" | "instagram" | "a4";
  label?: string;
  layoutWidth?: number;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // スマホでは、画像のリンクを自動で押すだけのダウンロードが動かないブラウザ(iPhoneのSafariなど)が多いため、
  // 保存する画像をそのまま画面に出して、「共有・保存」ボタンか長押しで保存してもらう。
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);

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
        ...(layoutWidth ? { windowWidth: layoutWidth + 64 } : {}),
        ignoreElements: (el) => el.classList.contains("print:hidden"),
        onclone: (doc, el) => {
          if (layoutWidth) {
            el.style.width = `${layoutWidth}px`;
            el.style.maxWidth = "none";
            fitSingleLine(el, { apply: true });
          }
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
      let outCanvas = canvas;
      if (variant === "a4") {
        const landscape = canvas.width >= canvas.height;
        const pageW = landscape ? 3508 : 2480;
        const pageH = landscape ? 2480 : 3508;
        const margin = 80;
        const fit = Math.min((pageW - margin * 2) / canvas.width, (pageH - margin * 2) / canvas.height);
        const drawW = Math.round(canvas.width * fit);
        const drawH = Math.round(canvas.height * fit);
        outCanvas = document.createElement("canvas");
        outCanvas.width = pageW;
        outCanvas.height = pageH;
        const ctx = outCanvas.getContext("2d");
        if (!ctx) throw new Error("canvas unavailable");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageW, pageH);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(canvas, Math.round((pageW - drawW) / 2), Math.round((pageH - drawH) / 2), drawW, drawH);
      }
      const blob = await new Promise<Blob | null>((resolve) => outCanvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("toBlob failed");
      const file = new File([blob], filename, { type: "image/png" });
      const url = URL.createObjectURL(blob);
      const isMobile =
        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform));
      if (isMobile) {
        setPreview({ url, file });
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (e) {
      console.error("[SaveImageButton] failed", e);
      setError("画像の保存に失敗しました。");
    }
    setSaving(false);
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  async function sharePreview() {
    if (!preview) return;
    try {
      if (navigator.canShare?.({ files: [preview.file] })) {
        await navigator.share({ files: [preview.file] });
        return;
      }
    } catch (e) {
      // 共有をやめた場合(AbortError)は何もしない。それ以外は、下の長押し保存を案内する。
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    setError("共有を開けませんでした。画像を長押しして保存してください。");
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
      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col items-center gap-3 overflow-auto bg-neutral-900 p-4">
          <p className="text-center text-sm text-white">
            「共有・保存」を押して「画像を保存」を選ぶか、画像を長押しして保存してください。
          </p>
          <div className="flex gap-2">
            <button onClick={sharePreview} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">
              共有・保存
            </button>
            <button onClick={closePreview} className="rounded-lg border border-white px-4 py-2 text-sm text-white">
              閉じる
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.url} alt="保存する画像" className="max-w-full bg-white" />
        </div>
      )}
    </span>
  );
}
