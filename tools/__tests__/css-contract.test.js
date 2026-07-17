/**
 * CSS Contract Test
 *
 * Validates that rendered HTML from cnxml-render.js uses CSS classes
 * that have matching rules in the sister repo's content.css.
 *
 * This catches class name mismatches between the content pipeline
 * (namsbokasafn-efni) and the web server (namsbokasafn-vefur).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

const VEFUR_CSS_PATH = path.resolve(
  __dirname,
  '../../../namsbokasafn-vefur/static/styles/content.css'
);
const BOOKS_DIR = path.resolve(__dirname, '../../books');
// Every book that has rendered publication output — the contract runs per book.
const PUBLICATION_DIRS = fs
  .readdirSync(BOOKS_DIR)
  .map((book) => ({ book, dir: path.join(BOOKS_DIR, book, '05-publication') }))
  .filter((e) => fs.existsSync(e.dir));

// Classes that are intentionally NOT in content.css (handled by external libraries or browsers)
const EXTERNAL_CLASSES = new Set([
  'MathJax', // MathJax library handles its own styling
  'math-inline', // MathJax inline math container
  'mathjax-display', // Listed in CSS but also used by MathJax directly
]);

// Classes used for structure/semantics that don't need visual styling
const STRUCTURAL_CLASSES = new Set([
  'column-header', // Table column headers — styled via table element rules
  'unstyled', // Intentionally unstyled (e.g., lists)
  'top-titled', // Layout modifier — may be styled via parent context
  'note-default', // Default note type — inherits from .note
  'check-knowledge-answer', // JS-hook marker for the reader's "Sýna svar" reveal toggle (vefur practiceReveal); hiding is vefur-injected, no content.css rule
  'preserved-anchor', // Empty invisible <span> used purely as a deep-link/cross-reference id target; no visual styling needed
  'assistive-mathml', // a11y-2 visually-hidden <math> sibling for screen readers; hidden via inline style, NO content.css rule by design (vefur Task 3c)
  // ── Reclassified from KNOWN_GAPS by the vefur D4 embed-CSS pass (2026-07-17) ──
  'span-all', // OpenStax two-column "span both columns" modifier. The reader is single-column, so it is a no-op there: the 11 <figure>/1 <table> carrying it already render full-column (`figure img{max-width:100%}`, `table{width:100%}`), and their images (≤1044px) would only upscale blurry if forced wider. No rule wanted.
  'note-microbiology', // Book marker on `note note-microbiology <variant>`; every variant it pairs with (check-your-understanding, clinical-focus, micro-connection, disease-profile, eye-on-ethics, case-in-point, link-to-learning) is styled in content.css. The marker itself needs no rule.
  'interactive-long', // Length modifier on `note note-interactive interactive-long` (9 biology source notes). Box comes from .note/.note-interactive; its iframe is 660x371.4 = exactly 16:9, which the .embed-responsive wrapper already assumes. No rule wanted.
]);

// Known gaps: classes emitted by cnxml-render.js but not yet in content.css.
// These should be added to content.css in namsbokasafn-vefur over time.
// When a class gets a CSS rule, remove it from this set — the test will
// then catch it automatically if the rule is later removed.
const KNOWN_GAPS = new Set([
  'emphasis-one', // Ionizable H atoms — needs color styling (from CNXML emphasis class)
  'eoc-exercise', // End-of-chapter exercises — inherits from .exercise layout
  'introduction', // Module intro sections — inherits from .cnx-module
  'key-equations', // Key equations section wrapper
  'key-equations-table', // Table inside key-equations section
  'periodic-table-link', // Link to periodic table — has inline styles
  'scaled-down-30', // 30% image scaling — needs width rule
  'stepwise', // Step-by-step numbered lists (OpenStax list variant) — needs indentation styling
  'summary', // Chapter summary section wrapper
  'summary-section', // Individual module summary within chapter summary
  // ── Cross-book gaps surfaced by D6 parametrization (2026-06-29) ──
  // All render acceptably via base rules (notes via `.note`, sections as plain
  // divs); these are missing *variant/section* polish in vefur content.css.
  // Tracked for per-book launch styling — see vefur memory `css-cross-book-gaps`.
  // note-interactive: styled in vefur content.css (blue tint, mirrors .note-link-to-learning) 2026-06-30 — contract re-armed
  // note-evolution / note-career / note-visual-connection: styled in vefur content.css
  //   (§ NOTES — BIOLOGY: green / pink / blue tint) — contract re-armed 2026-07-17
  // span-all + note-microbiology: reclassified STRUCTURAL above (2026-07-17) — no rule wanted
  // Book-specific end-of-chapter / section types (unstyled section divs):
  'section-exercises', // organic
  'section-summary', // physics
  'conceptual-questions', // physics
  'problems-exercises', // physics
  'chemistry-matters', // organic eoc section
  'exercise-part', // organic
  'key-terms-section', // organic key-terms page
  // Layout/misc:
  'centered-text', // organic
]);

/**
 * Extract all class selectors from a CSS file.
 * Returns a Set of class names (without the leading dot).
 */
