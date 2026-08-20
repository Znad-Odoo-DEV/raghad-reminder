/**
 * celebrate.ts — احتفال خفيف على canvas واحد، بدون أي مكتبة
 *
 * ~140 particles, single RAF loop, canvas is created on demand and torn down
 * when the last particle dies. Nothing runs while the page is idle.
 */

const PALETTE = ['#6d4aff', '#ff6fb5', '#12b981', '#f59e0b', '#4b2fd6', '#ffffff'];

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  rot: number; vr: number;
  color: string;
  /** 0 = قصاصة، 1 = حبة دواء */
  kind: 0 | 1;
  /** العمر المتبقي بالثواني */
  life: number;
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

function drawPill(c: CanvasRenderingContext2D, p: Particle): void {
  const w = p.size * 1.9;
  const h = p.size;
  const r = h / 2;
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w, h, r);
  c.fillStyle = p.color;
  c.fill();
  // نصف أبيض ليبدو كحبة دواء حقيقية
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w / 2, h, [r, 0, 0, r]);
  c.fillStyle = 'rgba(255,255,255,.78)';
  c.fill();
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
    p.vy += 0.16 * step;              // جاذبية
    p.vx *= Math.pow(0.995, step);    // مقاومة هواء
    p.x += p.vx * step;
    p.y += p.vy * step;
    p.rot += p.vr * step;
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
      drawPill(ctx, p);
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
    }
    ctx.restore();
  }

  if (particles.length > 0) raf = requestAnimationFrame(frame);
  else teardown();
}

function spawn(count: number, originX: number, originY: number, spread: number): void {
  for (let i = 0; i < count; i++) {
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * spread;
    const speed = 7 + Math.random() * 9;
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 7 + Math.random() * 7,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.28,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)]!,
      kind: Math.random() < 0.3 ? 1 : 0,
      life: 2.6 + Math.random() * 1.5,
    });
  }
  if (!raf) raf = requestAnimationFrame(frame);
}

/** انفجار احتفالي من عنصر معيّن (عادة زر "أخذت الدوا"). */
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

/** مطر حبوب دواء — بيضة مخفية. */
export function pillRain(): void {
  if (reduced()) return;
  if (!ensureCanvas()) return;

  const W = window.innerWidth;
  for (let i = 0; i < 46; i++) {
    particles.push({
      x: Math.random() * W,
      y: -30 - Math.random() * 240,
      vx: (Math.random() - 0.5) * 1.4,
      vy: 1 + Math.random() * 2.4,
      size: 9 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.14,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)]!,
      kind: 1,
      life: 5.4,
    });
  }
  if (!raf) raf = requestAnimationFrame(frame);
}
