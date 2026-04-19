/**
 * Tests for validate-chapter.js
 *
 * Tests the chapter validation tool that checks structure, content,
 * and publication readiness before deploying chapters.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { validateChapter, parseArgs, formatResults, TRACKS } from '../validate-chapter.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'validate-chapter-'));
}

/**
 * Create a minimal book structure under tmpDir suitable for validation.
 * Returns the tmpDir (used as projectRoot).
 */
function setupBook(tmpDir, book, chapter, { track = 'mt-preview' } = {}) {
  const chapterDir = `ch${String(chapter).padStart(2, '0')}`;
  const trackConfig = TRACKS[track];
  const sourceDir = path.join(tmpDir, 'books', book, trackConfig.sourceDir, chapterDir);
  fs.mkdirSync(sourceDir, { recursive: true });
  return { sourceDir, chapterDir };
}

function addSegmentFile(
  sourceDir,
  moduleId,
  content = '<!-- SEG:m00001:para:auto-1 -->\nTest segment'
) {
  fs.writeFileSync(path.join(sourceDir, `${moduleId}-segments.is.md`), content);
}

function addMarkdownFile(sourceDir, filename, content) {
  fs.writeFileSync(path.join(sourceDir, filename), content);
}

function setupHtmlPub(tmpDir, book, chapter, track = 'mt-preview') {
  const chapterStr = String(chapter).padStart(2, '0');
  const trackConfig = TRACKS[track];
  const pubDir = path.join(tmpDir, 'books', book, trackConfig.pubDir, 'chapters', chapterStr);
  fs.mkdirSync(pubDir, { recursive: true });
  return pubDir;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('parseArgs', () => {
  it('parses book and chapter from positional args', () => {
    const result = parseArgs(['my-book', '3']);
    expect(result.book).toBe('my-book');
    expect(result.chapter).toBe(3);
  });

  it('defaults to faithful track', () => {
    const result = parseArgs(['my-book', '1']);
    expect(result.track).toBe('faithful');
  });

  it('parses --track option', () => {
    const result = parseArgs(['my-book', '1', '--track', 'mt-preview']);
    expect(result.track).toBe('mt-preview');
  });

  it('parses --strict, --json, --fix flags', () => {
    const result = parseArgs(['my-book', '1', '--strict', '--json', '--fix']);
    expect(result.strict).toBe(true);
    expect(result.json).toBe(true);
    expect(result.fix).toBe(true);
  });

  it('parses --help flag', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
  });
});

