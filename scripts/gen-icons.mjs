/**
 * Renders the PWA icons from inline SVG sources.
 * Run with: node scripts/gen-icons.mjs
 *
 * Two shapes are needed:
 *  - "any"      : the rounded-square badge, used as-is
 *  - "maskable" : full-bleed background with the glyph inside the 80% safe
 *                 zone, so Android can crop it to a circle/squircle without
 *                 clipping the pill.
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const pill = (scale, cx, cy) => `
  <g transform="translate(${cx} ${cy}) scale(${scale}) rotate(-38)">
    <rect x="-32" y="-11" width="64" height="22" rx="11" fill="#ffffff"/>
    <path d="M0 -11h21a11 11 0 0 1 0 22H0z" fill="#2a1d6b"/>
    <ellipse cx="-16" cy="-4" rx="8" ry="4.4" fill="#ece6ff"/>
  </g>`;

const grad = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6d4aff"/>
      <stop offset="100%" stop-color="#ff6fb5"/>
    </linearGradient>
  </defs>`;

const any = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${grad}
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  ${pill(3.1, 256, 256)}
</svg>`;

// Safe zone: keep the glyph within the central 80% (radius 205 of 256).
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${grad}
  <rect width="512" height="512" fill="url(#g)"/>
  ${pill(2.35, 256, 256)}
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
