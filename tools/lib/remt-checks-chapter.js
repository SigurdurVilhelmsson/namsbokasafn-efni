/**
 * remt-checks-chapter.js — Tier 4 of the §C82 battery: K1-K5.
 *
 * Tier 4 is PER CHAPTER, POST-RENDER. It is the first tier whose unit is not a module,
 * and that is not a convenience: `tools/cnxml-render-fidelity-check.js`'s own header says
 * "the chapter is the closed reconciliation unit" — rollup pages (summary, answer-key,
 * exercises) re-present content from several modules, so a per-module count of anything
 * that survives into `05-publication` is wrong by construction.
 *
 * ══ TIER 3's FINDING APPLIES HERE TOO, AND HARDER ═════════════════════════════════
 * 🔴 EVERY TIER-4 INPUT IS AN OUTPUT OF THE PIPELINE THIS TIER JUDGES — `03-translated`,
 * `05-publication`, and `render-fidelity-baseline.json`, which is itself captured FROM a
 * render. Measured vintages:
 *
 *   input                              vintage       producer's vintage
 *   05-publication chemistry           2026-07-10    renderer last written 2026-08-23
 *   05-publication organic             2026-07-17    (~24 commits later, several
 *   render-fidelity-baseline chemistry 2026-07-10     changing ID emission)
 *   render-fidelity-baseline organic   2026-08-23    ← NEWER than the render it judges
 *
 * ⚠️ THAT LAST ROW MAKES ORGANIC'S K1 ZERO TAUTOLOGICAL. Its baseline was captured from
 * the exact bytes it is compared against, so `0 findings` is not evidence of cleanliness.
 * Report it as inert, never as clean. → §C82 L89.
 *
 * ══ WHAT THIS MODULE WRAPS, AND THE TRAP IN WRAPPING IT ══════════════════════════
 * `cnxml-render-fidelity-check.js` exports six pure functions. `checkChapter` computes
 * FOUR finding types in one pass and `main()` appends a FIFTH from a function
 * `checkChapter` never calls. One id per judgement, so that each carries its own version
 * stamp and its own base rate:
 *
 *   id  finding type        source                blocking  base rate (denominator below)
 *   K1  shape-drift         checkChapter §3       no        3 of 14 evaluable cells (21%)
 *   K2  cross-stage-drop    checkChapter §2       YES       1 of 26 (3.8%)
 *   K3  (slug map)          this file             YES       0 of 4 — SKIPPED, see K3
 *   K4  genuine-math-drop   identityDiffChapter   no        1 of 26 (3.8%)
 *   K5  raw-cnxml-leak      checkChapter §1b      YES       0 of 278 run-target files
 *                                                            (1 of 334 corpus-wide)
 *
 * 🔴 K4 AND K5 ARE DELIBERATE SCOPE EXPANSIONS, RECORDED RATHER THAN FOLDED IN SILENTLY
 * (the shape §C82 L68 established). The spec sizes this tier at three ids and names only
 * K1/K2/K3. The two extra detectors already EXIST and already run — a `f.type === …`
 * filter would have computed them and thrown their verdicts away, which is §C82 L3/L5's
 * "a gate that is never called" one layer over: the gate IS called, and its verdict is
 * discarded. Giving each an id also avoids double-reporting: K2 and K4 both fire on
 * chemistry ch4 with the SAME magnitude (6 equations), found two independent ways, and
 * one id covering both would put two judgements under one version stamp.
 *
 * ⚠️ THE FOURTH TYPE, `control-char`, IS DELIBERATELY *NOT* GIVEN AN ID — and the reason
 * is the spec's own rule, not taste. Global Constraint 4 forbids blocking without a
 * known-bad fixture, and there is none anywhere: 0 of 334 published HTML files, 0 of 191
 * `03-translated` CNXML, 0 of 1,192 read-only source CNXML across all five books, 0 of 476
 * `02-mt-output` files — ~2,193 files, zero everywhere, with a planted-NUL positive control
 * confirming the detector fires. It is also already enforced upstream. Logged as a gap in
 * the register rather than shipped as a check that can never fail. → §C82 L91.
 *
 * ══ THE MEASUREMENT THAT DECIDES K2's BLOCKING FLAG ══════════════════════════════
 * 🔴 `computeIntentionalImageDrops` IS NOT EXPORTED, AND K2 IS BLOCKING. `checkChapter`
 * subtracts a book's deliberately-absent images only if the CALLER passes
 * `options.knownIntentionalImageDrops`; the function that computes it from
 * `book-config.json` `specialModules` is module-local. Measured:
 *
 *   checkChapter(readChapterFromDisk('books/efnafraedi-2e','appendices','mt-preview'), null, {})
 *     -> [{type:'cross-stage-drop', unit:'image', cnxml:36, html:35, dropped:1}]
 *   ...the same call with {knownIntentionalImageDrops: 1}
 *     -> []
 *
 * The discriminator is chemistry's `specialModules {"m68859":"periodic-table"}` — that
 * module lives in appendices — against organic's `{}`. ▶ SO A WRAPPER TESTED ONLY AGAINST
 * ORGANIC PASSES AND STILL SHIPS THE FALSE POSITIVE FOR CHEMISTRY. And the arithmetic is
 * not cosmetic: uncorrected, K2 fires on 2 of 26 evaluable cells (7.7%) instead of 1
 * (3.8%) — **the wrong side of Global Constraint 4's ~5% bar.** The blocking designation
 * depends on the caller getting this option right, which is why `ctx.knownIntentionalImageDrops`
 * is REQUIRED rather than defaulted to 0. → §C82 L88.
 *
 * ══ THE `examined` UNIT — ONE UNIT FOR K1/K2/K4/K5, ON PURPOSE ═══════════════════
 * All four count PUBLISHED HTML FILES READ. Three reasons, in order of weight:
 *  1. It is content, not a leg count — `runCheck`'s `PASS + examined 0 -> SKIPPED` rule is
 *     the only backstop for a gate handed an empty ctx, and it fires only if `examined`
 *     tracks what was actually read (§C82 L6).
 *  2. It is zero exactly when nothing was rendered, which is precisely when none of the
 *     four can judge. No other candidate has that property: shape BUCKETS are >=1 whenever
 *     a baseline exists, and FINDINGS are zero on a healthy chapter.
 *  3. 🔴 IT AVOIDS RE-DERIVING A PREDICATE. K4's natural unit — equations compared — would
 *     need a count of `<m:math>` elements, and `mathSkeletons` (the real predicate, which
 *     requires a matching CLOSE tag) is NOT exported. Counting `<m:math` with a regex is a
 *     DIFFERENT predicate, and §C82 L69 is exactly that mistake: a re-derived unit that was
 *     wrong by 3.5x and reported a coverage number smaller than the count of things found
 *     inside it. Sub-counts are REPORTED in `message` instead (§C82 L76's precedent).
 *
 * ⚠️ K3's unit is different and must be: published files carrying a `data-module-id` —
 * 240 of 334 today, because `snapshotModuleIds` omits id-less files by design. See K3.
 *
 * ══ WHAT A SWEEP RUN TODAY MUST SHOW — AND MUST NOT "FIX" ════════════════════════
 * 🔴 TASK 13 WILL SEE `--tier 4` EXIT 1 ON EVERY BOOK x TRACK, AND THAT IS THE CORRECT
 * READING. Two blocking checks are structurally SKIPPED against today's tree:
 *   K3  no before-snapshot artifact exists anywhere in the repo, tracked or untracked
 *   K2  86 of 112 cells have no published HTML at all
 * `runTier` counts SKIPPED on a blocking check as a blocking failure, deliberately: a gate
 * that supplied no evidence must not let a paid module through. ▶ **Do not make either
 * advisory, and do not let K3 PASS on an absent snapshot** — a PASS from an absent snapshot
 * is exactly the false-clean the check exists to prevent. This is the same shape Task 13
 * already prescribes for A2(a)/A4/A8. → §C82 L92.
 *
 * ⚠️ DENOMINATORS, STATED ONCE SO EVERY RATE ABOVE IS READABLE. A "cell" is
 * book x track x chapter-dir, chapter-dirs read with the tool's own `discoverChapters`
 * predicate (`/^ch\d+$/` or `appendices`): chemistry 23, organic 33, x 2 tracks = **112**.
 * **26** of those have >=1 published HTML file and are the population anything can judge —
 * chemistry/mt-preview 23 of 23, chemistry/faithful 2 of 23, organic/mt-preview 1 of 33,
 * organic/faithful 0 of 33 (**the track directory does not exist**). K1's population is
 * smaller again — **14** cells that have BOTH html and a baseline entry.
 *
 * ⚠️ A THIRD CHAPTER-KEY CONVENTION LIVES IN THIS TIER'S INPUTS. CLAUDE.md documents two
 * (source dirs `chNN`, publication dirs bare `NN`). The baseline's `chapters` keys are a
 * third: UNPADDED numeric strings — organic's key is `"3"` while its publication directory
 * is `"03"`. The loader owns that mapping; a gate handed the wrong key silently reads
 * "no baseline" and reports SKIPPED, which looks exactly like the expected inert state.
 */
