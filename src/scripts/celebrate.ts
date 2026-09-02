/**
 * celebrate.ts — احتفال خفيف على canvas واحد، بدون أي مكتبة
 *
 * ستة أشكال: قلوب، فراشات، قصاصات، شرارات، ورود، وورق ملوخية. حلقة RAF واحدة، والـcanvas
 * يُنشأ عند الحاجة ويُهدم عند موت آخر جسيم — لا شيء يعمل بينما الصفحة ساكنة.
 *
 * الفراشة ليست قلباً بلون آخر: جاذبيتها أخفّ، وتتمايل جانبياً بجيب الزاوية،
 * وجناحاها يرفرفان. لو أعطيناها نفس فيزياء القصاصة لبدت ورقة ساقطة.
 */

const HEART_COLORS = ['#8b6bff', '#a78bfa', '#c4b5fd', '#6d4aca'];
const WING_COLORS = ['#8b6bff', '#a78bfa', '#c4b5fd', '#d5c7ff', '#e9e2ff'];
const CONFETTI_COLORS = ['#6d4aff', '#a78bfa', '#c4b5fd', '#4b2fd6', '#ffffff'];
// الشرارة على خلفية فاتحة: الأبيض واللافندر الفاتح يختفيان تماماً، فلا بدّ
// من ألوان غامقة كي تُقرأ المفرقعة أصلاً.
const STAR_COLORS = ['#6d4aca', '#8b6bff', '#a78bfa', '#4b2fd6'];
const FLOWER_COLORS = ['#c4b5fd', '#e9e2ff', '#ffffff', '#d8b4fe', '#b9a5ff'];

// أخضر ملوخية: أوراق حقيقية ليست بلون واحد — فاتحة عند الطرف، غامقة عند
// القاعدة، وبينها تدرّجات. اللون الوحيد يقتل الإيهام فوراً.
const LEAF_COLORS = ['#5c9147', '#4a7c3f', '#6ba355', '#3f6b36', '#77ad5e'];

/** 0 = قصاصة · 1 = قلب · 2 = فراشة · 3 = شرارة · 4 = وردة · 5 = ورقة ملوخية */
type Kind = 0 | 1 | 2 | 3 | 4 | 5;

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
  /** أي ورقة من صفيحة `leaves.png` — للورق فقط */
  cell: number;
}

/**
 * صفيحة ورق الملوخية: أربع ورقات نسيجها مقصوص من صورة حزمة حقيقية.
 * الرسم المتجهيّ أدناه يبقى احتياطاً — إن تأخّرت الصورة أو فشلت، يتطاير الورق
 * مرسوماً بدل ألّا يتطاير شيء.
 */
const LEAF_SHEET_CELLS = 4;
const LEAF_CELL_W = 96;
const LEAF_CELL_H = 260;
let leafSheet: HTMLImageElement | null = null;
let leafSheetReady = false;

