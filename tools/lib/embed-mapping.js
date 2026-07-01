import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve books/ relative to the repo root (this file is <root>/tools/lib/),
// NOT the process cwd. The editorial server starts with cwd=server/ (via
// `cd server && npm start`), so a cwd-relative 'books/…' path silently missed
// the mapping and returned {} → embed modules 500'd in live preview.
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Minimal HTML attribute escape (mirrors render's escapeAttr). */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Load a book's committed embed mapping. Returns {} when absent. */
export function loadEmbedMapping(bookSlug) {
  const p = path.join(REPO_ROOT, 'books', bookSlug, 'embed-mapping.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Render a responsive lazy iframe + always-visible fallback link.
 * Throws (fail loud) on an unmapped or non-ok embed — never emit a blank box.
 */
export function renderEmbedHtml({ embedSrc, width, height, title, embedMap }) {
  const entry = embedMap && embedMap[embedSrc];
  if (!entry || entry.status !== 'ok' || !entry.resolved) {
    throw new Error(
      `Unresolved embed: ${embedSrc} — run \`node tools/resolve-embeds.js --book <slug>\` ` +
        `to (re)generate embed-mapping.json`
    );
  }
  const w = width ? ` width="${esc(width)}"` : '';
  const h = height ? ` height="${esc(height)}"` : '';
  const t = title ? ` title="${esc(title)}"` : '';
  return (
    `<div class="embed-responsive">` +
    `<iframe src="${esc(entry.resolved)}"${t}${w}${h} loading="lazy" allowfullscreen></iframe>` +
    `</div>` +
    `<p class="embed-fallback"><a href="${esc(entry.resolved)}" target="_blank" rel="noopener">Opna í nýjum glugga</a></p>`
  );
}
