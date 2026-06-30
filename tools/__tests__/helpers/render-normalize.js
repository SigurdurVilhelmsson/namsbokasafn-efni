/**
 * render-normalize.js — test helper for the render golden/characterization suites.
 *
 * Why this exists: `renderCnxmlToHtml` embeds MathJax SVG output, which assigns
 * volatile per-render element IDs. Two renders of the same module therefore
 * differ byte-for-byte (and each MathJax blob is ~90% of the fragment size).
 * The render→DOM migration (Track C) refactors *structural container* rendering,
 * not math — so MathJax internals are pure noise for a structural safety net.
 *
 * `normalizeMathJax` collapses every <mjx-container> to a stable
 * `data-latex`-keyed placeholder. This makes the rendered HTML deterministic and
 * portable (no machine-specific or per-run content) and small enough to commit
 * as golden fixtures, while still proving each equation rendered (its LaTeX
 * survives) and preserving all the surrounding structural HTML the migration
 * must keep byte-identical.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { renderCnxmlToHtml } from '../../cnxml-render.js';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

/**
 * Replace MathJax container output with a stable `data-latex`-keyed placeholder.
 * MathJax containers do not nest, so a non-greedy match to the first close tag
 * is correct.
 * @param {string} html
 * @returns {string}
 */
export function normalizeMathJax(html) {
  return (
    html
      // Volatile MathJax SVG container → stable data-latex placeholder.
      .replace(/<mjx-container\b([^>]*)>[\s\S]*?<\/mjx-container>/g, (_full, attrs) => {
        const m = attrs.match(/data-latex="([^"]*)"/);
        const latex = m ? m[1] : '';
        return `<mjx-container data-latex="${latex}">[MATHJAX]</mjx-container>`;
      })
      // Assistive MathML sibling (deterministic but bulky) → presence marker.
      .replace(
        /<math\b[^>]*class="assistive-mathml"[^>]*>[\s\S]*?<\/math>/g,
        '<math class="assistive-mathml">[ASSISTIVE-MML]</math>'
      )
  );
}

/**
 * Render a translated (injected) module to normalized HTML.
 * Reads from the committed `03-translated/<track>` CNXML so the input is frozen;
 * the safety net detects renderer drift while holding the input constant.
 * @param {Object} opts
 * @param {string} [opts.book='efnafraedi-2e']
 * @param {string} opts.chapter - e.g. 'ch05'
 * @param {string} opts.moduleId - e.g. 'm68727'
 * @param {string} [opts.track='mt-preview']
 * @returns {string} normalized HTML
 */
export function renderTranslatedModule({
  book = 'efnafraedi-2e',
  chapter,
  moduleId,
  track = 'mt-preview',
}) {
  const cnxmlPath = join(
    REPO_ROOT,
    'books',
    book,
    '03-translated',
    track,
    chapter,
    `${moduleId}.cnxml`
  );
  const cnxml = readFileSync(cnxmlPath, 'utf8');
  const { html } = renderCnxmlToHtml(cnxml, {
    lang: 'is',
    chapter: parseInt(chapter.replace(/^ch/, ''), 10),
    bookSlug: book,
    moduleId,
    moduleSections: {},
  });
  return normalizeMathJax(html);
}
