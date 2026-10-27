/**
 * The layer reader/writer for the AI-reviewed MT layer (spec
 * docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, Unit A).
 *
 * 🔴 THE PROPERTY THAT MATTERS: LAYER 1 (`02-mt-output`) IS NEVER CHANGED, AND A ZERO-CHANGE
 * READ → WRITE IS BYTE-IDENTICAL. Layer 1 holds hand repairs that exist nowhere else, and 6 of
 * its files have irregular whitespace that any re-serialisation from trimmed records destroys.
 * So the positive control runs on EVERY committed chemistry unit (real files, not fixtures), with
 * a negative control proving the instrument can see whitespace at all.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import segMarkers from '../lib/seg-markers.cjs';
import {
  LAYER_DIRS,
  parseLayerFile,
  serializeLayerFile,
  validateBody,
  applyBodyEdits,
  listChapterUnits,
  readBase,
  resolveSafeDestination,
  buildChangeRecord,
  writeRevisedChapter,
  verifyRevision,
} from '../lib/mt-layers.js';

const { parseSegmentRecords } = segMarkers;

const CHEM = fileURLToPath(new URL('../../books/efnafraedi-2e', import.meta.url));
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const HEX64 = (c) => c.repeat(64);

/** Run fn and return the refusal code it throws (or 'no-throw'). */
function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    return err.code || `untyped: ${err.message}`;
  }
  return 'no-throw';
}

/** Run fn and return [code, message] of the refusal it throws (or ['no-throw', '']). */
function refusalOf(fn) {
  try {
    fn();
  } catch (err) {
    return [err.code || 'untyped', err.message];
  }
  return ['no-throw', ''];
}

/** A copy of obj without one key. */
const without = (obj, key) => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));

const chapterDirsOf = (bookDir) =>
  fs
    .readdirSync(path.join(bookDir, '02-structure'))
    .filter((d) => /^(ch\d\d|appendices)$/.test(d))
    .sort();

// ───────────────────────────────────────────────────────────────────────────────────────────
// Positive control on real data
// ───────────────────────────────────────────────────────────────────────────────────────────

describe('zero-change round trip on every committed chemistry layer-1 unit', () => {
  const units = chapterDirsOf(CHEM).flatMap((chapterDir) =>
    listChapterUnits({ bookDir: CHEM, chapterDir }).map((stem) => ({ chapterDir, stem }))
  );
  const fileOf = ({ chapterDir, stem }) =>
    path.join(CHEM, LAYER_DIRS.pure, chapterDir, `${stem}-segments.is.md`);

  it('the lister finds all 170 units (149 modules + 21 chapter-metadata) — a path error must fail, not pass', () => {
    expect(units.length).toBe(170);
  });

  it('the lister agrees exactly with an independent scan of 02-mt-output (legacy splits and junk excluded)', () => {
    const scanned = chapterDirsOf(CHEM).flatMap((chapterDir) =>
      fs
        .readdirSync(path.join(CHEM, LAYER_DIRS.pure, chapterDir))
        .map((f) => /^(m\d+|chapter-metadata)-segments\.is\.md$/.exec(f))
        .filter(Boolean)
        .map((m) => `${chapterDir}/${m[1]}`)
    );
    expect(units.map((u) => `${u.chapterDir}/${u.stem}`).sort()).toEqual(scanned.sort());
  });

  it('every unit re-serialises to its exact file bytes (Buffer comparison)', () => {
    const bad = units.filter((u) => {
      const buf = fs.readFileSync(fileOf(u));
      return !Buffer.from(serializeLayerFile(parseLayerFile(buf.toString('utf8'))), 'utf8').equals(
        buf
      );
    });
    expect(bad).toEqual([]);
  });

  it('readBase returns the exact bytes, the raw sha256, and no overlay for every unit', () => {
    const bad = units.filter((u) => {
      const buf = fs.readFileSync(fileOf(u));
      const base = readBase({ bookDir: CHEM, ...u });
      return (
        !Buffer.from(base.parsed.text, 'utf8').equals(buf) ||
        base.layer1Sha256 !== sha256(buf) ||
        base.overlaySha256 !== null
      );
    });
    expect(bad).toEqual([]);
  });

  it('every body equals what parseSegmentRecords returns, record for record', () => {
    const bad = units.filter((u) => {
      const text = fs.readFileSync(fileOf(u), 'utf8');
      const ours = parseLayerFile(text).records.map((r) => [r.segmentId, r.body]);
      const theirs = parseSegmentRecords(text).map((r) => [r.segmentId, r.content]);
      return JSON.stringify(ours) !== JSON.stringify(theirs);
    });
    expect(bad).toEqual([]);
  });

  it('an empty edit list through applyBodyEdits returns the same bytes for every unit', () => {
    const bad = units.filter((u) => {
      const parsed = readBase({ bookDir: CHEM, ...u }).parsed;
      return applyBodyEdits(parsed, []).text !== fs.readFileSync(fileOf(u), 'utf8');
    });
    expect(bad).toEqual([]);
  });

  it('negative control: a naive re-serialisation from trimmed records differs on exactly the 6 irregular files', () => {
    const naive = (text) =>
      parseSegmentRecords(text)
        .map((r) => `<!-- SEG:${r.segmentId} -->\n${r.content}`)
        .join('\n\n');
    const differing = units
      .filter((u) => {
        const text = fs.readFileSync(fileOf(u), 'utf8');
        return naive(text) !== text;
      })
      .map((u) => `${u.chapterDir}/${u.stem}`);
    expect(differing.sort()).toEqual([
      'ch02/m68693',
      'ch08/m68747',
      'ch10/m68773',
      'ch12/m68794',
      'ch16/m68819',
      'ch21/m68857',
    ]);
  });

  it('chapter-metadata is listed for ch01–ch21 and not for ch00 or appendices', () => {
    const withMeta = units
      .filter((u) => u.stem === 'chapter-metadata')
      .map((u) => u.chapterDir)
      .sort();
    expect(withMeta).toEqual(
      Array.from({ length: 21 }, (_, i) => `ch${String(i + 1).padStart(2, '0')}`)
    );
  });

  it('legacy split files exist on disk (control) and are never listed', () => {
    expect(
      fs.existsSync(path.join(CHEM, LAYER_DIRS.pure, 'ch05', 'm68727-segments(b).is.md'))
    ).toBe(true);
    expect(units.filter((u) => !/^(m\d+|chapter-metadata)$/.test(u.stem))).toEqual([]);
  });
});

