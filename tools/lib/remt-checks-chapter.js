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
 *   input                              vintage        producer's vintage
 *   05-publication chemistry           SEE BELOW      renderer last written 2026-08-23
 *   05-publication organic             2026-07-17     (~24 commits later, several
 *   render-fidelity-baseline chemistry 2026-07-10      changing ID emission)
 *   render-fidelity-baseline organic   2026-08-23     ← NEWER than the render it judges
 *
 * ⚠️ "SEE BELOW" REPLACES A SINGLE DATE THAT WAS WRONG FOR MOST OF THE TREE. This row read
 * `2026-07-10`; measured per file, chemistry's published tree spans **16 distinct render
 * dates across 265 files, 2026-03-19 → 2026-08-18**. The single date holds for **ch4** —
 * the only cell K2 and K4 fire on, so their stated advisory reasoning survives intact — and
 * is wrong for three of the four cells this tier actually reads. ▶ **A tree does not have
 * a vintage; its FILES do.** Quote the vintage of the cell you measured, never the tree's.
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
 *                                                            (1 of 334 files = 1 of 31
 *                                                             CELLS, 3.2%, corpus-wide)
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
 * known-bad fixture, and there is none anywhere it has been looked for: **0 of 334 published
 * HTML files and 0 of 191 `03-translated` CNXML** — the two populations Tier 4 actually
 * reads, both re-confirmed by an independent reviewer — with a planted-NUL positive control
 * confirming the detector fires. Logged as a gap in the register rather than shipped as a
 * check that can never fail. → §C82 L91.
 * ⚠️ TWO SUPPORTING CLAIMS WERE WITHDRAWN RATHER THAN REPAIRED, because neither could be
 * reproduced: a "0 of 476 `02-mt-output` files" denominator, and "it is also already
 * enforced upstream" — the upstream guard that exists does not cover the render stage this
 * tier judges, so it was never an argument for giving the detector no id here. **The
 * conclusion stands on the two denominators above alone**, which is a narrower claim than
 * the paragraph used to make and is the one that survives measurement.
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
 *     🔴 THAT SENTENCE WAS FALSE UNTIL THE FIX ROUND, AND IT WAS FALSE IN THE DIRECTION
 *     THAT COSTS MONEY. `chapterContent` tested `.length === 0` only, so `{cnxml: [''],
 *     html: ['']}` — **exactly what `readChapterFromDisk` returns for a zero-byte file** —
 *     passed the guard and both BLOCKING checks returned PASS with a large `examined`.
 *     The guard now counts files with CONTENT, so the claim is true of the payload and not
 *     merely of the container. → §C82 L95.
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
import {
  checkChapter,
  htmlShapeHistogram,
  identityDiffChapter,
} from '../cnxml-render-fidelity-check.js';

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
  // 🔴 CONTENT, NOT CONTAINER — AND THE FIRST DRAFT CHECKED ONLY `.length`, WHICH IS THE
  // FALSE-CLEAN THIS FUNCTION'S OWN DOCSTRING CLAIMS TO PREVENT. `{cnxml: [''], html: ['']}`
  // passed the length test, and BOTH BLOCKING checks then returned PASS with a large,
  // healthy-looking `examined`. That is not hypothetical input: `readChapterFromDisk`
  // returns `['']` for a zero-byte file, and the same hole swallows a loader that hands
  // over file PATHS instead of file CONTENTS. `runCheck`'s `PASS + examined 0 -> SKIPPED`
  // backstop cannot fire, because `examined` is the array length and is non-zero.
  // ▶ THE CONTAINER IS NOT THE PAYLOAD, one level in from where that rule usually lands:
  // the array was validated and the strings inside it were not. → §C82 L95.
  const nonEmpty = (arr) => arr.filter((s) => typeof s === 'string' && s.trim() !== '').length;
  const cn = nonEmpty(inputs.cnxml);
  const ht = nonEmpty(inputs.html);
  if (cn === 0 || ht === 0) {
    return {
      skip: {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message:
          `${id}: nothing to compare — ${cn} of ${inputs.cnxml.length} injected CNXML ` +
          `file(s) and ${ht} of ${inputs.html.length} published HTML file(s) carry any ` +
          `content. Both sides are required; a chapter rendered on one side only, or read ` +
          `as empty strings, cannot be judged and must not read as clean`,
      },
    };
  }
  // 🔴 THE CONTENT COUNTS ARE RETURNED, NOT SPENT ON A BOOLEAN. The first repair computed
  // `cn`/`ht` and then reported `content.html.length` — the CONTAINER count — as `examined`,
  // so at anything short of TOTAL emptiness the checks over-reported coverage: a chapter of
  // 10 published files, 3 of them empty, claimed `examined: 10`. That is the same
  // container-vs-payload confusion the guard was written to close, surviving one line below
  // the fix. → §C82 L95.
  return { ...inputs, contentCnxml: cn, contentHtml: ht };
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
 *   R4  chapter present but SPARSE    -> 🔴 A partial histogram IS TRUTHY, so the drift
 *                                        loop runs over every ACTUAL bucket against
 *                                        `baseline[b] || 0`. Measured on chemistry ch10
 *                                        with `{}`: **16 findings, every one
 *                                        `expected: 0`.** Corpus count of `{}` entries
 *                                        today: 0 of **15** committed entries (13
 *                                        chemistry + 1 organic + 1 physics) — latent.
 *                                        🔴 THIS ROW SAID `{}` AND CALLED IT "THE ONLY
 *                                        REPRESENTATION THAT PRODUCES FALSE POSITIVES".
 *                                        BOTH HALVES WERE WRONG. **Any** sparse histogram
 *                                        does it; `{}` is merely the limiting case. And
 *                                        the branch's own K1 fixture was an instance — a
 *                                        hand-written 2-bucket literal pinning 16 findings
 *                                        where the real 16-bucket entry yields 6. The
 *                                        guard now compares against the producer's own
 *                                        key set (`htmlShapeHistogram('')`), so a
 *                                        renderer that gains a bucket cannot leave it
 *                                        silently checking the wrong shape.
 *                                        ⚠️ "0 of 28" was also wrong: there are 15.
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
        examined: content.contentHtml,
        findings: [{ kind: 'baseline-malformed', got: typeof baseline }],
        message: `K1: ctx.renderBaseline is ${typeof baseline}, not a bucket histogram or null`,
      };
    }
    // 🔴 R4, AND IT IS A FINDING RATHER THAN A SKIP. A histogram missing buckets is TRUTHY,
    // so `checkChapter` compares each absent bucket against `baseline[b] || 0` and reports
    // the whole chapter as drift. Refusing it here is what stops those false positives;
    // calling it SKIPPED instead would hide a producer defect behind the expected inert
    // state.
    // 🔴 THE FIRST DRAFT TESTED `Object.keys(baseline).length === 0`, AND THE MODULE HEADER
    // CLAIMED `{}` WAS "THE ONLY REPRESENTATION THAT PRODUCES FALSE POSITIVES". BOTH WERE
    // WRONG: **any SPARSE histogram does the same thing**, and an empty one is merely its
    // limiting case. The branch's own K1 fixture was an instance — a hand-written 2-bucket
    // literal that pinned 16 findings where the real 16-bucket baseline yields 6.
    // ▶ THE CANONICAL SET IS DERIVED FROM THE PRODUCER, never hard-coded: `htmlShapeHistogram('')`
    // returns all 16 buckets at zero, which is exactly the key set `--update-baseline`
    // writes. Deriving it means a renderer that gains a bucket cannot leave this guard
    // silently checking the wrong shape — the §C82 L69 lesson (stop porting; call the real
    // thing) applied to a key set rather than to a predicate.
    const canonical = Object.keys(htmlShapeHistogram(''));
    // 🔴 PRESENCE IS NOT A VALUE — AN EIGHTH REPRESENTATION OF "NOTHING", FOUND IN THE
    // REPAIR FOR THE SEVEN. The first version of this guard tested `!(b in baseline)`, so a
    // baseline carrying all 16 canonical keys with `null`, `undefined` or string values
    // passed it and went straight into the drift loop, where `baseline[bucket] || 0`
    // coerces every one of them to 0 and reports wholesale false drift — the exact outcome
    // the guard exists to prevent, reached through the keys it just checked.
    // ▶ THE CONTAINER IS NOT THE PAYLOAD, for the third time in this file: the key set was
    // validated and the values behind it were not.
    const missing = canonical.filter((b) => !Number.isFinite(baseline[b]));
    if (missing.length) {
      return {
        verdict: VERDICT.FAIL,
        examined: content.contentHtml,
        findings: [{ kind: 'baseline-incomplete', missing, present: Object.keys(baseline).length }],
        message:
          `K1: the baseline entry for this chapter is missing, or carries a non-numeric ` +
          `value for, ${missing.length} of ${canonical.length} buckets ` +
          `(${missing.join(', ')}). That is not "no baseline" — ` +
          `every absent bucket is compared against 0, so the chapter reads as wholesale ` +
          `drift. An empty histogram is the limiting case of this, not a separate one`,
      };
    }

    // ⚠️ `0`, NOT `numericDrops(ctx)` — AND THIS IS A CORRECTION, NOT A SHORTCUT. The
    // option only ever moves `cross-stage-drop` findings, which K1 filters away, so it
    // provably cannot change a shape-drift verdict: measured byte-identical across
    // `undefined` / 0 / 1 / 7 on the specialModules cell itself, while K2 swings
    // SKIPPED/FAIL/PASS/PASS on the same inputs. The first draft passed `numericDrops(ctx)`
    // here, which had two costs and no benefit — it let a `NaN` reach `checkChapter`
    // unguarded, and it made the ctx contract advertise K1 as a consumer of a key K1 does
    // not use, which is what a Task-13 driver would be written against. → §C82 L96②.
    const drift = checkChapter(content, baseline, { knownIntentionalImageDrops: 0 }).filter(
      (f) => f.type === 'shape-drift'
    );

    return {
      verdict: drift.length ? VERDICT.WARN : VERDICT.PASS,
      examined: content.contentHtml,
      findings: drift,
      message:
        `${drift.length} shape-drift finding(s) over ${content.html.length} published ` +
        `HTML file(s), against a ${Object.keys(baseline).length}-bucket baseline`,
    };
  },
});