describe('validateChapter', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Valid chapter ──────────────────────────────────────────────

  it('passes when IS segment files exist', async () => {
    const { sourceDir } = setupBook(tmpDir, 'test-book', 1, { track: 'mt-preview' });
    addSegmentFile(sourceDir, 'm00001');
    addSegmentFile(sourceDir, 'm00002');

    const results = await validateChapter({
      book: 'test-book',
      chapter: 1,
      track: 'mt-preview',
      projectRoot: tmpDir,
    });

    expect(results.checks['files-exist'].passed).toBe(true);
    expect(results.checks['files-exist'].issues).toHaveLength(0);
  });

  // ─── Missing source directory ──────────────────────────────────

  it('reports error when source directory is missing', async () => {
    // Don't create any directories at all
    const results = await validateChapter({
      book: 'nonexistent-book',
      chapter: 99,
      track: 'faithful',
      projectRoot: tmpDir,
    });

    const filesCheck = results.checks['files-exist'];
    expect(filesCheck.passed).toBe(false);
    expect(filesCheck.issues).toHaveLength(1);
    expect(filesCheck.issues[0].message).toContain('Source directory not found');
  });

  // ─── No segment files ──────────────────────────────────────────

  it('reports error when source dir exists but has no segment files', async () => {
    setupBook(tmpDir, 'test-book', 1, { track: 'mt-preview' });
    // Directory exists but empty

    const results = await validateChapter({
      book: 'test-book',
      chapter: 1,
      track: 'mt-preview',
      projectRoot: tmpDir,
    });

    const filesCheck = results.checks['files-exist'];
    expect(filesCheck.passed).toBe(false);
    expect(filesCheck.issues[0].message).toContain('No IS segment files');
  });

  // ─── Orphan equation placeholders ──────────────────────────────

  it('detects orphan [[EQ:N]] placeholders in segment files', async () => {
    const { sourceDir } = setupBook(tmpDir, 'test-book', 1, { track: 'mt-preview' });
    addSegmentFile(sourceDir, 'm00001', 'Normal text\nSee equation [[EQ:1]] and [[EQ:2]] here');

    const results = await validateChapter({
      book: 'test-book',
      chapter: 1,
      track: 'mt-preview',
      projectRoot: tmpDir,
    });

    const eqCheck = results.checks['equations'];
    expect(eqCheck.passed).toBe(false);
    expect(eqCheck.issues).toHaveLength(2);
    expect(eqCheck.issues[0].message).toContain('Orphan equation placeholder');
  });

  it('passes when no equation placeholders exist', async () => {
    const { sourceDir } = setupBook(tmpDir, 'test-book', 1, { track: 'mt-preview' });
    addSegmentFile(sourceDir, 'm00001', 'Clean content without placeholders');

    const results = await validateChapter({
      book: 'test-book',
      chapter: 1,
      track: 'mt-preview',
      projectRoot: tmpDir,
    });

    expect(results.checks['equations'].passed).toBe(true);
  });

  // ─── Unclosed directives ───────────────────────────────────────

  it('detects unclosed directive blocks', async () => {
    const { sourceDir } = setupBook(tmpDir, 'test-book', 1, { track: 'mt-preview' });
    addMarkdownFile(sourceDir, 'section.md', ':::note\nSome note content\n');

    const results = await validateChapter({
      book: 'test-book',
      chapter: 1,
      track: 'mt-preview',
      projectRoot: tmpDir,
    });

    const dirCheck = results.checks['directives'];
    expect(dirCheck.passed).toBe(false);
    expect(dirCheck.issues[0].message).toContain('Unclosed directive: :::note');
  });

  it('passes when all directives are properly closed', async () => {
    const { sourceDir } = setupBook(tmpDir, 'test-book', 1, { track: 'mt-preview' });
    addMarkdownFile(sourceDir, 'section.md', ':::note\nSome note\n:::\n');

    const results = await validateChapter({
      book: 'test-book',
      chapter: 1,
      track: 'mt-preview',
      projectRoot: tmpDir,
    });

    expect(results.checks['directives'].passed).toBe(true);
  });

  // ─── HTML placeholder leaks ────────────────────────────────────

  it('detects [[MATH:N]] placeholders leaked into HTML output', async () => {
    const pubDir = setupHtmlPub(tmpDir, 'test-book', 1, 'mt-preview');
    fs.writeFileSync(
      path.join(pubDir, '1-1-intro.html'),
      '<main><p>The value of [[MATH:1]] equals [[MATH:2]].</p></main>'
    );

    const results = await validateChapter({
      book: 'test-book',
      chapter: 1,
      track: 'mt-preview',
      projectRoot: tmpDir,
    });

    const htmlCheck = results.checks['html-placeholder-leaks'];
    expect(htmlCheck.passed).toBe(false);
    expect(htmlCheck.issues[0].message).toContain('[[MATH:N]] placeholder');
  });

  it('passes when HTML output has no leaked placeholders', async () => {
    const pubDir = setupHtmlPub(tmpDir, 'test-book', 1, 'mt-preview');
    fs.writeFileSync(
      path.join(pubDir, '1-1-intro.html'),
      '<main><p>Clean HTML content with proper equations rendered as SVG.</p></main>'
    );

    // Also set up source dir so files-exist doesn't dominate
    const { sourceDir } = setupBook(tmpDir, 'test-book', 1, { track: 'mt-preview' });
    addSegmentFile(sourceDir, 'm00001');

    const results = await validateChapter({
      book: 'test-book',
      chapter: 1,
      track: 'mt-preview',
      projectRoot: tmpDir,
    });

    expect(results.checks['html-placeholder-leaks'].passed).toBe(true);
  });

  // ─── HTML non-empty ────────────────────────────────────────────

  it('detects empty HTML files in publication output', async () => {
    const pubDir = setupHtmlPub(tmpDir, 'test-book', 1, 'mt-preview');
    fs.writeFileSync(path.join(pubDir, '1-1-empty.html'), '');

    const results = await validateChapter({
      book: 'test-book',
      chapter: 1,
      track: 'mt-preview',
      projectRoot: tmpDir,
    });

    const htmlCheck = results.checks['html-non-empty'];
    expect(htmlCheck.passed).toBe(false);
    expect(htmlCheck.issues[0].message).toContain('HTML file is empty');
  });

  it('detects HTML files with too-short main content', async () => {
    const pubDir = setupHtmlPub(tmpDir, 'test-book', 1, 'mt-preview');
    fs.writeFileSync(path.join(pubDir, '1-1-short.html'), '<main><p>Hi</p></main>');

    const results = await validateChapter({
      book: 'test-book',
      chapter: 1,
      track: 'mt-preview',
      projectRoot: tmpDir,
    });

    const htmlCheck = results.checks['html-non-empty'];
    expect(htmlCheck.passed).toBe(false);
    expect(htmlCheck.issues[0].message).toContain('<main> content is too short');
  });

  // ─── Invalid track ─────────────────────────────────────────────

  it('throws on invalid track name', async () => {
    await expect(
      validateChapter({
        book: 'test-book',
        chapter: 1,
        track: 'nonexistent-track',
        projectRoot: tmpDir,
      })
    ).rejects.toThrow('Invalid track');
  });

  // ─── Return format ─────────────────────────────────────────────

  it('returns correct result structure', async () => {
    const { sourceDir } = setupBook(tmpDir, 'test-book', 1, { track: 'mt-preview' });
    addSegmentFile(sourceDir, 'm00001');

    const results = await validateChapter({
      book: 'test-book',
      chapter: 1,
      track: 'mt-preview',
      projectRoot: tmpDir,
    });

    // Top-level fields
    expect(results.book).toBe('test-book');
    expect(results.chapter).toBe(1);
    expect(results.track).toBe('mt-preview');
    expect(results.chapterDir).toBe('ch01');
    expect(typeof results.valid).toBe('boolean');

    // Summary fields
    expect(typeof results.summary.errors).toBe('number');
    expect(typeof results.summary.warnings).toBe('number');
    expect(typeof results.summary.info).toBe('number');
    expect(typeof results.summary.passed).toBe('number');

    // Each check has expected shape
    for (const check of Object.values(results.checks)) {
      expect(check).toHaveProperty('description');
      expect(check).toHaveProperty('severity');
      expect(check).toHaveProperty('passed');
      if (!check.error) {
        expect(check).toHaveProperty('issues');
        expect(Array.isArray(check.issues)).toBe(true);
      }
    }
  });

  // ─── Strict mode ───────────────────────────────────────────────

  it('treats warnings as errors in strict mode', async () => {
    const { sourceDir } = setupBook(tmpDir, 'test-book', 1, { track: 'mt-preview' });
    // Add a file with an unclosed directive (a WARNING-level check)
    addMarkdownFile(sourceDir, 'section.md', ':::example\nUnclosed\n');
    addSegmentFile(sourceDir, 'm00001');

    // Non-strict run (baseline — may pass despite warnings)
    await validateChapter({
      book: 'test-book',
      chapter: 1,
      track: 'mt-preview',
      strict: false,
      projectRoot: tmpDir,
    });

    const strictResults = await validateChapter({
      book: 'test-book',
      chapter: 1,
      track: 'mt-preview',
      strict: true,
      projectRoot: tmpDir,
    });

    // Without strict, warnings don't cause valid=false (assuming no errors)
    // With strict, warnings cause valid=false
    expect(strictResults.valid).toBe(false);
    expect(strictResults.summary.warnings).toBeGreaterThan(0);
  });

  // ─── Manifest consistency ──────────────────────────────────────

  it('detects segment count mismatch between manifest and segment file', async () => {
    const book = 'test-book';
    const chapterStr = '01';

    // Create structure dir with manifest
    const structDir = path.join(tmpDir, 'books', book, '02-structure', `ch${chapterStr}`);
    fs.mkdirSync(structDir, { recursive: true });

    // Create source CNXML to match hash
    const sourceDir = path.join(tmpDir, 'books', book, '01-source', `ch${chapterStr}`);
    fs.mkdirSync(sourceDir, { recursive: true });
    const cnxmlContent = '<document>test</document>';
    fs.writeFileSync(path.join(sourceDir, 'm00001.cnxml'), cnxmlContent);

    const sourceHash = crypto
      .createHash('sha256')
      .update(cnxmlContent)
      .digest('hex')
      .substring(0, 16);

    fs.writeFileSync(
      path.join(structDir, 'm00001-manifest.json'),
      JSON.stringify({
        moduleId: 'm00001',
        sourceHash,
        segmentCount: 5, // claims 5 segments
      })
    );

    // Create segment file with only 2 segments
    const segDir = path.join(tmpDir, 'books', book, '02-for-mt', `ch${chapterStr}`);
    fs.mkdirSync(segDir, { recursive: true });
    fs.writeFileSync(
      path.join(segDir, 'm00001-segments.en.md'),
      '<!-- SEG:m00001:para:auto-1 -->\nFirst\n<!-- SEG:m00001:para:auto-2 -->\nSecond'
    );

    // Also set up the track source dir
    const { sourceDir: trackSourceDir } = setupBook(tmpDir, book, 1, { track: 'mt-preview' });
    addSegmentFile(trackSourceDir, 'm00001');

    const results = await validateChapter({
      book,
      chapter: 1,
      track: 'mt-preview',
      projectRoot: tmpDir,
    });

    const manifestCheck = results.checks['manifest-consistency'];
    expect(manifestCheck.passed).toBe(false);
    expect(manifestCheck.issues[0].message).toContain('Segment count mismatch');
    expect(manifestCheck.issues[0].message).toContain('manifest says 5');
    expect(manifestCheck.issues[0].message).toContain('file has 2');
  });

  // ─── Status match ──────────────────────────────────────────────

  it('reports when status indicates completion but no files exist', async () => {
    // Create only the chapters status dir (no source files)
    const chapterDir = 'ch01';
    const statusDir = path.join(tmpDir, 'books', 'test-book', 'chapters', chapterDir);
    fs.mkdirSync(statusDir, { recursive: true });
    fs.writeFileSync(
      path.join(statusDir, 'status.json'),
      JSON.stringify({
        status: {
          mtOutput: { complete: true },
        },
      })
    );

    const results = await validateChapter({
      book: 'test-book',
      chapter: 1,
      track: 'mt-preview',
      projectRoot: tmpDir,
    });

    const statusCheck = results.checks['status-match'];
    expect(statusCheck.passed).toBe(false);
    expect(statusCheck.issues[0].message).toContain('Status indicates');
    expect(statusCheck.issues[0].message).toContain('no files found');
  });
});

// ─── formatResults ──────────────────────────────────────────────────

describe('formatResults', () => {
  const sampleResults = {
    book: 'test-book',
    chapter: 1,
    track: 'faithful',
    chapterDir: 'ch01',
    valid: true,
    checks: {
      'files-exist': {
        description: 'Required IS segment files are present',
        severity: 'error',
        passed: true,
        issues: [],
      },
    },
    summary: { errors: 0, warnings: 0, info: 0, passed: 1 },
  };

  it('returns JSON when json option is true', () => {
    const output = formatResults(sampleResults, { json: true });
    const parsed = JSON.parse(output);
    expect(parsed.book).toBe('test-book');
    expect(parsed.valid).toBe(true);
  });

  it('returns human-readable text by default', () => {
    const output = formatResults(sampleResults, { json: false });
    expect(output).toContain('Validating test-book chapter 1');
    expect(output).toContain('Validation PASSED');
  });

  it('shows FAILED for invalid results', () => {
    const failedResults = {
      ...sampleResults,
      valid: false,
      summary: { errors: 1, warnings: 0, info: 0, passed: 0 },
    };
    const output = formatResults(failedResults, { json: false });
    expect(output).toContain('Validation FAILED');
  });
});