describe('m68727 (ch05): duplicated ids get occurrences 0 and 1', () => {
  const { parsed } = readBase({ bookDir: CHEM, chapterDir: 'ch05', stem: 'm68727' });
  const counts = new Map();
  for (const r of parsed.records) counts.set(r.segmentId, (counts.get(r.segmentId) || 0) + 1);
  const dupIds = [...counts].filter(([, n]) => n > 1).map(([id]) => id);

  it('has 366 markers', () => {
    expect(parsed.records.length).toBe(366);
  });
  it('has 358 distinct segment ids', () => {
    expect(counts.size).toBe(358);
  });
  it('has 366 distinct keys', () => {
    expect(new Set(parsed.records.map((r) => r.key)).size).toBe(366);
  });
  it('has 8 duplicated ids, all of type para', () => {
    expect(dupIds.map((id) => id.split(':')[1])).toEqual(Array(8).fill('para'));
  });
  it('each duplicated id carries occurrences [0, 1] and keys [id, id#1]', () => {
    const seen = dupIds.map((id) =>
      parsed.records.filter((r) => r.segmentId === id).map((r) => [r.occurrence, r.key])
    );
    expect(seen).toEqual(
      dupIds.map((id) => [
        [0, id],
        [1, `${id}#1`],
      ])
    );
  });
  it('a non-duplicated record has occurrence 0 and its bare id as key', () => {
    const r = parsed.records.find((x) => counts.get(x.segmentId) === 1);
    expect([r.occurrence, r.key]).toEqual([0, r.segmentId]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────
// parseLayerFile / serializeLayerFile / validateBody
// ───────────────────────────────────────────────────────────────────────────────────────────

const M = (id) => `<!-- SEG:m1:para:${id} -->`;

describe('parseLayerFile', () => {
  const text = `${M('a')}\n  Alpha.  \n\n\n${M('b')}\nBravo. \n${M('a')}\n Again.`;
  const parsed = parseLayerFile(text);

  it('records the exact whitespace around each body', () => {
    expect(parsed.records.map((r) => [r.lead, r.body, r.trail])).toEqual([
      ['\n  ', 'Alpha.', '  \n\n\n'],
      ['\n', 'Bravo.', ' \n'],
      ['\n ', 'Again.', ''],
    ]);
  });
  it('splits the id into module, type and element', () => {
    expect(parsed.records[0]).toMatchObject({
      segmentId: 'm1:para:a',
      moduleId: 'm1',
      segmentType: 'para',
      elementId: 'a',
      markerText: M('a'),
    });
  });
  it('numbers occurrences of the same full id', () => {
    expect(parsed.records.map((r) => r.key)).toEqual(['m1:para:a', 'm1:para:b', 'm1:para:a#1']);
  });
  it('serialises back to the exact input', () => {
    expect(serializeLayerFile(parsed)).toBe(text);
  });
  it('carries its input text', () => {
    expect(parsed.text).toBe(text);
  });
  it('keeps a prefix before the first marker', () => {
    const p = parseLayerFile(`\n\n${M('a')}\nx`);
    expect([p.prefix, serializeLayerFile(p)]).toEqual(['\n\n', `\n\n${M('a')}\nx`]);
  });
  it('records are frozen', () => {
    expect(Object.isFrozen(parsed.records[0])).toBe(true);
  });
  it('refuses the legacy {{SEG:…}} form', () => {
    expect(codeOf(() => parseLayerFile(`{{SEG:m1:para:a}}\nx\n${M('b')}\ny`))).toBe(
      'mustache-marker'
    );
  });
  it('refuses a marker glued onto the previous line', () => {
    expect(codeOf(() => parseLayerFile(`${M('a')}\nTitle${M('b')}\nBody`))).toBe(
      'marker-not-at-line-start'
    );
  });
  it('control: the same text with the marker on its own line parses', () => {
    expect(parseLayerFile(`${M('a')}\nTitle\n${M('b')}\nBody`).records.length).toBe(2);
  });
  it('refuses a segment id that is not module:type:element', () => {
    expect(codeOf(() => parseLayerFile('<!-- SEG:m1:para -->\nx'))).toBe('bad-segment-id');
  });
});

describe('validateBody', () => {
  it('a normal body has no problems', () => {
    expect(validateBody('Vermi er [[i:H]] ástandsfall.')).toEqual([]);
  });
  it('empty', () => {
    expect(validateBody('')).toContain('empty');
  });
  it('not trimmed', () => {
    expect(validateBody(' x')).toContain('untrimmed');
  });
  it('contains a newline', () => {
    expect(validateBody('a\nb')).toContain('line-break');
  });
  it('contains a carriage return', () => {
    expect(validateBody('a\rb')).toContain('line-break');
  });
  it('contains a SEG marker', () => {
    expect(validateBody(`a ${M('z')} b`)).toContain('seg-marker');
  });
  it('contains the legacy {{SEG: form', () => {
    expect(validateBody('a {{SEG:m1:para:z}} b')).toContain('seg-marker');
  });
  it('contains a comment opener (a SEG marker shape the parser cannot see)', () => {
    expect(validateBody('a <!-- SEG: m1:para:z --> b')).toContain('seg-marker');
  });
  it('not a string', () => {
    expect(validateBody(undefined)).toContain('not-a-string');
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────
// applyBodyEdits
// ───────────────────────────────────────────────────────────────────────────────────────────

describe('applyBodyEdits', () => {
  const text = `${M('a')}\nAlpha.\n\n${M('b')}\n  Bravo.  \n\n\n${M('a')}\nAlpha.`;
  const parsed = parseLayerFile(text);
  const edit = (o) => ({
    segmentId: 'm1:para:a',
    occurrence: 1,
    before: 'Alpha.',
    after: 'Alfa.',
    ...o,
  });

  it('changes only the named occurrence; every other byte is unchanged', () => {
    expect(applyBodyEdits(parsed, [edit()]).text).toBe(
      `${M('a')}\nAlpha.\n\n${M('b')}\n  Bravo.  \n\n\n${M('a')}\nAlfa.`
    );
  });
  it('keeps the irregular whitespace around an edited body', () => {
    const out = applyBodyEdits(parsed, [
      { segmentId: 'm1:para:b', occurrence: 0, before: 'Bravo.', after: 'Bravó.' },
    ]);
    expect(out.text).toBe(`${M('a')}\nAlpha.\n\n${M('b')}\n  Bravó.  \n\n\n${M('a')}\nAlpha.`);
  });
  it('does not mutate its input', () => {
    applyBodyEdits(parsed, [edit()]);
    expect(serializeLayerFile(parsed)).toBe(text);
  });
  it('a change replayed onto a changed base refuses', () => {
    const once = applyBodyEdits(parsed, [edit()]);
    expect(codeOf(() => applyBodyEdits(once, [edit()]))).toBe('base-changed');
  });
  it('control: the same change on the original base applies', () => {
    expect(codeOf(() => applyBodyEdits(parsed, [edit()]))).toBe('no-throw');
  });
  it('an empty `after` refuses', () => {
    expect(codeOf(() => applyBodyEdits(parsed, [edit({ after: '' })]))).toBe('invalid-body');
  });
  it('an untrimmed `after` refuses', () => {
    expect(codeOf(() => applyBodyEdits(parsed, [edit({ after: 'Alfa. ' })]))).toBe('invalid-body');
  });
  it('a multi-line `after` refuses', () => {
    expect(codeOf(() => applyBodyEdits(parsed, [edit({ after: 'Al\nfa.' })]))).toBe('invalid-body');
  });
  it('an `after` carrying a SEG marker refuses', () => {
    expect(codeOf(() => applyBodyEdits(parsed, [edit({ after: `Alfa. ${M('x')}` })]))).toBe(
      'invalid-body'
    );
  });
  it('an unknown occurrence refuses', () => {
    expect(codeOf(() => applyBodyEdits(parsed, [edit({ occurrence: 2 })]))).toBe('unknown-target');
  });
  it('an unknown segment id refuses', () => {
    expect(codeOf(() => applyBodyEdits(parsed, [edit({ segmentId: 'm1:para:zz' })]))).toBe(
      'unknown-target'
    );
  });
  it('two edits of the same occurrence refuse (no chaining inside one call)', () => {
    expect(
      codeOf(() => applyBodyEdits(parsed, [edit(), edit({ before: 'Alfa.', after: 'Alpa.' })]))
    ).toBe('duplicate-edit');
  });
  it('a no-op edit refuses', () => {
    expect(codeOf(() => applyBodyEdits(parsed, [edit({ after: 'Alpha.' })]))).toBe('no-op');
  });
  it('a parsed object whose text no longer matches its records refuses (zero-change proof)', () => {
    expect(codeOf(() => applyBodyEdits({ ...parsed, text: `${text} ` }, [edit()]))).toBe(
      'zero-change-proof'
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────
// buildChangeRecord
// ───────────────────────────────────────────────────────────────────────────────────────────

describe('buildChangeRecord', () => {
  const fields = (o = {}) => ({
    module: 'm100',
    segmentId: 'm100:para:p1',
    occurrence: 0,
    opId: 'op-1',
    source: 'ai',
    rulingId: 'atom',
    category: 'term',
    find: 'Frumeind',
    replace: 'Atóm',
    before: 'Frumeind er lítil.',
    after: 'Atóm er lítil.',
    runId: 'run-1',
    ...o,
  });

  it('control: a find that occurs once in before builds', () => {
    expect(codeOf(() => buildChangeRecord(fields()))).toBe('no-throw');
  });
  it('a find that occurs twice in before refuses, even when after is the first-occurrence splice', () => {
    // 'i' is in "Frumeind" and in "lítil"; the after below replaces only the first one.
    expect(
      codeOf(() =>
        buildChangeRecord(fields({ find: 'i', replace: 'e', after: 'Frumeend er lítil.' }))
      )
    ).toBe('bad-change');
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────
// Fixture tree: listChapterUnits / readBase / writeRevisedChapter / verifyRevision
// ───────────────────────────────────────────────────────────────────────────────────────────

const M100 = `<!-- SEG:m100:title:auto-1 -->\nTitill\n\n<!-- SEG:m100:para:p1 -->\nFrumeind er lítil.\n\n\n<!-- SEG:m100:para:p1 -->\nFrumeind er lítil. `;
const M200 = `<!-- SEG:m200:para:p1 -->\nSameind.`;
const META = `<!-- SEG:chapter:title:ch01 -->\nKafli`;
const LINKS = '{"links":[]}\n';

/** Write a file, creating its directory. */
function put(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

/** Every file under dir, as { relpath: bytes-as-base64 }. */
function snapshot(dir) {
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const e of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile()) continue;
    const abs = path.join(e.parentPath ?? e.path, e.name);
    out[path.relative(dir, abs)] = fs.readFileSync(abs).toString('base64');
  }
  return out;
}

const REVISION = {
  layer1Commit: SHA_A,
  rulingSet: { path: 'experiments/x/ruling-set.json', sha256: HEX64('1') },
  prompt: { path: 'tools/ai-review/prompt.md', sha256: HEX64('2') },
  model: 'claude-opus-5-5',
  sdk: { name: '@anthropic-ai/sdk', version: '1.3.0' },
  anthropicVersion: '2023-06-01',
  harnessCommit: SHA_B,
  runIds: ['run-1'],
};

describe('fixture tree', () => {
  let root;
  let book;
  const ch = 'ch01';
  const out = (...p) => path.join(book, LAYER_DIRS.pure, ch, ...p);
  const rev = (...p) => path.join(book, LAYER_DIRS.revised, ch, ...p);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-layers-'));
    book = path.join(root, 'books', 'test-book');
    put(path.join(book, '02-structure', ch, 'm100-structure.json'), '{}');
    put(path.join(book, '02-structure', ch, 'm100-manifest.json'), '{}');
    put(path.join(book, '02-structure', ch, 'm200-structure.json'), '{}');
    put(out('m100-segments.is.md'), M100);
    put(out('m200-segments.is.md'), M200);
    put(out('chapter-metadata-segments.is.md'), META);
    put(out('m100-segments-links.json'), LINKS);
    put(out('m100-provenance.json'), '{"tool":"api-translate"}');
    put(out('m100-segments(b).is.md'), '{{SEG:m100:para:p1}}\nlegacy');
    put(out('m100-segments.is.md:Zone.Identifier'), '[ZoneTransfer]');
    put(out('m100-segments.is.md.backup.2026'), 'junk');
    put(path.join(book, '01-source', ch, 'm100.cnxml'), '<document/>');
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const change = (o = {}) =>
    buildChangeRecord({
      module: 'm100',
      segmentId: 'm100:para:p1',
      occurrence: 1,
      opId: 'op-1',
      source: 'ai',
      rulingId: 'atom',
      category: 'term',
      find: 'Frumeind',
      replace: 'Atóm',
      before: 'Frumeind er lítil.',
      after: 'Atóm er lítil.',
      runId: 'run-1',
      ...o,
    });
  const revisedM100 = M100.replace(
    '<!-- SEG:m100:para:p1 -->\nFrumeind er lítil. ',
    '<!-- SEG:m100:para:p1 -->\nAtóm er lítil. '
  );
  const fullUnits = () => [
    { stem: 'm100', text: revisedM100, changes: [change()], rejected: 2 },
    { stem: 'm200', text: M200, changes: [] },
    { stem: 'chapter-metadata', text: META, changes: [] },
  ];
  const write = (o = {}) =>
    writeRevisedChapter({
      bookDir: book,
      chapterDir: ch,
      units: fullUnits(),
      revision: REVISION,
      ...o,
    });

  describe('listChapterUnits', () => {
    it('lists structure stems plus chapter-metadata, ignoring every other file', () => {
      expect(listChapterUnits({ bookDir: book, chapterDir: ch })).toEqual([
        'm100',
        'm200',
        'chapter-metadata',
      ]);
    });
    it('omits chapter-metadata when layer 1 has none', () => {
      fs.rmSync(out('chapter-metadata-segments.is.md'));
      expect(listChapterUnits({ bookDir: book, chapterDir: ch })).toEqual(['m100', 'm200']);
    });
    it('refuses a stray *-structure.json that names no module', () => {
      put(path.join(book, '02-structure', ch, 'notes-structure.json'), '{}');
      expect(codeOf(() => listChapterUnits({ bookDir: book, chapterDir: ch }))).toBe(
        'stray-structure-file'
      );
    });
    it('refuses a chapter with no structure directory', () => {
      expect(codeOf(() => listChapterUnits({ bookDir: book, chapterDir: 'ch02' }))).toBe(
        'no-structure'
      );
    });
    it('refuses a malformed chapter dir', () => {
      expect(codeOf(() => listChapterUnits({ bookDir: book, chapterDir: 'ch1' }))).toBe(
        'bad-chapter-dir'
      );
    });
  });

  describe('readBase', () => {
    const overlay = (entries, o = {}) =>
      put(
        path.join(book, LAYER_DIRS.selected, ch, 'm100-selected.json'),
        JSON.stringify({ schema: 'mt-selected/1', module: 'm100', entries, ...o })
      );
    /** The layer-1 body of both `m100:para:p1` occurrences in M100. */
    const P1_BODY = 'Frumeind er lítil.';
    const entry = (o = {}) => ({
      segmentId: 'm100:para:p1',
      occurrence: 0,
      text: 'Frumeindin er smá.',
      beforeSha256: sha256(P1_BODY),
      run: 'run-0',
      commit: SHA_A,
      rule: 'best-of-3',
      gate: { ok: true },
      ...o,
    });

    it('reads layer 1 with its raw sha256 and no overlay', () => {
      const base = readBase({ bookDir: book, chapterDir: ch, stem: 'm100' });
      expect([base.parsed.text, base.layer1Sha256, base.overlaySha256]).toEqual([
        M100,
        sha256(M100),
        null,
      ]);
    });
    it('applies a layer-1s overlay to the named occurrence only', () => {
      overlay([entry()]);
      const base = readBase({ bookDir: book, chapterDir: ch, stem: 'm100' });
      expect(base.parsed.records.map((r) => r.body)).toEqual([
        'Titill',
        'Frumeindin er smá.',
        'Frumeind er lítil.',
      ]);
    });
    it('reports the overlay sha256 and keeps the layer-1 sha256 of the raw file', () => {
      overlay([entry()]);
      const raw = fs.readFileSync(path.join(book, LAYER_DIRS.selected, ch, 'm100-selected.json'));
      const base = readBase({ bookDir: book, chapterDir: ch, stem: 'm100' });
      expect([base.layer1Sha256, base.overlaySha256]).toEqual([sha256(M100), sha256(raw)]);
    });
    it('refuses an overlay with the wrong schema', () => {
      overlay([entry()], { schema: 'mt-selected/2' });
      expect(codeOf(() => readBase({ bookDir: book, chapterDir: ch, stem: 'm100' }))).toBe(
        'bad-overlay'
      );
    });
    it('refuses an overlay for another module', () => {
      overlay([entry()], { module: 'm200' });
      expect(codeOf(() => readBase({ bookDir: book, chapterDir: ch, stem: 'm100' }))).toBe(
        'bad-overlay'
      );
    });
    it('refuses an overlay entry naming an occurrence layer 1 lacks', () => {
      overlay([entry({ occurrence: 5 })]);
      expect(codeOf(() => readBase({ bookDir: book, chapterDir: ch, stem: 'm100' }))).toBe(
        'bad-overlay'
      );
    });
    it('refuses an overlay entry with an invalid body', () => {
      overlay([entry({ text: 'two\nlines' })]);
      expect(codeOf(() => readBase({ bookDir: book, chapterDir: ch, stem: 'm100' }))).toBe(
        'bad-overlay'
      );
    });
    it('refuses two overlay entries for one occurrence when the first equals the base (no silent no-op + apply)', () => {
      overlay([entry({ text: 'Frumeind er lítil.' }), entry()]);
      expect(codeOf(() => readBase({ bookDir: book, chapterDir: ch, stem: 'm100' }))).toBe(
        'bad-overlay'
      );
    });
    it('refuses two overlay entries for one occurrence when both differ from the base', () => {
      overlay([entry(), entry({ text: 'Frumeindin er örsmá.' })]);
      expect(codeOf(() => readBase({ bookDir: book, chapterDir: ch, stem: 'm100' }))).toBe(
        'bad-overlay'
      );
    });
    it.each([
      ['a commit that is not a full sha', { commit: 'x' }],
      ['an empty run', { run: '' }],
      ['a run that is not a string', { run: 7 }],
      ['an empty rule', { rule: '' }],
      ['a rule that is not a string', { rule: null }],
    ])('refuses an overlay entry with %s', (_label, o) => {
      overlay([entry(o)]);
      expect(codeOf(() => readBase({ bookDir: book, chapterDir: ch, stem: 'm100' }))).toBe(
        'bad-overlay'
      );
    });

    describe('an entry pins the layer-1 body it replaces (beforeSha256)', () => {
      const base = () => readBase({ bookDir: book, chapterDir: ch, stem: 'm100' });
      const p1Bodies = () =>
        base()
          .parsed.records.filter((r) => r.segmentId === 'm100:para:p1')
          .map((r) => r.body);
      /** M100 with occurrence 1's body replaced (the file ends in that body plus one space). */
      const m100WithP1Occurrence1 = (body) => M100.replace(/Frumeind er lítil\. $/, `${body} `);

      it('applies an entry whose beforeSha256 is the sha256 of the body it replaces', () => {
        overlay([entry({ occurrence: 1 })]);
        expect(p1Bodies()).toEqual([P1_BODY, 'Frumeindin er smá.']);
      });
      it('refuses an entry written before a later HAND REPAIR of layer 1, naming the occurrence', () => {
        overlay([entry({ occurrence: 1 })]);
        const whenWritten = refusalOf(base);
        put(out('m100-segments.is.md'), m100WithP1Occurrence1('Frumeind er agnarlítil.'));
        expect([whenWritten, refusalOf(base)]).toEqual([
          ['no-throw', ''], // control: the entry held against the layer 1 it was written for
          [
            'bad-overlay',
            expect.stringContaining('m100:para:p1#1: beforeSha256 is not the sha256 of the'),
          ],
        ]);
      });
      it('refuses an entry without beforeSha256', () => {
        overlay([without(entry(), 'beforeSha256')]);
        expect(refusalOf(base)).toEqual([
          'bad-overlay',
          expect.stringMatching(/an entry must have exactly .*beforeSha256/),
        ]);
      });
      it.each([
        ['the right hash in uppercase', () => sha256(P1_BODY).toUpperCase()],
        ['63 hex characters', () => sha256(P1_BODY).slice(1)],
        ['65 hex characters', () => `${sha256(P1_BODY)}0`],
        ['64 characters with a non-hex one', () => `g${sha256(P1_BODY).slice(1)}`],
        ['null', () => null],
        ['a number', () => 7],
        ['the right hash inside an array', () => [sha256(P1_BODY)]],
      ])('refuses a beforeSha256 that is %s', (_label, value) => {
        overlay([entry({ beforeSha256: value() })]);
        expect(refusalOf(base)).toEqual([
          'bad-overlay',
          expect.stringContaining(
            'entry m100:para:p1 / 0: beforeSha256 must be 64 lowercase hex characters'
          ),
        ]);
      });

      describe('on a duplicated id, against the occurrence the entry names', () => {
        const BODIES = [P1_BODY, 'Frumeind er örlítil.'];
        const KEYS = ['m100:para:p1', 'm100:para:p1#1'];
        beforeEach(() => {
          put(out('m100-segments.is.md'), m100WithP1Occurrence1(BODIES[1]));
        });

        it.each([0, 1])('occurrence %i: the hash of its own body applies', (k) => {
          overlay([entry({ occurrence: k, beforeSha256: sha256(BODIES[k]) })]);
          expect(p1Bodies()).toEqual(BODIES.map((b, i) => (i === k ? 'Frumeindin er smá.' : b)));
        });
        it.each([0, 1])(
          'occurrence %i: the hash of the other occurrence’s body refuses, naming it',
          (k) => {
            overlay([entry({ occurrence: k, beforeSha256: sha256(BODIES[1 - k]) })]);
            expect(refusalOf(base)).toEqual([
              'bad-overlay',
              expect.stringContaining(`${KEYS[k]}: beforeSha256 is not the sha256 of the`),
            ]);
          }
        );
      });
    });
    it('refuses a layer-1 file whose markers name another module', () => {
      put(out('m200-segments.is.md'), M100);
      expect(codeOf(() => readBase({ bookDir: book, chapterDir: ch, stem: 'm200' }))).toBe(
        'module-mismatch'
      );
    });
    it('refuses a bad stem', () => {
      expect(
        codeOf(() => readBase({ bookDir: book, chapterDir: ch, stem: 'm100-segments(b)' }))
      ).toBe('bad-stem');
    });
  });

  describe('writeRevisedChapter', () => {
    it('writes every unit: segments, revision and changes, plus the links copy where layer 1 has one', () => {
      write();
      expect(fs.readdirSync(rev()).sort()).toEqual([
        'chapter-metadata-changes.jsonl',
        'chapter-metadata-revision.json',
        'chapter-metadata-segments.is.md',
        'm100-changes.jsonl',
        'm100-revision.json',
        'm100-segments-links.json',
        'm100-segments.is.md',
        'm200-changes.jsonl',
        'm200-revision.json',
        'm200-segments.is.md',
      ]);
    });
    it('the written segments parse back to exactly the intended records (key and body)', () => {
      write();
      const project = (t) => parseLayerFile(t).records.map((r) => [r.key, r.body]);
      const written = Object.fromEntries(
        ['m100', 'm200', 'chapter-metadata'].map((stem) => [
          stem,
          project(fs.readFileSync(rev(`${stem}-segments.is.md`), 'utf8')),
        ])
      );
      // Spelled out, not derived from the code under test: the accepted edit lands on #1 only.
      expect(written).toEqual({
        m100: [
          ['m100:title:auto-1', 'Titill'],
          ['m100:para:p1', 'Frumeind er lítil.'],
          ['m100:para:p1#1', 'Atóm er lítil.'],
        ],
        m200: [['m200:para:p1', 'Sameind.']],
        'chapter-metadata': [['chapter:title:ch01', 'Kafli']],
      });
    });
    it('writes exactly the unit text', () => {
      write();
      expect(fs.readFileSync(rev('m100-segments.is.md'), 'utf8')).toBe(revisedM100);
    });
    it('a zero-change unit is byte-identical to layer 1', () => {
      write();
      expect(fs.readFileSync(rev('m200-segments.is.md'))).toEqual(
        fs.readFileSync(out('m200-segments.is.md'))
      );
    });
    it('the links file is a byte copy', () => {
      write();
      expect(fs.readFileSync(rev('m100-segments-links.json'), 'utf8')).toBe(LINKS);
    });
    it('changes.jsonl holds one JSON line per change', () => {
      write();
      const lines = fs.readFileSync(rev('m100-changes.jsonl'), 'utf8').split('\n');
      expect([lines.length, JSON.parse(lines[0]).key, lines[1]]).toEqual([2, 'm100:para:p1#1', '']);
    });
    it('a unit with no changes still gets an empty changes file and a revision file', () => {
      write();
      expect([
        fs.readFileSync(rev('m200-changes.jsonl'), 'utf8'),
        JSON.parse(fs.readFileSync(rev('m200-revision.json'), 'utf8')).counts,
      ]).toEqual(['', { accepted: 0, rejected: 0, byCategory: {} }]);
    });
    it('revision.json carries the full provenance shape', () => {
      write();
      expect(JSON.parse(fs.readFileSync(rev('m100-revision.json'), 'utf8'))).toEqual({
        schema: 'mt-revised/1',
        module: 'm100',
        chapterDir: ch,
        layer1: { dir: '02-mt-output', commit: SHA_A, sha256: sha256(M100) },
        overlay: null,
        rulingSet: REVISION.rulingSet,
        prompt: REVISION.prompt,
        model: 'claude-opus-5-5',
        sdk: REVISION.sdk,
        anthropicVersion: '2023-06-01',
        harnessCommit: SHA_B,
        runIds: ['run-1'],
        counts: { accepted: 1, rejected: 2, byCategory: { term: 1 } },
      });
    });
    it('never writes a *-provenance.json or a *.log', () => {
      write();
      expect(fs.readdirSync(rev()).filter((f) => /-provenance\.json$|\.log$/.test(f))).toEqual([]);
    });
    it('leaves 02-mt-output and 01-source byte-identical', () => {
      const before = [
        snapshot(path.join(book, '02-mt-output')),
        snapshot(path.join(book, '01-source')),
      ];
      write();
      expect([
        snapshot(path.join(book, '02-mt-output')),
        snapshot(path.join(book, '01-source')),
      ]).toEqual(before);
    });
    it('leaves no temporary files behind', () => {
      write();
      expect(fs.readdirSync(rev()).filter((f) => f.includes('.tmp'))).toEqual([]);
    });
    it('an incomplete chapter refuses and writes nothing', () => {
      const units = fullUnits().filter((u) => u.stem !== 'm200');
      expect([codeOf(() => write({ units })), fs.existsSync(rev())]).toEqual([
        'incomplete-chapter',
        false,
      ]);
    });
    it('a unit the chapter does not have refuses', () => {
      const units = [...fullUnits(), { stem: 'm300', text: M200, changes: [] }];
      expect(codeOf(() => write({ units }))).toBe('unknown-unit');
    });
    it('a unit stem escaping via .. refuses', () => {
      const units = [...fullUnits(), { stem: '../../02-mt-output/ch01/m100', text: M200 }];
      expect(codeOf(() => write({ units }))).toBe('bad-stem');
    });
    it('a unit listed twice refuses', () => {
      const units = [...fullUnits(), { stem: 'm200', text: M200, changes: [] }];
      expect(codeOf(() => write({ units }))).toBe('duplicate-unit');
    });
    it('a text the change log does not produce refuses', () => {
      const units = fullUnits();
      units[0] = { ...units[0], changes: [] };
      expect(codeOf(() => write({ units }))).toBe('text-not-derived');
    });
    it('a change replayed onto a changed base refuses', () => {
      const units = fullUnits();
      units[0] = { ...units[0], changes: [change(), change()] };
      expect(codeOf(() => write({ units }))).toBe('base-changed');
    });
    it('a change whose sha256 does not match its text refuses', () => {
      const units = fullUnits();
      units[0] = { ...units[0], changes: [{ ...change(), afterSha256: HEX64('0') }] };
      expect(codeOf(() => write({ units }))).toBe('bad-change');
    });
    it('a change whose find/replace does not produce its after refuses', () => {
      const units = fullUnits();
      units[0] = { ...units[0], changes: [{ ...change(), replace: 'Atom' }] };
      expect(codeOf(() => write({ units }))).toBe('bad-change');
    });
    it('an ai change whose run is not in runIds refuses', () => {
      const units = fullUnits();
      units[0] = { ...units[0], changes: [change({ runId: 'run-9' })] };
      expect(codeOf(() => write({ units }))).toBe('bad-change');
    });
    it('an ai change refuses when the revision records no ruling set (its rulingId would point at nothing)', () => {
      expect(codeOf(() => write({ revision: { ...REVISION, rulingSet: null } }))).toBe(
        'bad-change'
      );
    });
    it('control: a rule change needs no ruling set, prompt or model', () => {
      const ruleChange = buildChangeRecord({
        ...without(
          {
            module: 'm100',
            segmentId: 'm100:para:p1',
            occurrence: 1,
            opId: 'op-1',
            source: 'rule',
            rulingId: 'unused',
            category: 'term',
            find: 'Frumeind',
            replace: 'Atóm',
            before: 'Frumeind er lítil.',
            after: 'Atóm er lítil.',
            runId: null,
          },
          'rulingId'
        ),
        ruleId: 'rule-1',
      });
      const units = fullUnits();
      units[0] = { ...units[0], changes: [ruleChange] };
      const revision = { ...REVISION, rulingSet: null, prompt: null, model: null };
      expect(codeOf(() => write({ units, revision }))).toBe('no-throw');
    });
    it('a change whose module is another unit refuses', () => {
      const units = fullUnits();
      units[0] = { ...units[0], changes: [change({ module: 'm200' })] };
      expect(codeOf(() => write({ units }))).toBe('bad-change');
    });
    it.each(['constructor', '__proto__', 'toString'])(
      'a category named %s is counted as itself (no inherited Object member)',
      (category) => {
        const units = fullUnits();
        units[0] = { ...units[0], changes: [change({ category })] };
        write({ units });
        const { counts } = JSON.parse(fs.readFileSync(rev('m100-revision.json'), 'utf8'));
        expect(Object.entries(counts.byCategory)).toEqual([[category, 1]]);
      }
    );
    it('byCategory keys are sorted, whatever order the changes came in', () => {
      const title = buildChangeRecord({
        module: 'm100',
        segmentId: 'm100:title:auto-1',
        occurrence: 0,
        opId: 'op-2',
        source: 'ai',
        rulingId: 'atom',
        category: 'agreement',
        find: 'Titill',
        replace: 'Titillinn',
        before: 'Titill',
        after: 'Titillinn',
        runId: 'run-1',
      });
      const units = fullUnits();
      units[0] = {
        ...units[0],
        text: revisedM100.replace('\nTitill\n', '\nTitillinn\n'),
        changes: [change(), title],
      };
      write({ units });
      const { counts } = JSON.parse(fs.readFileSync(rev('m100-revision.json'), 'utf8'));
      expect(Object.keys(counts.byCategory)).toEqual(['agreement', 'term']);
    });
    it('revision.json bytes do not depend on the key order of the provenance passed in', () => {
      write();
      const canonical = fs.readFileSync(rev('m100-revision.json'), 'utf8');
      fs.rmSync(rev(), { recursive: true });
      write({
        revision: {
          ...REVISION,
          rulingSet: { sha256: REVISION.rulingSet.sha256, path: REVISION.rulingSet.path },
          prompt: { sha256: REVISION.prompt.sha256, path: REVISION.prompt.path },
          sdk: { version: REVISION.sdk.version, name: REVISION.sdk.name },
        },
      });
      expect(fs.readFileSync(rev('m100-revision.json'), 'utf8')).toBe(canonical);
    });
    it('a stale links copy (layer 1 no longer has one) refuses an overwrite and is left alone', () => {
      write();
      fs.rmSync(out('m100-segments-links.json'));
      expect([
        codeOf(() => write({ overwrite: true })),
        fs.readFileSync(rev('m100-segments-links.json'), 'utf8'),
      ]).toEqual(['stale-destination', LINKS]);
    });
    it('a stray links copy for a unit whose layer 1 has none refuses a first write', () => {
      put(rev('m200-segments-links.json'), LINKS);
      expect([codeOf(() => write()), fs.readdirSync(rev())]).toEqual([
        'stale-destination',
        ['m200-segments-links.json'],
      ]);
    });
    it('a chapter dir symlinked into 01-source between the first check and mkdir refuses (re-check after mkdir)', () => {
      const realMkdirSync = fs.mkdirSync;
      const spy = vi.spyOn(fs, 'mkdirSync').mockImplementation((p, opts) => {
        if (p === rev()) {
          realMkdirSync(path.join(book, LAYER_DIRS.revised), { recursive: true });
          fs.symlinkSync(path.join(book, '01-source', ch), rev());
        }
        return realMkdirSync(p, opts);
      });
      try {
        expect([
          codeOf(() => write()),
          spy.mock.calls.length,
          fs.readdirSync(path.join(book, '01-source', ch)),
        ]).toEqual(['unsafe-destination', 1, ['m100.cnxml']]);
      } finally {
        spy.mockRestore();
      }
    });
    it('a revision missing a field refuses', () => {
      expect(codeOf(() => write({ revision: without(REVISION, 'model') }))).toBe('bad-revision');
    });
    it('a second write refuses rather than overwrite a chapter', () => {
      write();
      expect(codeOf(() => write())).toBe('destination-exists');
    });
    it('control: a second write with overwrite: true succeeds', () => {
      write();
      expect(codeOf(() => write({ overwrite: true }))).toBe('no-throw');
    });
    it('a malformed chapter dir refuses at the public entry', () => {
      expect(codeOf(() => write({ chapterDir: 'ch1' }))).toBe('bad-chapter-dir');
    });
    it('a symlinked chapter dir pointing into 01-source refuses (realpath check)', () => {
      fs.mkdirSync(path.join(book, LAYER_DIRS.revised), { recursive: true });
      fs.symlinkSync(path.join(book, '01-source', ch), rev());
      expect([codeOf(() => write()), fs.readdirSync(path.join(book, '01-source', ch))]).toEqual([
        'unsafe-destination',
        ['m100.cnxml'],
      ]);
    });
    it('a bookDir that is not books/<slug> refuses', () => {
      expect(codeOf(() => write({ bookDir: path.join(book, '02-mt-output') }))).toBe(
        'bad-book-dir'
      );
    });
  });

  describe('resolveSafeDestination — only the safe shapes', () => {
    const dest = (rel, chapterDir = ch) =>
      codeOf(() =>
        resolveSafeDestination({ bookDir: book, chapterDir, filePath: `${book}/${rel}` })
      );

    it.each([
      '02-mt-revised/ch01/m100-segments.is.md',
      '02-mt-revised/ch01/m100-revision.json',
      '02-mt-revised/ch01/m100-changes.jsonl',
      '02-mt-revised/ch01/m100-segments-links.json',
      '02-mt-revised/ch01/chapter-metadata-segments.is.md',
      '02-mt-selected/ch01/m100-selected.json',
    ])('accepts %s', (rel) => {
      expect(dest(rel)).toBe('no-throw');
    });
    it('accepts the appendices dir', () => {
      expect(dest('02-mt-revised/appendices/m100-revision.json', 'appendices')).toBe('no-throw');
    });
    it.each([
      ['under 02-mt-output', '02-mt-output/ch01/m100-segments.is.md'],
      ['under 02-mt-output, a safe filename', '02-mt-output/ch01/m100-revision.json'],
      ['under 01-source', '01-source/ch01/m100.cnxml'],
      ['under 01-source, a safe filename', '01-source/ch01/m100-revision.json'],
      ['escaping via ..', '02-mt-revised/ch01/../../02-mt-output/ch01/m100-segments.is.md'],
      ['escaping the book via ..', '02-mt-revised/ch01/../../../x/ch01/m100-revision.json'],
      [
        'a non-normalised path that lands back in place',
        '02-mt-revised/ch01/../ch01/m100-revision.json',
      ],
      ['a provenance filename', '02-mt-revised/ch01/m100-provenance.json'],
      ['a log filename', '02-mt-revised/ch01/m100.log'],
      ['a legacy split filename', '02-mt-revised/ch01/m100-segments(b).is.md'],
      ['an EN filename', '02-mt-revised/ch01/m100-segments.en.md'],
      ['an uppercase module', '02-mt-revised/ch01/M100-revision.json'],
      ['a nested file', '02-mt-revised/ch01/x/m100-revision.json'],
      ['a wrong chdir shape (ch1)', '02-mt-revised/ch1/m100-revision.json'],
      ['a wrong chdir shape (05)', '02-mt-revised/05/m100-revision.json'],
      ['a wrong chdir shape (ch001)', '02-mt-revised/ch001/m100-revision.json'],
      ['another chapter than the one being written', '02-mt-revised/ch02/m100-revision.json'],
      ['the layer directory itself', '02-mt-revised/ch01'],
      ['a safe filename with a trailing slash', '02-mt-revised/ch01/m100-revision.json/'],
    ])('refuses %s', (_label, rel) => {
      expect(dest(rel)).toBe('unsafe-destination');
    });
    it('refuses an absolute path outside the book', () => {
      expect(
        codeOf(() =>
          resolveSafeDestination({
            bookDir: book,
            chapterDir: ch,
            filePath: '/etc/m100-revision.json',
          })
        )
      ).toBe('unsafe-destination');
    });
  });

  describe('verifyRevision', () => {
    const current = {
      rulingSetSha256: REVISION.rulingSet.sha256,
      promptSha256: REVISION.prompt.sha256,
      model: REVISION.model,
    };
    const verify = (c = current) =>
      verifyRevision({ bookDir: book, chapterDir: ch, stem: 'm100', current: c });
    const fields = (c) => verify(c).map((m) => m.field);

    it('control: unchanged inputs report no mismatch', () => {
      write();
      expect(verify()).toEqual([]);
    });
    it('reports a changed layer-1 file', () => {
      write();
      fs.appendFileSync(out('m100-segments.is.md'), 'x');
      expect(fields()).toEqual(['layer1.sha256']);
    });
    it('reports an overlay that appeared after the revision', () => {
      write();
      put(path.join(book, LAYER_DIRS.selected, ch, 'm100-selected.json'), '{}');
      expect(fields()).toEqual(['overlay.sha256']);
    });
    it('reports a changed ruling set', () => {
      write();
      expect(fields({ ...current, rulingSetSha256: HEX64('9') })).toEqual(['rulingSet.sha256']);
    });
    it('reports a changed prompt', () => {
      write();
      expect(fields({ ...current, promptSha256: HEX64('9') })).toEqual(['prompt.sha256']);
    });
    it('reports a changed model', () => {
      write();
      expect(fields({ ...current, model: 'claude-other' })).toEqual(['model']);
    });
    it('reports every mismatch at once, with recorded and current values', () => {
      write();
      fs.appendFileSync(out('m100-segments.is.md'), 'x');
      expect(verify({ rulingSetSha256: null, promptSha256: HEX64('9'), model: null })).toEqual([
        { field: 'layer1.sha256', recorded: sha256(M100), current: sha256(`${M100}x`) },
        { field: 'rulingSet.sha256', recorded: REVISION.rulingSet.sha256, current: null },
        { field: 'prompt.sha256', recorded: REVISION.prompt.sha256, current: HEX64('9') },
        { field: 'model', recorded: REVISION.model, current: null },
      ]);
    });
    it('a missing revision file is itself a mismatch, never a silent pass', () => {
      expect(fields()).toEqual(['revision']);
    });
    it('a revision file with the wrong schema is a mismatch', () => {
      write();
      const r = JSON.parse(fs.readFileSync(rev('m100-revision.json'), 'utf8'));
      fs.writeFileSync(rev('m100-revision.json'), JSON.stringify({ ...r, schema: 'mt-revised/0' }));
      expect(fields()).toEqual(['revision']);
    });

    /** Rewrite m100's revision.json through fn (JSON.stringify drops an `undefined` key). */
    const rewriteRevision = (fn) => {
      const r = JSON.parse(fs.readFileSync(rev('m100-revision.json'), 'utf8'));
      fs.writeFileSync(rev('m100-revision.json'), JSON.stringify(fn(r)));
    };

    it('a malformed recorded rulingSet is a mismatch, never read as null (current null)', () => {
      write();
      rewriteRevision((r) => ({ ...r, rulingSet: 'deadbeef' }));
      expect(fields({ ...current, rulingSetSha256: null })).toEqual(['revision']);
    });
    it('a revision file with its model key removed is a mismatch, never read as null (current null)', () => {
      write();
      rewriteRevision((r) => ({ ...r, model: undefined }));
      expect(fields({ ...current, model: null })).toEqual(['revision']);
    });
    it.each([
      ['a prompt without a path', (r) => ({ ...r, prompt: { sha256: HEX64('2') } })],
      [
        'a prompt sha256 that is not 64 hex',
        (r) => ({ ...r, prompt: { ...r.prompt, sha256: 'x' } }),
      ],
      ['an overlay that is a string', (r) => ({ ...r, overlay: 'x' })],
      ['an sdk that is a string', (r) => ({ ...r, sdk: 'x' })],
      ['an empty model', (r) => ({ ...r, model: '' })],
      [
        'a layer1 commit that is not a full sha',
        (r) => ({ ...r, layer1: { ...r.layer1, commit: 'z' } }),
      ],
      [
        'a layer1 dir other than 02-mt-output',
        (r) => ({ ...r, layer1: { ...r.layer1, dir: 'x' } }),
      ],
      ['a harnessCommit that is a number', (r) => ({ ...r, harnessCommit: 5 })],
      ['runIds that are not an array', (r) => ({ ...r, runIds: 'run-1' })],
      ['a negative accepted count', (r) => ({ ...r, counts: { ...r.counts, accepted: -1 } })],
      [
        'a byCategory value that is a string',
        (r) => ({ ...r, counts: { ...r.counts, byCategory: { term: '1' } } }),
      ],
      ['an extra top-level key', (r) => ({ ...r, extra: true })],
    ])('a revision file with %s is a mismatch', (_label, fn) => {
      write();
      rewriteRevision(fn);
      expect(fields()).toEqual(['revision']);
    });

    it('control: every unit of a written chapter verifies clean', () => {
      write();
      const results = ['m100', 'm200', 'chapter-metadata'].map((stem) =>
        verifyRevision({ bookDir: book, chapterDir: ch, stem, current })
      );
      expect(results).toEqual([[], [], []]);
    });
    it('a hand edit to the revised text is a mismatch', () => {
      write();
      fs.writeFileSync(
        rev('m100-segments.is.md'),
        revisedM100.replace('Atóm er lítil.', 'HANDVIRKT er lítil.')
      );
      expect(fields()).toEqual(['text']);
    });
    it('a deleted revised text is a mismatch', () => {
      write();
      fs.rmSync(rev('m100-segments.is.md'));
      expect(fields()).toEqual(['text']);
    });
    it('a changes.jsonl replaced with garbage is a mismatch', () => {
      write();
      fs.writeFileSync(rev('m100-changes.jsonl'), 'garbage\n');
      expect(fields()).toEqual(['changes']);
    });
    it('a deleted changes.jsonl is a mismatch', () => {
      write();
      fs.rmSync(rev('m100-changes.jsonl'));
      expect(fields()).toEqual(['changes']);
    });
    it('a change line forged with a run the revision does not list is a mismatch', () => {
      write();
      const forged = { ...JSON.parse(fs.readFileSync(rev('m100-changes.jsonl'), 'utf8')) };
      fs.writeFileSync(
        rev('m100-changes.jsonl'),
        `${JSON.stringify({ ...forged, runId: 'run-9' })}\n`
      );
      expect(fields()).toEqual(['changes']);
    });
    it('a change log re-serialised in another form (same records, keys reordered) is a mismatch', () => {
      write();
      const line = JSON.parse(fs.readFileSync(rev('m100-changes.jsonl'), 'utf8'));
      const reordered = Object.fromEntries(Object.entries(line).reverse());
      fs.writeFileSync(rev('m100-changes.jsonl'), `${JSON.stringify(reordered)}\n`);
      expect(fields()).toEqual(['changes']);
    });
    it('an emptied change log disagrees with both the counts and the text', () => {
      write();
      fs.writeFileSync(rev('m100-changes.jsonl'), '');
      expect(fields()).toEqual(['counts', 'text']);
    });
    it('counts that disagree with the log are a mismatch', () => {
      write();
      rewriteRevision((r) => ({ ...r, counts: { ...r.counts, accepted: 2 } }));
      expect(fields()).toEqual(['counts']);
    });
    it('a byCategory tally that disagrees with the log is a mismatch', () => {
      write();
      rewriteRevision((r) => ({ ...r, counts: { ...r.counts, byCategory: { agreement: 1 } } }));
      expect(fields()).toEqual(['counts']);
    });
    it('a links copy that differs from the current layer-1 links file is a mismatch', () => {
      write();
      fs.writeFileSync(out('m100-segments-links.json'), '{"links":["v2"]}\n');
      expect(fields()).toEqual(['links']);
    });
    it('a deleted links copy is a mismatch', () => {
      write();
      fs.rmSync(rev('m100-segments-links.json'));
      expect(fields()).toEqual(['links']);
    });
    it('a links copy whose layer-1 original is gone is a mismatch', () => {
      write();
      fs.rmSync(out('m100-segments-links.json'));
      expect(fields()).toEqual(['links']);
    });
    it('refuses a `current` that omits a field', () => {
      write();
      expect(codeOf(() => verify(without(current, 'model')))).toBe('bad-current');
    });
  });
});
