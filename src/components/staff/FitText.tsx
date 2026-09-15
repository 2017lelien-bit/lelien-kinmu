"use client";

import { useLayoutEffect, useRef, useState } from "react";

// 1行に収めたいテキストが、入っているセルの幅より長い場合だけ、
// 収まる大きさまで自動でフォントサイズを縮める(収まるものはそのまま)。
export default function FitText({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.fontSize = "";
    const parentWidth = el.parentElement?.clientWidth ?? 0;
    const naturalWidth = el.scrollWidth;
    if (parentWidth > 0 && naturalWidth > parentWidth) {
      const baseFontSize = parseFloat(getComputedStyle(el).fontSize);
      setFontSize(baseFontSize * (parentWidth / naturalWidth) * 0.97);
    } else {
      setFontSize(null);
    }
  }, [children]);

  return (
    <p ref={ref} className={className} style={{ ...style, whiteSpace: "nowrap", fontSize: fontSize ?? undefined }}>
      {children}
    </p>
  );
}
