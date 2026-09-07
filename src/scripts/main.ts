/**
 * main.ts — تشغيل الوزارة
 *
 * الملف الوحيد الذي يلمس الـDOM. المكوّنات تحمل markup وCSS فقط، والربط كله
 * عبر `data-*`.
 *
 * المبدأ: مشهد واحد ظاهر والباقي `hidden`. الانتقال إظهارٌ وإخفاء لا إعادة
 * بناء، فتبقى الحركة ناعمة على الهاتف — وأنيميشن الدخول تعمل من جديد تلقائياً
 * لأن العنصر يخرج من `display:none`.
 */

import { STORY, DAILY_NOTIFY } from '../site.config';

import {
  nowMs,
  damascusClock,
  damascusTodayAt,
  setOffset,
  getOffset,
  SWEET_HOUR,
} from './schedule';

import * as story from './story';
import type { Scene } from './story';

import {
  DECREES, NET, RHYME, SUPPORT, MOON, NAILS, COURT, DISHES, HUNT,
  AWAY_TITLES, MISC, pick,
} from './copy';

import { finale, burst, bloom, heartRain, butterflies } from './celebrate';
import { moonAt, moonPath } from './moon';
import { postNote, getNotes, stampOf, type Note, type PublicKind } from './ministry';
import { applyTint, loadTint } from './tint';
import { startHunt, preloadHunt, type HuntHandle } from './hunt';
import { initAudio, type MusicHandle } from './music';
import { dropRetiredKeys, resetAll } from './store';
import { logVisit } from './visit';
import { pushConfigured, pushSupported, subscribe as pushSubscribe } from './push';

import {
  supported as notifySupported,
  state as notifyState,
  requestPermission,
  registerWorker,
  schedule as scheduleNotify,
  initResync,
  showTest,
} from './notify';

/* =========================================================================
   مراجع
   ========================================================================= */

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) =>
  r.querySelector(s) as T | null;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) =>
  Array.from(r.querySelectorAll(s)) as T[];

const scenes = $$<HTMLElement>('[data-scene]');
const after = $('#after');
const live = $('#live-region');

const BASE_TITLE = document.title;

let music: MusicHandle | null = null;
let musicStarted = false;

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad2 = (n: number) => String(n).padStart(2, '0');
/** مسافة غير قابلة للكسر — تحجز ارتفاع سطر فارغ فلا يقفز ما تحته */
const NBSP = ' ';

/* =========================================================================
   المشاهد
   ========================================================================= */

/** يلغي كل مؤقّتات المشهد السابق: مشهدٌ مهجور يظلّ يكتب في الـDOM بلا هذا. */
let sceneTimers: number[] = [];
const later = (fn: () => void, ms: number): void => {
  sceneTimers.push(window.setTimeout(fn, ms));
};
function clearScene(): void {
  for (const t of sceneTimers) window.clearTimeout(t);
  sceneTimers = [];
}

function show(name: Scene): void {
  clearScene();
  onLeave(story.current());
  story.go(name);

  for (const el of scenes) el.hidden = el.dataset.scene !== name;

  // التذييل على البوّابة وحدها: داخل قسمٍ يشتّت
  if (after) after.hidden = name !== 'hub';

  window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  onEnter(name);
}

function onEnter(name: Scene): void {
  switch (name) {
    case 'decrees': void loadRecords('decree'); break;
    case 'court':   void loadRecords('court'); break;
    case 'rhyme':   void loadRhyme(); break;
    case 'moon':    paintMoon(); break;
    case 'nails':   paintSwatches(); break;
    case 'dishes':  paintDishes(); break;
    case 'hunt':    preloadHunt(); resetHunt(); break;
  }
}

/** ما يجب إيقافه عند مغادرة مشهد: مؤقّت الجلي ولعبة الصيد يعملان في الخلفية. */
function onLeave(name: Scene): void {
  if (name === 'hub') $('[data-scene="hub"]')?.classList.add('is-warm');
  if (name === 'hunt') stopHunt();
  // مؤقّت الجلي يبقى يعدّ عن قصد — الجلي لا يتوقّف لأنها فتحت قسماً آخر
}

function goTo(name: string): void {
  if (!story.isScene(name)) return;
  // أوّل ضغطة في الزيارة هي أوّل إيماءة، وقبلها يرفض المتصفّح تشغيل الصوت
  if (STORY.musicOnFirstOpen) void startMusic();
  show(name);
}

