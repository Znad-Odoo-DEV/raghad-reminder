/**
 * notify.ts — تنبيه المتصفح
 *
 * الجدول: يبدأ قبل الموعد بخمس دقائق، ثم تنبيه كل دقيقة حتى الموعد نفسه.
 * أي ٦ تنبيهات: 10:55 · 10:56 · 10:57 · 10:58 · 10:59 · 11:00 بتوقيت دمشق.
 * كل واحد يُرسل مرة واحدة فقط في اليوم، ويتوقّف الباقي فور تسجيل الجرعة.
 *
 * ما يستطيعه موقع ثابت بلا سيرفر، وما لا يستطيعه:
 *  ✅ هذا الجدول كاملاً — بينما الصفحة مفتوحة (ولو في الخلفية).
 *  ❌ والمتصفح مغلق تماماً — يحتاج Web Push، وWeb Push يحتاج سيرفر يرسل
 *     الدفعة في وقتها. لا يوجد API قياسي لجدولة تنبيه محلي مستقبلي
 *     (اقتراح Notification Triggers لم يصل إلى أي متصفح مستقر).
 *     لذلك نفس الجدول مكرّر في ملف التقويم .ics، وهناك ينفّذه الهاتف نفسه.
 *
 * ملاحظة تقنية: على أندرويد/كروم يرمي `new Notification()` استثناءً؛ الطريق
 * الوحيد هو registration.showNotification()، ولهذا نسجّل عامل خدمة.
 */

import { snapshot, dayKeyOf, nowMs, doseInstantToday, doseInstantTomorrow } from './schedule';
import { loadDay } from './store';

/** نبدأ التنبيه قبل الموعد بهذا العدد من الدقائق. */
export const LEAD_MINUTES = 5;

/** عدد التنبيهات: من (الموعد − 5 دقائق) حتى الموعد، واحد كل دقيقة. */
export const PING_COUNT = LEAD_MINUTES + 1;

const LOG_KEY = 'raghd:notified:v2';

export type NotifyState = 'unsupported' | 'default' | 'granted' | 'denied';

let swReg: ServiceWorkerRegistration | null = null;
let timer = 0;

/* ------------------------------------------------------------------ الدعم */

export function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    window.isSecureContext
  );
}

export function state(): NotifyState {
  if (!supported()) return 'unsupported';
  return Notification.permission as NotifyState;
}

/* ------------------------------------------------- تسجيل عامل الخدمة */

export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  try {
    swReg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    });
    return swReg;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------- الإذن */

export async function requestPermission(): Promise<NotifyState> {
  if (!supported()) return 'unsupported';
  try {
    const res = await Notification.requestPermission();
    if (res === 'granted') {
      await registerWorker();
      schedule();
    }
    return res as NotifyState;
  } catch {
    return state();
  }
}

/* ------------------------------------------------------ سجلّ ما أُرسل */

interface SentLog {
  day: string;
  /** أرقام التنبيهات التي أُرسلت اليوم (0 = قبل ٥ دقائق … 5 = وقت الموعد) */
  sent: number[];
}

function readLog(): SentLog {
  const today = dayKeyOf();
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SentLog>) : null;
    if (parsed && parsed.day === today && Array.isArray(parsed.sent)) {
      return { day: today, sent: parsed.sent.filter((n) => typeof n === 'number') };
    }
  } catch {
    /* تجاهل */
  }
  return { day: today, sent: [] };
}

function markSent(index: number): void {
  const log = readLog();
  if (log.sent.includes(index)) return;
  log.sent.push(index);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    /* noop */
  }
}

/* ------------------------------------------------------------ الجدول */

/**
 * لحظات التنبيه لليوم الحالي.
 * index 0 → الموعد − 5 دقائق … index 5 → الموعد بالضبط.
 */
function pingsFor(dose: number): number[] {
  return Array.from(
    { length: PING_COUNT },
    (_, i) => dose - (LEAD_MINUTES - i) * 60_000,
  );
}

/** نصّ كل تنبيه — يتصاعد كلما اقترب الموعد. */
function copyFor(index: number): { title: string; body: string } {
  const left = LEAD_MINUTES - index;
  if (left >= 3) {
    return {
      title: `💊 باقي ${left} دقايق على الدوا`,
      body: 'تحضّري. مو لازم تركضي، بس مو لازم تنسي.',
    };
  }
  if (left === 2) {
    return { title: '💊 باقي دقيقتين على الدوا', body: 'قرّبنا. جهّزي حالك.' };
  }
  if (left === 1) {
    return { title: '💊 باقي دقيقة وحدة', body: 'جهّزي الحبة. الوقت قرب.' };
  }
  return {
    title: '💊 وقت الدوا يا رغد',
    body: 'الساعة 11:00. الدوا عم يستنى. بلا مفاوضات.',
  };
}