import { defineCheck, registerChecks, VERDICT } from './remt-battery.js';
import { checkChapter, identityDiffChapter } from '../cnxml-render-fidelity-check.js';

/** Tracks whose publication trees this tier may be pointed at. Frozen ARRAY, not Set. */
// ⚠️ A FROZEN ARRAY, DELIBERATELY — `Object.freeze(new Set(...))` DOES NOT FREEZE A SET.
// `Object.isFrozen` returns true while `.add()` and `.delete()` both succeed (§C82 L82,
// where frozen sets held a blocking gate's FAIL-vs-WARN policy and advertised an
// immutability they did not provide). `TRACKS.push()` throws.
export const TRACKS = Object.freeze(['mt-preview', 'faithful']);

/**
 * The shared preamble every content check needs: is there anything to judge?
 *
 * 🔴 BOTH SIDES ARE REQUIRED, AND THAT IS THE POINT. §C82 L78② measured the cost of a
 * one-sided guard: a source-only mutant reported **PASS examined 10 over an empty
 * translated document**. Here the same shape is a chapter whose CNXML exists and whose
 * render is missing (a failed render), or the reverse (a stale publication tree with the
 * injected CNXML deleted). Neither can be judged, and neither may read as clean.
 * ⚠️ Measured today: cells with cnxml>0 and html==0 = **0 of 112**, against 26 carrying
 * both — so this guard has no natural fixture and its test is synthetic by necessity.
 *
 * @param {object} ctx
 * @param {string} id  the check id, for the message
 * @returns {{cnxml: string[], html: string[]}|{skip: object}}
 */
