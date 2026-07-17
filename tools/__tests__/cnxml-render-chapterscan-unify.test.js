/**
 * cnxml-render-chapterscan-unify.test.js — item 10 (RV-3): chapter-wide and
 * answer-key exercise scans find attrs-first exercises (physics
 * m42606/m42665/m42440 shape: <exercise type="…" id="…">), which the old
 * id-first / id-only regexes silently dropped from numbering and the answer key.
 *
 * extractAnswerKey resolves module CNXML through translatedCnxmlPath(), which
 * reads the module-level BOOKS_DIR — _setBooksDirForTest() points that at a
 * temp fixture tree for the duration of this file.
 */

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractAnswerKey, _setBooksDirForTest } from '../cnxml-render.js';

function makeModule(dir, chapterDir, moduleId, cnxml) {
  const p = path.join(dir, '03-translated', 'mt-preview', chapterDir);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, `${moduleId}.cnxml`), cnxml);
}

describe('extractAnswerKey — attrs-anywhere exercise scan (scanBlocks)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'item10-ak-'));

  afterAll(() => {
    // Restore the module's real default so any later test in this worker
    // that relies on it (this seam mutates shared module state) sees the
    // normal book tree, not the removed temp fixture.
    _setBooksDirForTest('books/efnafraedi-2e');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('finds both an id-first exercise (equivalence pin) and a type=-first exercise (RV-3 fix)', () => {
    _setBooksDirForTest(dir);
    makeModule(
      dir,
      'ch03',
      'm1',
      '<document xmlns="http://cnx.rice.edu/cnxml"><content>' +
        '<exercise id="exB"><problem id="pB"><para id="ppB">Q1?</para></problem>' +
        '<solution id="sB"><para id="spB">A1.</para></solution></exercise>' +
        '<exercise type="conceptual" id="exA"><problem id="pA"><para id="ppA">Q2?</para></problem>' +
        '<solution id="sA"><para id="spA">A2.</para></solution></exercise>' +
        '</content></document>'
    );

    const answersByModule = extractAnswerKey(3, ['m1'], {}, 'mt-preview');
    expect(answersByModule).toHaveLength(1);
    const ids = answersByModule[0].answers.map((a) => a.id);

    // Equivalence pin: the id-first exercise was already found by today's
    // regex and must still be found (proves the fixture/path/track resolve
    // correctly — if this fails, the RED below is a broken harness, not the
    // parse gap).
    expect(ids).toContain('exB');

    // RV-3 fix: today's regex requires `<exercise id="…">` with id as the
    // sole/first attribute, so the type=-first exercise is silently dropped
    // from the answer key. This is RED against current code.
    expect(ids).toContain('exA');
  });

  it('keeps a numbered exercise its expected content on the answer', () => {
    _setBooksDirForTest(dir);
    makeModule(
      dir,
      'ch04',
      'm2',
      '<document xmlns="http://cnx.rice.edu/cnxml"><content>' +
        '<exercise id="exC"><problem id="pC"><para id="ppC">Q?</para></problem>' +
        '<solution id="sC"><para id="spC">The answer.</para></solution></exercise>' +
        '</content></document>'
    );

    const answersByModule = extractAnswerKey(4, ['m2'], {}, 'mt-preview');
    expect(answersByModule).toHaveLength(1);
    expect(answersByModule[0].answers[0]).toMatchObject({ id: 'exC', number: 1 });
    expect(answersByModule[0].answers[0].content).toContain('The answer.');
  });
});
