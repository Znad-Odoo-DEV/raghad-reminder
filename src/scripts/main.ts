/**
 * main.ts — تشغيل القصة
 *
 * الملف الوحيد الذي يلمس الـDOM. المكوّنات تحمل markup وCSS فقط، والربط كله
 * عبر `data-*`.
 *
 * المبدأ: مشهد واحد ظاهر والباقي `hidden`. الانتقال إظهارٌ وإخفاء لا إعادة
 * بناء، فتبقى الحركة ناعمة على الهاتف — وأنيميشن الدخول تعمل من جديد تلقائياً
 * لأن العنصر يخرج من `display:none`.
 */

import { STORY, HER } from '../site.config';

import {
  untilBirthday,
  nextBirthdayInstant,
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
  CLUES, JOKE, BUTTON, LOADING, CD, CANDLE, REVEAL,
  AWAY_TITLES, MISC, dayUnitAr, hourUnitAr, minuteUnitAr, pick,
} from './copy';

import { finale, burst, bloom, butterflies, heartRain } from './celebrate';
import { nameInDust } from './dust';
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
const thread = $('[data-thread]');
const after = $('#after');
const live = $('#live-region');

const BASE_TITLE = document.title;
const CD_START_KEY = 'raghd:cd-start:v1';

let music: MusicHandle | null = null;
let musicStarted = false;
let tickTimer = 0;
let lastSleeps = -1;

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad2 = (n: number) => String(n).padStart(2, '0');
/** مسافة غير قابلة للكسر — تحجز ارتفاع سطر فارغ فلا يقفز ما تحته */
const NBSP = '\u00a0';

/* =========================================================================
   المشاهد
   ========================================================================= */

function show(name: Scene): void {
  for (const el of scenes) el.hidden = el.dataset.scene !== name;

  if (thread) thread.style.width = `${Math.round(story.progress() * 100)}%`;

  // الأدوات الجانبية لا تظهر إلا بعد أن تنتهي التجربة
  if (after) after.hidden = !(name === 'countdown' || name === 'reveal');

  window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  onEnter(name);
}

/** ما يحتاج تشغيلاً عند دخول مشهد بعينه. */
function onEnter(name: Scene): void {
  window.clearInterval(tickTimer);
  // مشهدٌ هُجر يظلّ يكتب في الـDOM إن بقيت مؤقّتاته حيّة
  clearScene();
  paintPhase();

  switch (name) {
    case 'clues':     runClues(); break;
    case 'joke':      runJoke(); break;
    case 'button':    runButton(); break;
    case 'loading':   runLoading(); break;
    case 'name':      runName(); break;
    case 'countdown': startCountdown(); break;
    case 'candle':    runCandle(); break;
    case 'reveal':    runReveal(); break;
  }
}

function advance(): void {
  // أوّل «كمّلي» هي أوّل إيماءة في التجربة، وقبلها يرفض المتصفّح تشغيل الصوت.
  // ربطها بمشهد بعينه كان يؤخّر الأغنية إلى ما بعد نصف التمهيد.
  if (STORY.musicOnFirstOpen) void startMusic();
  show(story.next().scene);
}

/* =========================================================================
   المشاهد التمهيدية
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

/** ٣ · كلمات تمرّ وتختفي، ثم يظهر الذيل. */
function runClues(): void {
  const el = $('[data-clue]');
  const tail = $('[data-clues-tail]');
  const next = $('[data-clues-next]');
  if (!el || !tail || !next) return;

  tail.hidden = true;
  next.hidden = true;
  el.textContent = '';

  // في الحركة المخفّضة لا تُقرأ كلمةٌ تذوب: نعرضها كلّها سطراً واحداً
  if (reduced()) {
    el.textContent = CLUES.words.join(' · ');
    tail.hidden = false;
    next.hidden = false;
    return;
  }

  const STEP = 1500;
  CLUES.words.forEach((w, i) => {
    later(() => {
      el.textContent = w;
      // إعادة تشغيل الأنيميشن تحتاج إزالة الصنف وقراءة تخطيط بينهما
      el.classList.remove('in');
      void el.offsetWidth;
      el.classList.add('in');
    }, i * STEP);
  });

  later(() => {
    el.classList.remove('in');
    el.textContent = '';
    tail.hidden = false;
    later(() => { next.hidden = false; }, 700);
  }, CLUES.words.length * STEP);
}

