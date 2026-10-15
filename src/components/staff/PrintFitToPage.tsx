"use client";

import { useId, useLayoutEffect, useState } from "react";
import { fitSingleLine } from "@/lib/print-fit";

// カレンダーが縦に長くなっても2ページ目に分かれないよう、印刷用のCSSだけで自動的に縮小して
// A4・1ページに収める。紙の余白は globals.css の @page(schedule-calendar系)と同じ値にそろえる。
const PAGE_MARGIN_MM = 4;
const MM_TO_PX = 96 / 25.4;
const PAPER_MM = { landscape: { w: 297, h: 210 }, portrait: { w: 210, h: 297 } } as const;
// 紙の端ぎりぎりまで使うと、プリンターごとの誤差ではみ出すことがあるため、少しだけ余裕を持たせる。
const WIDTH_SAFETY = 0.995;
// ブラウザの「ヘッダーとフッター」を出す設定だと上下を消費することがあるため、高さは多めに余裕を持たせる。
const HEIGHT_SAFETY = 0.97;
// 縮小(zoom)しても罫線が細くなりすぎて消えないよう、紙の上で最低このくらいの太さ(px)になるよう補正する。
const LINE_VISUAL_PX = 1.2;

export default function PrintFitToPage({
  children,
  orientation = "landscape",
}: {
  children: React.ReactNode;
  orientation?: "landscape" | "portrait";
}) {
  const paper = PAPER_MM[orientation];
  // 余白を引いた、紙の印刷可能エリア(96dpi換算)
  const printableW = (paper.w - PAGE_MARGIN_MM * 2) * MM_TO_PX;
  const printableH = (paper.h - PAGE_MARGIN_MM * 2) * MM_TO_PX;
  const reactId = useId();
  const id = `print-fit-${reactId.replace(/[:]/g, "")}`;
  const [layout, setLayout] = useState<{ scale: number; pageWidth: number }>({
    scale: 1,
    // 縮小前に中身を並べる幅(これで1行に収める文字の大きさが決まる)
    pageWidth: printableW * WIDTH_SAFETY,
  });

  useLayoutEffect(() => {
    const recompute = () => {
      const inner = document.getElementById(`${id}-inner`);
      if (!inner) return;

      const pageWidth = printableW * WIDTH_SAFETY;
      const pageHeight = printableH * HEIGHT_SAFETY;

      // 印刷時の紙幅(pageWidth)に実際に収まる形で測るため、画面上の表示幅とは切り離した
      // 「オフスクリーンの複製」を一時的に作って測定する。
      // (今の画面の横幅のまま測ると、ウィンドウ幅によって結果が変わり、実際に紙へ印刷したときと
      // ズレて2ページ目に溢れることがあった。)
      const clone = inner.cloneNode(true) as HTMLElement;
      const measureBox = document.createElement("div");
      measureBox.style.position = "fixed";
      measureBox.style.top = "0";
      measureBox.style.left = "-99999px";
      measureBox.style.width = `${pageWidth}px`;
      measureBox.style.visibility = "hidden";
      measureBox.appendChild(clone);
      document.body.appendChild(measureBox);

      // 紙の幅でのマスの広さに合わせて、1行に収まる文字の大きさを決める(画面の幅で決めた大きさは使わない)。
      const fitSizes = fitSingleLine(clone, { apply: true });
      const measuredWidth = clone.scrollWidth || pageWidth;
      const measuredHeight = clone.scrollHeight;
      document.body.removeChild(measureBox);

      // 印刷用のCSS(下の<style>)が使う文字の大きさを、本物の要素に渡しておく。
      inner.querySelectorAll<HTMLElement>("[data-fit-text]").forEach((el, i) => {
        if (fitSizes[i] !== undefined) el.style.setProperty("--print-fs", `${fitSizes[i]}px`);
      });

      const scale = Math.min(pageWidth / measuredWidth, pageHeight / measuredHeight, 1);
      setLayout({ scale, pageWidth });
    };
    recompute();
    window.addEventListener("beforeprint", recompute);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("beforeprint", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [id, printableW, printableH]);

  return (
    <div id={`${id}-wrapper`}>
      <style>{`
        @media print {
          /* カレンダーを囲むページ全体の枠(余白)は、印刷では使わず0にして紙を最大限に使う。
             (囲んでいる全ての親要素が対象。screen用の余白は画面表示にだけ効く。) */
          *:has(#${id}-wrapper) {
            padding: 0 !important;
            margin: 0 !important;
          }
          /* transformは印刷時に反映されないブラウザがあるため、実際にレイアウトが
             縮む zoom を使う(wrapperの高さも自動でついてくるので別途調整不要)。
             zoomはflexのjustify-content:centerと組み合わせても中央に来ないことが
             あったため、縮んだ分の余白を左のpaddingとして直接計算して中央寄せする。 */
          #${id}-wrapper {
            padding-left: ${Math.max(0, (printableW - layout.pageWidth * layout.scale) / 2)}px;
          }
          #${id}-inner {
            width: ${layout.pageWidth}px;
            zoom: ${layout.scale};
            --print-line: ${LINE_VISUAL_PX / layout.scale}px;
          }
          /* 文字は折り返さず1行のまま、紙の幅に合わせて縮めた大きさで印刷する。 */
          #${id}-inner [data-fit-text] {
            font-size: var(--print-fs, 1em) !important;
            white-space: nowrap !important;
          }
          /* 罫線は、縮小しても紙の上で細すぎて消えない太さにそろえる。 */
          #${id}-inner .print-cal-grid {
            border-left-width: var(--print-line);
            border-top-width: var(--print-line);
          }
          #${id}-inner .print-cal-cell {
            border-right-width: var(--print-line);
            border-bottom-width: var(--print-line);
          }
        }
      `}</style>
      <div id={`${id}-inner`}>{children}</div>
    </div>
  );
}
