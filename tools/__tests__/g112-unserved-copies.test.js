/**
 * g112-unserved-copies.test.js — the frozen list of G1.12's unserved Icelandic copies, its
 * loader, and the two re-MT battery checks that read it (A2b's `cross-side` leg, A3's unpaired
 * list).
 *
 * Background (design docs/superpowers/specs/2026-11-12-g112-duplicate-segment-ids-design.md §3):
 * after the G1.12 re-extract, chemistry's English emits each of 285 nested-note paragraphs ONCE,
 * while the bought machine translation (`02-mt-output`, never edited) keeps BOTH Icelandic copies.
 * The editor serves the first copy; the second is unserved. Nothing at run time can tell a
 * bought-twice paragraph from one the paid MT duplicated, so the battery is told exactly which
 * copies to expect by a FROZEN list of (module, segmentId) pairs — never by a shape rule, and
 * never by "a surplus copy of an id English has is fine".
 *
 * The corpus pin runs BOTH ways: every listed pair has the expected shape (EN 1, IS 2), and every
 * pair of that shape in the committed chemistry corpus is listed. A re-buy that drops a copy, or a
 * re-extract that changes the English, turns it red.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCheck, VERDICT } from '../lib/remt-battery.js';
import { A2b, A3 } from '../lib/remt-checks-mt.js';
import { loadUnservedCopiesOrNull, unservedIdsForModule } from '../lib/g112-unserved-copies.js';
import segMarkers from '../lib/seg-markers.cjs';
import { REPO_ROOT } from './helpers/remt-corpus.js';

const { parseSegmentRecords } = segMarkers;

const BOOK_DIR = path.join(REPO_ROOT, 'books', 'efnafraedi-2e');
const LIST_PATH = path.join(BOOK_DIR, 'g112-unserved-copies.json');

/** id -> occurrence count in one segment file. */
const idCounts = (text) => {
  const m = new Map();
  for (const r of parseSegmentRecords(text)) m.set(r.segmentId, (m.get(r.segmentId) || 0) + 1);
  return m;
};

describe('the frozen list, pinned both ways against the committed chemistry corpus', () => {
  // Read with JSON.parse, not through the loader, so the corpus pin does not depend on the code
  // it is a premise for.
  const list = JSON.parse(fs.readFileSync(LIST_PATH, 'utf8'));
  const key = (moduleId, segmentId) => `${moduleId}\t${segmentId}`;

  it('carries its schema, its base commit and 285 entries in 83 modules', () => {
    expect(list.schema).toBe(1);
    expect(list.baseCommit).toBe('69cc289c9');
    expect(list.why).toMatch(/G1\.12/);
    expect(list.entries).toHaveLength(285);
    expect(new Set(list.entries.map((e) => e.moduleId)).size).toBe(83);
    expect(new Set(list.entries.map((e) => key(e.moduleId, e.segmentId))).size).toBe(285);
  });

  it('is sorted by chapterDir, moduleId, segmentId', () => {
    const k = (e) => [e.chapterDir, e.moduleId, e.segmentId];
    const sorted = [...list.entries].sort((a, b) => {
      for (let i = 0; i < 3; i++) if (k(a)[i] !== k(b)[i]) return k(a)[i] < k(b)[i] ? -1 : 1;
      return 0;
    });
    expect(list.entries).toEqual(sorted);
  });

  it('every listed segment occurs exactly once in English and exactly twice in Icelandic', () => {
    const bad = [];
    for (const e of list.entries) {
      const en = path.join(BOOK_DIR, '02-for-mt', e.chapterDir, `${e.moduleId}-segments.en.md`);
      const is = path.join(BOOK_DIR, '02-mt-output', e.chapterDir, `${e.moduleId}-segments.is.md`);
      const enN = idCounts(fs.readFileSync(en, 'utf8')).get(e.segmentId) || 0;
      const isN = idCounts(fs.readFileSync(is, 'utf8')).get(e.segmentId) || 0;
      if (enN !== 1 || isN !== 2) bad.push(`${e.chapterDir}/${e.segmentId} EN ${enN} IS ${isN}`);
    }
    expect(bad).toEqual([]);
  });

  it('every (module, segmentId) with English count 1 and Icelandic count 2 is listed', () => {
    const found = new Set();
    let files = 0;
    const enRoot = path.join(BOOK_DIR, '02-for-mt');
    for (const ch of fs.readdirSync(enRoot).sort()) {
      const dir = path.join(enRoot, ch);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of fs.readdirSync(dir).sort()) {
        const m = /^(m\d+)-segments\.en\.md$/.exec(f);
        if (!m) continue;
        const isPath = path.join(BOOK_DIR, '02-mt-output', ch, `${m[1]}-segments.is.md`);
        if (!fs.existsSync(isPath)) continue;
        files++;
        const en = idCounts(fs.readFileSync(path.join(dir, f), 'utf8'));
        const is = idCounts(fs.readFileSync(isPath, 'utf8'));
        for (const [id, n] of is) if (n === 2 && en.get(id) === 1) found.add(key(m[1], id));
      }
    }
    // Control: an empty walk would find nothing and the set comparison below would be vacuous.
    expect(files).toBe(149);
    expect([...found].sort()).toEqual(list.entries.map((e) => key(e.moduleId, e.segmentId)).sort());
  });
});

