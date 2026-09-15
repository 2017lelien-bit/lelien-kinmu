"use client";

import { useId, useLayoutEffect, useState } from "react";

// A4横向き・余白5mmの印刷可能エリア(96dpi換算)。カレンダーの中身がこれより
// 縦に長くなっても2ページ目に分かれないよう、印刷用のCSSだけで自動的に縮小する。
//
// window.print()時のbeforeprintイベントでstyleを直接書き換える方式だと、ブラウザが
// 既に印刷レイアウトの計算を始めた後になり、間に合わず反映されないことがあった。
// そのため、表示された時点で計算した倍率を<style>タグ(@media print)としてあらかじめ
// 用意しておき、印刷時には常にそのCSSが効くようにする。
const PAGE_WIDTH_PX = 1084;
const PAGE_HEIGHT_PX = 756;

export default function PrintFitToPage({ children }: { children: React.ReactNode }) {
  const reactId = useId();
  const id = `print-fit-${reactId.replace(/[:]/g, "")}`;
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const recompute = () => {
      const inner = document.getElementById(`${id}-inner`);
      if (!inner) return;
      const nextScale = Math.min(PAGE_WIDTH_PX / inner.scrollWidth, PAGE_HEIGHT_PX / inner.scrollHeight, 1);
      setScale(nextScale);
      setScaledHeight(inner.scrollHeight * nextScale);
    };
    recompute();
    window.addEventListener("beforeprint", recompute);
    return () => window.removeEventListener("beforeprint", recompute);
  }, [id]);

  return (
    <div id={`${id}-wrapper`}>
      <style>{`
        @media print {
          #${id}-wrapper { height: ${scaledHeight ?? "auto"}px; }
          #${id}-inner { transform: scale(${scale}); transform-origin: top left; }
        }
      `}</style>
      <div id={`${id}-inner`}>{children}</div>
    </div>
  );
}