function chapterContent(ctx, id) {
  const inputs = ctx?.chapterInputs;
  if (!inputs || !Array.isArray(inputs.cnxml) || !Array.isArray(inputs.html)) {
    return {
      skip: {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message:
          `${id}: ctx.chapterInputs must be readChapterFromDisk()'s return ` +
          `({cnxml: string[], html: string[]}) — gates are pure, so the loader reads the tree`,
      },
    };
  }
  if (inputs.html.length === 0 || inputs.cnxml.length === 0) {
    return {
      skip: {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message:
          `${id}: nothing to compare — ${inputs.cnxml.length} injected CNXML file(s), ` +
          `${inputs.html.length} published HTML file(s). Both sides are required; a chapter ` +
          `rendered on one side only cannot be judged and must not read as clean`,
      },
    };
  }
  return inputs;
}

/**
 * K1 — the published shape drifted from the committed per-book baseline.
 *
 * ══ WARN, AND THE RATE IS WHY ════════════════════════════════════════════════════
 * 3 of 14 evaluable cells drift (21%), 9 findings — all chemistry/mt-preview: ch12 (6),
 * ch20 (1), appendices (2). Far over Global Constraint 4's ~5% bar, so it cannot block.
 * The spec independently rules it WARN ("inert without a baseline"), and both reasons hold.
 *
 * ══ "NO BASELINE" MUST PRINT AS SKIPPED, NEVER AS CLEAN — AND THERE ARE SEVEN WAYS ══
 * 🔴 The spec calls this out for K1 by name, because the tool prints `Total findings: 0`
 * for a chapter it never compared. §C21/§C82 L57's "a gate keyed on one representation of
 * nothing is walked past by another" has a FOURTH instance here, and it is the worst yet —
 * `fidelityAllowlist` had three representations, the baseline has seven. Measured one at a
 * time against a real 12-file chapter:
 *
 *   R1  file missing                  -> loadBaseline null       -> silent skip, 0 findings
 *   R2  file present, no `chapters`   -> ternary short-circuits  -> silent skip
 *   R3  `chapters` ok, chapter absent -> undefined               -> silent skip
 *                                        ⚠️ THE COMMONEST STATE: 84 of 112 cells,
 *                                           12 of them with real HTML
 *   R4  chapter present but `{}`      -> 🔴 `{}` IS TRUTHY, so the drift loop runs over
 *                                        every ACTUAL bucket against `baseline[b] || 0`.
 *                                        Measured on chemistry ch10: **16 findings, every
 *                                        one `expected: 0`.** The ONLY representation that
 *                                        produces FALSE POSITIVES. Corpus count today:
 *                                        0 of 28 entries — latent, not live.
 *   R5  malformed JSON                -> bare `JSON.parse` THROWS UNCAUGHT. Different
 *                                        severity from every other row: it kills the RUN,
 *                                        not one chapter.
 *   R6  the four bytes `null`         -> parses, returns null -> silent skip.
 *                                        The §C21 glossary type-collision verbatim.
 *   R7  `chapters` present, not an object.
 *
 * ▶ SO THE LOADER MUST BE TRI-STATE and K1 must return SKIPPED **explicitly**, with the
 * cause in `message`. 🔴 IT CANNOT LEAN ON `runCheck`'s `PASS + examined 0 -> SKIPPED`
 * DOWNGRADE: `examined` is html files read, which is non-zero in ALL SEVEN, so the
 * battery's standard backstop is silent here. That is the whole reason this check does its
 * own three-way classification instead of trusting the contract.
 * ⚠️ AND THE TWO SKIPPED CAUSES ARE KEPT SEPARABLE IN THE MESSAGE — "no baseline" is the
 * EXPECTED inert state on 10 of 23 chemistry chapters and 32 of 33 organic ones, while
 * "nothing rendered" means the render never happened. Collapsing them would make a
 * post-run sweep unable to tell expected inertness from a failed render.
 */
