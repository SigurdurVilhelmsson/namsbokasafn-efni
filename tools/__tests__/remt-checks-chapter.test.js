/**
 * remt-checks-chapter.test.js — Tier 4 (K1-K5).
 *
 * ⚠️ THE POSITIVE FIXTURES ARE BUILT BY CALLING THE REAL PRODUCER, never hand-written.
 * `readChapterFromDisk` supplies `chapterInputs` and `snapshotModuleIds` supplies K3's
 * Maps, because a hand-built fixture and the check can agree with each other while both
 * disagree with the producer — the failure mode that stays green until the first real
 * payload arrives mid-run.
 *
 * ⚠️ EVERY CORPUS PATH READ HERE IS TRACKED (verified: 05-publication is 100% tracked in
 * both books; the whole on-disk-vs-tracked gap is `*.backup.*`), so CI reads the same
 * bytes. §C82 L79: a test whose green depends on an artifact CI lacks is measuring the
 * dev box.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY, VERDICT, runCheck } from '../lib/remt-battery.js';
import { K1, K2, K3, K4, K5, CHAPTER_CHECKS, TRACKS } from '../lib/remt-checks-chapter.js';
import { readChapterFromDisk } from '../cnxml-render-fidelity-check.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHEM = path.join(REPO_ROOT, 'books', 'efnafraedi-2e');

/** Real content for a chapter that is published, via the real producer. */
const inputsFor = (chapter, track = 'mt-preview') => readChapterFromDisk(CHEM, chapter, track);

/** A ctx carrying everything the content checks need, so only the varied key is under test. */
const ctxFor = (chapter, extra = {}) => ({
  book: 'efnafraedi-2e',
  track: 'mt-preview',
  chapter: String(chapter),
  chapterInputs: inputsFor(chapter),
  knownIntentionalImageDrops: 0,
  ...extra,
});

describe('the corpus fixtures this file rests on are real', () => {
  // 🔴 A COUNT WITHOUT A CONTROL IS NOT A MEASUREMENT. Every "0 findings" below is only
  // meaningful if the producer actually handed over content; an empty read would make
  // every check SKIP and the file would pass while testing nothing.
  it('chemistry ch4 has both sides on disk — the fixture every content test uses', () => {
    const i = inputsFor(4);
    expect(i.cnxml.length).toBeGreaterThan(0);
    expect(i.html.length).toBeGreaterThan(0);
  });

  it('chemistry appendices is the specialModules cell — it too has both sides', () => {
    const i = inputsFor('appendices');
    expect(i.cnxml.length).toBeGreaterThan(0);
    expect(i.html.length).toBeGreaterThan(0);
  });
});

