/**
 * notify.ts — رسالة اللطافة اليومية
 *
 * الجدول: إشعار واحد كل يوم عند 11:00 بتوقيت دمشق. واحد فقط — هذا موقع ترقّب
 * لا نظام إلحاح، وجملة حلوة واحدة تكفي.
 *
 * ما يستطيعه موقع ثابت بلا سيرفر، وما لا يستطيعه:
 *  ✅ الإشعار اليومي — بينما الصفحة مفتوحة (ولو في الخلفية).
 *  ❌ والمتصفح مغلق تماماً — يحتاج Web Push، وWeb Push يحتاج سيرفر يرسل
 *     الدفعة في وقتها. لا يوجد API قياسي لجدولة تنبيه محلي مستقبلي
 *     (اقتراح Notification Triggers لم يصل إلى أي متصفح مستقر).
 *     لذلك نفس الموعد مكرّر في ملف التقويم .ics، وهناك ينفّذه الهاتف نفسه.
 *
 * ملاحظة تقنية: على أندرويد/كروم يرمي `new Notification()` استثناءً؛ الطريق
 * الوحيد هو registration.showNotification()، ولهذا نسجّل عامل خدمة.
 */

import { dayKeyOf, nowMs, sweetInstantToday, sweetInstantTomorrow, sweetLabelAr } from './schedule';
import { DAILY } from './copy';

const LOG_KEY = 'raghd:daily-sent:v1';

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
    // `updateViaCache: 'none'` يمنع قراءة سكربت العامل نفسه من كاش HTTP.
    // بدونه قد لا يرى المتصفّح إصداراً جديداً من العامل أصلاً، فيبقى يخدم
    // نسخة قديمة من الموقع.
    swReg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
      updateViaCache: 'none',
    });
    void swReg.update();
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

/** آخر يوم أُرسلت فيه الرسالة — إشعار واحد لكل يوم، لا أكثر. */
function lastSentDay(): string | null {
  try {
    return localStorage.getItem(LOG_KEY);
  } catch {
    return null;
  }
}

function markSent(day: string): void {
  try {
    localStorage.setItem(LOG_KEY, day);
  } catch {
    /* noop */
  }
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
    tag,
    renotify: true,
  } as NotificationOptions);
}

/** تنبيه تجريبي فوري — ليطمئن أن الأمر يعمل. */
export async function showTest(): Promise<void> {
  const reg = swReg ?? (await registerWorker());
  if (!reg) return;
  await reg.showNotification(DAILY.title, {
    body: DAILY.test,
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    lang: 'ar',
    dir: 'rtl',
    tag: 'raghd-daily-test',
  } as NotificationOptions);
}

/* ---------------------------------------------------------- الجدولة */

/**
 * يجدول رسالة الغد، ويطلق رسالة اليوم إن فات وقتها ولم تُرسل.
 *
 * يُستدعى عند الإقلاع وعند العودة إلى التبويب — لأن مؤقتات الخلفية على
 * الموبايل تُخنق أو تُقتل، فلا نعتمد على المؤقّت وحده.
 */
export function schedule(): void {
  window.clearTimeout(timer);
  if (state() !== 'granted') return;

  const now = nowMs();
  const today = dayKeyOf(now);
  const at = sweetInstantToday(now);

  if (at <= now) {
    // فات موعد اليوم — أطلقه الآن إن لم يكن قد أُرسل، ثم انتقل للغد.
    if (lastSentDay() !== today) {
      markSent(today);
      void show(DAILY.title, DAILY.line, 'raghd-daily');
    }
    arm(sweetInstantTomorrow(now) - now);
    return;
  }

  arm(at - now, today);
}

function arm(wait: number, dayToSend?: string): void {
  // setTimeout ينهار عند تجاوز حدّ 32 بت. أقصى انتظار هنا أقل من 48 ساعة،
  // لكن نحرس على أي حال.
  if (wait <= 0 || wait >= 2_147_483_647) return;

  timer = window.setTimeout(() => {
    if (dayToSend && lastSentDay() !== dayToSend) {
      markSent(dayToSend);
      void show(DAILY.title, DAILY.line, 'raghd-daily');
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
    at: sweetInstantToday(now),
    label: sweetLabelAr(),
    lastSent: lastSentDay(),
    line: DAILY.line,
  };
}