/* =========================================================================
   القيود — المراسيم والمحكمة
   ========================================================================= */

const recordEls = {
  decree: { list: $('[data-decree-list]'), empty: $('[data-decree-empty]') },
  court:  { list: $('[data-court-list]'),  empty: $('[data-court-empty]') },
} as const;

function recordNode(kind: 'decree' | 'court', n: Note, index: number): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'record';

  const num = document.createElement('span');
  num.className = 'record__n';
  num.textContent = kind === 'decree' ? `${DECREES.numberPrefix} ${index}` : `مخالفة رقم ${index}`;

  const when = document.createElement('span');
  when.className = 'record__when tnum';
  when.textContent = stampOf(n.at);

  const t = document.createElement('p');
  t.className = 'record__t';
  t.textContent = n.text || (kind === 'court' ? 'مجاملة بلا نصّ. المحكمة صدّقت.' : '—');

  const stamp = document.createElement('span');
  stamp.className = 'record__stamp';
  stamp.textContent = kind === 'decree' ? DECREES.stamp : 'موثّقة';

  li.append(num, when, t, stamp);
  return li;
}

function paintRecords(kind: 'decree' | 'court', notes: Note[]): void {
  const { list, empty } = recordEls[kind];
  if (!list) return;
  list.replaceChildren();
  // الأحدث فوق
  notes.forEach((n, i) => list.prepend(recordNode(kind, n, i + 1)));
  if (empty) empty.hidden = notes.length > 0;
}

const cache: Partial<Record<PublicKind, Note[]>> = {};

async function loadRecords(kind: 'decree' | 'court'): Promise<void> {
  if (cache[kind]) paintRecords(kind, cache[kind]!);
  const notes = await getNotes(kind);
  if (notes) {
    cache[kind] = notes;
    paintRecords(kind, notes);
  } else if (!cache[kind]) {
    paintRecords(kind, []);
  }
}

/** يضيف قيداً محلياً فوراً ثم يحاول حفظه. الكلمة لا تضيع أمام عينها. */
async function addRecord(kind: 'decree' | 'court', text: string): Promise<boolean> {
  const local: Note = { kind, text, at: new Date(nowMs()).toISOString() };
  cache[kind] = [...(cache[kind] ?? []), local];
  paintRecords(kind, cache[kind]!);
  const saved = await postNote(kind, text);
  return saved !== null;
}

/* ---- المراسيم ---- */
function initDecrees(): void {
  const form = $<HTMLFormElement>('[data-decree-form]');
  const text = $<HTMLTextAreaElement>('[data-decree-text]');
  const say = $('[data-decree-say]');
  if (!form || !text) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = text.value.trim();
    if (!v) return;
    text.value = '';
    if (say) say.textContent = DECREES.issued;
    announce(DECREES.issued);
    bloom();
    const ok = await addRecord('decree', v);
    if (!ok && say) say.textContent = DECREES.failed;
  });
}

/* ---- المحكمة ---- */
let verdictIndex = -1;

function initCourt(): void {
  const form = $<HTMLFormElement>('[data-court-form]');
  const text = $<HTMLInputElement>('[data-court-text]');
  const box = $('[data-court-verdict]');
  const out = $('[data-court-out]');
  if (!form || !text) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = text.value.trim();
    text.value = '';

    const { text: verdict, index } = pick(COURT.verdicts, verdictIndex);
    verdictIndex = index;
    if (out) out.textContent = verdict;
    if (box) {
      box.hidden = true;
      void box.offsetWidth;
      box.hidden = false;
    }
    announce(`${COURT.verdictLabel}: ${verdict}`);
    burst(form);
    await addRecord('court', v);
  });
}

/* =========================================================================
   حالة النت
   ========================================================================= */

let netIndex = -1;

function initNet(): void {
  const btn = $<HTMLButtonElement>('[data-net-report]');
  const ticket = $('[data-net-ticket]');
  const n = $('[data-net-n]');
  const reply = $('[data-net-reply]');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const { text, index } = pick(NET.replies, netIndex);
    netIndex = index;
    // رقم بلاغ يشبه الحقيقي: خمسة أرقام لا تتكرّر بين ضغطتين متتاليتين غالباً
    if (n) n.textContent = String(10000 + Math.floor(Math.random() * 89999));
    if (reply) reply.textContent = text;
    if (ticket) {
      ticket.hidden = true;
      void ticket.offsetWidth;
      ticket.hidden = false;
    }
    announce(text);
  });
}