export const K1 = defineCheck({
  id: 'K1',
  tier: 4,
  blocking: false,
  version: 1,
  run: (ctx) => {
    const content = chapterContent(ctx, 'K1');
    if (content.skip) return content.skip;

    const baseline = ctx?.renderBaseline;
    // Three-way, not two-way. `undefined` means the loader never set the key at all, which
    // is a loader defect; `null` is the loader SAYING there is no baseline for this
    // chapter, which is the expected inert state on 84 of 112 cells.
    if (baseline === undefined) {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message:
          'K1: ctx.renderBaseline was never set. Load it tri-state — the PARSED per-chapter ' +
          'histogram, or `null` when this chapter has none. A loader that returns a bare ' +
          '{} for a missing entry manufactures 16 false shape-drift findings (all ' +
          '`expected: 0`); one that lets JSON.parse throw kills the whole run',
      };
    }
    if (baseline === null) {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message:
          `K1: no committed baseline for this chapter — shape-drift not judged. This is the ` +
          `EXPECTED state for chemistry ch0-ch9 (10 of 23) and 32 of organic's 33 chapters; ` +
          `it is NOT the same as "nothing rendered", which reports its own message`,
      };
    }
    if (typeof baseline !== 'object' || Array.isArray(baseline)) {
      return {
        verdict: VERDICT.FAIL,
        examined: content.html.length,
        findings: [{ kind: 'baseline-malformed', got: typeof baseline }],
        message: `K1: ctx.renderBaseline is ${typeof baseline}, not a bucket histogram or null`,
      };
    }
    // 🔴 R4, AND IT IS A FINDING RATHER THAN A SKIP. An empty histogram is TRUTHY, so
    // `checkChapter` would happily compare every actual bucket against 0 and report the
    // whole chapter as drift. Refusing it here is what stops 16 false positives; calling it
    // SKIPPED instead would hide a producer defect behind the expected inert state.
    if (Object.keys(baseline).length === 0) {
      return {
        verdict: VERDICT.FAIL,
        examined: content.html.length,
        findings: [{ kind: 'baseline-vacuous' }],
        message:
          'K1: the baseline entry for this chapter is an EMPTY histogram. That is not ' +
          '"no baseline" — it compares every rendered bucket against 0 and reports the ' +
          'entire chapter as drift (measured: 16 findings on chemistry ch10)',
      };
    }

    const drift = checkChapter(content, baseline, {
      knownIntentionalImageDrops: numericDrops(ctx),
    }).filter((f) => f.type === 'shape-drift');

    return {
      verdict: drift.length ? VERDICT.WARN : VERDICT.PASS,
      examined: content.html.length,
      findings: drift,
      message:
        `${drift.length} shape-drift finding(s) over ${content.html.length} published ` +
        `HTML file(s), against a ${Object.keys(baseline).length}-bucket baseline`,
    };
  },
});

/**
 * The `knownIntentionalImageDrops` accessor, shared by every check that calls
 * `checkChapter` — because the option is what separates a real image drop from a book's
 * declared `specialModules`, and the function that computes it is not exported (§C82 L88).
 *
 * ⚠️ IT IS REQUIRED, NOT DEFAULTED. Returning 0 for an absent key would be the permissive
 * branch, and the permissive branch here manufactures a false positive on a BLOCKING check
 * — chemistry appendices, `{unit:'image', dropped:1}`, from `m68859` the periodic table.
 * `NaN` propagates through the caller's guard rather than silently becoming 0.
 *
 * @param {object} ctx
 * @returns {number} NaN when the key is missing or not a count
 */
