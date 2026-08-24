/**
 * main.ts — تشغيل الموقع
 *
 * يقرأ الوقت مرة كل ثانية ويرسمه. كل الكتابة في الـDOM تحدث داخل `paint()`؛
 * لا شيء غيرها يلمس الصفحة، وهذا ما يجعل محاكي الوقت المخفي (لجنة اللطافة
 * العليا) صادقاً: نغيّر مصدر الوقت فقط، فيتبعه كل شيء.
 */

import {
  sinceCoincidence,
  sinceFirstTalk,
  humanSince,
  daysAr,
  setOffset,
  getOffset,
  damascusTodayAt,
  damascusClock,
  SWEET_HOUR,
  type SinceSnapshot,
} from './schedule';

import { loadDay, patchDay, bumpStreak, resetAll, dropRetiredKeys, type DayState } from './store';

import {
  GRACE,
  LATAFA,
  HEART_TAPS,
  HEART_TAPS_AFTER,
  AWAY_TITLES,
  EGG_TOASTS,
  thanksLine,
  pick,
} from './copy';

import { burst, heartRain, butterflies } from './celebrate';
import { initAudio } from './music';

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
   مراجع DOM
   ========================================================================= */

const $ = <T extends Element = HTMLElement>(sel: string) =>
  document.querySelector(sel) as T | null;
const $$ = <T extends Element = HTMLElement>(sel: string) =>
  Array.from(document.querySelectorAll(sel)) as T[];

const card = $('[data-card]');
const heartBtn = $<HTMLButtonElement>('[data-heart]');
const elWhisper = $('[data-whisper]');
const elThanksHint = $('[data-thanks-hint]');
const elTalk = $('[data-talk]');
const live = $('#live-region');

const units: Record<'d' | 'h' | 'm' | 's', HTMLElement | null> = {
  d: $('[data-unit="d"]'),
  h: $('[data-unit="h"]'),
  m: $('[data-unit="m"]'),
  s: $('[data-unit="s"]'),
};

const dayLabel = $('[data-unit-k="d"]');

const BASE_TITLE = document.title;

/* =========================================================================
   حالة التشغيل
   ========================================================================= */

let day: DayState = loadDay();
let lastDays = -1;
let lastWhisperIndex = -1;
let lastThanksIndex = -1;
let whisperTimer = 0;

const pad = (n: number) => String(n).padStart(2, '0');

/* =========================================================================
   الرسم
   ========================================================================= */

function setText(el: HTMLElement | null, value: string): void {
  if (!el || el.textContent === value) return;
  el.textContent = value;
}

/** الأيام هي الرقم البطل — تستحق أنيميشن عند التغيّر، بخلاف الثواني. */
function setDays(el: HTMLElement | null, value: string): void {
  if (!el || el.textContent === value) return;
  el.textContent = value;
  el.classList.remove('is-tick');
  void el.offsetWidth; // إعادة تشغيل الأنيميشن
  el.classList.add('is-tick');
}

function paint(): void {
  const s = sinceCoincidence();
  if (s) {
    setDays(units.d, String(s.days));
    setText(units.h, pad(s.hours));
    setText(units.m, pad(s.minutes));
    setText(units.s, pad(s.seconds));

    if (s.days !== lastDays) {
      lastDays = s.days;
      announce(s);
    }
  }

  const t = sinceFirstTalk();
  if (t && elTalk) setText(elTalk, daysAr(t.days));
}

/** إعلان لقارئات الشاشة — عند تغيّر اليوم فقط، لا كل ثانية. */
function announce(s: SinceSnapshot): void {
  if (!live) return;
  live.textContent = `مرّ من يوم الصدفة ${humanSince(s)}. ${GRACE.title}`;
}

/* =========================================================================
   همسات اللطافة
   ========================================================================= */

function say(text: string): void {
  if (!elWhisper) return;
  elWhisper.classList.add('is-swapping');
  window.setTimeout(() => {
    elWhisper.textContent = text;
    elWhisper.classList.remove('is-swapping');
  }, 220);
}

function scheduleWhisper(): void {
  window.clearInterval(whisperTimer);
  const rotate = () => {
    const { text, index } = pick(LATAFA, lastWhisperIndex);
    lastWhisperIndex = index;
    say(text);
  };
  rotate();
  whisperTimer = window.setInterval(rotate, 9000);
}

/* =========================================================================
   الأفعال
   ========================================================================= */

function thanks(source?: Element | null): void {
  const next = patchDay({ thanks: loadDay().thanks + 1 });
  day = next;

  burst(source);

  const { text, index } = thanksLine(next.thanks, lastThanksIndex);
  lastThanksIndex = index;

  // نوقف الدوران لحظة حتى تُقرأ الجملة، ثم نرجع للهمسات
  window.clearInterval(whisperTimer);
  say(text);
  window.setTimeout(scheduleWhisper, 9000);

  if (elThanksHint) {
    elThanksHint.textContent =
      next.thanks >= 5
        ? `قلتيها ${next.thanks} مرات اليوم. ولا مرة زادت عن اللزوم 🤍`
        : 'اضغطي، وأنا كمان رح قولها معك.';
  }
}

