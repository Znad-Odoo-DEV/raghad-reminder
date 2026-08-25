/**
 * schedule.ts — كل ما يخص الوقت
 *
 * كل شيء هنا يقوم على لحظات مطلقة (epoch ms) ويتحوّل إلى ساعة الحائط في دمشق
 * عبر Intl فقط — أبداً عبر توقيت جهاز الزائرة. فلو فتحت رغد الموقع من أي بلد،
 * العدّادات وموعد رسالة اللطافة تبقى صحيحة بتوقيت سوريا.
 *
 * سوريا اليوم على UTC+3 ثابتة، لكن الإزاحة غير مكتوبة في أي سطر: تُقرأ من
 * قاعدة المناطق الزمنية عند كل لحظة، فيبقى الموقع صحيحاً لو تغيّرت القواعد.
 */

import { COINCIDENCE, FIRST_TALK, SWEET_HOUR, SWEET_MINUTE } from '../site.config';

/** المنطقة الزمنية المرجعية — رغد في سوريا */
export const TIMEZONE = 'Asia/Damascus';

const pad2 = (n: number) => String(n).padStart(2, '0');

/* -------------------------------------------------------------------------
   تحويل بين اللحظة المطلقة وساعة الحائط في دمشق
   ------------------------------------------------------------------------- */

const damascus = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export interface Wall {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
}

/** ساعة الحائط في دمشق عند لحظة معيّنة. */
export function wallOf(instant: number): Wall {
  const p: Record<string, string> = {};
  for (const part of damascus.formatToParts(new Date(instant))) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second),
  };
}