describe('loadUnservedCopiesOrNull — absent and empty are different states', () => {
  const withFile = (content, fn) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g112-unserved-'));
    try {
      if (content !== undefined)
        fs.writeFileSync(path.join(dir, 'g112-unserved-copies.json'), content);
      return fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  const entry = { chapterDir: 'ch01', moduleId: 'm1', segmentId: 'm1:para:a' };

  it('returns null when the file does not exist', () => {
    expect(withFile(undefined, (d) => loadUnservedCopiesOrNull(d))).toBe(null);
  });

  it('returns {entries: []} for a real list that lists nothing', () => {
    expect(withFile('{"schema":1,"entries":[]}', (d) => loadUnservedCopiesOrNull(d))).toEqual({
      entries: [],
    });
  });

  it('returns the entries of a well-formed list', () => {
    const text = JSON.stringify({ schema: 1, baseCommit: 'x', why: 'y', entries: [entry] });
    expect(withFile(text, (d) => loadUnservedCopiesOrNull(d))).toEqual({ entries: [entry] });
  });

  it('loads the committed chemistry list (285 entries) and finds no list for organic', () => {
    expect(loadUnservedCopiesOrNull(BOOK_DIR).entries).toHaveLength(285);
    expect(loadUnservedCopiesOrNull(path.join(REPO_ROOT, 'books', 'lifraen-efnafraedi'))).toBe(
      null
    );
  });

  const MALFORMED = {
    'bad JSON': '{"schema":1,"entries":[',
    'a top-level array': '[]',
    'JSON null': 'null',
    'schema missing': '{"entries":[]}',
    'schema 2': '{"schema":2,"entries":[]}',
    'schema as a string': '{"schema":"1","entries":[]}',
    'entries missing': '{"schema":1}',
    'entries null': '{"schema":1,"entries":null}',
    'entries an object': '{"schema":1,"entries":{}}',
    'an entry that is not an object': '{"schema":1,"entries":["m1:para:a"]}',
    'an entry missing chapterDir': JSON.stringify({
      schema: 1,
      entries: [{ moduleId: 'm1', segmentId: 'm1:para:a' }],
    }),
    'an entry missing moduleId': JSON.stringify({
      schema: 1,
      entries: [{ chapterDir: 'ch01', segmentId: 'm1:para:a' }],
    }),
    'an entry missing segmentId': JSON.stringify({
      schema: 1,
      entries: [{ chapterDir: 'ch01', moduleId: 'm1' }],
    }),
    'an entry with an empty field': JSON.stringify({
      schema: 1,
      entries: [{ ...entry, chapterDir: '' }],
    }),
    'a segmentId from another module': JSON.stringify({
      schema: 1,
      entries: [{ ...entry, segmentId: 'm2:para:a' }],
    }),
    'a duplicated entry': JSON.stringify({ schema: 1, entries: [entry, entry] }),
  };
  for (const [label, text] of Object.entries(MALFORMED)) {
    it(`throws on ${label}`, () => {
      expect(() => withFile(text, (d) => loadUnservedCopiesOrNull(d))).toThrow();
    });
  }
});

describe('unservedIdsForModule', () => {
  const list = {
    entries: [
      { chapterDir: 'ch01', moduleId: 'm1', segmentId: 'm1:para:a' },
      { chapterDir: 'ch01', moduleId: 'm1', segmentId: 'm1:para:b' },
      { chapterDir: 'ch02', moduleId: 'm2', segmentId: 'm2:para:a' },
    ],
  };
  it('is the set of the module’s listed ids', () => {
    expect([...unservedIdsForModule(list, 'm1')]).toEqual(['m1:para:a', 'm1:para:b']);
  });
  it('is empty for an unlisted module', () => {
    expect(unservedIdsForModule(list, 'm3').size).toBe(0);
  });
  it('is empty for a null list', () => {
    expect(unservedIdsForModule(null, 'm1').size).toBe(0);
  });
  it('throws on a list without an entries array', () => {
    expect(() => unservedIdsForModule({}, 'm1')).toThrow();
  });
});

// ─── synthetic fixtures. SEG markers have NO space after the colon. ───────────────────────────
const seg = (id, text) => `<!-- SEG:${id} -->\n${text}\n\n`;
const DUP = 'm1:para:dup';
const LISTED = { entries: [{ chapterDir: 'ch01', moduleId: 'm1', segmentId: DUP }] };
const EN = seg('m1:para:a', 'Alpha') + seg(DUP, 'Duplicated') + seg('m1:para:b', 'Beta');
// The bought Icelandic: the nested-note paragraph twice (the second copy is unserved).
const IS =
  seg('m1:para:a', 'Alfa') + seg(DUP, 'Tvítekið') + seg(DUP, 'Tvítekið') + seg('m1:para:b', 'Beta');
const ctxOf = (over) => ({
  segText: EN,
  isText: IS,
  module: 'm1',
  unservedCopies: LISTED,
  ...over,
});

describe('A2b cross-side leg — a listed copy is expected, everything else blocks as before', () => {
  it('1. a listed id with 1 English and 2 Icelandic records passes, and the count is reported', async () => {
    const r = await runCheck(A2b, ctxOf({}));
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.findings).toEqual([]);
    expect(r.message).toBe(
      '4 raw SEG tokens, 4 parsed, 3 EN parsed, 1 listed unserved IS copy (G1.12)'
    );
  });

  it('2. MUST TRIP: one listed Icelandic copy destroyed, so the id parses once', async () => {
    // `SEG:` -> `SG:` destroys the token: the raw leg cannot see it (raw 3 = parsed 3).
    const damaged = IS.replace(
      `<!-- SEG:${DUP} -->\nTvítekið\n\n<!-- SEG:${DUP}`,
      () => `<!-- SEG:${DUP} -->\nTvítekið\n\n<!-- SG:${DUP}`
    );
    expect(damaged).not.toBe(IS);
    const r = await runCheck(A2b, ctxOf({ isText: damaged }));
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings).toEqual([
      {
        kind: 'unserved-copy-shape-mismatch',
        leg: 'cross-side',
        segmentId: DUP,
        enCount: 1,
        isCount: 1,
      },
      {
        kind: 'seg-count-cross-side-mismatch',
        leg: 'cross-side',
        enParsed: 3,
        isParsed: 3,
        listed: 1,
      },
    ]);
  });

  it('3. MUST TRIP: an UNLISTED id with 1 English and 2 Icelandic records (no surplus-passes rule)', async () => {
    const today = [
      { kind: 'seg-count-cross-side-mismatch', leg: 'cross-side', enParsed: 3, isParsed: 4 },
    ];
    for (const unservedCopies of [
      { entries: [] },
      { entries: [{ chapterDir: 'ch02', moduleId: 'm2', segmentId: 'm2:para:dup' }] },
    ]) {
      const r = await runCheck(A2b, ctxOf({ unservedCopies }));
      expect(r.verdict).toBe(VERDICT.FAIL);
      expect(r.findings).toEqual(today);
    }
  });

  it('4. MUST TRIP: a listed id with 3 Icelandic records', async () => {
    const r = await runCheck(A2b, ctxOf({ isText: IS + seg(DUP, 'Tvítekið') }));
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings).toEqual([
      {
        kind: 'unserved-copy-shape-mismatch',
        leg: 'cross-side',
        segmentId: DUP,
        enCount: 1,
        isCount: 3,
      },
      {
        kind: 'seg-count-cross-side-mismatch',
        leg: 'cross-side',
        enParsed: 3,
        isParsed: 5,
        listed: 1,
      },
    ]);
  });

  it('5. MUST TRIP: `unservedCopies: null` with the fixture-1 strings fails exactly as before', async () => {
    // The literal below is what A2b v3 (the branch start, 69cc289c9) returns for these bytes.
    for (const over of [{ unservedCopies: null }, { unservedCopies: undefined }]) {
      const r = await runCheck(A2b, ctxOf(over));
      expect(r.verdict).toBe(VERDICT.FAIL);
      expect(r.findings).toEqual([
        { kind: 'seg-count-cross-side-mismatch', leg: 'cross-side', enParsed: 3, isParsed: 4 },
      ]);
      expect(r.message).toBe('4 raw SEG tokens, 4 parsed, 3 EN parsed — legs fired: cross-side');
    }
  });

  it('6. MUST TRIP: the per-id shape rule alone, when the module count happens to balance', async () => {
    // Two listed ids, one bought three times and one only once: 2 + 2 surplus = 2 listed, so the
    // count comparison passes and only the per-id shape rule can see it.
    const Y = 'm1:para:b';
    const list = {
      entries: [
        { chapterDir: 'ch01', moduleId: 'm1', segmentId: DUP },
        { chapterDir: 'ch01', moduleId: 'm1', segmentId: Y },
      ],
    };
    const isText =
      seg('m1:para:a', 'Alfa') + seg(DUP, 'T') + seg(DUP, 'T') + seg(DUP, 'T') + seg(Y, 'B');
    const r = await runCheck(A2b, ctxOf({ isText, unservedCopies: list }));
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings).toEqual([
      {
        kind: 'unserved-copy-shape-mismatch',
        leg: 'cross-side',
        segmentId: DUP,
        enCount: 1,
        isCount: 3,
      },
      {
        kind: 'unserved-copy-shape-mismatch',
        leg: 'cross-side',
        segmentId: Y,
        enCount: 1,
        isCount: 1,
      },
    ]);
  });

  it('7. MUST TRIP: a list without `module` cannot be keyed, so the module is judged strictly', async () => {
    const r = await runCheck(A2b, ctxOf({ module: undefined }));
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.map((f) => f.kind)).toEqual(['seg-count-cross-side-mismatch']);
  });
});