/* =========================================================================
   صباح النور
   ========================================================================= */

let rhymeLoaded = false;

function rhymeNode(text: string, fresh = false): HTMLLIElement {
  const li = document.createElement('li');
  li.className = `poem__l${fresh ? ' poem__l--new' : ''}`;
  li.textContent = text;
  return li;
}

/** يخلص بـ«ور»؟ نتسامح مع علامات الترقيم والتشكيل في الآخر. */
function endsWithOor(s: string): boolean {
  const clean = s.replace(/[\s.…!؟?،,ـً-ْ]+$/u, '');
  return /ور$/.test(clean);
}

async function loadRhyme(): Promise<void> {
  const list = $('[data-rhyme-list]');
  if (!list || rhymeLoaded) return;
  const notes = await getNotes('rhyme');
  if (!notes) return;
  rhymeLoaded = true;
  for (const n of notes) if (n.text) list.append(rhymeNode(n.text));
}

function initRhyme(): void {
  const form = $<HTMLFormElement>('[data-rhyme-form]');
  const text = $<HTMLInputElement>('[data-rhyme-text]');
  const list = $('[data-rhyme-list]');
  const say = $('[data-rhyme-say]');
  if (!form || !text || !list) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = text.value.trim();
    if (!v) return;
    if (!endsWithOor(v)) {
      if (say) say.textContent = RHYME.bad;
      announce(RHYME.bad);
      return;
    }
    text.value = '';
    list.append(rhymeNode(v, true));
    if (say) say.textContent = RHYME.added;
    announce(RHYME.added);
    butterflies(6);
    const saved = await postNote('rhyme', v);
    if (!saved && say) say.textContent = RHYME.failed;
  });
}

/* =========================================================================
   الدعم
   ========================================================================= */

let supportIndex = -1;

function initSupport(): void {
  const btn = $<HTMLButtonElement>('[data-support]');
  const line = $('[data-support-line]');
  const sent = $('[data-support-sent]');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const { text, index } = pick(SUPPORT.lines, supportIndex);
    supportIndex = index;
    if (line) {
      line.hidden = true;
      line.textContent = text;
      void line.offsetWidth;
      line.hidden = false;
    }
    if (sent) sent.hidden = false;
    btn.textContent = SUPPORT.again;
    announce(text);
    if (!reduced()) heartRain();
    // بلا نصّ: الضغطة نفسها هي الرسالة
    void postNote('support');
  });
}

/* =========================================================================
   القمر
   ========================================================================= */

function paintMoon(): void {
  const info = moonAt(nowMs());
  const path = $('[data-moon-path]');
  const name = $('[data-moon-name]');
  const pct = $('[data-moon-pct]');
  if (path) path.setAttribute('d', moonPath(info, 96));
  if (name) name.textContent = MOON.phases[info.index] ?? '—';
  if (pct) pct.textContent = String(Math.round(info.illumination * 100));
  announce(`${MOON.tonight}: ${MOON.phases[info.index]}`);
}

/* =========================================================================
   المناكير
   ========================================================================== */

function paintSwatches(): void {
  const current = loadTint();
  for (const b of $$('[data-swatch]')) {
    b.classList.toggle('is-on', !!current && b.dataset.swatch?.toLowerCase() === current);
  }
}

function initNails(): void {
  const say = $('[data-nails-say]');
  const custom = $<HTMLInputElement>('[data-swatch-custom]');

  const set = (hex: string | null): void => {
    applyTint(hex);
    paintSwatches();
    if (say) say.textContent = hex ? NAILS.applied : NBSP;
    if (hex) bloom();
  };

  for (const b of $$<HTMLButtonElement>('[data-swatch]')) {
    b.addEventListener('click', () => set(b.dataset.swatch ?? null));
  }
  custom?.addEventListener('input', () => set(custom.value));
  $('[data-swatch-reset]')?.addEventListener('click', () => set(null));
}

/* =========================================================================
   الجلي
   ========================================================================= */

const DISH_TOTAL = DISHES.minutes * 60;
let dishLeft = DISH_TOTAL;
let dishTimer = 0;
let dishLastMinute = -1;