/* =========================================================================
   النبضة
   ========================================================================= */

function tick(): void {
  const fresh = loadDay();
  // انقلاب اليوم والصفحة مفتوحة، أو تعديل من تبويب آخر
  if (fresh.dayKey !== day.dayKey) day = fresh;
  paint();
}

/* =========================================================================
   البيض المخفي 🥚
   ========================================================================= */

function initEggs(): void {
  // 1) النقر على القلب
  heartBtn?.addEventListener('click', () => {
    const taps = loadDay().heartTaps + 1;
    day = patchDay({ heartTaps: taps });

    heartBtn.classList.remove('is-beating');
    void heartBtn.offsetWidth;
    heartBtn.classList.add('is-beating');

    butterflies(taps >= 8 ? 18 : 10);

    const line = HEART_TAPS[taps];
    if (line) say(line);
    if (taps === 12) heartRain();
    if (taps > 12 && taps % 7 === 0) say(HEART_TAPS_AFTER);
  });

  // 2) قلب الفوتر
  $('[data-foot-egg]')?.addEventListener('click', () => {
    heartRain();
    say(EGG_TOASTS.bottom);
  });

  // 3) نسخ نص من الصفحة
  document.addEventListener('copy', () => say(EGG_TOASTS.copy), { passive: true });

  // 4) تغيير عنوان التبويب عند الخروج
  let awayIndex = -1;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      const { text, index } = pick(AWAY_TITLES, awayIndex);
      awayIndex = index;
      document.title = text;
    } else {
      document.title = BASE_TITLE;
      tick();
    }
  });

  // 5) لجنة اللطافة العليا — ثلاث نقرات على تسمية «يوم»، أو Shift+L
  let taps = 0;
  let tapTimer = 0;
  dayLabel?.addEventListener('click', () => {
    taps += 1;
    window.clearTimeout(tapTimer);
    tapTimer = window.setTimeout(() => (taps = 0), 1500);
    if (taps >= 3) {
      taps = 0;
      openCommittee();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'L' || e.key === 'l')) openCommittee();
    if (e.key === 'Escape') closeCommittee();
  });
}

/* =========================================================================
   لجنة اللطافة العليا (محاكي الوقت)
   ========================================================================= */

const committee = $('[data-committee]');
const committeeStatus = $('[data-committee-status]');
let lastFocused: HTMLElement | null = null;

function openCommittee(): void {
  if (!committee || !committee.hidden) return;
  lastFocused = document.activeElement as HTMLElement | null;
  committee.hidden = false;
  say(EGG_TOASTS.panel);
  committee.querySelector<HTMLButtonElement>('.committee__x')?.focus();
  refreshCommitteeStatus();
}

function closeCommittee(): void {
  if (!committee || committee.hidden) return;
  committee.hidden = true;
  lastFocused?.focus();
}

function refreshCommitteeStatus(): void {
  if (!committeeStatus) return;
  committeeStatus.textContent = getOffset()
    ? `الوقت مُحاكى الآن: ${damascusClock()} بتوقيت سوريا`
    : `الوقت حقيقي — الساعة ${damascusClock()} بتوقيت سوريا.`;
}

/** يضبط الإزاحة بحيث تصبح "الآن" هي الساعة المطلوبة اليوم بتوقيت دمشق. */
function simulateAt(hour: number, minute: number): void {
  const real = Date.now();
  setOffset(damascusTodayAt(hour, minute, real) - real);
  tick();
  scheduleNotify();
  refreshCommitteeStatus();
}

function initCommittee(): void {
  for (const el of $$('[data-committee-close]')) {
    el.addEventListener('click', closeCommittee);
  }

  for (const btn of $$<HTMLButtonElement>('[data-sim]')) {
    btn.addEventListener('click', () => {
      switch (btn.dataset.sim) {
        case 'before': simulateAt(SWEET_HOUR - 1, 15); break;
        case 'due':    simulateAt(SWEET_HOUR, 0); break;
        case 'after':  simulateAt(SWEET_HOUR + 2, 40); break;
        case 'rain':
          heartRain();
          butterflies(16);
          break;
        case 'real':
          setOffset(0);
          tick();
          scheduleNotify();
          refreshCommitteeStatus();
          break;
        case 'reset':
          resetAll();
          setOffset(0);
          day = loadDay();
          lastDays = -1;
          tick();
          refreshCommitteeStatus();
          say(EGG_TOASTS.reset);
          break;
      }
    });
  }
}

