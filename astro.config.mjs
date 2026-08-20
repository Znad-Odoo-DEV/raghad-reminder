// @ts-check
import { defineConfig } from 'astro/config';

/**
 * BASE_PATH lets the same build work in both GitHub Pages layouts:
 *   - user/org site  (username.github.io)      -> base "/"      (default)
 *   - project site   (username.github.io/repo) -> base "/repo/" (set by CI)
 * Every asset is emitted through Astro, so `base` is applied automatically.
 */
// actions/configure-pages emits "/repo" (no trailing slash) for project sites.
// Astro's BASE_URL is concatenated with asset names, so normalise it here or
// every href comes out as "/repofavicon.svg".
const raw = process.env.BASE_PATH?.trim() || '/';
const base = raw.endsWith('/') ? raw : `${raw}/`;
const site = process.env.SITE_URL || 'https://znad-odoo-dev.github.io';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: {
    // Keep the output flat and predictable for static hosting.
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
  devToolbar: { enabled: false },
});