/** ٤ · «خلصت المفاجأة» … سكوت … «مزحة». */
function runJoke(): void {
  const end = $('[data-joke-end]');
  const twist = $('[data-joke-twist]');
  const next = $('[data-joke-next]');
  if (!end || !twist || !next) return;

  end.hidden = false;
  twist.hidden = true;
  next.hidden = true;

  // السكوت هو النكتة. تقصيره يقتلها، وإطالته تجعلها عطلاً.
  later(() => {
    end.hidden = true;
    twist.hidden = false;
    announce(JOKE.twist);
    later(() => { next.hidden = false; }, 900);
  }, reduced() ? 900 : 2100);
}

/** ٥ · الزرّ الممنوع. */
function runButton(): void {
  const btn = $<HTMLButtonElement>('[data-tempt]');
  const after = $('[data-tempt-after]');
  const next = $('[data-tempt-next]');
  if (!btn || !after || !next) return;

  btn.hidden = false;
  btn.disabled = false;
  btn.classList.remove('gone');
  after.hidden = true;
  next.hidden = true;

  // مخرج بعد سبع ثوانٍ.
  //
  // النكتة تفترض أنها ستكبس، والافتراض ليس تصميماً: من لم تكبس كانت تقف أمام
  // مشهد بلا طريق إلى ما بعده. سبعٌ تكفي لأن تكبس من ستكبس، ولا تطول على من
  // لن تفعل.
  later(() => {
    if (!btn.disabled) next.hidden = false;
  }, 7000);
}

function tempted(): void {
  const btn = $<HTMLButtonElement>('[data-tempt]');
  const after = $('[data-tempt-after]');
  const next = $('[data-tempt-next]');
  if (!btn || !after || !next || btn.disabled) return;

  btn.disabled = true;
  btn.classList.add('gone');
  bloom();
  later(() => {
    btn.hidden = true;
    after.hidden = false;
    announce(BUTTON.after);
    later(() => { next.hidden = false; }, 800);
  }, 380);
}

/** ٦ · شاشة التحضير. */
function runLoading(): void {
  const step = $('[data-load-step]');
  const fill = $('[data-load-fill]');
  const pct = $('[data-load-pct]');
  const done = $('[data-load-done]');
  const next = $('[data-load-next]');
  if (!step || !fill || !pct || !done || !next) return;

  done.hidden = true;
  next.hidden = true;
  fill.style.width = '0%';
  pct.textContent = '0%';

  const STEP = reduced() ? 500 : 1150;
  LOADING.steps.forEach((line, i) => {
    later(() => {
      step.textContent = `${line}…`;
      const done = Math.round(((i + 1) / LOADING.steps.length) * 100);
      fill.style.width = `${done}%`;
      pct.textContent = `${done}%`;
    }, i * STEP);
  });

  later(() => {
    step.textContent = ' ';
    done.hidden = false;
    announce(LOADING.done);
    later(() => { next.hidden = false; }, 700);
  }, LOADING.steps.length * STEP);
}

/** ٧ · غبار يتجمّع فيكتب اسمها. */
function runName(): void {
  const tail = $('[data-name-tail]');
  const next = $('[data-name-next]');
  if (!tail || !next) return;

  tail.hidden = true;
  next.hidden = true;
  announce(HER);

  nameInDust(HER, 2.4, () => {
    tail.hidden = false;
    later(() => { next.hidden = false; }, 700);
  });
}

/* =========================================================================
   العدّ
   ========================================================================= */

/** أول لحظة رأت فيها العدّاد — منها يُقاس امتلاء الخط. */
function countdownStart(target: number): number {
  try {
    const saved = Number(localStorage.getItem(CD_START_KEY));
    if (saved && saved < target) return saved;
    const now = nowMs();
    localStorage.setItem(CD_START_KEY, String(now));
    return now;
  } catch {
    return nowMs();
  }
}

function startCountdown(): void {
  paintCountdown();
  tickTimer = window.setInterval(paintCountdown, 1000);
}

