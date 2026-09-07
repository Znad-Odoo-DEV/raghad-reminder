/**
 * moon.ts — طور القمر، محسوباً لا مصوَّراً.
 *
 * الشهر القمري الاقتراني 29.530588853 يوماً، والمحاق المرجعي في 6 كانون
 * الثاني 2000 الساعة 18:14 UTC. العمر منذ ذلك المحاق، بباقي القسمة، يعطي
 * موضع القمر في دورته بدقّة تكفي العين — الخطأ أقلّ من ساعة على مدى عقود،
 * والعين لا تميّز أقلّ من يوم.
 *
 * اللحظة تأتي من `nowMs()` عند المستدعي لا من `Date.now()` هنا، فيتبع القمر
 * محاكي الوقت كما يتبعه كل شيء في الموقع.
 */

const SYNODIC_DAYS = 29.530588853;
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);
const DAY_MS = 86_400_000;

export interface MoonInfo {
  /** موضعه في الدورة: 0 محاق، 0.5 بدر، يعود إلى 1 */
  phase: number;
  /** الجزء المضاء من القرص، من 0 إلى 1 */
  illumination: number;
  /** متزايد (بين المحاق والبدر) أم متناقص */
  waxing: boolean;
  /** فهرس الطور من 0 إلى 7 — يطابق `MOON.phases` */
  index: number;
  /** عمره بالأيام منذ آخر محاق */
  age: number;
}

export function moonAt(ms: number): MoonInfo {
  const days = (ms - NEW_MOON_EPOCH) / DAY_MS;
  const age = ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
  const phase = age / SYNODIC_DAYS;
  const illumination = (1 - Math.cos(phase * Math.PI * 2)) / 2;

  // الأطوار الثمانية: كلٌّ نصف ثُمن حول مركزه، فالبدر هو ما بين 0.4375 و0.5625
  const index = Math.round(phase * 8) % 8;

  return { phase, illumination, waxing: phase < 0.5, index, age };
}

/**
 * مسار SVG للجزء المضاء، في مربّع ضلعه ‎2r‎ ومركزه ‎(r, r)‎.
 *
 * الحدّ بين الضوء والظلّ قطعُ ناقصٍ نصفُ قطره الأفقي ‎r·cos(2πφ)‎: موجبٌ في
 * الهلالين، سالبٌ في الأحدبين، صفرٌ عند التربيعين. الجهة المضاءة يمين
 * القرص وهو يتزايد ويساره وهو يتناقص — كما يُرى من نصف الكرة الشمالي.
 */
export function moonPath(info: MoonInfo, r: number): string {
  const k = Math.cos(info.phase * Math.PI * 2);
  const rx = Math.abs(k) * r;
  const cx = r;
  const cy = r;
  // 1 يمين، -1 يسار
  const side = info.waxing ? 1 : -1;

  // نصف القرص المضاء: قوسٌ من الأعلى إلى الأسفل على الجهة المضاءة
  const outer = `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${side === 1 ? 1 : 0} ${cx} ${cy + r}`;

  // الحدّ: قطعٌ ناقص يعود من الأسفل إلى الأعلى. في الهلال ينحني نحو الجهة
  // المضاءة (فيقتطع منها)، وفي الأحدب نحو الجهة المعتمة (فيضيف إليها).
  //
  // من الأسفل إلى الأعلى: ‎sweep=1‎ (مع عقارب الساعة على شاشةٍ محورها إلى
  // الأسفل) يمرّ باليسار، و‎sweep=0‎ يمرّ باليمين. فالهلال المتزايد — مضاءٌ
  // يميناً وحدُّه ينحني يميناً — يحتاج 0، والمتناقص يحتاج 1، والأحدبان عكسهما.
  const bulgeRight = k >= 0 ? side === 1 : side === -1;
  const sweep = bulgeRight ? 0 : 1;
  const inner = `A ${rx} ${r} 0 0 ${sweep} ${cx} ${cy - r} Z`;

  return `${outer} ${inner}`;
}
