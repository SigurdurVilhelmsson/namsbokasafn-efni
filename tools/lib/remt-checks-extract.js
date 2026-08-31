/**
 * remt-checks-extract.js — Tier 1 of the §C82 battery: E1-E7 and E9.
 *
 * Tier 1 is PER MODULE, PRE-MT. It is free, it loops until clean, and it GATES THE
 * SPEND: a halt here costs a re-extract, not money (design §4). That asymmetry is
 * why E2, E4 and E5 are blocking and why the `examined` unit below was measured
 * rather than inherited.
 *
 * ⚠️ VERSION STAMPS ARE NEW HERE, NOT INHERITED. None of the wrapped functions
 * carries one (measured across every Plan A lib). Bump a check's version when its
 * JUDGEMENT changes — not when this wrapper is reformatted.
 *
 * ── THE `examined` UNIT — DECIDED HERE, AND THE PLAN'S CHOICE WAS A ~70% FALSE HALT ──
 *
 * Plan B:491-492 keys E2's `examined` to MARKER BODIES and E4's to `countLists(cnxml)`.
 * Both are blocking. `runCheck` downgrades PASS+0 to SKIPPED; `runTier`'s
 * `blockingFailures` filter catches SKIPPED *and* `examined === 0` independently;
 * `exitCodeFor` then returns 1. So a module with nothing of that ONE sub-unit halts a
 * paid run even though the gate read the whole module and found it clean.
 *
 * MEASURED 2026-08-24 with the real instruments over the whole committed corpus:
 *
 *   unit                          zero for                                  → halts
 *   marker bodies (E2, as planned) 12 of 149 chemistry modules   ( 8.1%)     12
 *   <list> elements (E4, as planned) 104 of 149 chemistry (69.8%)           104
 *                                    14 of 17 organic     (82.4%)            14
 *   alt positions (E5, as planned)  12 of 149 chemistry   ( 8.1%)            12
 *   SEG markers (this file)          0 of 149 chemistry, 0 of 17 organic      0
 *
 * ▶ SO ALL THREE BLOCKING CHECKS KEY `examined` TO SEGMENTS INSPECTED, and carry their
 * sub-counts in `message`. The discriminator is the plan's OWN Task 3 test, which
 * asserts `expect(r.examined).toBeGreaterThan(0)` for both E2 and E4 on
 * `efnafraedi-2e/ch01/m68663` — a module with 11 segments, 0 comparable marker bodies
 * and 0 lists. It passes under this unit and under neither of the planned ones.
 * → active register §C82 L9 (E2, and its 10→12 correction), L17 (E4) and L22 (E5).
 *
 * ⚠️ THE THREE 12s IN THAT TABLE ARE NOT ONE POPULATION, AND READING THEM AS
 * CORROBORATION IS THIS FILE'S OWN STANDING WARNING. E2's zero-set and E5's zero-set
 * are both size 12 and OVERLAP BY ONE (`appendices/m68864`); the union of modules that
 * would halt on at least one of E2/E5 under the planned units is 23 of 149 (15.4%).
 * Equal magnitudes over near-disjoint populations are a coincidence, not evidence.
 *
 * ⚠️ E4's unit was the sharper error because `analyzeModule` is TWO checks in one:
 * list coverage AND duplicate seg-ids. The dup half traverses every id-bearing element
 * and every raw SEG marker, so it examines plenty in a list-free module — keying the
 * pair's `examined` to one half's unit reports "examined nothing" over a full traversal.
 *
 * ⚠️ THE UNIT IS STILL CONTENT-KEYED, WHICH IS THE POINT — it is not a constant. A ctx
 * carrying no `segText` counts 0 and the check reads SKIPPED, which for a blocking gate
 * is a halt: a loader that supplied nothing must not wave a paid module through.
 * That is the standing instruction from §C82 L6: key `examined` to CONTENT, never to a
 * fixed leg count.
 */
import { defineCheck, registerChecks, VERDICT } from './remt-battery.js';
import { checkBracketBodies } from './bracket-body-check.js';
import { analyzeModule, checkAltCoverage, parseModuleDoc } from './extraction-coverage.js';
import { altElementIdFromSrc } from './alt-segments.js';
import { compareModule } from '../verify-reextract-equivalence.js';

/**
 * The shared `examined` unit: raw `<!-- SEG:… -->` marker OCCURRENCES in the module's
 * 02-for-mt segment file.
 *
 * ⚠️ RAW OCCURRENCES, NOT DEDUPED KEYS — the same idiom, and the same reason, as
 * `checkDuplicateSegIds` and `checkAltCoverage`: `parseSegmentsMap` defaults to
 * `duplicates: 'first'`, so a duplicated seg-id collapses to one key and the count
 * would under-report exactly the modules a dup finding is about.
 *
 * ⚠️ THE PATTERN TAKES NO SPACE AFTER THE COLON. `<!-- SEG:m001:para:fs-id1 -->`
 * parses; the readable `<!-- SEG: m001:… -->` form that prose across this repo uses
 * yields an EMPTY list, silently (CLAUDE.md § Inline Marker Format). `\s*` after
 * `<!--` is deliberate and is NOT the same permission.
 *
 * @param {unknown} segText
 * @returns {number} segments inspected; 0 for a missing or empty segment file
 */
export function countSegments(segText) {
  if (typeof segText !== 'string') return 0;
  let n = 0;
  for (const part of segText.split(/(?=<!--\s*SEG:)/)) {
    if (/<!--\s*SEG:([^\s]+?)\s*-->/.test(part)) n++;
  }
  return n;
}

/**
 * The ctx precondition guard both blocking gates share.
 *
 * 🔴 A MISSING ctx KEY DOES NOT THROW — IT YIELDS `undefined`, AND WHAT HAPPENS NEXT IS
 * PER-GATE. Measured over the real instruments called with `undefined`: `checkBracketBodies`
 * and `analyzeModule` THROW (so `runCheck` returns FAIL) while `checkAltCoverage`,
 * `detectResidue` and `findGlossaryCollisions` return a CLEAN EMPTY. Relying on the throw
 * would make the two halves of Tier 1 behave differently for the same loader defect, and
 * would report a loader bug as a CONTENT defect — a FAIL naming a parse error, on a module
 * that is fine.
 * ▶ So the absence is classified here, explicitly, as SKIPPED. For a blocking check that
 * still halts, which is correct; what changes is that the message names the cause.
 *
 * ── WHY THERE ARE THREE LEGS AND NOT ONE ──────────────────────────────────────────────
 *
 * 🔴 `examined` IS KEYED TO `segText`, SO IT CANNOT SEE A SOURCE-SIDE VOID — AND BOTH
 * INSTRUMENTS READ THE SOURCE SIDE. An adversarial review found this three times, from
 * three independent lenses. `analyzeModule`'s source halves reach the document only via
 * `parseModuleDoc(...).content`: `checkLists` returns `[]` on a null content and
 * `checkDuplicateSegIds` skips its whole `sourceDup` block on `if (content)`. So a cnxml
 * that is well-formed but is not this module's leaves the source side inert while
 * `examined` stays high — and `runCheck`'s `PASS + examined 0 -> SKIPPED` backstop is
 * structurally unreachable, because the count is keyed to the side that was never in doubt.
 * MEASURED, through `runCheck`, on E4's own 4-dropped-list fixture: renaming `<content>`
 * takes it from `FAIL examined 80 findings 4` to `PASS examined 80 findings 0`.
 *
 * ⚠️ AND FIXING IT WITH `content == null` WOULD HAVE REINTRODUCED A CLASS THIS REPO
 * ALREADY RECORDS. That is ONE representation of "not this module", and a three-element
 * decoy carrying a `<content>` walks straight past it — measured: both blocking gates
 * PASS at examined 11 over a document sharing nothing with the module. It is the glossary
 * lesson verbatim: *a gate keyed on one representation of "nothing" can be walked past by
 * another representation of "nothing"*. A guard that reads as closed and is not is worse
 * than an open one, because nobody re-opens a line that looks handled.
 *
 * ▶ SO THE CHECK IS A POSITIVE IDENTITY ASSERTION PLUS A NON-EMPTINESS ASSERTION, and the
 * two are NOT redundant — each catches what the other misses:
 *
 *   input                          identity      source elements   caught by
 *   the real module                 agrees            > 0          (runs)
 *   `<content>` renamed away        agrees              0          leg 3
 *   empty `<content/>`              agrees              0          leg 3
 *   a wholly unrelated XML doc      no content-id     0 or > 0     leg 2
 *   ANOTHER module's cnxml          mismatch          > 0          leg 2
 *   the three-element decoy         no content-id       1          leg 2
 *
 * ⚠️ IT NEEDS NO NEW ctx KEY, WHICH IS WHY IT IS A VALUE COMPARISON RATHER THAN A SHAPE
 * TEST: both inputs already name the module — the CNXML in `<md:content-id>`, the segment
 * file in the first field of its `<!-- SEG:mNNNNN:… -->` markers. The gate asserts that
 * its two inputs AGREE ABOUT WHICH MODULE THEY DESCRIBE. "Prove it by VALUE" is this
 * repo's standing rule, and a count cannot see a substitution that did not happen.
 *
 * ✅ MEASURED NOT TO FALSE-HALT: over every module carrying both a source CNXML and a
 * segment file — chemistry 149, organic 17, micro 10 — there are **0** without a
 * `content-id`, **0** without a seg module id, **0** mismatches and **0** with an empty
 * `<content>`. The guard never fires on a real module, so it does not reintroduce the
 * L17 false-halt class it sits beside.
 *
 * ⚠️ WHAT IT DOES NOT COVER, stated rather than implied: a wrong cnxml whose `content-id`
 * happens to equal this module's, and any semantic mismatch past identity and
 * non-emptiness — a stale VINTAGE of the right module passes every leg. Guaranteeing the
 * loader hands each gate the bytes it asked for is the LOADER's contract, not a count's.
 * → active register §C82 L21.
 *
 * ⚠️ IT PARSES THE CNXML A SECOND TIME (the instruments parse it again inside). Accepted
 * deliberately rather than drifted into: threading a parsed document through would change
 * `checkBracketBodies`/`analyzeModule`'s signatures, which are consumed by the existing
 * `verify-extraction-coverage.js` gate. Measured cost is a second parse of ~30 KB per
 * module. ⚠️ A malformed cnxml throws HERE rather than inside the instrument — deliberately
 * NOT caught, so `runCheck` still reports it as a loud FAIL. Swallowing it into SKIPPED
 * would look tidier and would hide an unparseable source file behind an input-problem verdict.
 *
 * ⚠️ ORDERING IS LOAD-BEARING: leg 1 runs first, so a `chapter-metadata` unit — which has
 * NO `01-source` counterpart at all, and whose markers read `SEG:chapter:…` rather than a
 * module id — reaches the missing-key branch and never the identity branch. Verified.
 *
 * @param {object} ctx
 * @param {string} id
 * @returns {{verdict:string, examined:number, findings:Array, message:string}|null}
 */
