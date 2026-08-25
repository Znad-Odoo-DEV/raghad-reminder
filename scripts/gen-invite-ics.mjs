/**
 * gen-invite-ics.mjs — حدث تقويم لمرة واحدة
 *
 * الطريق الوحيد الذي يرنّ على هاتف رغد بلا أن تفتح الموقع ولا أن تعطي إذن
 * إشعارات: هاتفها نفسه ينفّذ التنبيه. تضغط الملف مرة في واتساب لتضيفه، وينتهي
 * دورها.
 *
 * الاستعمال:
 *   node scripts/gen-invite-ics.mjs "2026-08-26T20:30" "النص"
 *
 * الوقت بساعة حائط دمشق. الملف يخرج إلى public/ ليُرسل يدوياً — لا يُودَع في
 * المستودع ولا يُنشر مع الموقع.
 *
 * RFC 5545: أسطر تنتهي بـCRLF، وطيّ ما يتجاوز 75 بايت دون كسر محرف UTF-8.
 */
import { writeFileSync } from 'node:fs';

const SITE = 'https://znad-odoo-dev.github.io/raghad-reminder/';
const OUT = 'raghd-invite.ics';

const when = process.argv[2];
const text = process.argv[3] || 'في مفاجأة عم تتحضر على نار هادية';

const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(when || '');
if (!m) {
  console.error('الوقت لازم يكون بصيغة YYYY-MM-DDTHH:MM بتوقيت دمشق');
  console.error('مثال: node scripts/gen-invite-ics.mjs "2026-08-26T20:30"');
  process.exit(1);
}

const [, Y, Mo, D, H, Mi] = m;

// سوريا على +03 ثابتة منذ 2022-10-28. نكتب الوقت بـTZID لا بـUTC، فيبقى
// صحيحاً على هاتفها مهما كانت منطقته.
const dtstart = `${Y}${Mo}${D}T${H}${Mi}00`;

// UID فريد لكل دعوة، وإلا استبدل التقويم دعوةً سابقة بصمت.
const uid = `raghd-invite-${dtstart}@znad-odoo-dev.github.io`;

const lines = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Raghd//Invite//AR',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'X-WR-CALNAME:رغد 🤍',
  'X-WR-TIMEZONE:Asia/Damascus',

  'BEGIN:VTIMEZONE',
  'TZID:Asia/Damascus',
  'BEGIN:STANDARD',
  'DTSTART:20221028T000000',
  'TZOFFSETFROM:+0300',
  'TZOFFSETTO:+0300',
  'TZNAME:+03',
  'END:STANDARD',
  'END:VTIMEZONE',

  'BEGIN:VEVENT',
  `UID:${uid}`,
  'DTSTAMP:20260825T000000Z',
  `DTSTART;TZID=Asia/Damascus:${dtstart}`,
  'DURATION:PT5M',
  `SUMMARY:🤍 ${text}`,
  `DESCRIPTION:${text}`,
  `URL:${SITE}`,
  'TRANSP:TRANSPARENT',

  // منبّه واحد في وقته بالضبط.
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'TRIGGER:PT0S',
  `DESCRIPTION:🤍 ${text}`,
  'END:VALARM',

  'END:VEVENT',
  'END:VCALENDAR',
];

const enc = new TextEncoder();

function fold(line) {
  if (enc.encode(line).length <= 75) return [line];
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > 75) {
      out.push(cur);
      cur = ' ' + ch;
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const folded = lines.flatMap(fold);
const ics = folded.join('\r\n') + '\r\n';
writeFileSync(OUT, ics, 'utf8');

const over = folded.filter((l) => enc.encode(l).length > 75);
console.log(`${OUT}  ${folded.length} أسطر, ${enc.encode(ics).length} بايت`);
console.log(`الموعد: ${D}/${Mo}/${Y} الساعة ${H}:${Mi} بتوقيت سوريا`);
console.log(`النص  : ${text}`);
console.log(`CRLF: ${ics.includes('\r\n') && !/[^\r]\n/.test(ics) ? 'سليم' : 'مكسور'}`);
console.log(`أسطر فوق 75 بايت: ${over.length === 0 ? 'ولا واحد' : over.join(' | ')}`);
