import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');
const TOOLS = join(ROOT, 'tools');
const BOOKS = join(ROOT, 'books', 'efnafraedi');

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
}

// =====================================================================
// cnxml-inject integration tests
// =====================================================================

describe('cnxml-inject', () => {
  it('should inject a single module (m68663, ch01 introduction)', () => {
    run(
      `node ${join(TOOLS, 'cnxml-inject.js')} --chapter 1 --module m68663 --source-dir 02-machine-translated`
    );

    // The tool writes to 03-translated/{track}/ — check the standard location
    const standardOutput = join(BOOKS, '03-translated', 'mt-preview', 'ch01', 'm68663.cnxml');
    expect(existsSync(standardOutput)).toBe(true);

    const cnxml = readFileSync(standardOutput, 'utf8');

    // Basic structure checks
    expect(cnxml).toContain('<document');
    expect(cnxml).toContain('xmlns="http://cnx.rice.edu/cnxml"');
    expect(cnxml).toContain('m68663');
  });

  it('should produce valid CNXML with translated content', () => {
    const cnxml = readFileSync(
      join(BOOKS, '03-translated', 'mt-preview', 'ch01', 'm68663.cnxml'),
      'utf8'
    );

    // Should contain Icelandic translated text (not English)
    expect(cnxml).toContain('Inngangur'); // Translated title
    expect(cnxml).toContain('Efnafræði í samhengi'); // Abstract item

    // Should NOT contain only English
    expect(cnxml).not.toMatch(/<title>Introduction<\/title>/);
  });

  it('should preserve CNXML element IDs', () => {
    const cnxml = readFileSync(
      join(BOOKS, '03-translated', 'mt-preview', 'ch01', 'm68663.cnxml'),
      'utf8'
    );

    // IDs from original CNXML must be preserved
    expect(cnxml).toContain('id="CNX_Chem_01_00_DailyChem"'); // figure ID
    expect(cnxml).toContain('id="fs-idp32962032"'); // paragraph ID
    expect(cnxml).toContain('id="fs-idp22452080"'); // paragraph ID
  });

  it('should inject a full chapter', () => {
    run(
      `node ${join(TOOLS, 'cnxml-inject.js')} --chapter 1 --source-dir 02-machine-translated --allow-incomplete`
    );

    const outputPath = join(BOOKS, '03-translated', 'mt-preview', 'ch01');
    const modules = ['m68663', 'm68664', 'm68667', 'm68670', 'm68674', 'm68683', 'm68690'];

    for (const mod of modules) {
      const file = join(outputPath, `${mod}.cnxml`);
      expect(existsSync(file), `Missing: ${mod}.cnxml`).toBe(true);
    }
  });
});

// =====================================================================
// cnxml-render integration tests
// =====================================================================