function skipIfCtxUnusable(ctx, id) {
  const skip = (why) => ({
    verdict: VERDICT.SKIPPED,
    examined: 0,
    findings: [],
    message: `${id}: ${why}`,
  });

  // Leg 1 — the key is absent or empty.
  const missing = [];
  if (typeof ctx?.cnxml !== 'string' || ctx.cnxml === '') missing.push('cnxml');
  if (typeof ctx?.segText !== 'string' || ctx.segText === '') missing.push('segText');
  if (missing.length > 0) {
    return skip(`ctx is missing ${missing.join(' and ')} — no module text to examine`);
  }

  const { doc, content } = parseModuleDoc(ctx.cnxml);

  // Leg 2 — the two inputs must agree about which module they describe.
  const sourceId = moduleIdOfCnxml(doc);
  const segId = moduleIdOfSegments(ctx.segText);
  if (sourceId === null || segId === null || sourceId !== segId) {
    return skip(
      `cnxml and segText disagree about the module (cnxml content-id ${JSON.stringify(sourceId)}, segments ${JSON.stringify(segId)}) — refusing to judge one module's segments against another's source`
    );
  }

  // Leg 3 — the source side must actually hold something to traverse.
  const sourceElements = content ? content.getElementsByTagName('*').length : 0;
  if (sourceElements === 0) {
    return skip(
      `cnxml has no traversable <content> (0 elements) — every source-side finding would be vacuously empty`
    );
  }

  return null;
}

/** The module id the CNXML claims for itself, or null. */
function moduleIdOfCnxml(doc) {
  const n =
    doc.getElementsByTagName('md:content-id')[0] || doc.getElementsByTagName('content-id')[0];
  const v = n ? (n.textContent || '').trim() : '';
  return v === '' ? null : v;
}

/**
 * The module id the segment file claims, read from the FIRST field of its first SEG
 * marker. ⚠️ Takes no space after the colon — the spaced form parses to nothing, silently.
 */
function moduleIdOfSegments(segText) {
  const m = String(segText).match(/<!--\s*SEG:([^\s:]+):/);
  return m ? m[1] : null;
}

/**
 * E2 — every bracket marker's BODY still matches the text of the `01-source` element it
 * was extracted from. A swallowed body is invisible downstream: the marker is well-formed,
 * the segment count does not move, and the MT translates whatever the body happens to hold.
 *
 * 🔴 THE RETURN IS AN OBJECT, NOT AN ARRAY — DESTRUCTURE IT. Plan B:490 writes
 * `const findings = checkBracketBodies(cnxml, segText) || []`, and `{…}.length` is
 * `undefined` → falsy → this BLOCKING gate reads PASS. Measured PASS on both modules the
 * plan itself names as must-trip fixtures (ch04/m68710, ch06/m68733).
 * ⚠️ Coercing with `Array.isArray(x) ? x : []` was measured to be WORSE: still PASS, and
 * the `ok:false` evidence erased too. `runCheck`'s findings guard is the DETECTOR for that
 * mistake; this destructure is the repair. → active register §C82 L1.
 *
 * ⚠️ `skippedUnmatchable` is REPORTED, NOT JUDGED. It counts bracket openers of comparable
 * types that the body regex could not reach — nesting, corpus-wide a known and legitimate
 * limitation of the instrument (chemistry's m68791/m68793 among them). Failing on it would
 * halt the run on the instrument's own blind spot rather than on a defect; dropping it
 * silently would hide how much of the module E2 could not see. It goes in `message`.
 */
export const E2 = defineCheck({
  id: 'E2',
  tier: 1,
  blocking: true,
  version: 1,
  run: (ctx) => {
    const skip = skipIfCtxUnusable(ctx, 'E2');
    if (skip) return skip;
    const {
      examined: bodies,
      findings,
      skippedUnmatchable,
    } = checkBracketBodies(ctx.cnxml, ctx.segText);
    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: countSegments(ctx.segText),
      findings,
      message: `${bodies} marker bodies compared, ${skippedUnmatchable} unmatchable (nested)`,
    };
  },
});

/**
 * E4 — list-item coverage and REAL duplicate seg-ids. A dropped list is the BIO-EX3 shape:
 * the module extracts, the segment count looks plausible, and four multiple-choice options
 * are simply absent. Fixture: `orverufraedi/ch01/m58781`, 4 of the 14 dropped lists across
 * that book's ch01 (m58781:4 + m58782:5 + m58783:5).
 *
 * 🔴 `analyzeModule().dupFindings` IS AN OBJECT `{sourceDup, rawDup}`, NOT AN ARRAY, so
 * Plan B:503's `[...dupFindings]` THROWS. Loud and self-correcting, unlike E2's — but it
 * also means the plan never states WHICH dup findings are defects.
 * → active register §C82 L2.
 *
 * 🔴 THE FILTER MATTERS AS MUCH AS THE SHAPE, AND IT IS NOT A DETAIL. `rawDup` carries
 * `kind: 'benign'` entries — measured 5 in m68733 and 3 in m68710, both otherwise-clean
 * modules — so spreading `rawDup` whole would FAIL two of chemistry's cleanest modules on
 * a paid run. This destructure reproduces `analyzeModule`'s OWN `hasFindings` exactly:
 * `listFindings` + `dupFindings.sourceDup` + `rawDup` filtered to `kind === 'real'`.
 * Keeping the two in step is deliberate — `verify-extraction-coverage.js` exits on
 * `hasFindings`, and a battery that disagreed with the existing gate would give two
 * different answers for one module.
 *
 * ⚠️ DELIBERATELY DOES NOT READ `altFindings` — that is E5 (Task 4), and `analyzeModule`
 * folds it OUT of `hasFindings` on purpose (`extraction-coverage.js:339-343` says why in
 * code). Folding it in here turns every module in the tree red until the re-extract.
 */
export const E4 = defineCheck({
  id: 'E4',
  tier: 1,
  blocking: true,
  version: 1,
  run: (ctx) => {
    const skip = skipIfCtxUnusable(ctx, 'E4');
    if (skip) return skip;
    const { listFindings, dupFindings } = analyzeModule(ctx.cnxml, ctx.segText);
    const realDups = dupFindings.rawDup.filter((d) => d.kind === 'real');
    const findings = [...listFindings, ...dupFindings.sourceDup, ...realDups];
    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: countSegments(ctx.segText),
      findings,
      message:
        `${listFindings.length} list, ${dupFindings.sourceDup.length} source-dup, ` +
        `${realDups.length} raw-dup findings ` +
        `(${dupFindings.rawDup.length - realDups.length} benign raw dups not counted)`,
    };
  },
});