function paintCountdown(): void {
  const b = untilBirthday();
  const target = nextBirthdayInstant();
  if (!b || target === null) return;

  // الطور يتبع الوقت لا تبديل المشهد وحده.
  //
  // هنا تنتظر، وهنا تعبر الساعةُ الأخيرة. حسابُه عند دخول المشهد فقط كان
  // يعني أن من فتحت الصفحة قبل الغروب وتركتها مفتوحة لا ترى العالم يدفأ أبداً.
  paintPhase();

  // وصل اليوم — ننتقل لوحدنا
  if (b.isToday) {
    window.clearInterval(tickTimer);
    show(story.go('candle').scene);
    return;
  }

  const mins = b.hours * 60 + b.minutes;
  const eve = b.sleeps === 1;

  // آخر دقيقة: الشاشة رقم واحد ولا شيء غيره.
  // «باقي ٢٦ ثانية» مكتوبةً داخل جملة لا تفعل ما تفعله ٢٦ وحدها تملأ الشاشة.
  const lastMinute = eve && b.hours === 0 && b.minutes === 0;
  const body = $('[data-cd-body]');
  const lastBox = $('[data-cd-last]');
  if (body) body.hidden = lastMinute;
  if (lastBox) lastBox.hidden = !lastMinute;

  if (lastMinute) {
    const tick = $('[data-cd-tick]');
    const say = $('[data-cd-say]');
    if (tick && tick.textContent !== String(b.seconds)) {
      tick.textContent = String(b.seconds);
      // إعادة تشغيل الأنيميشن تحتاج إزالة الصنف وقراءة تخطيط بينهما
      if (!reduced()) {
        tick.classList.remove('beat');
        void tick.offsetWidth;
        tick.classList.add('beat');
      }
    }
    if (say) say.textContent = b.seconds > 30 ? CD.wait : b.seconds > 10 ? CD.near : NBSP;
    return;
  }

  const bigWrap = $('[data-cd-big]');
  const big = $('[data-cd-n]');
  const unit = $('[data-cd-u]');
  const one = $('[data-cd-one]');
  const label = $('[data-cd-label]');
  const clock = $('[data-cd-clock]');
  const fill = $('[data-cd-fill]');

  // الواحد والاثنان لهما صيغتان بلا رقم: «بكرا» و«يومين». والرقم مع «2» خطأ
  // نحوي في العربية، فنعرض الكلمة وحدها بدله.
  //
  // و«بكرا» تصحّ صباحاً وتصير كذبةً باردة في الحادية عشرة والنصف، فالليلة
  // الأخيرة تضيق لغتها مع الوقت بدل أن تجمد على كلمة واحدة أربعاً وعشرين ساعة.
  const phrase =
    eve && mins > 360 ? { text: CD.tomorrow, sub: CD.tomorrowSub }
    : b.sleeps === 2 ? { text: CD.two, sub: CD.twoSub }
    : null;

  if (phrase) {
    if (bigWrap) bigWrap.hidden = true;
    if (one) {
      one.hidden = false;
      one.textContent = phrase.text;
    }
    if (label) label.textContent = phrase.sub;
  } else {
    if (bigWrap) bigWrap.hidden = false;
    if (one) one.hidden = true;

    const shown =
      !eve ? { n: b.sleeps, u: dayUnitAr(b.sleeps), l: CD.far }
      : mins > 60 ? { n: b.hours, u: hourUnitAr(b.hours), l: CD.hours }
      : mins > 15 ? { n: mins, u: minuteUnitAr(mins), l: CD.minutes }
      : { n: mins, u: minuteUnitAr(mins), l: CD.close };

    if (big) big.textContent = String(shown.n);
    if (unit) unit.textContent = shown.u;
    if (label) label.textContent = shown.l;
  }

  if (clock) clock.textContent = pad2(b.hours) + ':' + pad2(b.minutes) + ':' + pad2(b.seconds);

  if (fill) {
    const from = countdownStart(target);
    const span = target - from;
    const done = span > 0 ? Math.min(1, Math.max(0, (nowMs() - from) / span)) : 1;
    fill.style.width = (done * 100).toFixed(2) + '%';
  }

  // الإعلان باليوم لا بالثانية: قارئ شاشة ينطق كل ثانية لا يُحتمل
  if (b.sleeps !== lastSleeps) {
    lastSleeps = b.sleeps;
    announce(
      b.sleeps === 1 ? CD.tomorrow
      : b.sleeps === 2 ? CD.two
      : 'باقي ' + b.sleeps + ' ' + dayUnitAr(b.sleeps),
    );
  }
}

/* =========================================================================
   طور العالم البصري
   ========================================================================= */

