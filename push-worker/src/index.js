/**
 * push-worker — نقطة استقبال اشتراكات Web Push
 *
 * GitHub Pages يخدم ملفات ثابتة ولا يستقبل POST، ومتصفّح رغد يولّد اشتراكاً
 * لا بدّ أن يصل إلينا لنستطيع الإرسال إليها لاحقاً. هذا الـWorker هو تلك
 * النقطة، ولا يفعل شيئاً غيرها: يخزّن ويحذف ويسلّم القائمة.
 *
 * **لا يُرسل الإشعارات.** الإرسال يحتاج المفتاح الخاص، وهو محفوظ في أسرار
 * المستودع ويُستعمل داخل مسار GitHub وحده. إبقاؤه خارج الـWorker يعني أن
 * اختراق الـWorker لا يمنح أحداً القدرة على انتحال إشعارات باسم الموقع.
 *
 * المسارات:
 *   POST   /sub     ← اشتراك جديد (من متصفّح رغد)
 *   DELETE /sub     ← إلغاء اشتراك
 *   GET    /subs    ← قائمة الاشتراكات   (Bearer ADMIN_TOKEN)
 *   POST   /prune   ← حذف اشتراك ميت      (Bearer ADMIN_TOKEN)
 */

const DEFAULT_ORIGIN = 'https://znad-odoo-dev.github.io';

function corsHeaders(env) {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || DEFAULT_ORIGIN,
    'access-control-allow-methods': 'POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}

const json = (body, status, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });

/** مفتاح التخزين: عنوان الاشتراك نفسه — فريد بطبيعته، فلا حاجة إلى تجزئة. */
const keyOf = (endpoint) => `sub:${endpoint}`;

function authorised(request, env) {
  const token = env.ADMIN_TOKEN;
  if (!token) return false;                    // بلا سرّ مضبوط، لا وصول إداري
  return request.headers.get('authorization') === `Bearer ${token}`;
}

/** اشتراك صالح شكلاً: عنوان https ومفتاحان. */
function validSub(sub) {
  return (
    sub &&
    typeof sub.endpoint === 'string' &&
    sub.endpoint.startsWith('https://') &&
    sub.endpoint.length < 800 &&
    sub.keys &&
    typeof sub.keys.p256dh === 'string' &&
    typeof sub.keys.auth === 'string'
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    /* ---- تسجيل اشتراك ---- */
    if (url.pathname === '/sub' && request.method === 'POST') {
      let sub;
      try {
        sub = await request.json();
      } catch {
        return json({ error: 'bad json' }, 400, cors);
      }
      if (!validSub(sub)) return json({ error: 'bad subscription' }, 400, cors);

      await env.SUBS.put(
        keyOf(sub.endpoint),
        JSON.stringify({ ...sub, savedAt: new Date().toISOString() }),
      );
      return json({ ok: true }, 200, cors);
    }

    /* ---- إلغاء اشتراك ---- */
    if (url.pathname === '/sub' && request.method === 'DELETE') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'bad json' }, 400, cors);
      }
      if (typeof body?.endpoint !== 'string') return json({ error: 'no endpoint' }, 400, cors);

      await env.SUBS.delete(keyOf(body.endpoint));
      return json({ ok: true }, 200, cors);
    }

    /* ---- قائمة الاشتراكات (إداري) ---- */
    if (url.pathname === '/subs' && request.method === 'GET') {
      if (!authorised(request, env)) return json({ error: 'unauthorised' }, 401);

      const out = [];
      let cursor;
      do {
        const page = await env.SUBS.list({ prefix: 'sub:', cursor });
        for (const k of page.keys) {
          const raw = await env.SUBS.get(k.name);
          if (raw) out.push(JSON.parse(raw));
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);

      return json(out, 200);
    }

    /* ---- حذف اشتراك ميت (إداري) ---- */
    if (url.pathname === '/prune' && request.method === 'POST') {
      if (!authorised(request, env)) return json({ error: 'unauthorised' }, 401);

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'bad json' }, 400);
      }
      if (typeof body?.endpoint !== 'string') return json({ error: 'no endpoint' }, 400);

      await env.SUBS.delete(keyOf(body.endpoint));
      return json({ ok: true }, 200);
    }

    return json({ error: 'not found' }, 404);
  },
};