/**
 * The alt elementIds this module's SOURCE is able to produce.
 *
 * 🔴 WHY E5 NEEDS THIS AT ALL — A TALLY CANNOT SEE A SUBSTITUTION THAT DID NOT HAPPEN.
 * `checkAltCoverage`'s `ok` is `reached === reachable`: two COUNTS. It never reads the
 * emitted alt's elementId, and `reachable` is a count of alt-bearing `<media>` rather than
 * a set of their ids. So an alt segment keyed to an id nothing in the source produces
 * balances the tally perfectly. MEASURED through the committed §C89 sentinel harness on
 * `ch04/m68710`: renaming ONE alt marker's elementId leaves E5 at `expected 6, reached 6`
 * **PASS**, while the sentinel sweep drops from **6/6 to 5/6** — the injector resolves alt
 * through `structure.alt.segmentId`, misses, and falls back to `alt.text`, so the
 * UNTRANSLATED ENGLISH alt is published. That is §C89 exactly, inside the gate built to
 * prevent it, and it is why CLAUDE.md's rule reads *"prove a translation REACHED the output
 * with a sentinel, never with a tally."*
 * ⚠️ Filed by the whole-branch review as a blocker, REFUTED by its skeptic on the grounds
 * that "an orphan-keyed alt does not make readAlt miss", and the refutation was overturned
 * by execution. → active register §C82 L26.
 *
 * ── THE ENUMERATION IS THE RISK, AND IT WAS MEASURED, NOT REASONED ──
 *
 * Four id shapes are legitimate (`tools/lib/alt-segments.js`), and a set missing ONE of them
 * false-halts a whole book. A first draft collecting only `<media>` ids and src slugs left
 * **1,901 of organic's 2,162** alt segments unresolved — 88% of the book — because organic
 * keys most alts on the FIGURE's id. Measured over a fresh in-process extract of both kept
 * books, 491 modules / 3,311 alt segments:
 *
 *   shape                      chemistry   organic   resolves via
 *   <figure id> / <media id>      1,149      1,901    the id set below
 *   src slug (§C88 entry media)       0        244    altElementIdFromSrc
 *   media-N-alt / standalone-N-alt    0         17    ALT_POSITIONAL
 *   UNRESOLVED                        0          0
 *
 * ⚠️ `<subfigure>` ids are DELIBERATELY NOT COLLECTED — measured: dropping them leaves 0
 * unresolved, so including them would widen the accepted set for nothing, and every extra
 * accepted shape makes the orphan check weaker. Do not add a tag here without re-running
 * that sweep and showing it changes the unresolved count.
 *
 * ⚠️ THE POSITIONAL FORM IS ACCEPTED BY PATTERN, NOT BY VALUE, AND THAT IS A STATED
 * WEAKENING. `altElementId`'s fallback is `${kind}-${index}-alt`, where `index` comes from
 * the extractor's own counters — reproducing it here would mean reimplementing the
 * traversal. So a positional alt whose INDEX is wrong still passes this leg. It is 17 of
 * 3,311 (0.5%), all organic, all standalone.
 *
 * @param {Element|null} content
 * @returns {Set<string>}
 */
export function altIdsSourceCanProduce(content) {
  const out = new Set();
  if (!content) return out;
  for (const tag of ['figure', 'media']) {
    const els = content.getElementsByTagName(tag);
    for (let i = 0; i < els.length; i++) {
      const id = els[i].getAttribute('id');
      if (id) out.add(`${id}-alt`);
    }
  }
  const media = content.getElementsByTagName('media');
  for (let i = 0; i < media.length; i++) {
    const imgs = media[i].getElementsByTagName('image');
    for (let j = 0; j < imgs.length; j++) {
      const slug = altElementIdFromSrc(imgs[j].getAttribute('src'));
      if (slug) out.add(slug);
    }
  }
  return out;
}

/** The documented positional fallback, accepted by shape — see altIdsSourceCanProduce. */
const ALT_POSITIONAL = /^(media|standalone)-\d+-alt$/;

/**
 * The elementIds of the alt segments the module actually emitted.
 *
 * ⚠️ SAME SPLIT/MATCH IDIOM AS `checkAltCoverage`'s `reached` COUNTER, deliberately: the
 * orphan leg must range over exactly the population the tally counts, or the two legs
 * measure different things and their agreement means nothing. Raw occurrences, not deduped
 * keys, for the same reason `countSegments` uses them.
 */
export function emittedAltIds(segText) {
  const out = [];
  for (const part of String(segText || '').split(/(?=<!--\s*SEG:)/)) {
    const m = part.match(/<!--\s*SEG:([^\s]+?)\s*-->/);
    if (!m) continue;
    const fields = String(m[1]).split(':');
    if (fields[1] === 'alt') out.push(fields.slice(2).join(':'));
  }
  return out;
}
/**
 * E5 — figure-alt coverage: every alt attribute sitting in a position the extractor is
 * DESIGNED to reach became an alt segment. §C89 is what its absence costs — 627 of 951
 * chemistry alt segments were extracted, sent to the paid MT and then discarded at inject,
 * with every count corpus-wide green throughout, because the English alt is still PRESENT
 * when a translation is dropped and an attribute tally therefore never moves.
 *
 * ── THE `examined` UNIT — §C82 L17 PREDICTED IT WOULD RECUR HERE, AND IT DOES ──
 *
 * The plan specifies E5 as "read `checkAltCoverage(...).ok`", whose natural `examined` is
 * `expected` — the alt positions the check actually judges. MEASURED through the real
 * `runCheck`, over all 149 chemistry modules, before this check was written:
 *
 *   plan-literal E5, committed corpus     PASS 0 · FAIL 137 · SKIPPED 12
 *
 * 🔴 AND THE 12 SKIPPED ARE EXACTLY THE 12 E5 PASSES — the same set, not merely the same
 * size. `runTier` counts a SKIPPED blocking check as a failure and `exitCodeFor` returns 1,
 * so the plan's unit does not halt 8.1% of chemistry at random: it halts **every module E5
 * would clear, and only those**. A gate that halts precisely on its own passes is not a
 * gate. That is sharper than L17's "12 of 149", which is why it is recorded here.
 * ▶ SO E5 KEYS `examined` TO SEGMENTS INSPECTED, exactly as E2 and E4 do, and carries
 * expected/reached/unreached in `message`.
 *
 * 🔴 AND THAT MOVE REMOVES AN ACCIDENTAL PROTECTION, WHICH IS WHY THE ctx GUARD IS NOT
 * OPTIONAL HERE. The plan's unit was safe against a source-side void BY ACCIDENT: a decoy
 * cnxml yields `expected 0`, `ok` reads true, and `runCheck`'s `PASS + examined 0 → SKIPPED`
 * backstop fires. Keyed to segments that accident is gone — measured, the same decoys then
 * take the corpus from `FAIL 137 / PASS 12` to **`PASS 149`, every one with `examined > 0`**:
 * the blocking gate erased corpus-wide. **The unit fix and `skipIfCtxUnusable` are a MATCHED
 * PAIR; the first without the second trades 12 false halts for 137 false passes.**
 * ⚠️ E5 IS MORE EXPOSED HERE THAN E2 OR E4, NOT LESS. Per the guard's own docstring above,
 * `checkBracketBodies` and `analyzeModule` THROW on a missing ctx while `checkAltCoverage`
 * returns a CLEAN EMPTY — so for E5 the guard is the only thing standing between a void and
 * a PASS, because `reached === reachable` is trivially true when both sides are 0.
 *
 * ⚠️ IT IS EXPECTED RED UNTIL THE RE-EXTRACT, AND THAT IS THE POINT RATHER THAN A DEFECT.
 * The committed `02-for-mt` holds 0 alt SEG markers for both kept books — positive control,
 * 21,536 (chemistry) and 7,309 (organic) total SEG markers in the same sweep — so 137 of 149
 * chemistry modules FAIL against today's tree, correctly. E5 goes green at step 2 of the
 * loop, and that flip IS the loop's success criterion.
 *
 * 🔴 DO NOT "FIX" THAT BY WIDENING `analyzeModule`'s `hasFindings`. It folds `altFindings`
 * OUT deliberately and says so in code at `extraction-coverage.js:339-343`:
 * `verify-extraction-coverage.js` exits on `hasFindings`, so folding it in turns that
 * existing gate red for 183 of the 196 units it can analyse, the moment it lands.
 * ⚠️ RE-MEASURED 2026-08-24, because the number this sentence inherited was wrong in BOTH
 * halves: it said "all 1,192 modules". The gate enumerates 226 `-segments.en.md` units
 * across every book, 196 of which have a source CNXML to analyse; of those **183 would go
 * red and 13 stay clean** (chemistry 137/12, organic 17/0, physics 8/1, biology 11/0,
 * micro 10/0). A ~6x scare number, and an "all" that is false, in a comment whose whole
 * job is to stop a future session making this change. E5 reads `altFindings.ok`
 * directly, which is also what keeps the two gates from giving one module two answers.
 *
 * ⚠️ EQUALITY, NOT `>=`, AND THE OVER-EMISSION DIRECTION IS A REAL DEFECT CLASS. A
 * `reached > expected` is the duplicate-alt shape §C81 Task 10 closed — an alt emitted twice
 * is translated twice and PAID FOR twice — so `delta` is signed and reported rather than
 * clamped.
 *
 * ⚠️ `unreached` IS REPORTED, NEVER JUDGED, and failing on it would halt a paid run on the
 * instrument's own blind spot rather than on a defect.
 * 🔴 BUT ITS REPORTING PATH IS STRUCTURALLY UNREACHABLE TODAY, NOT MERELY UNEXERCISED, AND
 * THAT IS A STRONGER STATEMENT — SO IT IS STATED. `ALT_BLIND_DIRECT_PARENTS` is
 * `new Set([])` (`extraction-coverage.js:200`) because §C88 added an emitter for all five
 * known blind positions, so `altReachability` never assigns a `reason`, `unreached` is
 * always 0 and `unreachableByReason` is always `{}`. **No cnxml can make the parenthesised
 * reasons suffix below appear.** Measured: three mutations against it — dropping the suffix,
 * hardcoding `unreached` to 0, and joining the reasons with `''` — ALL ESCAPE a green suite,
 * and none of them CAN be caught while that Set is empty.
 * ▶ SO THE SENSOR IS ARMED BY EDITING THAT SET, NOT BY A CORPUS CHANGE. The tripwire is in
 * `remt-checks-extract-alt.test.js`: it pins `unreached === 0` and the absence of a reasons
 * suffix corpus-wide, so re-arming the Set turns it red and points the next session straight
 * at this unverified formatting. That is the most a test can do here without changing
 * `extraction-coverage.js`, which is not Task 4's file.
 */
