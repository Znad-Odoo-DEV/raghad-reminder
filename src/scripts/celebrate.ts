/**
 * celebrate.ts — احتفال خفيف على canvas واحد، بدون أي مكتبة
 *
 * ثلاثة أشكال: قلوب، فراشات، وقصاصات. حلقة RAF واحدة، والـcanvas يُنشأ عند
 * الحاجة ويُهدم عند موت آخر جسيم — لا شيء يعمل بينما الصفحة ساكنة.
 *
 * الفراشة ليست قلباً بلون آخر: جاذبيتها أخفّ، وتتمايل جانبياً بجيب الزاوية،
 * وجناحاها يرفرفان. لو أعطيناها نفس فيزياء القصاصة لبدت ورقة ساقطة.
 */

const HEART_COLORS = ['#ff4d8d', '#ff6fb5', '#ff8ec7', '#e0367f'];
const WING_COLORS = ['#6d4aff', '#8b6bff', '#4b2fd6', '#ff9ad2', '#f59e0b'];
const CONFETTI_COLORS = ['#6d4aff', '#ff6fb5', '#f59e0b', '#4b2fd6', '#ffffff'];

/** 0 = قصاصة · 1 = قلب · 2 = فراشة */
type Kind = 0 | 1 | 2;

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  rot: number; vr: number;
  color: string;
  kind: Kind;
  /** العمر المتبقي بالثواني */
  life: number;
  /** طور الرفرفة/التمايل — للفراشات فقط */
  phase: number;
  /** سرعة الرفرفة */
  flap: number;
  /** مدى التمايل الجانبي */
  sway: number;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let raf = 0;
let dpr = 1;
let lastTime = 0;

