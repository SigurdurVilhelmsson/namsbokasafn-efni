/**
 * Localization Review Service (Pass 2 review tier, Unit 2).
 *
 * Covers: the per-book toggle, submit (pending) → approve-applies-to-file /
 * reject, the one-pending-per-segment upsert, and the review queue. Uses an
 * in-memory DB (tables built from migration 034) and a temp books directory.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const review = require('../services/localizationReviewService');
const segmentParser = require('../services/segmentParser');
const migration = require('../migrations/034-localization-review');

const originalBooksDir = segmentParser.BOOKS_DIR;

const BOOK = 'testbook';
const CHAPTER = 1;
const MODULE = 'm00001';
const SEG = (id) => `${MODULE}:para:${id}`;
const EN_IDS = ['fs-id001', 'fs-id002'];

function fileBody(segments) {
  return segments
    .map((s) => {
      const [mod, type, el] = s.segmentId.split(':');
      return `<!-- SEG:${mod}:${type}:${el} -->\n${s.content}`;
    })
    .join('\n\n');
}

function localizedDir(booksDir) {
  return join(booksDir, BOOK, '04-localized-content', 'ch01');
}

function readLocalized(booksDir) {
  const p = join(localizedDir(booksDir), `${MODULE}-segments.is.md`);
  const map = {};
  for (const s of segmentParser.parseSegments(readFileSync(p, 'utf-8'))) {
    map[s.segmentId] = s.content.trim();
  }
  return map;
}

describe('localizationReviewService', () => {
  let db;
  let tmpDir;
  let booksDir;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    migration.up(db); // build localization_pending_edits + book_settings
    review._setTestDb(db);

    tmpDir = mkdtempSync(join(tmpdir(), 'locreview-test-'));
    booksDir = join(tmpDir, 'books');
    const bookDir = join(booksDir, BOOK);

    const enDir = join(bookDir, '02-for-mt', 'ch01');
    mkdirSync(enDir, { recursive: true });
    writeFileSync(
      join(enDir, `${MODULE}-segments.en.md`),
      fileBody(EN_IDS.map((id) => ({ segmentId: SEG(id), content: `EN ${id}` }))),
      'utf-8'
    );

    const faithfulDir = join(bookDir, '03-faithful-translation', 'ch01');
    mkdirSync(faithfulDir, { recursive: true });
    writeFileSync(
      join(faithfulDir, `${MODULE}-segments.is.md`),
      fileBody(EN_IDS.map((id) => ({ segmentId: SEG(id), content: `Hrein ${id}` }))),
      'utf-8'
    );

    segmentParser._setTestBooksDir(booksDir);
  });

  afterEach(() => {
    db.close();
    review._setTestDb(null);
    segmentParser._setTestBooksDir(originalBooksDir);
  });

  it('per-book toggle defaults OFF and round-trips', () => {
    expect(review.isReviewEnabled(BOOK)).toBe(false);
    expect(review.setReviewEnabled(BOOK, true)).toBe(true);
    expect(review.isReviewEnabled(BOOK)).toBe(true);
    expect(review.setReviewEnabled(BOOK, false)).toBe(false);
    expect(review.isReviewEnabled(BOOK)).toBe(false);
  });

  it('submitEdit creates one pending edit per segment (re-submit updates)', () => {
    const first = review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'Hrein fs-id001',
      editedContent: 'Staðfært v1',
      editorId: 4,
      editorUsername: 'editorA',
    });
    expect(first.updated).toBe(false);

    const second = review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'Hrein fs-id001',
      editedContent: 'Staðfært v2',
      editorId: 4,
      editorUsername: 'editorA',
    });
    expect(second.updated).toBe(true);
    expect(second.id).toBe(first.id);

    const pending = review.getPendingByModule(BOOK, MODULE);
    expect(pending).toHaveLength(1);
    expect(pending[0].edited_content).toBe('Staðfært v2');
  });

  it('approve applies the edit to 04-localized-content/ and marks it applied', () => {
    const { id } = review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'Hrein fs-id001',
      editedContent: 'Staðfært efni',
      editorId: 4,
      editorUsername: 'editorA',
    });

    // A different head-editor approves
    const { edit, savedPath } = review.approveAndApply(id, 2, 'headX', 'ok');
    expect(edit.status).toBe('approved');
    expect(edit.reviewer_username).toBe('headX');
    expect(edit.applied_at).toBeTruthy();
    expect(existsSync(savedPath)).toBe(true);

    const onDisk = readLocalized(booksDir);
    // Edited segment localized; the untouched segment falls back to faithful
    expect(onDisk[SEG('fs-id001')]).toBe('Staðfært efni');
    expect(onDisk[SEG('fs-id002')]).toBe('Hrein fs-id002');

    // No longer pending; re-approving throws
    expect(review.getPendingByModule(BOOK, MODULE)).toHaveLength(0);
    expect(() => review.approveAndApply(id, 2, 'headX')).toThrow(/not pending/);
  });

  it('permits self-approval (mirrors Pass 1 post-#101)', () => {
    const { id } = review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id002'),
      originalContent: 'Hrein fs-id002',
      editedContent: 'Sjálf-samþykkt',
      editorId: 2,
      editorUsername: 'headX',
    });
    // Same person (headX) approves their own edit — allowed
    const { edit } = review.approveAndApply(id, 2, 'headX');
    expect(edit.status).toBe('approved');
    expect(readLocalized(booksDir)[SEG('fs-id002')]).toBe('Sjálf-samþykkt');
  });

  it('snapshots the prior localized file to a .bak before overwrite', () => {
    // Seed an existing localized file so approve overwrites it
    mkdirSync(localizedDir(booksDir), { recursive: true });
    writeFileSync(
      join(localizedDir(booksDir), `${MODULE}-segments.is.md`),
      fileBody(EN_IDS.map((id) => ({ segmentId: SEG(id), content: `Gamalt ${id}` }))),
      'utf-8'
    );

    const { id } = review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'Gamalt fs-id001',
      editedContent: 'Nýtt staðfært',
      editorId: 4,
      editorUsername: 'editorA',
    });
    review.approveAndApply(id, 2, 'headX');

    const baks = readdirSync(localizedDir(booksDir)).filter((f) => f.endsWith('.bak'));
    expect(baks.length).toBeGreaterThanOrEqual(1);
  });

  it('reject marks the edit rejected and leaves the localized file untouched', () => {
    const { id } = review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'Hrein fs-id001',
      editedContent: 'Hafnað efni',
      editorId: 4,
      editorUsername: 'editorA',
    });
    const edit = review.rejectEdit(id, 2, 'headX', 'nei');
    expect(edit.status).toBe('rejected');
    expect(edit.reviewer_note).toBe('nei');
    // Nothing written to 04-localized-content/
    expect(existsSync(join(localizedDir(booksDir), `${MODULE}-segments.is.md`))).toBe(false);
  });

  it('review queue groups pending edits by module', () => {
    review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id001'),
      originalContent: 'a',
      editedContent: 'b',
      editorId: 4,
      editorUsername: 'editorA',
    });
    review.submitEdit({
      book: BOOK,
      chapter: CHAPTER,
      moduleId: MODULE,
      segmentId: SEG('fs-id002'),
      originalContent: 'c',
      editedContent: 'd',
      editorId: 4,
      editorUsername: 'editorA',
    });
    const queue = review.getReviewQueue(BOOK);
    expect(queue).toHaveLength(1);
    expect(queue[0].module_id).toBe(MODULE);
    expect(queue[0].pending_edits).toBe(2);
  });
});
