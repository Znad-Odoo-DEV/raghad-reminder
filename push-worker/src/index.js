/**
 * push-worker — نقطة استقبال اشتراكات Web Push، وسجلّ الوزارة
 *
 * GitHub Pages يخدم ملفات ثابتة ولا يستقبل POST، ومتصفّح رغد يولّد اشتراكاً
 * لا بدّ أن يصل إلينا لنستطيع الإرسال إليها لاحقاً. هذا الـWorker هو تلك
 * النقطة — ومعها صار سجلَّ الوزارة: مراسيمها، وقوافي صباح النور، ومخالفات
 * المحكمة، وضغطات زرّ الدعم.
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
 *   POST   /visit   ← تسجيل فتحة للصفحة
 *   GET    /visits  ← سجل الفتحات         (Bearer ADMIN_TOKEN)
 *   POST   /note    ← قيد جديد في سجلّ الوزارة {kind, text}
 *   GET    /notes   ← قيود نوعٍ واحد ?kind=  (العامّة بلا توكن، والدعم بتوكن)
 *   DELETE /note    ← حذف قيد {kind, at}    (Bearer ADMIN_TOKEN)
 *   GET    /inbox   ← كل السجلّ           (Bearer ADMIN_TOKEN)
 */

const DEFAULT_ORIGIN = 'https://znad-odoo-dev.github.io';

/**
 * أنواع القيود.
 *
 * الثلاثة الأولى تُعرض في الموقع نفسه فقراءتها عامّة — من يستطيع فتح الموقع
 * يراها هناك أصلاً. أمّا ضغطات الدعم فليست للعرض: هي رسالة منها إليه، ولا
 * تُقرأ إلا بالتوكن.
 */
const NOTE_KINDS = new Set(['decree', 'rhyme', 'court', 'support']);
const PUBLIC_KINDS = new Set(['decree', 'rhyme', 'court']);
const NOTE_MAX_CHARS = 280;
const NOTE_MAX_LIST = 300;

