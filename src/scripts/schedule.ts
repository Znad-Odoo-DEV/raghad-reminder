/**
 * schedule.ts — كل ما يخص الوقت
 *
 * Single source of truth for "what time is it, and what does that mean?".
 * Everything else in the app reads a `DoseSnapshot` and never touches Date.
 */

/** موعد الجرعة: 11:00 صباحاً */
export const DOSE_HOUR = 11;
export const DOSE_MINUTE = 0;

/** نافذة السماح: خلال أول 5 دقائق نعتبر الوقت "حان الآن" وليس "متأخرة". */
export const GRACE_MINUTES = 5;

export type Phase = 'before' | 'due' | 'late' | 'taken';

export interface DoseSnapshot {
  /** الحالة الحالية */
  phase: Phase;
  /** التاريخ المحلي بصيغة YYYY-MM-DD — مفتاح "اليوم" في التخزين */
  dayKey: string;
  /** ميلي ثانية حتى الجرعة القادمة (0 إذا حان الوقت أو مرّ) */
  msUntil: number;
  /** ميلي ثانية مرّت منذ الموعد (0 إذا لم يحن بعد) */
  msSince: number;
  /** أجزاء العد التنازلي للعرض */
  parts: { hours: number; minutes: number; seconds: number };
  /** دقائق التأخير (للحالة late) */
  lateMinutes: number;
  /** هل الجرعة القادمة هي جرعة الغد؟ */
  isTomorrow: boolean;
}

/* -------------------------------------------------------------------------
   Time travel — يشغّل "لجنة الدواء العليا" (لوحة الاختبار المخفية)
   Stored in sessionStorage so a refresh keeps the simulation but a new tab
   starts clean. Never affects production users unless they find the egg.
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
    /* private mode — simulation just won't persist */
  }
}

/** الوقت "الآن" بحسب التطبيق (يحترم الإزاحة الاختبارية). */
export function now(): Date {
  return new Date(Date.now() + getOffset());
}

/* ------------------------------------------------------------------------- */

/** مفتاح اليوم بالتوقيت المحلي — لا نستخدم toISOString لأنه UTC. */
export function dayKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** موعد الجرعة في يوم معيّن. */
function doseTimeOn(d: Date): Date {
  const t = new Date(d);
  t.setHours(DOSE_HOUR, DOSE_MINUTE, 0, 0);
  return t;
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
export function snapshot(takenToday: boolean, at: Date = now()): DoseSnapshot {
  const dayKey = dayKeyOf(at);
  const todayDose = doseTimeOn(at);
  const diff = todayDose.getTime() - at.getTime();

  // بعد أخذ الجرعة نعدّ لجرعة الغد.
  if (takenToday) {
    const tomorrow = new Date(at);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const next = doseTimeOn(tomorrow);
    const untilTomorrow = next.getTime() - at.getTime();
    // إن كنا قبل 11 صباحاً واليوم مسجّل، الجرعة القادمة فعلياً اليوم.
    const useToday = diff > 0;
    const ms = useToday ? diff : untilTomorrow;
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

/** "11:00 صباحاً" — للعرض. */
export function doseLabelAr(): string {
  return `${DOSE_HOUR}:${String(DOSE_MINUTE).padStart(2, '0')} صباحاً`;
}

/** يحوّل دقائق إلى صيغة عربية سليمة: دقيقة / دقيقتين / ٣ دقائق / ١٥ دقيقة */
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
