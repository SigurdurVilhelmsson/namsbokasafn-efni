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
const PUBLICATION_DIR = path.resolve(__dirname, '../../books/efnafraedi-2e/05-publication');

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
  'summary', // Chapter summary section wrapper
  'summary-section', // Individual module summary within chapter summary
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
  // Skip entire suite if vefur repo or publication files don't exist
  const vefurExists = fs.existsSync(VEFUR_CSS_PATH);
  const pubExists = fs.existsSync(PUBLICATION_DIR);

  it.skipIf(!vefurExists || !pubExists)(
    'rendered HTML classes have matching CSS rules in content.css',
    () => {
      const cssContent = fs.readFileSync(VEFUR_CSS_PATH, 'utf-8');
      const cssClasses = extractCssClasses(cssContent);

      // Collect classes from all rendered HTML files
      const htmlFiles = glob.sync('**/*.html', { cwd: PUBLICATION_DIR });
      expect(htmlFiles.length).toBeGreaterThan(0);

      const allHtmlClasses = new Set();
      for (const file of htmlFiles) {
        const content = fs.readFileSync(path.join(PUBLICATION_DIR, file), 'utf-8');
        for (const cls of extractHtmlClasses(content)) {
          allHtmlClasses.add(cls);
        }
      }

      // Find classes used in HTML but missing from CSS
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

      // Log known gaps for awareness
      if (knownGaps.length > 0) {
        console.log(`Known CSS gaps (${knownGaps.length}): ${knownGaps.sort().join(', ')}`);
      }

      if (missing.length > 0) {
        // Provide actionable error message
        const details = missing.sort().map((cls) => {
          // Find which HTML files use this class
          const files = htmlFiles.filter((f) => {
            const content = fs.readFileSync(path.join(PUBLICATION_DIR, f), 'utf-8');
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
          `${missing.length} CSS class(es) used in rendered HTML but missing from content.css:\n${details.join('\n')}\n\nFix: add rules to namsbokasafn-vefur/static/styles/content.css or add to EXTERNAL_CLASSES/STRUCTURAL_CLASSES in this test if intentional.`
        );
      }
    }
  );

  it.skipIf(!vefurExists || !pubExists)(
    'content.css has no obviously dead selectors for content classes',
    () => {
      const cssContent = fs.readFileSync(VEFUR_CSS_PATH, 'utf-8');
      const cssClasses = extractCssClasses(cssContent);

      // Collect classes from all rendered HTML files
      const htmlFiles = glob.sync('**/*.html', { cwd: PUBLICATION_DIR });
      const allHtmlClasses = new Set();
      for (const file of htmlFiles) {
        const content = fs.readFileSync(path.join(PUBLICATION_DIR, file), 'utf-8');
        for (const cls of extractHtmlClasses(content)) {
          allHtmlClasses.add(cls);
        }
      }

      // CSS classes not used in any HTML — potential dead code
      // This is informational, not a failure, since CSS may cover
      // content types not yet rendered (other books, future chapters)
      const unused = [];
      for (const cls of cssClasses) {
        if (!allHtmlClasses.has(cls)) {
          unused.push(cls);
        }
      }

      // Just log, don't fail — some CSS rules are for future content
      if (unused.length > 0) {
        console.log(
          `Info: ${unused.length} CSS classes in content.css not used in current rendered HTML:\n  ${unused.sort().join(', ')}`
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
