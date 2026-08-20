/* eslint-env serviceworker */
/**
 * sw.js — عامل الخدمة
 *
 * يخدم غرضين:
 *  1. إظهار التنبيهات — على أندرويد/كروم لا يعمل `new Notification()` إطلاقاً،
 *     والطريق الوحيد هو registration.showNotification() من هنا.
 *  2. تشغيل الموقع بدون إنترنت بعد أول زيارة.
 *
 * سياسة التخزين: ملفات _astro تحمل بصمة في اسمها فهي ثابتة إلى الأبد
 * (cache-first)، وكل ما عداها network-first حتى لا تعلق نسخة قديمة أبداً.
 */

const VERSION = 'raghd-v2';
const CACHE = `raghd-${VERSION}`;

/** جذر التطبيق — يصح في "/" وفي "/raghad-reminder/" على السواء. */
const BASE = new URL('./', self.location).href;

const PRECACHE = [BASE, `${BASE}manifest.webmanifest`, `${BASE}icon-192.png`];

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

/** النقر على التنبيه يفتح الموقع أو يركّز التبويب المفتوح. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if (client.url.startsWith(BASE) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(BASE);
    })(),
  );
});
