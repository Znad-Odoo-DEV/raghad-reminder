/**
 * main.ts — تشغيل النظام
 *
 * Reads a DoseSnapshot once per second and paints it. All DOM writes happen in
 * `paint()`; nothing else touches the document, which keeps the state machine
 * honest and makes the hidden simulator (لجنة الدواء العليا) trustworthy.
 */

import {
  snapshot,
  lateAr,
  humanRemaining,
  setOffset,
  getOffset,
  damascusTodayAt,
  damascusClock,
  DOSE_HOUR,
  type DoseSnapshot,
  type Phase,
} from './schedule';

import { loadDay, patchDay, bumpStreak, resetAll, type DayState } from './store';

import {
  STATUS,
  SUCCESS_FLAVOR,
  NAG_EARLY,
  NAG_LATE,
  NAG_VERY_LATE,
  PILL_TAPS,
  AWAY_TITLES,
  EGG_TOASTS,
  snoozeLine,
  pick,
} from './copy';

import { burst, pillRain } from './celebrate';
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

const body = document.body;
const card = $('[data-card]');
const pillBtn = $<HTMLButtonElement>('[data-pill]');
const chip = $('[data-phase-chip]');
const elLabel = $('[data-status-label]');
const elTitle = $('[data-status-title]');
const elNote = $('[data-status-note]');
const elLateChip = $('[data-late-chip]');
const elWhisper = $('[data-whisper]');
const elNextDose = $('[data-next-dose]');
const elFlavor = $('[data-success-flavor]');
const live = $('#live-region');

const panels = {
  live: $('[data-panel="live"]'),
  success: $('[data-panel="success"]'),
};

const units: Record<'h' | 'm' | 's', HTMLElement | null> = {
  h: $('[data-unit="h"]'),
  m: $('[data-unit="m"]'),
  s: $('[data-unit="s"]'),
};

const BASE_TITLE = document.title;

/* =========================================================================
   حالة التشغيل
   ========================================================================= */

let day: DayState = loadDay();
let lastPhase: Phase | 'snoozed' | null = null;
/** هل ضغطت "لسا شوي" في هذه الجلسة؟ (لا يُحفظ — التأجيل مزاج لحظي) */
let snoozing = false;
let lastWhisperIndex = -1;
let whisperTimer = 0;

const pad = (n: number) => String(n).padStart(2, '0');

/* =========================================================================
   الرسم
   ========================================================================= */

function setDigit(el: HTMLElement | null, value: string): void {
  if (!el || el.textContent === value) return;
  el.textContent = value;
  el.classList.remove('is-tick');
  // إعادة تشغيل الأنيميشن
  void el.offsetWidth;
  el.classList.add('is-tick');
}

function showGroup(name: 'before' | 'due' | 'snoozed' | 'taken'): void {
  for (const group of $$('[data-actions-group]')) {
    group.hidden = group.dataset.actionsGroup !== name;
  }
}

function showPanel(which: 'live' | 'success'): void {
  if (panels.live) panels.live.hidden = which !== 'live';
  if (panels.success) panels.success.hidden = which !== 'success';
}

const CHIP_TEXT: Record<Phase, string> = {
  before: 'قيد المتابعة',
  due: 'الآن ⏰',
  late: 'متأخرة',
  taken: 'مكتملة ✅',
};

function paint(snap: DoseSnapshot): void {
  const uiState: Phase | 'snoozed' =
    snoozing && (snap.phase === 'due' || snap.phase === 'late') ? 'snoozed' : snap.phase;

  // ---- الأرقام -----------------------------------------------------------
  setDigit(units.h, pad(snap.parts.hours));
  setDigit(units.m, pad(snap.parts.minutes));
  setDigit(units.s, pad(snap.parts.seconds));

  if (elNextDose) {
    elNextDose.textContent = `${pad(snap.parts.hours)}:${pad(snap.parts.minutes)}:${pad(snap.parts.seconds)}`;
  }

  // ---- التأخير ------------------------------------------------------------
  if (elLateChip) {
    if (snap.phase === 'late') {
      elLateChip.hidden = false;
      elLateChip.textContent = `متأخرة ${lateAr(snap.lateMinutes)}. 😐`;
    } else {
      elLateChip.hidden = true;
    }
  }

  // ---- ما يتغيّر عند تبدّل الحالة فقط -------------------------------------
  if (uiState === lastPhase) return;
  lastPhase = uiState;

  body.dataset.phase = snap.phase;
  if (chip) chip.textContent = CHIP_TEXT[snap.phase];

  const copy = STATUS[snap.phase];
  if (elLabel) {
    elLabel.textContent =
      snap.phase === 'late'
        ? 'مرّ على الموعد'
        : snap.isTomorrow
          ? 'جرعة بكرا بعد'
          : copy.label;
  }
  if (elTitle) elTitle.textContent = copy.title;
  if (elNote) elNote.textContent = copy.note;

  showPanel(snap.phase === 'taken' ? 'success' : 'live');

  if (snap.phase === 'taken') showGroup('taken');
  else if (uiState === 'snoozed') showGroup('snoozed');
  else if (snap.phase === 'before') showGroup('before');
  else showGroup('due');

  announce(snap);
  scheduleWhisper();
}

