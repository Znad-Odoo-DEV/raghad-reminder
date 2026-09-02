/* eslint-env serviceworker */
/**
 * sw.js — عامل الخدمة
 *
 * يخدم ثلاثة أغراض:
 *  1. استقبال Web Push — هذا هو الطريق الوحيد لإشعار يصل والمتصفّح مغلق تماماً.
 *  2. إظهار التنبيهات المحلية — على أندرويد/كروم لا يعمل `new Notification()`
 *     إطلاقاً، والطريق الوحيد هو registration.showNotification() من هنا.
 *  3. تشغيل الموقع بدون إنترنت بعد أول زيارة.
 *
 * سياسة التخزين: ملفات _astro تحمل بصمة في اسمها فهي ثابتة إلى الأبد
 * (cache-first)، وكل ما عداها network-first حتى لا تعلق نسخة قديمة أبداً.
 */

// v30: ورق الملوخية صار صورةً حقيقية، وصحن الملوخية على قصاصته.
//
// القاعدة: كل تغيير في الهيكل المخزَّن يرفع هذا الرقم. نسيانه يعني أن متصفّحاً
// زار الموقع من قبل يبقى على النسخة القديمة.
const VERSION = 'raghd-v30';
const CACHE = `raghd-${VERSION}`;

/** جذر التطبيق — يصح في "/" وفي "/raghad-reminder/" على السواء. */
const BASE = new URL('./', self.location).href;

const PRECACHE = [BASE, `${BASE}manifest.webmanifest`, `${BASE}icon-192.png`, `${BASE}leaves.png`];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // نضيف كل رابط على حدة: فشل واحد يجب ألا يُسقط التثبيت كله.
      await Promise.all(
        PRECACHE.map((url) => cache.add(url).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // نتجاهل كل نطاق خارجي — الخطوط والإحصائيات تدير تخزينها بنفسها،
  // واعتراضها هنا قد يُفسد العدّ.
  if (url.origin !== self.location.origin) return;

  // أصول مبصومة — لا تتغيّر أبداً تحت نفس الاسم.
  if (url.pathname.includes('/_astro/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  /**
   * التنقّل: اطلب الشبكة متجاوزاً كاش المتصفّح.
   *
   * `network-first` وحده لا يكفي: طلب الشبكة نفسه قد يُخدَم من كاش HTTP
   * (‎max-age=600‎ على GitHub Pages)، فتصل صفحة قديمة رغم أننا "ذهبنا للشبكة".
   * `cache: 'reload'` يفرض طلباً حقيقياً.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request.url, { cache: 'reload' });
          if (fresh.ok) {
            const copy = fresh.clone();
            caches.open(CACHE).then((c) => c.put(BASE, copy));
          }
          return fresh;
        } catch {
          const shell = await caches.match(BASE);
          if (shell) return shell;
          throw new Error('offline and not cached');
        }
      })(),
    );
    return;
  }

  // الباقي: الشبكة أولاً، والذاكرة شبكة أمان.
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(request);
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      } catch {
        const hit = await caches.match(request);
        if (hit) return hit;
        if (request.mode === 'navigate') {
          const shell = await caches.match(BASE);
          if (shell) return shell;
        }
        throw new Error('offline and not cached');
      }
    })(),
  );
});

/**
 * وصول دفعة Push.
 *
 * المواصفة تُلزم بإظهار إشعار مرئي عند كل دفعة (`userVisibleOnly`)، وإلا عاقب
 * المتصفح الموقع وألغى اشتراكه. لذلك نُظهر إشعاراً في كل الحالات — حتى لو جاءت
 * الحمولة فارغة أو غير صالحة، فلها نصّ احتياطي.
 */
self.addEventListener('push', (event) => {
  const fallback = {
    title: 'رغد 🤍',
    body: 'صباح الخير لألطف مين رح يحضر عرس بفستان جديد 👗',
    url: BASE,
  };

  let data = fallback;
  if (event.data) {
    try {
      data = { ...fallback, ...event.data.json() };
    } catch {
      // حمولة نصّية لا JSON — نعتبرها جسم الإشعار
      data = { ...fallback, body: event.data.text() || fallback.body };
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: `${BASE}icon-192.png`,
      badge: `${BASE}icon-192.png`,
      lang: 'ar',
      dir: 'rtl',
      tag: data.tag || 'raghd-push',
      renotify: true,
      data: { url: data.url || BASE },
    }),
  );
});

/** النقر على التنبيه يفتح الموقع أو يركّز التبويب المفتوح. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || BASE;

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if (client.url.startsWith(BASE) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })(),
  );
});