describe('K2 — the cross-stage drop invariant, and the option that decides its rate', () => {
  it('finds the measured drop on chemistry ch4: 6 equations', async () => {
    // The one natural must-trip in the two run-target books. §C82 L88's denominator:
    // 1 of 26 evaluable cells.
    const r = await runCheck(K2, ctxFor(4));
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ type: 'cross-stage-drop', unit: 'math', dropped: 6 });
  });

  it('🔴 chemistry appendices is CLEAN with the intentional-drop count, and a FALSE POSITIVE without it', async () => {
    // §C82 L88, pinned as a PAIR because either half alone proves nothing. The clean arm
    // alone would pass for a check that never looks at images; the dirty arm alone would
    // pass for a check that is simply broken. Only the pair shows that the OPTION is what
    // moves the verdict.
    const clean = await runCheck(K2, ctxFor('appendices', { knownIntentionalImageDrops: 1 }));
    expect(clean.verdict).toBe(VERDICT.PASS);

    const wrong = await runCheck(K2, ctxFor('appendices', { knownIntentionalImageDrops: 0 }));
    expect(wrong.verdict).toBe(VERDICT.FAIL);
    expect(wrong.findings[0]).toMatchObject({
      type: 'cross-stage-drop',
      unit: 'image',
      dropped: 1,
    });
  });

  it('refuses rather than defaults when the intentional-drop count is missing', async () => {
    // 🔴 NOT `|| 0`. The permissive branch is the one that manufactures the false positive
    // above on a BLOCKING check, taking the tier's rate from 3.8% to 7.7% — across the bar.
    const r = await runCheck(K2, {
      ...ctxFor('appendices'),
      knownIntentionalImageDrops: undefined,
    });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('knownIntentionalImageDrops');
  });

  it('reports only cross-stage drops — the other types belong to other ids', async () => {
    // 🔴 THE FIXTURE IS MICRO ch5, NOT CHEMISTRY ch4, AND THE REASON IS THE WHOLE POINT.
    // Measured: deleting K2's type filter entirely SURVIVED this test while it used
    // chemistry ch4 — because on ch4 `checkChapter` emits nothing BUT cross-stage-drop
    // (control-char is 0 corpus-wide, raw-cnxml-leak is 0 in both run-target books, and
    // shape-drift needs a baseline this arm does not pass). A filter over a population
    // with nothing to exclude is indistinguishable from no filter: §C82 L44③'s shape,
    // where a natural rate near zero is also what a wholly broken detector returns.
    // Micro ch5 is the ONE cell in the corpus that emits a SECOND type, so it is the only
    // place this assertion can separate the two.
    const micro = path.join(REPO_ROOT, 'books', 'orverufraedi');
    const inputs = readChapterFromDisk(micro, 5, 'mt-preview');
    const r = await runCheck(K2, {
      book: 'orverufraedi',
      track: 'mt-preview',
      chapter: '5',
      chapterInputs: inputs,
      knownIntentionalImageDrops: 0,
    });
    // The raw-CNXML leak K5 reports on this exact cell must NOT appear in K2's findings.
    expect(r.findings.some((f) => f.type === 'raw-cnxml-leak')).toBe(false);
    expect(r.findings.every((f) => f.type === 'cross-stage-drop')).toBe(true);
    // The positive half, in the same command: the leak really is there to be excluded, so
    // the `false` above is an exclusion rather than an empty read.
    const leak = await runCheck(K5, {
      book: 'orverufraedi',
      track: 'mt-preview',
      chapter: '5',
      chapterInputs: inputs,
      knownIntentionalImageDrops: 0,
    });
    expect(leak.findings.length).toBeGreaterThan(0);
  });

  it('keys `examined` to HTML files read, not to a constant', async () => {
    // 🔴 §C82 L6: a gate reporting a fixed number reports PASS with a healthy-looking
    // `examined` over a ctx carrying nothing, and `runCheck`'s `PASS + examined 0 ->
    // SKIPPED` backstop never fires. Measured: replacing `content.html.length` with a
    // literal SURVIVED the whole file until this test existed — `examined` was asserted
    // for K3 alone.
    // ⚠️ TWO CHAPTERS WITH DIFFERENT FILE COUNTS, because one would be satisfied by a
    // constant that happens to match.
    const a = await runCheck(K2, ctxFor(4));
    const b = await runCheck(K2, ctxFor('appendices', { knownIntentionalImageDrops: 1 }));
    expect(a.examined).toBe(inputsFor(4).html.length);
    expect(b.examined).toBe(inputsFor('appendices').html.length);
    expect(a.examined).not.toBe(b.examined);
    expect(a.examined).toBeGreaterThan(0);
  });

  it('is BLOCKING — the flag Global Constraint 4 licenses at 3.8%', () => {
    expect(K2.blocking).toBe(true);
  });
});