/* ------------------------------------------------------------ الإظهار */

async function show(title: string, body: string, tag: string): Promise<void> {
  if (state() !== 'granted') return;
  const reg = swReg ?? (await navigator.serviceWorker.ready.catch(() => null));
  if (!reg) return;

  await reg.showNotification(title, {
    body,
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icon-192.png`,
    lang: 'ar',
    dir: 'rtl',
    tag,                       // نفس الوسم يستبدل السابق بدل تكديس ٦ تنبيهات
    renotify: true,
    requireInteraction: true,
  } as NotificationOptions);
}

/** تنبيه تجريبي فوري — ليتأكد المستخدم أن الأمر يعمل. */
export async function showTest(): Promise<void> {
  const reg = swReg ?? (await registerWorker());
  if (!reg) return;
  await reg.showNotification('💊 تمام، التنبيه شغّال', {
    body: `رح يوصلك تنبيه كل دقيقة من 10:55 حتى 11:00 — طالما الصفحة مفتوحة.`,
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    lang: 'ar',
    dir: 'rtl',
    tag: 'raghd-test',
  } as NotificationOptions);
}

/* ---------------------------------------------------------- الجدولة */

/**
 * يجدول التنبيه القادم.
 * يُستدعى عند الإقلاع، وبعد كل إطلاق، وعند العودة إلى التبويب — لأن مؤقتات
 * الخلفية على الموبايل تُخنق أو تُقتل، فلا نعتمد على المؤقّت وحده.
 */
export function schedule(): void {
  window.clearTimeout(timer);
  if (state() !== 'granted') return;

  const day = loadDay();
  const now = nowMs();

  // أُخذت الجرعة → لا تنبيهات اليوم، ننتقل لجرعة الغد.
  if (day.taken) {
    armFor(doseInstantTomorrow(now) - now);
    return;
  }

  const dose = doseInstantToday(now);
  const pings = pingsFor(dose);
  const log = readLog();

  // أطلِق كل ما فات وقته ولم يُرسل — يغطّي حالة فتح الصفحة متأخرة أو
  // بعد أن خنق النظام المؤقّت.
  let firedNow = false;
  for (let i = 0; i < pings.length; i++) {
    if (pings[i]! <= now && !log.sent.includes(i)) {
      // نرسل الأحدث فقط حتى لا ننفجر بستة تنبيهات دفعة واحدة.
      firedNow = true;
      markSent(i);
    }
  }
  if (firedNow) {
    const lastIndex = pings.reduce((acc, t, i) => (t <= now ? i : acc), 0);
    const c = copyFor(lastIndex);
    void show(c.title, c.body, 'raghd-dose');
  }

  // ثم جدولة أول تنبيه لم يحن وقته بعد.
  const nextIndex = pings.findIndex((t, i) => t > now && !readLog().sent.includes(i));
  if (nextIndex !== -1) {
    armFor(pings[nextIndex]! - now, nextIndex);
    return;
  }

  // انتهى جدول اليوم → انتظر جرعة الغد.
  armFor(doseInstantTomorrow(now) - now);
}

function armFor(wait: number, index?: number): void {
  if (wait <= 0 || wait >= 2_147_483_647) return;
  timer = window.setTimeout(() => {
    if (index !== undefined && !loadDay().taken) {
      markSent(index);
      const c = copyFor(index);
      void show(c.title, c.body, 'raghd-dose');
    }
    schedule();
  }, wait + 300);
}

/** إعادة المزامنة عند العودة للتبويب — يعالج خنق المؤقّتات على الموبايل. */
export function initResync(): void {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule();
  });
  window.addEventListener('focus', schedule);
}

/** للتشخيص أثناء الاختبار. */
export function debugInfo() {
  const now = nowMs();
  return {
    state: state(),
    now,
    dose: doseInstantToday(now),
    pings: pingsFor(doseInstantToday(now)),
    log: readLog(),
    snapshot: snapshot(loadDay().taken, now).phase,
  };
}
