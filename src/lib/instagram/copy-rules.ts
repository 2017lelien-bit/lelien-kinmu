// Instagram投稿文のルール検査(簡易)。薬機法・景品表示法のリスクを避けるため、
// 効果効能・医療的表現、経歴・資格・年数、特典・割引の語を含む文面は登録も投稿もさせない。
// あくまで「うっかり」を防ぐ簡易チェック。通ったからといって適法を保証するものではないので、
// オーナーの目での確認(承認)は必ず必要。

export interface ForbiddenHit {
  term: string;
  category: "効果効能・医療的表現" | "経歴・資格" | "特典・割引";
}

// 判定は NFKC 正規化(全角英数→半角など)・空白除去・小文字化した文面に対して行う。
const FORBIDDEN_TERMS: Record<ForbiddenHit["category"], string[]> = {
  "効果効能・医療的表現": [
    "治る", "治す", "治り", "治療", "治癒", "完治", "改善", "効果", "効能", "効く", "効き",
    "血流", "血行", "リンパ", "デトックス", "解毒", "老廃物", "毒素", "代謝", "免疫", "ホルモン", "自律神経",
    // 「脊柱」「背骨」「伸びる」など、体の部位や運動の一般的な説明の語は、渡部さんの判断(2026-11-09)で禁止から外した。
    // 病気・症状・体型の変化・効果の断定をうたう語は、引き続き禁止。
    "骨盤矯正", "矯正", "歪み", "ゆがみ",
    "症状", "予防", "緩和", "軽減", "解消", "回復", "若返", "アンチエイジング", "痩せ", "やせる", "ダイエット", "痩身",
    "肩こり", "肩凝り", "腰痛", "頭痛", "不眠", "むくみ", "冷え性", "便秘", "アトピー", "生理痛", "不妊", "更年期", "婦人科",
    "疲労", "疲れが取れ", "疲れがとれ", "疲れが抜け", "痛みが", "ツボ",
    // 空中フィットネス(Le lien)向け: 体型・体の変化をうたう表現
    "引き締", "引締", "燃焼", "シェイプ", "くびれ", "美脚", "脂肪", "美肌", "小顔", "姿勢が良く", "姿勢が整", "筋力アップ", "ストレス解消",
  ],
  "経歴・資格": [
    "整骨", "マッサージ", "資格", "認定", "国家", "免許", "経歴", "経験", "実績", "キャリア", "院長", "施術歴", "大学", "卒業",
  ],
  "特典・割引": [
    "割引", "値引", "クーポン", "無料", "タダ", "プレゼント", "特典", "お得", "キャンペーン", "モニター", "限定価格",
    "円引", "半額", "先着", "初回限定",
  ],
};

// 「20年以上」「10年間」のような年数表現(2026年のような西暦は対象外)。
const YEARS_PATTERN = /\d{1,2}年(以上|間|超|前から)/;
const PERCENT_OFF_PATTERN = /\d+(%|％)?(off|オフ|引き)/i;

function normalize(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

// 渡部さんの判断(2026-11-09)で、次のフレーズだけは、禁止語を含んでいても使える。
//  - 「姿勢改善」: 運動の一般的な説明として(「〜に役立つ」の形で使う)
//  - 「自律神経を整えるヨガ」: Le lienの実際のクラス名として、そのままの形だけ
// これ以外の「改善」「自律神経」の使い方は、これまでどおり止まる。
const ALLOWED_PHRASES = ["姿勢改善", "自律神経を整えるヨガ"];

export function findForbiddenTerms(text: string): ForbiddenHit[] {
  let normalized = normalize(text);
  for (const phrase of ALLOWED_PHRASES) normalized = normalized.split(normalize(phrase)).join("");
  const hits: ForbiddenHit[] = [];
  const seen = new Set<string>();
  for (const [category, terms] of Object.entries(FORBIDDEN_TERMS) as [ForbiddenHit["category"], string[]][]) {
    for (const term of terms) {
      if (normalized.includes(term.toLowerCase()) && !seen.has(term)) {
        seen.add(term);
        hits.push({ term, category });
      }
    }
  }
  if (YEARS_PATTERN.test(normalized) && !seen.has("年数")) {
    hits.push({ term: "年数(〇年以上・〇年の 等)", category: "経歴・資格" });
  }
  if (PERCENT_OFF_PATTERN.test(normalized) && !seen.has("%OFF")) {
    hits.push({ term: "〇%OFF・〇円引き", category: "特典・割引" });
  }
  return hits;
}

// Instagramのキャプション上限(2,200文字、ハッシュタグ30個まで)。
export const CAPTION_MAX_CHARS = 2200;
export const CAPTION_MAX_HASHTAGS = 30;

// 登録・承認・投稿直前のそれぞれで使う総合チェック。問題がなければ空配列。日本語のメッセージを返す。
export function validateCaption(text: string): string[] {
  const problems: string[] = [];
  if (!text.trim()) problems.push("文面が空です。");
  if (text.length > CAPTION_MAX_CHARS) problems.push(`文面が長すぎます(${CAPTION_MAX_CHARS}文字まで)。`);
  const hashtags = text.match(/[#＃][^\s#＃]+/g) ?? [];
  if (hashtags.length > CAPTION_MAX_HASHTAGS) problems.push(`ハッシュタグは${CAPTION_MAX_HASHTAGS}個までです。`);
  for (const hit of findForbiddenTerms(text)) {
    problems.push(`使えない表現が含まれています(${hit.category}):「${hit.term}」`);
  }
  return problems;
}
