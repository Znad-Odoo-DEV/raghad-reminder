/**
 * store.ts — الحالة المحفوظة محلياً (بدون backend)
 *
 * سجل واحد لكل يوم تقويمي. فتح الموقع في يوم جديد يصفّر كل شيء تلقائياً، لأن
 * الـ`dayKey` المحفوظ لم يعد يطابق يوم دمشق الحالي.
 *
 * الاستثناء الوحيد `surpriseSeen`: هي لحظة لا تتكرّر، فلا يصحّ أن يمحوها
 * انقلاب اليوم — لها مفتاح مستقل خارج سجل اليوم.
 *
 * لا شيء من هذا يخرج من جهاز رغد: لا سيرفر، لا حساب، لا تتبّع.
 */

import { dayKeyOf, nowMs, wallOf } from './schedule';

const KEY = 'raghd:day:v2';
const STREAK_KEY = 'raghd:visits:v1';
const SURPRISE_KEY = 'raghd:surprise-seen:v1';

export interface DayState {
  /** YYYY-MM-DD بتوقيت دمشق — إذا اختلف عن اليوم الحالي نبدأ من الصفر */
  dayKey: string;
  /** كم مرة نقرت على القلب (easter egg) */
  heartTaps: number;
  /** كم مرة حاولت تفتح الظرف وهو مقفول */
  lockTaps: number;
}

export interface StreakState {
  /** عدد الأيام المتتالية التي فتحت فيها الموقع */
  count: number;
  /** آخر يوم مسجّل */
  lastDay: string | null;
}

function blank(dayKey: string): DayState {
  return { dayKey, heartTaps: 0, lockTaps: 0 };
}

/**
 * مفاتيح النسخ السابقة من الموقع. لا شيء يقرأها بعد اليوم، لكنها تبقى معلّقة
 * في متصفح رغد إلى الأبد إن لم نحذفها — فنحذفها مرة واحدة عند الإقلاع.
 */
const RETIRED_KEYS = [
  'raghd:dose:v1',
  'raghd:streak:v1',
  'raghd:notified:v2',
  'raghd:grace:v1',
  'raghd:sweet-sent:v1',
];

export function dropRetiredKeys(): void {
  try {
    for (const k of RETIRED_KEYS) localStorage.removeItem(k);
  } catch {
    /* وضع التصفح الخاص — لا يوجد ما يُحذف أصلاً */
  }
}

/** localStorage يرمي استثناءً في وضع التصفح الخاص — نتعامل معه بهدوء. */
function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* الموقع يظل يعمل، فقط لن يتذكّر */
  }
}

/** يقرأ حالة اليوم، ويعيد التصفير تلقائياً عند بداية يوم جديد. */
export function loadDay(): DayState {
  const today = dayKeyOf();
  const saved = safeRead<Partial<DayState>>(KEY);

  if (!saved || saved.dayKey !== today) return blank(today);

  return {
    dayKey: today,
    heartTaps: Number(saved.heartTaps) || 0,
    lockTaps: Number(saved.lockTaps) || 0,
  };
}

export function saveDay(state: DayState): void {
  safeWrite(KEY, state);
}

export function patchDay(patch: Partial<DayState>): DayState {
  const next = { ...loadDay(), ...patch };
  saveDay(next);
  return next;
}

/* ---- المفاجأة: هل شافتها من قبل؟ ---------------------------------------- */

export function surpriseSeen(): boolean {
  try {
    return localStorage.getItem(SURPRISE_KEY) === '1';
  } catch {
    // لا نقدر أن نتذكّر → نعتبرها لم تُرَ، فتحصل على الاحتفال في كل زيارة.
    // احتفال زائد أرحم من لحظة انكشاف ضائعة.
    return false;
  }
}

export function markSurpriseSeen(): void {
  try {
    localStorage.setItem(SURPRISE_KEY, '1');
  } catch {
    /* noop */
  }
}

/* ---- سلسلة الزيارات: كم يوم متتالي فتحت فيه رغد الموقع ------------------ */

export function loadStreak(): StreakState {
  const saved = safeRead<Partial<StreakState>>(STREAK_KEY);
  return {
    count: Number(saved?.count) || 0,
    lastDay: typeof saved?.lastDay === 'string' ? saved.lastDay : null,
  };
}

/** يزيد السلسلة مرة واحدة فقط لكل يوم. */
export function bumpStreak(today: string = dayKeyOf()): StreakState {
  const s = loadStreak();
  if (s.lastDay === today) return s;

  // "أمس" بتقويم دمشق — لا بطرح 24 ساعة من لحظة مطلقة.
  const yesterday = (() => {
    const w = wallOf(nowMs());
    const d = new Date(Date.UTC(w.year, w.month - 1, w.day));
    d.setUTCDate(d.getUTCDate() - 1);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  })();

  const next: StreakState = {
    count: s.lastDay === yesterday ? s.count + 1 : 1,
    lastDay: today,
  };
  safeWrite(STREAK_KEY, next);
  return next;
}

/** يمسح كل شيء — تستخدمه لوحة الاختبار المخفية. */
export function resetAll(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(STREAK_KEY);
    localStorage.removeItem(SURPRISE_KEY);
  } catch {
    /* noop */
  }
}