export const E5 = defineCheck({
  id: 'E5',
  tier: 1,
  blocking: true,
  // 🔴 v2, NOT v1: the ORPHAN leg changed E5's JUDGEMENT — it now FAILs inputs it used to
  // PASS. The contract's rule is "bump when the JUDGEMENT changes, not when the wrapper is
  // reformatted", and decision ① cannot scope a quarantine across a silent judgement change.
  version: 2,
  run: (ctx) => {
    const skip = skipIfCtxUnusable(ctx, 'E5');
    if (skip) return skip;
    const { content } = parseModuleDoc(ctx.cnxml);
    const {
      reached,
      expected,
      unreached,
      unreachableByReason,
      ok: tallyOk,
    } = checkAltCoverage(content, ctx.segText);

    // LEG 2 — a VALUE comparison, because the tally above cannot see a substitution.
    // Every emitted alt must be keyed to something this module's source can produce.
    const producible = altIdsSourceCanProduce(content);
    const orphans = emittedAltIds(ctx.segText).filter(
      (id) => !producible.has(id) && !ALT_POSITIONAL.test(id)
    );

    const reasons = Object.entries(unreachableByReason)
      .map(([reason, n]) => `${reason}:${n}`)
      .join(', ');
    const findings = [];
    if (!tallyOk)
      findings.push({ kind: 'alt-coverage', expected, reached, delta: reached - expected });
    for (const id of orphans) findings.push({ kind: 'alt-orphan-key', elementId: id });
    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: countSegments(ctx.segText),
      findings,
      message:
        `expected ${expected} reachable alt positions, reached ${reached} emitted alt segments, ` +
        `${unreached} in a still-blind position${reasons ? ` (${reasons})` : ''}, ` +
        `${orphans.length} orphan-keyed`,
    };
  },
});
/**
 * E7 — a re-extraction is equivalent to the committed one: seg-id SET, per-id normalized
 * visible text, equation key-set and shared-key MathML, and the inline-attrs blob.
 *
 * ⚠️ ADVISORY, AND THAT IS A RULING, NOT A HEDGE (spec:119). §C81 *intends* to change
 * extraction this cycle, so a halt on "extraction changed" would fire on the very thing the
 * loop exists to do. It reports; Plan C quarantines and attributes.
 *
 * 🔴 ITS ctx IS NOT `{cnxml, segText}` — THE PLAN'S "same shape" IS WRONG. `compareModule`
 * takes two already-parsed SNAPSHOTS, `{segIds:Set, segText:Map, equations:Map, inlineAttrs:string}`,
 * and the parse helpers that build them (`segMap`, `eqMap`, `loadCommitted`, `loadDisk`) are
 * module-local and unexported in `tools/verify-reextract-equivalence.js` — the same shape as
 * G5's `readExisting` problem. Building them is the LOADER's job (Global Constraint 5: gates
 * are pure; file reading happens in the CLI or Plan C's driver), so the two snapshots arrive
 * as ctx keys and this gate does no I/O.
 *
 * ⚠️ IT CANNOT BE EXERCISED AGAINST THE LIVE CORPUS UNTIL THE RE-EXTRACT — there is no
 * "fresh" side yet, so on today's tree it examines 0 and reads SKIPPED. That is stated here
 * rather than left to look wired: it is advisory, so `blockingFailures` filters on
 * `r.blocking` and a SKIPPED E7 is genuinely harmless to the exit code. Its tests build both
 * snapshots explicitly, which is the loader's stand-in.
 *
 * ⚠️ Its own docstring warns that an under-built `normalizeVisibleText` false-positives on
 * ~20 benign chemistry modules. That function is the built, verified one; do not re-derive it.
 */
export const E7 = defineCheck({
  id: 'E7',
  tier: 1,
  blocking: false,
  version: 1,
  run: (ctx) => {
    const a = ctx?.committedExtract;
    const b = ctx?.freshExtract;
    if (!isSnapshot(a) || !isSnapshot(b)) {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message:
          'E7: needs both committedExtract and freshExtract snapshots — none exists until the re-extract',
      };
    }
    const { failures } = compareModule(a, b);
    // Keyed to CONTENT on both sides: a snapshot pair that carries nothing examines
    // nothing and reads SKIPPED, rather than reporting a clean comparison of two voids.
    const examined =
      new Set([...a.segIds, ...b.segIds]).size +
      new Set([...a.equations.keys(), ...b.equations.keys()]).size;
    return {
      verdict: failures.length ? VERDICT.WARN : VERDICT.PASS,
      examined,
      findings: failures,
      message: `${a.segIds.size} committed / ${b.segIds.size} fresh seg-ids, ${a.equations.size} / ${b.equations.size} equation keys`,
    };
  },
});

/**
 * A snapshot is the shape `compareModule` reads, and every field is load-bearing: it
 * iterates `segIds`, `segText.entries()` and `equations.entries()` and compares
 * `inlineAttrs` by value. A partial object would throw inside the gate and be reported as
 * a content FAIL, so the shape is classified here instead.
 */
function isSnapshot(s) {
  return (
    s != null &&
    s.segIds instanceof Set &&
    s.segText instanceof Map &&
    s.equations instanceof Map &&
    typeof s.inlineAttrs === 'string'
  );
}

/**
 * The two retired inline-marker dialects. Both predate the `[[type:content]]` bracket
 * form and both are still PARSED by the injector for back-compat, which is exactly why
 * their presence on the EN side is a defect rather than a curiosity: the module extracts,
 * the segment count is right, and the marker survives to the MT as literal text.
 *
 * ⚠️ THE `++` REGEX IS A DETECTOR, NEVER A COUNTER — it over-counts by 25.6%, MEASURED.
 * Re-measured 2026-08-25 over the six chemistry modules that carry any: **49 regex hits
 * against 39 `<emphasis effect="underline">` elements in `01-source`**, reproducing the
 * spec's figures exactly.
 *
 * 🔴 BUT THE SPEC'S STATED MECHANISM IS WRONG, AND THE REAL ONE MATTERS MORE. The spec and
 * the plan both attribute the excess to the regex being "greedy on ADJACENT RUNS". It is not:
 * every hit in the worst module is a well-formed `++C++` / `++O++` around a single element
 * symbol, and the regex reads each correctly. The excess is **`++` occurrences inside
 * DUPLICATED SEGMENT BLOCKS** — the segment file repeats whole `<!-- SEG:… -->` blocks, so
 * the same source element is counted once per copy. The account is exact, with no residual:
 *
 *   module         regex  source-underline  delta   ++ inside repeated seg-ids
 *   ch01/m68664       8          8            0                 0
 *   ch01/m68670       6          6            0                 0
 *   ch04/m68710       2          2            0                 0   (3 dup ids, none carrying ++)
 *   ch06/m68734       2          2            0                 0   (2 dup ids, none carrying ++)
 *   ch07/m68742      27         19           +8                 8
 *   ch08/m68745       4          2           +2                 2
 *
 * ▶ m68710 and m68734 are the CONTROL that rules out the looser story "duplicates inflate the
 * count": both HAVE duplicate seg-ids and both have delta 0, because their duplicated blocks
 * carry no `++`. ▶ AND THE CONSEQUENCE IS NOT COSMETIC — it means E1's over-count and E4's
 * duplicate-seg-id half are ONE defect observed twice, so a module can be red here for a
 * reason E4 already names. The anchor is still the right repair, for a different reason than
 * the spec gives: the source element count cannot be inflated by a duplicated segment.
 *
 * ⚠️ THE EXCESS IS NOT SPREAD EVENLY, WHICH IS THE TRAP EITHER WAY. Four of the six agree
 * exactly, so a spot-check of one or two modules reads as agreement. That is why the reported
 * count is anchored to the SOURCE element count and the regex hit count is carried alongside
 * it, never in its place.
 */
export const LEGACY_MUSTACHE_RE = /\{\{\s*\/?\s*(?:i|b|term|fn)\s*\}\}/g;
export const LEGACY_PLUSPLUS_RE = /\+\+[^+]+\+\+/g;

