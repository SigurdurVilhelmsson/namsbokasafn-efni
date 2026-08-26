/**
 * remt-checks-chapter.test.js — Tier 4 (K1-K5).
 *
 * ⚠️ THE POSITIVE FIXTURES ARE BUILT BY CALLING THE REAL PRODUCER — `readChapterFromDisk`
 * for `chapterInputs`, `snapshotModuleIds` for K3's Maps, `readSlugMap`/`recordRename` for
 * its slug maps, and the committed `render-fidelity-baseline.json` for K1's histograms —
 * because a hand-built fixture and the check can agree with each other while both disagree
 * with the producer, and stay green until the first real payload arrives mid-run.
 *
 * 🔴 THAT PARAGRAPH WAS A CLAIM BEFORE IT WAS TRUE, AND THE GAP IS WHY THIS FILE HAS A FIX
 * ROUND. It named `snapshotModuleIds` while the function was never imported; every K3
 * fixture was a hand-written literal, K1's baseline was a 2-bucket object the producer
 * cannot emit, and the slug map was an ARRAY where the producer writes an OBJECT keyed by
 * `from`. The check was written to match those fixtures, so 39 tests passed over a BLOCKING
 * gate that could not read its own artifact. → §C82 L93.
 * ▶ THE EXCEPTIONS ARE NOW DELIBERATE AND LABELLED, each with a producer-refusal control
 * beside it: a degenerate `to === from` entry and a malformed `renames`, neither of which
 * the producer can emit — which is exactly why they need hand-built fixtures.
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
import {
  readChapterFromDisk,
  htmlShapeHistogram,
  addHistograms,
} from '../cnxml-render-fidelity-check.js';
import { snapshotModuleIds } from '../lib/publication-reconcile.js';
import { readSlugMap, recordRename } from '../lib/slug-map.js';
import fs from 'node:fs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHEM = path.join(REPO_ROOT, 'books', 'efnafraedi-2e');

/** Real content for a chapter that is published, via the real producer. */
const inputsFor = (chapter, track = 'mt-preview') => readChapterFromDisk(CHEM, chapter, track);

/** A ctx carrying everything the content checks need, so only the varied key is under test. */
const RB = () =>
  JSON.parse(fs.readFileSync(path.join(CHEM, 'render-fidelity-baseline.json'), 'utf8')).chapters;
const REAL_BASELINE_CH12 = () => RB()['12'];
const REAL_BASELINE_APP = () => RB()['appendices'];

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

