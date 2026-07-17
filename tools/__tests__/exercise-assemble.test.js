/**
 * exercise-assemble.test.js — item 9 (D3): IS segments + skeleton → translated
 * exercise sidecars, render-shaped. Fail-loud invariants: missing segment,
 * marker corruption, or a real EN residue → that exercise is SKIPPED (no
 * sidecar, EN fallback persists) and reported; never a half-translated file.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { extractBook } from '../exercise-extract.js';
import { assembleBook } from '../exercise-assemble.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'exercises');

/**
 * Book with one extracted fixture (or a synthesized in-memory exercise
 * object, C1 tests) + a synthetic IS file derived from the EN.
 */
function makeBook({ mutateIs, fixture = '01-03-OC-P01.json', exercise = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-asm-'));
  const exDir = path.join(dir, '01-source', 'exercises');
  fs.mkdirSync(exDir, { recursive: true });
  if (exercise) {
    fs.writeFileSync(path.join(exDir, `${exercise.nickname}.json`), JSON.stringify(exercise));
  } else {
    fs.copyFileSync(path.join(FIXTURES, fixture), path.join(exDir, fixture));
  }
  extractBook(dir, {});
  const en = fs.readFileSync(
    path.join(dir, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
    'utf8'
  );
  // Pseudo-translate: prefix every non-marker, non-blank line — clearly
  // different text (defeats the residue exact-match) while preserving markers.
  let is = en
    .split('\n')
    .map((l) => (l.startsWith('<!-- SEG:') || l.trim() === '' ? l : `ÞÝТ ${l}`))
    .join('\n');
  if (mutateIs) is = mutateIs(is);
  const outDir = path.join(dir, '02-mt-output', 'ch01');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'exercises-segments.is.md'), is, 'utf8');
  return dir;
}

describe('assembleBook — happy path', () => {
  it('writes a render-shaped sidecar for mt-preview', () => {
    const book = makeBook();
    const res = assembleBook(book, { track: 'mt-preview' });
    expect(res.skipped).toEqual([]);
    expect(res.written).toEqual([
      path.join(book, '03-translated', 'mt-preview', 'exercises', '01-03-OC-P01.json'),
    ]);
    const side = JSON.parse(fs.readFileSync(res.written[0], 'utf8'));
    expect(side.nickname).toBe('01-03-OC-P01');
    expect(side.track).toBe('mt-preview');
    expect(side.questions.length).toBeGreaterThan(0);
    expect(side.questions[0].stem_html).toContain('ÞÝТ');
    expect(side.generated_by).toBe('exercise-assemble.js');
  });

  it('reports a chapter whose IS segments are missing (faithful before review exists)', () => {
    const book = makeBook();
    const res = assembleBook(book, { track: 'faithful' });
    expect(res.written).toEqual([]);
    expect(res.chaptersMissingIs).toEqual(['ch01']);
  });
});

describe('assembleBook — fail-loud invariants', () => {
  it('missing segment id → exercise skipped, no sidecar', () => {
    const book = makeBook({
      mutateIs: (is) => is.replace(/<!-- SEG:01-03-OC-P01:stimulus:b0 -->\n[^\n]*\n/, ''),
    });
    const res = assembleBook(book, { track: 'mt-preview' });
    expect(res.written).toEqual([]);
    expect(res.skipped.length).toBe(1);
    expect(res.skipped[0].nickname).toBe('01-03-OC-P01');
    expect(
      fs.existsSync(
        path.join(book, '03-translated', 'mt-preview', 'exercises', '01-03-OC-P01.json')
      )
    ).toBe(false);
  });

  it('marker corruption in IS → exercise skipped, no sidecar', () => {
    const book = makeBook({ mutateIs: (is) => is.replaceAll('[[i:', '[[oops:') });
    const res = assembleBook(book, { track: 'mt-preview' });
    expect(res.skipped.length).toBe(1);
    expect(res.written).toEqual([]);
    expect(
      fs.existsSync(
        path.join(book, '03-translated', 'mt-preview', 'exercises', '01-03-OC-P01.json')
      )
    ).toBe(false);
  });

  it('untranslated (identical) segments → real residue → skipped', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-asm-res-'));
    const exDir = path.join(dir, '01-source', 'exercises');
    fs.mkdirSync(exDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURES, '01-03-OC-P01.json'),
      path.join(exDir, '01-03-OC-P01.json')
    );
    extractBook(dir, {});
    const en = fs.readFileSync(
      path.join(dir, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
      'utf8'
    );
    const outDir = path.join(dir, '02-mt-output', 'ch01');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'exercises-segments.is.md'), en, 'utf8'); // EN verbatim
    const res = assembleBook(dir, { track: 'mt-preview' });
    expect(res.written).toEqual([]);
    expect(res.residues.length).toBeGreaterThan(0);
  });
});