/**
 * `<emphasis effect="underline">` elements in the module's read-only source, BY PARSE.
 *
 * 🔴 PARSED, NOT REGEXED, AND THAT IS THE §C115 RULE RATHER THAN A PREFERENCE. A bare `>`
 * is legal inside an XML attribute value, so `<emphasis[^>]*effect="underline"` can truncate
 * mid-attribute and silently under-count — and the failure is an EMPTY capture, so the tool
 * reports success. This is the anchor E1's `++` count rests on; an anchor that can quietly
 * shrink would make the over-count it exists to correct look larger than it is.
 * ⚠️ Verified equal on today's corpus: the parsed count and the `[^>]*` regex both return 39
 * over the six carrier modules. That agreement is a CONTROL on this function, not a licence
 * to use the regex — these six happen to carry no raw `>` in an emphasis tag; a source
 * refresh or a new book can light up a site that has never fired.
 *
 * @param {string} cnxml read-only `01-source` text
 * @returns {number} elements whose effect is exactly "underline"
 */
export function countUnderlineElements(cnxml) {
  const { doc } = parseModuleDoc(cnxml);
  const all = doc.getElementsByTagName('emphasis');
  let n = 0;
  for (let i = 0; i < all.length; i++) {
    if (all[i].getAttribute('effect') === 'underline') n++;
  }
  return n;
}

/**
 * E1 — zero legacy inline markers on the EN side, BOTH dialects.
 *
 * A legacy marker that reaches `02-for-mt` reaches the paid MT verbatim. The mustache form
 * additionally shares the `[[…]]` family's spacing hazard: what the API returns may not be
 * what parses back.
 *
 * ── WHY IT REQUIRES `cnxml` THOUGH ITS SUBJECT IS THE SEGMENT FILE ──
 * The `++` half is only reportable against the source element count (above), so both inputs
 * are intrinsic to the judgement rather than required for symmetry. That makes
 * `skipIfCtxUnusable` the right guard here — E1 gets its identity and non-emptiness legs for
 * free, and a loader that supplied one side does not wave a paid module through.
 *
 * ⚠️ ITS NATURAL MUST-TRIP POPULATION HAS A HALF-LIFE — §C82 L27, and L20's labelling rule.
 * MEASURED 2026-08-25 over the two kept books: chemistry **1,644 mustache occurrences across
 * 104 of 170 EN segment files** and **49 `++` hits across 6**; organic **0 and 0** of 50.
 * Every one of those lives in `02-for-mt`, which the loop's own re-extract rewrites — and the
 * re-extract emits bracket markers BY DESIGN, so E1's entire corpus fixture is expected to go
 * to zero. ▶ A corpus pin here is a PREMISE pin: when it moves that is the corpus changing,
 * not a regression, and it is updated in the commit that observes it. The SHOULD-TRIP that
 * must survive the re-extract is therefore PLANTED, in the test file, where no re-extract can
 * repair it. Organic's 0-of-50 is the MUST-NOT-TRIP control and is stable.
 */
export const E1 = defineCheck({
  id: 'E1',
  tier: 1,
  blocking: true,
  version: 1,
  run: (ctx) => {
    const skip = skipIfCtxUnusable(ctx, 'E1');
    if (skip) return skip;

    const mustache = ctx.segText.match(LEGACY_MUSTACHE_RE) || [];
    const plusHits = ctx.segText.match(LEGACY_PLUSPLUS_RE) || [];

    const findings = [];
    if (mustache.length > 0) {
      findings.push({ kind: 'legacy-marker', dialect: '{{}}', occurrences: mustache.length });
    }
    if (plusHits.length > 0) {
      // The finding's authoritative count is the SOURCE element count; `regexHits` rides
      // along so the +25.6% is visible rather than silently corrected away.
      findings.push({
        kind: 'legacy-marker',
        dialect: '++',
        sourceElements: countUnderlineElements(ctx.cnxml),
        regexHits: plusHits.length,
      });
    }

    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: countSegments(ctx.segText),
      findings,
      message: `${mustache.length} {{…}} occurrences, ${plusHits.length} ++ regex hits`,
    };
  },
});

/**
 * The raw-XML tags E3 treats as residue in a segment file.
 *
 * ⚠️ EXPORTED, AND A NAMED CONSTANT RATHER THAN AN INLINE PATTERN, BECAUSE THE SPEC SAYS
 * THIS LIST HAS ALREADY BEEN WIDENED ONCE AND TO "ASSUME A NEXT TAG". A future widening is
 * then one edit in one place with a test that reads the same constant — rather than a regex
 * literal duplicated between the gate and its test, where the two drift and the test keeps
 * passing against the list it was written for.
 */
export const XML_RESIDUE_TAGS = Object.freeze([
  // The spec's original seven (spec:115, runbook P3).
  'emphasis',
  'term',
  'link',
  'note',
  'para',
  'entry',
  'row',
  // ⚠️ WIDENED 2026-08-25, AND PRICED FIRST. A detector watching 7 CNXML element names of
  // ~20 answers "no raw XML survived" while `<media>`, `<list>` or `<title>` residue passes
  // — and this re-extract cycle is changing exactly those. MEASURED over all 440 committed
  // EN+IS segment files across the two kept books: the original seven find **0** occurrences
  // and this widened set also finds **0**, so the widening costs nothing in false halts on a
  // blocking gate. It buys nothing measurable TODAY either — it is future-proofing, which is
  // what the spec means by "assume a next tag".
  'media',
  'image',
  'list',
  'item',
  'title',
  'caption',
  'table',
  'tgroup',
  'code',
  'footnote',
  'quote',
  'figure',
  'section',
  'exercise',
  'problem',
  'solution',
  'definition',
  'newline',
]);

/** Built from the constant above, so the gate and its tests cannot disagree about the list. */
// ⚠️ `</?` — A CLOSING TAG IS RESIDUE TOO. The original pattern matched openers only, so
// `leaked close</emphasis>` PASSED a blocking gate: exactly as much angle-bracket noise to
// the paid MT as an opener, and E3's whole premise is a base rate of 0 and vigilance for the
// unexpected. No producing path was demonstrated for an ORPHAN closer — the extractor's
// nested-emphasis leak carries an opener alongside it, which the old pattern already caught
// — but a detector that watches half of a syntax is half a detector, and the fix is two
// characters.
export const xmlResidueRe = () => new RegExp(`</?(?:${XML_RESIDUE_TAGS.join('|')})\\b`, 'g');

/**
 * E3 — no raw CNXML tags survive into a segment file. Extraction is supposed to have turned
 * every one of them into text or a bracket marker; one that arrives intact is sent to the
 * paid MT as literal angle-bracket noise.
 *
 * 🔴 ITS BASE RATE IS ZERO ON EVERY SIDE OF THE LIVE CORPUS, SO WITHOUT A PLANTED CONTROL IT
 * IS UNFALSIFIABLE. MEASURED 2026-08-25 across both kept books and BOTH sides — chemistry
 * 170 EN + 170 IS, organic 50 EN + 50 IS — **0 occurrences, 0 modules, everywhere**. A gate
 * that has never fired and cannot be shown to fire is indistinguishable from one that does
 * not work; the spec says so in its own coverage table (spec:249, which lists E3 among the
 * checks with no natural known-bad fixture). ▶ Its SHOULD-TRIP is a planted string in the
 * test file. ⚠️ That is ALSO why the zero above is quoted as a MUST-NOT-TRIP control and not
 * as evidence the check works: 0 findings over 440 files is exactly what a wholly broken
 * detector returns.
 *
 * ⚠️ IT KEEPS BLOCKING, AND THE SPEC CONTRADICTS ITSELF ABOUT THAT — decided here, not
 * inherited. spec:175 lists E1–E6/E9 as blocking with live fixtures; spec:249 lists E3 among
 * the checks with no natural known-bad fixture, and §2's mechanical rule is that such a check
 * "cannot be blocking". The tie is broken by this branch's own precedent rather than by
 * re-reading the spec: §C82 L27 closed E2 and E4 with PLANTED controls and left both
 * `blocking: true`. A planted control is a known-bad fixture — it is simply one whose bytes
 * the loop's re-extract cannot repair, which is the property the rule is actually about.
 * Costlessness settles the risk: E3's examined unit is `countSegments`, zero for 0 of 149
 * chemistry and 0 of 17 organic modules, so no module is halted by the unit rather than by a
 * defect (the §C82 L9/L17 class).
 *
 * ── WHY ITS GUARD IS NOT `skipIfCtxUnusable` ──
 * E3 never reads the source side. Requiring `cnxml` would make a loader that supplied only
 * `segText` produce SKIPPED, which for a blocking gate is a HALT — a false halt manufactured
 * by an input the gate does not use. The identity leg is genuinely lost by that choice and
 * the loss is stated rather than implied: handed another module's `segText`, E3 answers
 * correctly about the wrong module. That is the LOADER's contract (§C82 L21), not a guard's.
 */
export const E3 = defineCheck({
  id: 'E3',
  tier: 1,
  blocking: true,
  version: 2,
  run: (ctx) => {
    if (typeof ctx?.segText !== 'string' || ctx.segText === '') {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message: 'E3: ctx is missing segText — no segments to examine',
      };
    }
    const hits = ctx.segText.match(xmlResidueRe()) || [];
    const byTag = {};
    for (const h of hits) {
      const tag = h.replace(/^<\/?/, '');
      byTag[tag] = (byTag[tag] || 0) + 1;
    }
    const findings = Object.entries(byTag).map(([tag, occurrences]) => ({
      kind: 'xml-residue',
      tag,
      occurrences,
    }));
    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: countSegments(ctx.segText),
      findings,
      message: `${hits.length} raw XML tag occurrences over ${XML_RESIDUE_TAGS.length} watched tags`,
    };
  },
});