function corsHeaders(env) {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || DEFAULT_ORIGIN,
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
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

/** يجمع كل القيم تحت بادئة، مرتّبةً بمفتاحها (وهو زمنيّ). */
async function listAll(env, prefix, cap = Infinity) {
  const out = [];
  let cursor;
  do {
    const page = await env.SUBS.list({ prefix, cursor });
    for (const k of page.keys) {
      const raw = await env.SUBS.get(k.name);
      if (raw) out.push(JSON.parse(raw));
      if (out.length >= cap) return out;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
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

    /* ---- تسجيل فتحة ----
       نخزّن الوقت ومعرّفاً عشوائياً للجهاز فقط. لا اسم، لا موقع، لا بصمة
       متصفّح — المعرّف يفيد لتمييز جهاز عن جهاز ولا يدلّ على أحد.
       صلاحية ستة أشهر، فالسجل لا ينمو إلى الأبد. */
    if (url.pathname === '/visit' && request.method === 'POST') {
      let body = {};
      try {
        body = await request.json();
      } catch {
        /* فتحة بلا جسم مقبولة */
      }

      const at = new Date().toISOString();
      const id = typeof body.id === 'string' ? body.id.slice(0, 12) : 'anon';

      await env.SUBS.put(
        `visit:${at}:${id}`,
        JSON.stringify({ at, id }),
        { expirationTtl: 60 * 60 * 24 * 180 },
      );
      return json({ ok: true }, 200, cors);
    }

    /* ---- سجل الفتحات (إداري) ---- */
    if (url.pathname === '/visits' && request.method === 'GET') {
      if (!authorised(request, env)) return json({ error: 'unauthorised' }, 401);

      const out = await listAll(env, 'visit:');
      out.sort((a, b) => (a.at < b.at ? 1 : -1));
      const devices = [...new Set(out.map((v) => v.id))];
      return json({ total: out.length, devices, visits: out }, 200);
    }

    /* ---- قيد جديد في سجلّ الوزارة ----
       النصّ محدود الطول، والنوع من قائمة مغلقة. لا تحقّق من الهويّة: الموقع
       لشخصٍ واحد، والرابط ليس على محرّكات البحث، والأسوأ الممكن قيدٌ مزعج
       يُحذف بالتوكن. */
    if (url.pathname === '/note' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'bad json' }, 400, cors);
      }
      const kind = typeof body?.kind === 'string' ? body.kind : '';
      if (!NOTE_KINDS.has(kind)) return json({ error: 'bad kind' }, 400, cors);

      const text = typeof body.text === 'string' ? body.text.trim().slice(0, NOTE_MAX_CHARS) : '';
      const at = new Date().toISOString();
      const rand = Math.random().toString(36).slice(2, 8);
      const note = { kind, text, at };

      await env.SUBS.put(`note:${kind}:${at}:${rand}`, JSON.stringify(note));
      return json({ ok: true, note }, 200, cors);
    }

    /* ---- قيود نوعٍ واحد ---- */
    if (url.pathname === '/notes' && request.method === 'GET') {
      const kind = url.searchParams.get('kind') || '';
      if (!NOTE_KINDS.has(kind)) return json({ error: 'bad kind' }, 400, cors);
      if (!PUBLIC_KINDS.has(kind) && !authorised(request, env)) {
        return json({ error: 'unauthorised' }, 401, cors);
      }

      const out = await listAll(env, `note:${kind}:`, NOTE_MAX_LIST);
      return json(out, 200, { ...cors, 'cache-control': 'no-store' });
    }

    /* ---- حذف قيد ----
       القيود العامّة تُحذف من الموقع نفسه بلا توكن — كما تُكتب بلا توكن: من
       يستطيع إصدار مرسومٍ يستطيع مسحه، والحماية هنا هي أصل الطلب (CORS) لا
       أكثر، وهذا يكافئ حماية الكتابة. أمّا ضغطات الدعم فرسالةٌ إليه، ولا
       تُحذف إلا بالتوكن.

       الاستهداف بالنوع ولحظة الحفظ معاً — وهي بادئة المفتاح — فلا يحتاج
       الطالب إلى اللاحقة العشوائية. */
    if (url.pathname === '/note' && request.method === 'DELETE') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'bad json' }, 400, cors);
      }
      const kind = typeof body?.kind === 'string' ? body.kind : '';
      const at = typeof body?.at === 'string' ? body.at : '';
      if (!NOTE_KINDS.has(kind) || at.length < 20) return json({ error: 'bad target' }, 400, cors);
      if (!PUBLIC_KINDS.has(kind) && !authorised(request, env)) {
        return json({ error: 'unauthorised' }, 401, cors);
      }

      const page = await env.SUBS.list({ prefix: `note:${kind}:${at}` });
      for (const k of page.keys) await env.SUBS.delete(k.name);
      return json({ ok: true, deleted: page.keys.length }, 200, cors);
    }

    /* ---- كل السجلّ (إداري) ---- */
    if (url.pathname === '/inbox' && request.method === 'GET') {
      if (!authorised(request, env)) return json({ error: 'unauthorised' }, 401);

      const inbox = {};
      for (const kind of NOTE_KINDS) inbox[kind] = await listAll(env, `note:${kind}:`);
      return json(inbox, 200);
    }

    /* ---- قائمة الاشتراكات (إداري) ---- */
    if (url.pathname === '/subs' && request.method === 'GET') {
      if (!authorised(request, env)) return json({ error: 'unauthorised' }, 401);
      return json(await listAll(env, 'sub:'), 200);
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

    // ترويسات CORS حتى على 404: بدونها يرى المتصفّح خطأ CORS غامضاً بدل
    // «غير موجود»، ويظهر في console الزائرة بلا سبب مفهوم.
    return json({ error: 'not found' }, 404, cors);
  },
};