/* =========================================================================
   جرعة اللطافة — الإشعارات
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
      notifStatus.textContent = 'صرنا رسميين 🤝 جملة وحدة كل يوم — طالما الصفحة مفتوحة.';
      break;
    case 'denied':
      notifBtn.hidden = true;
      notifBadge.classList.add('opt__badge--off');
      notifBadge.textContent = 'مرفوض';
      notifStatus.textContent =
        'رفضتينا من قبل 🤍 فعّليها من إعدادات الموقع بالمتصفح، أو خدي التقويم.';
      break;
    default:
      notifBtn.hidden = false;
      notifBadge.classList.add('opt__badge--soft');
      notifBadge.textContent = 'اختياري';
      notifStatus.textContent = 'لسا ما فعّلتيه. ولا مشكلة أبداً.';
  }
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
    notifBtn.disabled = false;
    paintNotify();
    if (notifyState() === 'granted') say('تمام. صار عندك جملة حلوة كل يوم 🤍');
  });

  paintNotify();

  if (notifySupported()) {
    void registerWorker().then(() => {
      scheduleNotify();
      initResync();
    });
  }
}

/* =========================================================================
   الموسيقى
   ========================================================================= */

/**
 * وضعان: ملف محلي (<audio>) أو مشغّل يوتيوب — يحدّده وجود الملف وقت البناء.
 *
 * التشغيل التلقائي بصوت ممنوع في كل المتصفحات قبل أي تفاعل، فلا نحاول خداعه:
 * نجرّب التشغيل فوراً، وإن رُفض ننتظر أول لمسة/سكرول من رغد فتبدأ عندها.
 */
function initMusic(): void {
  const root = $('[data-music]');
  const toggle = $<HTMLButtonElement>('[data-music-toggle]');
  const label = $('[data-music-label]');
  if (!root || !toggle || !label) return;

  const setUi = (playing: boolean, waiting = false) => {
    root.classList.toggle('is-playing', playing);
    root.classList.toggle('is-waiting', waiting);
    toggle.setAttribute('aria-pressed', String(playing));
    label.textContent = playing ? 'الأغنية شغالة' : waiting ? 'المسي الشاشة' : 'شغّلي الأغنية';
    toggle.setAttribute(
      'aria-label',
      playing ? 'إيقاف أغنية عيني اليمين' : 'تشغيل أغنية عيني اليمين لحمد العامري',
    );
  };

  /* ---------- الوضع الأول: ملف محلي ---------- */
  const el = $<HTMLAudioElement>('[data-music-audio]');
  if (root.dataset.mode === 'local' && el) {
    const handle = initAudio(el);

    toggle.addEventListener('click', async () => {
      const playing = await handle.toggle();
      setUi(playing);
      if (playing) say('حطّينا حمد العامري — عيني اليمين 🎶');
    });

    el.addEventListener('play', () => setUi(true));
    el.addEventListener('pause', () => setUi(false));

    void handle.boot(() => setUi(true)).then((res) => {
      setUi(res === 'playing', res === 'waiting');
    });
    return;
  }

  /* ---------- الوضع الثاني: يوتيوب ---------- */
  const cardEl = $('[data-music-card]');
  const frame = $('[data-music-frame]');
  const closeBtn = $<HTMLButtonElement>('[data-music-close]');
  if (!cardEl || !frame || !closeBtn) return;

  const videoId = frame.dataset.video ?? '';

  const start = () => {
    // playlist=<id> مع loop=1 هي الطريقة الوحيدة لتكرار فيديو مفرد.
    const params = new URLSearchParams({
      autoplay: '1', loop: '1', playlist: videoId,
      rel: '0', playsinline: '1', modestbranding: '1',
    });
    frame.innerHTML =
      `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?${params}" ` +
      `title="عيني اليمين — حمد العامري" ` +
      `allow="autoplay; encrypted-media; picture-in-picture" ` +
      `allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    cardEl.hidden = false;
    setUi(true);
    say('حطّينا حمد العامري — عيني اليمين 🎶');
  };

  const stop = () => {
    frame.innerHTML = '';   // إزالة الإطار توقف الصوت فوراً
    cardEl.hidden = true;
    setUi(false);
  };

  toggle.addEventListener('click', () => (cardEl.hidden ? start() : stop()));
  closeBtn.addEventListener('click', stop);
}

/* =========================================================================
   كشف التمرير — مراقب واحد للجميع
   ========================================================================= */

function initReveal(): void {
  const items = $$('.reveal');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );

  items.forEach((el) => io.observe(el));
}

/* =========================================================================
   الإقلاع
   ========================================================================= */

function boot(): void {
  dropRetiredKeys();

  for (const btn of $$<HTMLButtonElement>('[data-act="thanks"]')) {
    btn.addEventListener('click', () => thanks(btn));
  }

  initEggs();
  initCommittee();
  initReveal();
  initNotify();
  initMusic();

  tick();
  window.setInterval(tick, 1000);

  // سلسلة الزيارات — نحكي عنها فقط إذا كانت تستحق
  const streak = bumpStreak(day.dayKey);
  scheduleWhisper();
  if (streak.count > 1) {
    window.setTimeout(
      () => say(`${streak.count} أيام ورا بعض وأنتِ عم تفوتي هون. شكراً 🤍`),
      2600,
    );
  }

  // نبضة ترحيب بعد ما يوصل القلب إلى البطاقة
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.setTimeout(() => {
      card?.classList.add('is-armed');
      window.setTimeout(() => card?.classList.remove('is-armed'), 900);
    }, 1150);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