/**
 * Classify one emitted filename. Returns a defect kind, or `null` for an expected file.
 *
 * 🔴 IT DETECTS KNOWN-BAD SHAPES; IT DOES NOT ASSERT AN ALLOWLIST — a deliberate choice with
 * a stated cost. An allowlist would need the closed set of everything the extractor may emit,
 * and "an UNKNOWN bucket is only as trustworthy as the KNOWN set". Derived wrongly it turns
 * every unanticipated-but-legitimate artefact into a halt on a blocking gate. ▶ So E6 cannot
 * see a wholly new kind of junk, and that is the honest limit of it.
 *
 * ⚠️ THREE BACKUP SHAPES, NOT ONE. The spec and the runbook both name `*.backup.*` only;
 * `.gitignore:18-20` hides **`*.bak`, `*.backup` AND `*.backup.*`**, and CLAUDE.md § File
 * Permissions prescribes a fourth spelling, `{filename}.{YYYY-MM-DD-HHMM}.bak`, which lands
 * under `*.bak`. Real files of both families exist in the tree today. A glob covering one of
 * three is the "fix the line, not the class" failure.
 *
 * ⚠️ AND A SHAPE NEITHER DOCUMENT NAMES: parenthesised duplicates, `m68709-segments(b).en.md`
 * — **49 tracked in chemistry's `02-for-mt`**, none gitignored. They are the reason the
 * spec's "never `git status --porcelain`" rule is right for a SECOND mechanism it never
 * states: `git status` misses them not because they are ignored but because they are
 * COMMITTED. An untracked-file detector cannot see junk that was checked in.
 */
export function classifyEmittedFile(name) {
  const base = String(name).split('/').pop();
  if (/\.bak$/.test(base) || /\.backup(\.|$)/.test(base)) return 'backup';
  // ⚠️ `[0-9a-z]{1,3}`, NOT `[a-z]` — the CLASS is "parenthesised duplicate" and a browser
  // writes `(1)`, `(2)` as readily as the extractor writes `(b)`. MEASURED over 9,537
  // `01-source` filenames: 5 contain a parenthesis, 4 are `(N)` download duplicates BYTE-
  // IDENTICAL to an existing original, and 1 is legitimate — `CNX_Chem_11_02_Fe(NO3)3_img.jpg`,
  // a chemical formula. 🔴 THE `)\.` ANCHOR IS WHAT SEPARATES THEM: a duplicate marker sits
  // immediately before the extension, while a formula or a figure label
  // (`arrows(d2)_img.jpg`, `Figure_20_05_06(b)a.jpg`) is followed by more name. Widening the
  // character class WITHOUT that anchor would false-halt on chemistry filenames — the
  // direction that costs a paid run.
  if (/\([0-9a-z]{1,3}\)\./i.test(base)) return 'duplicate';
  return null;
}

/**
 * The file a backup was taken FROM, or null if `name` is not backup-shaped.
 *
 * 🔴 THIS EXISTS BECAUSE E6's ORIGINAL PREMISE WAS FALSE, AND THE PREMISE WAS LOAD-BEARING
 * FOR ITS `blocking: true`. The docstring below used to argue that the 14,634 committed
 * backups are "HISTORY, not this run's output", so only a badly-scoped listing could fail.
 * **`tools/lib/safeWrite.js:22-27` copies the existing file to `${path}.backup.${ISO}`
 * unconditionally — no byte-identical short-circuit — and `cnxml-extract.js` calls it FIVE
 * times per module (lines 2704, 2709, 2715, 2722, 2729).** So a listing scoped exactly as
 * E6 demands, of what THIS run emitted, contains five fresh backups for every module that
 * already had output — which is every module in `02-for-mt` today. ▶ The gate as first
 * written FAILS the first re-extract of every module, and Tier 1 "loops until clean" never
 * converges: each repair iteration rewrites the files and mints another five.
 * ⚠️ The spec's own fixture is evidence FOR this, not against it — "the 2026-08-12 run
 * reported `??` = none while writing 67 backup files" describes a run that re-extracted 67
 * existing files. Found by an adversarial review; no test could see it, because every test
 * supplied its own listing.
 *
 * @param {string} base a bare filename
 * @returns {string|null} the base file's name
 */
export function backupSourceOf(base) {
  let m = /^(.*)\.backup(?:\..*)?$/.exec(base);
  if (m) return m[1];
  m = /^(.*)\.\d{4}-\d{2}-\d{2}-\d{4}\.bak$/.exec(base); // CLAUDE.md § File Permissions form
  if (m) return m[1];
  m = /^(.*)\.bak$/.exec(base);
  if (m) return m[1];
  return null;
}

/**
 * One listing entry as a filename, or `null` if it cannot be read as one.
 *
 * 🔴 `String(entry)` WAS A SILENT FALSE PASS, AND IT FIRED ON THE MOST IDIOMATIC LOADER.
 * `fs.readdirSync(dir, { withFileTypes: true })` returns `Dirent` objects; `String(dirent)`
 * is `"[object Object]"`, which matches neither the backup nor the duplicate pattern — so a
 * directory full of backups classified as CLEAN, at the correct `examined` count, and the
 * blocking gate reported a sweep it never performed. Measured on a real directory: the
 * string listing gave FAIL/2 findings and the Dirent listing gave PASS/0 over the same
 * three files. ▶ Dirents are accepted on purpose (the loader convention is legitimate), and
 * anything that is neither a string nor a `{name}` is a FINDING rather than a skip — an
 * entry the gate cannot read is exactly the shape that must not read as clean.
 */
function entryName(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry.name === 'string') return entry.name; // fs.Dirent
  return null;
}

/**
 * E6 — the extract emitted no unexpected files.
 *
 * 🔴 THE GATE IS PURE: IT TAKES A LISTING, NOT A DIRECTORY. Plan B's Task 5 sketch passes
 * `{ scanDir }` and lets the gate walk it; Global Constraint 5 says gates do no I/O and
 * "file reading happens in the CLI or in Plan C's driver", and E7 (Task 4) already set that
 * precedent by taking two pre-built snapshots. Taking a path would also make every test of
 * this gate need a real directory. ▶ So the ctx key is `emittedFiles`, an array of names —
 * or `Dirent`s — the loader observed. The ctx typedef in `tools/remt-battery.js` matches.
 *
 * 🔴 A BACKUP THAT ACCOMPANIES ITS OWN REWRITTEN FILE IS EXPECTED, NOT UNEXPECTED — see
 * `backupSourceOf` above for the measurement that forced this. `safeWrite` mints one for
 * every output whose target already exists, so flagging them made E6 unable to pass any
 * re-extract. What remains a finding is an ORPHAN backup — one whose base file this run did
 * not write — because that is a backup nothing accounts for.
 * ⚠️ AND THE ACCOUNTING DISCHARGED §C82 L29's TREE-SCOPE HAZARD AS A SIDE EFFECT — MEASURED,
 * because the earlier draft of this comment asserted the opposite. It said a tree-scoped
 * listing "hands E6 thousands of orphans". It does not: a tree listing contains the base
 * files too, so every backup resolves. Over the real trees — chemistry `02-structure`
 * 12,035 files PASS (all 11,500 backups accounted for), chemistry `02-for-mt` 3,405 FAIL on
 * the 49 parenthesised duplicates ONLY, both organic trees PASS — **14,634 backups,
 * 0 orphans corpus-wide.** Scoping the listing to one run is still what the check is
 * specified against and still worth doing, but it is no longer load-bearing for correctness.
 *
 * 📌 WHAT THIS GATE CAN ACTUALLY FIRE ON, stated plainly because a gate with no reachable
 * trigger is indistinguishable from one that does not exist:
 *   ① the 49 parenthesised duplicates — live in the tree, so E6 has a NATURAL known-bad
 *     fixture, which is what lets it stay blocking under the spec's own rule. Nothing in
 *     `cnxml-extract.js` mints such a name; they arrived with the `3c39e161` rename.
 *   ② an ORPHAN backup — 0 today and structurally hard to produce, since `safeWrite` writes
 *     the backup and the file together. Reachable when a base file is later renamed or
 *     deleted while its backup survives, which is exactly what `3c39e161` did.
 *   ③ an unreadable listing entry — a loader defect (see `entryName`).
 *
 * `examined` is the number of entries classified — content-keyed per §C82 L6, so an empty
 * or absent listing counts 0 and reads SKIPPED rather than reporting a clean sweep of nothing.
 */
