/**
 * blow.ts — يسمع النفخة على المايك.
 *
 * المشكلة ليست «هل في صوت» بل «هل هذا الصوت نفخة». الكلام والموسيقى والطرق
 * على الطاولة كلّها ترفع مستوى الصوت، ولو اكتفينا بالمستوى لانطفأت الشمعات
 * من كلمة «انفخي» نفسها.
 *
 * فالنفخة تُعرَّف بثلاثة شروط معاً، وأيّها وحده لا يكفي:
 *
 *   ١· مستوى فوق أرضية الضجيج المقيسة — لا عتبة مطلقة. غرفةٌ هادئة وغرفةٌ
 *      فيها مروحة ليستا واحدة، والعتبة الثابتة تصحّ في واحدة وتفشل في الأخرى.
 *
 *   ٢· ثقل في الترددات الواطية. النفخة هواءٌ يصطدم بالميكروفون: طاقتها
 *      مكدّسة تحت ٦٠٠ هرتز. الصوت البشري يوزّع طاقته على الفورمانت أعلى.
 *
 *   ٣· الطيف مسطّح. النفخة ضجيجٌ عريض بلا بنية توافقية؛ الكلام والغناء
 *      والموسيقى لها قمم واضحة عند الأساس ومضاعفاته. نقيس ذلك بالاستواء
 *      الطيفي — الوسط الهندسي على الوسط الحسابي — وهو قريب من ١ للضجيج
 *      وقريب من الصفر للنغمة.
 *
 * وشرط رابع في الزمن: الاستمرار. النفخة تدوم عُشر ثانية على الأقل، والطقّة
 * والباب المغلق لا يدومان. هذا وحده يزيل أكثر الإنذارات الكاذبة.
 *
 * ملاحظتان لا غنى عنهما:
 *   • `noiseSuppression` يجب أن يكون **false**. مهمّته إزالة الضجيج العريض
 *     الواطي — أي إزالة النفخة بالضبط. تركه مفعّلاً يجعل الميزة لا تعمل
 *     على أندرويد ولا يُفهَم لماذا.
 *   • `echoCancellation` يجب أن يكون **true** إن بقيت الموسيقى تعمل، وإلا
 *     أطفأت الأغنيةُ الشمعاتِ بنفسها. والأسلم إسكاتها أثناء الاستماع.
 */

export interface BlowHandle {
  stop(): void;
}

export type BlowReason = 'unsupported' | 'denied' | 'failed';

interface Options {
  /** يُستدعى مع كل دفعة نفخ؛ `strength` من 0 إلى 1 تقريباً */
  onBlow: (strength: number) => void;
  /** يُستدعى مرة واحدة عندما تصبح المعايرة جاهزة */
  onReady?: () => void;
}

/** حدود النطاق الواطي بالهرتز — فوقها تبدأ منطقة الصوت البشري. */
const LOW_HZ = 600;

/** مدّة قياس أرضية الضجيج قبل قبول أي نفخة. */
const CALIBRATE_MS = 700;

/** كم يجب أن تستمرّ النفخة قبل أن تُصدَّق. */
const SUSTAIN_MS = 110;

/** أقلّ فاصل بين دفعتين، حتى تنطفئ الشمعات تباعاً لا دفعةً واحدة. */
const EMIT_GAP_MS = 190;

export function blowSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    (typeof AudioContext !== 'undefined' ||
      typeof (window as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined')
  );
}

/**
 * يبدأ الاستماع. يرجع مقبضاً للإيقاف، أو سبب الفشل.
 *
 * يجب استدعاؤه من داخل معالج لمسة: متصفّحات الجوّال ترفض فتح المايك وتشغيل
 * `AudioContext` خارج إيماءة المستخدم.
 */
export async function listenForBlow(opts: Options): Promise<BlowHandle | BlowReason> {
  if (!blowSupported()) return 'unsupported';

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed';
  }

  const Ctor =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : ((window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);

  let audio: AudioContext;
  try {
    audio = new Ctor();
    // سفاري يفتح السياق موقوفاً حتى داخل الإيماءة أحياناً
    if (audio.state === 'suspended') await audio.resume();
  } catch {
    for (const t of stream.getTracks()) t.stop();
    return 'failed';
  }

  const source = audio.createMediaStreamSource(stream);
  const analyser = audio.createAnalyser();
  analyser.fftSize = 2048;
  // تنعيم خفيف: التنعيم القوي يبطئ الاستجابة فتتأخّر الشمعة عن النفخة
  analyser.smoothingTimeConstant = 0.25;
  source.connect(analyser);

  const bins = analyser.frequencyBinCount;
  const spectrum = new Uint8Array(bins);
  const hzPerBin = audio.sampleRate / 2 / bins;
  const lowBins = Math.max(1, Math.min(bins, Math.round(LOW_HZ / hzPerBin)));

  let raf = 0;
  let stopped = false;
  const started = performance.now();
  let floor = 0;
  let floorSamples = 0;
  let ready = false;
  let sustainedSince = 0;
  let lastEmit = 0;

  function frame(): void {
    if (stopped) return;
    raf = requestAnimationFrame(frame);

    analyser.getByteFrequencyData(spectrum);

    let total = 0;
    let low = 0;
    let logSum = 0;
    for (let i = 0; i < bins; i++) {
      const v = spectrum[i]! / 255;
      total += v;
      if (i < lowBins) low += v;
      // الإزاحة تمنع log(0) وتضبط أرضية الاستواء
      logSum += Math.log(v + 1e-4);
    }

    const mean = total / bins;
    const now = performance.now();

    // ── المعايرة ──
    if (!ready) {
      floor += mean;
      floorSamples++;
      if (now - started >= CALIBRATE_MS) {
        floor = floorSamples > 0 ? floor / floorSamples : 0;
        ready = true;
        opts.onReady?.();
      }
      return;
    }

    // الوسط الهندسي على الحسابي: 1 ضجيج أبيض، 0 نغمة صافية
    const flatness = mean > 0 ? Math.exp(logSum / bins) / mean : 0;
    const lowRatio = total > 0 ? low / total : 0;

    // العتبة نسبية وبأرضية دنيا: في غرفة صامتة تماماً تكون `floor` صفراً
    // فتصبح أي همسة نفخة لولا الحدّ الأدنى المطلق.
    const over = mean - floor;
    const loud = over > Math.max(0.045, floor * 0.8);
    const airy = lowRatio > 0.55;
    const noisy = flatness > 0.30;

    if (loud && airy && noisy) {
      if (sustainedSince === 0) sustainedSince = now;
      if (now - sustainedSince >= SUSTAIN_MS && now - lastEmit >= EMIT_GAP_MS) {
        lastEmit = now;
        // 0.09 فوق الأرضية نفخة خفيفة، 0.30 نفخة قوية
        opts.onBlow(Math.min(1, Math.max(0, (over - 0.045) / 0.26)));
      }
    } else {
      sustainedSince = 0;
    }
  }

  raf = requestAnimationFrame(frame);

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      try { source.disconnect(); } catch { /* السياق قد يكون أُغلق */ }
      for (const t of stream.getTracks()) t.stop();
      void audio.close().catch(() => undefined);
    },
  };
}
