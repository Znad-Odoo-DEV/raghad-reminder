/**
 * tint.ts — لون المناكير يلوّن الوزارة.
 *
 * متغيّرٌ واحد في الجذر، `--tint`، وكل ما هو لافندر في الأنماط مشتقٌّ منه
 * بـ`color-mix`. تغييره يغيّر التدرّجات والأزرار والوهج والأضواء الطافية
 * دفعةً واحدة — ولا يمسّ الحبر، فالتباين لا يتأثّر بلونٍ اختارته.
 *
 * يُحفظ محلياً فتجد الوزارة بلونها في الزيارة التالية.
 */

const KEY = 'raghd:tint:v1';
const HEX = /^#[0-9a-f]{6}$/i;

export function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v);
}

/** اللون المحفوظ، أو null إن لم يُختر لونٌ بعد. */
export function loadTint(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return isHex(v) ? v.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** يطبّق لوناً ويحفظه. null يعيد اللون الرسمي ويمسح المحفوظ. */
export function applyTint(hex: string | null): void {
  const root = document.documentElement;
  if (hex && isHex(hex)) {
    root.style.setProperty('--tint', hex.toLowerCase());
    try { localStorage.setItem(KEY, hex.toLowerCase()); } catch { /* التصفح الخاص */ }
  } else {
    root.style.removeProperty('--tint');
    try { localStorage.removeItem(KEY); } catch { /* التصفح الخاص */ }
  }
}
