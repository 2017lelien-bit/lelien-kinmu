// 投稿文(承認済みのテンプレート)を、文字だけのストーリーズの行に分ける。
// 自由に文章を作って出すことはしない。ここは、承認済みの文を画像に載せる形に整えるだけ。

// 投稿文(テンプレート)を、文字だけのストーリーズの行に分ける。絵文字は画像のフォントにないため取り除く。
// 元の行は段落(あき)として扱い、長い行は「、」「。」で区切って、1行 MAX_LINE_CHARS 文字以内にする。
const MAX_LINE_CHARS = 15;
const MAX_STORY_LINES = 20; // 14行より多いときは、画像側で文字を小さくする

function wrapParagraph(paragraph: string): string[] {
  const pieces = paragraph.match(/[^、。!?!?]*[、。!?!?]?/g)?.filter((p) => p.length > 0) ?? [];
  const lines: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if ((current + piece).length <= MAX_LINE_CHARS) {
      current += piece;
      continue;
    }
    if (current) lines.push(current);
    if (piece.length <= MAX_LINE_CHARS) {
      current = piece;
      continue;
    }
    // 区切りのない長い文は、同じくらいの長さに等分する(1文字だけ余る、を避ける)。
    const parts = Math.ceil(piece.length / MAX_LINE_CHARS);
    const size = Math.ceil(piece.length / parts);
    for (let i = 0; i < parts - 1; i++) lines.push(piece.slice(i * size, (i + 1) * size));
    current = piece.slice((parts - 1) * size);
  }
  if (current) lines.push(current);
  return lines;
}

// 行に分けられない(長すぎる・空)ときは null。
export function storyLinesFromBody(body: string): string[] | null {
  const cleaned = body
    .replace(/#[^\s#]+/g, "") // ハッシュタグは画像に入れない
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "");
  const paragraphs = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const lines: string[] = [];
  paragraphs.forEach((p, i) => {
    if (i > 0) lines.push("");
    lines.push(...wrapParagraph(p));
  });
  const textLines = lines.filter((l) => l !== "").length;
  return textLines === 0 || lines.length > MAX_STORY_LINES ? null : lines;
}