function paintDishes(): void {
  const time = $('[data-dishes-time]');
  const fill = $('[data-dishes-fill]');
  const toggle = $<HTMLButtonElement>('[data-dishes-toggle]');
  const say = $('[data-dishes-say]');
  const done = $('[data-dishes-done]');

  if (time) time.textContent = `${pad2(Math.floor(dishLeft / 60))}:${pad2(dishLeft % 60)}`;
  if (fill) fill.style.width = `${(((DISH_TOTAL - dishLeft) / DISH_TOTAL) * 100).toFixed(1)}%`;
  if (toggle) {
    toggle.textContent = dishTimer ? DISHES.pause : dishLeft === DISH_TOTAL ? DISHES.start : DISHES.resume;
    toggle.hidden = dishLeft === 0;
  }
  if (done) done.hidden = dishLeft !== 0;

  // جملة عند كل دقيقة تمرّ
  const minute = Math.floor((DISH_TOTAL - dishLeft) / 60);
  if (dishTimer && minute !== dishLastMinute && minute >= 1 && minute <= DISHES.perMinute.length) {
    dishLastMinute = minute;
    if (say) say.textContent = DISHES.perMinute[minute - 1] ?? NBSP;
  }
}

function dishTick(): void {
  dishLeft = Math.max(0, dishLeft - 1);
  paintDishes();
  if (dishLeft === 0) {
    window.clearInterval(dishTimer);
    dishTimer = 0;
    announce(`${DISHES.done} ${DISHES.doneSub}`);
    if (!reduced()) {
      bloom();
      later(() => finale(), 500);
    }
  }
}

function initDishes(): void {
  const toggle = $<HTMLButtonElement>('[data-dishes-toggle]');
  const reset = $<HTMLButtonElement>('[data-dishes-reset]');
  const say = $('[data-dishes-say]');

  toggle?.addEventListener('click', () => {
    if (dishTimer) {
      window.clearInterval(dishTimer);
      dishTimer = 0;
    } else {
      // الجلي بأغنية أحسن من الجلي بصمت
      void startMusic();
      dishTimer = window.setInterval(dishTick, 1000);
    }
    paintDishes();
  });

  reset?.addEventListener('click', () => {
    window.clearInterval(dishTimer);
    dishTimer = 0;
    dishLeft = DISH_TOTAL;
    dishLastMinute = -1;
    if (say) say.textContent = NBSP;
    paintDishes();
  });
}

/* =========================================================================
   صيد الملوخية
   ========================================================================= */

let hunt: HuntHandle | null = null;
let huntIndex = 0;

function huntVerdict(score: number): string {
  let text = HUNT.verdicts[0]!.text;
  for (const v of HUNT.verdicts) if (score >= v.min) text = v.text;
  return text;
}

function resetHunt(): void {
  stopHunt();
  const score = $('[data-hunt-score]');
  const time = $('[data-hunt-time]');
  const result = $('[data-hunt-result]');
  const start = $<HTMLButtonElement>('[data-hunt-start]');
  if (score) score.textContent = '0';
  if (time) time.textContent = String(HUNT.seconds);
  if (result) result.hidden = true;
  if (start) {
    start.hidden = false;
    start.textContent = huntIndex === 0 ? HUNT.start : HUNT.again;
  }
  // كانفاس نظيف بين لعبتين
  const canvas = $<HTMLCanvasElement>('[data-hunt-canvas]');
  canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
}

function stopHunt(): void {
  hunt?.stop();
  hunt = null;
  const canvas = $<HTMLCanvasElement>('[data-hunt-canvas]');
  canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
}

function initHunt(): void {
  const canvas = $<HTMLCanvasElement>('[data-hunt-canvas]');
  const start = $<HTMLButtonElement>('[data-hunt-start]');
  const score = $('[data-hunt-score]');
  const time = $('[data-hunt-time]');
  const result = $('[data-hunt-result]');
  if (!canvas || !start) return;

  start.addEventListener('click', () => {
    stopHunt();
    start.hidden = true;
    if (result) result.hidden = true;
    huntIndex++;

    hunt = startHunt(canvas, {
      seconds: HUNT.seconds,
      onTick(left, s) {
        if (time) time.textContent = String(left);
        if (score) score.textContent = String(s);
      },
      onEnd(s) {
        hunt = null;
        const verdict = huntVerdict(s);
        if (result) {
          result.textContent = `${s} ${HUNT.unit(s)}. ${verdict}`;
          result.hidden = false;
        }
        start.textContent = HUNT.again;
        start.hidden = false;
        announce(`${HUNT.scoreLabel}: ${s}. ${verdict}`);
        if (s >= 12 && !reduced()) burst(result);
      },
    });
  });
}

/* =========================================================================
   الظهور بالتمرير
   ========================================================================= */

