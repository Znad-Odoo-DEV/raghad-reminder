/**
 * story.ts — آلة حالة الوزارة
 *
 * البوّابة وتسعة أقسام. مشهدٌ واحد على الشاشة، والانتقال بلمسة لا بسكرول —
 * وهذا وحده الفرق بين إحساس «موقع» وإحساس «مكان».
 *
 * لا استئناف: كل زيارة تفتح على البوّابة. الأقسام قصيرة ومستقلّة، والعودة
 * إلى البوّابة جزءٌ من الطقس لا عقبة فيه.
 */

export const SCENES = [
  'hub',      // البوّابة
  'decrees',  // قسم المراسيم
  'net',      // لوحة حالة النت
  'rhyme',    // مصلحة صباح النور
  'support',  // إدارة الدعم
  'moon',     // مرصد القمر
  'nails',    // هيئة المناكير
  'court',    // المحكمة العليا للمجاملات
  'dishes',   // دائرة الجلي
  'hunt',     // صيد الملوخية
] as const;

export type Scene = (typeof SCENES)[number];

let scene: Scene = 'hub';

export function isScene(v: unknown): v is Scene {
  return typeof v === 'string' && (SCENES as readonly string[]).includes(v);
}

export function current(): Scene {
  return scene;
}

/** ينتقل إلى مشهد بعينه. */
export function go(next: Scene): Scene {
  scene = next;
  return scene;
}

/** من الأول. */
export function reset(): Scene {
  return go('hub');
}
