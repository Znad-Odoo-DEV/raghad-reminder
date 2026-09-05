/**
 * sky.ts — صواريخ تنفجر، ثم يتجمّع شررها فيكتب اسماً، ثم يتناثر.
 *
 * كانفاس مستقلّ عن `celebrate.ts` ولوب مستقلّ. الشكلان يعملان معاً في نفس
 * اللحظة أحياناً، ودمجهما في محرّك واحد كان يعني حقولاً تخصّ أحدهما تُحمل في
 * جسيمات الآخر.
 *
 * الاسم لا يُرسم نصّاً على الشاشة: نرسمه على كانفاس مخفيّ، نقرأ بكسلاته،
 * فيصير كل بكسل **هدفاً** لشرارة. الفرق أن الحرف يتكوّن أمام العين من ضوء
 * متفرّق بدل أن يظهر جاهزاً.
 *
 * الخطّ عربيّ ومن الويب، فلا بدّ من انتظار `document.fonts` قبل القراءة —
 * وإلا أخذنا بكسلات الخطّ الاحتياطي ورسمنا شكلاً آخر.
 */

const ROCKET_COLORS = ['#ffd166', '#ff8fab', '#a78bfa', '#8ce0ff', '#fff1a8', '#ff6b9d'];

/**
 * متى يتفكّك الاسم — بالثواني من بدء المشهد، لا من وصول كل شرارة.
 *
 * لو ثبتت كل شرارة مدّتها الخاصة لتفكّك الاسم تدريجاً وبدا أنه ينهار؛ ووقتٌ
 * واحد للجميع يجعله ينفرط دفعةً واحدة كما ينطفئ ضوء.
 */
const HOLD_UNTIL = 4.2;

/**
 * كم يُنتظر بعد انفراط الاسم قبل تسليم الشاشة لما بعده.
 *
 * التسليم لحظةَ الانفراط كان يضع التهنئة تحت شررٍ لا يزال معلّقاً في مكانها
 * بالضبط، فيتشابك الحرفان. الانتظار حتى يسقط الشرر ويخبو هو ما يجعل
 * الانتقال انتقالاً لا ازدحاماً.
 */
const HANDOVER_MS = 850;

/** أطوار حياة الشرارة. */
type Phase = 'rise' | 'spray' | 'seek' | 'hold' | 'fall';

interface Spark {
  x: number; y: number;
  vx: number; vy: number;
  /** الهدف على شكل الحرف — بلا معنى لشرارة الزينة */
  tx: number; ty: number;
  size: number;
  color: string;
  phase: Phase;
  /** متى ينتقل إلى الطور التالي، بالثواني من بدء المشهد */
  at: number;
  alpha: number;
  /** ذبذبة صغيرة أثناء الثبات — الحرف الساكن تماماً يبدو صورةً لا ناراً */
  seed: number;
}

let canvas: HTMLCanvasElement | null = null;
let night: HTMLElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
/** هالة مرسومة سلفاً لكل لون: بناء تدرّج لكل شرارة في كل إطار يخنق الهاتف */
const glows = new Map<string, HTMLCanvasElement>();
let sparks: Spark[] = [];
let raf = 0;
let dpr = 1;
let t0 = 0;
let last = 0;

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

/** قرص متدرّج الشفافية بلون الشرارة — يُرسم مرة ويُستنسخ بـ`drawImage`. */
function glowFor(color: string): HTMLCanvasElement {
  const hit = glows.get(color);
  if (hit) return hit;
  const R = 16;
  const g = document.createElement('canvas');
  g.width = g.height = R * 2;
  const c = g.getContext('2d')!;
  const grad = c.createRadialGradient(R, R, 0, R, R, R);
  grad.addColorStop(0, color);
  grad.addColorStop(0.22, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, R * 2, R * 2);
  glows.set(color, g);
  return g;
}

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (ctx && canvas?.isConnected) return ctx;

  // سماء ليل: الدمج الجمعي يُبيّض على أرضية فاتحة فتضيع النار في اللافندر.
  // النار تحتاج ظلاماً تُرى فيه، لا لأنه أجمل بل لأنه شرط الرؤية.
  night = document.createElement('div');
  night.className = 'sky-night';
  night.setAttribute('aria-hidden', 'true');
  document.body.appendChild(night);
  // إطار واحد قبل إضافة الصنف، وإلا بدأ الانتقال من حالته النهائية
  requestAnimationFrame(() => night?.classList.add('on'));

  canvas = document.createElement('canvas');
  canvas.className = 'sky-canvas';
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
  sparks = [];
  window.removeEventListener('resize', resize);
  canvas?.remove();
  canvas = null;
  ctx = null;
  night?.remove();
  night = null;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const pick = (l: readonly string[]): string => l[Math.floor(Math.random() * l.length)]!;

