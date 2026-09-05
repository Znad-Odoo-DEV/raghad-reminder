/**
 * story.ts — آلة حالة القصة
 *
 * القصة مشاهد متتابعة لا أقسام تُمرَّر. مشهد واحد على الشاشة، والانتقال بلمسة
 * لا بسكرول — وهذا وحده الفرق بين إحساس «موقع» وإحساس «حكاية».
 *
 * الحالة تُحفظ محلياً فتُستأنف من حيث وقفت. لا شيء منها يغادر الجهاز.
 */

import { STORY } from '../site.config';

export const SCENES = [
  'open',       // العتبة — نقطة ضوء وسؤال
  'file',       // ملفّ سرّي: PROJECT · RAGHD
  'clues',      // كلمات تمرّ وتختفي
  'joke',       // نهاية مزيّفة… ثم مزحة
  'button',     // «لا تكبسي هون»
  'loading',    // عم نحضّر المفاجأة
  'name',       // نقاط تتجمّع فتكتب اسمها
  'countdown',  // العدّ — يضيق مع الوقت
  'candle',     // الشمعة — بعد منتصف الليل
  'reveal',     // العتمة ثم الضوء ثم الاحتفال
] as const;

export type Scene = (typeof SCENES)[number];

const KEY = 'raghd:story:v1';

export interface StoryState {
  scene: Scene;
  /** هل شاهدت الكشف مرة؟ يمنع تكرار الرشقة الكبيرة */
  celebrated: boolean;
}

const START: StoryState = { scene: 'open', celebrated: false };

function isScene(v: unknown): v is Scene {
  return typeof v === 'string' && (SCENES as readonly string[]).includes(v);
}

function read(): StoryState {
  if (!STORY.resume) return { ...START };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...START };
    const p = JSON.parse(raw) as Partial<StoryState>;
    return {
      scene: isScene(p.scene) ? p.scene : START.scene,
      celebrated: Boolean(p.celebrated),
    };
  } catch {
    // وضع التصفح الخاص — تبدأ القصة من أولها في كل زيارة، وهذا مقبول
    return { ...START };
  }
}

function write(s: StoryState): void {
  // بلا استئناف لا أحد يقرأ هذا، فلا داعي لترك مفتاح معلّق في متصفّحها
  if (!STORY.resume) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* الموقع يظل يعمل، فقط لن يتذكّر */
  }
}

let state: StoryState = read();

export function current(): StoryState {
  return { ...state };
}

/** ينتقل إلى مشهد بعينه ويحفظ. */
export function go(scene: Scene): StoryState {
  state = { ...state, scene };
  write(state);
  return current();
}

/** المشهد التالي في الترتيب. آخر مشهد يبقى مكانه. */
export function next(): StoryState {
  const i = SCENES.indexOf(state.scene);
  const to = SCENES[Math.min(i + 1, SCENES.length - 1)]!;
  return go(to);
}

export function markCelebrated(): void {
  state = { ...state, celebrated: true };
  write(state);
}

/** من الأول. */
export function reset(): StoryState {
  state = { ...START };
  write(state);
  return current();
}

/** هل مشهد ما قد مُرّ عليه؟ يُستخدم لخيط التقدّم أعلى الشاشة. */
export function progress(): number {
  const i = SCENES.indexOf(state.scene);
  return (i + 1) / SCENES.length;
}
