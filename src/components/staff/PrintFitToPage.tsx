"use client";

import { useId, useLayoutEffect, useState } from "react";

// A4横向き・余白8mmの印刷可能エリア(96dpi換算)。カレンダーの中身がこれより
// 縦に長くなっても2ページ目に分かれないよう、印刷用のCSSだけで自動的に縮小する。
//
// ブラウザの「ヘッダーとフッター」表示は@pageの余白とは別に上下を消費することがあるため、
// 少し余裕を持たせた数値を目標にする。
const SAFETY_FACTOR = 0.92;
const PAGE_WIDTH_PX = 1062 * SAFETY_FACTOR;
const PAGE_HEIGHT_PX = 733 * SAFETY_FACTOR;

export default function PrintFitToPage({ children }: { children: React.ReactNode }) {
  const reactId = useId();
  const id = `print-fit-${reactId.replace(/[:]/g, "")}`;
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const recompute = () => {
      const inner = document.getElementById(`${id}-inner`);
      if (!inner) return;

      // 印刷時の紙幅(PAGE_WIDTH_PX)に実際に収まる形で高さを測るため、画面上の
      // 表示幅とは切り離した「オフスクリーンの複製」を一時的に作って測定する。
      // (今の画面の横幅のまま測ると、ウィンドウ幅によって結果が変わってしまい、
      // 実際に紙へ印刷したときとズレて2ページ目に溢れることがあった。)
      const clone = inner.cloneNode(true) as HTMLElement;
      const measureBox = document.createElement("div");
      measureBox.style.position = "fixed";
      measureBox.style.top = "0";
      measureBox.style.left = "-99999px";
      measureBox.style.width = `${PAGE_WIDTH_PX}px`;
      measureBox.style.visibility = "hidden";
      measureBox.appendChild(clone);
      document.body.appendChild(measureBox);

      const measuredWidth = clone.scrollWidth || PAGE_WIDTH_PX;
      const measuredHeight = clone.scrollHeight;
      document.body.removeChild(measureBox);

      const nextScale = Math.min(PAGE_WIDTH_PX / measuredWidth, PAGE_HEIGHT_PX / measuredHeight, 1);
      setScale(nextScale);
      setScaledHeight(measuredHeight * nextScale);
    };
    recompute();
    window.addEventListener("beforeprint", recompute);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("beforeprint", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [id]);

  return (
    <div id={`${id}-wrapper`}>
      <style>{`
        @media print {
          #${id}-wrapper { height: ${scaledHeight ?? "auto"}px; }
          #${id}-inner {
            width: ${PAGE_WIDTH_PX}px;
            transform: scale(${scale});
            transform-origin: top left;
          }
        }
      `}</style>
      <div id={`${id}-inner`}>{children}</div>
    </div>
  );
}
