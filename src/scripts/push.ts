/**
 * push.ts — Web Push: الإشعار الذي يصل والمتصفّح مغلق تماماً
 *
 * الفرق عن notify.ts: ذاك يجدول بـ`setTimeout` فلا يعمل إلا والصفحة مفتوحة.
 * هذا يسجّل اشتراكاً لدى خدمة الدفع في متصفّح رغد، فيستطيع إبراهيم أن يرسل لها
 * إشعاراً في أي وقت — والموبايل مقفول والمتصفّح مسكّر.
 *
 * ثلاث قطع لا تعمل واحدة بلا الأخرى:
 *   1. هنا — يطلب الإذن ويولّد الاشتراك ويرسله إلى الـWorker.
 *   2. الـWorker (`push-worker/`) — يخزّن الاشتراك.
 *   3. مسار GitHub (`.github/workflows/send-push.yml`) — يوقّع بالمفتاح الخاص
 *      ويرسل الدفعة.
 *
 * ما دام `PUSH.endpoint` فارغاً لا يحدث أي من هذا، ويبقى الموقع سليماً.
 */

import { PUSH } from '../site.config';

const LOCAL_KEY = 'raghd:push-sub:v1';

/** هل الجهاز يدعم Web Push أصلاً؟ */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext
  );
}

/** هل ضُبط عنوان الـWorker؟ بدونه لا معنى للاشتراك. */
export function pushConfigured(): boolean {
  return PUSH.endpoint.length > 0 && PUSH.publicKey.length > 0;
}

/**
 * مفتاح VAPID العام يصل كنص base64url، وواجهة `subscribe` تريد بايتات خام.
 * base64url يستبدل `+/` بـ`-_` ويحذف الحشو، فنعيدهما قبل فكّ الترميز.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** يتذكّر أننا سلّمنا هذا الاشتراك، فلا نُتعب الـWorker في كل زيارة. */
function rememberedEndpoint(): string | null {
  try {
    return localStorage.getItem(LOCAL_KEY);
  } catch {
    return null;
  }
}

function remember(endpoint: string | null): void {
  try {
    if (endpoint) localStorage.setItem(LOCAL_KEY, endpoint);
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* وضع التصفح الخاص — سنعيد التسليم في الزيارة القادمة، وهو غير ضارّ */
  }
}

/** يسلّم الاشتراك إلى الـWorker. يرجع true إن قَبِله. */
async function deliver(sub: PushSubscription): Promise<boolean> {
  try {
    const res = await fetch(`${PUSH.endpoint.replace(/\/+$/, '')}/sub`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * يشترك في Push إن لم يكن مشتركاً، ويسلّم الاشتراك.
 *
 * يُستدعى بعد منح الإذن. آمن للاستدعاء المتكرّر: إن كان الاشتراك قائماً
 * يُعاد استخدامه، ولا يُعاد التسليم إلا إذا تغيّر العنوان — وخدمات الدفع
 * تدوّر العناوين أحياناً، فالمقارنة ضرورية لا زائدة.
 */
export async function subscribe(reg: ServiceWorkerRegistration): Promise<boolean> {
  if (!pushSupported() || !pushConfigured()) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUSH.publicKey) as BufferSource,
      });
    }

    if (sub.endpoint === rememberedEndpoint()) return true;

    const ok = await deliver(sub);
    if (ok) remember(sub.endpoint);
    return ok;
  } catch {
    return false;
  }
}

/** يلغي الاشتراك ويبلّغ الـWorker ليحذفه. */
export async function unsubscribe(reg: ServiceWorkerRegistration): Promise<void> {
  try {
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    if (pushConfigured()) {
      await fetch(`${PUSH.endpoint.replace(/\/+$/, '')}/sub`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => undefined);
    }

    await sub.unsubscribe();
    remember(null);
  } catch {
    /* noop */
  }
}

/** هل هي مشتركة فعلاً الآن؟ للعرض فقط. */
export async function isSubscribed(reg: ServiceWorkerRegistration): Promise<boolean> {
  try {
    return (await reg.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}
