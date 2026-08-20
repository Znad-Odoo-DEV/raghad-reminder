/**
 * Builds public/raghd-dose.ics — a daily 11:00 Asia/Damascus reminder that the
 * phone's own calendar fires, with no server and no browser involved.
 *
 * Run with: node scripts/gen-ics.mjs
 *
 * RFC 5545 details that matter:
 *  - lines MUST be CRLF-terminated
 *  - a content line MUST NOT exceed 75 octets; longer lines are folded onto
 *    continuation lines starting with a space (never splitting a UTF-8 char)
 */
import { writeFileSync } from 'node:fs';

const URL_SITE = 'https://znad-odoo-dev.github.io/raghad-reminder/';

const lines = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Raghd Reminder//Daily Dose//AR',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'X-WR-CALNAME:دوا رغد 💊',
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
  'UID:raghd-daily-dose@znad-odoo-dev.github.io',
  'DTSTAMP:20260820T000000Z',
  'DTSTART;TZID=Asia/Damascus:20260101T110000',
  'DURATION:PT10M',
  'RRULE:FREQ=DAILY',
  'SUMMARY:💊 وقت الدوا يا رغد',
  'DESCRIPTION:الساعة 11:00. الدوا عم يستنى. بلا مفاوضات.',
  `URL:${URL_SITE}`,
  'TRANSP:TRANSPARENT',

  // تنبيه كل دقيقة من (الموعد − 5 دقائق) حتى الموعد نفسه.
  // ننشئ منبّهاً مستقلاً لكل دقيقة بدل REPEAT/DURATION، لأن دعم REPEAT
  // متفاوت بين تقويم آبل وتقويم Google، أما المنبّهات المنفصلة فمدعومة عند الجميع.
  ...[5, 4, 3, 2, 1, 0].flatMap((minsBefore) => [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    minsBefore === 0 ? 'TRIGGER:PT0S' : `TRIGGER:-PT${minsBefore}M`,
    'DESCRIPTION:' + (
      minsBefore === 0 ? '💊 وقت الدوا يا رغد'
      : minsBefore === 1 ? '💊 باقي دقيقة وحدة على الدوا'
      : minsBefore === 2 ? '💊 باقي دقيقتين على الدوا'
      : `💊 باقي ${minsBefore} دقايق على الدوا`
    ),
    'END:VALARM',
  ]),

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
writeFileSync('public/raghd-dose.ics', ics, 'utf8');

const over = folded.filter((l) => enc.encode(l).length > 75);
console.log(`public/raghd-dose.ics  ${folded.length} lines, ${enc.encode(ics).length} bytes`);
console.log(`CRLF: ${ics.includes('\r\n') && !/[^\r]\n/.test(ics) ? 'ok' : 'BROKEN'}`);
console.log(`lines over 75 octets: ${over.length === 0 ? 'none' : over.join(' | ')}`);