export const E6 = defineCheck({
  id: 'E6',
  tier: 1,
  blocking: true,
  version: 2,
  run: (ctx) => {
    const entries = ctx?.emittedFiles;
    if (!Array.isArray(entries)) {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message: 'E6: ctx is missing an emittedFiles array — nothing was listed to examine',
      };
    }

    const named = entries.map((e) => ({ raw: e, name: entryName(e) }));
    // Files this run actually wrote, by bare name — the denominator for "is this backup
    // accounted for?". Built before the classification loop so order in the listing is
    // irrelevant: safeWrite writes the backup first, so a single pass would miss it.
    const written = new Set(
      named
        .filter((n) => n.name !== null && classifyEmittedFile(n.name) === null)
        .map((n) => n.name.split('/').pop())
    );

    const findings = [];
    let accountedBackups = 0;
    for (const { raw, name } of named) {
      if (name === null) {
        findings.push({
          kind: 'unexpected-file:unreadable-entry',
          file: `<${typeof raw}>`,
          detail: 'listing entry is neither a string nor a {name} — E6 cannot classify it',
        });
        continue;
      }
      const base = name.split('/').pop();
      const kind = classifyEmittedFile(base);
      if (kind === null) continue;
      if (kind === 'backup') {
        const src = backupSourceOf(base);
        if (src !== null && written.has(src)) {
          accountedBackups++; // safeWrite doing its job for a file this run rewrote
          continue;
        }
        findings.push({ kind: 'unexpected-file:orphan-backup', file: name });
        continue;
      }
      findings.push({ kind: `unexpected-file:${kind}`, file: name });
    }

    const orphans = findings.filter((f) => f.kind.endsWith('orphan-backup')).length;
    const dups = findings.filter((f) => f.kind.endsWith('duplicate')).length;
    const unreadable = findings.length - orphans - dups;
    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: entries.length,
      findings,
      message:
        `${entries.length} emitted files listed, ${accountedBackups} backups accounted for by a file this run wrote, ` +
        `${orphans} orphan backups, ${dups} parenthesised duplicates, ${unreadable} unreadable entries`,
    };
  },
});

/**
 * The five legs of the E9 pre-flight, in the order the spec lists them. Exported so the
 * loader, the tests and any future driver name them from one place rather than by string
 * literal in three.
 */
export const E9_LEGS = Object.freeze(['locked', 'handEdits', 'inputs', 'force', 'cost']);

/**
 * The two legs the [LEAD]'s 2026-08-30 clean-break decision made ADVISORY
 * (docs/decisions/2026-08-30-c82-clean-break-refocus.md). Both are PAST-FACING: they judge what
 * was already done to `02-mt-output`, and the 2026-08-22 decision had already authorised
 * overwriting exactly those bytes — so `handEdits` was refusing 220 of 220 units to protect
 * work a human had already ruled disposable. A gate re-asking a question a human has answered.
 *
 * 🔴 ADVISORY IS A PROPERTY OF THE (leg, kind) PAIR, NEVER OF THE LEG ALONE — AND THE `kind`
 * HALF IS THE LOAD-BEARING ONE. Only a `preflight` finding (we LOOKED and found prior hand
 * work) stands down. A `leg-not-checked` finding on the very same leg still FAILS, because it
 * says the opposite thing: nobody looked. Downgrading that too was measured to produce
 * `WARN · exit 0 · handEdits report EMPTY` for a loader that silently stopped supplying the
 * leg — byte-identical to a genuinely clean run, and the N2-class incident this file's own
 * `runStateValue` contract exists to prevent. It would also destroy the artifact the decision
 * doc chose advisory OVER DELETION to keep: "the handEdits report is the artifact that names
 * which modules had prior hand work — the input to re-applying it."
 * ▶ **Advisory means "we looked and are not halting", never "we did no work".**
 */
// ⚠️ A FROZEN ARRAY, NOT A FROZEN SET — `Object.freeze` DOES NOTHING TO A `Set`. Measured:
// `Object.freeze(new Set(['locked'])).add('cost')` SILENTLY SUCCEEDS and the member is added,
// while a frozen array's `.push` throws `TypeError`. A `Set` here would have read as protected
// and not been, which is this repo's "a claim of discipline is not the discipline" shape in one
// line. It also matches `E9_LEGS`'s own idiom directly above.
export const E9_ADVISORY_LEGS = Object.freeze(['locked', 'handEdits']);

/**
 * E9 — the pre-MT pre-flight. Five independent legs, every one of which has actually gone
 * wrong on this project at least once, and all five gating a step that spends money.
 *
 * ── WHY IT IS PURE, AND WHY LEG 5 SETTLES THAT ARGUMENT RATHER THAN TASTE ──
 * Plan B's Task 6 sketch passes `{mtOutputPath, force}` and lets the gate call `isMtLocked`,
 * stat its inputs and shell out for a cost estimate. Global Constraint 5 forbids that in
 * general ("gates are pure … file reading happens in the CLI or in Plan C's driver"), but the
 * decisive argument is specific: leg 5's estimate comes from `api-translate.js --force
 * --dry-run`, and this repo's test conventions forbid any test path reaching that tool
 * because it costs real money. A gate that cannot be exercised in a test is not a gate. Once
 * the driver must supply leg 5, supplying the other four is the consistent choice, and E7
 * (Task 4) already set the precedent by taking pre-built snapshots.
 *
 * 🔴 `examined` IS THE NUMBER OF LEGS WHOSE INPUT WAS ACTUALLY SUPPLIED — NOT 5. Plan B's own
 * Task 6 test asserts `expect(r.examined).toBe(5)` against a ctx carrying `{mtOutputPath:
 * '/nonexistent/m1.is.md', force: true}`, i.e. a CONSTANT over a ctx holding one real input.
 * That is the §C82 L6 defect verbatim, and `tools/remt-battery.js`'s own ctx docstring
 * already names this exact test as the anti-pattern: a gate reporting a fixed leg count
 * "reports PASS with examined 5 over a ctx carrying nothing, and the CLI exits 0". Keyed to
 * supplied inputs instead, a ctx carrying nothing examines 0 and cannot read PASS.
 *
 * 🔴 AND A MISSING LEG IS ITSELF A FINDING, WHICH IS THE OTHER HALF OF THE SAME REPAIR.
 * Counting only supplied legs would, on its own, let a ctx carrying `{force: true}` report
 * PASS at examined 1 — a pre-flight that checked one leg of five and waved a paid module
 * through. So every leg the ctx does not carry is reported as `kind: 'leg-not-checked'`. A
 * pre-flight that cannot check something must never pass it. ⚠️ This is §C82 L22 applied
 * before the fact rather than after: re-keying `examined` away from a constant removes an
 * accidental protection (the constant at least guaranteed all five were considered), so the
 * unit change and the missing-leg finding are a MATCHED PAIR and neither ships alone.
 *
 * ── THE LEGS, AND THE TRAP IN EACH ──
 *
 * 1. `locked` — a `.locked` sibling means an editor's baseline is protected. ⚠️ MUST BE
 *    PRODUCED BY `isMtLocked` (`tools/lib/mt-lock.cjs`), whose fail-safe is that an
 *    existing-but-UNREADABLE marker counts as locked. A loader substituting a bare
 *    `fs.existsSync` silently discards that; the gate cannot see the difference, so it is
 *    stated as the loader's contract. ▶ A non-boolean `locked` is treated as NOT CHECKED
 *    rather than as "not locked" — the whole point, since the permissive reading of a
 *    forgotten leg is the one that clobbers an edited baseline.
 *    🔴 The leg matters even though in-scope live locks are currently ZERO: `cnxml-extract.js`
 *    is not lock-aware while `api-translate.js` is (§C110), so a surviving lock splits the
 *    vintage INSIDE one module and nothing else reports it. E9 must DETECT the state, never
 *    assume Phase 2.1 was done — the clearing commit is on `main` but a box that has not
 *    pulled it still holds all seven.
 *
 * 2. `handEdits` — commits that hand-edited the READ-ONLY `02-mt-output` baseline. This is
 *    the only witness that a module's MT output was touched by hand, and re-translating over
 *    one destroys work. ⚠️ CLASSIFY BY PATH, THEN BY DIFF — NEVER BY COMMIT SUBJECT:
 *    `827424da` carries a `fix(…)` subject and is a re-translation, not a hand edit, while a
 *    real hand repair on this project said `data(…)`. The classification is the loader's;
 *    what the gate asserts is that the list it was handed is empty.
 *
 * 3. `inputs` — every expected input exists and is non-empty. A zero-byte input is the
 *    dangerous shape rather than a missing one: it exists, so an existence check passes, and
 *    the MT is then asked to translate nothing at full price.
 *
 * 4. `force` — the loop always re-translates over existing output, so `--force` is mandatory.
 *    Anything other than exactly `true` is a finding.
 *
 * 5. `cost` — the estimate must come from `--force --dry-run`. 🔴 A BARE `--dry-run` REPORTS
 *    `~0 ISK` ONCE OUTPUT EXISTS — a wrong answer that looks like an answer, and the reason
 *    this leg encodes its provenance rather than trusting a number. `costEstimate.withForce`
 *    must be exactly `true`; a number produced any other way is refused even when it looks
 *    reasonable. An optional `costBand` `{minIsk, maxIsk}` bounds it when the caller knows
 *    what the module should cost.
 */