/** إعلان لقارئات الشاشة — عند تغيّر الحالة فقط، لا كل ثانية. */
function announce(snap: DoseSnapshot): void {
  if (!live) return;
  if (snap.phase === 'taken') {
    live.textContent = 'تم تسجيل جرعة اليوم بنجاح.';
  } else if (snap.phase === 'before') {
    live.textContent = `الجرعة القادمة بعد ${humanRemaining(snap.parts)}.`;
  } else if (snap.phase === 'due') {
    live.textContent = 'حان وقت الدواء الآن.';
  } else {
    live.textContent = `متأخرة عن موعد الدواء بـ ${lateAr(snap.lateMinutes)}.`;
  }
}

/* =========================================================================
   همسات النظام
   ========================================================================= */

function whisperPool(snap: DoseSnapshot): readonly string[] {
  if (snap.phase === 'taken') return SUCCESS_FLAVOR;
  if (snap.phase === 'before') return NAG_EARLY;
  if (snap.lateMinutes >= 30) return NAG_VERY_LATE;
  return NAG_LATE;
}

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
    const fresh = snapshot(loadDay().taken);
    const { text, index } = pick(whisperPool(fresh), lastWhisperIndex);
    lastWhisperIndex = index;
    say(text);
  };
  rotate();
  whisperTimer = window.setInterval(rotate, 9000);
}

/* =========================================================================
   الأفعال
   ========================================================================= */