/** يُستدعى مبكراً حتى لا تُرسم الموجة الأولى متجهيّةً ثم تنقلب صورةً. */
export function preloadLeaves(): void {
  if (leafSheet) return;
  const img = new Image();
  img.decoding = 'async';
  img.addEventListener('load', () => { leafSheetReady = true; });
  img.src = `${import.meta.env.BASE_URL}leaves.png`;
  leafSheet = img;
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


/**
 * نجمة رباعية بأربعة منحنيات — لا رؤوس حادّة.
 * الخماسية الحادّة تُقرأ «زينة عيد ميلاد جاهزة»؛ هذه أهدأ وتناسب المشهد.
 */
function drawStar(c: CanvasRenderingContext2D, p: Particle): void {
  const r = p.size / 2;
  const w = r * 0.28;
  c.beginPath();
  c.moveTo(0, -r);
  c.quadraticCurveTo(w, -w, r, 0);
  c.quadraticCurveTo(w, w, 0, r);
  c.quadraticCurveTo(-w, w, -r, 0);
  c.quadraticCurveTo(-w, -w, 0, -r);
  c.closePath();
  c.fillStyle = p.color;
  c.fill();
}


/**
 * وردة: خمس بتلات حول قلب دافئ.
 *
 * البتلة قطع ناقص مزاح عن المركز ثم تُدار خمس مرات — أرخص من رسم مسار لكل
 * بتلة، والشكل واحد في كل الأحجام. القلب بلون دافئ لأن الوردة كلها بلون واحد
 * تُقرأ بقعة لا زهرة.
 */
function drawFlower(c: CanvasRenderingContext2D, p: Particle): void {
  const r = p.size / 2;

  c.fillStyle = p.color;
  for (let i = 0; i < 5; i++) {
    c.save();
    c.rotate((i / 5) * Math.PI * 2);
    c.beginPath();
    c.ellipse(0, -r * 0.6, r * 0.34, r * 0.6, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  c.beginPath();
  c.arc(0, 0, r * 0.26, 0, Math.PI * 2);
  c.fillStyle = '#f2dfa0';
  c.fill();
}


/** ورقة ملوخية: صورةٌ من الصفيحة، وإن لم تجهز بعدُ فرسمٌ متجهيّ. */
function drawLeaf(c: CanvasRenderingContext2D, p: Particle): void {
  if (leafSheetReady && leafSheet) {
    const h = p.size;
    const w = (h * LEAF_CELL_W) / LEAF_CELL_H;
    c.drawImage(
      leafSheet,
      p.cell * LEAF_CELL_W, 0, LEAF_CELL_W, LEAF_CELL_H,
      -w / 2, -h / 2, w, h,
    );
    return;
  }
  drawLeafVector(c, p);
}

/**
 * الرسم الاحتياطي.
 *
 * ما يجعله يُقرأ ملوخيةً لا «ورقة شجر عامّة» ثلاثة تفاصيل:
 *   • الشكل رمحيّ ممدود، أعرض ما يكون عند ثُلثها الأعلى لا في وسطها.
 *   • الحافة مسنّنة — الأسنان تُرسم بإزاحة صغيرة متناوبة على المحيط.
 *   • ذيلان رفيعان عند القاعدة، وهما علامة Corchorus olitorius المميّزة.
 *
 * والعروق ليست زينة: العرق الأوسط وأزواجه المائلة هي ما يعطي السطح عمقاً
 * فلا يبدو قصاصةً خضراء.
 */
function drawLeafVector(c: CanvasRenderingContext2D, p: Particle): void {
  const L = p.size;
  const W = L * 0.40;
  const TEETH = 11;

  /** نصف عرض الورقة عند نسبة t من الطرف (0) إلى القاعدة (1). */
  const halfWidth = (t: number) => W * Math.sin(Math.pow(t, 0.78) * Math.PI);

  const side = (dir: 1 | -1) => {
    for (let i = 1; i <= TEETH; i++) {
      const t = i / TEETH;
      const y = -L / 2 + t * L;
      // سنّ متناوب: داخل قليلاً ثم خارج، فتبدو الحافة مقصوصة لا ملساء
      const tooth = i % 2 === 0 ? 0.86 : 1.04;
      c.lineTo(dir * halfWidth(t) * tooth, y);
    }
  };

  // نصل الورقة
  c.beginPath();
  c.moveTo(0, -L / 2);
  side(1);
  for (let i = TEETH; i >= 1; i--) {
    const t = i / TEETH;
    const y = -L / 2 + t * L;
    const tooth = i % 2 === 0 ? 0.86 : 1.04;
    c.lineTo(-halfWidth(t) * tooth, y);
  }
  c.closePath();
  c.fillStyle = p.color;
  c.fill();

  // العرق الأوسط
  c.strokeStyle = 'rgba(28, 58, 24, .38)';
  c.lineWidth = Math.max(0.6, L * 0.028);
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(0, -L / 2 + L * 0.04);
  c.lineTo(0, L / 2 - L * 0.02);
  c.stroke();

  // عروق جانبية مائلة نحو الطرف
  c.lineWidth = Math.max(0.4, L * 0.016);
  c.strokeStyle = 'rgba(28, 58, 24, .26)';
  for (let i = 1; i <= 3; i++) {
    const t = 0.25 + i * 0.17;
    const y = -L / 2 + t * L;
    const w = halfWidth(t) * 0.72;
    for (const dir of [1, -1]) {
      c.beginPath();
      c.moveTo(0, y);
      c.quadraticCurveTo(dir * w * 0.6, y - L * 0.06, dir * w, y - L * 0.12);
      c.stroke();
    }
  }

  // الذيلان عند القاعدة — علامة الملوخية
  c.lineWidth = Math.max(0.5, L * 0.02);
  c.strokeStyle = p.color;
  for (const dir of [1, -1]) {
    c.beginPath();
    c.moveTo(dir * halfWidth(0.94) * 0.5, L / 2 - L * 0.06);
    c.quadraticCurveTo(dir * W * 0.5, L / 2 + L * 0.06, dir * W * 0.34, L / 2 + L * 0.16);
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
    } else if (p.kind === 3) {
      // شرارة: تنطلق ثم تُبطئ وتقوس للأسفل — الاحتكاك هو ما يجعلها مفرقعة
      p.phase += 0.03 * step;
      p.vy += 0.05 * step;
      p.vx *= Math.pow(0.93, step);
      p.vy *= Math.pow(0.95, step);
      p.x += (p.vx + Math.sin(p.phase) * 0.3) * step;
      p.y += p.vy * step;
      p.rot += p.vr * 0.4 * step;
    } else if (p.kind === 5) {
      // ورقة: تتمايل وتتقلّب وهي نازلة. الميل يتبع الجيب لا دوراناً ثابتاً،
      // لأن الورقة الحقيقية تتأرجح حول محورها ولا تدور كالعجلة.
      p.phase += 0.045 * step;
      p.vy += 0.055 * step;
      p.vy = Math.min(p.vy, 2.6);
      p.x += (p.vx + Math.sin(p.phase) * p.sway * 1.6) * step;
      p.y += p.vy * step;
      p.rot = Math.sin(p.phase * 0.8) * 0.9 + p.vr * 4;
    } else if (p.kind === 4) {
      // وردة: تهبط ببطء وتتمايل وتدور حول نفسها
      p.phase += 0.02 * step;
      p.vy += 0.05 * step;
      p.vy = Math.min(p.vy, 2.2);
      p.x += (p.vx + Math.sin(p.phase) * 0.7) * step;
      p.y += p.vy * step;
      p.rot += p.vr * 0.5 * step;
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
    } else if (p.kind === 3) {
      drawStar(ctx, p);
    } else if (p.kind === 4) {
      drawFlower(ctx, p);
    } else if (p.kind === 5) {
      drawLeaf(ctx, p);
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
    kind === 1 ? pick(HEART_COLORS)
    : kind === 2 ? pick(WING_COLORS)
    : kind === 3 ? pick(STAR_COLORS)
    : kind === 4 ? pick(FLOWER_COLORS)
    : kind === 5 ? pick(LEAF_COLORS)
    : pick(CONFETTI_COLORS);

  return {
    x, y, vx, vy, color, kind, life,
    // الفراشة أكبر قليلاً حتى يُقرأ جناحاها
    size:
      kind === 2 ? 15 + Math.random() * 10
      : kind === 3 ? 7 + Math.random() * 7
      : kind === 4 ? 14 + Math.random() * 12
      : kind === 5 ? 30 + Math.random() * 22
      : 8 + Math.random() * 8,
    rot: kind === 0 ? Math.random() * Math.PI * 2 : (Math.random() - 0.5) * 0.5,
    vr: (Math.random() - 0.5) * (kind === 0 ? 0.28 : 0.12),
    phase: Math.random() * Math.PI * 2,
    flap: 0.26 + Math.random() * 0.2,
    sway: 0.5 + Math.random() * 1.1,
    cell: Math.floor(Math.random() * LEAF_SHEET_CELLS),
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

/**
 * الختام — صعود لا انفجار.
 *
 * الرشقة تناسب لحظة مفاجئة؛ نهاية الحكاية تحتاج شيئاً يتنفّس. تصعد العناصر من
 * الحافة السفلية عبر عرض الشاشة على دفعات، فيبقى المشهد مقروءاً والرسالة
 * ظاهرة تحته بدل أن تُغطّى.
 */
export function finale(): void {
  if (reduced()) return;
  if (!ensureCanvas()) return;

  const W = window.innerWidth;
  const H = window.innerHeight;

  const wave = (count: number, kinds: readonly Kind[]) => {
    for (let i = 0; i < count; i++) {
      const kind = kinds[i % kinds.length]!;
      particles.push(
        make(
          kind,
          (W / count) * i + Math.random() * (W / count),
          H + 30 + Math.random() * 60,
          (Math.random() - 0.5) * 1.2,
          -(1.6 + Math.random() * 1.9),
          7 + Math.random() * 3,
        ),
      );
    }
    if (!raf) raf = requestAnimationFrame(frame);
  };

  // موجات قليلة ومتباعدة: المشهد يتنفّس، والرسالة تبقى هي البطل
  wave(9, [3, 1, 3]);
  window.setTimeout(() => wave(7, [2, 3, 1]), 900);
  window.setTimeout(() => wave(7, [1, 3, 2]), 2000);
  window.setTimeout(() => wave(6, [3, 2]), 3200);
}

/**
 * احتفالية صغيرة: مفرقعات وورود.
 *
 * تُستدعى مرة عند فتح بطاقة التهنئة. المفرقعة رشقة شعاعية من نقطة، والورود
 * تهبط بعدها — الترتيب مقصود: الطقطقة أولاً ثم ما يتساقط منها.
 */
export function bloom(): void {
  if (reduced()) return;
  if (!ensureCanvas()) return;

  const W = window.innerWidth;
  const H = window.innerHeight;

  const pop = (x: number, y: number, n = 20) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.35;
      const sp = 4.5 + Math.random() * 5.5;
      particles.push(make(3, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 1.5 + Math.random()));
    }
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const flowers = (n: number) => {
    for (let i = 0; i < n; i++) {
      particles.push(
        make(4, Math.random() * W, -40 - Math.random() * 300, (Math.random() - 0.5) * 1.3, 0.6 + Math.random() * 1.2, 8),
      );
    }
    if (!raf) raf = requestAnimationFrame(frame);
  };

  pop(W * 0.27, H * 0.3);
  window.setTimeout(() => flowers(22), 180);
  window.setTimeout(() => pop(W * 0.73, H * 0.24), 480);
  window.setTimeout(() => pop(W * 0.5, H * 0.4, 15), 1000);
  window.setTimeout(() => flowers(16), 1400);
}

/**
 * ورق ملوخية يتطاير — عند فتح الظرف الأول.
 *
 * يدخل من الأعلى ومن الجانبين معاً: المطر العمودي وحده يبدو «تساقطاً»، ودخول
 * الجانب يعطي إحساس الطيران.
 */
export function leaves(): void {
  if (reduced()) return;
  if (!ensureCanvas()) return;

  const W = window.innerWidth;
  const H = window.innerHeight;

  const fromTop = (n: number) => {
    for (let i = 0; i < n; i++) {
      particles.push(
        make(5, Math.random() * W, -50 - Math.random() * 260, (Math.random() - 0.5) * 1.6, 0.5 + Math.random() * 1.2, 9),
      );
    }
  };

  const fromSide = (n: number) => {
    for (let i = 0; i < n; i++) {
      const left = Math.random() < 0.5;
      particles.push(
        make(
          5,
          left ? -50 : W + 50,
          H * (0.1 + Math.random() * 0.5),
          (left ? 1 : -1) * (2.2 + Math.random() * 2.2),
          -0.6 - Math.random() * 1.2,
          9,
        ),
      );
    }
  };

  fromTop(16);
  fromSide(6);
  window.setTimeout(() => fromTop(12), 700);
  window.setTimeout(() => fromSide(5), 1200);
  window.setTimeout(() => fromTop(10), 1900);

  if (!raf) raf = requestAnimationFrame(frame);
}