function reduced(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ensureCanvas(): CanvasRenderingContext2D | null {
  if (ctx && canvas?.isConnected) return ctx;

  canvas = document.createElement('canvas');
  canvas.className = 'celebrate-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  dpr = Math.min(window.devicePixelRatio || 1, 2);
  resize();
  window.addEventListener('resize', resize, { passive: true });

  ctx = canvas.getContext('2d');
  return ctx;
}

function resize(): void {
  if (!canvas) return;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function teardown(): void {
  cancelAnimationFrame(raf);
  raf = 0;
  lastTime = 0;
  particles = [];
  window.removeEventListener('resize', resize);
  canvas?.remove();
  canvas = null;
  ctx = null;
}

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

/* -------------------------------------------------------------- الرسم */

/**
 * قلب من منحنيين بيزيه متناظرين حول محور الرمز.
 * الإحداثيات معايَرة على 16 وحدة ثم تُقاس بحجم الجسيم، فيبقى الشكل نفسه في
 * كل الأحجام.
 */
function drawHeart(c: CanvasRenderingContext2D, p: Particle): void {
  const s = p.size / 16;
  c.scale(s, s);
  c.beginPath();
  c.moveTo(0, 5);
  c.bezierCurveTo(-9, -3, -6, -12, 0, -7);
  c.bezierCurveTo(6, -12, 9, -3, 0, 5);
  c.closePath();
  c.fillStyle = p.color;
  c.fill();
}

/**
 * فراشة: جناح أمامي مثلّثي مكتسح وجناح خلفي أصغر مستدير، مرسومان مرة
 * ومنعكسان أفقياً، مع جسم رقيق وقرنَي استشعار.
 *
 * الرفرفة تُنفَّذ بضغط المحور الأفقي فقط (`scale(open, 1)`)، فنرى الجناحين
 * يقتربان ويبتعدان كما في المنظور الحقيقي — بلا رسم إطارات منفصلة. نضع حداً
 * أدنى للانفتاح حتى لا تختفي الفراشة تماماً في لحظة الإغلاق.
 *
 * الجناح الأمامي مثلّثي لا بيضوي، والقرنان موجودان، لأن الشكل المستدير بلا
 * قرون يُقرأ كوريقة أو زهرة عند حجم 13 بكسل — لا كفراشة.
 */
function drawButterfly(c: CanvasRenderingContext2D, p: Particle): void {
  const s = p.size / 16;
  const open = 0.25 + 0.75 * Math.abs(Math.cos(p.phase));
  const baseAlpha = c.globalAlpha;

  c.scale(s, s);

  const half = (dir: 1 | -1) => {
    c.save();
    c.scale(dir * open, 1);

    // الجناح الخلفي أولاً، ليقع تحت الأمامي
    c.globalAlpha = baseAlpha * 0.8;
    c.beginPath();
    c.moveTo(0, -0.4);
    c.bezierCurveTo(5.4, 0.6, 9.6, 3.4, 8.2, 7.2);
    c.bezierCurveTo(6.9, 10.8, 2.2, 8.6, 0, 3.8);
    c.closePath();
    c.fillStyle = p.color;
    c.fill();

    // الجناح الأمامي — طرف مدبّب مكتسح للأعلى والخارج
    c.globalAlpha = baseAlpha;
    c.beginPath();
    c.moveTo(0, -4.6);
    c.bezierCurveTo(4, -11.2, 12.2, -11.6, 12.6, -6.4);
    c.bezierCurveTo(12.9, -2.4, 6.4, -0.7, 0, -1.1);
    c.closePath();
    c.fill();

    c.restore();
  };

  half(1);
  half(-1);

  c.globalAlpha = baseAlpha;

  // الجسم: بطن رقيق ورأس صغير
  c.fillStyle = 'rgba(23,18,56,.7)';
  c.beginPath();
  c.ellipse(0, 0.6, 0.95, 5, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(0, -5, 1.35, 0, Math.PI * 2);
  c.fill();

  // قرنا الاستشعار — هما ما يحسم قراءة الشكل كفراشة
  c.strokeStyle = 'rgba(23,18,56,.62)';
  c.lineWidth = 0.7;
  c.lineCap = 'round';
  for (const dir of [1, -1]) {
    c.beginPath();
    c.moveTo(dir * 0.5, -5.6);
    c.quadraticCurveTo(dir * 2.6, -9.2, dir * 4.6, -10.6);
    c.stroke();
  }
}

function frame(time: number): void {
  if (!ctx || !canvas) {
    // فقدنا الـcanvas بينما كانت هناك رشقة مجدولة — ننظّف بدل أن نتسرّب.
    particles = [];
    raf = 0;
    return;
  }

  // خطوة زمنية بالثواني، مثبّتة بحد أعلى حتى لا تقفز الجسيمات بعد تبويب خامل.
  const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
  lastTime = time;
  const step = dt * 60; // معامل مقارنةً بإطار 60 لقطة/ثانية

  const W = window.innerWidth;
  const H = window.innerHeight;
  ctx.clearRect(0, 0, W, H);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;

    if (p.kind === 2) {
      // الفراشة تطير: جاذبية ربع القصاصة، ورفرفة ترفعها قليلاً كل دورة.
      p.phase += p.flap * step;
      p.vy += 0.04 * step;
      p.vy -= Math.max(0, Math.cos(p.phase)) * 0.05 * step;
      p.x += (p.vx + Math.sin(p.phase * 0.5) * p.sway) * step;
      p.y += p.vy * step;
      // ميلان طفيف يتبع اتجاه الحركة — فراشة مقلوبة تقرأ خطأ
      p.rot = Math.sin(p.phase * 0.5) * 0.22;
      p.vx *= Math.pow(0.985, step);
    } else {
      p.vy += 0.16 * step;              // جاذبية
      p.vx *= Math.pow(0.995, step);    // مقاومة هواء
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.rot += p.vr * step;
    }

    p.life -= dt;

    if (p.y > H + 60 || p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.min(1, p.life / 0.7);

    if (p.kind === 1) {
      drawHeart(ctx, p);
    } else if (p.kind === 2) {
      drawButterfly(ctx, p);
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
    }
    ctx.restore();
  }

  if (particles.length > 0) raf = requestAnimationFrame(frame);
  else teardown();
}

/** يبني جسيماً بالشكل المطلوب — الحجم واللون والفيزياء تتبع الشكل. */
function make(kind: Kind, x: number, y: number, vx: number, vy: number, life: number): Particle {
  const color =
    kind === 1 ? pick(HEART_COLORS) : kind === 2 ? pick(WING_COLORS) : pick(CONFETTI_COLORS);

  return {
    x, y, vx, vy, color, kind, life,
    // الفراشة أكبر قليلاً حتى يُقرأ جناحاها
    size: kind === 2 ? 15 + Math.random() * 10 : 8 + Math.random() * 8,
    rot: kind === 0 ? Math.random() * Math.PI * 2 : (Math.random() - 0.5) * 0.5,
    vr: (Math.random() - 0.5) * (kind === 0 ? 0.28 : 0.12),
    phase: Math.random() * Math.PI * 2,
    flap: 0.26 + Math.random() * 0.2,
    sway: 0.5 + Math.random() * 1.1,
  };
}

/** توزيع الأشكال: قلوب أولاً، فراشات ثانياً، وقصاصات تملأ الفراغ. */
function randomKind(): Kind {
  const r = Math.random();
  if (r < 0.42) return 1;
  if (r < 0.74) return 2;
  return 0;
}

function spawn(count: number, originX: number, originY: number, spread: number): void {
  if (!ensureCanvas()) return;

  for (let i = 0; i < count; i++) {
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * spread;
    const speed = 7 + Math.random() * 9;
    particles.push(
      make(
        randomKind(),
        originX,
        originY,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        2.8 + Math.random() * 1.8,
      ),
    );
  }
  if (!raf) raf = requestAnimationFrame(frame);
}

/** انفجار احتفالي من عنصر معيّن (عادة زر «الحمد لله»). */
export function burst(from?: Element | null): void {
  if (reduced()) return;
  if (!ensureCanvas()) return;

  const W = window.innerWidth;
  const H = window.innerHeight;
  const rect = from?.getBoundingClientRect();
  const cx = rect ? rect.left + rect.width / 2 : W / 2;
  const cy = rect ? rect.top + rect.height / 2 : H * 0.55;

  spawn(70, cx, cy, Math.PI * 1.1);
  // رشقتان جانبيتان بعد لحظة — يعطي إحساس "احتفال" لا "انفجار واحد"
  window.setTimeout(() => spawn(38, W * 0.12, H * 0.72, Math.PI * 0.5), 160);
  window.setTimeout(() => spawn(38, W * 0.88, H * 0.72, Math.PI * 0.5), 260);
}

/** مطر قلوب وفراشات من أعلى الصفحة — بيضة مخفية. */
export function heartRain(): void {
  if (reduced()) return;
  if (!ensureCanvas()) return;

  const W = window.innerWidth;
  for (let i = 0; i < 46; i++) {
    const kind: Kind = Math.random() < 0.5 ? 1 : 2;
    const p = make(
      kind,
      Math.random() * W,
      -30 - Math.random() * 240,
      (Math.random() - 0.5) * 1.4,
      kind === 2 ? 0.4 + Math.random() : 1 + Math.random() * 2.4,
      6.5,
    );
    particles.push(p);
  }
  if (!raf) raf = requestAnimationFrame(frame);
}

/**
 * سرب فراشات يعبر الشاشة أفقياً — يُستدعى عند النقر على القلب.
 * يدخل من الحافة السفلية ويصعد مائلاً، فيقرأ كعبور لا كانفجار.
 */
export function butterflies(count = 14): void {
  if (reduced()) return;
  if (!ensureCanvas()) return;

  const W = window.innerWidth;
  const H = window.innerHeight;
  const fromLeft = Math.random() < 0.5;

  for (let i = 0; i < count; i++) {
    const p = make(
      2,
      fromLeft ? -40 - Math.random() * 120 : W + 40 + Math.random() * 120,
      H * (0.55 + Math.random() * 0.5),
      (fromLeft ? 1 : -1) * (2.2 + Math.random() * 2.4),
      -1.6 - Math.random() * 1.8,
      7,
    );
    particles.push(p);
  }
  if (!raf) raf = requestAnimationFrame(frame);
}