/**
 * نقاط الحرف: نرسم النصّ على كانفاس مخفيّ ونأخذ البكسلات المعتِمة.
 *
 * `step` هو التباعد بين النقاط. تصغيره يزيد كثافة الشرر ويثقل الإطار على
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

  // نكبّر حتى يملأ النصّ الصندوق عرضاً — الاسم قد يكون حرفين أو ستّة
  let size = Math.floor(boxH * 0.9);
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (let i = 0; i < 24; i++) {
    c.font = `700 ${size}px ${family}`;
    if (c.measureText(text).width <= boxW * 0.92) break;
    size = Math.floor(size * 0.9);
  }
  c.fillStyle = '#fff';
  c.fillText(text, off.width / 2, off.height / 2);

  const { data } = c.getImageData(0, 0, off.width, off.height);
  const pts: { x: number; y: number }[] = [];
  for (let y = 0; y < off.height; y += step) {
    for (let x = 0; x < off.width; x += step) {
      if (data[(y * off.width + x) * 4 + 3]! > 140) {
        // إزاحة نصف خطوة عشوائية: الشبكة المنتظمة تُقرأ نقشاً لا ناراً
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
 * يُطلق الألعاب النارية ثم يكتب `text` بشررها.
 *
 * `onWritten` يُستدعى عند اكتمال الاسم لا عند انتهاء المشهد، فما يليه من كلام
 * يبدأ والاسم لا يزال في السماء.
 */
