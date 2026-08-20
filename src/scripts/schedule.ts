/**
 * schedule.ts — كل ما يخص الوقت
 *
 * The dose is 11:00 **Damascus time**, every day, no matter where the visitor's
 * device thinks it is. So every calculation here works on absolute instants
 * (epoch ms) and converts to Damascus wall-clock only through Intl — never
 * through the device's local timezone.
 *
 * Syria currently sits on a fixed UTC+3, but that is not hardcoded anywhere:
 * the offset is read from the runtime's timezone database at each instant, so
 * the site stays correct if the rules ever change again.
 */

/** المنطقة الزمنية المرجعية — رغد في سوريا */
export const TIMEZONE = 'Asia/Damascus';

/** موعد الجرعة: 11:00 صباحاً بتوقيت دمشق */
export const DOSE_HOUR = 11;
export const DOSE_MINUTE = 0;

/** نافذة السماح: خلال أول 5 دقائق نعتبر الوقت "حان الآن" وليس "متأخرة". */
export const GRACE_MINUTES = 5;

export type Phase = 'before' | 'due' | 'late' | 'taken';

export interface DoseSnapshot {
  /** الحالة الحالية */
  phase: Phase;
  /** تاريخ اليوم في دمشق بصيغة YYYY-MM-DD — مفتاح "اليوم" في التخزين */
  dayKey: string;
  /** ميلي ثانية حتى الجرعة القادمة (0 إذا حان الوقت أو مرّ) */
  msUntil: number;
  /** ميلي ثانية مرّت منذ الموعد (0 إذا لم يحن بعد) */
  msSince: number;
  /** أجزاء العدّاد للعرض */
  parts: { hours: number; minutes: number; seconds: number };
  /** دقائق التأخير (للحالة late) */
  lateMinutes: number;
  /** هل الجرعة القادمة هي جرعة الغد؟ */
  isTomorrow: boolean;
}

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

/** موعد جرعة اليوم الذي تقع فيه هذه الساعة. */
function doseInstantFor(w: Wall): number {
  return instantOfWall(w.year, w.month, w.day, DOSE_HOUR, DOSE_MINUTE);
}

/** موعد جرعة اليوم التالي لساعة الحائط المعطاة. */
function nextDayDoseInstant(w: Wall): number {
  // نتقدّم يوماً بحساب التقويم لا بإضافة 24 ساعة — الأخيرة تنكسر عند تغيير التوقيت.
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day));
  d.setUTCDate(d.getUTCDate() + 1);
  return instantOfWall(
    d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), DOSE_HOUR, DOSE_MINUTE,
  );
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
   السفر عبر الزمن — يشغّل "لجنة الدواء العليا" (لوحة الاختبار المخفية)
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

/* -------------------------------------------------------------------------
   الحالة
   ------------------------------------------------------------------------- */

/** مفتاح اليوم بتوقيت دمشق — تصفير التخزين يتبع منتصف ليل سوريا. */
export function dayKeyOf(instant: number = nowMs()): string {
  const w = wallOf(instant);
  return `${w.year}-${pad2(w.month)}-${pad2(w.day)}`;
}

function splitDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/**
 * يحسب الحالة الكاملة للحظة الحالية.
 * @param takenToday هل سُجّلت جرعة اليوم؟ (تأتي من التخزين المحلي)
 */
export function snapshot(takenToday: boolean, at: number = nowMs()): DoseSnapshot {
  const w = wallOf(at);
  const dayKey = `${w.year}-${pad2(w.month)}-${pad2(w.day)}`;
  const todayDose = doseInstantFor(w);
  const diff = todayDose - at;

  // بعد أخذ الجرعة نعدّ لجرعة الغد.
  if (takenToday) {
    const useToday = diff > 0;
    const ms = useToday ? diff : nextDayDoseInstant(w) - at;
    return {
      phase: 'taken',
      dayKey,
      msUntil: ms,
      msSince: 0,
      parts: splitDuration(ms),
      lateMinutes: 0,
      isTomorrow: !useToday,
    };
  }

  if (diff > 0) {
    return {
      phase: 'before',
      dayKey,
      msUntil: diff,
      msSince: 0,
      parts: splitDuration(diff),
      lateMinutes: 0,
      isTomorrow: false,
    };
  }

  const since = -diff;
  const lateMinutes = Math.floor(since / 60_000);
  return {
    phase: lateMinutes < GRACE_MINUTES ? 'due' : 'late',
    dayKey,
    msUntil: 0,
    msSince: since,
    parts: splitDuration(since),
    lateMinutes,
    isTomorrow: false,
  };
}

/* -------------------------------------------------------------------------
   صياغة عربية
   ------------------------------------------------------------------------- */

/** "11:00 صباحاً" — للعرض. */
export function doseLabelAr(): string {
  return `${DOSE_HOUR}:${pad2(DOSE_MINUTE)} صباحاً`;
}

/** دقيقة / دقيقتين / ٣ دقائق / ١٥ دقيقة */
export function minutesAr(n: number): string {
  if (n === 1) return 'دقيقة واحدة';
  if (n === 2) return 'دقيقتين';
  if (n >= 3 && n <= 10) return `${n} دقائق`;
  return `${n} دقيقة`;
}

/** نفس القاعدة للساعات. */
export function hoursAr(n: number): string {
  if (n === 1) return 'ساعة';
  if (n === 2) return 'ساعتين';
  if (n >= 3 && n <= 10) return `${n} ساعات`;
  return `${n} ساعة`;
}

/** وصف مقروء للمدة المتبقية — يُستخدم في aria-live بدل الأرقام المتغيّرة. */
export function humanRemaining(p: DoseSnapshot['parts']): string {
  if (p.hours > 0) return `${hoursAr(p.hours)} و${minutesAr(p.minutes)}`;
  if (p.minutes > 0) return minutesAr(p.minutes);
  return 'أقل من دقيقة';
}

/** تأخير مقروء: "23 دقيقة" / "ساعتين و40 دقيقة" — 160 دقيقة ليست جملة عربية. */
export function lateAr(totalMinutes: number): string {
  if (totalMinutes < 60) return minutesAr(totalMinutes);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? hoursAr(h) : `${hoursAr(h)} و${minutesAr(m)}`;
}
