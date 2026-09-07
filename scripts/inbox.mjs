/**
 * inbox.mjs — يقرأ سجلّ الوزارة: المراسيم، وقوافي صباح النور، والمخالفات،
 * وضغطات زرّ الدعم.
 *
 * الدعم لا يُقرأ من الموقع نفسه — رسالةٌ منها إليه، ولا يراها إلا من يحمل
 * التوكن. هذا هو المكان الذي تُقرأ فيه.
 *
 * الاستعمال:
 *   PUSH_ADMIN_TOKEN=… node scripts/inbox.mjs
 *   PUSH_ADMIN_TOKEN=… node scripts/inbox.mjs support               ← نوعٌ واحد
 *   PUSH_ADMIN_TOKEN=… node scripts/inbox.mjs delete rhyme <at>     ← حذف قيد
 *
 * `<at>` هو الوقت كما يطبعه السطر (ISO) — يُنسخ من القائمة أعلاه.
 * `PUSH_WORKER_URL` اختياري؛ الافتراضي عنوان الـWorker المنشور.
 * ولو لم يُضبط التوكن في البيئة يُقرأ من `.push-admin-token.txt` في جذر المشروع.
 */

import { readFileSync } from 'node:fs';

const base = (process.env.PUSH_WORKER_URL || 'https://raghd-push.znad.workers.dev').replace(/\/+$/, '');
let token = process.env.PUSH_ADMIN_TOKEN;
if (!token) {
  try { token = readFileSync(new URL('../.push-admin-token.txt', import.meta.url), 'utf8').trim(); } catch { /* غير موجود */ }
}
const [, , cmd, arg1, arg2] = process.argv;

if (!token) {
  console.error('ناقص: PUSH_ADMIN_TOKEN (أو الملف .push-admin-token.txt)');
  process.exit(1);
}

/* ---- حذف ---- */
if (cmd === 'delete') {
  if (!arg1 || !arg2) {
    console.error('الاستعمال: node scripts/inbox.mjs delete <kind> <at>');
    process.exit(1);
  }
  const res = await fetch(`${base}/note`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ kind: arg1, at: arg2 }),
  });
  const out = await res.json().catch(() => ({}));
  console.log(res.ok ? `حُذف: ${out.deleted}` : `تعذّر: ${res.status} ${JSON.stringify(out)}`);
  // بلا `process.exit` بعد fetch: على ويندوز يطبع تأكيداً داخلياً مزعجاً
  process.exitCode = res.ok ? 0 : 1;
} else {

const only = cmd;

const res = await fetch(`${base}/inbox`, { headers: { authorization: `Bearer ${token}` } });
if (!res.ok) {
  console.error(`تعذّر: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const inbox = await res.json();
const fmt = new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
  timeZone: 'Asia/Damascus', dateStyle: 'short', timeStyle: 'short',
});
const TITLES = {
  decree: '📜 المراسيم',
  rhyme: '☀️ صباح النور',
  court: '⚖️ المخالفات',
  support: '🤍 ضغطات الدعم',
};

for (const [kind, notes] of Object.entries(inbox)) {
  if (only && only !== kind) continue;
  console.log(`\n${TITLES[kind] ?? kind} — ${notes.length}`);
  console.log('─'.repeat(40));
  if (notes.length === 0) console.log('  (فاضي)');
  for (const n of notes) {
    const when = fmt.format(new Date(n.at));
    // الـISO بجانب الوقت المقروء: هو ما يُمرَّر لأمر الحذف
    console.log(`  ${when}  ${n.text || '·'}\n      ${n.at}`);
  }
}
console.log('');
}
