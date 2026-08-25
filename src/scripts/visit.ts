/**
 * visit.ts — تسجيل فتحة الصفحة
 *
 * ما يُرسَل: وقت الفتح، ومعرّف عشوائي يُولَّد مرة واحدة لكل متصفّح.
 * ما لا يُرسَل: لا اسم، لا موقع، لا بصمة متصفّح، ولا أي شيء عن المحتوى.
 *
 * المعرّف يفيد لشيء واحد: تمييز جهاز عن جهاز في السجل. لا يدلّ على أحد، ويزول
 * بمسح بيانات الموقع.
 *
 * كل هذا يتوقّف على `PUSH.endpoint`: بلا Worker لا يُرسَل شيء إطلاقاً.
 */

import { PUSH } from '../site.config';

const ID_KEY = 'raghd:did';

/** معرّف عشوائي قصير، يُولَّد مرة ويبقى. */
function deviceId(): string {
  try {
    const saved = localStorage.getItem(ID_KEY);
    if (saved) return saved;

    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(ID_KEY, id);
    return id;
  } catch {
    // وضع التصفح الخاص — فتحة بلا هوية، وهذا مقبول
    return 'anon';
  }
}

/**
 * يسجّل الفتحة ولا ينتظرها.
 *
 * `keepalive` يجعل الطلب ينجو لو أغلقت الصفحة بعده مباشرة، وأي فشل يُبتلع:
 * تسجيل الزيارة ليس سبباً كافياً لإزعاجها بخطأ.
 */
export function logVisit(): void {
  if (!PUSH.endpoint) return;

  try {
    void fetch(`${PUSH.endpoint.replace(/\/+$/, '')}/visit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: deviceId() }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* noop */
  }
}
