/**
 * Tests for pipeline consistency validator
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateChapter, validateBook } from '../validate-pipeline-consistency.js';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-validate-'));
}

function setupTestBook(tmpDir) {
  // Create minimal book structure
  const bookDir = path.join(tmpDir, 'books', 'test-book');
  const dataDir = path.join(tmpDir, 'server', 'data');

  // Create directories
  fs.mkdirSync(path.join(bookDir, '02-mt-output', 'ch01'), { recursive: true });
  fs.mkdirSync(path.join(bookDir, '03-faithful-translation', 'ch01'), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  // Create catalog
  fs.writeFileSync(
    path.join(dataDir, 'test-book.json'),
    JSON.stringify({
      book: 'test-book',
      slug: 'test-book',
      chapters: [
        {
          chapter: 1,
          title: 'Chapter 1',
          modules: [
            { id: 'm00001', section: 'intro', title: 'Introduction' },
            { id: 'm00002', section: '1.1', title: 'Section 1' },
            { id: 'm00003', section: '1.2', title: 'Section 2' },
          ],
        },
      ],
    })
  );

  return { bookDir, dataDir };
}

function addMtOutput(bookDir, chDir, moduleId) {
  const dir = path.join(bookDir, '02-mt-output', chDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${moduleId}-segments.is.md`), 'test content');
}

function addFaithful(bookDir, chDir, moduleId) {
  const dir = path.join(bookDir, '03-faithful-translation', chDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${moduleId}-segments.is.md`), 'test content');
}

describe('Pipeline consistency validator', () => {
  let tmpDir;
  let bookDir;
  let booksDir;

  beforeEach(() => {
    tmpDir = createTempDir();
    const result = setupTestBook(tmpDir);
    bookDir = result.bookDir;
    booksDir = path.join(tmpDir, 'books');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports no issues when linguisticReview is not complete', () => {
    addMtOutput(bookDir, 'ch01', 'm00001');
    addMtOutput(bookDir, 'ch01', 'm00002');

    const result = validateChapter(
      'test-book',
      1,
      ['m00001', 'm00002', 'm00003'],
      { linguisticReview: 'not_started' },
      { booksDir }
    );

    // Only checking for errors related to linguisticReview (not rendering etc.)
    const lrIssues = result.issues.filter((i) => i.message.includes('linguisticReview'));
    expect(lrIssues).toHaveLength(0);
  });

  it('reports error when linguisticReview complete but faithful files missing', () => {
    addMtOutput(bookDir, 'ch01', 'm00001');
    addMtOutput(bookDir, 'ch01', 'm00002');
    addMtOutput(bookDir, 'ch01', 'm00003');
    addFaithful(bookDir, 'ch01', 'm00001');
    // m00002 and m00003 missing

    const result = validateChapter(
      'test-book',
      1,
      ['m00001', 'm00002', 'm00003'],
      { linguisticReview: 'complete' },
      { booksDir }
    );

    const errors = result.issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('2 module(s) missing faithful files');
    expect(errors[0].message).toContain('m00002');
    expect(errors[0].message).toContain('m00003');
  });

  it('reports no error when linguisticReview complete and all faithful files exist', () => {
    addMtOutput(bookDir, 'ch01', 'm00001');
    addMtOutput(bookDir, 'ch01', 'm00002');
    addFaithful(bookDir, 'ch01', 'm00001');
    addFaithful(bookDir, 'ch01', 'm00002');

    const result = validateChapter(
      'test-book',
      1,
      ['m00001', 'm00002'],
      { linguisticReview: 'complete' },
      { booksDir }
    );

    const errors = result.issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('reports warning for faithful files without MT output (orphans)', () => {
    addMtOutput(bookDir, 'ch01', 'm00001');
    addFaithful(bookDir, 'ch01', 'm00001');
    addFaithful(bookDir, 'ch01', 'm99999'); // orphan — no MT output

    const result = validateChapter(
      'test-book',
      1,
      ['m00001'],
      { linguisticReview: 'not_started' },
      { booksDir }
    );

    const warnings = result.issues.filter((i) => i.severity === 'warning');
    expect(warnings.some((w) => w.message.includes('m99999'))).toBe(true);
  });

  it('reports info when all faithful files exist but stage not marked complete', () => {
    addMtOutput(bookDir, 'ch01', 'm00001');
    addMtOutput(bookDir, 'ch01', 'm00002');
    addFaithful(bookDir, 'ch01', 'm00001');
    addFaithful(bookDir, 'ch01', 'm00002');

    const result = validateChapter(
      'test-book',
      1,
      ['m00001', 'm00002'],
      { linguisticReview: 'not_started' },
      { booksDir }
    );

    const infos = result.issues.filter((i) => i.severity === 'info');
    expect(infos.some((i) => i.message.includes('not marked complete'))).toBe(true);
  });

  it('reports rendering error when complete but no HTML files', () => {
    const result = validateChapter(
      'test-book',
      1,
      ['m00001'],
      { rendering: 'complete' },
      { booksDir }
    );

    const errors = result.issues.filter((i) => i.severity === 'error');
    expect(errors.some((e) => e.message.includes('no HTML files'))).toBe(true);
  });

  it('works with real book data (efnafraedi-2e)', () => {
    // This test uses real filesystem data — skip if not available
    const realBookDir = path.resolve(__dirname, '../../books/efnafraedi-2e');
    if (!fs.existsSync(realBookDir)) return;

    const result = validateBook('efnafraedi-2e');
    expect(result.book).toBe('efnafraedi-2e');
    expect(result.summary).toBeDefined();
    expect(typeof result.summary.errors).toBe('number');
    expect(typeof result.summary.warnings).toBe('number');
  });
});