function takeDose(source?: Element | null): void {
  const snap = snapshot(false);
  day = patchDay({ taken: true, takenAt: new Date().toISOString() });
  const streak = bumpStreak(snap.dayKey);
  snoozing = false;

  burst(source);

  // نجبر إعادة الرسم حتى لو كانت الحالة تبدو متطابقة
  lastPhase = null;
  tick();

  if (elFlavor) {
    elFlavor.textContent =
      streak.count > 1
        ? `${streak.count} أيام ورا بعض. رغد، شكلك بلشتي تحبي الموضوع 👀`
        : 'نشوفك بكرا بنفس الموعد… لا تعملي حالك نسيتي 😌';
  }

  scheduleNotify();

  // نقفل على منطقة النجاح حتى تكون واضحة على الموبايل
  card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function snooze(): void {
  const next = patchDay({ snoozes: loadDay().snoozes + 1 });
  day = next;
  snoozing = true;
  lastPhase = null;
  tick();

  window.clearInterval(whisperTimer);
  say(snoozeLine(next.snoozes));

  // بعد صمت قصير يرجع النظام لطبيعته… أي إلى الإلحاح
  window.setTimeout(() => {
    const snap = snapshot(loadDay().taken);
    if (snap.phase !== 'taken') scheduleWhisper();
  }, 11000);
}

function undo(): void {
  day = patchDay({ taken: false, takenAt: null });
  snoozing = false;
  lastPhase = null;
  tick();
  say('اعتراف متأخر بس محترم. رجعنا للمربع الأول. 🙃');
}

/* =========================================================================
   النبضة
   ========================================================================= */

function tick(): void {
  const fresh = loadDay();
  // انقلاب اليوم والصفحة مفتوحة، أو تعديل من تبويب آخر
  if (fresh.dayKey !== day.dayKey || fresh.taken !== day.taken) {
    day = fresh;
    lastPhase = null;
  }
  paint(snapshot(day.taken));
}

/* =========================================================================
   البيض المخفي 🥚
   ========================================================================= */

function initEggs(): void {
  // 1) النقر على حبة الدواء
  pillBtn?.addEventListener('click', () => {
    const taps = loadDay().pillTaps + 1;
    day = patchDay({ pillTaps: taps });

    pillBtn.classList.remove('is-shaking');
    void pillBtn.offsetWidth;
    pillBtn.classList.add('is-shaking');

    const line = PILL_TAPS[taps];
    if (line) say(line);
    if (taps === 12) pillRain();
    if (taps > 12 && taps % 7 === 0) {
      say('ما عاد في رسائل. في بس حبة، وأنت، والوقت. 🧘');
    }
  });

  // 2) حبة الفوتر
  $('[data-foot-egg]')?.addEventListener('click', () => {
    pillRain();
    say(EGG_TOASTS.bottom);
  });

  // 3) نسخ نص من الصفحة
  document.addEventListener('copy', () => say(EGG_TOASTS.copy), { passive: true });

  // 4) تغيير عنوان التبويب عند الخروج
  let awayIndex = -1;
  document.addEventListener('visibilitychange', () => {
    const snap = snapshot(loadDay().taken);
    if (document.hidden && (snap.phase === 'due' || snap.phase === 'late')) {
      const { text, index } = pick(AWAY_TITLES, awayIndex);
      awayIndex = index;
      document.title = text;
    } else {
      document.title = BASE_TITLE;
      if (!document.hidden) tick();
    }
  });

  // 5) لجنة الدواء العليا — ثلاث نقرات على تسميات العدّاد، أو Shift+L
  let taps = 0;
  let tapTimer = 0;
  for (const label of $$('.unit__k')) {
    label.addEventListener('click', () => {
      taps += 1;
      window.clearTimeout(tapTimer);
      tapTimer = window.setTimeout(() => (taps = 0), 1500);
      if (taps >= 3) {
        taps = 0;
        openCommittee();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'L' || e.key === 'l')) openCommittee();
    if (e.key === 'Escape') closeCommittee();
  });
}

/* =========================================================================
   لجنة الدواء العليا (محاكي الوقت)
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
  lastPhase = null;
  tick();
  refreshCommitteeStatus();
}

function initCommittee(): void {
  for (const el of $$('[data-committee-close]')) {
    el.addEventListener('click', closeCommittee);
  }

  for (const btn of $$<HTMLButtonElement>('[data-sim]')) {
    btn.addEventListener('click', () => {
      switch (btn.dataset.sim) {
        case 'before':   simulateAt(DOSE_HOUR - 1, 15); break;
        case 'due':      simulateAt(DOSE_HOUR, 0); break;
        case 'late':     simulateAt(DOSE_HOUR, 23); break;
        case 'verylate': simulateAt(DOSE_HOUR + 2, 40); break;
        case 'real':
          setOffset(0);
          lastPhase = null;
          tick();
          refreshCommitteeStatus();
          break;
        case 'reset':
          resetAll();
          setOffset(0);
          snoozing = false;
          day = loadDay();
          lastPhase = null;
          tick();
          refreshCommitteeStatus();
          say(EGG_TOASTS.reset);
          break;
      }
    });
  }
}

/* =========================================================================
   التنبيهات
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
      notifBtn.textContent = 'جرّبيه هلق 👀';
      notifBtn.dataset.notifTest = '1';
      notifBadge.classList.add('opt__badge--on');
      notifBadge.textContent = 'مفعّل ✓';
      notifStatus.textContent = 'صرنا رسميين 🤝 من 10:55 كل دقيقة لـ11:00 — طالما الصفحة مفتوحة.';
      break;
    case 'denied':
      notifBtn.hidden = true;
      notifBadge.classList.add('opt__badge--off');
      notifBadge.textContent = 'مرفوض';
      notifStatus.textContent =
        'رفضتينا من قبل 💔 فعّليه من إعدادات الموقع بالمتصفح، أو خدي التقويم.';
      break;
    default:
      notifBtn.hidden = false;
      notifBadge.classList.add('opt__badge--soft');
      notifBadge.textContent = 'اختياري';
      notifStatus.textContent = 'لسا ما فعّلتيه. الدوا لاحظ.';
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
    if (notifyState() === 'granted') say('تمام، صار عندك تنبيه. بس التقويم أضمن 😌');
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
 * وضعان: ملف محلي (<audio>) أو مشغّل يوتيوب الرسمي — يحدّده وجود الملف وقت البناء.
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
      playing ? 'إيقاف أغنية جيتني صدفة' : 'تشغيل أغنية جيتني صدفة لأحمد علوي',
    );
  };

  /* ---------- الوضع الأول: ملف محلي ---------- */
  const el = $<HTMLAudioElement>('[data-music-audio]');
  if (root.dataset.mode === 'local' && el) {
    const handle = initAudio(el);

    toggle.addEventListener('click', async () => {
      const playing = await handle.toggle();
      setUi(playing);
      if (playing) say('حطّينا أحمد علوي. الجو صار مناسب لأخذ الدوا 🎶');
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
      `title="كل القصايد — مروان خوري" ` +
      `allow="autoplay; encrypted-media; picture-in-picture" ` +
      `allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    cardEl.hidden = false;
    setUi(true);
    say('حطّينا مروان خوري. الجو صار مناسب لأخذ الدوا 🎶');
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
  // الأزرار
  for (const btn of $$<HTMLButtonElement>('[data-act]')) {
    btn.addEventListener('click', () => {
      if (btn.dataset.act === 'take') takeDose(btn);
      else if (btn.dataset.act === 'snooze') snooze();
      else if (btn.dataset.act === 'undo') undo();
    });
  }

  initEggs();
  initCommittee();
  initReveal();
  initNotify();
  initMusic();

  tick();
  window.setInterval(tick, 1000);

  // نبضة ترحيب بعد ما توصل الحبة إلى البطاقة
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
