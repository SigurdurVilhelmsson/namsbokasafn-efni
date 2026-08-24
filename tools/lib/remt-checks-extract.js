/**
 * remt-checks-extract.js — Tier 1 of the §C82 battery: E2, E4, E7.
 *
 * Tier 1 is PER MODULE, PRE-MT. It is free, it loops until clean, and it GATES THE
 * SPEND: a halt here costs a re-extract, not money (design §4). That asymmetry is
 * why E2 and E4 are blocking and why the `examined` unit below was measured rather
 * than inherited.
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
 *   SEG markers (this file)          0 of 149 chemistry, 0 of 17 organic      0
 *
 * ▶ SO BOTH CHECKS KEY `examined` TO SEGMENTS INSPECTED, and carry their sub-counts
 * in `message`. The discriminator is the plan's OWN Task 3 test, which asserts
 * `expect(r.examined).toBeGreaterThan(0)` for both E2 and E4 on
 * `efnafraedi-2e/ch01/m68663` — a module with 11 segments, 0 comparable marker bodies
 * and 0 lists. It passes under this unit and under neither of the planned ones.
 * → active register §C82 L9 (E2, and its 10→12 correction) and §C82 L17 (E4).
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
import { analyzeModule } from './extraction-coverage.js';
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
 * The ctx guard both blocking gates share.
 *
 * 🔴 A MISSING ctx KEY DOES NOT THROW — IT YIELDS `undefined`, AND WHAT HAPPENS NEXT IS
 * PER-GATE. Measured over the real instruments called with `undefined`: `checkBracketBodies`
 * and `analyzeModule` THROW (so `runCheck` returns FAIL) while `checkAltCoverage`,
 * `detectResidue` and `findGlossaryCollisions` return a CLEAN EMPTY. Relying on the throw
 * would make the two halves of Tier 1 behave differently for the same loader defect, and
 * would report a loader bug as a CONTENT defect — a FAIL naming a parse error, on a module
 * that is fine.
 * ▶ So the absence is classified here, explicitly, as SKIPPED. For a blocking check that
 * still halts, which is correct; what changes is that the message names the missing key.
 *
 * @param {object} ctx
 * @param {string} id
 * @returns {{verdict:string, examined:number, findings:Array, message:string}|null}
 */
function skipIfNoModuleText(ctx, id) {
  const missing = [];
  if (typeof ctx?.cnxml !== 'string' || ctx.cnxml === '') missing.push('cnxml');
  if (typeof ctx?.segText !== 'string' || ctx.segText === '') missing.push('segText');
  if (missing.length === 0) return null;
  return {
    verdict: VERDICT.SKIPPED,
    examined: 0,
    findings: [],
    message: `${id}: ctx is missing ${missing.join(' and ')} — no module text to examine`,
  };
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
    const skip = skipIfNoModuleText(ctx, 'E2');
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
    const skip = skipIfNoModuleText(ctx, 'E4');
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

export const EXTRACT_CHECKS = [E2, E4, E7];

// 🔴 REGISTRATION HAPPENS AT IMPORT TIME, AND ONLY THE CLI IMPORTS THIS MODULE.
// Nothing else puts a check in the REGISTRY — measured (§C82 L3): no task in either
// plan ever CALLS `registerChecks()`, and a literal transcription runs an empty
// registry, selects 0 checks and exits 0 for every tier.
// ⚠️ Do NOT import this module from `lib/remt-battery.js` to "make it automatic":
// import hoisting evaluates this file before that one's top-level bindings exist, and
// the `defineCheck` calls above die in the temporal dead zone.
registerChecks(EXTRACT_CHECKS);
