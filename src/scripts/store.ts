/**
 * store.ts — الحالة المحفوظة محلياً (بدون backend)
 *
 * One record per calendar day. Opening the site on a new day resets
 * everything automatically, because the stored `dayKey` no longer matches.
 */

import { dayKeyOf, nowMs, wallOf } from './schedule';

const KEY = 'raghd:dose:v1';
const STREAK_KEY = 'raghd:streak:v1';

export interface DayState {
  /** YYYY-MM-DD محلي — إذا اختلف عن اليوم الحالي نبدأ من الصفر */
  dayKey: string;
  /** هل أُخذت جرعة اليوم؟ */
  taken: boolean;
  /** وقت التسجيل (ISO) */
  takenAt: string | null;
  /** كم مرة ضغطت "لسا شوي" اليوم */
  snoozes: number;
  /** كم مرة نقرت على حبة الدواء (easter egg) */
  pillTaps: number;
}

export interface StreakState {
  /** عدد الأيام المتتالية */
  count: number;
  /** آخر يوم مسجّل */
  lastDay: string | null;
}

function blank(dayKey: string): DayState {
  return { dayKey, taken: false, takenAt: null, snoozes: 0, pillTaps: 0 };
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
    taken: Boolean(saved.taken),
    takenAt: typeof saved.takenAt === 'string' ? saved.takenAt : null,
    snoozes: Number(saved.snoozes) || 0,
    pillTaps: Number(saved.pillTaps) || 0,
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

/* ---- السلسلة: كم يوم متتالي أخذت فيه رغد الدوا ------------------------- */

export function loadStreak(): StreakState {
  const saved = safeRead<Partial<StreakState>>(STREAK_KEY);
  return {
    count: Number(saved?.count) || 0,
    lastDay: typeof saved?.lastDay === 'string' ? saved.lastDay : null,
  };
}

/** يزيد السلسلة مرة واحدة فقط لكل يوم. */
export function bumpStreak(today: string): StreakState {
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
  } catch {
    /* noop */
  }
}