/**
 * ملاحظٌ واحد لكل عناصر `.reveal`.
 *
 * القاعدة في الأنماط تبدأ من `opacity: 0` وتنتظر `.is-visible`، والصنف يأتي
 * من هنا. وعند تعذّر الملاحظ أو في الحركة المخفّضة يظهر كل شيء فوراً: الفشل
 * يجب أن يُري المحتوى لا أن يخفيه.
 */
function initReveal(): void {
  const items = $$('.reveal');
  if (items.length === 0) return;

  if (reduced() || typeof IntersectionObserver === 'undefined') {
    for (const el of items) el.classList.add('is-visible');
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.04 },
  );
  for (const el of items) io.observe(el);
}

/* =========================================================================
   قارئات الشاشة
   ========================================================================= */

function announce(text: string): void {
  if (live) live.textContent = text;
}

/* =========================================================================
   الموسيقى
   ========================================================================= */

async function startMusic(): Promise<void> {
  if (musicStarted || !music) return;
  const res = await music.boot(() => setMusicUi(true));
  musicStarted = res === 'playing';
  setMusicUi(res === 'playing', res === 'waiting');
}

function setMusicUi(playing: boolean, waiting = false): void {
  const root = $('[data-music]');
  const toggle = $<HTMLButtonElement>('[data-music-toggle]');
  const label = $('[data-music-label]');
  if (!root || !toggle || !label) return;

  root.hidden = false;
  root.classList.toggle('is-playing', playing);
  toggle.setAttribute('aria-pressed', String(playing));
  label.textContent = playing ? 'شغالة' : waiting ? 'المسي الشاشة' : 'مطفية';
}

function initMusic(): void {
  const el = $<HTMLAudioElement>('[data-music-audio]');
  const toggle = $<HTMLButtonElement>('[data-music-toggle]');
  if (!el || !toggle) return;

  music = initAudio(el);

  toggle.addEventListener('click', async () => {
    const playing = await music!.toggle();
    musicStarted = playing;
    setMusicUi(playing);
    if (playing) announce(MISC.musicOn);
  });

  el.addEventListener('play', () => setMusicUi(true));
  el.addEventListener('pause', () => setMusicUi(false));
}

/* =========================================================================
   الإشعارات — معطَّلة مؤقّتاً من `DAILY_NOTIFY`
   ========================================================================= */

const notifBtn = $<HTMLButtonElement>('[data-notif-enable]');
const notifStatus = $('[data-notif-status]');
const notifBadge = $('[data-notif-badge]');

function paintNotify(): void {
  if (!notifBtn || !notifStatus || !notifBadge) return;
  const st = notifyState();

  notifBadge.classList.remove('opt__badge--soft', 'opt__badge--on', 'opt__badge--off');

  switch (st) {
    case 'unsupported':
      notifBtn.hidden = true;
      notifBadge.classList.add('opt__badge--off');
      notifBadge.textContent = 'غير مدعوم';
      notifStatus.textContent = 'متصفحك ما بيدعم التنبيهات 🤷 خدي التقويم وارتاحي.';
      break;
    case 'granted':
      notifBtn.hidden = false;
      notifBtn.textContent = 'جرّبيها هلق 👀';
      notifBtn.dataset.notifTest = '1';
      notifBadge.classList.add('opt__badge--on');
      notifBadge.textContent = 'مفعّل ✓';
      notifStatus.textContent = pushConfigured()
        ? 'صرنا رسميين 🤝 بتوصلك حتى والمتصفح مسكّر.'
        : 'صرنا رسميين 🤝 جملة وحدة كل يوم — طالما الصفحة مفتوحة.';
      break;
    case 'denied':
      notifBtn.hidden = true;
      notifBadge.classList.add('opt__badge--off');
      notifBadge.textContent = 'مرفوض';
      notifStatus.textContent = 'رفضتينا من قبل 🤍 فعّليها من إعدادات الموقع بالمتصفح.';
      break;
    default:
      notifBtn.hidden = false;
      notifBadge.classList.add('opt__badge--soft');
      notifBadge.textContent = 'اختياري';
      notifStatus.textContent = 'لسا ما فعّلتيه. ولا مشكلة أبداً.';
  }
}

async function armPush(reg: ServiceWorkerRegistration | null): Promise<void> {
  if (!reg || !pushSupported() || !pushConfigured()) return;
  if (notifyState() !== 'granted') return;
  await pushSubscribe(reg);
}

