// server/__tests__/segmentParserFable.test.js
//
// Fable layer serving, loader half (spec docs/superpowers/specs/2026-11-24-fable-layer-serving-design.md §6.4).
// A Fable-served book with no faithful file is served from 02-mt-fable/, and the unit REFUSES
// (never falls back to MT) when the layer is incomplete.
//
// ⚠️ The SEG marker takes NO SPACE after the colon; the spaced form parses to an empty list.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const segmentParser = require('../services/segmentParser');
const mtFindings = require('../lib/mtFindings');
const { servedLayerFor } = require('../lib/servedLayer');

// The book that the setting serves from Fable, and one it does not. Taken from the setting's own
// map, never restated: the control book is whichever slug the setting does not name.
const FABLE_BOOK = 'efnafraedi-2e';
const OTHER_BOOK = 'testbook';
const MODULE = 'm00037';
const CODE = 'FABLE_LAYER_MISSING';
let booksDir;

const mark = (id) => `<!-- SEG:${MODULE}:para:${id} -->`;
const file = (pairs) => pairs.map(([id, text]) => `${mark(id)}\n${text}\n`).join('\n');

const EN = file([
  ['para-00003', 'The different arrangements of atoms.'],
  ['para-00004', 'Conformers are represented in two ways.'],
  ['para-00005', 'A third paragraph.'],
]);
const MT = file([
  ['para-00003', 'MT eitt.'],
  ['para-00004', 'MT tvö.'],
  ['para-00005', 'MT þrjú.'],
]);
const FABLE = file([
  ['para-00003', 'Fable eitt.'],
  ['para-00004', 'Fable tvö.'],
  ['para-00005', 'Fable þrjú.'],
]);
const tagLine = (id, tags, extra = {}) =>
  JSON.stringify({
    key: `${MODULE}:para:${id}`,
    segmentId: `${MODULE}:para:${id}`,
    occurrence: 0,
    tags,
    before: `before ${id}`,
    ...extra,
  });

