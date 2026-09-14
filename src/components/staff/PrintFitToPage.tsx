"use client";

import { useEffect, useRef } from "react";

// A4横向き・余白10mmの印刷可能エリア(96dpi換算)。カレンダーの中身がこれより
// 縦に長くなっても2ページ目に分かれないよう、印刷直前だけ自動で縮小する。
const PAGE_WIDTH_PX = 1047;
const PAGE_HEIGHT_PX = 718;

export default function PrintFitToPage({ children }: { children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const applyScale = () => {
      const inner = innerRef.current;
      const wrapper = wrapperRef.current;
      if (!inner || !wrapper) return;
      const scale = Math.min(PAGE_WIDTH_PX / inner.scrollWidth, PAGE_HEIGHT_PX / inner.scrollHeight, 1);
      inner.style.transform = `scale(${scale})`;
      wrapper.style.height = `${inner.scrollHeight * scale}px`;
    };
    const reset = () => {
      const inner = innerRef.current;
      const wrapper = wrapperRef.current;
      if (inner) inner.style.transform = "";
      if (wrapper) wrapper.style.height = "";
    };
    window.addEventListener("beforeprint", applyScale);
    window.addEventListener("afterprint", reset);
    return () => {
      window.removeEventListener("beforeprint", applyScale);
      window.removeEventListener("afterprint", reset);
    };
  }, []);

  return (
    <div ref={wrapperRef}>
      <div ref={innerRef} className="origin-top-left">
        {children}
      </div>
    </div>
  );
}