/** إزاحة دمشق عن UTC بالميلي ثانية عند لحظة معيّنة. */
function offsetAt(instant: number): number {
  const w = wallOf(instant);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * اللحظة المطلقة التي تكون عندها ساعة الحائط في دمشق هي القيم المعطاة.
 * نخمّن مرة ثم نصحّح، حتى لا ينكسر الحساب لو وقع التخمين على الجهة الأخرى
 * من تغيير توقيت.
 */
function instantOfWall(
  year: number, month: number, day: number, hour: number, minute: number,
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstGuess = naive - offsetAt(naive);
  return naive - offsetAt(firstGuess);
}

/** اللحظة التي تكون عندها ساعة دمشق اليوم هي hh:mm — تستخدمها لوحة المحاكاة. */
export function damascusTodayAt(hour: number, minute: number, from: number = Date.now()): number {
  const w = wallOf(from);
  return instantOfWall(w.year, w.month, w.day, hour, minute);
}

/** الوقت الحالي في دمشق كنص، مثل "11:23". */
export function damascusClock(instant: number = nowMs()): string {
  const w = wallOf(instant);
  return `${pad2(w.hour)}:${pad2(w.minute)}`;
}

/* -------------------------------------------------------------------------
   السفر عبر الزمن — تشغّله «لجنة اللطافة العليا» (لوحة الاختبار المخفية)
   ------------------------------------------------------------------------- */

const OFFSET_KEY = 'raghd:time-offset';

export function getOffset(): number {
  try {
    return Number(sessionStorage.getItem(OFFSET_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function setOffset(ms: number): void {
  try {
    if (ms === 0) sessionStorage.removeItem(OFFSET_KEY);
    else sessionStorage.setItem(OFFSET_KEY, String(ms));
  } catch {
    /* وضع التصفح الخاص — المحاكاة فقط لن تُحفظ */
  }
}

/** "الآن" بحسب التطبيق، كلحظة مطلقة (يحترم الإزاحة الاختبارية). */
export function nowMs(): number {
  return Date.now() + getOffset();
}

/** مفتاح اليوم بتوقيت دمشق — تصفير التخزين يتبع منتصف ليل سوريا. */
export function dayKeyOf(instant: number = nowMs()): string {
  const w = wallOf(instant);
  return `${w.year}-${pad2(w.month)}-${pad2(w.day)}`;
}

/* -------------------------------------------------------------------------
   العدّادات التصاعدية — تعدّ من يوم، وما بتوقف
   ------------------------------------------------------------------------- */

/**
 * يحوّل تاريخاً من الإعدادات إلى لحظة مطلقة.
 *
 * التاريخ مكتوب بساعة حائط دمشق لا بـUTC، فلا نستخدم `Date.parse`: هي تقرأ
 * `YYYY-MM-DD` كـUTC وتقرأ الصيغة ذات الساعة بتوقيت الجهاز — كلاهما خطأ هنا.
 * أي قيمة غير صالحة تعود `null`، فيُخفى العدّاد بدل أن يعرض أرقاماً غلط.
 */
function parseDamascusDate(value: string | null): number | null {
  if (!value) return null;

  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = m[4] ? Number(m[4]) : 0;
  const minute = m[5] ? Number(m[5]) : 0;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;

  const instant = instantOfWall(year, month, day, hour, minute);

  // تاريخ مثل 2026-02-31 يزحف إلى آذار؛ نرفضه بدل أن نعدّ من يوم لم يوجد.
  const w = wallOf(instant);
  if (w.year !== year || w.month !== month || w.day !== day) return null;

  return instant;
}

/** لحظة الصدفة — 25 كانون الثاني 2026. */
export const COINCIDENCE_AT: number | null = parseDamascusDate(COINCIDENCE);

/** لحظة أول حديث — 21 آذار 2026. */
export const FIRST_TALK_AT: number | null = parseDamascusDate(FIRST_TALK);

export interface SinceSnapshot {
  /** أيام كاملة مرّت */
  days: number;
  /** والباقي، مقسّماً */
  hours: number;
  minutes: number;
  seconds: number;
  /** المجموع بالميلي ثانية */
  total: number;
}

/**
 * كم مرّ من لحظة معيّنة حتى الآن.
 * نقصّ القيم السالبة إلى صفر، فتاريخ في المستقبل يعرض أصفاراً لا أرقاماً مقلوبة.
 */
export function elapsedSince(from: number | null, at: number = nowMs()): SinceSnapshot | null {
  if (from === null) return null;

  const total = Math.max(0, at - from);
  const s = Math.floor(total / 1000);

  return {
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    total,
  };
}

/** من يوم الصدفة حتى الآن. */
export function sinceCoincidence(at: number = nowMs()): SinceSnapshot | null {
  return elapsedSince(COINCIDENCE_AT, at);
}

/** من يوم ما بلّشنا نحكي حتى الآن. */
export function sinceFirstTalk(at: number = nowMs()): SinceSnapshot | null {
  return elapsedSince(FIRST_TALK_AT, at);
}

/* -------------------------------------------------------------------------
   رسالة اللطافة اليومية
   ------------------------------------------------------------------------- */

export { SWEET_HOUR, SWEET_MINUTE };

/** لحظة رسالة اليوم الذي تقع فيه ساعة الحائط المعطاة. */
function sweetInstantFor(w: Wall): number {
  return instantOfWall(w.year, w.month, w.day, SWEET_HOUR, SWEET_MINUTE);
}

/** لحظة رسالة الغد بالنسبة لساعة الحائط المعطاة. */
function nextDaySweetInstant(w: Wall): number {
  // نتقدّم يوماً بحساب التقويم لا بإضافة 24 ساعة — الأخيرة تنكسر عند تغيير التوقيت.
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day));
  d.setUTCDate(d.getUTCDate() + 1);
  return instantOfWall(
    d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), SWEET_HOUR, SWEET_MINUTE,
  );
}

/** لحظة رسالة اليوم. */
export function sweetInstantToday(at: number = nowMs()): number {
  return sweetInstantFor(wallOf(at));
}

/** لحظة رسالة الغد. */
export function sweetInstantTomorrow(at: number = nowMs()): number {
  return nextDaySweetInstant(wallOf(at));
}

export interface SweetSnapshot {
  /** تاريخ اليوم في دمشق — مفتاح "اليوم" في التخزين */
  dayKey: string;
  /** ميلي ثانية حتى الرسالة القادمة (اليوم أو الغد) */
  msUntil: number;
  /** هل موعد اليوم قد مضى؟ */
  passed: boolean;
  /** أجزاء العدّاد للعرض */
  parts: { hours: number; minutes: number; seconds: number };
}

/** حالة رسالة اللطافة الآن — للعرض داخل قسمها. */
export function sweetSnapshot(at: number = nowMs()): SweetSnapshot {
  const w = wallOf(at);
  const today = sweetInstantFor(w);
  const passed = today <= at;
  const target = passed ? nextDaySweetInstant(w) : today;
  const ms = Math.max(0, target - at);
  const s = Math.floor(ms / 1000);

  return {
    dayKey: `${w.year}-${pad2(w.month)}-${pad2(w.day)}`,
    msUntil: ms,
    passed,
    parts: {
      hours: Math.floor(s / 3600),
      minutes: Math.floor((s % 3600) / 60),
      seconds: s % 60,
    },
  };
}

/* -------------------------------------------------------------------------
   صياغة عربية
   ------------------------------------------------------------------------- */

/** "11:00 صباحاً" — للعرض. */
export function sweetLabelAr(): string {
  const suffix = SWEET_HOUR < 12 ? 'صباحاً' : 'مساءً';
  const h12 = SWEET_HOUR % 12 === 0 ? 12 : SWEET_HOUR % 12;
  return `${h12}:${pad2(SWEET_MINUTE)} ${suffix}`;
}

/** يوم / يومين / ٣ أيام / ١٥ يوم */
export function daysAr(n: number): string {
  if (n === 0) return 'اليوم';
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومين';
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوم`;
}

/** ساعة / ساعتين / ٣ ساعات / ١٥ ساعة */
export function hoursAr(n: number): string {
  if (n === 1) return 'ساعة';
  if (n === 2) return 'ساعتين';
  if (n >= 3 && n <= 10) return `${n} ساعات`;
  return `${n} ساعة`;
}

/** دقيقة / دقيقتين / ٣ دقائق / ١٥ دقيقة */
export function minutesAr(n: number): string {
  if (n === 1) return 'دقيقة واحدة';
  if (n === 2) return 'دقيقتين';
  if (n >= 3 && n <= 10) return `${n} دقائق`;
  return `${n} دقيقة`;
}

/** وصف مقروء للمدة — يُستخدم في aria-live بدل الأرقام المتغيّرة كل ثانية. */
export function humanSince(s: SinceSnapshot): string {
  if (s.days > 0) return `${daysAr(s.days)} و${hoursAr(s.hours)}`;
  if (s.hours > 0) return `${hoursAr(s.hours)} و${minutesAr(s.minutes)}`;
  if (s.minutes > 0) return minutesAr(s.minutes);
  return 'أقل من دقيقة';
}

/** وصف مقروء للوقت المتبقّي لرسالة اللطافة. */
export function humanRemaining(p: SweetSnapshot['parts']): string {
  if (p.hours > 0) return `${hoursAr(p.hours)} و${minutesAr(p.minutes)}`;
  if (p.minutes > 0) return minutesAr(p.minutes);
  return 'أقل من دقيقة';
}

/** تاريخ عربي مقروء: "25 كانون الثاني 2025". */
const MONTHS_AR = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
];

export function dateAr(instant: number | null): string | null {
  if (instant === null) return null;
  const w = wallOf(instant);
  return `${w.day} ${MONTHS_AR[w.month - 1]} ${w.year}`;
}