describe('K1 — shape drift, and the seven representations of "nothing"', () => {
  const BASELINE_CH12 = { em: 370, 'div.equation': 121 };

  it('SKIPs on `null` — no baseline is the EXPECTED inert state, never a clean pass', async () => {
    const r = await runCheck(K1, ctxFor(4, { renderBaseline: null }));
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('no committed baseline');
  });

  it('SKIPs on `undefined` with a DIFFERENT message — a loader defect is not inertness', async () => {
    // The two SKIPPED causes must stay separable, or a post-run sweep cannot tell expected
    // inertness from a loader that never set the key.
    const r = await runCheck(K1, ctxFor(4, { renderBaseline: undefined }));
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('never set');
    expect(r.message).not.toContain('no committed baseline');
  });

  it('🔴 REFUSES an empty histogram rather than comparing every bucket against 0', async () => {
    // §C82 L90 R4, the only representation of "nothing" that produces FALSE POSITIVES:
    // `{}` is truthy, so the drift loop reports the whole chapter as drift (measured: 16
    // findings on chemistry ch10, every one `expected: 0`).
    const r = await runCheck(K1, ctxFor(4, { renderBaseline: {} }));
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings[0].kind).toBe('baseline-vacuous');
    // And it did NOT emit a drift finding per bucket — the thing the refusal prevents.
    expect(r.findings).toHaveLength(1);
  });

  it('refuses an array — a list is not a bucket histogram', async () => {
    const r = await runCheck(K1, ctxFor(4, { renderBaseline: [] }));
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings[0].kind).toBe('baseline-malformed');
  });

  it('WARNs (never FAILs) on real drift — the 21% rate forbids blocking', async () => {
    const r = await runCheck(K1, ctxFor(12, { renderBaseline: BASELINE_CH12 }));
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.findings.every((f) => f.type === 'shape-drift')).toBe(true);
  });

  it('is ADVISORY — a WARN on a blocking check would still halt via blockingFailures', () => {
    expect(K1.blocking).toBe(false);
  });
});

describe('K4 — the detector that would have been orphaned', () => {
  it('finds chemistry ch4 by SKELETON, independently of K2 counting it', async () => {
    // Same cell, same magnitude, found two different ways — which is exactly why they are
    // two ids rather than two legs of one. §C82 L91.
    const r = await runCheck(K4, ctxFor(4));
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings[0]).toMatchObject({ kind: 'genuine-math-drop', lostCount: 6 });
  });

  it('is ADVISORY on stated reasons, not because the rate fails', () => {
    // 3.8% would qualify. It ships advisory because its only measurement is over a stale
    // vintage and K2 already blocks on the same cell. Re-measure after the run.
    expect(K4.blocking).toBe(false);
  });
});

describe('K5 — raw CNXML that survived into published HTML', () => {
  it('is clean across the two run-target books — 0 of 278 files', async () => {
    const r = await runCheck(K5, ctxFor(4));
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.findings).toHaveLength(0);
  });

  it('🔴 fires on the corpus true positive — the natural known-bad fixture', async () => {
    // `books/orverufraedi/05-publication/mt-preview/chapters/05/5-4-thorungar.html` carries
    // `<link document="m58797">…</link>`: raw CNXML holding UNTRANSLATED ENGLISH inside
    // Icelandic prose, which a browser renders as dead text. It lives in a retired book, so
    // this test states the OTHER denominator — the check's blocking flag rests on 0 of 278
    // over the run targets AND on this instance existing at all.
    const micro = path.join(REPO_ROOT, 'books', 'orverufraedi');
    const inputs = readChapterFromDisk(micro, 5, 'mt-preview');
    expect(inputs.html.length).toBeGreaterThan(0); // the fixture is really there
    const r = await runCheck(K5, {
      book: 'orverufraedi',
      track: 'mt-preview',
      chapter: '5',
      chapterInputs: inputs,
      knownIntentionalImageDrops: 0,
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.length).toBeGreaterThan(0);
  });
});