function write(book, rel, content) {
  const p = path.join(booksDir, book, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
function seedFable(book, { fable = FABLE, tags = '', mt = MT } = {}) {
  write(book, `02-for-mt/ch03/${MODULE}-segments.en.md`, EN);
  if (mt !== null) write(book, `02-mt-output/ch03/${MODULE}-segments.is.md`, mt);
  if (fable !== null) write(book, `02-mt-fable/ch03/${MODULE}-segments.is.md`, fable);
  if (tags !== null) write(book, `02-mt-fable/ch03/${MODULE}-tags.jsonl`, tags);
}

beforeEach(() => {
  booksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-fable-'));
  segmentParser._setTestBooksDir(booksDir);
  mtFindings._setTestBooksDir(booksDir);
});
afterEach(() => {
  segmentParser._setTestBooksDir(null);
  mtFindings._setTestBooksDir(null);
  fs.rmSync(booksDir, { recursive: true, force: true });
});

const seg = (data, id) => data.segments.find((s) => s.segmentId === `${MODULE}:para:${id}`);
const refusal = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};

describe('the setting names the books this file relies on', () => {
  it('serves the Fable book from fable and the control book from mt-output', () => {
    expect(servedLayerFor(FABLE_BOOK)).toBe('fable');
    expect(servedLayerFor(OTHER_BOOK)).toBe('mt-output');
  });
});

describe('loadModuleForEditing — a Fable-served book', () => {
  it('serves the Fable file with isSource fable', () => {
    seedFable(FABLE_BOOK);
    const data = segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE);
    expect(data.isSource).toBe('fable');
    expect(seg(data, 'para-00003').is).toBe('Fable eitt.');
    expect(seg(data, 'para-00004').hasTranslation).toBe(true);
  });

  it('attaches fableMeaning.before only to a segment tagged meaning', () => {
    seedFable(FABLE_BOOK, {
      tags: [
        tagLine('para-00003', ['terminology', 'meaning']),
        tagLine('para-00004', ['fluency']),
      ].join('\n'),
    });
    const data = segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE);
    expect(seg(data, 'para-00003').fableMeaning).toEqual({ before: 'before para-00003' });
  });

  it('gives a fluency-only segment and an untagged segment fableMeaning null', () => {
    seedFable(FABLE_BOOK, { tags: tagLine('para-00004', ['fluency']) });
    const data = segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE);
    expect(seg(data, 'para-00004').fableMeaning).toBeNull();
    expect(seg(data, 'para-00005').fableMeaning).toBeNull();
  });

  it('reaches the client with no other field of the tags line', () => {
    seedFable(FABLE_BOOK, {
      tags: tagLine('para-00003', ['meaning'], { beforeSha256: 'x', run: 'r', requestKey: 'k' }),
    });
    const data = segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE);
    expect(Object.keys(seg(data, 'para-00003').fableMeaning)).toEqual(['before']);
  });

  it('serves an EMPTY tags file as no changes', () => {
    seedFable(FABLE_BOOK, { tags: '' });
    const data = segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE);
    expect(data.segments.every((s) => s.fableMeaning === null)).toBe(true);
  });

  it('refuses a missing Fable file and never falls back to MT', () => {
    seedFable(FABLE_BOOK, { fable: null });
    const err = refusal(() => segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE));
    expect(err).not.toBeNull();
    expect(err.code).toBe(CODE);
  });

  it('puts the editor-facing refusal in message and the internal reason in detail', () => {
    seedFable(FABLE_BOOK, { fable: null });
    const err = refusal(() => segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE));
    expect(err.message).toBe(
      'Texti gervigreindar fyrir þessa einingu fannst ekki og ekki er hægt að opna hana. Látið umsjónarmann vita.'
    );
    expect(err.detail).toContain('segments.is.md');
  });

  it('refuses when the tags file is missing (Review Focus 1)', () => {
    seedFable(FABLE_BOOK, { tags: null });
    const err = refusal(() => segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE));
    expect(err && err.code).toBe(CODE);
  });

  it('refuses a meaning tags line with no before string (Review Focus 1)', () => {
    for (const before of [undefined, 42, null]) {
      seedFable(FABLE_BOOK, { tags: tagLine('para-00003', ['meaning'], { before }) });
      const err = refusal(() => segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE));
      expect(err && err.code, String(before)).toBe(CODE);
    }
  });

  it('control: a fluency tags line with no before string still serves', () => {
    seedFable(FABLE_BOOK, { tags: tagLine('para-00003', ['fluency'], { before: undefined }) });
    const data = segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE);
    expect(seg(data, 'para-00003').fableMeaning).toBeNull();
  });

  it('refuses a tags line whose occurrence is not an integer (whole-branch review B M4)', () => {
    for (const tags of [['meaning'], ['fluency']]) {
      for (const occurrence of [undefined, null, '0', 1.5]) {
        seedFable(FABLE_BOOK, { tags: tagLine('para-00003', tags, { occurrence }) });
        const err = refusal(() => segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE));
        expect(err && err.code, `${tags} ${JSON.stringify(occurrence)}`).toBe(CODE);
      }
    }
  });

  it('control: a tags line on a later occurrence (an integer) still serves, unflagged', () => {
    seedFable(FABLE_BOOK, { tags: tagLine('para-00003', ['meaning'], { occurrence: 1 }) });
    const data = segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE);
    expect(seg(data, 'para-00003').fableMeaning).toBeNull();
  });

  it('refuses when a tags line is not JSON (Review Focus 1)', () => {
    seedFable(FABLE_BOOK, { tags: `${tagLine('para-00003', ['meaning'])}\nnot json\n` });
    const err = refusal(() => segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE));
    expect(err && err.code).toBe(CODE);
  });

  it('refuses a segment present in English and MT but absent from the Fable file', () => {
    seedFable(FABLE_BOOK, {
      fable: file([
        ['para-00003', 'Fable eitt.'],
        ['para-00004', 'Fable tvö.'],
      ]),
    });
    const err = refusal(() => segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE));
    expect(err && err.code).toBe(CODE);
    expect(err.detail).toContain('para-00005');
  });

  it('does not refuse an English segment that has no MT and no Fable text', () => {
    seedFable(FABLE_BOOK, {
      mt: file([
        ['para-00003', 'MT eitt.'],
        ['para-00004', 'MT tvö.'],
      ]),
      fable: file([
        ['para-00003', 'Fable eitt.'],
        ['para-00004', 'Fable tvö.'],
      ]),
    });
    const data = segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE);
    expect(seg(data, 'para-00005').is).toBe('');
  });

  it('gives every segment of a Fable-served unit mtFinding null and reads no MT report', () => {
    seedFable(FABLE_BOOK);
    write(
      FABLE_BOOK,
      'residue-report.mt-preview.json',
      JSON.stringify({
        track: 'mt-preview',
        generatedAt: '2026-09-05T09:15:36.850Z',
        modules: {
          [MODULE]: { exact: [`${MODULE}:para:para-00003`], warnings: [], tolerated: [] },
        },
      })
    );
    const data = segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE);
    expect(data.segments.map((s) => s.mtFinding)).toEqual([null, null, null]);
    expect(data.mtFindingsGeneratedAt).toBeNull();
  });
});

