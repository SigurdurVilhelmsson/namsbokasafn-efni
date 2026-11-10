// server/__tests__/suggestionLogs.test.js
//
// G1.23 PR1 Task 3: the change-log reader, the drop and the grouping. Committed modules are read from
// the real tree; every malformed case is planted in a temp books root through the explicit opts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

const L = require('../lib/suggestionLogs');
const log = require('../lib/logger');
const { sha256Text } = require('../lib/servedText');

const BOOK = 'efnafraedi-2e';

let tmp;
let warn;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'suggestion-logs-'));
  warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  L._setTestRoots(null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

const RULINGS = {
  rulings: [
    { id: 'alloy', en: ['alloy', 'alloys'], is: 'melmi' },
    { id: 'salt', en: ['salt'], is: 'salt-is' },
  ],
};

function rec(over) {
  const r = {
    module: 'm1',
    segmentId: 'm1:para:a',
    occurrence: 0,
    key: 'm1:para:a',
    opId: 'ch01/m1/001.op1',
    source: 'ai',
    rulingId: 'alloy',
    category: 'term',
    find: 'x',
    replace: 'y',
    before: 'a x b',
    after: 'a y b',
    runId: 'run1',
    ...over,
  };
  r.beforeSha256 = over?.beforeSha256 ?? sha256Text(r.before);
  r.afterSha256 = over?.afterSha256 ?? sha256Text(r.after);
  return r;
}

/** Plant a module under tmp; returns the explicit roots. */
function plant({
  lines,
  revision,
  rulingBytes = JSON.stringify(RULINGS),
  moduleId = 'm1',
  dirName = 'ch01',
}) {
  const booksRoot = path.join(tmp, 'books');
  const dir = path.join(booksRoot, BOOK, '02-mt-revised', dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'rulings.json'), rulingBytes);
  const good = crypto.createHash('sha256').update(JSON.stringify(RULINGS)).digest('hex');
  if (lines !== undefined) {
    fs.writeFileSync(path.join(dir, `${moduleId}-changes.jsonl`), lines.join('\n') + '\n');
  }
  if (revision !== null) {
    fs.writeFileSync(
      path.join(dir, `${moduleId}-revision.json`),
      JSON.stringify(
        revision ?? { schema: 'mt-revised/1', rulingSet: { path: 'rulings.json', sha256: good } }
      )
    );
  }
  return { booksRoot, repoRoot: tmp };
}
const read = (opts, chapter = 1, moduleId = 'm1') =>
  L.readModuleLog({ book: BOOK, chapter, moduleId }, opts);
const j = (o) => JSON.stringify(o);

describe('committed modules', () => {
  it('reads a committed module and drops the agreement group whole', () => {
    const lg = L.readModuleLog({ book: BOOK, chapter: 1, moduleId: 'm68664' });
    expect(lg.ok).toBe(true);
    const kept = [...L.keptGroups(lg).values()].flat().flatMap((gr) => gr.changes);
    expect(kept.some((c) => c.category === 'agreement')).toBe(false);
    expect(kept.length).toBeGreaterThan(0); // control: something is kept
  });

  it('dropFilter drops every record of each group that holds an agreement record, and nothing else', () => {
    const lg = L.readModuleLog({ book: BOOK, chapter: 1, moduleId: 'm68664' });
    const all = [...lg.chains.values()].flat();
    const agreementGroups = new Set(
      all.filter((r) => r.category === 'agreement').map((r) => `${r.segmentId}|${r.rulingId}`)
    );
    expect(agreementGroups.size).toBeGreaterThan(0); // control: the module has agreement records
    const { kept, dropped } = L.dropFilter(lg);
    expect(dropped.length).toBeGreaterThan(0);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.some((r) => r.category === 'agreement')).toBe(false);
    const wanted = all.filter((r) => agreementGroups.has(`${r.segmentId}|${r.rulingId}`));
    expect(new Set(dropped.map((r) => r.opId))).toEqual(new Set(wanted.map((r) => r.opId)));
    expect(dropped.length + kept.length).toBe(all.length);
    expect(kept.every((r) => !agreementGroups.has(`${r.segmentId}|${r.rulingId}`))).toBe(true);
  });

  it('reads appendices through the -1 sentinel', () => {
    const dir = path.join(__dirname, '../../books', BOOK, '02-mt-revised/appendices');
    const mod = fs
      .readdirSync(dir)
      .find((f) => f.endsWith('-changes.jsonl') && fs.statSync(path.join(dir, f)).size > 0);
    expect(mod).toBeTruthy(); // control: a non-empty appendix log exists
    const lg = L.readModuleLog({
      book: BOOK,
      chapter: -1,
      moduleId: mod.replace('-changes.jsonl', ''),
    });
    expect(lg.ok).toBe(true);
    expect(lg.chains.size).toBeGreaterThan(0);
  });

  it('reads chapter metadata like any module', () => {
    const lg = L.readModuleLog({ book: BOOK, chapter: 2, moduleId: 'chapter-metadata' });
    expect(lg.ok).toBe(true);
    expect([...lg.chains.keys()]).toEqual(['chapter:title:ch02#0']);
  });

  it('labels a group from the ruling set: en[0] and is', () => {
    const lg = L.readModuleLog({ book: BOOK, chapter: 1, moduleId: 'm68664' });
    const g = [...L.keptGroups(lg).values()].flat().find((x) => x.rulingId === 'alloy');
    expect(g.label).toEqual({ en: 'alloy', is: 'melmi' });
  });
});

