import sharp from "sharp";
import { mkdirSync } from "fs";

mkdirSync("public/icons", { recursive: true });

const CANVAS = 512;
const PADDING_RATIO = 0.12; // ロゴ周囲に余白を持たせる
const logoSize = Math.round(CANVAS * (1 - PADDING_RATIO * 2));

const logoBuffer = await sharp("public/logo.png")
  .resize(logoSize, logoSize, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .toBuffer();

const baseIcon = await sharp({
  create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
})
  .composite([{ input: logoBuffer, gravity: "center" }])
  .png()
  .toBuffer();

const sizes = [
  { name: "public/icons/icon-192.png", size: 192 },
  { name: "public/icons/icon-512.png", size: 512 },
  { name: "public/apple-touch-icon.png", size: 180 },
];

for (const { name, size } of sizes) {
  await sharp(baseIcon).resize(size, size).png().toFile(name);
  console.log("wrote", name);
}
