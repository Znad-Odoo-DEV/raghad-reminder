# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page Astro static site for one person: an up-counter from a date plus one
kind Arabic sentence per day. No backend, no accounts, no database — everything runs
in the browser and every persisted value stays on the visitor's device.

The site is Arabic (`lang="ar" dir="rtl"`). Comments, copy, and commit messages are
written in Arabic; keep that convention.

## Commands

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # -> dist/
npm run preview
npm run check      # astro check — type check; must stay at zero errors/warnings
```

Two generators are run **manually, only when their inputs change** — their outputs
are committed to the repo and the CI build does not run them:

```bash
node scripts/gen-ics.mjs     # -> public/raghd-sweet.ics
node scripts/gen-icons.mjs   # -> public/icon-*.png, apple-touch-icon.png (needs sharp)
```

There is no test suite. The old Puppeteer coverage was not rewritten for this
structure, so `astro check` + a build + a manual browser pass is the whole gate.

To reproduce a project-site build locally: `BASE_PATH=/repo-name/ npm run build`.

## Architecture

### Configuration seams — change facts here, not in components

- `src/site.config.ts` — names, both counter dates, the daily-dose hour/minute, song
  metadata. Dates are **Damascus wall-clock**, `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`;
  `null` or an invalid value hides that counter rather than inventing numbers.
- `src/scripts/copy.ts` — every user-facing Arabic string, plus `pick()` (random with
  no immediate repeat) and `sweetLineFor(dayKey)` (deterministic per calendar day, so
  the sentence is stable within a day and never flickers on refresh).
- `src/analytics.config.ts` — GoatCounter / Cloudflare / hits.sh. Empty fields mean
  nothing is loaded at all; `Base.astro` conditionally emits the script tags.

### Time is the load-bearing subsystem

`src/scripts/schedule.ts` owns everything temporal, and the rules there are not
stylistic:

- All arithmetic runs on **absolute instants (epoch ms)** and converts to Damascus
  wall-clock through `Intl.DateTimeFormat` only. Never the device's local time.
- The UTC offset is never hard-coded — it is read from the tz database per instant
  via `offsetAt()`, so the site survives a rule change.
- **Never `Date.parse` / `new Date(string)`** on config dates: it reads `YYYY-MM-DD` as
  UTC and the `T HH:MM` form as device-local — both wrong here. Use
  `instantOfWall()`, which guesses then corrects across a possible offset boundary.
- **Never add 24h** to advance a day; step the calendar date (`nextDaySweetInstant`,
  `bumpStreak`'s "yesterday") instead.
- `nowMs()` is the single source of "now" — `Date.now()` plus a sessionStorage test
  offset. Anything reading the clock must go through it, or the hidden time simulator
  silently lies.

### One paint loop, DOM contract via `data-*`

`src/scripts/main.ts` is the only module that touches the DOM. It runs `tick()` once
per second, and all rendering happens inside `paint()`. That discipline is what makes
the hidden time simulator honest: swap the time source, and everything follows.

`.astro` components ship markup and scoped CSS only — they have no client scripts.
The single `<script>` in `src/pages/index.astro` imports `main.ts`, which wires
behaviour by querying `data-*` hooks (`data-card`, `data-heart`, `data-unit`,
`data-whisper`, `data-sim`, `data-music-*`, `data-notif-*`, …). Renaming or removing
a `data-` attribute in a component silently breaks its behaviour — grep `main.ts`
before touching one. The one exception is `MusicPlayer.astro`, which does build-time
work (see below).

### Storage

`src/scripts/store.ts` — `localStorage` under versioned `raghd:*` keys, one record per
Damascus calendar day; a new `dayKey` resets state implicitly. Every read/write is
wrapped in try/catch because private browsing throws. `dropRetiredKeys()` purges keys
from the site's previous incarnation on boot; add to `RETIRED_KEYS` when a key is
abandoned rather than leaving it stranded in her browser.

### Daily dose: calendar first, notification second

- `public/raghd-sweet.ics` (from `scripts/gen-ics.mjs`) is the **primary** mechanism —
  the phone's own calendar fires it with the browser closed. RFC 5545 is strict: CRLF
  line endings and 75-octet line folding that must not split a UTF-8 char. The
  generator handles both and prints a verification. `.gitattributes` marks `*.ics`
  as `-text` — normalising it can make iOS Calendar reject the file.
- `src/scripts/notify.ts` is the **supplement** — works only while the page is open.
  A static site cannot schedule a future local notification (Notification Triggers
  never shipped; Web Push needs a server). On Android/Chrome `new Notification()`
  throws, so notifications go through `registration.showNotification()` — that is why
  a service worker exists. Timers are re-synced on `visibilitychange`/`focus` because
  mobile throttles background timers.

### Base path

`astro.config.mjs` normalises `BASE_PATH` to always end in `/`, so the same build
works at `username.github.io/` and `username.github.io/repo/`. CI passes the real
value from `actions/configure-pages`. **Every asset URL must be built through
`import.meta.env.BASE_URL`** (see the `asset()` helper in `Base.astro`, and the paths
in `notify.ts` / `sw.js`); a bare `/foo.png` 404s on a project site.

### Service worker

`public/sw.js` is hand-written (not generated). `_astro/*` is cache-first
(fingerprinted, immutable); everything else is network-first so no stale shell can
stick. Bump `VERSION` whenever the cached shell changes — activation deletes every
other cache.

### Music

`MusicPlayer.astro` probes the filesystem **at build time** for
`public/music/track.{mp3,m4a,ogg,wav}` and picks one of three modes: local `<audio>`,
YouTube embed (`SONG.videoId`), or nothing. Currently local — `track.m4a` is committed
deliberately (`.gitignore` excludes only the other audio extensions) so audio works on
the deployed site.

The **file extension must match the actual container**: the current file is an MP4/AAC
container; served as `.mp3`, GitHub Pages would send a wrong `audio/mp3` header that
Safari and Firefox may reject.

Autoplay-with-sound is blocked by every browser before a user gesture — this is policy,
not a bug to work around. `music.ts` tries immediately, and on rejection arms the first
`pointerdown`/`touchstart`/`keydown`/`scroll`/`wheel`. The opt-out is remembered.

Copyright note: the repo is public and the recording is protected — see
`public/music/README.md`. If a takedown arrives, deleting the file makes the player
fall back to YouTube (or disappear) automatically.

### Deploy

Push to `main` → `.github/workflows/deploy.yml` builds and publishes to GitHub Pages.
`public/.nojekyll` is required; without it Pages ignores the `_astro/` directory.

## Conventions worth preserving

- Animation is CSS everywhere except `celebrate.ts`, which uses one canvas and one
  time-based `requestAnimationFrame` loop, torn down when the last particle dies.
- `prefers-reduced-motion: reduce` is honoured throughout: motion stops, content stays
  visible, and the celebration is not drawn at all.
- Counter digits are Latin and `tabular-nums`; Eastern-Arabic numerals visibly jitter
  in a per-second counter.
- Screen-reader announcements go to `#live-region` on **day change only**, using the
  prose helpers in `schedule.ts` — never the per-second digits.
- Design tokens live at the top of `src/styles/global.css`; components use them rather
  than raw colour values.
