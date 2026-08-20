/**
 * music.ts — موسيقى الخلفية
 *
 * عن التشغيل التلقائي: كل المتصفحات تمنع تشغيل الصوت تلقائياً قبل أي تفاعل
 * من المستخدمة. لا توجد حيلة برمجية تتجاوز هذا — إنها سياسة متصفح لا قيد كود.
 * لذلك نحاول التشغيل فوراً، وإن رُفض نُسلّح أول لمسة/ضغطة/سكرول لتبدأ الموسيقى
 * عندها. النتيجة عملياً: تشتغل لوحدها بمجرد أن تلمس رغد الصفحة.
 *
 * الحالة تُحفظ، فإن أوقفتها لا نُزعجها بتشغيلها من جديد في الزيارة القادمة.
 */

const PREF_KEY = 'raghd:music:v1';

/** مستوى صوت خلفية مريح — ليست حفلة. */
const TARGET_VOLUME = 0.35;
const FADE_MS = 1600;

type Pref = 'on' | 'off';

let audio: HTMLAudioElement | null = null;
let armed = false;
let fadeRaf = 0;

/* ------------------------------------------------------------ التفضيل */

function readPref(): Pref {
  try {
    return localStorage.getItem(PREF_KEY) === 'off' ? 'off' : 'on';
  } catch {
    return 'on';
  }
}

function writePref(p: Pref): void {
  try {
    localStorage.setItem(PREF_KEY, p);
  } catch {
    /* noop */
  }
}

/* -------------------------------------------------------------- التلاشي */

/** رفع الصوت تدريجياً — البدء المفاجئ بصوت كامل مزعج. */
function fadeTo(target: number): void {
  if (!audio) return;
  cancelAnimationFrame(fadeRaf);
  const from = audio.volume;
  const start = performance.now();

  const step = (now: number) => {
    if (!audio) return;
    // طابع rAF الزمني قد يسبق performance.now() المأخوذ قبله بجزء من
    // الميلي ثانية، فيصير t سالباً والصوت خارج المدى ويرمي استثناءً.
    const t = Math.min(Math.max((now - start) / FADE_MS, 0), 1);
    audio.volume = Math.min(1, Math.max(0, from + (target - from) * t));
    if (t < 1) fadeRaf = requestAnimationFrame(step);
  };
  fadeRaf = requestAnimationFrame(step);
}

/* -------------------------------------------------------------- التشغيل */

async function attempt(): Promise<boolean> {
  if (!audio) return false;
  try {
    audio.volume = 0;
    await audio.play();
    fadeTo(TARGET_VOLUME);
    return true;
  } catch {
    return false;
  }
}

/**
 * يُسلّح أول تفاعل حقيقي ليبدأ الصوت.
 * نستمع لعدة أحداث لأن "أول تفاعل" يختلف: لمسة على الموبايل، نقرة على
 * سطح المكتب، أو حتى سكرول.
 */
function armFirstGesture(onStart?: () => void): void {
  if (armed) return;
  armed = true;

  const events = ['pointerdown', 'touchstart', 'keydown', 'scroll', 'wheel'] as const;

  const go = async () => {
    if (readPref() === 'off') return release();
    const ok = await attempt();
    if (ok) {
      release();
      onStart?.();
    }
  };

  const release = () => {
    for (const e of events) window.removeEventListener(e, go);
    armed = false;
  };

  for (const e of events) {
    window.addEventListener(e, go, { passive: true });
  }
}

/* ---------------------------------------------------------------- الواجهة */

export interface MusicHandle {
  /** هل الصوت يعمل الآن؟ */
  playing(): boolean;
  /** تشغيل/إيقاف يدوي. يرجع الحالة الجديدة. */
  toggle(): Promise<boolean>;
  /** يبدأ محاولة التشغيل التلقائي. */
  boot(onStart?: () => void): Promise<'playing' | 'waiting' | 'off'>;
}

export function initAudio(el: HTMLAudioElement): MusicHandle {
  audio = el;
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;

  return {
    playing: () => !!audio && !audio.paused,

    async toggle() {
      if (!audio) return false;
      if (audio.paused) {
        writePref('on');
        const ok = await attempt();
        if (!ok) armFirstGesture();
        return ok;
      }
      writePref('off');
      cancelAnimationFrame(fadeRaf);
      audio.pause();
      return false;
    },

    async boot(onStart) {
      if (readPref() === 'off') return 'off';
      if (await attempt()) return 'playing';
      // مرفوض بسبب سياسة التشغيل التلقائي — ننتظر أول لمسة.
      armFirstGesture(onStart);
      return 'waiting';
    },
  };
}