function extractCssClasses(cssContent) {
  const classes = new Set();
  // Match .class-name in selectors (not inside property values)
  // Split by { to get selector blocks, then extract class names
  const selectorBlocks = cssContent.split('{');
  for (const block of selectorBlocks) {
    // Only look at the selector part (last line before {)
    const lines = block.split('\n');
    const selector = lines[lines.length - 1] || '';
    const matches = selector.match(/\.([a-z][-a-z0-9]*)/g);
    if (matches) {
      for (const m of matches) {
        classes.add(m.slice(1)); // remove leading dot
      }
    }
  }
  return classes;
}

/**
 * Extract all class attribute values from HTML files.
 * Returns a Set of individual class names.
 */
function extractHtmlClasses(htmlContent) {
  const classes = new Set();
  const matches = htmlContent.match(/class="([^"]*)"/g);
  if (matches) {
    for (const m of matches) {
      const value = m.slice(7, -1); // remove class=" and "
      for (const cls of value.split(/\s+/)) {
        if (cls) classes.add(cls);
      }
    }
  }
  return classes;
}

describe('CSS contract: namsbokasafn-efni ↔ namsbokasafn-vefur', () => {
  // Skip when the sister vefur repo isn't checked out — unless VEFUR_CONTRACT=1,
  // which turns the missing CSS into a hard failure (for CI/dev with vefur present).
  const vefurExists = fs.existsSync(VEFUR_CSS_PATH);
  const requireVefur = process.env.VEFUR_CONTRACT === '1';

  if (requireVefur) {
    it('VEFUR_CONTRACT=1 requires the vefur content.css to be present', () => {
      expect(vefurExists, `VEFUR_CONTRACT=1 but vefur CSS not found at ${VEFUR_CSS_PATH}`).toBe(
        true
      );
    });
  }

  // One class↔CSS-match test per book that has publication output.
  for (const { book, dir } of PUBLICATION_DIRS) {
    it.skipIf(!vefurExists)(`[${book}] rendered HTML classes have matching CSS rules`, () => {
      const cssContent = fs.readFileSync(VEFUR_CSS_PATH, 'utf-8');
      const cssClasses = extractCssClasses(cssContent);

      const htmlFiles = glob.sync('**/*.html', { cwd: dir });
      expect(htmlFiles.length).toBeGreaterThan(0);

      const allHtmlClasses = new Set();
      for (const file of htmlFiles) {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        for (const cls of extractHtmlClasses(content)) {
          allHtmlClasses.add(cls);
        }
      }

      const missing = [];
      const knownGaps = [];
      for (const cls of allHtmlClasses) {
        if (EXTERNAL_CLASSES.has(cls)) continue;
        if (STRUCTURAL_CLASSES.has(cls)) continue;
        if (KNOWN_GAPS.has(cls)) {
          knownGaps.push(cls);
          continue;
        }
        if (!cssClasses.has(cls)) {
          missing.push(cls);
        }
      }

      if (knownGaps.length > 0) {
        console.log(
          `[${book}] known CSS gaps (${knownGaps.length}): ${knownGaps.sort().join(', ')}`
        );
      }

      if (missing.length > 0) {
        const details = missing.sort().map((cls) => {
          const files = htmlFiles.filter((f) => {
            const content = fs.readFileSync(path.join(dir, f), 'utf-8');
            return (
              content.includes(`class="${cls}"`) ||
              content.includes(` ${cls} `) ||
              content.includes(` ${cls}"`)
            );
          });
          return `  ${cls} (used in ${files.length} file${files.length !== 1 ? 's' : ''})`;
        });
        expect(missing).toEqual(
          [],
          `[${book}] ${missing.length} CSS class(es) used in rendered HTML but missing from content.css:\n${details.join('\n')}\n\nFix: add rules to namsbokasafn-vefur/static/styles/content.css or add to EXTERNAL_CLASSES/STRUCTURAL_CLASSES in this test if intentional.`
        );
      }
    });
  }

  // Dead-selector scan is cross-book: a selector unused by one book may be used
  // by another, so accumulate HTML classes across ALL books. Informational only.
  it.skipIf(!vefurExists)(
    'content.css has no obviously dead selectors for content classes (all books)',
    { timeout: 60_000 },
    () => {
      const cssContent = fs.readFileSync(VEFUR_CSS_PATH, 'utf-8');
      const cssClasses = extractCssClasses(cssContent);

      const allHtmlClasses = new Set();
      for (const { dir } of PUBLICATION_DIRS) {
        const htmlFiles = glob.sync('**/*.html', { cwd: dir });
        for (const file of htmlFiles) {
          const content = fs.readFileSync(path.join(dir, file), 'utf-8');
          for (const cls of extractHtmlClasses(content)) {
            allHtmlClasses.add(cls);
          }
        }
      }

      const unused = [];
      for (const cls of cssClasses) {
        if (!allHtmlClasses.has(cls)) {
          unused.push(cls);
        }
      }

      if (unused.length > 0) {
        console.log(
          `Info: ${unused.length} CSS classes in content.css not used in any book's rendered HTML:\n  ${unused.sort().join(', ')}`
        );
      }
    }
  );

  it.skipIf(!vefurExists)('content.css parses without errors', () => {
    const cssContent = fs.readFileSync(VEFUR_CSS_PATH, 'utf-8');
    // Check balanced braces
    let depth = 0;
    for (const ch of cssContent) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);

    // Check for common CSS errors
    expect(cssContent).not.toMatch(/\{\s*\}/); // empty rules
  });
});
