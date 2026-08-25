/**
 * Builds public/raghd-daily.ics — a daily 11:00 Asia/Damascus reminder that the
 * phone's own calendar fires, with no server and no browser involved.
 *
 * Run with: node scripts/gen-ics.mjs
 *
 * تنبيه واحد لطيف في وقته. هذا موقع ترقّب لا نظام إلحاح، وجملة حلوة واحدة
 * تكفي — ولا شيء غيرها.
 *
 * RFC 5545 details that matter:
 *  - lines MUST be CRLF-terminated
 *  - a content line MUST NOT exceed 75 octets; longer lines are folded onto
 *    continuation lines starting with a space (never splitting a UTF-8 char)
 */
import { writeFileSync } from 'node:fs';

const URL_SITE = 'https://znad-odoo-dev.github.io/raghad-reminder/';
const OUT = 'public/raghd-daily.ics';

const lines = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Raghd//Daily Note//AR',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'X-WR-CALNAME:رسالة اللطافة اليومية 🤍',
  'X-WR-TIMEZONE:Asia/Damascus',

  // سوريا ألغت التوقيت الصيفي في 2022-10-28 وثبتت على +03.
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
  // UID جديد عن أي ملف سابق عن قصد: لو حُمِّل الملفان، لا نريد أن يستبدل
  // التقويم أحدهما بالآخر بصمت.
  'UID:raghd-daily-note@znad-odoo-dev.github.io',
  'DTSTAMP:20260824T000000Z',
  'DTSTART;TZID=Asia/Damascus:20260101T110000',
  'DURATION:PT5M',
  'RRULE:FREQ=DAILY',
  'SUMMARY:🤍 رسالة اللطافة اليومية',
  'DESCRIPTION:تذكير صغير إنك super special. وإنه في شي جاي 🎁',
  `URL:${URL_SITE}`,
  'TRANSP:TRANSPARENT',

  // منبّه واحد، في وقته بالضبط.
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'TRIGGER:PT0S',
  'DESCRIPTION:🤍 صباح الخير يا ألطف صدفة.',
  'END:VALARM',

  'END:VEVENT',
  'END:VCALENDAR',
];

const enc = new TextEncoder();

/** يطوي السطر عند 75 بايت دون كسر محرف UTF-8. */
function fold(line) {
  if (enc.encode(line).length <= 75) return [line];
  const out = [];
  let cur = '';
  let limit = 75;
  for (const ch of line) {
    if (enc.encode(cur + ch).length > limit) {
      out.push(cur);
      cur = ' ' + ch;   // سطر متابعة يبدأ بمسافة
      limit = 75;
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
console.log(`${OUT}  ${folded.length} lines, ${enc.encode(ics).length} bytes`);
console.log(`CRLF: ${ics.includes('\r\n') && !/[^\r]\n/.test(ics) ? 'ok' : 'BROKEN'}`);
console.log(`lines over 75 octets: ${over.length === 0 ? 'none' : over.join(' | ')}`);