/**
 * `data-phase` على <html> — يمشي في اتجاه واحد: ليل ثم دفء ثم فجر.
 *
 * الدفء يبدأ في الساعة الأخيرة قبل منتصف الليل ويبقى في مشهد الشمعة —
 * شمعةٌ في وضح النهار ليست شمعة. والفجر يطلع مع الكشف وحده، فيصير طلوع
 * الضوء جزءاً من الهدية لا خلفيةً لها.
 */
function paintPhase(): void {
  const root = document.documentElement;
  const scene = story.current().scene;

  let next: string | null = null;
  if (scene === 'reveal') {
    next = 'dawn';
  } else {
    const b = untilBirthday();
    const soon = !!b && b.sleeps === 1 && b.hours === 0;
    if (scene === 'candle' || soon) next = 'warm';
  }

  if (root.getAttribute('data-phase') === next) return;
  if (next === null) root.removeAttribute('data-phase');
  else root.setAttribute('data-phase', next);
}

/* =========================================================================
   الشمعة
   ========================================================================= */

function runCandle(): void {
  announce(CANDLE.line);
  void startMusic();

  const el = $('[data-candle]');
  const btn = $<HTMLButtonElement>('[data-blow]');
  const out = $('[data-candle-out]');

  // إعادة الإشعال عند كل دخول: من أعادت التجربة من أوّلها تجد شمعةً مطفأة
  el?.classList.remove('out');
  if (out) out.hidden = true;
  if (btn) {
    btn.hidden = false;
    btn.disabled = false;
  }
}

function blowOut(): void {
  const el = $('[data-candle]');
  const btn = $<HTMLButtonElement>('[data-blow]');
  const out = $('[data-candle-out]');
  if (!el || el.classList.contains('out')) return;

  el.classList.add('out');
  if (btn) btn.disabled = true;
  announce(CANDLE.out);

  later(() => {
    if (btn) btn.hidden = true;
    if (out) out.hidden = false;
  }, 500);

  // العتمة تنزل بعد أن ينطفئ اللهب لا معه: الظلام الذي يبتلع الشمعة وهي
  // تنطفئ يخفي اللحظة التي جاءت الشمعة من أجلها.
  later(() => toReveal(), reduced() ? 900 : 1900);
}

/* =========================================================================
   الكشف
   ========================================================================= */

/** ستارة العتمة — تُصنع عند الحاجة وتُرفع بعد أن يبزغ الاسم. */
function blackout(on: boolean): void {
  let el = $('.blackout');
  if (!el && on) {
    el = document.createElement('div');
    el.className = 'blackout';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    // إطار واحد قبل إضافة الصنف، وإلا بدأ الانتقال من حالته النهائية
    void el.offsetWidth;
  }
  el?.classList.toggle('on', on);
}

/** الانتقال إلى الكشف: عتمة كاملة أولاً، ثم يبزغ الاسم منها. */
function toReveal(): void {
  if (reduced()) {
    show(story.go('reveal').scene);
    return;
  }
  blackout(true);
  later(() => {
    show(story.go('reveal').scene);
    // الستارة تُرفع بعد أن يبدأ الاسم بالظهور، فيُرى وهو يخرج من السواد
    later(() => {
      blackout(false);
      later(() => $('.blackout')?.remove(), 1200);
    }, 500);
  }, 900);
}

/**
 * الاحتفال.
 *
 * تسلسلٌ لا رشقةٌ واحدة: الاسم وحده في العتمة، ثم التهنئة، ثم تفتّح ضوء، ثم
 * قلوب، ثم فراشات، ثم الرشقة الكبرى. ما يُطلق دفعةً واحدة يُقرأ ضجيجاً، وما
 * يُطلق على مراحل يُقرأ احتفالاً.
 */
function runReveal(): void {
  const name = $('[data-rev-name]');
  const body = $('[data-rev-body]');
  if (name) name.hidden = false;
  if (body) body.hidden = true;

  announce(REVEAL.name + ' ' + REVEAL.greeting);
  void startMusic();

  if (reduced()) {
    if (name) name.hidden = true;
    if (body) body.hidden = false;
    return;
  }

  // الاسم يقف وحده ثلاث ثوانٍ. الاستعجال هنا يلغي المشهد كلّه.
  later(() => {
    if (name) name.hidden = true;
    if (body) body.hidden = false;
  }, 3000);

  if (story.current().celebrated) return;
  story.markCelebrated();

  later(() => bloom(), 2600);
  later(() => heartRain(), 3800);
  later(() => butterflies(10), 5200);
  later(() => finale(), 6800);
  later(() => burst(null), 8800);
}

