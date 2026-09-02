/**
 * gen-leaves.mjs — يبني ورقة الملوخية الطائرة: `public/leaves.png`
 *
 * لا رسمة متجهيّة ولا صورة مقصوصة، بل الاثنان معاً. القصّ اليدوي من صورة الحزمة
 * مستحيل نظيفاً — الورقات متراكبة، وحدّ كل ورقة يمرّ فوق جارتها لا فوق خلفية.
 * فالمولّد يأخذ **نسيج الصورة الحقيقي** (لونه وعروقه ولمعته) ويقصّه داخل
 * **صورة ظلّية صحيحة** لـ Corchorus olitorius.
 *
 * لكل ورقة رقعةٌ يمرّ فيها عرقٌ أوسط بزاوية معلومة؛ ندوّرها حتى يقف العرق
 * عمودياً، ثم نقصّ. هكذا تنطبق عروق الصورة على محور الشكل بدل أن تعترضه.
 *
 *   node scripts/gen-leaves.mjs
 *
 * يُشغَّل يدوياً عند تغيّر المصدر فقط؛ الخرج مُودَع في المستودع والبناء لا يشغّله.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'assets', 'molokhia-bunch.jpg');
const OUT = join(HERE, '..', 'public', 'leaves.png');

const CELL_W = 96;
const CELL_H = 260;

/**
 * الورقات المختارة: مركز الرقعة في إحداثيات المصدر (447×447)، وزاوية العرق
 * الأوسط بالتقليد الرياضي (y إلى أعلى، الصفر يميناً) — أي اتجاه رأس الورقة.
 * `bend` انحناء جانبي و`teeth` عدد الأسنان: بلا تنويع تُقرأ الأربع نسخةً واحدة.
 */
const LEAVES = [
  { cx: 302, cy: 296, deg: 49, bend: 0.09, teeth: 26, w: 0.98, sat: 1.10, bri: 1.00 },
  { cx: 264, cy: 264, deg: 42, bend: -0.06, teeth: 30, w: 0.92, sat: 1.16, bri: 1.07 },
  { cx: 228, cy: 162, deg: 20, bend: 0.05, teeth: 28, w: 0.86, sat: 1.04, bri: 0.95 },
  { cx: 262, cy: 150, deg: 48, bend: -0.10, teeth: 24, w: 1.00, sat: 1.20, bri: 1.02 },
];

const PATCH = 132; // ضلع الرقعة المقتطعة من المصدر
const UP = 2.4; // تكبير قبل التدوير — التدوير على دقّة أعلى يقلّ تسنينه

/** مسار الورقة: نصلٌ رمحيّ + حافّة مسنّنة + ذيلان عند القاعدة. */
function leafPath(W, H, { bend, teeth, w }) {
  const m = 2;
  const tail = H * 0.055;
  const baseY = H - m - tail;
  const L = baseY - m;
  const cx = W / 2;
  const halfMax = (W / 2 - m) * w;

  // أعرض ما يكون النصل عند ثلثه الأسفل تقريباً، لا في منتصفه: ذاك ما يميّز
  // الشكل الرمحيّ عن الشكل البيضويّ.
  const hw = (t) => halfMax * Math.sin(Math.pow(t, 0.78) * Math.PI);
  const mid = (t) => cx + bend * halfMax * Math.sin(t * Math.PI);

  // السنّ يعلو تدريجاً نحو الرأس ثم ينقطع فجأةً إلى الجيب: هكذا يشير رأسه إلى
  // رأس الورقة كما في الطبيعة. لو انعكس الميل لأشارت الأسنان إلى القاعدة.
  // وعمقه ضئيل — حافّة الملوخية مسنّنة دقيقاً، لا مشرشرة كالمنشار.
  const tooth = (t) => 1 - 0.055 * (1 - ((t * teeth) % 1));

  const N = 200;
  const right = [];
  const left = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = baseY - t * L;
    const r = hw(t) * tooth(t);
    right.push([mid(t) + r, y]);
    left.push([mid(t) - r, y]);
  }
  const f = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

  const blade =
    `M ${f([cx, baseY])} L ` +
    right.map(f).join(' L ') +
    ' L ' +
    left.reverse().map(f).join(' L ') +
    ' Z';

  // الذيلان الرفيعان عند القاعدة — علامة Corchorus olitorius، وغيابهما يجعل
  // الشكل ورقةً عامّة.
  const tw = halfMax * 0.46;
  const tails =
    `M ${f([cx - 1.5, baseY - 4])} Q ${f([cx - tw * 0.5, baseY + tail * 0.45])} ${f([cx - tw, baseY + tail])} ` +
    `Q ${f([cx - tw * 0.3, baseY + tail * 0.35])} ${f([cx + 1.5, baseY - 6])} Z ` +
    `M ${f([cx + 1.5, baseY - 4])} Q ${f([cx + tw * 0.5, baseY + tail * 0.45])} ${f([cx + tw, baseY + tail])} ` +
    `Q ${f([cx + tw * 0.3, baseY + tail * 0.35])} ${f([cx - 1.5, baseY - 6])} Z`;

  return `${blade} ${tails}`;
}

