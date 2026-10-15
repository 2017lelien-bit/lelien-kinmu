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
  const PAGE_WIDTH_PX = REAL_PAGE_WIDTH_PX * SAFETY_FACTOR;
  const PAGE_HEIGHT_PX = PAGE_SIZE[orientation].h * SAFETY_FACTOR;
  const reactId = useId();
  const id = `print-fit-${reactId.replace(/[:]/g, "")}`;
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const recompute = () => {
      const inner = document.getElementById(`${id}-inner`);
      if (!inner) return;

      // 印刷時の紙幅(PAGE_WIDTH_PX)に実際に収まる形で高さを測るため、画面上の
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
      measureBox.style.width = `${PAGE_WIDTH_PX}px`;
      measureBox.style.visibility = "hidden";
      measureBox.appendChild(clone);
      document.body.appendChild(measureBox);

      const measuredWidth = clone.scrollWidth || PAGE_WIDTH_PX;
      const measuredHeight = clone.scrollHeight;
      document.body.removeChild(measureBox);

      const nextScale = Math.min(PAGE_WIDTH_PX / measuredWidth, PAGE_HEIGHT_PX / measuredHeight, 1);
      setScale(nextScale);
    };
    recompute();
    window.addEventListener("beforeprint", recompute);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("beforeprint", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [id, PAGE_WIDTH_PX, PAGE_HEIGHT_PX]);

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
            padding-left: ${Math.max(0, (REAL_PAGE_WIDTH_PX - PAGE_WIDTH_PX * scale) / 2)}px;
          }
          #${id}-inner {
            width: ${PAGE_WIDTH_PX}px;
            zoom: ${scale};
          }
        }
      `}</style>
      <div id={`${id}-inner`}>{children}</div>
    </div>
  );
}