describe('A3 — a listed id’s second Icelandic copy is counted, not reported as unpaired', () => {
  it('the listed second copy is not an `unpaired-segment` finding, and the count is reported', () => {
    const r = A3.run(ctxOf({}));
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.findings).toEqual([]);
    expect(r.message).toMatch(/1 listed unserved IS cop(y|ies) not reported \(G1\.12\)/);
  });

  it('without a list, the same second copy is reported exactly as before', () => {
    for (const unservedCopies of [null, undefined, { entries: [] }]) {
      const r = A3.run(ctxOf({ unservedCopies }));
      expect(r.verdict).toBe(VERDICT.WARN);
      expect(r.findings).toEqual([{ kind: 'unpaired-segment', segmentId: `${DUP}#1` }]);
      expect(r.message).toBe('0/3 segments with a marker delta, 1 unpaired; total {}');
    }
  });

  it('MUST TRIP: an unlisted unpaired occurrence beside a listed one is still reported', () => {
    const r = A3.run(ctxOf({ isText: IS + seg('m1:para:extra', 'Auka') }));
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.findings).toEqual([{ kind: 'unpaired-segment', segmentId: 'm1:para:extra' }]);
  });

  it('MUST TRIP: a listed id with 2 English and 1 Icelandic records is reported (the English side)', () => {
    const en = EN + seg(DUP, 'Duplicated');
    const is = seg('m1:para:a', 'Alfa') + seg(DUP, 'Tvítekið') + seg('m1:para:b', 'Beta');
    const r = A3.run(ctxOf({ segText: en, isText: is }));
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.findings).toEqual([{ kind: 'unpaired-segment', segmentId: `${DUP}#1` }]);
  });

  it('MUST TRIP: a listed id with 3 Icelandic records is reported in full', () => {
    const r = A3.run(ctxOf({ isText: IS + seg(DUP, 'Tvítekið') }));
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.findings).toEqual([
      { kind: 'unpaired-segment', segmentId: `${DUP}#1` },
      { kind: 'unpaired-segment', segmentId: `${DUP}#2` },
    ]);
  });
});