export const E9 = defineCheck({
  id: 'E9',
  tier: 1,
  blocking: true,
  version: 3,
  run: (ctx) => {
    const c = ctx || {};
    const findings = [];
    let examined = 0;

    const notChecked = (leg, why) => findings.push({ kind: 'leg-not-checked', leg, why });

    // Leg 1 — the .locked sibling.
    if (typeof c.locked === 'boolean') {
      examined++;
      if (c.locked) {
        findings.push({
          kind: 'preflight',
          leg: 'locked',
          detail: 'a .locked sibling protects this MT baseline — re-translating would clobber it',
        });
      }
    } else {
      notChecked('locked', 'ctx.locked must be a boolean produced by isMtLocked()');
    }

    // Leg 2 — hand edits under the read-only 02-mt-output tree.
    if (Array.isArray(c.handEdits)) {
      examined++;
      for (const commit of c.handEdits) {
        findings.push({ kind: 'preflight', leg: 'handEdits', commit });
      }
    } else {
      notChecked('handEdits', 'ctx.handEdits must be an array of hand-edit commits (may be empty)');
    }

    // Leg 3 — every expected input exists and is non-empty.
    if (Array.isArray(c.inputs)) {
      examined++;
      if (c.inputs.length === 0) {
        // 🔴 AN EMPTY LIST IS NOT A CLEAN LEG, AND THIS WAS THE WORST DEFECT IN TIER 1.
        // `Array.isArray` is a TYPE test where the leg needs a CONTENT test, so `inputs: []`
        // returned PASS at examined 5 — byte-identical to a ctx carrying a real input, and
        // clearing `blockingFailures` and `exitCodeFor` alike. That is §C60's founding
        // incident ("a --module that matched nothing, exit 0") reappearing INSIDE the gate
        // built to prevent it, and it was inverted on its face: OMITTING `inputs` gave
        // FAIL/examined 4, while saying "I found nothing" gave PASS. E6 answers the identical
        // shape the opposite way ("a sweep of nothing is not a clean sweep").
        // ⚠️ THE FIX IS DELIBERATELY ASYMMETRIC ACROSS THE TWO ARRAY LEGS: `handEdits: []` is
        // legitimately the GOOD state and must keep counting; only `inputs` requires length.
        // It cannot false-halt — an empty `inputs` arises only when the loader located
        // nothing, which is precisely when a halt is wanted.
        findings.push({
          kind: 'preflight',
          leg: 'inputs',
          detail: 'no expected inputs supplied — the loader discovered nothing to translate',
        });
      }
      for (const inp of c.inputs) {
        const path = inp && inp.path ? String(inp.path) : '(unnamed)';
        if (!inp || inp.exists !== true) {
          findings.push({ kind: 'preflight', leg: 'inputs', path, detail: 'missing' });
        } else if (!Number.isFinite(inp.bytes) || inp.bytes <= 0) {
          // Deliberately louder than "missing": a zero-byte input passes an existence check
          // and buys a full-price translation of nothing.
          findings.push({ kind: 'preflight', leg: 'inputs', path, detail: 'empty' });
        }
      }
    } else {
      notChecked('inputs', 'ctx.inputs must be an array of {path, exists, bytes}');
    }

    // Leg 4 — --force is mandatory.
    if (typeof c.force === 'boolean') {
      examined++;
      if (c.force !== true) {
        findings.push({
          kind: 'preflight',
          leg: 'force',
          detail: '--force is required: the loop always re-translates over existing output',
        });
      }
    } else {
      notChecked('force', 'ctx.force must be a boolean');
    }

    // Leg 5 — the cost estimate, and where it came from.
    if (c.costEstimate != null && typeof c.costEstimate === 'object') {
      examined++;
      const { isk, withForce } = c.costEstimate;
      if (withForce !== true) {
        findings.push({
          kind: 'preflight',
          leg: 'cost',
          detail:
            'the estimate was not produced with --force --dry-run: a bare --dry-run reports ~0 ISK once output exists',
        });
      } else if (!Number.isFinite(isk) || isk <= 0) {
        // 🔴 THE LEG CHECKED PROVENANCE AND NEVER THE VALUE, SO `isk: 0` PASSED — THE EXACT
        // SYMPTOM IT EXISTS TO CATCH. `withForce` is an assertion the gate cannot verify: a
        // driver whose `--force --dry-run` parse fails and defaults to 0, or which sets the
        // flag from its own intent rather than from the invocation it actually made, got a
        // green cost pre-flight over an estimate of nothing. `Number.isFinite(0)` is true, so
        // 0 and -500 both read as clean estimates. A module with a real segment file cannot
        // cost 0, and leg 3 already refuses an empty input list — so `isk > 0` cannot
        // false-halt a module that has anything to translate.
        findings.push({ kind: 'preflight', leg: 'cost', detail: `unusable estimate ${isk}` });
      } else {
        const band = c.costBand;
        if (band != null) {
          // 🔴 A SUPPLIED-BUT-UNUSABLE BAND MUST FAIL, NOT STAND DOWN. `isk < undefined` and
          // `isk > NaN` are both false, so a misspelt key (`{min, max}`), a NaN bound, a
          // half-specified band or an inverted one silently removed the ONLY value bound on
          // money — while the operator who supplied it believes a ceiling is enforced.
          // Over-band spend is the direction denominated in ISK. Measured: a 999,999 ISK
          // estimate read as inside `{min:100, max:500}` with no finding and no message
          // change. This is the repo's own parseArgs class (a misremembered key is a no-op,
          // not an error) and the contract's "no guard may default", in the one leg where the
          // default costs money — and it is asymmetric with this gate's own `locked`
          // handling, which already refuses a non-boolean rather than reading it as false.
          const lo = band.minIsk;
          const hi = band.maxIsk;
          if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) {
            findings.push({
              kind: 'preflight',
              leg: 'cost',
              detail: `unusable costBand ${JSON.stringify(band)} — expected finite {minIsk, maxIsk} with minIsk <= maxIsk`,
            });
          } else if (isk < lo || isk > hi) {
            findings.push({
              kind: 'preflight',
              leg: 'cost',
              detail: `estimate ${isk} ISK outside band ${lo}-${hi}`,
            });
          }
        }
      }
    } else {
      notChecked('cost', 'ctx.costEstimate must be {isk, withForce} from --force --dry-run');
    }

    // A ctx carrying none of the five is a LOADER problem, not a content one, and saying so
    // is the same idiom `skipIfCtxUnusable` uses for the per-module gates. It still halts —
    // E9 is blocking and a SKIPPED blocking check exits 1 — but the message names the cause
    // instead of reporting five content findings against a module nobody looked at.
    if (examined === 0) {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message: `E9: ctx carries none of the five pre-flight inputs (${E9_LEGS.join(', ')})`,
      };
    }

    // 🔴 PARTITION ON (leg, kind) — see E9_ADVISORY_LEGS. E9 STAYS `blocking: true`; what
    // changes is the VERDICT it reaches. `runTier`'s filter is
    // `blocking && (FAIL || SKIPPED || examined === 0)`, so a WARN that DID examine exits 0
    // while keeping every finding and the message intact. That is the framework's existing
    // advisory idiom (E7 and the tier-4 checks already use it); no new machinery is needed,
    // and `blocking: false` would be the WRONG lever — it would also stand down `inputs`,
    // `force` and `cost`, the three legs that gate a run which spends money.
    // ⚠️ `findings` IS RETURNED IN ITS ORIGINAL LEG ORDER, NOT PARTITIONED. The self-test
    // asserts `findings[0].leg === 'force'` for E9's bad fixture, and reordering to put the
    // advisory ones last would break it while looking like a tidy-up.
    const isAdvisory = (f) => f.kind === 'preflight' && E9_ADVISORY_LEGS.includes(f.leg);
    const advisory = findings.filter(isAdvisory);
    const blocking = findings.filter((f) => !isAdvisory(f));

    return {
      // WARN only once something was actually examined — a WARN at `examined === 0` is caught
      // by `runTier`'s third clause anyway, but the early return above already handles that.
      verdict: blocking.length ? VERDICT.FAIL : advisory.length ? VERDICT.WARN : VERDICT.PASS,
      examined,
      findings,
      // 🔴 THE TWO COUNTS ARE REPORTED SEPARATELY, DELIBERATELY. A single tally would let a
      // WARN carrying 467 hand-edit findings read like a PASS, burying the one artifact this
      // downgrade exists to preserve.
      message:
        `${examined} of ${E9_LEGS.length} pre-flight legs checked, ` +
        `${blocking.length} blocking findings, ${advisory.length} advisory ` +
        `(${E9_ADVISORY_LEGS.join('/')})`,
    };
  },
});

export const EXTRACT_CHECKS = [E1, E2, E3, E4, E5, E6, E7, E9];

// 🔴 REGISTRATION HAPPENS AT IMPORT TIME, AND ONLY THE CLI IMPORTS THIS MODULE.
// Nothing else puts a check in the REGISTRY — measured (§C82 L3): no task in either
// plan ever CALLS `registerChecks()`, and a literal transcription runs an empty
// registry, selects 0 checks and exits 0 for every tier.
// ⚠️ Do NOT import this module from `lib/remt-battery.js` to "make it automatic":
// import hoisting evaluates this file before that one's top-level bindings exist, and
// the `defineCheck` calls above die in the temporal dead zone.
registerChecks(EXTRACT_CHECKS);
