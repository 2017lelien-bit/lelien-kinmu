"use client";

import { useId, useLayoutEffect, useState } from "react";

// A4横向き・余白6mmの印刷可能エリア(96dpi換算)。カレンダーの中身がこれより
// 縦に長くなっても2ページ目に分かれないよう、印刷用のCSSだけで自動的に縮小する。
//
// ブラウザの「ヘッダーとフッター」表示は@pageの余白とは別に上下を消費することがあるため、
// 少し余裕を持たせた数値を目標にする。
const SAFETY_FACTOR = 0.92;
// 用紙の印刷可能な幅(中央寄せの基準)。縮小後の幅は、この幅の中で左右対称になるよう配置する。
// A4横=1077×748px、A4縦=748×1077px(どちらも余白6mm)。
const PAGE_SIZE = { landscape: { w: 1077, h: 748 }, portrait: { w: 748, h: 1077 } } as const;

export default function PrintFitToPage({
  children,
  orientation = "landscape",
}: {
  children: React.ReactNode;
  orientation?: "landscape" | "portrait";
}) {
  const REAL_PAGE_WIDTH_PX = PAGE_SIZE[orientation].w;
  const REAL_PAGE_HEIGHT_PX = PAGE_SIZE[orientation].h;
  const reactId = useId();
  const id = `print-fit-${reactId.replace(/[:]/g, "")}`;
  const [layout, setLayout] = useState<{ scale: number; pageWidth: number; contentWidth: number }>({
    scale: 1,
    // 縮小前に中身を並べる幅(これで折り返しが決まる)
    pageWidth: REAL_PAGE_WIDTH_PX * SAFETY_FACTOR,
    // 紙の印刷可能な幅から、周りの枠の左右の余白を引いた「実際にカレンダーを置ける幅」
    contentWidth: REAL_PAGE_WIDTH_PX,
  });

  useLayoutEffect(() => {
    const recompute = () => {
      const inner = document.getElementById(`${id}-inner`);
      if (!inner) return;

      // カレンダーを囲む親要素(ページ全体の枠など)の上下左右の余白・枠線は、印刷でも紙の面積を使う。
      // これを見込まずに紙いっぱいを目標にすると、数十px足りずに最後の行が2ページ目にはみ出す。
      // (display:noneになる印刷時の非表示要素は含めず、親要素自身の余白だけを足し合わせる。)
      let chromeX = 0;
      let chromeY = 0;
      for (let el = inner.parentElement; el && el !== document.documentElement; el = el.parentElement) {
        const cs = getComputedStyle(el);
        chromeX += [cs.paddingLeft, cs.paddingRight, cs.marginLeft, cs.marginRight, cs.borderLeftWidth, cs.borderRightWidth]
          .reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
        chromeY += [cs.paddingTop, cs.paddingBottom, cs.marginTop, cs.marginBottom, cs.borderTopWidth, cs.borderBottomWidth]
          .reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
      }
      const contentWidth = REAL_PAGE_WIDTH_PX - chromeX;
      const pageWidth = Math.min(REAL_PAGE_WIDTH_PX, contentWidth) * SAFETY_FACTOR;
      const pageHeight = (REAL_PAGE_HEIGHT_PX - chromeY) * SAFETY_FACTOR;

      // 印刷時の紙幅(pageWidth)に実際に収まる形で高さを測るため、画面上の
      // 表示幅とは切り離した「オフスクリーンの複製」を一時的に作って測定する。
      // (今の画面の横幅のまま測ると、ウィンドウ幅によって結果が変わってしまい、
      // 実際に紙へ印刷したときとズレて2ページ目に溢れることがあった。)
      const clone = inner.cloneNode(true) as HTMLElement;
      // 画面上は1行(nowrap)でも、印刷時は「print:whitespace-normal」で折り返されて縦に伸びる。
      // 複製にはprint:の指定が効かないため、印刷時と同じ折り返しにそろえてから高さを測らないと、
      // 実際より低く見積もって最後の行が2ページ目にはみ出してしまう。
      clone.querySelectorAll<HTMLElement>('[class*="print:whitespace-normal"]').forEach((el) => {
        el.style.whiteSpace = "normal";
      });
      const measureBox = document.createElement("div");
      measureBox.style.position = "fixed";
      measureBox.style.top = "0";
      measureBox.style.left = "-99999px";
      measureBox.style.width = `${pageWidth}px`;
      measureBox.style.visibility = "hidden";
      measureBox.appendChild(clone);
      document.body.appendChild(measureBox);

      const measuredWidth = clone.scrollWidth || pageWidth;
      const measuredHeight = clone.scrollHeight;
      document.body.removeChild(measureBox);

      const scale = Math.min(pageWidth / measuredWidth, pageHeight / measuredHeight, 1);
      setLayout({ scale, pageWidth, contentWidth });
    };
    recompute();
    window.addEventListener("beforeprint", recompute);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("beforeprint", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [id, REAL_PAGE_WIDTH_PX, REAL_PAGE_HEIGHT_PX]);

  return (
    <div id={`${id}-wrapper`}>
      <style>{`
        @media print {
          /* transformは印刷時に反映されないブラウザがあるため、実際にレイアウトが
             縮む zoom を使う(wrapperの高さも自動でついてくるので別途調整不要)。
             zoomはflexのjustify-content:centerと組み合わせても中央に来ないことが
             あったため、縮んだ分の余白を左マージンとして直接計算して中央寄せする。 */
          /* marginをzoom対象の要素自身につけるとブラウザによって解釈がぶれるため、
             ズームしないwrapper側にpaddingとして持たせる。 */
          #${id}-wrapper {
            padding-left: ${Math.max(0, (layout.contentWidth - layout.pageWidth * layout.scale) / 2)}px;
          }
          #${id}-inner {
            width: ${layout.pageWidth}px;
            zoom: ${layout.scale};
          }
        }
      `}</style>
      <div id={`${id}-inner`}>{children}</div>
    </div>
  );
}