/* =========================================================================
   الظهور بالتمرير
   ========================================================================= */

/**
 * ملاحظٌ واحد لكل عناصر `.reveal`.
 *
 * القاعدة في الأنماط تبدأ من `opacity: 0` وتنتظر `.is-visible`، والصنف يأتي
 * من هنا. بلا هذا لا يصل أبداً، فيبقى كل ما تحت العدّاد — رسالة اليوم وزرّ
 * التنبيهات والتذييل — مخفياً بلا أن يبدو معطّلاً: العنصر موجود في الصفحة،
 * وشفافيته صفر، فلا خطأ في وحدة التحكّم ولا شيء ينقص في المصدر.
 *
 * وعند تعذّر الملاحظ أو في الحركة المخفّضة يظهر كل شيء فوراً: الفشل يجب أن
 * يُري المحتوى لا أن يخفيه.
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
  root.classList.toggle('is-waiting', waiting);
  toggle.setAttribute('aria-pressed', String(playing));
  label.textContent = playing ? 'شغالة' : waiting ? 'المسي الشاشة' : 'الأغنية';
  toggle.setAttribute('aria-label', playing ? 'إيقاف الأغنية' : 'تشغيل الأغنية');
}

function initMusic(): void {
  const el = $<HTMLAudioElement>('[data-music-audio]');
  const toggle = $<HTMLButtonElement>('[data-music-toggle]');
  const root = $('[data-music]');
  if (!el || !toggle || !root) return;

  music = initAudio(el);
  root.hidden = true; // المشغّل لا يظهر قبل أن تبدأ الحكاية

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
   الإشعارات
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

function initNotify(): void {
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

  if (notifySupported()) {
    void registerWorker().then((reg) => {
      scheduleNotify();
      initResync();
      void armPush(reg);
    });
  }
}

/* =========================================================================
   لوحة الاختبار المخفية — Shift+L
   ========================================================================= */

const panel = $('[data-committee]');
const panelStatus = $('[data-committee-status]');

function refreshPanel(): void {
  if (!panelStatus) return;
  panelStatus.textContent =
    `${getOffset() ? 'وقت مُحاكى' : 'وقت حقيقي'} — ${damascusClock()} · مشهد: ${story.current().scene}`;
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
        case 'rain':   finale(); break;
        case 'real':   setOffset(0); break;
        case 'reset':
          resetAll();
          story.reset();
          setOffset(0);
          try { localStorage.removeItem(CD_START_KEY); } catch { /* noop */ }
          show('open');
          break;
      }
      scheduleNotify();
      refreshPanel();
      if (story.current().scene === 'countdown') paintCountdown();
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
      /* بلا تخزين لا حارس — نكتفي بعدم إعادة التحميل */
      return;
    }
    location.reload();
  });
}

function boot(): void {
  dropRetiredKeys();
  reloadOnNewWorker();
  logVisit();

  for (const b of $$('[data-next]')) b.addEventListener('click', advance);
  $('[data-tempt]')?.addEventListener('click', tempted);
  $('[data-blow]')?.addEventListener('click', blowOut);

  // ‎$‎ ترجّع عنصراً واحداً — لو صار في الصفحة زرّان بالوسم نفسه فقد الثاني
  // وظيفته بصمت. ‎$$‎ لا تقع في ذلك.
  for (const b of $$('[data-replay]')) {
    b.addEventListener('click', () => {
      story.reset();
      show('open');
      announce(MISC.replayDone);
    });
  }

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

  // يوم عيدها يفتح على الشمعة مباشرة، لا على أوّل التجربة.
  //
  // التمهيد كلّه مبنيّ على الانتظار، ولا معنى لانتظارٍ بعد أن يجيء الموعد.
  // ومن وصلت إلى الشمعة أو تجاوزتها تبقى مكانها.
  const b = untilBirthday();
  const saved = story.current().scene;
  const past = story.SCENES.indexOf(saved) >= story.SCENES.indexOf('candle');
  show(b?.isToday ? story.go(past ? saved : 'candle').scene : saved);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