describe('loadModuleForEditing — a repeated segment id (Review Focus 2)', () => {
  const REPEATED_EN = file([
    ['para-00003', 'First copy.'],
    ['para-00003', 'Second copy.'],
  ]);
  const REPEATED = file([
    ['para-00003', 'Fable fyrsta.'],
    ['para-00003', 'Fable annað.'],
  ]);
  const seedRepeated = (tags) => {
    seedFable(FABLE_BOOK, { fable: REPEATED, tags, mt: REPEATED });
    write(FABLE_BOOK, `02-for-mt/ch03/${MODULE}-segments.en.md`, REPEATED_EN);
  };

  it('does not flag the served copy from a later repeat’s meaning tags line', () => {
    seedRepeated(
      [
        tagLine('para-00003', ['fluency'], { occurrence: 0 }),
        tagLine('para-00003', ['meaning'], { occurrence: 1 }),
      ].join('\n')
    );
    const data = segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE);
    expect(seg(data, 'para-00003').fableMeaning).toBeNull();
  });

  it('flags the served copy from the occurrence-0 tags line', () => {
    seedRepeated(
      [
        tagLine('para-00003', ['meaning'], { occurrence: 0 }),
        tagLine('para-00003', ['fluency'], { occurrence: 1 }),
      ].join('\n')
    );
    const data = segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE);
    expect(seg(data, 'para-00003').fableMeaning).toEqual({ before: 'before para-00003' });
  });

  it('puts the flag on the first copy only, never on the later copy', () => {
    seedRepeated(tagLine('para-00003', ['meaning'], { occurrence: 0 }));
    const data = segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE);
    const copies = data.segments.filter((s) => s.segmentId === `${MODULE}:para:para-00003`);
    expect(copies.map((s) => s.fableMeaning)).toEqual([{ before: 'before para-00003' }, null]);
  });

  it('real tree: ch08/m68747 repeats ids in the Fable file, and no id is flagged more than once', () => {
    // Read-only: the real tree, found from this file's location, never written.
    const books = path.resolve(import.meta.dirname, '../../books');
    segmentParser._setTestBooksDir(books);
    const fableFile = fs.readFileSync(
      path.join(books, FABLE_BOOK, '02-mt-fable/ch08/m68747-segments.is.md'),
      'utf-8'
    );
    const ids = segmentParser.parseSegments(fableFile).map((s) => s.segmentId);
    const repeated = new Set(ids.filter((id, i) => ids.indexOf(id) !== i));
    // Control: the layer really repeats ids (the English drives the loader, which serves each once).
    expect(repeated.size).toBeGreaterThan(0);
    const data = segmentParser.loadModuleForEditing(FABLE_BOOK, 8, 'm68747');
    const flagged = data.segments.filter((s) => s.fableMeaning);
    for (const id of new Set(flagged.map((s) => s.segmentId))) {
      expect(flagged.filter((s) => s.segmentId === id)).toHaveLength(1);
    }
    for (const id of repeated) {
      expect(data.segments.filter((s) => s.segmentId === id && s.fableMeaning).length).toBeLessThan(
        2
      );
    }
  });
});

describe('loadModuleForEditing — faithful wins (Review Focus 3)', () => {
  it('serves faithful, reads no Fable file, and flags nothing', () => {
    // No Fable file at all: reading it would refuse, so success proves it was not read.
    seedFable(FABLE_BOOK, { fable: null, tags: null });
    write(
      FABLE_BOOK,
      `03-faithful-translation/ch03/${MODULE}-segments.is.md`,
      file([
        ['para-00003', 'Samþykkt eitt.'],
        ['para-00004', 'Samþykkt tvö.'],
        ['para-00005', 'Samþykkt þrjú.'],
      ])
    );
    const data = segmentParser.loadModuleForEditing(FABLE_BOOK, 3, MODULE);
    expect(data.isSource).toBe('faithful');
    expect(data.segments.every((s) => s.fableMeaning === null)).toBe(true);
  });
});

describe('loadModuleForEditing — a book served from mt-output', () => {
  it('keeps today’s behaviour and reads no 02-mt-fable path', () => {
    // A Fable file that would flag segment 3 sits in the control book's tree: it must be ignored.
    seedFable(OTHER_BOOK, { tags: tagLine('para-00003', ['meaning']) });
    const data = segmentParser.loadModuleForEditing(OTHER_BOOK, 3, MODULE);
    expect(data.isSource).toBe('mt-output');
    expect(seg(data, 'para-00003').is).toBe('MT eitt.');
    expect(data.segments.every((s) => s.fableMeaning === null)).toBe(true);
  });

  it('still reads the MT findings report for an mt-output unit', () => {
    seedFable(OTHER_BOOK);
    write(
      OTHER_BOOK,
      'residue-report.mt-preview.json',
      JSON.stringify({
        track: 'mt-preview',
        generatedAt: '2026-09-05T09:15:36.850Z',
        modules: {
          [MODULE]: { exact: [`${MODULE}:para:para-00003`], warnings: [], tolerated: [] },
        },
      })
    );
    const data = segmentParser.loadModuleForEditing(OTHER_BOOK, 3, MODULE);
    expect(seg(data, 'para-00003').mtFinding).toEqual({ kind: 'exact' });
  });
});

describe('getModulePaths', () => {
  it('names the Fable file and its tags file', () => {
    const p = segmentParser.getModulePaths(FABLE_BOOK, 3, MODULE);
    expect(p.fable).toBe(
      path.join(booksDir, FABLE_BOOK, '02-mt-fable', 'ch03', `${MODULE}-segments.is.md`)
    );
    expect(p.fableTags).toBe(
      path.join(booksDir, FABLE_BOOK, '02-mt-fable', 'ch03', `${MODULE}-tags.jsonl`)
    );
  });
});
