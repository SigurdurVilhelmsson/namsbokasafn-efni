/**
 * exercise-extract.test.js — item 9 (D3): 01-source/exercises/*.json →
 * per-chapter segments + skeleton sidecars. Deterministic ids, idempotent
 * re-runs, 18a→ch18 fold, private solutions excluded, malformed JSON = loud
 * per-exercise skip. Fixtures are VERBATIM copies of live cache files
 * (see fixtures/exercises/) — do not edit them.
 *
 * Fixture choices (verified with grep):
 * - 01-03-OC-P01.json: multi-question + stimulus + solutions (required)
 * - 18a-04-OC-P01.json: 18a chapter-token oddity (required)
 * - 01-04-OC-P04.json: img-bearing stem (selected for image property)
 * - 15-99-OC-AP33.json: table-bearing STEM (the `<table>` lives in
 *   questions[0].stem_html, not a solution — this exercise also has
 *   solutions_are_public: false, i.e. no solutions at all. Corpus-verified:
 *   zero exercises anywhere have a table inside a solution, so a
 *   table-in-solution fixture is unsatisfiable from real data. The converter
 *   (htmlToField) is field-agnostic, so stem coverage exercises the same
 *   code path a table-bearing solution would.
 * - 01-99-OC-AP04.json: solutions_are_public=false (selected for privacy property)
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { extractBook } from '../exercise-extract.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'exercises');

/** Build a throwaway book dir with 01-source/exercises from fixtures. */
function makeBook(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-extract-'));
  const exDir = path.join(dir, '01-source', 'exercises');
  fs.mkdirSync(exDir, { recursive: true });
  for (const n of names) {
    fs.copyFileSync(path.join(FIXTURES, n), path.join(exDir, n));
  }
  return dir;
}

