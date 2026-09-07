/**
 * ministry.ts — سجلّ الوزارة على الـWorker.
 *
 * أربعة أنواع من القيود تُكتب من الموقع وتُقرأ منه: المراسيم، وقوافي صباح
 * النور، ومخالفات المحكمة، وضغطات زرّ الدعم. الثلاثة الأولى تُعرض للناس؛
 * الدعم رسالةٌ منها إليه ولا يُقرأ إلا بالتوكن — ولذلك لا دالّة قراءة له هنا.
 *
 * كل شيء يفشل بصمت: الموقع لا يعرض خطأ شبكة أبداً، بل يقول «الأرشيف ما ردّ»
 * ويبقى يعمل. القيد الذي لم يُحفظ يُعرض محلياً على أي حال، فلا تضيع الكلمة
 * أمام عينها حتى لو ضاعت في الطريق.
 */

import { PUSH } from '../site.config';

export type NoteKind = 'decree' | 'rhyme' | 'court' | 'support';
export type PublicKind = Exclude<NoteKind, 'support'>;

export interface Note {
  kind: NoteKind;
  text: string;
  /** ISO — لحظة الحفظ على الخادم */
  at: string;
}

const TIMEOUT_MS = 6000;

function base(): string {
  return PUSH.endpoint.replace(/\/+$/, '');
}

/** طلبٌ بمهلة: انتظار Worker لا يردّ أسوأ من فشلٍ سريع. */
async function request(path: string, init: RequestInit = {}): Promise<Response | null> {
  if (!PUSH.endpoint) return null;
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${base()}${path}`, { ...init, signal: ctl.signal });
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** يكتب قيداً. يرجع القيد كما حفظه الخادم، أو null إن لم يصل. */
export async function postNote(kind: NoteKind, text = ''): Promise<Note | null> {
  const res = await request('/note', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, text }),
  });
  if (!res || !res.ok) return null;
  try {
    const data = (await res.json()) as { note?: Note };
    return data.note ?? null;
  } catch {
    return null;
  }
}

/** يقرأ قيود نوعٍ عامّ، بترتيب زمنيّ صاعد. null يعني أن الشبكة لم تردّ. */
export async function getNotes(kind: PublicKind): Promise<Note[] | null> {
  const res = await request(`/notes?kind=${kind}`, { cache: 'no-store' });
  if (!res || !res.ok) return null;
  try {
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as Note[]) : null;
  } catch {
    return null;
  }
}

/**
 * يحذف قيداً عامّاً بنوعه ولحظة حفظه. العامّ يُحذف من الموقع كما يُكتب منه —
 * الدعم ليس منها، فهو رسالةٌ إليه ولا يُحذف إلا بالتوكن من خارج الموقع.
 */
export async function deleteNote(kind: PublicKind, at: string): Promise<boolean> {
  const res = await request('/note', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, at }),
  });
  return !!res && res.ok;
}

/** تاريخٌ قصير بتقويم دمشق لعرضه بجانب القيد. */
export function stampOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
    timeZone: 'Asia/Damascus',
    day: '2-digit',
    month: '2-digit',
  }).format(d);
}