function numericDrops(ctx) {
  const n = ctx?.knownIntentionalImageDrops;
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

/** The shared refusal for a missing `knownIntentionalImageDrops`. */
function dropsRefusal(id, examined) {
  return {
    verdict: VERDICT.SKIPPED,
    examined: 0,
    findings: [],
    message:
      `${id}: ctx.knownIntentionalImageDrops must be a non-negative integer — the count of ` +
      `images this book deliberately omits (book-config.json specialModules). It is NOT ` +
      `defaulted to 0: computeIntentionalImageDrops is module-local, and omitting the ` +
      `option reports chemistry appendices as an image drop (m68859, the periodic table), ` +
      `doubling this tier's measured rate from 3.8% to 7.7% — across the ~5% blocking bar` +
      (examined ? ` (${examined} HTML file(s) went unjudged)` : ''),
  };
}

/**
 * K2 — element/math counts DROPPED between `03-translated` and `05-publication`.
 *
 * ══ BLOCKING, AND THE RATE ONLY CLEARS THE BAR IF THE CALLER IS CORRECT ══════════
 * 1 of 26 evaluable cells (3.8%) — chemistry/mt-preview ch4, `math 381 -> 375, dropped 6`.
 * Uncorrected for `specialModules` it is 2 of 26 (7.7%), which would disqualify it. See the
 * header's L88 block; this is why `numericDrops` refuses rather than defaults.
 *
 * Known-bad fixture (the spec's own, §C64): physics ch04, 554 `<m:math>` -> 546, dropped 8.
 * It is out of the run scope, so BOTH denominators are stated wherever the rate is quoted:
 * 1 of 26 over the two run-target books, 2 of 31 over every book with published HTML.
 *
 * ⚠️ A DROP IS UNAMBIGUOUS AND AN EXCESS IS NOT — the invariant is `>=`, not `===`, because
 * rollup pages legitimately re-present the same equation. Do not "tighten" it.
 */
export const K2 = defineCheck({
  id: 'K2',
  tier: 4,
  blocking: true,
  version: 1,
  run: (ctx) => {
    const content = chapterContent(ctx, 'K2');
    if (content.skip) return content.skip;
    const drops = numericDrops(ctx);
    if (Number.isNaN(drops)) return dropsRefusal('K2', content.html.length);

    const findings = checkChapter(content, null, {
      knownIntentionalImageDrops: drops,
    }).filter((f) => f.type === 'cross-stage-drop');

    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: content.html.length,
      findings,
      message:
        `${findings.length} cross-stage drop(s) over ${content.html.length} published HTML ` +
        `file(s) from ${content.cnxml.length} injected CNXML file(s)` +
        (drops ? `, allowing ${drops} intentional image drop(s)` : ''),
    };
  },
});