describe('cnxml-render', () => {
  it('should render a chapter to HTML', () => {
    run(`node ${join(TOOLS, 'cnxml-render.js')} --chapter 1 --track mt-preview`);

    const outputPath = join(BOOKS, '05-publication', 'mt-preview', 'chapters', '01');
    expect(existsSync(outputPath)).toBe(true);

    // Check key output files exist
    const expectedFiles = [
      '1-0-introduction.html',
      '1-1-efnafraedi-i-samhengi.html',
      '1-exercises.html',
      '1-key-terms.html',
      '1-summary.html',
    ];
    for (const file of expectedFiles) {
      expect(existsSync(join(outputPath, file)), `Missing: ${file}`).toBe(true);
    }
  });

  it('should produce valid HTML documents', () => {
    const html = readFileSync(
      join(
        BOOKS,
        '05-publication',
        'mt-preview',
        'chapters',
        '01',
        '1-1-efnafraedi-i-samhengi.html'
      ),
      'utf8'
    );

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="is">');
    expect(html).toContain('<meta charset="UTF-8">');
    expect(html).toContain('</html>');
  });

  it('should include translated content', () => {
    const html = readFileSync(
      join(
        BOOKS,
        '05-publication',
        'mt-preview',
        'chapters',
        '01',
        '1-1-efnafraedi-i-samhengi.html'
      ),
      'utf8'
    );

    // Icelandic content present
    expect(html).toContain('Efnafræði í samhengi');
    expect(html).toContain('Námsmarkmið'); // Learning objectives header
  });

  it('should preserve element IDs in HTML', () => {
    const html = readFileSync(
      join(
        BOOKS,
        '05-publication',
        'mt-preview',
        'chapters',
        '01',
        '1-1-efnafraedi-i-samhengi.html'
      ),
      'utf8'
    );

    expect(html).toContain('id="fs-idp77567568"'); // paragraph ID
    expect(html).toContain('id="CNX_Chem_01_01_Alchemist"'); // figure ID
  });

  it('should produce end-of-chapter pages', () => {
    const outputPath = join(BOOKS, '05-publication', 'mt-preview', 'chapters', '01');

    // Exercises
    const exercises = readFileSync(join(outputPath, '1-exercises.html'), 'utf8');
    expect(exercises).toContain('<!DOCTYPE html>');
    expect(exercises).toContain('eoc-exercise');

    // Key terms
    const keyTerms = readFileSync(join(outputPath, '1-key-terms.html'), 'utf8');
    expect(keyTerms).toContain('<!DOCTYPE html>');

    // Summary
    const summary = readFileSync(join(outputPath, '1-summary.html'), 'utf8');
    expect(summary).toContain('<!DOCTYPE html>');
  });
});

// =====================================================================
// Regression tests for fixed pipeline issues
// Uses chapter 3 which has examples, exercises, equations, cross-refs
// =====================================================================

