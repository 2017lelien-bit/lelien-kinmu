import { validateCaption } from "@/lib/instagram/copy-rules";

// 紹介文テンプレートから次に投稿するものを選ぶ。DBにもInstagramにも触れない純粋な処理。

export interface PickableTemplate {
  id: string;
  title: string;
  body: string;
  isApproved: boolean;
  isActive: boolean;
  sortOrder: number;
  lastPostedAt: string | null;
}

export interface TemplateSkip {
  id: string;
  title: string;
  reason: string;
}

// 投稿できる条件: 承認済み・有効・文面ルールに違反していない。(画像は、固定画像→写真ライブラリ→文字の画像の順に自動で用意する)
// 並び順: 最後に投稿してから最も時間が経っている(まだ一度も投稿していないものが最優先)→ 並び順(sortOrder)の順。
// これで承認済みの文面が順番に一巡する。AIが文章を作ることはない。
export function orderEligibleTemplates<T extends PickableTemplate>(
  templates: T[],
): { ordered: T[]; skipped: TemplateSkip[] } {
  const skipped: TemplateSkip[] = [];
  const eligible: T[] = [];
  for (const t of templates) {
    if (!t.isActive) continue;
    if (t.lastPostedAt) continue; // 1回投稿したら、おしまい(同じ文は二度と出さない。次の文が承認されるまで、出さない)
    if (!t.isApproved) {
      skipped.push({ id: t.id, title: t.title, reason: "未承認" });
      continue;
    }
    const problems = validateCaption(t.body);
    if (problems.length > 0) {
      skipped.push({ id: t.id, title: t.title, reason: `文面ルール違反: ${problems.join(" / ")}` });
      continue;
    }
    eligible.push(t);
  }
  eligible.sort((a, b) => {
    const at = a.lastPostedAt ? new Date(a.lastPostedAt).getTime() : -Infinity;
    const bt = b.lastPostedAt ? new Date(b.lastPostedAt).getTime() : -Infinity;
    if (at !== bt) return at < bt ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
  return { ordered: eligible, skipped };
}

export function pickNextTemplate<T extends PickableTemplate>(
  templates: T[],
): { picked: T | null; skipped: TemplateSkip[] } {
  const { ordered, skipped } = orderEligibleTemplates(templates);
  return { picked: ordered[0] ?? null, skipped };
}

export interface LibraryImageLike {
  id: string;
  folder: string;
  isActive: boolean;
  lastUsedAt: string | null;
  useCount: number;
}

// 写真ライブラリから、指定フォルダの「最近使っていない」写真を選ぶ(一度も使っていないものが最優先)。
// 同じ写真が続けて出ないための順番であり、写真の内容をAIが判断することはない。
// 文の名前(title)に入っているクラス名から、背景の写真を入れるフォルダを決める(AIの判断ではなく、言葉の一致だけ)。
// 1つのクラス名だけが入っているときだけ、そのクラス専用のフォルダを使う。複数入っている・どれも入っていないときは null(共通のフォルダを使う)。
export const CLASS_BACKGROUND_FOLDERS: { pattern: RegExp; folder: string }[] = [
  { pattern: /バンジー/, folder: "背景_バンジー" },
  { pattern: /4D/i, folder: "背景_4Dpro" },
  { pattern: /ハンモック/, folder: "背景_ハンモック" },
  { pattern: /ティシュー|ティッシュ/, folder: "背景_ティシュー" },
];

export function classBackgroundFolder(title: string): string | null {
  const hits = CLASS_BACKGROUND_FOLDERS.filter((c) => c.pattern.test(title));
  return hits.length === 1 ? hits[0].folder : null;
}

// 文に合う背景を選ぶ。クラス専用フォルダに使える写真があればそこから、なければ共通のフォルダから。
export function pickBackgroundForTitle<T extends LibraryImageLike>(images: T[], title: string, commonFolder: string): T | null {
  const classFolder = classBackgroundFolder(title);
  return (classFolder ? pickLibraryImage(images, classFolder) : null) ?? pickLibraryImage(images, commonFolder);
}

export function pickLibraryImage<T extends LibraryImageLike>(images: T[], folder: string): T | null {
  const candidates = images.filter((i) => i.isActive && i.folder === folder);
  candidates.sort((a, b) => {
    const at = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : -Infinity;
    const bt = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : -Infinity;
    if (at !== bt) return at < bt ? -1 : 1;
    if (a.useCount !== b.useCount) return a.useCount - b.useCount;
    return a.id.localeCompare(b.id);
  });
  return candidates[0] ?? null;
}