describe('absent and fail-soft', () => {
  it('answers absent, without a warning, for a module with no log', () => {
    expect(L.readModuleLog({ book: BOOK, chapter: 1, moduleId: 'm-no-such' })).toEqual({
      ok: false,
      reason: 'absent',
    });
    expect(read({ booksRoot: path.join(tmp, 'nowhere') })).toEqual({ ok: false, reason: 'absent' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('answers absent for organic before any filesystem read', () => {
    const spy = vi.spyOn(fs, 'readFileSync');
    const out = L.readModuleLog({ book: 'lifraen-efnafraedi', chapter: 1, moduleId: 'm1' });
    const calls = spy.mock.calls.length;
    spy.mockRestore();
    expect(out).toEqual({ ok: false, reason: 'absent' });
    expect(calls).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('reads a good planted module (control for the malformed cases)', () => {
    const lg = read(plant({ lines: [j(rec())] }));
    expect(lg.ok).toBe(true);
    expect([...lg.chains.keys()]).toEqual(['m1:para:a#0']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('an empty log is ok with empty chains', () => {
    const lg = read(plant({ lines: [] }));
    expect(lg.ok).toBe(true);
    expect(lg.chains.size).toBe(0);
  });

  const second = (over) => rec({ opId: 'op2', ...over });
  it.each([
    ['a record whose beforeSha256 is wrong', () => [j(rec({ beforeSha256: 'f'.repeat(64) }))]],
    [
      'a broken chain (before ≠ previous after)',
      () => [j(rec()), j(second({ before: 'a x c', after: 'a y c' }))],
    ],
    ['a find that occurs twice in before', () => [j(rec({ before: 'x x', after: 'y x' }))]],
    ['an after that is not the one-substitution result', () => [j(rec({ after: 'a z b' }))]],
    ['an unknown key', () => [j({ ...rec(), extra: 1 })]],
    ['a missing key', () => [j((({ runId: _r, ...rest }) => rest)(rec()))]],
    ['a module that is not the module', () => [j(rec({ module: 'm2' }))]],
    ['a source outside ai/rule', () => [j(rec({ source: 'human' }))]],
    ['a negative occurrence', () => [j(rec({ occurrence: -1 }))]],
    ['an unknown ruling id', () => [j(rec({ rulingId: 'no-such-ruling' }))]],
    ['a line that is not JSON', () => [j(rec()), 'not json {']],
  ])('fails soft on %s: malformed, one warning naming the module, never text', (name, mk) => {
    const out = read(plant({ lines: mk() }));
    expect(out).toEqual({ ok: false, reason: 'malformed' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({ book: BOOK, moduleId: 'm1', reason: 'malformed' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('a x b');
  });

  it('fails soft on a missing revision file', () => {
    const out = read(plant({ lines: [j(rec())], revision: null }));
    expect(out).toEqual({ ok: false, reason: 'malformed' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('fails soft on a ruling set whose sha256 differs from the revision', () => {
    const out = read(plant({ lines: [j(rec())], rulingBytes: JSON.stringify({ rulings: [] }) }));
    expect(out).toEqual({ ok: false, reason: 'malformed' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('fails soft on an unparseable ruling set that matches its hash', () => {
    const bytes = 'not json';
    const out = read(
      plant({
        lines: [j(rec())],
        rulingBytes: bytes,
        revision: {
          rulingSet: {
            path: 'rulings.json',
            sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
          },
        },
      })
    );
    expect(out).toEqual({ ok: false, reason: 'malformed' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('answers unreadable, with one warning, when the log path is a directory', () => {
    const roots = plant({ lines: [j(rec())] });
    const p = path.join(roots.booksRoot, BOOK, '02-mt-revised/ch01/m1-changes.jsonl');
    fs.rmSync(p);
    fs.mkdirSync(p);
    expect(read(roots)).toEqual({ ok: false, reason: 'unreadable' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({ book: BOOK, moduleId: 'm1', reason: 'unreadable' });
  });

  it('never throws on hostile identifiers', () => {
    expect(() => read({}, 1, '../etc')).not.toThrow();
    expect(read({}, 1, '../etc')).toEqual({ ok: false, reason: 'absent' });
    expect(read({}, 1.5)).toEqual({ ok: false, reason: 'absent' });
  });
});

describe('_setTestRoots', () => {
  it('plants a module for later tasks, explicit opts still win, and null restores the defaults', () => {
    const roots = plant({ lines: [j(rec())] });
    L._setTestRoots(roots);
    expect(read(undefined).ok).toBe(true); // planted module, no opts
    // explicit opts win: a nonexistent booksRoot is absent even with test roots set
    expect(read({ booksRoot: path.join(tmp, 'nowhere') })).toEqual({ ok: false, reason: 'absent' });
    L._setTestRoots(null);
    expect(read(undefined)).toEqual({ ok: false, reason: 'absent' }); // m1 is not in the real tree
    expect(L.readModuleLog({ book: BOOK, chapter: 1, moduleId: 'm68664' }).ok).toBe(true);
  });
});

describe('keptGroups and firstBeforeSha256', () => {
  // chain A: alloy (2 changes, one on top of the other), salt (1), then an alloy-less marker group
  const s1 = 'one x two q three';
  const s2 = 'one y two q three';
  const s3 = 'one y two r three';
  const s4 = 'one y two r [[term:z]] three';
  const s5 = 'one y two r [[term:w]] three';
  const chainA = [
    rec({ opId: 'a1', before: s1, after: s2, find: 'x', replace: 'y' }),
    rec({ opId: 'a2', rulingId: 'salt', before: s2, after: s3, find: 'q', replace: 'r' }),
    rec({ opId: 'a3', before: s3, after: s4, find: ' three', replace: ' [[term:z]] three' }),
    rec({ opId: 'a4', before: s4, after: s5, find: 'z', replace: 'w', rulingId: 'salt' }),
  ];
  const other = rec({
    segmentId: 'm1:para:b',
    key: 'm1:para:b',
    opId: 'b1',
    before: 'k x',
    after: 'k y',
  });

  it('groups per (segment, occurrence, ruling) in the index shape, in chain order, with chainIndex', () => {
    const lg = read(
      plant({
        lines: [...chainA.slice(0, 2), j(other)].map((r) => (typeof r === 'string' ? r : j(r))),
      })
    );
    expect(lg.ok).toBe(true);
    const gs = L.keptGroups(lg);
    expect([...gs.keys()]).toEqual(['m1:para:a#0', 'm1:para:b#0']);
    const a = gs.get('m1:para:a#0');
    expect(a).toEqual([
      {
        key: 'm1:para:a#0|alloy',
        segmentId: 'm1:para:a',
        occurrence: 0,
        rulingId: 'alloy',
        source: 'ai',
        label: { en: 'alloy', is: 'melmi' },
        changes: [
          {
            opId: 'a1',
            occurrence: 0,
            find: 'x',
            replace: 'y',
            category: 'term',
            runId: 'run1',
            chainIndex: 0,
          },
        ],
      },
      expect.objectContaining({ key: 'm1:para:a#0|salt', label: { en: 'salt', is: 'salt-is' } }),
    ]);
    expect(a[1].changes.map((c) => [c.opId, c.chainIndex])).toEqual([['a2', 1]]);
  });

  it('keeps a multi-change group in chain order with its full-chain indexes', () => {
    const recs = [
      rec({ opId: 'c1', before: 'x q x2', after: 'y q x2', find: 'x q', replace: 'y q' }),
      rec({
        opId: 'c2',
        rulingId: 'salt',
        before: 'y q x2',
        after: 'y r x2',
        find: 'q',
        replace: 'r',
      }),
      rec({ opId: 'c3', before: 'y r x2', after: 'y r y2', find: 'x2', replace: 'y2' }),
    ];
    const lg = read(plant({ lines: recs.map(j) }));
    const gs = L.keptGroups(lg).get('m1:para:a#0');
    expect(gs.map((g) => g.rulingId)).toEqual(['alloy', 'salt']);
    expect(gs[0].changes.map((c) => [c.opId, c.chainIndex])).toEqual([
      ['c1', 0],
      ['c3', 2],
    ]);
  });

  it('leaves out a group with a marker token while a sibling group in the same chain is kept', () => {
    const lg = read(plant({ lines: chainA.map(j) }));
    expect(lg.ok).toBe(true);
    // the alloy group holds a3 whose replace carries "[[" and so is left out; salt (a2, a4: a4's
    // find/replace are marker-free) is the kept sibling
    const gs = L.keptGroups(lg).get('m1:para:a#0');
    expect(gs.map((g) => g.rulingId)).toEqual(['salt']);
    expect(gs[0].changes.map((c) => c.opId)).toEqual(['a2', 'a4']);
  });

  it('firstBeforeSha256 gives the first record before the drop, and null for an unknown chain', () => {
    const agreement = rec({ opId: 'g1', category: 'agreement', before: 'p x', after: 'p y' });
    const next = rec({
      opId: 'g2',
      rulingId: 'salt',
      before: 'p y',
      after: 'p z',
      find: 'y',
      replace: 'z',
    });
    const lg = read(plant({ lines: [j(agreement), j(next)] }));
    // the whole alloy group is dropped, yet the chain's first beforeSha256 is still reported
    expect(
      L.keptGroups(lg)
        .get('m1:para:a#0')
        .map((g) => g.rulingId)
    ).toEqual(['salt']);
    expect(L.firstBeforeSha256(lg, 'm1:para:a', 0)).toBe(sha256Text('p x'));
    expect(L.firstBeforeSha256(lg, 'm1:para:zzz', 0)).toBeNull();
    expect(L.firstBeforeSha256(lg, 'm1:para:a', 1)).toBeNull();
  });
});