describe('extractBook', () => {
  it('writes per-chapter segments with deterministic SEG ids', () => {
    const book = makeBook(['01-03-OC-P01.json']);
    const res = extractBook(book, {});
    expect(res.failures).toEqual([]);
    const seg = fs.readFileSync(
      path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
      'utf8'
    );
    expect(seg).toContain('<!-- SEG:01-03-OC-P01:stimulus:b0 -->');
    expect(seg).toMatch(/<!-- SEG:01-03-OC-P01:stem:\d+-b0 -->/);
    const skel = JSON.parse(
      fs.readFileSync(path.join(book, '02-structure', 'ch01', 'exercises-skeleton.json'), 'utf8')
    );
    const ex = skel.exercises['01-03-OC-P01'];
    expect(ex.source_uid).toBe('37538@3');
    expect(ex.question_order.length).toBeGreaterThan(0);
    expect(ex.fields.stimulus.slots).toBeGreaterThan(0);
  });

  it('folds the 18a chapter token into ch18', () => {
    const book = makeBook(['18a-04-OC-P01.json']);
    const res = extractBook(book, {});
    expect(res.failures).toEqual([]);
    expect(fs.existsSync(path.join(book, '02-for-mt', 'ch18', 'exercises-segments.en.md'))).toBe(
      true
    );
    const seg = fs.readFileSync(
      path.join(book, '02-for-mt', 'ch18', 'exercises-segments.en.md'),
      'utf8'
    );
    expect(seg).toContain('SEG:18a-04-OC-P01:'); // nickname keeps its identity
  });

  it('is idempotent — re-run output is byte-identical', () => {
    const book = makeBook(['01-03-OC-P01.json', '18a-04-OC-P01.json']);
    extractBook(book, {});
    const segPath = path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md');
    const skelPath = path.join(book, '02-structure', 'ch01', 'exercises-skeleton.json');
    const seg1 = fs.readFileSync(segPath, 'utf8');
    const skel1 = fs.readFileSync(skelPath, 'utf8');
    extractBook(book, {});
    expect(fs.readFileSync(segPath, 'utf8')).toBe(seg1);
    expect(fs.readFileSync(skelPath, 'utf8')).toBe(skel1);
  });

  it('skips a malformed JSON loudly and continues', () => {
    const book = makeBook(['01-03-OC-P01.json']);
    fs.writeFileSync(path.join(book, '01-source', 'exercises', '01-04-OC-P99.json'), '{broken');
    const res = extractBook(book, {});
    expect(res.failures.map((f) => f.nickname)).toEqual(['01-04-OC-P99']);
    // the good exercise still extracted:
    expect(fs.existsSync(path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md'))).toBe(
      true
    );
  });

  it('never writes into 01-source', () => {
    const book = makeBook(['01-03-OC-P01.json']);
    const before = fs.readdirSync(path.join(book, '01-source', 'exercises'));
    extractBook(book, {});
    expect(fs.readdirSync(path.join(book, '01-source', 'exercises'))).toEqual(before);
  });

  it('excludes solutions when solutions_are_public is false', () => {
    const book = makeBook(['01-99-OC-AP04.json']);
    extractBook(book, {});
    const seg = fs.readFileSync(
      path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
      'utf8'
    );
    expect(seg).not.toMatch(/:sol:/);
  });

  it('gates out solutions via a synthesized solutions_are_public=false mutation of a real solutions-bearing fixture', () => {
    // 01-99-OC-AP04.json (above) has NO collaborator_solutions at all, so that
    // test would still pass even if the `solutionsPublic &&` guard were
    // deleted. This test copies a fixture that HAS real solutions
    // (01-03-OC-P01.json) and flips its solutions_are_public flag in-memory
    // — a synthesized mutation for this test only. The on-disk fixture file
    // itself is never touched.
    const book = makeBook([]);
    const src = JSON.parse(fs.readFileSync(path.join(FIXTURES, '01-03-OC-P01.json'), 'utf8'));
    expect(src.solutions_are_public).toBe(true); // sanity: real fixture has public solutions
    src.solutions_are_public = false; // synthesized mutation, in-memory only
    fs.writeFileSync(
      path.join(book, '01-source', 'exercises', '01-05-OC-P99.json'),
      JSON.stringify(src)
    );
    const res = extractBook(book, {});
    expect(res.failures).toEqual([]);
    const seg = fs.readFileSync(
      path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
      'utf8'
    );
    expect(seg).not.toMatch(/:sol:/);
    const skel = JSON.parse(
      fs.readFileSync(path.join(book, '02-structure', 'ch01', 'exercises-skeleton.json'), 'utf8')
    );
    const fieldKeys = Object.keys(skel.exercises['01-05-OC-P99'].fields);
    expect(fieldKeys.some((k) => k.startsWith('sol:'))).toBe(false);
  });

  it("never leaks a failing exercise's already-converted fields into the shared segments/skeleton (commit-or-discard)", () => {
    // Regression for a partial-write bug: htmlToField was called per-field
    // inside the per-exercise try, and successful fields were pushed
    // straight into the chapter-wide segLines array as they converted. If a
    // LATER field in the same exercise threw, the earlier field's SEG lines
    // had already been written to the shared array — orphaning them (the
    // exercise itself lands in `failures` and gets no skeleton entry) and
    // wasting MT budget on segments nothing can ever reassemble.
    const book = makeBook(['01-03-OC-P01.json']); // clean exercise, must survive intact
    const badExercise = {
      uid: '99999@1',
      nickname: '01-05-OC-BAD1',
      solutions_are_public: false,
      stimulus_html: 'Valid stimulus text.', // converts fine — would leak pre-fix
      questions: [
        {
          id: 900001,
          stem_html: '<blockquote>unsupported tag</blockquote>', // outside the tag inventory
          collaborator_solutions: [],
        },
      ],
    };
    fs.writeFileSync(
      path.join(book, '01-source', 'exercises', '01-05-OC-BAD1.json'),
      JSON.stringify(badExercise)
    );

    const res = extractBook(book, {});

    expect(res.failures.map((f) => f.nickname)).toEqual(['01-05-OC-BAD1']);

    const seg = fs.readFileSync(
      path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
      'utf8'
    );
    // ZERO SEG: lines for the failing nickname — including the stimulus
    // field, which converted successfully before the later field threw.
    expect(seg).not.toMatch(/SEG:01-05-OC-BAD1:/);

    const skel = JSON.parse(
      fs.readFileSync(path.join(book, '02-structure', 'ch01', 'exercises-skeleton.json'), 'utf8')
    );
    expect(skel.exercises['01-05-OC-BAD1']).toBeUndefined();

    // the clean exercise is still fully present:
    expect(seg).toContain('<!-- SEG:01-03-OC-P01:stimulus:b0 -->');
    expect(skel.exercises['01-03-OC-P01']).toBeDefined();
  });

  it('a duplicate question id within one exercise fails loud (per-exercise skip, final review M-b)', () => {
    // Two questions sharing the same id would collide on the SAME seg-id
    // (`{nickname}:stem:{id}-b{k}`) and skeleton field key (`stem:{id}`) —
    // the second question silently overwrites the first's field/segments
    // rather than surfacing as an error.
    const book = makeBook(['01-03-OC-P01.json']); // clean exercise, must survive intact
    const dupExercise = {
      uid: '88888@1',
      nickname: '01-05-OC-DUP1',
      solutions_are_public: false,
      stimulus_html: '',
      questions: [
        { id: 900001, stem_html: 'First', collaborator_solutions: [] },
        { id: 900001, stem_html: 'Second (duplicate id)', collaborator_solutions: [] },
      ],
    };
    fs.writeFileSync(
      path.join(book, '01-source', 'exercises', '01-05-OC-DUP1.json'),
      JSON.stringify(dupExercise)
    );

    const res = extractBook(book, {});

    expect(res.failures.map((f) => f.nickname)).toEqual(['01-05-OC-DUP1']);

    const seg = fs.readFileSync(
      path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
      'utf8'
    );
    expect(seg).not.toMatch(/SEG:01-05-OC-DUP1:/);

    const skel = JSON.parse(
      fs.readFileSync(path.join(book, '02-structure', 'ch01', 'exercises-skeleton.json'), 'utf8')
    );
    expect(skel.exercises['01-05-OC-DUP1']).toBeUndefined();
    expect(skel.exercises['01-03-OC-P01']).toBeDefined(); // clean exercise unaffected
  });
});

// §C126 #3 / §C123 — an exercise <img>'s alt is an opaque literal, so it was
// never emitted and shipped in English (2,375 organic alts). It is now a
// segment of its own TYPE, `alt`, keyed on the field and the opaque index n of
// the [[MEDIA:n]] it belongs to. A new type is what makes this ADDITIVE: a new
// RUN would shift every later `b{k}` in its field, and 31 chapters of organic
// exercise MT are keyed on those.
describe('extractBook — exercise <img> alt segments', () => {
  const segIds = (text) => [...text.matchAll(/<!-- SEG:(\S+) -->/g)].map((m) => m[1]);
  const readSeg = (book, ch = 'ch01') =>
    fs.readFileSync(path.join(book, '02-for-mt', ch, 'exercises-segments.en.md'), 'utf8');

  /** The fixture with every img alt blanked — the same exercise, minus its alts. */
  function withAltsBlanked(name) {
    const ex = JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
    const blank = (h) => (h ? h.replace(/(<img\b[^>]*\salt=")[^"]*"/g, '$1"') : h);
    ex.stimulus_html = blank(ex.stimulus_html);
    for (const q of ex.questions || []) {
      q.stem_html = blank(q.stem_html);
      for (const s of q.collaborator_solutions || []) s.content_html = blank(s.content_html);
    }
    return ex;
  }

  it('emits a stem image alt as `{nickname}:alt:stem-{qid}-m{n}` carrying the alt text', () => {
    const book = makeBook(['01-04-OC-P04.json']);
    extractBook(book, {});
    expect(readSeg(book)).toMatch(
      /<!-- SEG:01-04-OC-P04:alt:stem-357566-m0 -->\nThe ball and stick model of ethane where grey and /
    );
  });

  it('emits a public-solution image alt as `{nickname}:alt:sol-{qid}-m{n}`', () => {
    const book = makeBook(['01-04-OC-P04.json']);
    extractBook(book, {});
    expect(readSeg(book)).toContain(
      '<!-- SEG:01-04-OC-P04:alt:sol-357566-m0 -->\nThe wedge-dash structure of ethane.\n'
    );
  });

  it("places each alt right after its own field's runs", () => {
    const book = makeBook(['01-04-OC-P04.json']);
    extractBook(book, {});
    const ids = segIds(readSeg(book));
    const at = (id) => ids.indexOf(id);
    const lastStemRun = Math.max(...ids.filter((i) => /:stem:357566-b\d+$/.test(i)).map(at));
    const firstSolRun = Math.min(...ids.filter((i) => /:sol:357566-b\d+$/.test(i)).map(at));
    expect(at('01-04-OC-P04:alt:stem-357566-m0')).toBe(lastStemRun + 1);
    expect(at('01-04-OC-P04:alt:stem-357566-m0')).toBeLessThan(firstSolRun);
  });

  it('adding alt segments renumbers nothing — the non-alt output is byte-identical to the same exercise without alts', () => {
    const book = makeBook(['01-04-OC-P04.json']);
    extractBook(book, {});
    const withAlts = readSeg(book);

    const bare = makeBook([]);
    fs.writeFileSync(
      path.join(bare, '01-source', 'exercises', '01-04-OC-P04.json'),
      JSON.stringify(withAltsBlanked('01-04-OC-P04.json'))
    );
    extractBook(bare, {});
    const withoutAlts = readSeg(bare);

    const dropAltBlocks = (t) => t.replace(/<!-- SEG:\S+:alt:\S+ -->\n[^\n]*\n\n/g, '');
    expect(segIds(withoutAlts).some((i) => i.includes(':alt:'))).toBe(false); // control
    expect(segIds(withAlts).filter((i) => i.includes(':alt:'))).toHaveLength(2); // control
    expect(dropAltBlocks(withAlts)).toBe(withoutAlts);
  });

  it('a blank alt emits no segment', () => {
    const book = makeBook([]);
    fs.writeFileSync(
      path.join(book, '01-source', 'exercises', '01-04-OC-P04.json'),
      JSON.stringify(withAltsBlanked('01-04-OC-P04.json'))
    );
    extractBook(book, {});
    expect(readSeg(book)).not.toContain(':alt:');
  });

  it('never emits an alt for a private solution (the gate covers alts too)', () => {
    // 15-99-OC-AP33 is solutions_are_public: false; its only image is in the stem.
    const book = makeBook(['15-99-OC-AP33.json']);
    extractBook(book, {});
    const ids = segIds(readSeg(book, 'ch15'));
    expect(ids.filter((i) => i.includes(':alt:'))).toEqual(['15-99-OC-AP33:alt:stem-358706-m0']);
  });

  it('counts alt segments in counts.segments and separately in counts.alts', () => {
    const book = makeBook(['01-04-OC-P04.json']);
    const res = extractBook(book, {});
    expect(res.counts.alts).toBe(2);
    expect(res.counts.segments).toBe(segIds(readSeg(book)).length);
  });

  it('every alt elementId is [\\w-] only, so both segment parsers accept it', () => {
    const book = makeBook(['01-04-OC-P04.json', '15-99-OC-AP33.json', '18a-04-OC-P01.json']);
    extractBook(book, {});
    const altIds = ['ch01', 'ch15', 'ch18']
      .flatMap((ch) => segIds(readSeg(book, ch)))
      .filter((i) => i.includes(':alt:'));
    expect(altIds).toHaveLength(4);
    for (const id of altIds) expect(id.split(':')[2]).toMatch(/^[\w-]+$/);
  });
});