/**
 * K3 — every published-file rename is accounted for by the §C9 old->new slug map.
 *
 * ══ THE CONSTRAINT THAT SHAPES EVERYTHING: THE SNAPSHOT MUST PRECEDE THE RENDER ══
 * 🔴 The slug map is NOT regenerable. Entries are recorded once, at the moment a prune
 * happens, so a check that runs after the fact and finds an unaccounted rename is
 * reporting information that is already gone. That makes `ctx.publishedBefore` unlike
 * every other key in the battery's contract: its correctness is a property of WHEN it was
 * taken, and no pure gate can check that.
 *
 * ▶ MEASURED ON A SCRATCH FIXTURE, THREE ARMS:
 *     snapshot BEFORE      -> snapshotSize 2, pruned 1, map written with 1 entry
 *     snapshot AFTER       -> snapshotSize 2, pruned 0, NO map written
 *     snapshot key omitted -> identical to AFTER
 *   An after-render snapshot is by construction the inverse of `renderedModules`, so the
 *   computed rename set is EMPTY and the check reports a clean "zero renames, zero
 *   unaccounted" **on precisely the runs that destroyed the information**. Three different
 *   mistakes produce indistinguishable output.
 * ▶ AND `examined` DOES NOT SAVE IT — `snapshotSize` was 2 in BOTH arms, so the battery's
 *   one structural backstop is silent. The only `examined` that would trip is one keyed to
 *   renames DETECTED, which would then SKIP every genuinely clean chapter: unusable on a
 *   blocking check, and E4's measured ~70% false-halt trap (§C82 L17) in a new place.
 * ▶ NOTHING ON DISK WITNESSES VINTAGE. `writeSlugMap`'s payload is `{book, track, contract,
 *   renames}` — no run id, no sha, no timestamp. `recordedAt` is day-granular and exists
 *   only on entries that were written, and the write is skipped entirely when nothing was
 *   pruned — so absence of the file is also absence of evidence. mtimes are not a content
 *   property and the producer's own safety rule 3 forbids reasoning from them.
 * ▶ THEREFORE IT IS STATED AS A SEQUENCING OBLIGATION ON THE DRIVER, in the ctx contract,
 *   and this check refuses rather than guesses. → §C82 L92.
 *
 * ══ THE UNIT IS MODULE IDS, NOT FILENAMES — AND THE SPEC'S ROW IS WRONG ══════════
 * The spec reuses the runbook's `find -name '*.html'` instrument. A filename SET carries no
 * identity, so a rename is mathematically indistinguishable from "one page deleted + one
 * unrelated page added", and the producer's own safety rule matches **by module id alone,
 * never by name similarity and never by mtime**. The historical record proves it:
 * `books/_slug-maps/2026-08-12-c56-pilot-renames.json`, captured from exactly that filename
 * instrument, has keys `{book, chapter, track, old, new}` and **no `moduleId`** — so
 * backfilling those five renames required recovering the id from the surviving NEW page,
 * which works only while that page still exists. `tools/__tests__/slug-map-corpus.test.js`
 * already asserts the map's `moduleId` against the target's `data-module-id`, so a
 * filename-only snapshot cannot even produce a map satisfying the committed contract test.
 *
 * ⚠️ POPULATION, WHICH THIS CHECK REPORTS RATHER THAN LETTING `examined` IMPLY:
 * `snapshotModuleIds` omits files with no `data-module-id` BY DESIGN, so the unit is
 * "published files carrying a module id" — **240 of 334 today** (chemistry/mt-preview
 * 188 of 251, chemistry/faithful 8 of 14, organic/mt-preview 10 of 13). The 94 omitted are
 * compiled rollups whose names are the chapter number plus a fixed suffix and cannot
 * rename, so excluding them loses nothing — but a reader must not take `examined` for
 * coverage of all 334.
 *
 * ══ WHY THIS CHECK EXISTS AT ALL, IN ONE MEASUREMENT ═════════════════════════════
 * Only **1 of the 6 committed slug-map entries was producer-written**. The other five are
 * HAND BACKFILLS (`4958d14f`) for renames that happened with no map at all — the historical
 * instance of exactly the class K3 detects, recovered after the fact by a human.
 */