describe('pipeline regression tests', () => {
  const ch03path = join(BOOKS, '05-publication', 'mt-preview', 'chapters', '03');

  // Verify chapter 3 output exists (pre-rendered)
  beforeAll(() => {
    expect(existsSync(ch03path), 'Chapter 3 HTML not found — run render first').toBe(true);
  });

  describe('Issue #1: Image paths', () => {
    it('should use absolute paths for images', () => {
      const html = readFileSync(join(ch03path, '3-1-formulumassi-og-molhugtakid.html'), 'utf8');

      // Images should use absolute paths, not relative ../../media/
      expect(html).not.toMatch(/src="\.\.\/\.\.\/media\//);
      expect(html).toMatch(/src="\/content\/efnafraedi\/chapters\/03\/images\/media\//);
    });
  });

  describe('Issue #2: Content duplication', () => {
    it('should not duplicate figures inside examples', () => {
      const html = readFileSync(join(ch03path, '3-1-formulumassi-og-molhugtakid.html'), 'utf8');

      // Count occurrences of a specific figure that appears inside an example
      const chloroformMatches = html.match(/CNX_Chem_03_01_chloroform/g) || [];
      // Should appear in figure (img src + maybe caption) but not duplicated
      expect(chloroformMatches.length).toBeLessThanOrEqual(3); // img src, alt, figcaption
    });
  });

  describe('Issue #3: Equations render', () => {
    it('should render MathML as SVG (not leave raw MathML)', () => {
      // Chapter 3 section 1 has equations
      const html = readFileSync(join(ch03path, '3-1-formulumassi-og-molhugtakid.html'), 'utf8');

      // Should have SVG equations (from MathJax), not raw MathML tags
      expect(html).not.toMatch(/<m:math/);
      // Check for SVG output or rendered math
      const hasSvg = html.includes('<svg') || html.includes('class="MathJax');
      const hasKatex = html.includes('class="katex');
      expect(hasSvg || hasKatex, 'Should have rendered math (SVG or KaTeX)').toBe(true);
    });
  });

  describe('Issue #5: Examples structure', () => {
    it('should render examples with correct CSS classes', () => {
      const html = readFileSync(join(ch03path, '3-1-formulumassi-og-molhugtakid.html'), 'utf8');

      // Example container
      expect(html).toMatch(/class="example"/);

      // Example label
      expect(html).toMatch(/class="example-label"/);
      expect(html).toMatch(/Dæmi 3\.\d/);
    });

    it('should include solution sections in examples', () => {
      const html = readFileSync(join(ch03path, '3-1-formulumassi-og-molhugtakid.html'), 'utf8');

      // Solution/answer sections
      expect(html).toContain('Lausn');
    });
  });

  describe('Issue #6: Exercises structure', () => {
    it('should render end-of-chapter exercises with correct classes', () => {
      const html = readFileSync(join(ch03path, '3-exercises.html'), 'utf8');

      // Exercise containers
      expect(html).toMatch(/class="eoc-exercise/);

      // Problem containers
      expect(html).toMatch(/class="problem"/);

      // Exercise numbering
      expect(html).toMatch(/data-exercise-number="/);
    });

    it('should have exercise numbering data attributes', () => {
      const html = readFileSync(join(ch03path, '3-exercises.html'), 'utf8');

      // Exercises should have data attributes for numbering
      expect(html).toMatch(/data-exercise-id="/);
      expect(html).toMatch(/data-exercise-number="\d+"/);

      // Should have multiple exercises
      const exerciseCount = (html.match(/class="eoc-exercise"/g) || []).length;
      expect(exerciseCount).toBeGreaterThan(10);
    });
  });

  describe('Issue #7: Cross-references', () => {
    it('should resolve figure cross-references (not empty parentheses)', () => {
      const html = readFileSync(join(ch03path, '3-1-formulumassi-og-molhugtakid.html'), 'utf8');

      // Should NOT have empty () for cross-references
      expect(html).not.toMatch(/>\(\s*\)</);

      // Should have resolved figure references
      expect(html).toMatch(/Mynd 3\.\d/);
    });

    it('should resolve example cross-references', () => {
      const html = readFileSync(join(ch03path, '3-1-formulumassi-og-molhugtakid.html'), 'utf8');

      // Should have resolved example references
      expect(html).toMatch(/Dæmi 3\.\d/);
    });
  });

  describe('Issue #8: Inline \\times artifacts', () => {
    it('should not have ×{\\times}× artifacts', () => {
      const html = readFileSync(join(ch03path, '3-1-formulumassi-og-molhugtakid.html'), 'utf8');

      // Should NOT have the triple-times artifact
      expect(html).not.toContain('×{\\times}×');
      expect(html).not.toContain('{\\times}');
    });
  });

  describe('General HTML quality', () => {
    it('should have data attributes for numbered elements', () => {
      const html = readFileSync(join(ch03path, '3-1-formulumassi-og-molhugtakid.html'), 'utf8');

      expect(html).toMatch(/data-figure-number="/);
      expect(html).toMatch(/data-example-number="/);
    });

    it('should produce answer key', () => {
      const answerKey = readFileSync(join(ch03path, '3-answer-key.html'), 'utf8');

      expect(answerKey).toContain('<!DOCTYPE html>');
      // Answer key has answer entries with exercise IDs
      expect(answerKey).toMatch(/class="answer-entry"/);
    });
  });
});

// =====================================================================
// Round-trip test: inject then render for a single module
// =====================================================================

describe('inject → render round-trip', () => {
  it('should produce HTML from source segments via inject then render', () => {
    // Inject chapter 1 introduction
    run(
      `node ${join(TOOLS, 'cnxml-inject.js')} --chapter 1 --module m68663 --source-dir 02-machine-translated`
    );

    const injectedCnxml = join(BOOKS, '03-translated', 'mt-preview', 'ch01', 'm68663.cnxml');
    expect(existsSync(injectedCnxml)).toBe(true);

    // Render chapter 1
    run(`node ${join(TOOLS, 'cnxml-render.js')} --chapter 1 --track mt-preview`);

    const renderedHtml = join(
      BOOKS,
      '05-publication',
      'mt-preview',
      'chapters',
      '01',
      '1-0-introduction.html'
    );
    expect(existsSync(renderedHtml)).toBe(true);

    const html = readFileSync(renderedHtml, 'utf8');

    // The Icelandic text from segments should appear in the HTML
    expect(html).toContain('Inngangur');
    expect(html).toContain('Vekjaraklukkan'); // First word of first paragraph
    expect(html).toContain('id="fs-idp32962032"'); // Paragraph ID preserved
  });
});