/**
 * عامل الخدمة يُسجَّل دائماً — هو التخزين والتحديث. أمّا جدولة الرسالة
 * اليومية وإعادة مزامنتها فخلف `DAILY_NOTIFY`، وهي مطفأة الآن. الاشتراك في
 * Push يبقى قائماً: الإرسال يدويّ ولا يحدث إلا حين يُطلب.
 */
function initNotify(): void {
  if (notifySupported()) {
    void registerWorker().then((reg) => {
      if (DAILY_NOTIFY) {
        scheduleNotify();
        initResync();
      }
      void armPush(reg);
    });
  }

  if (!notifBtn) return;
  notifBtn.addEventListener('click', async () => {
    if (notifBtn.dataset.notifTest === '1') {
      await showTest();
      return;
    }
    notifBtn.disabled = true;
    await requestPermission();
    const reg = await registerWorker();
    await armPush(reg);
    notifBtn.disabled = false;
    paintNotify();
  });
  paintNotify();
}

/* =========================================================================
   لوحة الاختبار المخفية — Shift+L
   ========================================================================= */

const panel = $('[data-committee]');
const panelStatus = $('[data-committee-status]');

function refreshPanel(): void {
  if (!panelStatus) return;
  panelStatus.textContent =
    `${getOffset() ? 'وقت مُحاكى' : 'وقت حقيقي'} — ${damascusClock()} · مشهد: ${story.current()}`;
}

function initPanel(): void {
  if (!panel) return;

  for (const el of $$('[data-committee-close]')) {
    el.addEventListener('click', () => (panel.hidden = true));
  }

  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'L' || e.key === 'l')) {
      panel.hidden = false;
      refreshPanel();
    }
    if (e.key === 'Escape') panel.hidden = true;
  });

  for (const btn of $$<HTMLButtonElement>('[data-sim]')) {
    btn.addEventListener('click', () => {
      const real = Date.now();
      switch (btn.dataset.sim) {
        case 'before': setOffset(damascusTodayAt(SWEET_HOUR - 1, 15, real) - real); break;
        case 'due':    setOffset(damascusTodayAt(SWEET_HOUR, 0, real) - real); break;
        case 'after':  setOffset(damascusTodayAt(SWEET_HOUR + 2, 40, real) - real); break;
        // القمر يتبع محاكي الوقت: أسبوعٌ للأمام يقلب طوره
        case 'week':   setOffset(getOffset() + 7 * 86_400_000); break;
        case 'rain':   finale(); break;
        case 'real':   setOffset(0); break;
        case 'reset':
          resetAll();
          setOffset(0);
          applyTint(null);
          show('hub');
          break;
      }
      if (DAILY_NOTIFY) scheduleNotify();
      refreshPanel();
      if (story.current() === 'moon') paintMoon();
    });
  }
}

/* =========================================================================
   الإقلاع
   ========================================================================= */

/**
 * إعادة تحميل مرة واحدة حين يستلم عامل خدمة جديد.
 *
 * بدونها تبقى الصفحة المفتوحة على الشيفرة القديمة حتى بعد أن يُثبَّت الإصدار
 * الجديد ويطالب بالسيطرة. الحارس في `sessionStorage` يمنع حلقة إعادة تحميل لو
 * تكرّر الحدث لأي سبب.
 */
function reloadOnNewWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const GUARD = 'raghd:reloaded:v1';

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    try {
      if (sessionStorage.getItem(GUARD) === '1') return;
      sessionStorage.setItem(GUARD, '1');
    } catch {
      return;
    }
    location.reload();
  });
}

function boot(): void {
  dropRetiredKeys();
  reloadOnNewWorker();
  logVisit();

  // لون المناكير المحفوظ قبل أوّل رسم، وإلا رأت الوزارة تنقلب لونها أمامها
  applyTint(loadTint());

  for (const b of $$<HTMLElement>('[data-go]')) {
    b.addEventListener('click', () => goTo(b.dataset.go ?? ''));
  }

  initDecrees();
  initNet();
  initRhyme();
  initSupport();
  initNails();
  initCourt();
  initDishes();
  initHunt();

  initReveal();
  initMusic();
  initNotify();
  initPanel();

  let awayIndex = -1;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      const { text, index } = pick(AWAY_TITLES, awayIndex);
      awayIndex = index;
      document.title = text;
    } else {
      document.title = BASE_TITLE;
    }
  });

  document.addEventListener('copy', () => announce(MISC.copyEgg), { passive: true });

  show('hub');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