export const K3 = defineCheck({
  id: 'K3',
  tier: 4,
  blocking: true,
  version: 1,
  run: (ctx) => {
    const before = ctx?.publishedBefore;
    const after = ctx?.publishedAfter;
    // 🔴 `instanceof Map` IS DELIBERATE, AND IT IS NOT A TYPE-TEST-FOR-ITS-OWN-SAKE.
    // `snapshotModuleIds` returns a Map, and a Map cannot survive JSON — so requiring the
    // producer's own return value means the driver must snapshot IN PROCESS rather than
    // reconstruct one from a file written at an unknown time. That does not PROVE correct
    // sequencing (nothing can), but it removes the cheapest way to get it wrong.
    // ⚠️ And it is paired with a payload check below, because "it is a Map" is a claim
    // about the CONTAINER (§C82 L33/L35).
    if (!(before instanceof Map) || !(after instanceof Map)) {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message:
          'K3: ctx.publishedBefore and ctx.publishedAfter must both be snapshotModuleIds() ' +
          'Maps (filename -> moduleId), the BEFORE one taken before the render. No ' +
          'before-snapshot artifact exists in this repo, so SKIPPED is the expected verdict ' +
          'for every sweep run before the loop itself — and K3 is blocking, so it halts. ' +
          'That is correct: a gate that supplied no evidence must not certify a chapter',
      };
    }
    if (before.size === 0) {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message:
          'K3: the before-snapshot is empty. Either the chapter had no published pages ' +
          'carrying a module id, or the snapshot was taken against the wrong directory — ' +
          'and those are indistinguishable here, so no rename claim can be made',
      };
    }

    const renames = ctx?.slugMap && Array.isArray(ctx.slugMap.renames) ? ctx.slugMap.renames : [];
    // ⚠️ A map whose `track` disagrees with the chapter being judged is judging the wrong
    // tree. CLAUDE.md: vefur FLATTENS both tracks into one directory, which is why the
    // filename is track-qualified in the first place; a `faithful` map read while checking
    // `mt-preview` would silently account for renames that never happened here.
    if (ctx?.slugMap && ctx?.track && ctx.slugMap.track !== ctx.track) {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message:
          `K3: the slug map declares track ${JSON.stringify(ctx.slugMap.track)} while this ` +
          `chapter is on ${JSON.stringify(ctx.track)} — a map for another track is not ` +
          `evidence about this one`,
      };
    }

    // moduleId -> the filename(s) it occupied, on each side.
    const byModule = (snap) => {
      const m = new Map();
      for (const [file, moduleId] of snap) {
        if (!m.has(moduleId)) m.set(moduleId, []);
        m.get(moduleId).push(file);
      }
      return m;
    };
    const beforeByModule = byModule(before);
    const afterByModule = byModule(after);

    // ⚠️ `to === from` IS SKIPPED, per CLAUDE.md's §C9 contract — a re-render that writes
    // the same name is not a rename, and an entry recording one would point a redirect at
    // itself.
    const accounted = new Set(
      renames
        .filter((r) => r && r.from && r.to && r.from !== r.to)
        // Bound on BOTH the module id and the new file's basename. Matching on the
        // basename alone is a corpus coincidence (§C82 L74's lesson one field over);
        // matching on the module id alone would accept an entry describing a DIFFERENT
        // rename of the same module.
        // ⚠️ `JSON.stringify([a, b])` RATHER THAN A DELIMITED STRING, and not for taste:
        // the first draft joined the two with a separator character that turned out to be
        // a raw NUL byte, and NOTHING COULD SEE IT. All 38 tests passed — a NUL is a
        // perfectly functional Set-key separator, so behaviour was identical — and it was
        // found only because a mutation harness asserted its literal match site existed
        // and it did not. That is CLAUDE.md's NUL-byte rule arriving from the WRITING side
        // rather than the searching side: the file would have been committed carrying two
        // invisible bytes that make GNU grep classify it binary and report nothing for
        // strings it demonstrably contains. A structured key removes the separator
        // question entirely — no delimiter to get wrong, and no collision to reason about.
        .map((r) => JSON.stringify([r.moduleId, basename(r.to)]))
    );

    const findings = [];
    for (const [moduleId, oldFiles] of beforeByModule) {
      const newFiles = afterByModule.get(moduleId);
      if (!newFiles) {
        // The module left the tree entirely. That is a DELETION, not a rename, and the
        // slug map does not describe it — but it is reader-visible (every inbound link
        // 404s) and it is the one thing a module-id diff alone would report as nothing.
        findings.push({ kind: 'module-disappeared', moduleId, was: oldFiles });
        continue;
      }
      for (const oldFile of oldFiles) {
        if (newFiles.includes(oldFile)) continue; // same name survived — not a rename
        for (const newFile of newFiles) {
          if (accounted.has(JSON.stringify([moduleId, newFile]))) continue;
          findings.push({ kind: 'unaccounted-rename', moduleId, from: oldFile, to: newFile });
        }
      }
    }

    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: before.size,
      findings,
      message:
        `${before.size} published page(s) carrying a module id before the render, ` +
        `${after.size} after; ${renames.length} slug-map entr(ies); ` +
        `${findings.length} unaccounted. ⚠️ Pages with no data-module-id are outside this ` +
        `population by design (240 of 334 corpus-wide carry one)`,
    };
  },
});

/** Basename without pulling in `path` — these are always `/`-joined track-relative keys. */
function basename(p) {
  const i = String(p).lastIndexOf('/');
  return i < 0 ? String(p) : String(p).slice(i + 1);
}

/**
 * K4 — equations lost between `03-translated` and `05-publication`, by SKELETON.
 *
 * ══ WHY IT IS A SEPARATE CHECK FROM K2, AND NOT A LEG OF IT ══════════════════════
 * K2 counts `<m:math>` against `<mjx-container>`. K4 multiset-diffs the per-equation
 * MathML SKELETON, so it survives the rollup masking a count-based invariant suffers: a
 * chapter that loses one equation and re-presents another twice nets to zero for K2 and
 * still fails K4. It is the more sensitive detector of the two.
 *
 * 🔴 AND IT WAS AN ORPHAN. `identityDiffChapter` is called from `main()` and from NOWHERE
 * ELSE — `checkChapter` never reaches it — so wiring this tier the way the project's rules
 * mandate (import the pure function; `main()` console.logs a payload then `process.exit()`s,
 * which CLAUDE.md's truncation rule forbids consuming through a pipe) would have DROPPED
 * the most sensitive detector in the file. The battery referenced this tool nowhere before
 * this module (0 hits across all five battery files, 4,686 lines) and `genuine-math-drop`
 * appears nowhere in the spec. → §C82 L91.
 *
 * ══ ADVISORY, ON STATED REASONS — NOT BECAUSE THE RATE FAILS ═════════════════════
 * The rate would qualify: 1 of 26 kept-book cells (3.8%), under the ~5% bar, with a natural
 * known-bad fixture (physics ch04, `lostCount 15` — the spec's own §C64 case). It ships
 * ADVISORY anyway, for two reasons that are about the MEASUREMENT rather than the number,
 * the same pattern A5 and R1 ship on:
 *  1. Its only measurement is over a STALE vintage — chemistry's publication predates the
 *     renderer by ~24 commits — and this detector is strictly more sensitive than K2, so
 *     its rate on a FRESH render is unmeasured in the direction that matters.
 *  2. K2 already blocks on the same cell with the same magnitude (chemistry ch4, 6
 *     equations, found two independent ways). A second blocking check over the same
 *     failure buys no protection and doubles the false-halt surface.
 * ▶ RE-MEASURE AFTER THE RUN AND PROMOTE IF <=5%. That is the honest sequence, and it is
 * only sayable because the check exists to be measured.
 */
