/**
 * hunt.ts — صيد الملوخية.
 *
 * ورقٌ ينزل من أعلى الكانفاس، وتلقطه بإصبعها قبل أن يصل إلى القعر. الورق
 * من الصفيحة الحقيقية `leaves.png` — نسيج صورةٍ حقيقية داخل صورة ظلّية
 * صحيحة — لا رسمٌ من الصفر.
 *
 * كانفاس داخل المشهد لا فوق الصفحة، لأنه يلتقط اللمس: كانفاس الاحتفال ثابتٌ
 * وشفّافٌ للمؤشّر، وهذا عكسه تماماً.
 *
 * الوقت من `performance.now()` لا من ساعة الحائط: اللعبة عشرون ثانيةً
 * حقيقية، ولا معنى لأن تتبع محاكي التوقيت.
 */

const CELLS = 4;
const CELL_W = 96;
const CELL_H = 260;

/** نصف قطر اللمس أوسع من الورقة: الإصبع ليس مؤشّراً. */
const HIT_PAD = 22;

interface Leaf {
  x: number; y: number;
  vy: number;
  sway: number; phase: number;
  rot: number; vr: number;
  size: number;
  cell: number;
  /** لُقطت: تتقلّص وتختفي */
  caught: boolean;
  scale: number;
}

interface Options {
  seconds: number;
  onTick: (secondsLeft: number, score: number) => void;
  onEnd: (score: number) => void;
}

export interface HuntHandle {
  stop(): void;
}

let sheet: HTMLImageElement | null = null;
let sheetReady = false;

function loadSheet(): void {
  if (sheet) return;
  const img = new Image();
  img.decoding = 'async';
  img.addEventListener('load', () => { sheetReady = true; });
  img.src = `${import.meta.env.BASE_URL}leaves.png`;
  sheet = img;
}

/** يُستدعى مبكراً حتى تكون الصفيحة جاهزة قبل أول ورقة. */
export function preloadHunt(): void {
  loadSheet();
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export function startHunt(canvas: HTMLCanvasElement, opts: Options): HuntHandle {
  loadSheet();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(200, Math.floor(rect.width));
  const H = Math.max(200, Math.floor(rect.height));
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) { opts.onEnd(0); return { stop() { /* لا شيء */ } }; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let leaves: Leaf[] = [];
  let score = 0;
  let raf = 0;
  let stopped = false;
  let last = performance.now();
  const started = last;
  let nextSpawn = started + 400;
  let lastTickSec = -1;

  // تزداد السرعة ومعها معدّل النزول كل ما تقدّم الوقت: البداية تُعلّم والنهاية تُمتحن
  const progress = (now: number) => Math.min(1, (now - started) / (opts.seconds * 1000));

  function spawn(now: number): void {
    const p = progress(now);
    const size = rand(44, 64);
    leaves.push({
      x: rand(size, W - size),
      y: -size,
      vy: rand(55, 85) * (1 + p * 0.9),
      sway: rand(10, 26),
      phase: rand(0, Math.PI * 2),
      rot: rand(-0.4, 0.4),
      vr: rand(-0.9, 0.9),
      size,
      cell: Math.floor(Math.random() * CELLS),
      caught: false,
      scale: 1,
    });
    // فاصل أقصر مع التقدّم، ولا أقلّ من 380 مللي ثانية
    nextSpawn = now + Math.max(380, 1100 - p * 650) * rand(0.8, 1.2);
  }

  function hit(px: number, py: number): void {
    // الأحدث فوق، فنبحث من الآخر: اللمسة تأخذ الورقة التي تراها العين فوق
    for (let i = leaves.length - 1; i >= 0; i--) {
      const l = leaves[i]!;
      if (l.caught) continue;
      const halfW = (l.size * CELL_W) / CELL_H / 2 + HIT_PAD;
      const halfH = l.size / 2 + HIT_PAD;
      if (Math.abs(px - l.x) <= halfW && Math.abs(py - l.y) <= halfH) {
        l.caught = true;
        score++;
        return;
      }
    }
  }

  function onPointer(e: PointerEvent): void {
    if (stopped) return;
    const r = canvas.getBoundingClientRect();
    hit(e.clientX - r.left, e.clientY - r.top);
    e.preventDefault();
  }
  canvas.addEventListener('pointerdown', onPointer);

  function drawLeaf(l: Leaf): void {
    const h = l.size * l.scale;
    const w = (h * CELL_W) / CELL_H;
    ctx!.save();
    ctx!.translate(l.x, l.y);
    ctx!.rotate(l.rot);
    if (sheetReady && sheet) {
      ctx!.drawImage(sheet, l.cell * CELL_W, 0, CELL_W, CELL_H, -w / 2, -h / 2, w, h);
    } else {
      // احتياط قبل أن تُحمَّل الصفيحة: شكلٌ أخضر يكفي كي لا يبدو أن شيئاً معطّل
      ctx!.fillStyle = '#6ba355';
      ctx!.beginPath();
      ctx!.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx!.fill();
    }
    ctx!.restore();
  }

  function frame(now: number): void {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const elapsed = (now - started) / 1000;
    const left = Math.max(0, Math.ceil(opts.seconds - elapsed));
    if (left !== lastTickSec) {
      lastTickSec = left;
      opts.onTick(left, score);
    }
    if (elapsed >= opts.seconds) {
      stop();
      opts.onEnd(score);
      return;
    }

    if (now >= nextSpawn) spawn(now);

    ctx!.clearRect(0, 0, W, H);
    for (let i = leaves.length - 1; i >= 0; i--) {
      const l = leaves[i]!;
      if (l.caught) {
        // تتقلّص وتختفي: الاختفاء الفوري يُقرأ عطلاً، والتقلّص يُقرأ التقاطاً
        l.scale -= dt * 6;
        if (l.scale <= 0) { leaves.splice(i, 1); continue; }
      } else {
        l.phase += dt * (reduced ? 0 : 2.2);
        l.y += l.vy * dt;
        l.x += Math.sin(l.phase) * l.sway * dt;
        l.rot += l.vr * dt * (reduced ? 0 : 1);
        if (l.y - l.size > H) { leaves.splice(i, 1); continue; }
      }
      drawLeaf(l);
    }

    raf = requestAnimationFrame(frame);
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    canvas.removeEventListener('pointerdown', onPointer);
    leaves = [];
  }

  raf = requestAnimationFrame(frame);
  return { stop };
}
