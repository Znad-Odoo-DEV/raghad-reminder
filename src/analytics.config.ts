/**
 * إعدادات الإحصائيات
 *
 * GitHub Pages لا يوفّر أي إحصائيات زوار، لذلك نحتاج سكربتاً خارجياً.
 * املأ واحداً من الحقلين أدناه ليبدأ العدّ — ولا شيء يُحمَّل ما دام الحقلان
 * فارغين، فالموقع يبقى بلا أي تتبّع حتى تختار أنت.
 *
 * كلا الخيارين بلا كوكيز وبلا بيانات شخصية، فلا حاجة إلى شريط موافقة.
 */

export const ANALYTICS = {
  /**
   * GoatCounter — الأبسط والأخف (‎~3.5 KB‎)، مجاني للاستخدام الشخصي.
   *
   * 1. سجّل في https://www.goatcounter.com واختر اسماً، مثل `raghad`
   * 2. ضع رابط العدّ هنا:
   *    'https://raghad.goatcounter.com/count'
   * 3. لوحتك: https://raghad.goatcounter.com
   */
  goatcounter: '',

  /**
   * Cloudflare Web Analytics — مجاني وبلا حدّ، ولوحته أغنى.
   *
   * 1. https://dash.cloudflare.com → Analytics → Web Analytics → Add a site
   * 2. ضع الموقع: znad-odoo-dev.github.io/raghad-reminder
   * 3. انسخ قيمة `token` من الشيفرة التي يعطيك إياها وضعها هنا.
   */
  cloudflareToken: '',

  /**
   * عدّاد بسيط بلا تسجيل — يظهر في التذييل مباشرة.
   *
   * يعدّ **مرات فتح الصفحة**، لا الزوار الفريدين، ولا يعطي بلداناً ولا مصادر.
   * فائدته أنه يعمل فوراً بلا أي حساب. للوحة حقيقية استعمل GoatCounter أعلاه.
   *
   * اجعله '' لإخفاء العدّاد.
   */
  hitsKey: 'znad-odoo-dev.github.io/raghad-live',
} as const;

/** هل فُعّلت أي أداة؟ */
export const analyticsEnabled =
  ANALYTICS.goatcounter.length > 0 ||
  ANALYTICS.cloudflareToken.length > 0 ||
  ANALYTICS.hitsKey.length > 0;