/**
 * 🔴 READ THIS BEFORE "FIXING" A RED IN THIS FILE AFTER A RE-RENDER.
 *
 * Four assertions below pin EXACT magnitudes from the July-2026 chemistry publication tree:
 * K2's `dropped: 6` on ch4, K4's `lostCount: 6` on the same cell, the appendices
 * `dropped: 1` pair, and K2's `PASS margin math +6` on ch6. They are green in CI today and
 * **they will go RED on the first chemistry re-render — which is the very event this
 * battery exists to gate.** The failure therefore arrives mid-campaign, inside the tests of
 * the tool doing the gating, which is the worst possible moment to be guessing.
 *
 * ▶ THE DECISION, STATED RATHER THAN LEFT IMPLICIT: the constants STAY. Three options were
 * available — derive the expectation from the inputs at runtime, assert a relation
 * (`dropped > 0`) instead of a magnitude, or keep the magnitudes with this note. Deriving
 * at runtime makes the test tautological: it would compare the check against a re-derivation
 * of the check, and pass for a detector returning garbage. A bare `> 0` is weaker in the
 * direction that matters — Global Constraint 4 licenses K2's BLOCKING flag on a *measured*
 * known-bad fixture, and a relation does not measure anything.
 *
 * ▶ SO A RED HERE IS SIGNAL, NOT FLAKE: it means the fixture's premise expired — the
 * known-bad chapter got re-rendered and may no longer be bad. **Re-measure and re-pin; do
 * not relax the assertion and do not delete the test.** If `dropped` becomes 0, that is the
 * §C64 loss being FIXED, and the right response is to find a new known-bad fixture or move
 * K2 to advisory with the new rate stated — not to make the old assertion vaguer.
 *
 * ⚠️ `BASELINE_CH12`/`REAL_BASELINE_APP` are deliberately NOT in this category: they read
 * the committed baseline file, so they move with the artifact — chosen for staleness
 * resistance. 🔴 THE NOTE HERE USED TO ADD "a regenerated baseline cannot make those tests
 * fail", AND THAT IS FALSE. Reading the baseline from disk removes only the *hard-coded*
 * side of the comparison; the OTHER side is the published HTML, and the two move
 * independently. Regenerate the baseline from a re-rendered tree and K1's drift test — which
 * asserts a WARN and a non-empty finding list — goes green-to-red the moment the drift it
 * depends on is what got fixed. **They pin K1's handling of a histogram AND the continued
 * existence of drift between two artifacts that are not updated together.**
 */
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
  // 🔴 THE REAL COMMITTED BASELINE, NOT A HAND-WRITTEN LITERAL — AND THE FIRST DRAFT'S
  // LITERAL WAS ITSELF AN INSTANCE OF THE BUG THE NEXT TEST REFUSES. It was
  // `{ em: 370, 'div.equation': 121 }`: a 2-bucket histogram the producer structurally
  // cannot emit (`htmlShapeHistogram` always returns all 16), so the other 14 buckets were
  // each compared against 0 and the fixture pinned SIXTEEN findings where the real
  // 16-bucket entry yields SIX. The documented "3 of 14 cells drift, 9 findings" was
  // measured with the real baseline; this fixture disagreed with it and nothing noticed.
  const REAL_BASELINE = JSON.parse(
    fs.readFileSync(path.join(CHEM, 'render-fidelity-baseline.json'), 'utf8')
  );
  const BASELINE_CH12 = REAL_BASELINE.chapters['12'];

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
    expect(r.findings[0].kind).toBe('baseline-incomplete');
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

  /**
   * 🔴 BUILT BY THE REAL PRODUCER, not by an object literal — this is the repair for the
   * defect that let K3 ship unable to read its own artifact. `recordRename` is what writes
   * every committed map, and it keys `renames` by the OLD track-relative path with values
   * `{to, moduleId, recordedAt}`. The first draft hand-wrote an ARRAY here, the check was
   * written to match the fixture, and the two agreed with each other while both disagreed
   * with the producer — green through 39 tests. → §C82 L93.
   */
  const mapWith = (...renames) => {
    const m = readSlugMap('/nonexistent-so-this-is-a-fresh-empty-map', {
      book: 'efnafraedi-2e',
      track: 'mt-preview',
    });
    for (const r of renames) recordRename(m, { ...r, recordedAt: '2026-08-18' });
    return m;
  };
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
      slugMap: mapWith({
        from: 'chapters/10/10-5-old.html',
        to: 'chapters/10/10-5-new.html',
        moduleId: 'm68770',
      }),
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
      slugMap: mapWith({
        from: 'chapters/10/x.html',
        to: 'chapters/10/10-5-other.html',
        moduleId: 'm68770',
      }),
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
  });

  it('ignores a `to === from` entry — a re-render is not a rename', async () => {
    // CLAUDE.md's §C9 contract. Such an entry must not account for a real rename.
    // ⚠️ THIS IS THE ONE FIXTURE HERE THAT IS DELIBERATELY *NOT* PRODUCER-BUILT, AND THE
    // REASON IS THE POINT: `recordRename` refuses `from === to` outright (`if (from === to)
    // return map;`), so the producer CANNOT emit a degenerate entry. It can only arrive
    // from a hand-edited or corrupted map — which is exactly the state this guard exists
    // for, and exactly why it needs a hand-built fixture. The positive control below proves
    // the producer's refusal rather than assuming it.
    const producerRefused = mapWith({
      from: 'chapters/10/10-5-new.html',
      to: 'chapters/10/10-5-new.html',
      moduleId: 'm68770',
    });
    expect(Object.keys(producerRefused.renames)).toHaveLength(0);

    const r = await runCheck(K3, {
      ...base,
      publishedBefore: snap([['10-5-old.html', 'm68770']]),
      publishedAfter: snap([['10-5-new.html', 'm68770']]),
      slugMap: {
        book: 'efnafraedi-2e',
        track: 'mt-preview',
        renames: {
          'chapters/10/10-5-new.html': {
            to: 'chapters/10/10-5-new.html',
            moduleId: 'm68770',
            recordedAt: '2026-08-18',
          },
        },
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
      slugMap: { book: 'efnafraedi-2e', track: 'faithful', renames: {} },
    });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('faithful');
  });
});

