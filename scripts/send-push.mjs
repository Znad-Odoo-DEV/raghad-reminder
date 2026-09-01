/**
 * send-push.mjs — يرسل إشعار Web Push إلى كل اشتراك مخزّن
 *
 * يُشغَّل من مسار GitHub (`.github/workflows/send-push.yml`) أو محلياً.
 * المفتاح الخاص يبقى هنا فقط: الـWorker يخزّن الاشتراكات ولا يملك القدرة على
 * الإرسال، فاختراقه لا يمنح أحداً انتحال إشعارات باسم الموقع.
 *
 * المتغيّرات المطلوبة:
 *   VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · PUSH_WORKER_URL · PUSH_ADMIN_TOKEN
 *
 * النصّ يأتي من البيئة (`PUSH_TITLE` · `PUSH_BODY` · `PUSH_URL`) أو من الوسائط.
 * البيئة أولاً لأن تمرير نصّ عربي حرّ داخل سطر أمر في GitHub Actions يفتح باب
 * حقن أوامر shell.
 *
 * الاستعمال محلياً:
 *   PUSH_BODY="..." node scripts/send-push.mjs
 */
import webpush from 'web-push';

const {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  PUSH_WORKER_URL,
  PUSH_ADMIN_TOKEN,
} = process.env;

const missing = Object.entries({
  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_WORKER_URL, PUSH_ADMIN_TOKEN,
}).filter(([, v]) => !v).map(([k]) => k);

if (missing.length) {
  console.error(`ناقص: ${missing.join(', ')}`);
  process.exit(1);
}

const SITE = 'https://znad-odoo-dev.github.io/raghad-reminder/';

const title = process.env.PUSH_TITLE || process.argv[2] || 'رغد 🤍';
const body = process.env.PUSH_BODY || process.argv[3] || 'في مفاجأة عم تتحضر على نار هادية';
const url = process.env.PUSH_URL || process.argv[4] || SITE;

// الموضوع يجب أن يكون mailto: أو https: — نستعمل عنوان الموقع نفسه فلا يُرسل
// أي بريد شخصي إلى خدمات الدفع.
webpush.setVapidDetails(SITE, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const base = PUSH_WORKER_URL.replace(/\/+$/, '');
const auth = { authorization: `Bearer ${PUSH_ADMIN_TOKEN}` };

const res = await fetch(`${base}/subs`, { headers: auth });
if (!res.ok) {
  console.error(`تعذّر جلب الاشتراكات: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const subs = await res.json();
if (!Array.isArray(subs) || subs.length === 0) {
  console.error('ما في ولا اشتراك مخزّن — لازم رغد تفتح الموقع وتعطي الإذن أول.');
  process.exit(1);
}

console.log(`اشتراكات: ${subs.length}`);
console.log(`العنوان : ${title}`);
console.log(`الجسم   : ${body}`);

// وسم فريد لكل إرسال.
// الوسم الثابت يجعل الإشعار الجديد يحلّ محلّ السابق في شريط الإشعارات بدل أن
// يظهر بجانبه — فيبدو وكأن شيئاً لم يصل.
const payload = JSON.stringify({ title, body, url, tag: `raghd-${Date.now()}` });
let sent = 0;
let pruned = 0;

for (const sub of subs) {
  try {
    await webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 24 });
    sent++;
    console.log(`  ✓ ${sub.endpoint.slice(0, 60)}…`);
  } catch (err) {
    const code = err?.statusCode;
    // 404/410 تعني أن الاشتراك مات (أُلغي أو دُوِّر) — نحذفه بدل أن نعيد
    // محاولته إلى الأبد.
    if (code === 404 || code === 410) {
      await fetch(`${base}/prune`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => undefined);
      pruned++;
      console.log(`  ✗ ميت، حُذف (${code})`);
    } else {
      console.log(`  ✗ فشل (${code ?? 'شبكة'}): ${err?.body || err?.message || err}`);
    }
  }
}

console.log(`\nوصل: ${sent} · حُذف الميت: ${pruned}`);
if (sent === 0) process.exit(1);