describe('the both-sides guard — a chapter rendered on one side cannot read as clean', () => {
  // §C82 L78②: a one-sided guard reported PASS over an empty document. There is no natural
  // fixture (0 of 112 cells are cnxml-only), so this is synthetic by necessity — and it is
  // stated rather than hidden.
  // 🔴 `renderBaseline` IS SUPPLIED HERE AND IT IS LOAD-BEARING — WITHOUT IT THE K1 CASE
  // PASSED FOR THE WRONG REASON. Measured: mutating the guard to check the published side
  // only killed the K2/K4/K5 cases and left K1 GREEN, because an absent `renderBaseline`
  // makes K1 SKIP on "the loader never set the key" before it ever reaches the content
  // guard. The assertion named SKIPPED without binding WHICH skip — §C82 L54's shape, and
  // it is the mutation round rather than the assertion that found it.
  const half = (over) => ({
    book: 'efnafraedi-2e',
    track: 'mt-preview',
    chapter: '4',
    knownIntentionalImageDrops: 0,
    renderBaseline: { em: 1 },
    ...over,
  });

  for (const check of [K1, K2, K4, K5]) {
    it(`${check.id} SKIPs when the published side is empty`, async () => {
      const r = await runCheck(check, half({ chapterInputs: { cnxml: ['<x/>'], html: [] } }));
      expect(r.verdict).toBe(VERDICT.SKIPPED);
    });

    it(`${check.id} SKIPs when the injected side is empty`, async () => {
      const r = await runCheck(check, half({ chapterInputs: { cnxml: [], html: ['<html/>'] } }));
      expect(r.verdict).toBe(VERDICT.SKIPPED);
    });
  }
});