/**
 * The `knownIntentionalImageDrops` accessor. **K2 ONLY** — it is what separates a real
 * image drop from a book's declared `specialModules`, and the function that computes it is
 * not exported (§C82 L88).
 *
 * ⚠️ IT IS REQUIRED, NOT DEFAULTED. Returning 0 for an absent key would be the permissive
 * branch, and the permissive branch here manufactures a false positive on a BLOCKING check
 * — chemistry appendices, `{unit:'image', dropped:1}`, from `m68859` the periodic table.
 * `NaN` propagates through the caller's guard rather than silently becoming 0.
 *
 * 🔴 K1 AND K5 DELIBERATELY DO NOT CONSULT IT, AND EARLIER DRAFTS OF BOTH DID. The option
 * only moves `cross-stage-drop` findings, which K1 (shape-drift) and K5 (raw-cnxml-leak)
 * filter away — so demanding it bought nothing and cost a **false halt**: K5 is BLOCKING,
 * and its `NaN` refusal turned an irrelevant absent key into a SKIPPED that halts a paid
 * run. §C82 L41/L83 inverted — not a rule missing from a neighbour, but a rule APPLIED to
 * a neighbour it does not belong to.
 *
 * ⚠️ THE VALUE IS **PER CHAPTER**, NOT PER BOOK. `checkChapter` subtracts it from THAT
 * chapter's `<image>` count. Both this file and the ctx contract described it as "the count
 * of images this book deliberately omits", pointing at book-level `specialModules` — and a
 * driver following that wording literally would pass chemistry's book total to all 23
 * chapters and MASK a real one-image drop as PASS on a blocking check: L88's false positive
 * inverted into a false negative. Count only the special modules that live in the chapter
 * being judged.
 *
 * @param {object} ctx
 * @returns {number} NaN when the key is missing or not a count
 */