export const K4 = defineCheck({
  id: 'K4',
  tier: 4,
  blocking: false,
  version: 1,
  run: (ctx) => {
    const content = chapterContent(ctx, 'K4');
    if (content.skip) return content.skip;

    const { lostSkeletons, lostCount } = identityDiffChapter(content);
    const findings = lostCount
      ? [{ kind: 'genuine-math-drop', lostCount, lostSkeletons: lostSkeletons.slice(0, 20) }]
      : [];

    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: content.html.length,
      findings,
      message:
        `${lostCount} equation(s) lost by skeleton across ${content.html.length} published ` +
        `HTML file(s); ${lostSkeletons.length} distinct skeleton(s) affected`,
    };
  },
});

/**
 * K5 — raw CNXML markup survived into published HTML.
 *
 * ══ A SECOND DELIBERATE EXPANSION, AND THE RATE MAKES IT BLOCKING ════════════════
 * `findRawCnxmlLeaks` is computed by `checkChapter` and, before this module, consumed by
 * nothing that gates: `npm run fidelity:render` is wired into `validate.yml` with
 * `continue-on-error: true`, hard-coded to chemistry and to the default track, so organic
 * and the faithful track are reported nowhere at all.
 *
 * Rate, with BOTH denominators because the fixture and the run targets are different
 * populations: **0 of 278 published HTML files across the two run-target books**, and
 * **1 of 334 corpus-wide (0.30%)** — an order of magnitude under the ~5% bar.
 *
 * 🔴 THE ONE INSTANCE IS A VERIFIED TRUE POSITIVE, read at the bytes rather than inferred
 * from a count: `books/orverufraedi/05-publication/mt-preview/chapters/05/5-4-thorungar.html`
 * carries `<link document="m58797">Nonproteobacteria Gram-negative Bacteria and
 * Phototrophic Bacteria</link>` — raw CNXML holding UNTRANSLATED ENGLISH inside otherwise
 * Icelandic prose, which a browser renders as dead text. The same file's other `<link>` is
 * an ordinary stylesheet tag and is correctly NOT matched, so the attribute scoping is
 * demonstrably doing work. That is the same reader-visible severity argument the spec
 * already accepted for K2.
 *
 * ⚠️ THE PER-PATTERN SPLIT, STATED BECAUSE FOLDING THE TYPE IN IMPORTS ALL NINE:
 * `link` 1 of 334; `term`, `emphasis`, `entry`, `row`, `colspec`, `foreign`, `footnote`
 * and `newline` are **0 of 334 in both populations** — eight of the nine have never been
 * shown to fire on real corpus bytes. A blocking gate over an untested alternation is
 * §C82 L39's warning (mutation-test the predicate's BREADTH, not its presence); the eight
 * are carried because the detector is one function, and named here so nobody reads the
 * 0.30% as evidence about all nine.
 */
export const K5 = defineCheck({
  id: 'K5',
  tier: 4,
  blocking: true,
  version: 1,
  run: (ctx) => {
    const content = chapterContent(ctx, 'K5');
    if (content.skip) return content.skip;
    const drops = numericDrops(ctx);
    if (Number.isNaN(drops)) return dropsRefusal('K5', content.html.length);

    const findings = checkChapter(content, null, {
      knownIntentionalImageDrops: drops,
    }).filter((f) => f.type === 'raw-cnxml-leak');

    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: content.html.length,
      findings,
      message:
        `${findings.length} raw-CNXML leak(s) over ${content.html.length} published HTML ` +
        `file(s)`,
    };
  },
});

export const CHAPTER_CHECKS = [K1, K2, K3, K4, K5];

// A check that is never registered is a check that does not exist (§C82 L3/L5), and the
// ARRAY is not the same fact as the REGISTRATION (§C82 L71) — the test file pins this call's
// argument, not just the contents of the array above.
registerChecks(CHAPTER_CHECKS);
