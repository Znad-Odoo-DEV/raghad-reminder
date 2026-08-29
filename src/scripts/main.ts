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

import { STORY } from '../site.config';

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
  FRAGMENTS, RPS, MORNING_CHAIN, DISHES_TIMER, COUNTDOWN, BIRTHDAY_COPY,
  AWAY_TITLES, MISC, dayUnitAr, pick,
} from './copy';

import { finale, burst } from './celebrate';
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

/* =========================================================================
   المشاهد
   ========================================================================= */

function show(name: Scene): void {
  for (const el of scenes) el.hidden = el.dataset.scene !== name;

  if (thread) thread.style.width = `${Math.round(story.progress() * 100)}%`;

  // الأدوات الجانبية لا تظهر إلا بعد أن تنتهي الحكاية
  if (after) after.hidden = !(name === 'countdown' || name === 'birthday');

  window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  onEnter(name);
}

/** ما يحتاج تشغيلاً عند دخول مشهد بعينه. */
function onEnter(name: Scene): void {
  window.clearInterval(tickTimer);

  switch (name) {
    case 'fragments': paintFragment(story.current().fragment); break;
    case 'gather':    runGather(); break;
    case 'reveal':    fillBirthdayDate(); break;
    case 'countdown': startCountdown(); break;
    case 'birthday':  runBirthday(); break;
  }
}

function advance(): void {
  show(story.next().scene);
}

/* =========================================================================
   الظروف
   ========================================================================= */

/**
 * الفتح ليس تبديل صورة: الختم ينكسر، ثم يُقلب الغطاء، ثم تطلع الورقة. ننتظر
 * انتهاء ذلك قبل الانتقال، وإلا ضاعت اللحظة التي بُني عليها المشهد.
 */
function openEnvelope(el: HTMLElement): void {
  const scene = el.closest<HTMLElement>('[data-scene]');
  if (!scene || scene.dataset.opening === '1') return;
  scene.dataset.opening = '1';

  for (const b of $$<HTMLButtonElement>('[data-open]', scene)) b.disabled = true;
  $('.env', scene)?.classList.add('is-open');

  // أول ظرف يفتح الأغنية معه — لا عند تحميل الصفحة
  if (STORY.musicOnFirstOpen) void startMusic();

  window.setTimeout(() => {
    scene.dataset.opening = '0';
    for (const b of $$<HTMLButtonElement>('[data-open]', scene)) b.disabled = false;
    $('.env', scene)?.classList.remove('is-open');
    advance();
  }, reduced() ? 120 : 1250);
}

/* =========================================================================
   القصاصات
   ========================================================================= */

const fragNext = $<HTMLButtonElement>('[data-frag-next]');
const fragDots = $('[data-frag-dots]');

function paintFragment(i: number): void {
  const items = $$<HTMLElement>('[data-frag]');
  items.forEach((el) => (el.hidden = Number(el.dataset.frag) !== i));

  if (fragDots) {
    fragDots.innerHTML = items.map((_, n) => `<span class="${n === i ? 'on' : ''}"></span>`).join('');
  }

  const kind = FRAGMENTS[i]?.kind;
  if (fragNext) {
    // التفاعلات تخفي زر المتابعة حتى تنتهي
    fragNext.hidden = kind === 'rps';
    fragNext.textContent = 'كمّلي';
  }

  if (kind === 'chain') runChain();
  if (kind === 'timer') runDishes();
  if (kind === 'rps') runRps();
}

function nextFragment(): void {
  if (story.nextFragment(FRAGMENTS.length)) paintFragment(story.current().fragment);
  else advance();
}

/* ---- سلسلة صباح الخير: تنكشف قطعة قطعة ---- */

function runChain(): void {
  const box = $('[data-chain]');
  if (!box) return;

  box.innerHTML = '';
  const gap = reduced() ? 0 : 620;

  MORNING_CHAIN.forEach((part, i) => {
    const el = document.createElement('span');
    el.textContent = part;
    el.style.animationDelay = `${i * gap}ms`;
    if (reduced()) el.style.animation = 'none';
    box.appendChild(el);
  });
}

/* ---- حجرة ورقة مقص: تعادل مُدبَّر ---- */

