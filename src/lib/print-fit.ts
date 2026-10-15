// 「1行に収めたい文字」(data-fit-text)を、その文字が入っているマスの幅に収まる大きさまで縮める。
// 収まるものは元の大きさのまま。印刷(PrintFitToPage)と画像保存(SaveImageButton)で同じ計算を使い、
// 画面・紙・画像のどれでも同じ見た目(1行・同じ縮め方)になるようにする。
//
// 返り値は、root内の[data-fit-text]を文書順に並べたときの、それぞれの文字サイズ(px)。
// apply=trueなら、その要素に直接font-sizeも設定する(複製の要素や画像用の複製に使う)。
export function fitSingleLine(root: HTMLElement, options: { apply?: boolean } = {}): number[] {
  const els = Array.from(root.querySelectorAll<HTMLElement>("[data-fit-text]"));

  // 先に全部を「元の大きさ・1行」に戻してから測る(縮めながら測ると、途中で結果がぶれる)。
  for (const el of els) {
    el.style.fontSize = "";
    el.style.whiteSpace = "nowrap";
  }

  const sizes = els.map((el) => {
    const base = parseFloat(getComputedStyle(el).fontSize);
    const parent = el.parentElement;
    if (!parent) return base;
    // マスの余白(padding)を除いた、実際に文字を置ける幅で判定する。
    const parentStyle = getComputedStyle(parent);
    const available =
      parent.clientWidth - (parseFloat(parentStyle.paddingLeft) || 0) - (parseFloat(parentStyle.paddingRight) || 0);
    // 文字自身の左右の余白(px-1など)も含めた、1行に並べたときの幅。
    const natural = el.scrollWidth;
    if (available > 0 && natural > available) return base * (available / natural) * 0.97;
    return base;
  });

  if (options.apply) {
    els.forEach((el, i) => {
      el.style.fontSize = `${sizes[i]}px`;
    });
  }
  return sizes;
}
