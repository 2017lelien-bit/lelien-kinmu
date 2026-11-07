import { ImageResponse } from "next/og";
import sharp from "sharp";

// 文字だけのストーリーズの画像(1080×1920 = 9:16)を作る。
// ImageResponse(next/og)はPNGしか出せず、InstagramはJPEGしか受け付けないため、sharpでJPEGに変換する。
//  - 写真あり(night): 写真を全面に敷き、暗いベールをかけて、中央に文だけ
//  - 写真なし(plain): やさしい背景色に、上に「Le lien」の文字、中央に文、下に小さく店名

export const STORY_IMAGE_WIDTH = 1080;
export const STORY_IMAGE_HEIGHT = 1920;

export type StoryVariant = "night" | "plain";

const TEAL = "#3E8E7E";
const TEAL_DARK = "#255a50";
const CREAM = "#f4f1ea";
const SERIF = "Noto Serif JP";
const BRAND = "Le lien";
const FOOTER = "Le lien ・ 空中フィットネス";

// 日本語フォント(Noto Serif JP)を、画像に使う文字だけのサブセットとしてGoogle Fontsから取得する。
// 500KBのバンドル上限があるため、フォントファイルを同梱せず実行時に取得する。
async function loadFont(text: string, family = SERIF): Promise<ArrayBuffer> {
  const chars = Array.from(new Set(text)).join("");
  const cssRes = await fetch(
    `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@700&text=${encodeURIComponent(chars)}`,
  );
  if (!cssRes.ok) throw new Error(`font css ${cssRes.status}`);
  const css = await cssRes.text();
  const m = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
  if (!m) throw new Error("font url not found");
  const fontRes = await fetch(m[1]);
  if (!fontRes.ok) throw new Error(`font file ${fontRes.status}`);
  return fontRes.arrayBuffer();
}

// 写真(公開URL)を取得して、指定の大きさに切り出し、画像データ(data URI)にする。
async function preparePhoto(url: string, width: number, height: number): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photo fetch ${res.status}`);
  const jpeg = await sharp(Buffer.from(await res.arrayBuffer()))
    .rotate()
    .resize(width, height, { fit: "cover", position: "centre" })
    .jpeg({ quality: 85 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

function StoryTextImage({ variant, lines, photo }: { variant: StoryVariant; lines: string[]; photo: string | null }) {
  const dark = variant === "night" && photo !== null;
  // 行が多いときは文字を小さくする(14行より多いとき)。
  const many = lines.length > 14;
  const text = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lines.map((line, i) =>
        line === "" ? (
          <div key={i} style={{ display: "flex", height: 44 }} />
        ) : (
          <div
            key={i}
            style={{
              display: "flex",
              fontSize: many ? 46 : 56,
              fontWeight: 700,
              lineHeight: many ? 1.7 : 1.75,
              letterSpacing: 4,
              color: dark ? "#ffffff" : TEAL_DARK,
            }}
          >
            {line}
          </div>
        ),
      )}
    </div>
  );

  if (dark) {
    return (
      <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", fontFamily: SERIF }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo!} width={STORY_IMAGE_WIDTH} height={STORY_IMAGE_HEIGHT} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
        <div style={{ position: "absolute", left: 0, top: 0, width: STORY_IMAGE_WIDTH, height: STORY_IMAGE_HEIGHT, backgroundColor: "rgba(14,22,20,0.55)" }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            padding: "150px 60px 230px 60px",
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        backgroundColor: CREAM,
        padding: "170px 60px 230px 60px",
        fontFamily: SERIF,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 700, letterSpacing: 6, color: TEAL }}>{BRAND}</div>
        <div style={{ display: "flex", width: 90, height: 4, backgroundColor: TEAL, marginTop: 22 }} />
      </div>
      {text}
      <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: TEAL }}>{FOOTER}</div>
    </div>
  );
}

export async function renderStoryTextJpeg(input: { lines: string[]; photoUrl?: string | null }): Promise<Buffer> {
  const variant: StoryVariant = input.photoUrl ? "night" : "plain";
  const photo = input.photoUrl ? await preparePhoto(input.photoUrl, STORY_IMAGE_WIDTH, STORY_IMAGE_HEIGHT) : null;
  const font = await loadFont(BRAND + FOOTER + input.lines.join(""));
  const response = new ImageResponse(<StoryTextImage variant={variant} lines={input.lines} photo={photo} />, {
    width: STORY_IMAGE_WIDTH,
    height: STORY_IMAGE_HEIGHT,
    fonts: [{ name: SERIF, data: font, weight: 700, style: "normal" }],
  });
  const png = Buffer.from(await response.arrayBuffer());
  return sharp(png).flatten({ background: CREAM }).jpeg({ quality: 90 }).toBuffer();
}
