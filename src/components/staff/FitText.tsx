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
    const parent = el.parentElement;
    // セルの余白(padding)を除いた、実際に文字を置ける幅で判定する。
    const parentStyle = parent ? getComputedStyle(parent) : null;
    const parentWidth = parent
      ? parent.clientWidth - parseFloat(parentStyle?.paddingLeft ?? "0") - parseFloat(parentStyle?.paddingRight ?? "0")
      : 0;
    const naturalWidth = el.scrollWidth;
    if (parentWidth > 0 && naturalWidth > parentWidth) {
      const baseFontSize = parseFloat(getComputedStyle(el).fontSize);
      setFontSize(baseFontSize * (parentWidth / naturalWidth) * 0.97);
    } else {
      setFontSize(null);
    }
  }, [children]);

  return (
    // data-fit-text: 印刷(PrintFitToPage)・画像保存(SaveImageButton)が、紙や画像の幅に合わせて
    // 文字の大きさを計算し直す目印。印刷でも折り返さず、1行のまま文字を縮めて収める。
    <p ref={ref} data-fit-text className={className} style={{ ...style, whiteSpace: "nowrap", fontSize: fontSize ?? undefined }}>
      {children}
    </p>
  );
}