describe('assembleBook — missing EN segments file (I4, final review)', () => {
  it('chapter with a skeleton but no EN segments file → every exercise skipped, no sidecars written, gate not silently bypassed', () => {
    // Before the fix: a missing EN file degraded enMap to an empty Map, so
    // every enText lookup was undefined and the residue check (and the new
    // C1c empty-run check) never ran for the whole chapter — the residue
    // gate was silently disabled rather than failing loud.
    const book = makeBook();
    fs.rmSync(path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md'));
    const res = assembleBook(book, { track: 'mt-preview' });
    expect(res.written).toEqual([]);
    expect(res.skipped.length).toBe(1);
    expect(res.skipped[0].nickname).toBe('01-03-OC-P01');
    expect(res.skipped[0].reason).toMatch(/missing EN segments file/i);
    expect(
      fs.existsSync(
        path.join(book, '03-translated', 'mt-preview', 'exercises', '01-03-OC-P01.json')
      )
    ).toBe(false);
  });
});

describe('assembleBook — marker conservation (C1, final review)', () => {
  // The skeleton is an oracle: fieldToHtml must throw (not silently drop or
  // duplicate content) when a run's markers don't exactly match what
  // htmlToField recorded. These four tests drive that guarantee through the
  // REAL assemble path (extract → pseudo-translate/mutate → assemble), not a
  // unit test on fieldToHtml directly, so they also pin the per-exercise
  // skip contract (no sidecar, no partial write, reason surfaced).

  // NOTE (item-9 #294 follow-up): these two conservation cases originally
  // mutated 01-04-OC-P04's image-ONLY run — but a pure-opaque EN run is now
  // translation-invariant (assembled from EN verbatim; see the dedicated
  // pure-opaque describe below), so the mutation must target a MIXED
  // text+image run, where MT output IS consumed and conservation is live.
  function makeMixedRunBook({ mutateIs }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-mixed-'));
    const exDir = path.join(dir, '01-source', 'exercises');
    fs.mkdirSync(exDir, { recursive: true });
    fs.writeFileSync(
      path.join(exDir, '05-01-OC-T01.json'),
      JSON.stringify({
        uid: '2@1',
        nickname: '05-01-OC-T01',
        solutions_are_public: false,
        stimulus_html: '',
        questions: [
          {
            id: '333',
            stem_html:
              'Predict the product when <img src="https://x.test/m.jpg" alt="molecule"> reacts with water.',
          },
        ],
      })
    );
    extractBook(dir, {});
    const enPath = path.join(dir, '02-for-mt', 'ch05', 'exercises-segments.en.md');
    let is = fs
      .readFileSync(enPath, 'utf8')
      .split('\n')
      .map((l) => (l.startsWith('<!-- SEG:') || l.trim() === '' ? l : `ÞÝТ ${l}`))
      .join('\n');
    is = mutateIs(is);
    const outDir = path.join(dir, '02-mt-output', 'ch05');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'exercises-segments.is.md'), is, 'utf8');
    return dir;
  }

  it('MT-deleted MEDIA marker in a MIXED run → exercise skipped, no sidecar', () => {
    const book = makeMixedRunBook({
      mutateIs: (is) => is.replace('[[MEDIA:0]]', ''),
    });
    const res = assembleBook(book, { track: 'mt-preview' });
    expect(res.written).toEqual([]);
    expect(res.skipped.length).toBe(1);
    expect(res.skipped[0].nickname).toBe('05-01-OC-T01');
    expect(
      fs.existsSync(
        path.join(book, '03-translated', 'mt-preview', 'exercises', '05-01-OC-T01.json')
      )
    ).toBe(false);
  });

  it('duplicated MEDIA marker in a MIXED run → exercise skipped, no sidecar', () => {
    const book = makeMixedRunBook({
      mutateIs: (is) => is.replace('[[MEDIA:0]]', '[[MEDIA:0]] [[MEDIA:0]]'),
    });
    const res = assembleBook(book, { track: 'mt-preview' });
    expect(res.written).toEqual([]);
    expect(res.skipped.length).toBe(1);
    expect(res.skipped[0].nickname).toBe('05-01-OC-T01');
    expect(
      fs.existsSync(
        path.join(book, '03-translated', 'mt-preview', 'exercises', '05-01-OC-T01.json')
      )
    ).toBe(false);
  });

  it('non-empty [[lb:]] marker body (MT moved text inside an escape marker) → exercise skipped', () => {
    // Synthesized exercise (like exercise-extract.test.js's badExercise
    // pattern): stimulus text with a literal '[' produces an empty-body
    // [[lb:]] escape marker (verified against htmlToField directly). A
    // non-empty body means MT moved text inside the marker — that text must
    // not silently disappear on inversion.
    const source = {
      uid: '99999@1',
      nickname: '01-05-OC-LB1',
      solutions_are_public: false,
      stimulus_html: 'value [x] here',
      questions: [],
    };
    const book = makeBook({
      exercise: source,
      mutateIs: (is) => is.replace('[[lb:]]', '[[lb:ORÐ]]'),
    });
    const res = assembleBook(book, { track: 'mt-preview' });
    expect(res.written).toEqual([]);
    expect(res.skipped.length).toBe(1);
    expect(res.skipped[0].nickname).toBe('01-05-OC-LB1');
    expect(
      fs.existsSync(
        path.join(book, '03-translated', 'mt-preview', 'exercises', '01-05-OC-LB1.json')
      )
    ).toBe(false);
  });

  it('empty IS run with a non-empty EN counterpart → exercise skipped', () => {
    // Blanks the stimulus run's text (keeps the marker line) so the parsed
    // IS segment is '' while the EN counterpart is non-blank — must not
    // silently assemble as an empty tag.
    const book = makeBook({
      mutateIs: (is) => is.replace(/(<!-- SEG:01-03-OC-P01:stimulus:b0 -->\n)ÞÝТ[^\n]*\n/, '$1\n'),
    });
    const res = assembleBook(book, { track: 'mt-preview' });
    expect(res.written).toEqual([]);
    expect(res.skipped.length).toBe(1);
    expect(res.skipped[0].nickname).toBe('01-03-OC-P01');
    expect(
      fs.existsSync(
        path.join(book, '03-translated', 'mt-preview', 'exercises', '01-03-OC-P01.json')
      )
    ).toBe(false);
  });
});