export function nameInTheSky(text: string, onWritten?: () => void): void {
  if (reduced()) { onWritten?.(); return; }
  const c = ensureCanvas();
  if (!c) { onWritten?.(); return; }

  const W = window.innerWidth;
  const H = window.innerHeight;

  const run = (): void => {
    const boxW = Math.min(W * 0.86, 620);
    const boxH = Math.min(H * 0.30, 240);
    // الهواتف الضيّقة تحتاج تباعداً أكبر وإلا صار الإطار أثقل من أن يُعرض
    const step = W < 480 ? 7 : 6;
    const pts = samplePoints(text, boxW, boxH, step);

    const ox = (W - boxW) / 2;
    const oy = H * 0.30 - boxH / 2;

    // ── صواريخ الزينة ──
    // تنطلق من أسفل الشاشة وتنفجر على ارتفاعات مختلفة قبل أن يبدأ الاسم،
    // فيصل الاسم إلى سماءٍ مشتعلة أصلاً لا إلى فراغ.
    const rockets = W < 480 ? 5 : 7;
    for (let i = 0; i < rockets; i++) {
      const bx = rand(W * 0.15, W * 0.85);
      const by = rand(H * 0.14, H * 0.46);
      const fuse = i * 0.16 + rand(0, 0.12);
      const color = pick(ROCKET_COLORS);

      sparks.push({
        x: bx, y: H + 12, vx: 0, vy: 0, tx: bx, ty: by,
        size: 2.6, color, phase: 'rise', at: fuse + 0.55, alpha: 1,
        seed: Math.random() * 6.28,
      });

      const petals = W < 480 ? 22 : 30;
      for (let k = 0; k < petals; k++) {
        const a = (k / petals) * Math.PI * 2 + rand(-0.1, 0.1);
        const sp = rand(60, 210);
        sparks.push({
          x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          tx: 0, ty: 0, size: rand(1.4, 3),
          color: Math.random() < 0.25 ? '#ffffff' : color,
          phase: 'spray', at: fuse + 0.55, alpha: 0,
          seed: Math.random() * 6.28,
        });
      }
    }

    // ── شرر الاسم ──
    // يولد في مواضع الانفجارات ويسافر إلى هدفه، فيبدو أن الاسم تكوّن من الشرر
    // المتناثر لا أنه رُسم فوقه.
    const START = 1.05;
    for (const p of pts) {
      sparks.push({
        x: rand(W * 0.2, W * 0.8),
        y: rand(H * 0.2, H * 0.5),
        vx: rand(-40, 40), vy: rand(-40, 40),
        tx: ox + p.x, ty: oy + p.y,
        size: rand(1.7, 2.9),
        color: Math.random() < 0.18 ? '#ffffff' : pick(ROCKET_COLORS),
        phase: 'seek',
        at: START + rand(0, 0.45),
        alpha: 0,
        seed: Math.random() * 6.28,
      });
    }

    // ── موجة ثانية أثناء الثبات ──
    // بلا هذا تموت السماء تحت الاسم ثانيتين كاملتين، فيبدو الاسم لصاقةً
    // معلّقة على خلفية ساكنة لا ناراً في سماء حيّة.
    for (let i = 0; i < (W < 480 ? 3 : 4); i++) {
      const bx = rand(W * 0.1, W * 0.9);
      const by = rand(H * 0.52, H * 0.78);
      const fuse = 2.5 + i * 0.34;
      const color = pick(ROCKET_COLORS);
      sparks.push({
        x: bx, y: H + 12, vx: 0, vy: 0, tx: bx, ty: by,
        size: 2.4, color, phase: 'rise', at: fuse, alpha: 1, seed: 0,
      });
      for (let k = 0; k < 20; k++) {
        const a = (k / 20) * Math.PI * 2 + rand(-0.1, 0.1);
        const sp = rand(50, 170);
        sparks.push({
          x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          tx: 0, ty: 0, size: rand(1.3, 2.6),
          color: Math.random() < 0.25 ? '#ffffff' : color,
          phase: 'spray', at: fuse, alpha: 0, seed: Math.random() * 6.28,
        });
      }
    }

    // الليل ينقشع مع انفراط الاسم، والدور يُسلَّم بعد أن يسقط الشرر
    window.setTimeout(() => night?.classList.remove('on'), HOLD_UNTIL * 1000);
    window.setTimeout(() => onWritten?.(), HOLD_UNTIL * 1000 + HANDOVER_MS);

    t0 = performance.now() / 1000;
    last = t0;
    if (!raf) raf = requestAnimationFrame(frame);
  };

  // الخطّ العربي من الويب: القراءة قبل تحميله تعطي شكل الخطّ الاحتياطي
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
  // الشرر يجمع ضوءه: تراكب النقاط يبيّض المركز كما تفعل النار
  ctx.globalCompositeOperation = 'lighter';

  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]!;

    if (s.phase === 'rise') {
      // الصاروخ يقطع ما تبقّى من المسافة في ما تبقّى من الزمن
      const left = Math.max(0.001, s.at - t);
      s.x += ((s.tx - s.x) / left) * dt;
      s.y += ((s.ty - s.y) / left) * dt;
      s.alpha = 1;
      if (t >= s.at) { sparks.splice(i, 1); continue; }

    } else if (s.phase === 'spray') {
      if (t < s.at) { s.alpha = 0; continue; }
      const age = t - s.at;
      // احتكاك يبطّئ الشرارة كما يفعل الهواء، وجاذبية تسحبها
      s.vx *= Math.pow(0.24, dt);
      s.vy = s.vy * Math.pow(0.24, dt) + 190 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.alpha = Math.max(0, 1 - age / 1.5);
      if (s.alpha <= 0.01) { sparks.splice(i, 1); continue; }

    } else if (s.phase === 'seek') {
      if (t < s.at) { s.alpha = 0; continue; }
      // نابض مخمّد: يصل بلا ارتداد وبلا تباطؤ في آخر المسافة
      s.vx += (s.tx - s.x) * 26 * dt;
      s.vy += (s.ty - s.y) * 26 * dt;
      s.vx *= Math.pow(0.02, dt);
      s.vy *= Math.pow(0.02, dt);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.alpha = Math.min(1, s.alpha + dt * 3);
      if (Math.abs(s.tx - s.x) < 1.6 && Math.abs(s.ty - s.y) < 1.6) {
        s.phase = 'hold';
        s.at = HOLD_UNTIL;
      }

    } else if (s.phase === 'hold') {
      // ذبذبة دون بكسل: تكفي ليتنفّس الحرف
      s.x = s.tx + Math.sin(now * 3 + s.seed) * 0.7;
      s.y = s.ty + Math.cos(now * 2.6 + s.seed) * 0.7;
      s.alpha = 0.85 + Math.sin(now * 5 + s.seed) * 0.15;
      if (t >= s.at) {
        s.phase = 'fall';
        s.vx = rand(-30, 30);
        s.vy = rand(-40, 10);
      }

    } else {
      s.vy += 210 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.alpha -= dt * 1.7;
      if (s.alpha <= 0.01 || s.y > H + 40) { sparks.splice(i, 1); continue; }
    }

    if (s.alpha <= 0) continue;
    ctx.globalAlpha = Math.min(1, s.alpha);
    // هالة ثم نواة: القرص الصلب وحده يُقرأ نقطة ملوّنة لا جمرة
    const g = glowFor(s.color);
    const r = s.size * 2.8;
    ctx.drawImage(g, s.x - r, s.y - r, r * 2, r * 2);
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = Math.min(1, s.alpha) * 0.9;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  if (sparks.length > 0) raf = requestAnimationFrame(frame);
  else teardown();
}