describe('the fix round — every defect the blind review confirmed, pinned', () => {
  const base = { book: 'efnafraedi-2e', track: 'mt-preview', chapter: '10' };
  const snap = (pairs) => new Map(pairs);

  it('K3 reads the producer OBJECT shape — the false halt that shipped through 39 green tests', async () => {
    // §C82 L93. The whole accounting branch was unreachable: `renames` is an object keyed
    // by `from`, the code required an array, so every correctly-recorded rename read as
    // unaccounted on a BLOCKING check. Built here by the real producer so the fixture
    // cannot drift back.
    const m = readSlugMap('/nonexistent', { book: 'efnafraedi-2e', track: 'mt-preview' });
    recordRename(m, {
      from: 'chapters/10/a.html',
      to: 'chapters/10/b.html',
      moduleId: 'm1',
      recordedAt: '2026-08-18',
    });
    expect(Array.isArray(m.renames)).toBe(false); // the shape the first draft assumed
    const r = await runCheck(K3, {
      ...base,
      publishedBefore: snap([['a.html', 'm1']]),
      publishedAfter: snap([['b.html', 'm1']]),
      slugMap: m,
    });
    expect(r.verdict).toBe(VERDICT.PASS);
  });

  it('K3 refuses a malformed `renames` rather than reading it as an empty map', async () => {
    for (const bad of [[], 'x', 3, null]) {
      const r = await runCheck(K3, {
        ...base,
        publishedBefore: snap([['a.html', 'm1']]),
        publishedAfter: snap([['a.html', 'm1']]),
        slugMap: { book: 'efnafraedi-2e', track: 'mt-preview', renames: bad },
      });
      expect(r.verdict, `renames=${JSON.stringify(bad)}`).toBe(VERDICT.SKIPPED);
    }
  });

  it('🔴 K3 reports a FAILED PRUNE — the duplicate page §C9 exists to eliminate', async () => {
    // §C82 L94①. The old loop hit `newFiles.includes(oldFile)` first — the old name is
    // still on disk, so it read as "not a rename" — and certified the chapter with no map.
    const r = await runCheck(K3, {
      ...base,
      publishedBefore: snap([['10-5-old.html', 'm68770']]),
      publishedAfter: snap([
        ['10-5-old.html', 'm68770'],
        ['10-5-new.html', 'm68770'],
      ]),
      slugMap: null,
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.map((f) => f.kind)).toContain('module-in-multiple-files');
  });

  it('K3 binds the rename on BOTH ends — an entry with the right destination is not enough', async () => {
    // §C82 L94②. The redirect vefur serves is keyed on the OLD path, so the entry that must
    // exist is precisely the one a `(moduleId, to)` binding never checked for.
    const m = readSlugMap('/nonexistent', { book: 'efnafraedi-2e', track: 'mt-preview' });
    recordRename(m, {
      from: 'chapters/10/SOMETHING-ELSE.html',
      to: 'chapters/10/10-5-new.html',
      moduleId: 'm68770',
      recordedAt: '2026-08-18',
    });
    const r = await runCheck(K3, {
      ...base,
      publishedBefore: snap([['10-5-old.html', 'm68770']]),
      publishedAfter: snap([['10-5-new.html', 'm68770']]),
      slugMap: m,
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings[0].kind).toBe('unaccounted-rename');
  });

  it('🔴 K3s track guard fails CLOSED when ctx.track is absent', async () => {
    // §C82 L94③, found twice: once as a finding, once as a SURVIVING MUTANT whose removal
    // was the safer direction. The old `ctx?.track &&` conjunct short-circuited, routing a
    // track-mismatched map to the permissive branch on a blocking check.
    const r = await runCheck(K3, {
      book: 'efnafraedi-2e',
      chapter: '10', // no `track`
      publishedBefore: snap([['10-5-old.html', 'm68770']]),
      publishedAfter: snap([['10-5-new.html', 'm68770']]),
      slugMap: { book: 'efnafraedi-2e', track: 'faithful', renames: {} },
    });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
  });

  it('🔴 the both-sides guard checks CONTENT, not array length', async () => {
    // §C82 L95. `readChapterFromDisk` returns [''] for a zero-byte file, and the length-only
    // guard let BOTH BLOCKING checks PASS with a healthy-looking `examined`.
    for (const check of [K1, K2, K4, K5]) {
      const r = await runCheck(check, {
        ...base,
        chapter: '4',
        knownIntentionalImageDrops: 0,
        renderBaseline: null,
        chapterInputs: { cnxml: [''], html: ['', '   '] },
      });
      expect(r.verdict, check.id).toBe(VERDICT.SKIPPED);
      expect(r.examined, check.id).toBe(0);
    }
  });

  it('the ctx shape guard is pinned — deleting it used to leave the suite green', async () => {
    const r = await runCheck(K2, { ...base, chapterInputs: { cnxml: 'not-an-array', html: [] } });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('readChapterFromDisk');
  });

  it('numericDrops refuses a NON-INTEGER, not merely a missing key', async () => {
    // The only thing stopping a CLI-parsed string or a float from silently disabling K2's
    // image invariant — and no test fed it one.
    for (const bad of ['1', 1.5, -1, null, {}]) {
      const r = await runCheck(K2, ctxFor('appendices', { knownIntentionalImageDrops: bad }));
      expect(r.verdict, JSON.stringify(bad)).toBe(VERDICT.SKIPPED);
    }
  });

  it('🔴 K5 no longer SKIPs over a value that cannot change its verdict', async () => {
    // §C82 L96②. K5 filters `raw-cnxml-leak`, computed from the HTML alone, so demanding
    // `knownIntentionalImageDrops` converted an irrelevant absent key into a blocking halt.
    const r = await runCheck(K5, {
      ...base,
      chapter: '4',
      chapterInputs: inputsFor(4), // no knownIntentionalImageDrops at all
    });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(inputsFor(4).html.length);
  });

  it('K1 is unaffected by knownIntentionalImageDrops, in either direction', async () => {
    // The ctx contract used to advertise K1 as a consumer. Measured on the specialModules
    // cell itself, where K2 swings SKIPPED/FAIL/PASS on the same inputs.
    // 🔴 `renderBaseline: null` USED TO BE PASSED HERE, WHICH SHORT-CIRCUITED K1 AT ITS
    // no-baseline GUARD — so all four arms returned SKIPPED without ever reaching
    // `checkChapter`, and the test was identical against the pre-fix K1 it was written to
    // pin. A real baseline is what makes the drift computation run.
    const results = [];
    for (const drops of [undefined, 0, 1, 7]) {
      const r = await runCheck(
        K1,
        ctxFor('appendices', {
          knownIntentionalImageDrops: drops,
          renderBaseline: REAL_BASELINE_APP(),
        })
      );
      results.push(r);
    }
    // The verdict AND the findings must be identical across all four — a verdict-only
    // assertion would pass for a K1 whose findings changed with the option.
    expect(new Set(results.map((r) => r.verdict)).size).toBe(1);
    expect(results[0].verdict).not.toBe(VERDICT.SKIPPED); // it really reached the comparison
    expect(new Set(results.map((r) => JSON.stringify(r.findings))).size).toBe(1);
  });

  it('🔴 K1 refuses a SPARSE histogram, not only a fully empty one', async () => {
    // The module used to claim `{}` was "the ONLY representation that produces FALSE
    // POSITIVES". Any sparse histogram does — and the branch's own K1 fixture was one.
    const full = REAL_BASELINE_CH12();
    const sparse = { em: full.em, 'div.equation': full['div.equation'] };
    const r = await runCheck(K1, ctxFor(12, { renderBaseline: sparse }));
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings[0].kind).toBe('baseline-incomplete');
    expect(r.findings[0].missing.length).toBe(14);
  });

  it('K1 and K4 can return PASS — neither had a single passing fixture', async () => {
    // An always-alarming constant survived both. K4's advisory->blocking promotion is
    // scheduled on a re-measured rate a broken PASS path would compute as 100%.
    // 🔴 THIS ASSERTION USED TO ACCEPT WARN, AND ITS FIXTURE RETURNS WARN — so it bound
    // nothing for K1 and an always-WARN K1 survived it. The title claimed a passing fixture
    // and there was none. A baseline captured FROM this chapter's own current bytes is the
    // only construction that can make K1 pass, which is what makes it the right fixture:
    // zero drift by construction, so a WARN means the comparison itself is broken.
    const appInputs = inputsFor('appendices');
    const selfBaseline = appInputs.html.reduce(
      (acc, h) => addHistograms(acc, htmlShapeHistogram(h)),
      {}
    );
    const k1 = await runCheck(K1, ctxFor('appendices', { renderBaseline: selfBaseline }));
    expect(k1.verdict).toBe(VERDICT.PASS);
    expect(k1.findings).toHaveLength(0);
    const k4 = await runCheck(K4, ctxFor(1));
    expect(k4.verdict).toBe(VERDICT.PASS);
  });

  it('K1 filters to shape-drift only — pinned on the cell that emits a second type', async () => {
    // The same defect diagnosed for K2: on chemistry the filter had nothing to exclude.
    const micro = path.join(REPO_ROOT, 'books', 'orverufraedi');
    const inputs = readChapterFromDisk(micro, 5, 'mt-preview');
    const r = await runCheck(K1, {
      book: 'orverufraedi',
      track: 'mt-preview',
      chapter: '5',
      chapterInputs: inputs,
      renderBaseline: REAL_BASELINE_CH12(), // any full histogram; drift is expected
    });
    expect(r.findings.some((f) => f.type === 'raw-cnxml-leak')).toBe(false);
    expect(r.findings.every((f) => f.type === 'shape-drift')).toBe(true);
    expect(r.findings.length).toBeGreaterThan(0);
  });

  it('every content check keys `examined` to HTML files read — all four, not just K2', async () => {
    // §C82 L95: the test written to stop a constant covered one id of four.
    const n4 = inputsFor(4).html.length;
    const nApp = inputsFor('appendices').html.length;
    expect(n4).not.toBe(nApp); // a constant that happens to match would satisfy one alone
    for (const [check, extra] of [
      [K1, { renderBaseline: REAL_BASELINE_CH12() }],
      [K2, {}],
      [K4, {}],
      [K5, {}],
    ]) {
      const a = await runCheck(check, ctxFor(4, extra));
      const b = await runCheck(
        check,
        ctxFor('appendices', { ...extra, knownIntentionalImageDrops: 1 })
      );
      expect(a.examined, check.id).toBe(n4);
      expect(b.examined, check.id).toBe(nApp);
    }
  });

  it('K5 reports the leak COUNT, not the finding count capped at one', async () => {
    const micro = path.join(REPO_ROOT, 'books', 'orverufraedi');
    const r = await runCheck(K5, {
      book: 'orverufraedi',
      track: 'mt-preview',
      chapter: '5',
      chapterInputs: readChapterFromDisk(micro, 5, 'mt-preview'),
    });
    expect(r.findings).toHaveLength(1); // the producer pushes at most one
    // 🔴 THE VALUE, NOT THE SHAPE. A first draft asserted only the message PATTERN
    // (`/occurrence\(s\) across \d+ pattern\(s\)/`), and a mutant hard-coding the count to
    // 0 SURVIVED it — `0 occurrence(s) across 1 pattern(s)` matches that regex perfectly.
    // An assertion that names the thing without binding what distinguishes it pins nothing.
    const detail = r.findings[0].leaks;
    expect(detail.map((l) => l.pattern)).toEqual(['link']);
    expect(detail[0].count).toBe(1);
    expect(r.message).toContain('1 raw-CNXML occurrence(s) across 1 pattern(s) (link)');
  });

  it('K3 accepts a snapshot built by the REAL producer over a real published chapter', async () => {
    // 🔴 THIS TEST EXISTS BECAUSE THE FILE HEADER CLAIMED IT ALREADY DID. The header said
    // "`snapshotModuleIds` supplies K3's Maps"; the function was never imported and every
    // K3 fixture was a hand-written literal — which is precisely how K3 shipped unable to
    // read the producer's slug map. A claim of discipline is not the discipline. → §C82 L93.
    const dir = path.join(CHEM, '05-publication', 'mt-preview', 'chapters', '10');
    const before = snapshotModuleIds(dir);
    expect(before.size).toBeGreaterThan(0); // the producer really read something
    // Nothing moved between the two snapshots, so a clean chapter must read clean.
    const r = await runCheck(K3, { ...base, publishedBefore: before, publishedAfter: before });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(before.size);
    // And the population caveat the check reports rather than implying: id-less rollups are
    // outside it by design, so `examined` is smaller than the file count.
    const htmlCount = fs.readdirSync(dir).filter((f) => f.endsWith('.html')).length;
    expect(before.size).toBeLessThan(htmlCount);
  });

  it('K3 refuses an unknown track — TRACKS is consulted, not merely frozen', async () => {
    // 🔴 UNTIL THIS TEST, `TRACKS` WAS CONSUMED BY NOTHING: exported, frozen, pinned for
    // frozenness, and read by no production path — a constant that looks like policy and
    // enforces none, which is §C82 L3/L5's shape inverted. An unknown track means the
    // loader reached a directory path from an unvalidated flag.
    const r = await runCheck(K3, {
      book: 'efnafraedi-2e',
      track: 'MT-Preview', // right letters, wrong case — the near-miss L73 measured
      chapter: '10',
      publishedBefore: snap([['a.html', 'm1']]),
      publishedAfter: snap([['a.html', 'm1']]),
    });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('not a publication track');
  });

  it('K3 keeps BOTH files when one module occupies two pages — append, not overwrite', async () => {
    // `byModule`'s `if (!m.has(moduleId))` is what makes the value a list. Overwriting
    // instead would make a module that lost one of its two pages read as clean.
    const r = await runCheck(K3, {
      ...base,
      publishedBefore: snap([
        ['x-1.html', 'm1'],
        ['x-2.html', 'm1'],
      ]),
      publishedAfter: snap([['x-1.html', 'm1']]),
      slugMap: null,
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.map((f) => f.kind)).toContain('unaccounted-rename');
    expect(r.examined).toBe(2); // both pages were in the population
  });

  it('K2 discloses the margin a PASS is sitting on, and stays silent when there is none', async () => {
    // The `>=` is correct and must not be tightened — rollups legitimately re-present
    // equations — so the answer to "how much damage could this PASS absorb?" is disclosure.
    // ⚠️ THE FIXTURE IS ch6, AND FINDING IT REQUIRED RE-MEASURING A RELAYED CLAIM. The
    // review reported "2 of 26 cells" carry a margin exceeding the whole CNXML population;
    // re-measured here, **4 of 26 carry ANY positive margin** — chemistry/mt-preview ch6
    // (math +6), chemistry/faithful ch1 (math +73 over a CNXML population of ZERO) and ch3
    // (math +23), organic/mt-preview ch3 (image +117 over 80) — and the reviewer's 2 are
    // the subset where it exceeds the population. Both numbers are right about different
    // things; the denominator is what separates them. **Chemistry appendices, the obvious
    // fixture, has NO positive margin at all** (math 504→504, image 36→35), which is why
    // the first draft of this test failed.
    const withMargin = await runCheck(K2, ctxFor(6));
    expect(withMargin.verdict).toBe(VERDICT.PASS);
    expect(withMargin.message).toContain('PASS margin math +6');

    // The negative half: a clean cell with no surplus must not print a margin note at all,
    // or the disclosure becomes noise an operator learns to skip.
    const noMargin = await runCheck(K2, ctxFor(10));
    expect(noMargin.verdict).toBe(VERDICT.PASS);
    expect(noMargin.message).not.toContain('PASS margin');
  });

  it('the second pass — `examined` counts files with CONTENT, not array entries', async () => {
    // The first repair computed the content counts and then reported the CONTAINER count,
    // so 10 published files with 3 empty claimed `examined: 10`. No corpus cell has an
    // empty file, so this is synthetic by necessity — stated rather than hidden.
    const real = inputsFor(4);
    const padded = {
      cnxml: [...real.cnxml, '', '   '],
      html: [...real.html, '', '\n'],
    };
    const r = await runCheck(K2, {
      ...base,
      chapter: '4',
      knownIntentionalImageDrops: 0,
      chapterInputs: padded,
    });
    expect(r.examined).toBe(real.html.length); // NOT real.html.length + 2
  });

  it('the second pass — K1 refuses a full-key baseline whose VALUES are not numbers', async () => {
    // An eighth representation of "nothing", found in the repair for the seven: the guard
    // tested `b in baseline`, and `baseline[bucket] || 0` coerces null/undefined/'' to 0,
    // producing wholesale false drift through the very keys just validated.
    for (const bad of [null, undefined, 'zero', NaN, {}]) {
      const poisoned = Object.fromEntries(Object.keys(REAL_BASELINE_CH12()).map((k) => [k, bad]));
      const r = await runCheck(K1, ctxFor(12, { renderBaseline: poisoned }));
      expect(r.verdict, String(bad)).toBe(VERDICT.FAIL);
      expect(r.findings[0].kind, String(bad)).toBe('baseline-incomplete');
    }
  });

  it('the second pass — a slug-map entry cannot override its own key', async () => {
    // The fix round INTRODUCED this one: `{ from, ...(e || {}) }` let an entry VALUE
    // carrying `from` override the `Object.entries` KEY — and the key IS the §C9 contract,
    // the old path vefur keys its redirect on.
    const r = await runCheck(K3, {
      ...base,
      publishedBefore: snap([['10-5-old.html', 'm68770']]),
      publishedAfter: snap([['10-5-new.html', 'm68770']]),
      slugMap: {
        book: 'efnafraedi-2e',
        track: 'mt-preview',
        renames: {
          // The KEY is the real old path; the value lies about it.
          'chapters/10/10-5-old.html': {
            from: 'chapters/10/SOMETHING-ELSE.html',
            to: 'chapters/10/10-5-new.html',
            moduleId: 'm68770',
          },
        },
      },
    });
    expect(r.verdict).toBe(VERDICT.PASS); // the KEY wins, so the rename is accounted
  });

  it('the second pass — a failed prune is caught even when the module is NEW', async () => {
    // The first repair put this leg inside the `beforeByModule` loop, so a duplicate whose
    // module is absent from the before-snapshot — a module first published by this very
    // render, the commonest route to two pages — returned PASS with "0 unaccounted".
    const r = await runCheck(K3, {
      ...base,
      publishedBefore: snap([['keep.html', 'm-other']]),
      publishedAfter: snap([
        ['keep.html', 'm-other'],
        ['new-a.html', 'm-new'],
        ['new-b.html', 'm-new'],
      ]),
      slugMap: null,
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.map((f) => f.kind)).toContain('module-in-multiple-files');
  });

  it('the second pass — the margin note is RELABELLED on a FAIL, never captioned PASS', async () => {
    // Suppressing it would discard real information: when one unit drops, the surplus in
    // the other bounds how much loss that unit could be hiding.
    // 🔴 THE FIXTURE MUST FAIL **AND** CARRY A MARGIN, OR THE ASSERTION IS VACUOUS.
    // A first draft used chemistry ch4: it FAILs (math -6) but has NO positive margin in
    // either unit, so the clause is never appended and `not.toContain('PASS margin')` was
    // satisfied by its absence rather than by its relabelling — a mutant reverting the
    // label survived. No corpus cell both fails and carries a surplus, so this is synthetic
    // by necessity: math DROPS (2 -> 1) while image SURPLUSES (1 -> 3).
    const mixed = {
      cnxml: ['<m:math/><m:math/><image/>'],
      html: ['<mjx-container/><img/><img/><img/>'],
    };
    const r = await runCheck(K2, {
      ...base,
      chapter: '4',
      knownIntentionalImageDrops: 0,
      chapterInputs: mixed,
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.message).toContain('image +2'); // the surplus is still disclosed on a FAIL...
    expect(r.message).toContain('surplus'); // ...under the correct word
    expect(r.message).not.toContain('PASS margin');
  });

  it('the second pass — the margin note subtracts the intentional image drops', async () => {
    // `marginNote` re-derives the producer's image predicate; omitting the `- drops` term
    // re-derives one term short, which is worse than re-deriving it whole.
    const withDrops = await runCheck(K2, ctxFor('appendices', { knownIntentionalImageDrops: 5 }));
    const without = await runCheck(K2, ctxFor('appendices', { knownIntentionalImageDrops: 1 }));
    // Chemistry appendices is image 36 -> 35; allowing 5 makes the adjusted cnxml side 31,
    // so the html side now shows a surplus the note must disclose.
    expect(withDrops.message).toContain('image +');
    expect(without.message).not.toContain('image +');
  });

  it('the second pass — K5 sums OCCURRENCES, distinguishably from the pattern count', async () => {
    // 🔴 THE CORPUS FIXTURE CANNOT SEPARATE THEM: micro ch5 has count 1 across 1 pattern, so
    // `occurrences` and `detail.length` are the same number and a mutant collapsing the sum
    // to the pattern count survives. This is the §C82 L44③ shape again — a natural value of
    // 1 is also what a broken sum returns — and the only way out is a fixture where the two
    // differ, which the corpus does not contain. Synthetic by necessity, and said so.
    const html = [
      '<p>a</p><link document="m1">x</link><link document="m2">y</link>',
      '<p>b</p><link document="m3">z</link><emphasis>e</emphasis>',
    ];
    const r = await runCheck(K5, {
      ...base,
      chapter: '4',
      chapterInputs: { cnxml: ['<document/>'], html },
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    const detail = r.findings[0].leaks;
    const patterns = detail.length;
    const occurrences = detail.reduce((n, l) => n + l.count, 0);
    expect(occurrences).toBeGreaterThan(patterns); // the two are now separable
    expect(r.message).toContain(
      `${occurrences} raw-CNXML occurrence(s) across ${patterns} pattern(s)`
    );
  });

  it('K4 carries the skeletons an operator needs, not just a count', async () => {
    const r = await runCheck(K4, ctxFor(4));
    expect(r.findings[0].lostCount).toBe(6);
    expect(r.findings[0].lostSkeletons.length).toBeGreaterThan(0);
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