describe('K3 — renames accounted for by the slug map', () => {
  const snap = (pairs) => new Map(pairs);
  const base = { book: 'efnafraedi-2e', track: 'mt-preview', chapter: '10' };

  it('🔴 SKIPs with no before-snapshot — and that HALTS, because K3 is blocking', async () => {
    // The predicted verdict for every sweep run before the loop itself. No before-snapshot
    // artifact exists anywhere in the repo. Task 13 must assert this rather than "fix" it.
    const r = await runCheck(K3, base);
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(K3.blocking).toBe(true);
  });

  it('refuses a plain object — the producer returns a Map, which cannot come from a file', async () => {
    const r = await runCheck(K3, {
      ...base,
      publishedBefore: { 'a.html': 'm1' },
      publishedAfter: { 'a.html': 'm1' },
    });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
  });

  it('PASSes when a rename is recorded — and the entry must match module AND new name', async () => {
    const r = await runCheck(K3, {
      ...base,
      publishedBefore: snap([['10-5-old.html', 'm68770']]),
      publishedAfter: snap([['10-5-new.html', 'm68770']]),
      slugMap: {
        track: 'mt-preview',
        renames: [
          {
            from: 'chapters/10/10-5-old.html',
            to: 'chapters/10/10-5-new.html',
            moduleId: 'm68770',
          },
        ],
      },
    });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(1);
  });

  it('FAILs on the same rename with NO map — the class it exists to detect', async () => {
    // 5 of the 6 committed slug-map entries are hand backfills for exactly this state.
    const r = await runCheck(K3, {
      ...base,
      publishedBefore: snap([['10-5-old.html', 'm68770']]),
      publishedAfter: snap([['10-5-new.html', 'm68770']]),
      slugMap: null,
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings[0]).toMatchObject({
      kind: 'unaccounted-rename',
      moduleId: 'm68770',
      from: '10-5-old.html',
      to: '10-5-new.html',
    });
  });

  it('FAILs when the map names the right module but the WRONG new file', async () => {
    // 🔴 THE ASSERTION THAT BINDS WHAT DISTINGUISHES. Matching on moduleId alone would
    // accept an entry describing a DIFFERENT rename of the same module, and this test is
    // the only thing separating those two.
    const r = await runCheck(K3, {
      ...base,
      publishedBefore: snap([['10-5-old.html', 'm68770']]),
      publishedAfter: snap([['10-5-new.html', 'm68770']]),
      slugMap: {
        track: 'mt-preview',
        renames: [
          { from: 'chapters/10/x.html', to: 'chapters/10/10-5-other.html', moduleId: 'm68770' },
        ],
      },
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
  });

  it('ignores a `to === from` entry — a re-render is not a rename', async () => {
    // CLAUDE.md's §C9 contract. Such an entry must not account for a real rename.
    const r = await runCheck(K3, {
      ...base,
      publishedBefore: snap([['10-5-old.html', 'm68770']]),
      publishedAfter: snap([['10-5-new.html', 'm68770']]),
      slugMap: {
        track: 'mt-preview',
        renames: [
          {
            from: 'chapters/10/10-5-new.html',
            to: 'chapters/10/10-5-new.html',
            moduleId: 'm68770',
          },
        ],
      },
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
  });

  it('reports a module that left the tree — a deletion is not a rename, and 404s every link', async () => {
    const r = await runCheck(K3, {
      ...base,
      publishedBefore: snap([['10-5-old.html', 'm68770']]),
      publishedAfter: snap([]),
      slugMap: null,
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings[0].kind).toBe('module-disappeared');
  });

  it('PASSes an unchanged chapter — the negative half of the control', async () => {
    const r = await runCheck(K3, {
      ...base,
      publishedBefore: snap([
        ['10-1-a.html', 'm1'],
        ['10-2-b.html', 'm2'],
      ]),
      publishedAfter: snap([
        ['10-1-a.html', 'm1'],
        ['10-2-b.html', 'm2'],
      ]),
      slugMap: null,
    });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(2);
  });

  it('refuses a slug map belonging to another track', async () => {
    // vefur flattens both tracks into one directory, which is why the filename is
    // track-qualified. A `faithful` map read here would account for renames that never
    // happened on this track.
    const r = await runCheck(K3, {
      ...base,
      publishedBefore: snap([['10-5-old.html', 'm68770']]),
      publishedAfter: snap([['10-5-new.html', 'm68770']]),
      slugMap: { track: 'faithful', renames: [] },
    });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('faithful');
  });
});

/**
 * 🔴 THE WIRING PIN — §C82 L71. Mutating `registerChecks(OUTPUT_CHECKS)` to
 * `registerChecks([R1])` at Task 11 dropped BOTH blocking checks and left the ENTIRE
 * `tools/__tests__` suite byte-identical to baseline, because the tests asserted the
 * CONTENTS of the exported array and nothing asserted the array is what reaches the
 * REGISTRY. `registerChecks(...)`'s argument sits one line below the array it passes.
 */
describe('the REGISTRY wiring — the array is not the same claim as the registration', () => {
  it('all five are IN the registry, at tier 4, as the same objects', () => {
    for (const c of CHAPTER_CHECKS) {
      const registered = REGISTRY.get(c.id);
      expect(registered, `${c.id} is not in the REGISTRY`).toBeDefined();
      // Identity, not presence: a check registered from a different object would satisfy
      // `toBeDefined()` while running different code.
      expect(registered).toBe(c);
      expect(registered.tier).toBe(4);
    }
    // L37: the COUNT beside the predicate — a loop over a truncated array is vacuously
    // true, and a duplicate id would satisfy the id list alone.
    const tier4 = [...REGISTRY.values()].filter((c) => c.tier === 4);
    expect(tier4.map((c) => c.id).sort()).toEqual(['K1', 'K2', 'K3', 'K4', 'K5']);
    expect(tier4).toHaveLength(5);
  });

  it('the blocking split is the one the measured base rates license', () => {
    expect(Object.fromEntries(CHAPTER_CHECKS.map((c) => [c.id, c.blocking]))).toEqual({
      K1: false, // 21% of evaluable cells drift
      K2: true, //  3.8%, with a known-bad fixture
      K3: true, //  the information is destroyed if it is not checked
      K4: false, // would qualify; advisory on stated reasons
      K5: true, //  0 of 278 run-target files, 1 of 334 corpus-wide
    });
  });

  it('every check carries an integer version — decision ① cannot key a quarantine without it', () => {
    for (const c of CHAPTER_CHECKS)
      expect(Number.isInteger(c.version) && c.version >= 1).toBe(true);
  });
});

describe('TRACKS is genuinely frozen', () => {
  it('throws on mutation — unlike Object.freeze(new Set()), which silently does not', () => {
    // §C82 L82: `Object.isFrozen(new Set())` returns true while `.add()` succeeds.
    expect(() => TRACKS.push('nope')).toThrow();
    expect(TRACKS).toEqual(['mt-preview', 'faithful']);
  });
});
