/**
 * dust.ts — غبار ضوء يتجمّع فيكتب اسماً، ثم يتفرّق.
 *
 * الاسم لا يُرسم نصّاً على الشاشة: نرسمه على كانفاس مخفيّ، نقرأ بكسلاته،
 * فيصير كل بكسل **هدفاً** لذرّة. الفرق أن الحرف يتكوّن أمام العين من ضوء
 * متفرّق بدل أن يظهر جاهزاً — وهذا وحده الفرق بين «اسم مكتوب» و«اسم يتشكّل».
 *
 * كانفاس مستقلّ عن `celebrate.ts` ولوب مستقلّ. الاثنان يعملان معاً أحياناً،
 * ودمجهما في محرّك واحد يعني حقولاً تخصّ أحدهما تُحمل في جسيمات الآخر.
 *
 * الخطّ عربيّ ومن الويب، فلا بدّ من انتظار `document.fonts` قبل القراءة —
 * وإلا أخذنا بكسلات الخطّ الاحتياطي ورسمنا شكلاً آخر.
 */

const COLORS = ['#ffffff', '#e9dcff', '#c4b5fd', '#f7a8c4', '#ffd8ae'];

/** أطوار حياة الذرّة. */
type Phase = 'seek' | 'hold' | 'drift';

interface Mote {
  x: number; y: number;
  vx: number; vy: number;
  tx: number; ty: number;
  size: number;
  color: string;
  phase: Phase;
  /** متى تنتقل إلى الطور التالي — بالثواني من بدء المشهد */
  at: number;
  alpha: number;
  seed: number;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let motes: Mote[] = [];
let raf = 0;
let dpr = 1;
let t0 = 0;
let last = 0;
let holdUntil = 0;

/** هالة مرسومة سلفاً لكل لون: بناء تدرّج لكل ذرّة في كل إطار يخنق الهاتف. */
const glows = new Map<string, HTMLCanvasElement>();

function reduced(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resize(): void {
  if (!canvas) return;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function glowFor(color: string): HTMLCanvasElement {
  const hit = glows.get(color);
  if (hit) return hit;
  const R = 16;
  const g = document.createElement('canvas');
  g.width = g.height = R * 2;
  const c = g.getContext('2d')!;
  const grad = c.createRadialGradient(R, R, 0, R, R, R);
  grad.addColorStop(0, color);
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, R * 2, R * 2);
  glows.set(color, g);
  return g;
}

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (ctx && canvas?.isConnected) return ctx;
  canvas = document.createElement('canvas');
  canvas.className = 'dust-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  resize();
  window.addEventListener('resize', resize, { passive: true });
  ctx = canvas.getContext('2d');
  return ctx;
}

function teardown(): void {
  cancelAnimationFrame(raf);
  raf = 0;
  motes = [];
  window.removeEventListener('resize', resize);
  canvas?.remove();
  canvas = null;
  ctx = null;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const pick = (l: readonly string[]): string => l[Math.floor(Math.random() * l.length)]!;

/**
 * نقاط الحرف: نرسم النصّ على كانفاس مخفيّ ونأخذ البكسلات المعتِمة.
 *
 * `step` هو التباعد بين النقاط. تصغيره يزيد كثافة الغبار ويثقل الإطار على
 * الهاتف، فنضبطه على عرض الشاشة لا على رقم ثابت.
 */
function samplePoints(
  text: string,
  boxW: number,
  boxH: number,
  step: number,
): { x: number; y: number }[] {
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.floor(boxW));
  off.height = Math.max(1, Math.floor(boxH));
  const c = off.getContext('2d', { willReadFrequently: true });
  if (!c) return [];

  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  let size = Math.floor(boxH * 0.92);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (let i = 0; i < 24; i++) {
    c.font = `700 ${size}px ${family}`;
    if (c.measureText(text).width <= boxW * 0.9) break;
    size = Math.floor(size * 0.9);
  }
  c.fillStyle = '#fff';
  c.fillText(text, off.width / 2, off.height / 2);

  const { data } = c.getImageData(0, 0, off.width, off.height);
  const pts: { x: number; y: number }[] = [];
  for (let y = 0; y < off.height; y += step) {
    for (let x = 0; x < off.width; x += step) {
      if (data[(y * off.width + x) * 4 + 3]! > 140) {
        // إزاحة نصف خطوة عشوائية: الشبكة المنتظمة تُقرأ نقشاً لا غباراً
        pts.push({
          x: x + (Math.random() - 0.5) * step,
          y: y + (Math.random() - 0.5) * step,
        });
      }
    }
  }
  return pts;
}

/**
 * يجمع غباراً متناثراً حتى يكتب `text`، يثبته، ثم يفرّقه.
 *
 * `onWritten` يُستدعى بعد أن يتفرّق الغبار لا لحظة اكتماله: التسليم عند
 * الاكتمال يضع الكلام التالي تحت غبارٍ لا يزال معلّقاً في مكانه بالضبط.
 */
export function nameInDust(text: string, hold = 2.4, onWritten?: () => void): void {
  if (reduced()) { onWritten?.(); return; }
  const c = ensureCanvas();
  if (!c) { onWritten?.(); return; }

  const W = window.innerWidth;
  const H = window.innerHeight;

  const run = (): void => {
    const boxW = Math.min(W * 0.82, 560);
    const boxH = Math.min(H * 0.26, 210);
    const step = W < 480 ? 7 : 6;
    const pts = samplePoints(text, boxW, boxH, step);
    if (pts.length === 0) { onWritten?.(); return; }

    const ox = (W - boxW) / 2;
    const oy = H * 0.42 - boxH / 2;

    const ARRIVE = 1.0;
    holdUntil = ARRIVE + hold;

    for (const p of pts) {
      // تولد الذرّة على حافّة الشاشة لا في وسطها: القدوم من بعيد هو ما يجعل
      // التجمّع مقروءاً كتجمّع.
      const edge = Math.random();
      const from =
        edge < 0.25 ? { x: rand(-40, W + 40), y: -30 }
        : edge < 0.5 ? { x: rand(-40, W + 40), y: H + 30 }
        : edge < 0.75 ? { x: -30, y: rand(-40, H + 40) }
        : { x: W + 30, y: rand(-40, H + 40) };

      motes.push({
        x: from.x, y: from.y,
        vx: 0, vy: 0,
        tx: ox + p.x, ty: oy + p.y,
        size: rand(1.4, 2.5),
        color: pick(COLORS),
        phase: 'seek',
        at: rand(0, 0.35),
        alpha: 0,
        seed: Math.random() * 6.28,
      });
    }

    window.setTimeout(() => onWritten?.(), (holdUntil + 1.1) * 1000);

    t0 = performance.now() / 1000;
    last = t0;
    if (!raf) raf = requestAnimationFrame(frame);
  };

  if (document.fonts && document.fonts.status !== 'loaded') {
    void document.fonts.ready.then(run).catch(run);
  } else {
    run();
  }
}

function frame(): void {
  if (!ctx || !canvas) { teardown(); return; }
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - last);
  last = now;
  const t = now - t0;
  const W = window.innerWidth;
  const H = window.innerHeight;

