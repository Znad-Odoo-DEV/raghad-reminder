/**
 * Renders the PWA icons from inline SVG sources.
 * Run with: node scripts/gen-icons.mjs
 *
 * Two shapes are needed:
 *  - "any"      : the rounded-square badge, used as-is
 *  - "maskable" : full-bleed background with the glyph inside the 80% safe
 *                 zone, so Android can crop it to a circle/squircle without
 *                 clipping the heart.
 *
 * القلب مرسوم في نظام إحداثيات 64×58 (نفس HeartGlyph.astro حرفياً)، ثم يُنقل
 * مركزه إلى الأصل ويُكبَّر — فيبقى الرمز واحداً في الموقع والأيقونة.
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const HEART_PATH =
  'M32 53C32 53 4 36.5 4 20.5 4 11.4 11.2 4 20.2 4 25.6 4 30.2 6.9 32 11.2' +
  ' 33.8 6.9 38.4 4 43.8 4 52.8 4 60 11.4 60 20.5 60 36.5 32 53 32 53Z';

const heart = (scale, cx, cy) => `
  <g transform="translate(${cx} ${cy}) scale(${scale}) translate(-32 -28.5)">
    <path d="${HEART_PATH}" fill="#ffffff"/>
    <ellipse cx="20" cy="17" rx="8" ry="5" fill="#ffe1ef" opacity=".7"
             transform="rotate(-24 20 17)"/>
  </g>`;

const grad = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff6fb5"/>
      <stop offset="55%" stop-color="#ff4d8d"/>
      <stop offset="100%" stop-color="#6d4aff"/>
    </linearGradient>
  </defs>`;

const any = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${grad}
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  ${heart(5.2, 256, 262)}
</svg>`;

// Safe zone: keep the glyph within the central 80% (radius 205 of 256).
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${grad}
  <rect width="512" height="512" fill="url(#g)"/>
  ${heart(4, 256, 262)}
</svg>`;

const jobs = [
  { svg: any, size: 192, out: 'public/icon-192.png' },
  { svg: any, size: 512, out: 'public/icon-512.png' },
  { svg: any, size: 180, out: 'public/apple-touch-icon.png' },
  { svg: maskable, size: 512, out: 'public/icon-maskable-512.png' },
];

for (const j of jobs) {
  const buf = await sharp(Buffer.from(j.svg)).resize(j.size, j.size).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(j.out, buf);
  console.log(`${j.out.padEnd(32)} ${j.size}x${j.size}  ${(buf.length / 1024).toFixed(1)} KB`);
}