function numericDrops(ctx) {
  const n = ctx?.knownIntentionalImageDrops;
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

/**
 * How much surplus a `>=` PASS is sitting on, per unit — the amount of real loss a clean
 * K2 verdict could absorb without moving. Reported, never gated on.
 *
 * ⚠️ THIS RE-DERIVES THE PRODUCER'S COUNTING PREDICATE, WHICH THIS FILE'S OWN HEADER WARNS
 * AGAINST (§C82 L69), SO THE BOUND IS STATED RATHER THAN LEFT IMPLICIT. `checkChapter`'s
 * counts are module-local and not exported, so a margin figure cannot be obtained by
 * calling the real thing. What makes the copy acceptable HERE and not in `examined` is that
 * it feeds a MESSAGE and never a verdict: if it drifts from the producer, an operator reads
 * a wrong surplus, and no gate changes its mind. That is §C82 L76's precedent — report the
 * sub-count, never gate on it — and the day these numbers gate anything, this function must
 * be replaced by an export from the producer instead of kept in sync by hand.
 */
function marginNote({ cnxml, html }, drops) {
  const c = (s, re) => (s.match(re) || []).length;
  const cn = cnxml.join('\n');
  const ht = html.join('\n');
  const parts = [];
  for (const [unit, a, b] of [
    ['math', c(cn, /<m:math\b/g), c(ht, /<mjx-container\b/g)],
    // ⚠️ `- drops` IS PART OF THE PRODUCER'S EXPRESSION, AND THE FIRST DRAFT OMITTED IT —
    // re-deriving a predicate and then dropping one of its terms, which is worse than
    // re-deriving it whole. `checkChapter` compares `<image> - knownIntentionalImageDrops`
    // against `<img>`, so a note computed without the subtraction under-reports the slack
    // by exactly `drops`. Latent (0 of 26 cells disagree today, and only one cell has
    // drops > 0) but wrong by construction.
    ['image', c(cn, /<image\b/g) - (Number.isInteger(drops) ? drops : 0), c(ht, /<img\b/g)],
  ]) {
    if (b > a) parts.push(`${unit} +${b - a}`);
  }
  return parts.length ? `${parts.join(', ')} (rollups re-present; not a defect)` : '';
}

/** The shared refusal for a missing `knownIntentionalImageDrops`. */
function dropsRefusal(id, examined) {
  return {
    verdict: VERDICT.SKIPPED,
    examined: 0,
    findings: [],
    message:
      `${id}: ctx.knownIntentionalImageDrops must be a non-negative integer — the count of ` +
      `images deliberately omitted from THIS CHAPTER (its book-config.json specialModules ` +
      `that live in this chapter, not the book total). It is NOT ` +
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
    const margin = marginNote(content, drops);

    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: content.contentHtml,
      findings,
      message:
        `${findings.length} cross-stage drop(s) over ${content.html.length} published HTML ` +
        `file(s) from ${content.cnxml.length} injected CNXML file(s)` +
        (drops ? `, allowing ${drops} intentional image drop(s)` : '') +
        // ⚠️ RELABELLED ON A FAIL, NOT SUPPRESSED, AND COMPUTED ONCE. The first draft
        // appended the clause unconditionally, so a K2 FAIL printed "PASS margin …" — text
        // contradicting its own verdict — and called `marginNote` TWICE to do it.
        // Suppressing it on FAIL would discard real information: when one unit drops, the
        // surplus in the OTHER unit is exactly what bounds how much loss that unit could be
        // hiding (organic ch3 carries image +117 over a population of 80). So the number
        // stays and the word changes.
        // ⚠️ THE MARGIN A PASS CARRIES, DISCLOSED — because the invariant is `>=`, a PASS
        // means "the html side has AT LEAST as many", and the surplus is how much real
        // damage a PASS could absorb unseen. Measured: in 2 of 26 evaluable cells that
        // surplus EXCEEDS the entire CNXML-side population, including organic's ONLY cell
        // with published HTML. ▶ The `>=` is CORRECT and must not be tightened — rollup
        // pages legitimately re-present equations — so the answer is disclosure, not a
        // stricter comparison. Without it, a PASS printed byte-identical text whether the
        // margin was untouched or had swallowed a genuine loss.
        (margin ? ` · ${findings.length ? 'surplus' : 'PASS margin'} ${margin}` : ''),
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

    // 🔴 THE PRODUCER EMITS AN OBJECT KEYED BY `from`, NOT AN ARRAY — AND THE FIRST DRAFT
    // OF THIS LINE READ `Array.isArray(ctx.slugMap.renames) ? … : []`, WHICH COERCED EVERY
    // REAL MAP TO EMPTY. `recordRename` does `map.renames[from] = {to, moduleId,
    // recordedAt}` and `readSlugMap` explicitly REFUSES an array, so the array branch was
    // unreachable against every shape the §C9 producer can emit: every correctly-recorded
    // rename read as UNACCOUNTED, and K3 is BLOCKING, so the direction was a FALSE HALT on
    // exactly the chapters whose renames had been recorded properly.
    // ▶ IT SHIPPED THROUGH 39 GREEN TESTS BECAUSE EVERY FIXTURE WAS HAND-BUILT — and this
    // file's own test header claimed the opposite. That is the campaign's recorded lesson
    // (build every positive fixture by calling the REAL producer) committed in the file
    // whose docstring states it. → §C82 L93.
    // ⚠️ A MALFORMED `renames` IS NOT "NO MAP": an absent map means no rename was ever
    // recorded, which is a legitimate state that makes every observed rename unaccounted.
    // A map whose `renames` is the wrong type means the producer's shape changed, and the
    // only honest answer is that this check cannot judge — never a clean PASS.
    const rawMap = ctx?.slugMap;
    let entries = [];
    if (rawMap != null) {
      const r = rawMap.renames;
      if (!r || typeof r !== 'object' || Array.isArray(r)) {
        return {
          verdict: VERDICT.SKIPPED,
          examined: 0,
          findings: [],
          message:
            `K3: the slug map's \`renames\` is ${Array.isArray(r) ? 'an array' : typeof r} — ` +
            `the §C9 producer emits an OBJECT keyed by the old track-relative path. A shape ` +
            `this check cannot read is not an empty map`,
        };
      }
      // 🔴 THE KEY GOES LAST SO IT WINS, AND THE FIRST DRAFT OF THIS LINE HAD IT FIRST —
      // a defect the fix round INTRODUCED, reopening exactly the hole the both-ends binding
      // was written to close. With `{ from, ...(e || {}) }`, an entry VALUE carrying its own
      // `from` field silently overrode the `Object.entries` KEY — and the key IS the §C9
      // contract: it is the old path vefur keys its redirect on. A hand-edited or
      // future-producer map with a stray `from` would have had its real key discarded and
      // the rename credited to whatever the value claimed.
      entries = Object.entries(r).map(([from, e]) => ({ ...(e || {}), from }));
    }

    // ⚠️ A map whose `track` disagrees with the chapter being judged is judging the wrong
    // tree. CLAUDE.md: vefur FLATTENS both tracks into one directory, which is why the
    // filename is track-qualified in the first place; a `faithful` map read while checking
    // `mt-preview` would silently account for renames that never happened here.
    // 🔴 THE `ctx?.track &&` CONJUNCT WAS REMOVED, AND ITS PRESENCE WAS THE BUG: an ABSENT
    // `ctx.track` short-circuited the conjunction, routing a track-mismatched map to the
    // PERMISSIVE branch — §C82 L73's `ctx?.book === 'x' ? FAIL : WARN` shape one tier
    // later, on a blocking check. Found twice independently: once as a finding, and once
    // as a SURVIVING MUTANT whose removal was the safer direction.
    // ▶ A map supplied without a track to check it against cannot be used as evidence.
    // 🔴 `TRACKS` IS CONSULTED HERE, AND UNTIL THE FIX ROUND IT WAS CONSUMED BY NOTHING —
    // exported, frozen, pinned for frozenness, and read by no production path. That is the
    // exact inverse of the shape this whole battery exists to prevent (§C82 L3/L5, "a gate
    // that is never called"): a constant that looks like policy and enforces none. Either
    // use it or delete it; this uses it. An unknown track means the loader reached a
    // directory path from an unvalidated flag, which is precisely what `slugMapFilename`
    // validates for the same reason.
    // ⚠️ A closed-set membership test is a PURE POLICY LOOKUP, which §C82 L73 established a
    // pure gate may perform — unlike a path check, which needs the filesystem and belongs
    // in the loader.
    if (ctx?.track != null && !TRACKS.includes(ctx.track)) {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message:
          `K3: ${JSON.stringify(ctx.track)} is not a publication track ` +
          `(${TRACKS.join(' | ')}) — a verdict cannot be scoped to a tree that does not exist`,
      };
    }
    if (rawMap != null && (!ctx?.track || rawMap.track !== ctx.track)) {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message:
          `K3: the slug map declares track ${JSON.stringify(rawMap.track)} while this ` +
          `chapter is on ${JSON.stringify(ctx?.track)} — a map for another track, or a map ` +
          `with no track to check it against, is not evidence about this one`,
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
      entries
        .filter((r) => r && r.from && r.to && r.from !== r.to)
        // ⚠️ `r.from` IS STILL LOAD-BEARING AFTER THE L93 FIX, RE-DERIVED RATHER THAN
        // ASSUMED. `from` now arrives as the `Object.entries` KEY rather than a field, so
        // the obvious reading is that it can no longer be falsy — but an empty-string key
        // is legal JSON and survives `Object.entries` intact (`{"": {...}}` → `['', …]`),
        // which is exactly the degenerate entry a hand-edited map can carry.
        // Bound on the module id AND BOTH ENDS of the rename. The first draft keyed on
        // `(moduleId, to)` only, which the review measured as too weak in the direction
        // that matters: ANY historical entry whose destination happens to be the current
        // filename accounted for a rename the map has no key for — and the redirect vefur
        // actually serves is keyed on the OLD path, so the entry that must exist is
        // precisely the one that binding never checked for. Matching the basename alone
        // is a corpus coincidence (§C82 L74 one field over); matching the module id alone
        // accepts an entry describing a DIFFERENT rename of the same module.
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
        .map((r) => JSON.stringify([r.moduleId, basename(r.from), basename(r.to)]))
    );

    const findings = [];

    // 🔴 THE FAILED PRUNE — A PROPERTY OF `after` ALONE, AND THE FIX ROUND KEYED IT ON
    // `before`. A module occupying MORE THAN ONE published file after the render means the
    // superseded page was not deleted: the chapter TOC then lists the section twice, once
    // under the corrected title and once under the old machine translation, which is the
    // symptom that caused §C9 to be written at all.
    // ▶ THE FIRST REPAIR PUT THIS INSIDE THE `beforeByModule` LOOP, so a duplicate whose
    // module is ABSENT from the before-snapshot — a module first published by this very
    // render, which is the commonest way to end up with two pages — was never examined and
    // the chapter returned PASS with "0 unaccounted". The comment stated the rule over
    // `after` while the code ranged over `before`: a comment generalising past its code,
    // in the repair for a comment generalising past its code. → §C82 L94①.
    for (const [moduleId, files] of afterByModule) {
      if (files.length > 1) {
        findings.push({ kind: 'module-in-multiple-files', moduleId, files: [...files].sort() });
      }
    }

    for (const [moduleId, oldFiles] of beforeByModule) {
      const newFiles = afterByModule.get(moduleId) || [];
      if (newFiles.length === 0) {
        // The module left the tree entirely. That is a DELETION, not a rename, and the
        // slug map does not describe it — but it is reader-visible (every inbound link
        // 404s) and it is the one thing a module-id diff alone would report as nothing.
        findings.push({ kind: 'module-disappeared', moduleId, was: oldFiles });
        continue;
      }
      for (const oldFile of oldFiles) {
        if (newFiles.includes(oldFile)) continue; // this name survived — not a rename
        for (const newFile of newFiles) {
          if (accounted.has(JSON.stringify([moduleId, oldFile, newFile]))) continue;
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
        `${after.size} after; ${entries.length} slug-map entr(ies); ` +
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
      examined: content.contentHtml,
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
 * **1 of 334 corpus-wide (0.30%)**.
 * ⚠️ AND IN THE UNIT THE VERDICT IS ACTUALLY IN, WHICH THE FIRST DRAFT DID NOT STATE:
 * K5 returns **one verdict per CELL**, not per file, so the rate that predicts false halts
 * is **1 of 31 cells = 3.2%** corpus-wide — an order of magnitude closer to the ~5% bar
 * than the per-file 0.30%. Both readings clear it and the blocking flag survives, but
 * 0.30% was the more favourable of two available denominators quoted without saying which
 * unit the bar is measured in. **Quote the rate in the unit the gate emits.**
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

    // 🔴 NO `knownIntentionalImageDrops` REFUSAL HERE, AND REMOVING IT CLOSED A PURE
    // FALSE-HALT SURFACE. `findRawCnxmlLeaks` is computed from the HTML alone, so the
    // option cannot touch this verdict — yet the first draft made a missing key return
    // SKIPPED, and K5 is BLOCKING, so `runTier` turned an irrelevant absent value into a
    // halted paid run with no compensating detection. The refusal belongs to K2, whose
    // verdict the option really does decide. → §C82 L96②.
    const leaks = checkChapter(content, null, { knownIntentionalImageDrops: 0 }).filter(
      (f) => f.type === 'raw-cnxml-leak'
    );

    // ⚠️ THE MESSAGE COUNTS LEAKING CONSTRUCTS, NOT FINDINGS. `checkChapter` pushes at
    // most ONE `raw-cnxml-leak` finding per chapter — shape
    // `{type, where, leaks: [{pattern, count, sample}]}` — so `findings.length` is capped
    // at 1, and a chapter with one leak printed the same text as a chapter with five
    // distinct leaking constructs and hundreds of occurrences. The finding object is
    // unchanged; only the operator-facing counts now vary with the damage.
    // ▶ THE FIELD IS `leaks`, VERIFIED AGAINST THE PRODUCER RATHER THAN GUESSED — the
    // first draft of this line named a field that does not exist, which would have
    // rendered `0 pattern(s)` on every real leak while the verdict stayed correct.
    const detail = leaks.flatMap((f) => (Array.isArray(f.leaks) ? f.leaks : []));
    const occurrences = detail.reduce((n, l) => n + (Number(l.count) || 0), 0);

    return {
      verdict: leaks.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: content.contentHtml,
      findings: leaks,
      message:
        (detail.length
          ? `${occurrences} raw-CNXML occurrence(s) across ${detail.length} pattern(s) ` +
            `(${detail.map((l) => l.pattern).join(', ')})`
          : '0 raw-CNXML leaks') + ` over ${content.html.length} published HTML file(s)`,
    };
  },
});

export const CHAPTER_CHECKS = [K1, K2, K3, K4, K5];

// A check that is never registered is a check that does not exist (§C82 L3/L5), and the
// ARRAY is not the same fact as the REGISTRATION (§C82 L71) — the test file pins this call's
// argument, not just the contents of the array above.
registerChecks(CHAPTER_CHECKS);