function runRps(): void {
  const opts = $('[data-rps-opts]');
  const out = $('[data-rps-out]');
  const mine = $('[data-rps-mine]');
  const verdict = $('[data-rps-verdict]');
  if (!opts || !out || !mine || !verdict) return;

  let round = 0;
  out.hidden = true;

  const render = () => {
    opts.hidden = false;
    opts.innerHTML = '';
    for (const m of RPS.moves) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span aria-hidden="true">${m.sign}</span>${m.label}`;
      b.setAttribute('aria-label', m.label);
      b.addEventListener('click', () => play(m.sign, m.label), { once: true });
      opts.appendChild(b);
    }
  };

  /** «أنا» أختار ما اختارته دائماً — التشابه هو النكتة، لا الفوز. */
  const play = (sign: string, label: string) => {
    opts.hidden = true;
    out.hidden = false;
    mine.innerHTML = `${RPS.mine} <b>${sign}</b> ${label}`;
    verdict.textContent = RPS.verdicts[round] ?? RPS.tie;

    window.setTimeout(() => {
      round += 1;
      if (round < RPS.rounds) {
        out.hidden = true;
        render();
      } else {
        verdict.textContent = RPS.final;
        if (fragNext) {
          fragNext.hidden = false;
          fragNext.textContent = RPS.next;
        }
      }
    }, reduced() ? 300 : 1400);
  };

  render();
}

/* ---- الجلي: الرقم بيركض لتحت ---- */

function runDishes(): void {
  const el = $('[data-dishes]');
  if (!el) return;

  const total = DISHES_TIMER.seconds;
  const fmt = (s: number) => `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;

  if (reduced()) {
    el.textContent = fmt(0);
    return;
  }

  const DURATION = 2200;
  const start = performance.now();
  el.textContent = fmt(total);

  const step = (now: number) => {
    const t = Math.min((now - start) / DURATION, 1);
    // يهبط بسرعة ثم يستقرّ — أطرف من هبوط خطّي
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(Math.round(total * (1 - eased)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* =========================================================================
   التجمّع
   ========================================================================= */

function runGather(): void {
  const box = $('[data-gather]');
  if (!box) return;

  box.innerHTML = '';
  // مواضع ثابتة لا عشوائية: التكوين نفسه في كل مرة، فيبدو مقصوداً
  const spots = [
    { x: 6, y: 8, r: -12 },
    { x: 68, y: 4, r: 9 },
    { x: 2, y: 58, r: 7 },
    { x: 72, y: 62, r: -8 },
    { x: 38, y: 30, r: -3 },
  ];

  for (let i = 0; i < FRAGMENTS.length; i++) {
    const s = spots[i] ?? spots[0]!;
    const piece = document.createElement('i');
    piece.style.insetInlineStart = `${s.x}%`;
    piece.style.insetBlockStart = `${s.y}%`;
    piece.style.transform = `rotate(${s.r}deg)`;
    box.appendChild(piece);
  }

  if (reduced()) {
    window.setTimeout(advance, 900);
    return;
  }

  window.setTimeout(() => {
    for (const piece of $$<HTMLElement>('i', box)) {
      piece.style.insetInlineStart = '50%';
      piece.style.insetBlockStart = '50%';
      piece.style.marginInlineStart = '-22px';
      piece.style.marginBlockStart = '-15px';
      piece.style.transform = 'rotate(0deg) scale(.7)';
    }
  }, 1400);

  window.setTimeout(() => {
    for (const piece of $$<HTMLElement>('i', box)) piece.style.opacity = '0';
  }, 2700);

  window.setTimeout(advance, 3300);
}

/* =========================================================================
   الكشف والعدّاد
   ========================================================================= */

/** التاريخ ليس في الـHTML — يُحقن هنا فقط، وعند الوصول إلى المشهد. */
function fillBirthdayDate(): void {
  const b = untilBirthday();
  if (!b) return;
  const d = $('[data-bd-day]');
  const m = $('[data-bd-month]');
  if (d) d.textContent = pad2(b.day);
  if (m) m.textContent = pad2(b.month);
}

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

  // وصل اليوم — ننتقل لوحدنا
  if (b.isToday) {
    window.clearInterval(tickTimer);
    show(story.go('birthday').scene);
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
  const phrase =
    b.sleeps === 1 ? { text: COUNTDOWN.tomorrow, sub: COUNTDOWN.tomorrowSub }
    : b.sleeps === 2 ? { text: COUNTDOWN.two, sub: COUNTDOWN.twoSub }
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
    if (big) big.textContent = String(b.sleeps);
    if (unit) unit.textContent = dayUnitAr(b.sleeps);
    if (label) label.textContent = COUNTDOWN.label;
  }

  if (clock) clock.textContent = `${pad2(b.hours)}:${pad2(b.minutes)}:${pad2(b.seconds)}`;

  if (fill) {
    const from = countdownStart(target);
    const span = target - from;
    const done = span > 0 ? Math.min(1, Math.max(0, (nowMs() - from) / span)) : 1;
    fill.style.width = `${(done * 100).toFixed(2)}%`;
  }

  if (b.sleeps !== lastSleeps) {
    lastSleeps = b.sleeps;
    announce(
      b.sleeps === 1 ? COUNTDOWN.tomorrow
      : b.sleeps === 2 ? COUNTDOWN.two
      : `باقي ${b.sleeps} ${dayUnitAr(b.sleeps)}`,
    );
  }
}

/* =========================================================================
   عيد الميلاد
   ========================================================================= */

function runBirthday(): void {
  announce(BIRTHDAY_COPY.greeting);
  void startMusic();

  if (story.current().celebrated) return;
  story.markCelebrated();

  if (reduced()) return;
  window.setTimeout(() => finale(), 700);
  window.setTimeout(() => burst(null), 2600);
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
          show('intro');
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

  for (const b of $$('[data-open]')) b.addEventListener('click', () => openEnvelope(b));
  for (const b of $$('[data-next]')) b.addEventListener('click', advance);
  fragNext?.addEventListener('click', nextFragment);

  $('[data-replay]')?.addEventListener('click', () => {
    story.reset();
    show('intro');
    announce(MISC.replayDone);
  });

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

  // لو وصل يوم العيد وقد بلغت القصة مرحلة الكشف، نفتح على الاحتفال مباشرة
  const b = untilBirthday();
  const saved = story.current().scene;
  const reached = story.SCENES.indexOf(saved) >= story.SCENES.indexOf('reveal');
  show(b?.isToday && reached ? story.go('birthday').scene : saved);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