describe('pure-opaque EN runs are translation-invariant (item-9 MT-run follow-up)', () => {
  // Observed live in the #294 MT run: image-only stems (EN run = exactly
  // [[MEDIA:0]]) confused the API — adjacent identical segments came back
  // RENUMBERED ([[MEDIA:1]], [[MEDIA:2]]) or dropped entirely. Nothing in a
  // pure-opaque run is translatable, so the EN run IS the correct output:
  // the assembler must use it verbatim and never depend on MT for it.
  function makeOpaqueBook({ mutateIs }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-opaque-'));
    const exDir = path.join(dir, '01-source', 'exercises');
    fs.mkdirSync(exDir, { recursive: true });
    fs.writeFileSync(
      path.join(exDir, '08-99-OC-T01.json'),
      JSON.stringify({
        uid: '1@1',
        nickname: '08-99-OC-T01',
        solutions_are_public: false,
        stimulus_html: '',
        questions: [
          { id: '111', stem_html: '<img src="https://x.test/a.jpg" alt="model A">' },
          { id: '222', stem_html: '<img src="https://x.test/b.jpg" alt="model B">' },
        ],
      })
    );
    extractBook(dir, {});
    const enPath = path.join(dir, '02-for-mt', 'ch08', 'exercises-segments.en.md');
    let is = fs.readFileSync(enPath, 'utf8'); // identity "translation"
    is = mutateIs(is);
    const outDir = path.join(dir, '02-mt-output', 'ch08');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'exercises-segments.is.md'), is, 'utf8');
    return dir;
  }

  it('API-renumbered [[MEDIA:1]] against EN [[MEDIA:0]] assembles from EN (no skip)', () => {
    const book = makeOpaqueBook({
      mutateIs: (is) =>
        is.replace(
          '<!-- SEG:08-99-OC-T01:stem:222-b0 -->\n[[MEDIA:0]]',
          '<!-- SEG:08-99-OC-T01:stem:222-b0 -->\n[[MEDIA:1]]'
        ),
    });
    const res = assembleBook(book, { track: 'mt-preview' });
    expect(res.skipped).toEqual([]);
    const side = JSON.parse(fs.readFileSync(res.written[0], 'utf8'));
    expect(side.questions[1].stem_html).toBe('<img src="https://x.test/b.jpg" alt="model B">');
  });

  it('API-dropped pure-opaque segment assembles from EN (no missing-IS skip)', () => {
    const book = makeOpaqueBook({
      mutateIs: (is) =>
        is.replace(/<!-- SEG:08-99-OC-T01:stem:222-b0 -->\n\[\[MEDIA:0\]\]\n\n/, ''),
    });
    const res = assembleBook(book, { track: 'mt-preview' });
    expect(res.skipped).toEqual([]);
    const side = JSON.parse(fs.readFileSync(res.written[0], 'utf8'));
    expect(side.questions[1].stem_html).toBe('<img src="https://x.test/b.jpg" alt="model B">');
  });

  it('rule does NOT fire for text-bearing runs (missing IS still skips loudly)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-opaque-neg-'));
    const exDir = path.join(dir, '01-source', 'exercises');
    fs.mkdirSync(exDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURES, '01-03-OC-P01.json'),
      path.join(exDir, '01-03-OC-P01.json')
    );
    extractBook(dir, {});
    const en = fs.readFileSync(
      path.join(dir, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
      'utf8'
    );
    const is = en
      .split('\n')
      .map((l) => (l.startsWith('<!-- SEG:') || l.trim() === '' ? l : `ÞÝТ ${l}`))
      .join('\n')
      .replace(/<!-- SEG:01-03-OC-P01:stimulus:b0 -->\n[^\n]*\n/, '');
    const outDir = path.join(dir, '02-mt-output', 'ch01');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'exercises-segments.is.md'), is, 'utf8');
    const res = assembleBook(dir, { track: 'mt-preview' });
    expect(res.skipped.length).toBe(1);
  });
});