  ctx.clearRect(0, 0, W, H);
  // الضوء يُجمع: تراكب الذرّات يبيّض المركز كما تفعل النار
  ctx.globalCompositeOperation = 'lighter';

  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i]!;

    if (m.phase === 'seek') {
      if (t < m.at) continue;
      // نابض مخمّد: يصل بلا ارتداد وبلا تباطؤ في آخر المسافة
      m.vx += (m.tx - m.x) * 20 * dt;
      m.vy += (m.ty - m.y) * 20 * dt;
      m.vx *= Math.pow(0.02, dt);
      m.vy *= Math.pow(0.02, dt);
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.alpha = Math.min(1, m.alpha + dt * 2.4);
      if (Math.abs(m.tx - m.x) < 1.5 && Math.abs(m.ty - m.y) < 1.5) {
        m.phase = 'hold';
        // وقتٌ واحد للجميع لا مدّةٌ لكل ذرّة: المدد المختلفة تجعل الاسم
        // ينهار تدريجاً بدل أن ينفرط دفعةً واحدة
        m.at = holdUntil;
      }

    } else if (m.phase === 'hold') {
      m.x = m.tx + Math.sin(now * 2.6 + m.seed) * 0.8;
      m.y = m.ty + Math.cos(now * 2.2 + m.seed) * 0.8;
      m.alpha = 0.82 + Math.sin(now * 4 + m.seed) * 0.18;
      if (t >= m.at) {
        m.phase = 'drift';
        m.vx = rand(-26, 26);
        m.vy = rand(-46, -6);
      }

    } else {
      // تصعد وتخبو: السقوط يُقرأ رماداً، والصعود يُقرأ ضوءاً ينطفئ
      m.vy += 12 * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.alpha -= dt * 1.1;
      if (m.alpha <= 0.01) { motes.splice(i, 1); continue; }
    }

    if (m.alpha <= 0) continue;
    const g = glowFor(m.color);
    const r = m.size * 3;
    ctx.globalAlpha = Math.min(1, m.alpha) * 0.75;
    ctx.drawImage(g, m.x - r, m.y - r, r * 2, r * 2);
    ctx.globalAlpha = Math.min(1, m.alpha);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.size * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  if (motes.length > 0) raf = requestAnimationFrame(frame);
  else teardown();
}