/** يستبدل خلفية الصورة البيضاء بأخضر داكن: أي تسرّب أبيض يفضح القصّ فوراً. */
async function deWhite(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mn = Math.min(r, g, b);
    if (mn > 200 && Math.max(r, g, b) - mn < 40) {
      data[i] = 63; data[i + 1] = 94; data[i + 2] = 52;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png().toBuffer();
}

async function buildLeaf(leaf) {
  const half = PATCH / 2;
  const left = Math.max(0, Math.round(leaf.cx - half));
  const top = Math.max(0, Math.round(leaf.cy - half));

  const patch = await sharp(SRC)
    .extract({ left, top, width: PATCH, height: PATCH })
    .resize(Math.round(PATCH * UP), Math.round(PATCH * UP), { kernel: 'lanczos3' })
    .toBuffer();

  const cleaned = await deWhite(patch);

  // sharp يدوّر باتجاه عقارب الساعة، والزاوية بالتقليد الرياضي عكسها — ونريد
  // العرق أن يقف على 90°.
  const rotated = await sharp(cleaned)
    .rotate(leaf.deg - 90, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .modulate({ saturation: leaf.sat, brightness: leaf.bri })
    .toBuffer();

  const meta = await sharp(rotated).metadata();
  const texture = await sharp(rotated)
    .extract({
      left: Math.round((meta.width - CELL_W) / 2),
      top: Math.round((meta.height - CELL_H) / 2),
      width: CELL_W,
      height: CELL_H,
    })
    .toBuffer();

  const d = leafPath(CELL_W, CELL_H, leaf);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${CELL_H}">` +
      `<path d="${d}" fill="#fff" fill-rule="nonzero"/></svg>`,
  );

  // حدٌّ داكن رفيع: بدونه تبدو الورقة قصاصةً مقصوصةً بالمقصّ، لأن الحافّة
  // الحقيقية تُظلّل حيث ينحني النصل.
  const edge = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="${CELL_H}">` +
      `<defs><filter id="b"><feGaussianBlur stdDeviation="1.1"/></filter></defs>` +
      `<path d="${d}" fill="none" stroke="rgba(24,52,20,0.55)" stroke-width="2.4" filter="url(#b)"/>` +
      `</svg>`,
  );

  return sharp(texture)
    .ensureAlpha()
    .composite([
      { input: mask, blend: 'dest-in' },
      { input: edge, blend: 'atop' },
    ])
    .png()
    .toBuffer();
}

const cells = [];
for (const leaf of LEAVES) cells.push(await buildLeaf(leaf));

const sheet = sharp({
  create: {
    width: CELL_W * cells.length,
    height: CELL_H,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
}).composite(cells.map((input, i) => ({ input, left: i * CELL_W, top: 0 })));

const png = await sheet.png({ compressionLevel: 9, palette: true, quality: 92 }).toBuffer();
const { writeFile } = await import('node:fs/promises');
await writeFile(OUT, png);

console.log(`ورقات : ${cells.length}`);
console.log(`الخليّة: ${CELL_W}×${CELL_H}`);
console.log(`الخرج  : public/leaves.png · ${(png.length / 1024).toFixed(1)} KB`);
