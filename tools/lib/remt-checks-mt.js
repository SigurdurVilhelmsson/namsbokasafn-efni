/**
 * remt-checks-mt.js — Tier 2 of the §C82 battery: ALL TEN checks, in three halves.
 *   free      A1, A6, A2b, A2c   (Task 8) — text only
 *   run-record A2a, A4, A8       (Task 9) — the provenance sidecar
 *   gating    A3, A5, A7         (Task 10) — the two-sided comparisons
 *
 * Tier 2 is PER MODULE, POST-MT. The money is already spent when these run, so unlike
 * Tier 1 a halt here does not save ISK — it stops a corrupted module from being frozen
 * into `03-faithful-translation`, edited by a human, and published. That is why three of
 * the ten are blocking despite sitting downstream of the spend.
 * ⚠️ THREE, NOT "three of the four" — that phrasing was written when the file held only
 * the free half, and it silently became a claim about the whole tier when the tier grew.
 * The blocking three are A6, A2b and A2c; the other SEVEN are advisory, each for a
 * reason recorded at its own definition.
 *
 * ── THE ctx THIS TIER TAKES, AND THE ONE KEY IT DOES NOT HAVE ─────────────────────────
 * `isText`  — the `02-mt-output` IS segment file (A1, A6, A2b, A2c, A3, A5, A7)
 * `segText` — the `02-for-mt` EN segment file (A1, A2b, A3, A5, A7 — all two-sided).
 *             This line read "A1 only" until A2b acquired its cross-side leg, then
 *             "A1 AND A2b" until Task 10 added three more — when a check starts
 *             consuming a ctx key, this list is part of the change.
 * `provenance` — the parsed sidecar (A2a, A4, A8); they reach through `.run`.
 * `module`  — the module id (A5 only), to key the residue allowlist.
 * `residueAllowlist` — the PARSED allowlist (A5 only). It cannot be read here: gates are
 *             pure. See the gating-half header for why ABSENT must be SKIPPED, not "no
 *             exclusions".
 *
 * 🔴 THERE IS NO `cnxml` IN THE TIER-2 ctx, AND THAT CHANGES WHAT A6 IS ALLOWED TO CLAIM.
 * The CLI's ctx typedef lists `cnxml` for Tier 1 (E2/E4) and `isText` for Tier 2 (A2/A6);
 * Tier 2 never receives the read-only source. E1 anchors its authoritative `++` count to
 * `countUnderlineElements(ctx.cnxml)` precisely because the `++` REGEX IS A DETECTOR AND
 * NOT A COUNTER — measured +25.6% over the six chemistry carriers. A6 has no such anchor
 * available, so it reports the regex hit count LABELLED AS ONE (`regexHits`, plus an
 * explicit `countIs: 'detector'`) and emits NO `sourceElements` field at all.
 * ▶ AND THE ANCHOR IS NOT ADDED OPPORTUNISTICALLY WHEN A LOADER HAPPENS TO SUPPLY `cnxml`.
 * Plan C scopes quarantine from these numbers; a count whose MEANING depends on which keys
 * the loader happened to pass is not comparable across modules, which is worse than a
 * count that is uniformly a detector and says so.
 *
 * ── WHAT WAS SWEPT IN HERE DELIBERATELY (§C82 L41: a ruling on one check is not a change
 * to the others — the same defect shipped twice, three commits apart, for want of this) ──
 *   L6/L44②  every `examined` is keyed to CONTENT this file actually parsed, never to a
 *            leg count, and never to units the predicate then filters out. A1 is the
 *            sharp case: it has TWO inputs, so keying `examined` to the IS side alone
 *            would report a high count over a comparison that never ran.
 *   L33/L35  the ctx guards are TYPE-AND-EMPTINESS assertions on the payload. `isText`
 *            must be a non-empty STRING; an array, an object, a number and `null` are all
 *            SKIPPED, never normalised into "an empty file that is fine".
 *   L1       nothing is coerced with `|| []` or `|| ''`. A wrong shape produces SKIPPED
 *            (a blocking halt, with the cause named), never a PASS.
 *   L33(E9)  a leg the ctx cannot supply is ITSELF a finding. `exitCodeFor` reads verdicts
 *            and never `message`, so an input problem is expressed as SKIPPED — which for
 *            a blocking check exits 1 — with `message` naming which key was missing.
 *   contract every check returns `verdict`, `version` and `examined`; `examined === 0` is
 *            never a pass (`runCheck` downgrades PASS+0 to SKIPPED). Gates are pure: this
 *            file imports no `fs`, opens no socket and touches no DB.
 *   L41      THE SEG-ID CHARSET RULE WAS SWEPT ACROSS TIER 2, AND THE CONCLUSION IS THAT
 *            IT BELONGS IN EXACTLY ONE PLACE. Checked, 2026-08-25, check by check:
 *              A2c  reads the SPACED comment form only and parses no ids — nothing to add.
 *              A6   scans for legacy inline DIALECTS in prose; ids are not its population.
 *              A1   DOES parse ids, both sides — and this is the sharp one. It already
 *                   fires on both invisible-character fixtures (measured: WARN on each).
 *                   Adding a charset predicate to A1 would NOT close the gap, because A1
 *                   is advisory BY MEASUREMENT (4/207 = 1.9% natural mismatches on the
 *                   committed corpus) and promoting it would halt the run on those four.
 *                   The gap was never "no check parses ids"; it was "the only check that
 *                   sees this cannot BLOCK and cannot CLASSIFY". So the predicate goes on
 *                   A2b — blocking at a measured 0.000% base rate — and A1 is untouched.
 *            ⚠️ AND THE SWEEP FOUND A GAP IT DELIBERATELY DID NOT CLOSE: no Tier-1 check
 *            (E1-E9) enforces this charset on the EN side either. Widening scope into
 *            Tier 1 from a Tier-2 fix round is how a task grows unreviewably; logged to
 *            the active register instead.
 *
 * 🔴 NOTHING HERE IMPORTS `server/`. `tools/` is MIT, `server/` is AGPL-3.0, and root
 * LICENSE enumerates the existing edges. `parseSegmentsMit` below is the MIT reproduction
 * of `server/services/segmentParser.js`'s `parseSegments`, built from the two MIT modules
 * that function itself delegates to. The equivalence is PINNED IN THE TEST, which may
 * `require` the AGPL original because the test suite is not shipped tooling.
 */
import { defineCheck, registerChecks, VERDICT } from './remt-battery.js';
import { parseSegmentRecords } from './seg-markers.cjs';
import { normalizeWraps } from './mt-normalize.cjs';
import { LEGACY_MUSTACHE_RE, LEGACY_PLUSPLUS_RE } from './remt-checks-extract.js';
// A3's instrument, imported BY IDENTITY rather than re-declared — the A6 precedent
// (§C82 L41). `api-translate.js` guards its `main()` behind an `import.meta.url` check,
// so importing it runs no CLI, opens no socket and spends no money; the two functions
// A3 needs are pure. Re-typing `bracketMarkerDeltaBySegment` here would pass every test
// on the day it was written and silently stop tracking the widened type set.
import { bracketMarkerDeltaBySegment } from '../api-translate.js';
// A5 reuses BOTH halves of the existing residue instrument rather than writing a second
// stripper — the plan is explicit about this, and `normalizeForComparison` is exactly
// "strip markers -> drop digits -> Unicode letters only -> lowercase".
import { detectResidue, normalizeForComparison } from './residue-check.js';
import { classifyResidue } from './residue-allowlist.js';

/**
 * A6 uses E1's instrument BY IDENTITY, not by resemblance.
 *
 * ⚠️ RE-EXPORTED RATHER THAN RE-DECLARED, AND THE TEST ASSERTS `===`. "The same instrument,
 * other side" is the spec's own description of A6, and the only way to make that true
 * rather than aspirational is for there to be one object: a re-typed copy of
 * `/\{\{\s*\/?\s*(?:i|b|term|fn)\s*\}\}/g` would pass every test on the day it was written
 * and silently stop tracking E1 the first time either is widened. §C82 L41.
 */
export { LEGACY_MUSTACHE_RE as A6_MUSTACHE_RE, LEGACY_PLUSPLUS_RE as A6_PLUSPLUS_RE };

/**
 * The MIT-side equivalent of `server/services/segmentParser.js` `parseSegments`.
 *
 * ⚠️ ALL THREE STEPS ARE LOAD-BEARING AND `parseSegmentRecords` ALONE IS NOT A SUBSTITUTE:
 *   1. `{{SEG:…}}` → `<!-- SEG:… -->`  — the shared lib is HTML-comment-only, so a mustache
 *      file parses to ZERO records without this, silently.
 *   2. `parseSegmentRecords`            — keeps ALL occurrences, so a duplicated seg-id is
 *      not collapsed (the `parseSegmentsMap` 'first' policy would hide exactly the
 *      duplicate-emission artifact E4 exists to find).
 *   3. `normalizeWraps`                 — joins single newlines, which is what makes a
 *      record's `content` the EDITOR-VISIBLE text rather than the on-disk wrap.
 *
 * ── THE IDENTITY THIS PORT HAS, AND THE ONE IT DOES NOT ───────────────────────────────
 * 🔴 THIS DOCSTRING USED TO CLAIM A2b "judges the very recognizer that will later read
 * these files". THAT IS FALSE FOR THE MUSTACHE FORM, AND MEASURABLY SO. There are two
 * different identities here and the old text collapsed them:
 *   ✅ HOLDS   vs `server/services/segmentParser.js` `parseSegments` — record-for-record,
 *              on the HTML-comment form AND the mustache form, because the original does
 *              the same normalization. That is the equivalence the test pins, and step 1
 *              is REQUIRED for it.
 *   ❌ FAILS   vs INJECTION. `tools/cnxml-inject.js` uses `SEG_MARKER`/`parseSegmentsMap`
 *              from this same `seg-markers.cjs` — with NO mustache normalization. Measured
 *              on `{{SEG:m1:para:a}}\nhalló\n{{SEG:m1:para:b}}\nheimur\n`: this port
 *              returns **2** records, inject's `parseSegmentsMap` returns **0**, and A6,
 *              A2b (pre-fix) and A2c ALL passed the file.
 * ▶ SO THE NORMALIZATION IS WHAT MAKES THE PORT FAITHFUL AND WHAT MAKES IT BLIND, in that
 * order, and A2b needs the `inject-dialect` leg below to see past it. Do NOT remove step 1
 * to close the gap: it would break the AGPL equivalence pin, which is the only evidence
 * this port still tracks the code it was copied from.
 *
 * ⚠️ SEVERITY, TRACED RATHER THAN ASSUMED: this fails LATE-LOUD, not reader-silent.
 * `tools/cnxml-inject.js:5040` refuses a module whose injection is incomplete
 * (`!result.report.complete && !args.allowIncomplete` → `SKIPPED — incomplete injection`),
 * so a mustache file reaches inject and is refused per module rather than publishing empty
 * prose. ⚠️ `--allow-incomplete` turns that back into a write, which is why the gate is
 * still worth having upstream of it.
 * ⚠️ LIVE RELEVANCE, BOUNDED — AND THE BOUND IS A PROPERTY OF THE TEST WALKER, NOT OF THE
 * RUNTIME. 7 files on disk carry `{{SEG:` (chemistry `ch05/m6872{4,6,7}-segments(b|c|d).is.md`)
 * and all 7 sit outside `mtOutputSegmentFiles`, whose `-segments.is.md` suffix filter excludes
 * parenthesized variants. **So the 0-of-207 base rate covers the TEST population, and Plan C's
 * loader is unwritten and under no obligation to use that filter.** A loader that walks the
 * directory plainly feeds those 7 files to this now-blocking leg and gets 7 hard halts — which
 * may well be right, since inject cannot read them either, but it is a consequence to choose
 * deliberately rather than discover. Widening the test walker instead moves every corpus count
 * in the Task 8 suite. Recorded in the active register (§C82), not decided here.
 *
 * @param {string} content raw segment-file text
 * @returns {Array<{segmentId:string,moduleId:string,segmentType:string,elementId:string,content:string}>}
 */
export function parseSegmentsMit(content) {
  // 🔴 NO `String(content)` COERCION — DECIDED, NOT OVERLOOKED. The original throws on a
  // non-string, and a port whose CONTRACT differs from the function it reproduces is a
  // trap for the next reader. The coercion diverged in the permissive direction, which is
  // the one that manufactures a false PASS: `String(undefined)` is the string
  // `"undefined"`, which parses to zero markers and reads as a clean empty file — exactly
  // the hazard `skipIfMissing`'s docstring below names. Unreachable through the four
  // checks (all four guard first), but this function is EXPORTED, so its contract is a
  // public surface. `runCheck` catches a throw and returns FAIL, so the loud path is also
  // the safe one. Pinned against the original, on the same inputs, in the test.
  const normalized = content.replace(/\{\{SEG:([^}]+)\}\}/g, '<!-- SEG:$1 -->');
  return parseSegmentRecords(normalized).map((r) => ({ ...r, content: normalizeWraps(r.content) }));
}

/**
 * The mustache SEG dialect `{{SEG:…}}` — a marker THIS PORT reads and INJECT does not.
 *
 * ⚠️ DELIBERATELY THE BARE TOKEN, NOT A WELL-FORMED-MARKER PATTERN. The question this leg
 * asks is "does the file carry the dialect inject cannot read", and a malformed mustache
 * marker is no more readable to inject than a well-formed one. It also makes the leg fire
 * on the spaced mustache form `{{SEG: …}}`, which is correct: that one is unreadable to
 * BOTH parsers.
 */
export const MUSTACHE_SEG_RE = /\{\{SEG:/g;

/**
 * The spaced `<!-- SEG: ` form — a marker that a human reads as a marker and the parser
 * does not see at all.
 *
 * ⚠️ THE SPACE AFTER THE COLON IS THE WHOLE DEFECT, and `\s*` after `<!--` is NOT the same
 * permission — `seg-markers.cjs`'s `SEG_MARKER` is `<!--\s*SEG:([^\s]+?)\s*-->`, so it
 * tolerates space BEFORE `SEG:` and rejects any AFTER it. Prose across this repo (specs and
 * register entries included) writes the readable spaced form, which is exactly how one gets
 * copied into a fixture or a tool; the result is an EMPTY parse, never an error.
 */
export const SPACED_SEG_RE = /<!--\s*SEG:\s+/g;

/**
 * Marker-LIKE tokens in a segment file, counted independently of whether they parse.
 *
 * 🔴 DELIBERATELY BROADER THAN THE PARSER, AND THAT IS WHAT KEEPS A2b FROM BEING A
 * TAUTOLOGY. Counting `SEG_MARKER` matches and comparing them to `parseSegmentRecords`
 * output would compare a regex to itself and pass by construction. Counting the bare token
 * `SEG:` instead catches every way a marker can be damaged in transit and still be
 * recognisable as one: an eaten `-->`, a newline inside the id, the spaced HTML-comment
 * form, and the spaced MUSTACHE form `{{SEG: …}}` — which is invisible to A6 (its mustache
 * pattern matches only `i|b|term|fn`) and to A2c (which matches only the comment form), so
 * A2b is its only detector.
 * ⚠️ THAT SENTENCE SAID "A2b's ONLY detector" UNTIL A2b GREW A THIRD LEG, and a comment
 * that generalises past its code is how a gap survives review. Precisely: within A2b, the
 * spaced mustache form now trips BOTH this raw leg (it does not parse) and the
 * `inject-dialect` leg (it carries `{{SEG:`). Across the battery, A2b remains the only
 * check that sees it at all.
 *
 * ⚠️ THE FALSE-POSITIVE DIRECTION, STATED: a literal `SEG:` inside translated PROSE would
 * make this blocking check halt a paid run. Measured 2026-08-25 over 207 live IS segment
 * files (chemistry 149, organic 48, micro 10): **0 such occurrences** — the raw token count
 * equals the parsed record count in every single file. ▶ That base rate is what licences
 * the check to block, and it is a PREMISE PIN: the corpus this battery gates is about to be
 * replaced by the re-MT run, so it is re-measured when it moves, not assumed.
 *
 * @param {string} text
 * @returns {number}
 */
export function countRawSegTokens(text) {
  // ⚠️ THE `String()` HERE IS KEPT, AND THE ASYMMETRY WITH `parseSegmentsMit` IS
  // DELIBERATE — swept per §C82 L41 rather than left for a reviewer to read as an
  // inconsistency. The argument for removing it there was a CONTRACT one: that function
  // claims to reproduce `parseSegments`, which throws, and a port that diverges from its
  // original is a trap. This function reproduces nothing and has no original to diverge
  // from; its only caller has already passed `skipIfMissing`'s non-empty-string guard.
  return (String(text).match(/SEG:/g) || []).length;
}

/**
 * The charset a segment id may use — `moduleId:segmentType:elementId`, each `[\w-]+`.
 *
 * 🔴 THIS ENCODES AN EXISTING DURABLE RULE, IT DOES NOT INVENT ONE. CLAUDE.md's
 * segment-id rule already states that an `elementId` may contain only `[\w-]`, and that
 * minting an id outside that set is a defect. What did not exist anywhere was a check
 * that ENFORCES it — measured below.
 *
 * ⚠️ DO NOT REPEAT CLAUDE.md's STATED MECHANISM FOR THAT RULE — IT IS WRONG, RE-MEASURED
 * 2026-08-25. The rule attributes the failure to `server/services/segmentParser.js`
 * `parseSegments` rejecting the id and returning an EMPTY segment list "silently". It does
 * not: `parseSegments` delegates to the PERMISSIVE recognizer in `seg-markers.cjs`
 * (`/<!--\s*SEG:([^\s]+?)\s*-->/g`) and returns every record with its id intact. The strict
 * `SEG_MARKER_REGEX` in that file is real, but its only consumer is `countModuleSegments()`,
 * which returns a COUNT and never a segment list. ▶ The PRESCRIPTION is right and is what
 * this constant enforces; the DIAGNOSIS is not, and is deliberately not restated here.
 *
 * ── THE DAMAGE CELL THIS CLOSES, AND WHY IT HAD NO BLOCKING OWNER ─────────────────────
 * A2b's other two legs and A2c all compare COUNTS. An invisible format character inside an
 * elementId — U+200B ZWSP, U+00AD soft hyphen — is not `\s` to the recognizer, so the file
 * parses to the SAME number of records and every count-based leg cancels. Measured on
 * `ch01/m68663` (11 records both sides): with a ZWSP or a soft hyphen planted in one id,
 * **parsed stays 11 and A6, A2b and A2c all returned PASS**; only advisory A1 warned.
 * ▶ AND A1 CANNOT BE PROMOTED INTO THE GAP, WHICH IS THE REAL POINT. A1 compares seg-id
 * SETS, so a legitimate rename and an invisible-character corruption are the SAME
 * observation to it — it can report a difference, never classify one. This leg asks a
 * different question with a local answer: is this id well-formed AT ALL.
 * ⚠️ UPSTREAM DOES NOT COVER IT EITHER, VERIFIED: `assertNoControlChars` is C0-only, so
 * both characters pass `api-translate` untouched, and `validateMarkers` is the same COUNT
 * comparison — blind by construction (§C89: a count cannot see a substitution).
 *
 * ── SEVERITY, TRACED TO THE CONSUMER RATHER THAN ASSUMED ──────────────────────────────
 * `tools/cnxml-inject.js` gates `report.complete` on `stats.segmentsMissing.length === 0`,
 * and it looks a segment up BY ID. A corrupted id therefore misses, the module is reported
 * incomplete and inject REFUSES it (`!result.report.complete && !args.allowIncomplete`).
 * So this fails LATE-LOUD per module, exactly like the mustache dialect leg beside it —
 * ⚠️ except under `--allow-incomplete`, which turns the refusal back into a write. That is
 * why the gate is worth having upstream of inject rather than left to it.
 * ▶ AND IT IS SCOPED TO THE IS SIDE FOR THAT REASON, NOT BY OVERSIGHT: the IS file is what
 * inject reads. An EN-side id is Tier 1's population — and no Tier-1 CHECK enforces this
 * charset today, which is logged to the active register (L47) rather than fixed by
 * widening this check's scope.
 * ⚠️ THAT NEGATIVE IS STATED WITH ITS SWEEP RANGE, BECAUSE AN UNQUALIFIED ONE READS AS
 * RIGOUR AND IS NOT. Range: every `tier: 1` check (E1-E9, all in `remt-checks-extract.js`
 * — no other lib file defines one), swept for the QUESTION rather than the syntax. It
 * found TWO things that are NOT this gate and must not be mistaken for it:
 *   `ALT_POSITIONAL` (`/^(media|standalone)-\d+-alt$/`) IS an id predicate, but a SHAPE
 *   test that classifies E5's positional-id defect, scoped to the alt population — it
 *   says nothing about which characters an id may contain.
 *   `altElementIdFromSrc` MINTS to `[\w-]` (`.replace(/[^\w-]+/g, '_')`), so alt ids are
 *   charset-clean BY CONSTRUCTION at the point of minting — which is a producer
 *   guarantee, not a check, and covers only ids that helper produces.
 * ▶ So the EN side is charset-clean where it is minted and unverified everywhere else.
 *
 * ── THE BASE RATE THAT LICENCES IT TO BLOCK ───────────────────────────────────────────
 * ▶ MEASURED 2026-08-25: **0 violations of 57,644 parsed ids across 394 files** — both run
 * -target books (`efnafraedi-2e`, `lifraen-efnafraedi`), both stages (`02-for-mt` and
 * `02-mt-output`), `chapter-metadata-*` excluded. **0.000%**, far under Plan B rule 4's ~5%
 * bar. Over the wider TEST-walker population (adds `orverufraedi`, both sides) it is 0 of
 * 58,952 ids in 414 files — the figure the test pins, stated beside this one so a reader
 * meets both populations rather than reading a disagreement into them.
 * ▶ AND THE UNITS THE WALKER EXCLUDES WERE MEASURED TOO, because Plan C's loader is
 * unwritten and under no obligation to use that filter: **50 `chapter-metadata-*` files, 50
 * ids, 0 violations** — `SEG:chapter:title:ch01` is three-part and PASSES — and the 7
 * parenthesized `ch05/m6872{4,6,7}-segments(b|c|d)` variants carry 563 ids, 0 violations.
 * So unlike the mustache leg beside it, this one has no known hard-halt waiting for a
 * loader that walks the directory plainly.
 * 🔴 EVERY ONE OF THOSE IS A PREMISE PIN, NOT A REGRESSION PIN (§C82 L20/L27): the corpus
 * this battery gates is about to be REPLACED by the re-MT run, so these are re-measured
 * when they move, never assumed to have held.
 */
export const SEG_ID_RE = /^[\w-]+:[\w-]+:[\w-]+$/;

/**
 * Render an id so a reader can SEE what is wrong with it.
 *
 * 🔴 A FINDING THAT PRINTED THE OFFENDING ID VERBATIM WOULD REPRODUCE THE DEFECT IT
 * REPORTS. U+200B renders as nothing, so `m68663:title:aut<ZWSP>o-1` is character-identical
 * ON SCREEN to the clean `m68663:title:auto-1`; a reader comparing the two in a terminal
 * sees one string twice. This is CLAUDE.md's `U+0001` rule in a new place — with a format
 * character it is the OUTPUT that lies, and `grep -a` is no defence because grep was never
 * blind, the reader is.
 * ▶ So every character outside printable ASCII is emitted as `\uXXXX`, and the offending
 * codepoints are reported in their own field beside it so spotting the difference is never
 * the reader's job.
 *
 * @param {string} id
 * @returns {string}
 */
export function escapeSegId(id) {
  return id.replace(/[^\x21-\x7e]/g, (c) => `\\u${c.codePointAt(0).toString(16).padStart(4, '0')}`);
}

/**
 * The ctx precondition every Tier-2 check shares.
 *
 * 🔴 A MISSING KEY YIELDS `undefined`, NOT A THROW, AND `String(undefined)` IS THE STRING
 * `"undefined"` — which parses to zero markers and reads as a clean empty file. So the
 * absence is classified HERE, explicitly, rather than being left to whatever each
 * instrument happens to do with it. For a blocking check SKIPPED still halts (exit 1),
 * which is correct; what changes is that the message names the cause instead of reporting
 * a content finding against a module nobody looked at.
 *
 * ⚠️ IT IS A PAYLOAD TEST, NOT A CONTAINER TEST (L33/L35). `typeof x === 'object'` and
 * `Array.isArray(x)` were both walked past in this campaign already; the assertion here is
 * that `isText` is a NON-EMPTY STRING. An array of lines, a `Buffer`, a number and `null`
 * are all loader defects and all SKIP.
 *
 * @param {object} ctx
 * @param {string} id
 * @param {string[]} keys required ctx keys, in the order they should be reported
 * @returns {{verdict:string, examined:number, findings:Array, message:string}|null}
 */
function skipIfMissing(ctx, id, keys) {
  const missing = keys.filter((k) => typeof ctx?.[k] !== 'string' || ctx[k] === '');
  if (missing.length === 0) return null;
  return {
    verdict: VERDICT.SKIPPED,
    examined: 0,
    findings: [],
    message: `${id}: ctx is missing ${missing.join(' and ')} — no MT output to examine`,
  };
}

/**
 * A1 — the EN and IS seg-id SETS are equal. ADVISORY.
 *
 * 🔴 THE PLAN'S RATIONALE FOR "ADVISORY" IS FALSIFIED; THE CONCLUSION SURVIVES FOR A
 * DIFFERENT REASON, AND THE MECHANISM IS WORTH MORE THAN THE VERDICT. Plan B:695 says A1
 * "cannot fail on a written file — `validateMarkers` throws at api-translate.js:1132-1140
 * before the write." Read the function (`tools/api-translate.js:280`): it is
 * `input.match(/<!-- SEG:/g).length === output.match(/<!-- SEG:/g).length` — a COUNT
 * comparison. An id whose DIGITS the MT rewrote leaves the count untouched, so the
 * pre-write guard is structurally blind to exactly the defect A1 detects. §C89 verbatim:
 * a count cannot see a substitution that did not happen.
 *
 * ▶ MEASURED 2026-08-25 over 207 committed EN/IS pairs: **4 mismatches, all in
 * `lifraen-efnafraedi` `exercises` bundles** — `359601 → 3601`, `358571 → 358157`,
 * `353278 → 353282`, `352255 → 352253`. Each is one EN-only id against one IS-only id: the
 * MT edited digits inside a marker it was told to leave alone.
 * ▶ SO A1 STAYS ADVISORY BECAUSE THE BASE RATE IS 4/207 (1.9%), NOT BECAUSE IT CANNOT
 * FIRE. A blocking A1 would halt on the committed corpus.
 *
 * ── WHAT A1 COVERS, AND THE TWO THINGS IT DOES NOT ────────────────────────────────────
 * A marker can fail in three ways, and they have three different owners. Reading A1 as
 * "marker identity is checked" would be a measurement generalised one step past its
 * coverage — this repo's commonest error:
 *   DAMAGED  it no longer parses          → A2b / A2c, BLOCKING, here in Tier 2
 *   LOST     the count moved              → `validateMarkers`, pre-write, upstream
 *   RENAMED  count identical, id rewritten → A1, advisory, 4/207 on `main`
 *   CORRUPTED same, but the id is MALFORMED → A2b leg `id-charset`, BLOCKING (added
 *            2026-08-25). ⚠️ THIS ROW USED TO BE FOLDED INTO `RENAMED` AND THE TABLE READ
 *            AS COMPLETE COVERAGE. It was not: an invisible format character inside an
 *            elementId (U+200B, U+00AD) leaves the count identical, so every count-based
 *            leg cancels — measured, all three blocking checks returned PASS — and it fell
 *            to A1, which is ADVISORY and, being a SET comparison, cannot tell a
 *            legitimate rename from a corruption in the first place. The two rows are
 *            different EVENTS with different owners, which is why they are now two rows.
 * ⚠️ AND SET EQUALITY IS BLIND TO MULTIPLICITY: an id present once on the EN side and
 * TWICE on the IS side gives two equal SETS. That direction is covered by
 * `validateMarkers`' count comparison — the guard this docstring just called blind — so
 * the two are complementary rather than one superseding the other. Neither alone is
 * "the marker is intact".
 *
 * ⚠️ AND ITS ONLY NATURAL FIXTURE IS IN THE ORGANIC `exercises` POPULATION — the one whose
 * loader gating is still undecided (§C82 L19/L21/L36①: those bundles are 91.2% of organic's
 * segments and have NO `01-source`). If that population is gated out of the run, A1 loses
 * its must-trip and reverts to a detector with no fixture. Advisory already, so the
 * blocking split does not move — but Plan C's driver needs to know.
 */
export const A1 = defineCheck({
  id: 'A1',
  tier: 2,
  blocking: false,
  version: 1,
  run: (ctx) => {
    // Both keys, and in this order, so the message names the side the loader dropped.
    const skip = skipIfMissing(ctx, 'A1', ['segText', 'isText']);
    if (skip) return skip;

    const enIds = new Set(parseSegmentsMit(ctx.segText).map((r) => r.segmentId));
    const isIds = new Set(parseSegmentsMit(ctx.isText).map((r) => r.segmentId));
    const enOnly = [...enIds].filter((id) => !isIds.has(id));
    const isOnly = [...isIds].filter((id) => !enIds.has(id));

    const findings =
      enOnly.length || isOnly.length ? [{ kind: 'seg-id-set-mismatch', enOnly, isOnly }] : [];

    // ⚠️ THE UNIT IS THE UNION, NOT EITHER SIDE. Keying it to the IS side alone would
    // report a full count over a comparison whose other half was never read — L6, in the
    // one Tier-2 check that has two inputs. The union is exactly the population the
    // set-equality predicate judges, and it cannot be non-zero unless both sides parsed.
    const examined = new Set([...enIds, ...isIds]).size;

    return {
      // WARN, not FAIL: a finding that is recorded and does not halt. `exitCodeFor` scores
      // only FAIL and SKIPPED on a blocking check, and A1 is not blocking either way — the
      // WARN is what makes it VISIBLE in the readout instead of silently clean.
      verdict: findings.length ? VERDICT.WARN : VERDICT.PASS,
      examined,
      findings,
      message: `${enIds.size} EN / ${isIds.size} IS seg-ids, ${enOnly.length} EN-only, ${isOnly.length} IS-only`,
    };
  },
});

/**
 * A6 — zero legacy inline-marker dialects on the IS side. BLOCKING.
 *
 * The same instrument as E1, other side, and the reason it is a separate check rather than
 * E1 re-run is what the two find: on the EN side a legacy marker means the EXTRACTOR emitted
 * a retired dialect; on the IS side it means one SURVIVED the paid MT as literal text and is
 * about to be injected verbatim into a reader-visible page. `cnxml-inject.js` still PARSES
 * both retired dialects for back-compat, so nothing downstream will complain.
 *
 * ⚠️ ITS NATURAL FIXTURE HAS A HALF-LIFE — §C82 L27. MEASURED 2026-08-25 over live
 * `02-mt-output` IS files, both dialects, `chapter-metadata` excluded:
 *
 *   book                 files   {{…}}   ++ regex hits   carriers
 *   efnafraedi-2e         149    5,442        49         115  (113 mustache, 2 ++-only)
 *   lifraen-efnafraedi     48        0          0           0   ← MUST-NOT-TRIP control
 *   orverufraedi           10      146          0           4   (fixture bytes only)
 *
 * ▶ 5,442 + 146 = 5,588 — the plan's figure EXACTLY, which is the reconciliation that shows
 * the plan's number counts the MUSTACHE DIALECT ONLY. That sum is legitimate: one dialect,
 * two books.
 * 🔴 BUT THE TWO DIALECT FIGURES ARE NEVER SUMMED ACROSS DIALECTS, AND THIS DOCSTRING
 * USED TO DO EXACTLY THAT — it called A6's fixture "5,491 occurrences", i.e. 5,442 mustache
 * OCCURRENCES plus 49 hits from the `++` REGEX that the very next paragraph pins as a
 * DETECTOR over-counting by +25.6%. The sum is neither figure. ⚠️ AND THERE IS NO SINGLE
 * CORRECTED NUMBER TO SUBSTITUTE — do not invent one: the plan's 49-vs-39 anchor was
 * EN-side, over 6 modules, against `01-source`; this 49 is IS-side and corpus-wide; and
 * Tier 2 carries no `cnxml`, so no anchor is available here at all. ▶ THE HONEST FORM IS
 * TWO FIGURES, ALWAYS REPORTED SEPARATELY, each labelled with its dialect and population —
 * which is what the table above already does, and what A6's `message` does at runtime.
 * ▶ Every one of those lives in a tree the re-MT REPLACES, so the corpus pins are premise
 * pins and the test carries a PLANTED must-trip that no re-MT can repair.
 *
 * ── THE FALSE-POSITIVE DIRECTION, STATED WITH ITS MEASURED BASE RATE ──────────────────
 * ⚠️ `LEGACY_PLUSPLUS_RE` IS `/\+\+[^+]+\+\+/`, AND `[^+]+` CROSSES WORDS. In
 * `Kalsíumjónin Ca++ og magnesíumjónin Mg++ eru tvígildar.` it matches
 * `++ og magnesíumjónin Mg++` — the closing `++` of one ion and the opening of the next,
 * read as one legacy marker. A6 IS BLOCKING, so legitimate chemistry prose halts a paid
 * run. Ion notation is ordinary in this corpus's subject matter.
 *
 * ▶ THE PATTERN IS DELIBERATELY NOT CHANGED, AND THE MEASUREMENT IS THE REASON.
 *   1. It is E1's binding, shared BY IDENTITY (see the re-export above). Widening it here
 *      silently changes a Tier-1 blocking check whose behaviour its own tests pin.
 *   2. The live risk is ZERO. Measured 2026-08-25 over all 207 population files: **49 `++`
 *      regex hits against 98 raw `++` occurrences — exactly 49 × 2**, so every `++` in the
 *      corpus is half of a paired legacy marker and there are NO orphans. The four
 *      ion-SHAPED candidates are, inspected in context, all a marker's closing delimiter
 *      (`++bráðnar við −220 °C++`, `(++C++H)`, `K++N++O`). **ZERO genuine instances.**
 * ▶ SO IT IS LATENT, NOT LIVE — and it becomes live precisely when the re-MT run replaces
 * this corpus with prose that no legacy marker survives into. The behaviour is PINNED in
 * the test so the first false halt is met as a documented trade-off, not as a mystery.
 * ⚠️ WHEN IT DOES FIRE, THE FIX BELONGS IN E1's PATTERN, WITH E1's TESTS — not in a
 * re-typed copy here, which is the §C82 L41 failure this file has already shipped twice.
 */
export const A6 = defineCheck({
  id: 'A6',
  tier: 2,
  blocking: true,
  version: 1,
  run: (ctx) => {
    const skip = skipIfMissing(ctx, 'A6', ['isText']);
    if (skip) return skip;

    const mustache = ctx.isText.match(LEGACY_MUSTACHE_RE) || [];
    const plusHits = ctx.isText.match(LEGACY_PLUSPLUS_RE) || [];

    const findings = [];
    if (mustache.length > 0) {
      findings.push({ kind: 'legacy-marker', dialect: '{{}}', occurrences: mustache.length });
    }
    if (plusHits.length > 0) {
      // 🔴 LABELLED AS A DETECTOR COUNT, WITH NO `sourceElements` SIBLING. E1 can anchor
      // this to the source `<emphasis effect="underline">` element count; the Tier-2 ctx
      // carries no `cnxml`, so A6 cannot, and presenting a +25.6% detector figure as an
      // occurrence count would be the silent over-report E1's docstring exists to prevent.
      findings.push({
        kind: 'legacy-marker',
        dialect: '++',
        regexHits: plusHits.length,
        countIs: 'detector',
      });
    }

    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: parseSegmentsMit(ctx.isText).length,
      findings,
      message: `${mustache.length} {{…}} occurrences, ${plusHits.length} ++ regex hits (detector, not a count)`,
    };
  },
});

/**
 * A2b — every marker-like token in the MT output actually PARSES. BLOCKING.
 *
 * The defect it exists for is silent by construction: a damaged marker does not error, it
 * merges two segments into one record. The segment count drops by one, the text of the
 * lost segment is appended to its predecessor, and injection then fills one element with
 * two segments' worth of prose. Nothing downstream reports anything.
 *
 * ── FOUR LEGS, AND NO ONE OF THEM SUBSUMES ANOTHER ────────────────────────────────────
 * 🔴 THE SINGLE-LEG VERSION OF THIS CHECK WAS MEASURED TO WAVE THROUGH THE EXACT DAMAGE
 * IT EXISTS TO CATCH, AND SO DID THE OTHER TWO BLOCKING CHECKS BESIDE IT. On
 * `ch01/m68663` (11 records), corrupting ONE `<!-- SEG:` to `<!-- SEG :` — a space BEFORE
 * the colon, the mirror of the spacing `/v1/grammar` was measured to insert into the
 * sibling bracket markers — silently merges a segment into its predecessor, 11 → 10, and
 * on `main` before this leg: **A6 PASS, A2b PASS, A2c PASS, examined 10, 0 findings.**
 * Only advisory A1 warned, so the blocking set passed the module.
 * ▶ THE ROOT CAUSE IS STRUCTURAL, NOT AN OVERSIGHT: leg 1 compares
 * `countRawSegTokens(isText)` to `parseSegmentsMit(isText).length`, and BOTH are derived
 * from the same 4-byte `SEG:` token. Damage to that token moves both sides equally and
 * the comparison cancels. **A self-referential invariant cannot see damage to its own
 * anchor** — which is why leg 2 anchors OUTSIDE the IS file entirely.
 *
 *   leg `raw-vs-parsed`  raw `SEG:` tokens vs parsed records, IS side only. Catches
 *                        damage that PRESERVES the token: an eaten `-->`, the spaced
 *                        comment form, the spaced mustache form. Verified all three
 *                        still trip it.
 *   leg `cross-side`     parsed EN records vs parsed IS records. Catches damage that
 *                        DESTROYS the token, which leg 1 structurally cannot see.
 *   leg `inject-dialect` `{{SEG:` present at all. Catches the file that parses CLEANLY on
 *                        both count legs and that `cnxml-inject.js` still cannot read,
 *                        because this port normalizes the mustache dialect and inject's
 *                        `parseSegmentsMap` does not. See `parseSegmentsMit` above for the
 *                        measured two-parser disagreement (port 2, inject 0).
 *   leg `id-charset`     every parsed id is `[\w-]+:[\w-]+:[\w-]+`. Catches corruption
 *                        that rewrites an id and leaves the COUNT untouched, which all
 *                        three legs above cancel on by construction. See `SEG_ID_RE`.
 *
 * ▶ THE FOUR LEGS ARE THE FOUR CELLS OF THE DAMAGE TAXONOMY IN A1's DOCSTRING, AND THAT
 * TAXONOMY USED TO CLAIM COMPLETE COVERAGE WITH A CELL UNOWNED. `RENAMED` (count
 * identical, id rewritten) was assigned to "A1 ONLY, advisory" — correct as a statement of
 * where it landed, wrong as a statement that it was covered, because a blocking gate and an
 * advisory detector are not the same protection. Leg 4 gives that cell a blocking owner for
 * the CORRUPTION half; A1 keeps the RENAME half, which needs a two-sided comparison and
 * genuinely cannot block at 4/207. §C82 L41: a comment that generalises past its code is
 * how a gap survives review.
 *
 * ⚠️ WHAT LEG 2 IS ACTUALLY FOR, STATED HONESTLY — IT IS NOT THE MT-TIME DETECTOR.
 * Measured: `validateMarkers` (`tools/api-translate.js:280`) counts `<!-- SEG:` and this
 * corruption moves that count 11 → 10, so the PRE-WRITE guard would have refused these
 * bytes at MT time. Leg 2's coverage is what that guard structurally cannot see because
 * it ran before the bytes hit disk: **POST-WRITE damage** — a hand edit under the
 * read-only `02-mt-output` tree, or a later tool. Do not read it as a second line of
 * defence against the API; read it as the only one against everything after.
 *
 * ⚠️ SEE `countRawSegTokens` FOR WHY THE RAW SIDE IS COUNTED WITH A BROADER PATTERN THAN
 * THE PARSER USES — comparing the parser to itself is the tautology this check must not be.
 *
 * ▶ BASE RATE FOR THE CROSS-SIDE PREDICATE, MEASURED 2026-08-25: **207 IS files, 207 with
 * an EN counterpart (0 without), 207 count-equal, 0 disagreements = 0.0%** over chemistry
 * 149 + organic 48 + micro 10. The two-book RUN-TARGET subset (chemistry + organic) is
 * **197/197**, the same measurement over the narrower population — stated so a reader
 * meets both framings rather than reading a disagreement into them. Under Plan B rule 4's
 * ~5% bar, which is what licences leg 2 to BLOCK rather than warn.
 * ▶ IT IS A PREMISE PIN, NOT A REGRESSION PIN (§C82 L20/L27): the corpus this battery
 * gates is about to be replaced by the re-MT run, so it is re-measured when it moves.
 */
export const A2b = defineCheck({
  id: 'A2b',
  tier: 2,
  blocking: true,
  // ⚠️ 2 → 3: the JUDGEMENT changed again — the `id-charset` leg makes A2b FAIL files
  // v2 passed. `defineCheck`'s contract is "bump whenever the judgement changes" and
  // decision ① scopes quarantine on this stamp, so a verdict recorded by v2 must not be
  // readable as one this version would have produced. Verified 2026-08-25 that the
  // registry test in this module's suite is the ONLY pin on the number.
  version: 3,
  run: (ctx) => {
    // 🔴 BOTH KEYS ARE REQUIRED, AND THAT IS THE WHOLE POINT OF §C82 L33/L41: A LEG THE
    // ctx DOES NOT CARRY IS ITSELF A FINDING, NEVER A SILENT PASS. Falling back to the
    // single-leg comparison when `segText` is absent would restore precisely the false
    // PASS this version exists to close, on every module whose loader dropped the EN
    // side. `exitCodeFor` reads `verdict` and NEVER `message`, so a caveat in the message
    // is invisible to the gate — the absence must be a SKIPPED, which for a blocking
    // check exits 1. This rule was closed in E9 and shipped broken again in G5 three
    // commits later; it is stated here so the sweep reaches this check too.
    // ⚠️ `segText` needs no ctx contract change — the CLI's CheckContext typedef already
    // documents it ("02-for-mt EN segments"); A1 has consumed it since Task 8.
    const skip = skipIfMissing(ctx, 'A2b', ['isText', 'segText']);
    if (skip) return skip;

    const rawTokens = countRawSegTokens(ctx.isText);
    // ⚠️ THE RECORDS, NOT JUST THEIR COUNT — leg 4 judges the ids themselves, and parsing
    // the same bytes twice invites the two reads to drift apart under a later edit.
    const isRecords = parseSegmentsMit(ctx.isText);
    const parsed = isRecords.length;
    const enParsed = parseSegmentsMit(ctx.segText).length;

    const findings = [];
    if (rawTokens !== parsed) {
      findings.push({
        kind: 'unparsed-seg-token',
        leg: 'raw-vs-parsed',
        rawTokens,
        parsed,
        unparsed: rawTokens - parsed,
      });
    }
    // 🔴 LEG 3: THE FILE PARSES, AND INJECT STILL CANNOT READ IT. Both legs above compare
    // COUNTS, and the mustache dialect is invisible to both because `parseSegmentsMit`
    // normalizes it before either count is formed — so the file reads clean end to end
    // while `parseSegmentsMap` (what inject actually uses) returns 0. A gate that exists
    // to protect inject must not pass a file inject cannot read.
    // ▶ Base rate 0 of 207 IS files and 0 of 207 EN files, measured 2026-08-25, which is
    // what licences it to block. Premise pin: the re-MT run moves it.
    const mustacheHits = ctx.isText.match(MUSTACHE_SEG_RE) || [];
    if (mustacheHits.length > 0) {
      findings.push({
        kind: 'mustache-seg-dialect',
        leg: 'inject-dialect',
        occurrences: mustacheHits.length,
      });
    }
    // 🔴 LEG 4: THE COUNT IS RIGHT AND THE ID IS NOT. The three legs above all compare
    // COUNTS, so corruption that rewrites an id WITHOUT moving the count cancels in every
    // one of them — measured on `ch01/m68663` with a ZWSP and with a soft hyphen: parsed
    // stays 11 and A6, A2b and A2c ALL returned PASS. Only advisory A1 warned, and A1
    // compares SETS, so it cannot tell a legitimate rename from a corruption. See
    // `SEG_ID_RE` above for the measured base rate (0 of 57,644) that licences a BLOCK,
    // for why the upstream guards are blind, and for the traced late-loud severity.
    const badIds = isRecords.map((r) => r.segmentId).filter((id) => !SEG_ID_RE.test(id));
    if (badIds.length > 0) {
      findings.push({
        kind: 'seg-id-charset',
        leg: 'id-charset',
        offending: badIds.length,
        // ⚠️ ESCAPED AND CAPPED. Escaped because an invisible character printed raw makes
        // the finding indistinguishable from a clean id (see `escapeSegId`); capped
        // because a wholesale corruption would otherwise dump every id in the module into
        // a readout a human has to scan. `offending` carries the full count regardless, so
        // the cap can never make a large failure look like a small one.
        ids: badIds.slice(0, 10).map(escapeSegId),
        codepoints: [
          ...new Set(
            badIds
              .join('')
              .split('')
              .filter((c) => !/[\w\-:]/.test(c))
              .map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
          ),
        ].slice(0, 10),
      });
    }
    if (enParsed !== parsed) {
      // ⚠️ BOTH COUNTS, NOT A MISMATCH FLAG. Without them the DIRECTION is unreadable and
      // a damaged EN side gets blamed on the paid MT.
      findings.push({
        kind: 'seg-count-cross-side-mismatch',
        leg: 'cross-side',
        enParsed,
        isParsed: parsed,
      });
    }

    return {
      // ⚠️ `examined` IS THE RAW TOKEN COUNT, NOT THE PARSED ONE — the parsed count is half
      // of what is being judged, and keying the unit to it would let a file whose markers
      // ALL failed to parse report `examined: 0` as though nothing had been looked at.
      // Raw tokens is the population the predicate compares over, and a file holding none
      // correctly reads SKIPPED: an IS segment file with no marker-like token at all is a
      // loader or MT defect, not a clean file.
      // ⚠️ AND IT STAYS KEYED TO THE IS SIDE NOW THAT A2b HAS TWO INPUTS — which looks
      // like the L6 defect A1's docstring warns about, and is not. A1 keys to the UNION
      // because either side can be absent at the point the count is formed; here
      // `skipIfMissing` has already guaranteed BOTH are non-empty strings before this
      // line runs, so there is no path on which a high `examined` covers a comparison
      // that never happened. The unit is IS marker-like tokens because that is the
      // population BOTH legs judge.
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: rawTokens,
      findings,
      message:
        `${rawTokens} raw SEG tokens, ${parsed} parsed, ${enParsed} EN parsed` +
        (findings.length ? ` — legs fired: ${findings.map((f) => f.leg).join(', ')}` : ''),
    };
  },
});

/**
 * A2c — no spaced `<!-- SEG: ` form in the MT output. BLOCKING.
 *
 * 🔴 IT HAS NO NATURAL FIXTURE AND THAT IS THE HAZARD, NOT AN INCONVENIENCE. Measured
 * 2026-09-02: **0 spaced forms across 207 live IS files carrying 29,607 canonical markers**
 * — and a guard that matches nothing is indistinguishable from one that is broken (L44③).
 * ▶ So the clean corpus is only interpretable BESIDE a planted trip, and the test carries
 * one that additionally proves the drop BY VALUE: 11 records become 10 on the same bytes.
 *
 * ⚠️ THE CONDITION IS NOT HYPOTHETICAL EVEN THOUGH THE CORPUS IS CLEAN — it is the exact
 * corruption `/v1/grammar` was measured to introduce into the sibling bracket markers
 * (`[[i:vatns]]` → `[[i: vatns]]`, returned as an ACCEPT-ABLE diffAnnotation), and the
 * model behind Miðeind's endpoints changes. A2c is the marker-side detector for the same
 * class, and it is why A2b's broader raw-token count exists beside it.
 */
export const A2c = defineCheck({
  id: 'A2c',
  tier: 2,
  blocking: true,
  version: 1,
  run: (ctx) => {
    const skip = skipIfMissing(ctx, 'A2c', ['isText']);
    if (skip) return skip;

    const spaced = ctx.isText.match(SPACED_SEG_RE) || [];
    const findings = spaced.length
      ? [{ kind: 'spaced-seg-marker', occurrences: spaced.length }]
      : [];

    return {
      // The unit is canonical markers that DID parse — the population a spaced form is
      // subtracted from. A file that is entirely spaced markers parses to 0 and FAILs at
      // `examined: 0`; `runCheck` downgrades only PASS, so the finding survives.
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: parseSegmentsMit(ctx.isText).length,
      findings,
      message: `${spaced.length} spaced SEG markers`,
    };
  },
});

/**
 * ⚠️ IDS ARE `A2b`/`A2c`, NOT `A2-b`/`A2(b)`, SO TASK 9's `A2a` SLOTS IN BESIDE THEM.
 * The registry keys on the id and `defineCheck` rejects a duplicate; the CLI prints it
 * verbatim and Plan C's ledger stores it, so the shape is a contract, not a label.
 */
export const MT_FREE_CHECKS = [A1, A6, A2b, A2c];

// 🔴 REGISTRATION HAPPENS AT IMPORT TIME, AND ONLY `tools/remt-battery.js` IMPORTS THIS
// MODULE. Nothing else puts a check in the REGISTRY (§C82 L3) — without the import at the
// CLI's wiring point, `--tier 2` selects zero checks. Do NOT import this from
// `lib/remt-battery.js` to make it automatic: hoisting evaluates this file first and the
// `defineCheck` calls above die in the temporal dead zone.
registerChecks(MT_FREE_CHECKS);

// ─── Tier 2, the run-record half: A2a, A4, A8 (Task 9) ────────────────────────────────
/**
 * 🔴 THESE THREE READ A COUNTER, AND THE COUNTER IS THE ONLY EVIDENCE THERE IS.
 *
 * `repairSegTags`, `normalizeSegMarkers` and `unwrapInventedMarkers` all fix their
 * finding and proceed, BEFORE `02-mt-output` is written. So a post-hoc scan of the file
 * reads identically for a clean run and a heavily-repaired one — A4's file-scan form is
 * a TAUTOLOGY, holding whether the model invented 9 markers or 900. The run record is
 * where that evidence survives, which is why these checks exist at all.
 *
 * ── THE SHAPE DRIFT THIS TASK FOUND, AND WHY IT COULD NOT HAVE BEEN CAUGHT LATER ─────
 * 🔴 PLAN B:738 SPECIFIES A4 AS READING `run.unwrapped[]`. `buildRunRecord()` HAS NEVER
 * WRITTEN THAT KEY — it converts the caller's `unwrapped` array into `unwrappedCount`
 * (a number) and `unwrappedByType` (a `{type: count}` tally); `writeProvenance` then
 * stores the record OPAQUELY, so nothing downstream restores the original shape.
 * Written as specified — `(run.unwrapped || []).length` — A4 reports 0 findings and
 * PASS on every v2 sidecar that will ever be written.
 * ▶ AND NO CORPUS COULD HAVE FALSIFIED IT: measured 2026-08-26, **0 of 200** committed
 * sidecars carry a run record, so the first real one arrives MID-PAID-RUN. Check and
 * fixture would have agreed with each other and disagreed with the producer, green
 * throughout. The structural answer lives in the test file: every fixture meant to be
 * READ is built by CALLING `buildRunRecord()`, so a producer rename goes red here
 * instead of shipping a silent pass. §C82 L45's shape — a plan's stated field is a
 * PREMISE, and premises go stale; re-derive it from the producer before inheriting it.
 *
 * ── THE THREE KINDS OF "NOTHING". CONFLATING ANY TWO IS THE DEFECT ───────────────────
 *   1. `ctx.provenance` absent / not a plain object → SKIPPED, the ctx key named
 *   2. a v1 sidecar, or v2 with no `run`            → SKIPPED, `examined: 0`
 *   3. a `run` whose FIELD is absent or mistyped    → SKIPPED, the FIELD named
 * Case 2 is Task 9's deliverable: it is the state of the ENTIRE committed corpus, and
 * §C60's rule is that it must report SKIPPED rather than a clean zero. Case 3 is where
 * a single `|| []` would have hidden the drift above forever, which is why nothing here
 * coerces (§C82 L1). All three are ADVISORY, so none of this moves the blocking split.
 *
 * ── `examined` IS THE NUMBER OF RECORDS READ — 0 OR 1 — NEVER THE COUNTER'S VALUE ────
 * A genuinely clean module (`markersNormalized: 0`, record present) is a real
 * measurement and reads PASS at `examined: 1`. Key `examined` to the counter instead and
 * `runCheck` downgrades PASS+0 to SKIPPED — making a clean module indistinguishable from
 * one that predates the writer, which is precisely the distinction these checks exist to
 * draw. §C82 L6/L44②: `examined` is keyed to CONTENT actually parsed.
 */

/** The PAYLOAD test, not the container test: `typeof null` and `typeof []` are both 'object' (L33/L35). */
function isPlainRecord(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** What a rejected value actually was — a diagnostic that survives JSON round-tripping. */
function describeType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/**
 * The three field kinds a run record carries. Deliberately TIGHTER than `typeof`:
 * a count is a non-negative integer, so `-1`, `1.5` and `NaN` are defects rather than
 * values. `estimatedIsk` is genuinely fractional and so is only required to be finite.
 */
const FIELD_KIND = Object.freeze({
  count: (v) => Number.isInteger(v) && v >= 0,
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  record: isPlainRecord,
});

/**
 * Resolve `ctx.provenance.run`, or the SKIPPED result naming which "nothing" applied.
 *
 * @param {object} ctx
 * @param {string} id      the check, for the message
 * @param {Array<[string, 'count'|'number'|'record']>} fields  what this check reads
 * @returns {{skip: object}|{skip: null, run: object}}
 */
function readRunRecord(ctx, id, fields) {
  const skip = (message) => ({
    skip: { verdict: VERDICT.SKIPPED, examined: 0, findings: [], message: `${id}: ${message}` },
  });

  if (!isPlainRecord(ctx?.provenance)) {
    return skip(
      `ctx carries no usable provenance object (got ${describeType(ctx?.provenance)}) — nothing to examine`
    );
  }
  const run = ctx.provenance.run;
  if (!isPlainRecord(run)) {
    // The whole committed corpus lands here. The wording is load-bearing: it says no
    // counters were CAPTURED, not that the module is clean.
    // ⚠️ AND IT MUST NOT NAME A SINGLE CAUSE. `writeProvenance` stamps `schemaVersion: 2`
    // UNCONDITIONALLY and attaches `run` only when one is passed, so v2-without-run is a
    // normal on-disk state, not a legacy one: of three production callers only
    // `api-translate.js:1347` passes a record — `docx-import.js:829` and
    // `backfill-provenance.js:36` write this shape TODAY. An earlier wording asserted
    // "the module predates the run-record writer" as the cause, which is false for both
    // of them. The message is the ONLY thing that distinguishes the three kinds of
    // nothing, so a confident wrong cause here defeats the point of the check.
    return skip(
      `no run record on this sidecar (schemaVersion ${JSON.stringify(ctx.provenance.schemaVersion)}, run is ${describeType(run)}) — no counters were captured: either the module predates the writer, or its producer emits none (docx-import and backfill-provenance both stamp v2 with no run). No evidence either way`
    );
  }
  const bad = fields.filter(([name, kind]) => !FIELD_KIND[kind](run[name]));
  if (bad.length) {
    // 🔴 NOT A CLEAN ZERO. A field the producer stopped writing — or never wrote — is a
    // shape disagreement between producer and consumer, and the only safe reading of it
    // is "this check did not run".
    return skip(
      `the run record carries no usable ${bad.map(([n, k]) => `\`${n}\` (${k}, got ${describeType(run[n])})`).join(' or ')} — a missing field is a producer/consumer shape drift, not a clean zero`
    );
  }
  return { skip: null, run };
}

/**
 * A2a — SEG markers the MT glued together and `normalizeSegMarkers` pulled apart. ADVISORY.
 *
 * A REPAIRED condition: by the time `02-mt-output` exists the file is clean, so the
 * counter is the only evidence the damage ever happened. WARN → Plan C quarantine.
 */
export const A2a = defineCheck({
  id: 'A2a',
  tier: 2,
  blocking: false,
  version: 1,
  run: (ctx) => {
    const { skip, run } = readRunRecord(ctx, 'A2a', [['markersNormalized', 'count']]);
    if (skip) return skip;

    const n = run.markersNormalized;
    const findings = n > 0 ? [{ kind: 'markers-normalized', occurrences: n }] : [];
    return {
      verdict: findings.length ? VERDICT.WARN : VERDICT.PASS,
      examined: 1,
      findings,
      message: `${n} SEG markers re-glued by normalizeSegMarkers`,
    };
  },
});

/**
 * A4 — glossary markers the MT invented and `unwrapInventedMarkers` removed. ADVISORY.
 *
 * An input to the §C82 ③ glossary-arm decision: if the glossary arm invents markers at a
 * materially higher rate than the no-glossary arm, that is a cost of the arm and it is
 * visible nowhere else.
 *
 * ⚠️ THE UNIT IS THE TYPE, NOT THE ITEM — the plan assumed a per-item array and asserted
 * `toHaveLength(2)` for two items. The producer tallies (`{i: 2, term: 1}`), so one
 * finding per type carrying its own count is what the data supports; the total rides in
 * `message`. Richer than the plan assumed, not poorer.
 */
export const A4 = defineCheck({
  id: 'A4',
  tier: 2,
  blocking: false,
  version: 1,
  run: (ctx) => {
    const { skip, run } = readRunRecord(ctx, 'A4', [
      ['unwrappedCount', 'count'],
      ['unwrappedByType', 'record'],
    ]);
    if (skip) return skip;

    const count = run.unwrappedCount;
    const byType = run.unwrappedByType;
    const findings = Object.entries(byType).map(([type, occurrences]) => ({
      kind: 'invented-marker',
      type,
      occurrences,
    }));

    // NOT a self-referential invariant (§C82 L46): `.length` and `tallyByType` are
    // computed by different code from the same input, so damage to one does not move the
    // other. It is the only detector here for a sidecar edited after it was written.
    const tallied = Object.values(byType).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
    if (tallied !== count) {
      findings.push({ kind: 'tally-disagrees-with-count', count, tallied });
    }

    return {
      verdict: findings.length ? VERDICT.WARN : VERDICT.PASS,
      examined: 1,
      findings,
      message: `${count} invented markers unwrapped across ${Object.keys(byType).length} type(s)`,
    };
  },
});

/**
 * A8 — the module's input size and its cost estimate. RECORD ONLY, and deliberately so.
 *
 * 🔴 IT PASSES NO JUDGEMENT ON THE NUMBERS, AND MANUFACTURING ONE WOULD BE §C82 L46
 * VERBATIM. `estimatedIsk` is `estimateIsk(chars)` = `chars * ISK_PER_1000_CHARS / 1000`
 * (`tools/lib/malstadur-api.js:39`) — a pure linear function of `chars`. Recomputing it
 * and comparing would be a predicate whose two sides derive from one input: both move
 * together and the comparison cancels. The plan's "compare CHARACTERS, never
 * estimate-vs-estimate from one function" is exactly this, and the way to honour it is
 * to SURFACE `chars` as the comparable quantity rather than to invent a verdict.
 *
 * ⚠️ ITS ONE FAILURE MODE IS A TYPE, NOT A VALUE, AND THE DISTINCTION IS THE WHOLE POINT.
 * `usage` is the only independently-sourced number here — it comes back from the API
 * rather than from us — and its VALUE is still not a predicate: `usageUnits()` returns 0
 * for any shape it does not recognise, so `0` is ambiguous between "nothing was billed"
 * and "the shape changed and we could not read it", and a gate built on the value would
 * report the second as the first. But its TYPE is not ambiguous at all, and a `usage`
 * that is present and NOT a finite number is a real, once-live producer bug. That is
 * reported. See the body for what is and is not known about its history.
 *
 * The values ride in `message` because `runCheck` normalises the result to the contract's
 * five keys — an extra `record` key would be dropped silently on the way to the ledger.
 */
export const A8 = defineCheck({
  id: 'A8',
  tier: 2,
  blocking: false,
  version: 1,
  run: (ctx) => {
    const { skip, run } = readRunRecord(ctx, 'A8', [
      ['chars', 'count'],
      ['estimatedIsk', 'number'],
    ]);
    if (skip) return skip;

    // 🔴 A MALFORMED `usage` IS REPORTED, NOT DROPPED — this is the only field here with a
    // real history of arriving wrong. `api-translate` did `totalUsage += result.usage || 0`
    // from `0` while the Málstaður client returns an OBJECT, and `0 + {}` in JS is string
    // concatenation. The suite could not see it because producer and consumer were stubbed
    // differently — the seam was untested by construction.
    // ⚠️ AND HERE IS THE PART THAT MUST NOT BE OVERSTATED, BECAUSE THIS COMMENT SAID IT
    // AND IT WAS WRONG: the corrupted value NEVER REACHED A SIDECAR. Measured 2026-08-26 —
    // 242 provenance sidecars corpus-wide, ALL `schemaVersion: 1`, and 0 carrying a
    // `usage` field at all. The run record was wired at `c91a7a7a` (2026-08-16 06:23Z) and
    // the accumulation was fixed at `dac671b0` (19:48Z the SAME DAY); no run happened in
    // that ~13-hour window. So the bug is real and the shape is real, but "it shipped into
    // every sidecar for months" was a confident cause the evidence does not support — the
    // §C82 L50 shape, in the very comment written to close L50. `run-record.js`'s own
    // docstring carried the same overstatement and is corrected in the same commit.
    // ▶ THE CHECK IS RIGHT EITHER WAY: coercing a wrong shape to empty and returning PASS
    // is forbidden here whatever the field's history (L1), and A8 is the ONLY check that
    // reads `usage`, so a silent drop leaves a recurrence with no observer in the battery.
    // ⚠️ The earlier form was `FIELD_KIND.number(run.usage) ? ... : ''` — a coerce-to-empty
    // on a wrong shape followed by PASS, which is exactly what this file's own header says
    // it does not do (§C82 L1). Measured: it rendered `"0[object Object]"`, `{units: N}`,
    // `null` and ABSENT byte-identically, so the historical bug was indistinguishable from
    // a field that was never written.
    // ▶ THE DISCRIMINATOR IS THE KEY, NOT THE VALUE. `JSON.stringify` drops an undefined
    // value, so a sidecar that never carried a usage has no key at all — absent is silence,
    // present-and-mistyped is a finding.
    const findings = [];
    let usagePart = '';
    if (Object.prototype.hasOwnProperty.call(run, 'usage')) {
      if (FIELD_KIND.number(run.usage)) {
        usagePart = ` usage=${run.usage}`;
      } else {
        usagePart = ' usage=MALFORMED';
        findings.push({
          kind: 'malformed-usage',
          got: describeType(run.usage),
          value: String(run.usage).slice(0, 40),
        });
      }
    }

    // ⚠️ SO A8 HAS EXACTLY ONE FAILURE MODE, AND IT IS NOT A COST JUDGEMENT. It never
    // compares an estimate against anything (that would be L46's self-referential
    // invariant); it reports a field the producer PROMISED and did not deliver.
    return {
      verdict: findings.length ? VERDICT.WARN : VERDICT.PASS,
      examined: 1,
      findings,
      message: `chars=${run.chars} estimatedIsk=${run.estimatedIsk}${usagePart}`,
    };
  },
});

/** Tier 2's run-record half. Registered separately so the two halves stay legible. */
export const MT_RUNRECORD_CHECKS = [A2a, A4, A8];

registerChecks(MT_RUNRECORD_CHECKS);

/* ═══ Tier 2, the GATING half — A3, A5, A7 ═════════════════════════════════════
 *
 * ── THE ctx THESE THREE ADD, AND WHY EACH IS A HARD REQUIREMENT ───────────────
 * `segText` + `isText`  A3, A5, A7 are all two-sided. `segText` is now consumed by
 *                       FIVE checks (A1, A2b, A3, A5, A7), not the two the file header
 *                       listed before this task — when a check starts consuming a ctx
 *                       key, that list is part of the change.
 * `module`              A5 only — the EXISTING scope key, not a new near-duplicate.
 *                       `residue-allowlist.json` is keyed on exact `moduleId` +
 *                       `segmentId`, so without it nothing can be tolerated. ⚠️ A second
 *                       key named `moduleId` was written first and withdrawn: a loader
 *                       that set `module` would have left A5 permanently SKIPPED, and on
 *                       an ADVISORY check that reads as ignorable rather than as broken.
 * `residueAllowlist`    A5 only, the PARSED allowlist object. 🔴 IT CANNOT BE READ HERE:
 *                       Global Constraints rule 5 makes gates pure, and
 *                       `loadResidueAllowlist` does file I/O. The loader supplies it.
 *
 * 🔴 AND FOR A5 THE ABSENT CASE IS THE DANGEROUS ONE, NOT THE MALFORMED ONE.
 * `classifyResidue` does `(allowlist.entries || [])`, so an absent — or merely empty —
 * allowlist tolerates NOTHING and every known-good residue fires: measured, `m68662`
 * alone contributes 76. A check that treated absent as "no exclusions" would report 76
 * findings on a module a human already triaged, and it would look like a real result.
 * So a missing `residueAllowlist` is SKIPPED with the key named — L33(E9), the ruling
 * this file already applies to `isText` and `provenance`.
 *
 * 🔴 BUT THIS GATE ALONE CANNOT CLOSE IT, AND PRETENDING OTHERWISE IS THE WHOLE TRAP.
 * `loadResidueAllowlist(bookDir)` — the loader the CLI typedef used to name — returns
 * `{ entries: [] }` for a MISSING FILE and for a real allowlist that tolerates nothing.
 * The two states are byte-identical in its return value, so the guard below **accepts the
 * exact value the absent case produces** and the zero-tolerance state it exists to refuse
 * walks straight past it. Gates are pure (Global Constraints rule 5), so no check can go
 * and look at the filesystem to tell them apart.
 * ▶ THE FIX IS AT THE BOUNDARY, NOT HERE: `loadResidueAllowlistOrNull()` was added to
 * `tools/lib/residue-allowlist.js` and returns **`null`** when the file is absent. Plan
 * C's loader MUST use it; `null` is not a plain record, so the guard then fires.
 * ▶ This is CLAUDE.md's §C21 lesson verbatim — **a gate keyed on one representation of
 * "nothing" can be walked past by another representation of "nothing"** — and it is the
 * second time in this file's history that the shape has appeared. Found by adversarial
 * review 2026-08-26; no test could see it, because every test supplied its own ctx.
 *
 * ── WHAT THE MEASUREMENT DECIDED, AGAINST THE PLAN ────────────────────────────
 * 🔴 ALL THREE ARE ADVISORY, AND THE PLAN'S TASK HEADING SAYS "A3 gating".
 * Global Constraints rule 4 — a post-MT check that blocks needs a measured base rate
 * ≤ ~5% — beats a task heading. Measured 2026-08-26 over the 197 run-target pairs
 * (chemistry 149 + organic 48; `orverufraedi` excluded per §C80/§C109):
 *   A3   107/197 = 54.31% of modules carry a per-segment delta. Splitting by whether
 *        the EN side's last commit POSTDATES the IS side's separates it cleanly:
 *        96 skewed pairs trip at 100.00%, 101 comparable pairs at 10.89%. The skew is
 *        not a defect — commit `689ddf3e` (2026-07-07) re-extracted 143 modules
 *        WITHOUT re-running MT and said so in its subject line ([STALE-STRUCT]); on
 *        `m68798` the EN side carries 219 `[[i:]]` and the IS side 0. **Blocking is
 *        refused on BOTH numbers (54.31% and 10.89%), so the verdict does not depend
 *        on the split.** The run re-extracts AND re-MTs, which retires the 96-pair
 *        category, so 10.89% is the number that predicts the run.
 *   A5   stage 1 is 5/166 = 3.01% (chemistry 1/149 = 0.67%, organic 4/17 = 23.53%),
 *        which is UNDER the bar — and it still does not block.
 *        🔴 BUT NOT FOR THE REASON THE PLAN GIVES, WHICH IS FALSE AS STATED. The plan
 *        says the allowlist is "wholly voided" because it is segmentId-keyed and the
 *        re-extract renumbers seg-ids. MEASURED 2026-08-26: `generateSegmentId`
 *        (`cnxml-extract.js:119`) returns `${moduleId}:${type}:${elementId}` whenever the
 *        source element HAS an id, and only falls back to `auto-${counter}` when it does
 *        not — element ids come from READ-ONLY `01-source`, which cannot drift by project
 *        rule. **ALL 16 allowlist entries (chemistry 4, organic 12) use the element-id
 *        form; ZERO use `auto-N`**, though 22.1% of corpus seg-ids overall do. So the
 *        allowlist largely SURVIVES the re-extract.
 *        ▶ THE HONEST REASONS A5 STAYS ADVISORY: (1) the post-run base rate is
 *        UNMEASURED, and organic's 23.53% today is over **seventeen** modules of a
 *        342-module book that is 5% extracted; (2) the re-extract changes which segments
 *        exist and what they contain, so a surviving KEY is not a surviving JUDGEMENT.
 *        ⚠️ This is §C82 L45 a second time — the conclusion held and the reason did not,
 *        which is the case that reads as agreement.
 *   A7   `numberKey` strips every non-digit, so `3.5` and `35` collide by design.
 * ▶ Full record, with the per-type histogram and the threshold sensitivity sweep:
 *   `test-results/c82-a3-baserate-2026-08-26.md`.
 *
 * ⚠️ THE WIDENING IS NOT WHAT DISQUALIFIED A3, AND THE RECORD SHOULD NOT BE READ THAT
 * WAY: modules tripping on the PRE-widening type set are 105/197 = 53.30%, and the
 * types added by §C69 account for 2/197 = 1.02% on their own. The widening closes four
 * proven false negatives for ~1%.
 *
 * ── `examined` MEANS TWO DIFFERENT UNITS IN THIS TIER, DELIBERATELY. STATED HERE SO THE
 *    LEDGER DOES NOT HAVE TO INFER IT ─────────────────────────────────────────────────
 *   A3      EN-side segment OCCURRENCES (`d.segmentsExamined`), INCLUDING ones with no IS
 *           counterpart — because A3 does not drop an unpaired occurrence, it REPORTS it
 *           as an `unpaired-segment` finding, so nothing leaves the population silently.
 *   A5, A7  PAIRED segments only (`pairs.size`) — an unpaired occurrence is A1's and A3's
 *           finding, and counting it here would report a comparison that never ran.
 * ▶ SO FOR ONE MODULE THESE CHECKS CAN REPORT DIFFERENT DENOMINATORS, AND THAT IS
 * CORRECT RATHER THAN A DRIFT. Each is keyed to content its own predicate actually judged
 * (Global Constraints rule 7); a single shared denominator would make one of them lie.
 * ⚠️ **Plan C's ledger must not sum or compare `examined` ACROSS checks in this tier**, and
 * must not compute a per-tier "coverage" from them. This is written down because the same
 * shape one field over — `segmentId` — shipped as a real defect (§C82 L54): two units that
 * agree on most inputs are still two units, and the divergence needs deciding once, here,
 * rather than discovered later by a consumer.
 */

/**
 * Pair EN and IS segments by OCCURRENCE, keyed exactly as
 * `bracketMarkerDeltaBySegment` keys them internally.
 *
 * ⚠️ THE KEYING IS COPIED DELIBERATELY AND IS NOT AN IMPLEMENTATION DETAIL. A3 gets its
 * segment ids from `api-translate.js`'s `buildOccurrenceMap` (`:536`, NOT exported), and
 * A5/A7 must report the same id for the same piece of text or the ledger cannot join
 * their findings. First occurrence keeps the bare seg-id; occurrence n>1 becomes
 * `segId#(n-1)` — **0-BASED ON THE REPEATS**, which is what the original does.
 *
 * 🔴 AND THE IDENTITY IS PINNED BY A CROSS-CHECK TEST, NOT BY THIS COMMENT. It shipped
 * WRONG once: a 1-based suffix put `#2` here against `#1` there, so `id#2` named the
 * third occurrence in A3 and the second in A5/A7. Every test passed, because each
 * check's tests only ever read its own keys — an identity claim that nothing
 * cross-checks is worth nothing.
 *
 * ⚠️ THE IDENTITY HOLDS FOR THE HTML-COMMENT DIALECT AND **NOT** FOR THE MUSTACHE ONE,
 * and that asymmetry is safe rather than accidental. `buildOccurrenceMap` splits on
 * `/(?=<!-- SEG:)/`, so it sees ZERO segments in a `{{SEG:…}}` file, while
 * `parseSegmentsMit` normalises the mustache form first and sees all of them. Measured:
 * A3 `examined: 0` vs A7 `examined: 2` on the same input. ▶ A3 therefore reports
 * **SKIPPED, not PASS** (`runCheck` downgrades PASS+0), so the module is visible rather
 * than cleared — and the dialect is caught upstream anyway by **A2b, which is BLOCKING**
 * and carries the `inject-dialect` leg for exactly this. **Do not "unify" the two
 * parsers to close it:** `parseSegmentsMit`'s normalisation is what makes the AGPL
 * equivalence pin hold, and A3 must keep using its instrument by identity (§C82 L41).
 *
 * ⚠️ AND THE REPEAT SUFFIX IS LOAD-BEARING, NOT COSMETIC: a duplicated raw `SEG:` marker's
 * second occurrence is a real, independent piece of translated text. Keying on the bare
 * id (as a `parseSegmentsMap`-style 'first wins' map would) silently drops every finding
 * confined to the rest — which is the duplicate-emission artifact E4 exists to find.
 *
 * @param {string} enText
 * @param {string} isText
 * @returns {Map<string, {en: string, is: string}>} only ids present on BOTH sides
 */
function pairByOccurrence(enText, isText) {
  const index = (text) => {
    const seen = new Map();
    const out = new Map();
    for (const r of parseSegmentsMit(text)) {
      // 🔴 `idx` IS OCCURRENCES SEEN *BEFORE* THIS ONE, NOT INCLUDING IT — copied from
      // `buildOccurrenceMap` (api-translate.js:540) line for line. An earlier version
      // used a 1-based count and produced `#2` where A3 produces `#1`, so THE SAME KEY
      // NAMED DIFFERENT SEGMENTS in the two checks and Plan C's ledger join would have
      // mis-attributed silently. Four review lenses found it independently; no test
      // caught it, because each check's tests only ever read its own keys.
      const idx = seen.get(r.segmentId) || 0;
      seen.set(r.segmentId, idx + 1);
      out.set(idx === 0 ? r.segmentId : `${r.segmentId}#${idx}`, r.content);
    }
    return out;
  };
  const en = index(enText);
  const is = index(isText);
  const out = new Map();
  for (const [id, text] of en) if (is.has(id)) out.set(id, { en: text, is: is.get(id) });
  return out;
}

/**
 * A3 — per-segment, per-type, bidirectional bracket-marker delta. ADVISORY (measured).
 *
 * 🔴 THE VERDICT KEYS ON `bySegment`, NEVER ON `total`, AND THIS IS THE WHOLE REASON THE
 * CHECK WAS MADE PER-SEGMENT. `bracketMarkerDeltaBySegment` DELETES types whose
 * per-segment deltas sum back to zero (`api-translate.js:612`, comment: "noise in
 * `total` but their segments are already counted in segmentsWithDelta"). So a module
 * that loses a `MATH` in one segment and gains one in another has `total === {}` and two
 * `bySegment` entries — real destruction, invisible to a `total`-keyed predicate.
 * ⚠️ AND THE PLAN'S ACCEPTANCE TRIO IS WRITTEN IN `total`-SHAPED NOTATION (`m68791 → {}`,
 * `m58781 → {"b":-2}`), so a literal transcription builds the cancelling design.
 * 🔴 THE CORPUS CANNOT CATCH THAT MISTAKE: measured over all 197 run-target pairs the two
 * predicates agree EXACTLY (107 = 107; cancel-only modules = 0). The planted
 * cross-segment fixture in the test file is the ONLY detector — the L44③ shape, where a
 * natural rate of 0 is also what a wholly broken detector returns.
 *
 * ⚠️ `unpairedSegIds` IS FOLDED IN AS ITS OWN FINDING KIND, deliberately. The
 * instrument's own docstring: "a missing occurrence is a worse defect than a marker delta
 * and a comparison that quietly drops it reads as clean." Reading only `bySegment` passes
 * a module whose segments went missing entirely. Measured cost: 4 modules, 2.03% — it
 * does not move the blocking verdict either way, so this is a correctness choice rather
 * than a rate one.
 */
export const A3 = defineCheck({
  id: 'A3',
  tier: 2,
  blocking: false,
  version: 1,
  run: (ctx) => {
    // Both keys, in this order, so the message names the side the loader dropped.
    const skip = skipIfMissing(ctx, 'A3', ['segText', 'isText']);
    if (skip) return skip;

    const d = bracketMarkerDeltaBySegment(ctx.segText, ctx.isText);

    const findings = Object.entries(d.bySegment).map(([segmentId, delta]) => ({
      kind: 'marker-delta',
      segmentId,
      delta,
    }));
    for (const segmentId of d.unpairedSegIds)
      findings.push({ kind: 'unpaired-segment', segmentId });

    return {
      // WARN, not FAIL — advisory by measurement, and the WARN is what makes it visible
      // in the readout rather than silently clean.
      verdict: findings.length ? VERDICT.WARN : VERDICT.PASS,
      // ⚠️ THE UNIT IS EN-SIDE SEGMENT OCCURRENCES — content this check actually parsed
      // (L6/L44②). Nothing is silently filtered out of it: an occurrence that had no
      // counterpart is not dropped from the population, it becomes an `unpaired-segment`
      // finding. And a `segText` that parses to zero segments yields `examined: 0`, which
      // `runCheck` converts to SKIPPED rather than a clean pass.
      examined: d.segmentsExamined,
      findings,
      message: `${d.segmentsWithDelta}/${d.segmentsExamined} segments with a marker delta, ${d.unpairedSegIds.length} unpaired; total ${JSON.stringify(d.total)}`,
    };
  },
});

/** Alphabetic characters left after markers, digits and punctuation are stripped. */
const alphaLength = (text) => normalizeForComparison(text).replace(/\s/g, '').length;

/**
 * A5 stage 2's floor: identical AND this many alphabetic characters after stripping.
 *
 * ⚠️ IT SITS ON A PLATEAU, WHICH IS WHY THE EXACT CONSTANT IS SAFE. Measured over the
 * 197 run-target pairs: ≥60 → 10 segments, ≥80 → 8, **≥100 → 7, ≥120 → 7, ≥150 → 7,
 * ≥200 → 7**. The count does not turn on the value, so this is a choice with margin
 * rather than a tuned threshold that a corpus change will invalidate quietly.
 */
export const A5_LONG_RESIDUE_MIN_ALPHA = 120;

/**
 * A5 — untranslated-EN residue, in two stages. ADVISORY (sequencing, not rate).
 *
 * Stage 1 (`en-residue`)      `detectResidue(...).exact`, minus the allowlist.
 * 🔴 THAT IS THREE CONJUNCTS, NOT ONE, AND DESCRIBING IT AS "EN == IS" OVERSTATES THE
 * POPULATION BY ~83×. `detectResidue` returns `exact` only when ALL of: ① the normalized
 * strings are equal, ② the segment is NOT `isLanguageNeutral` (a formula/unit cell), and
 * ③ it clears the `minTokens: 3` content-word floor. Measured over the 22,158 paired
 * non-exercises segments: **6,940 (31.3%) are normalized-identical**, of which **6,851 are
 * demoted by ② and ③**, leaving A5's actual stage-1 output at **84** findings.
 * ▶ **6,940 : 84 = 82.6×.** This matters concretely, not academically: anyone re-deriving
 * `residue-allowlist.json` from the one-conjunct description would enumerate a candidate
 * set eighty-three times too large and conclude the job is impossible.
 * Stage 2 (`long-en-residue`) a stage-1 hit that is also ≥120 alphabetic characters —
 *                             long enough to be certainly prose rather than a formula or
 *                             a unit cell. WARN → a human queue, never a halt.
 *
 * ⚠️ STAGE 2 IS A STRICT SUBSET OF STAGE 1, INCLUDING THE ALLOWLIST FILTER, AND THAT IS A
 * DECISION THE CORPUS CANNOT ADJUDICATE. An allowlist entry records a human triage
 * ("proper-noun", with a reason), so re-queueing it for a human contradicts the record;
 * stage 2's job is to PRIORITISE stage 1, not to re-open it. ▶ Measured, the two designs
 * are indistinguishable today — none of the 7 stage-2 hits is allowlisted — so the test
 * file pins the distinction with a planted allowlisted long segment. Same shape as A3's
 * `total`-vs-`bySegment` fixture: where the corpus cannot separate two designs, the
 * separation has to be planted.
 *
 * ⚠️ NO SECOND STRIPPER IS WRITTEN HERE. `detectResidue` already returns `exact`
 * (`enNorm === isNorm`, marker-stripped) and `normalizeForComparison` is already
 * strip-markers → drop digits → Unicode letters → lowercase. ⚠️ And do NOT reach for
 * `detectResidue`'s `ratio` — it is a different quantity that happens to ride in the
 * same return object.
 *
 * ⚠️ `detectResidue` DEMOTES language-neutral verbatim-EN (a formula/unit cell) to
 * `exact: false`. That is wanted, and at stage 2's floor it is also inert: measured, a
 * raw `normalizeForComparison` equality and `detectResidue(...).exact` select the SAME 7
 * segments, so the reuse is demonstrated equivalent rather than assumed.
 */
export const A5 = defineCheck({
  id: 'A5',
  tier: 2,
  blocking: false,
  version: 1,
  run: (ctx) => {
    const skip = skipIfMissing(ctx, 'A5', ['segText', 'isText', 'module']);
    if (skip) return skip;
    // 🔴 ABSENT IS NOT "NOTHING IS TOLERATED" — see the tier header. A missing allowlist
    // would turn `m68662`'s 76 triaged residues into 76 findings that look real.
    if (!isPlainRecord(ctx.residueAllowlist)) {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message: `A5: ctx carries no usable residueAllowlist (got ${describeType(ctx.residueAllowlist)}) — an absent allowlist tolerates nothing, which would report triaged residues as findings`,
      };
    }

    // 🔴 THE EXERCISES BUNDLES ARE SKIPPED BY EXACT NAME, AND THIS MIRRORS AN EXISTING
    // DELIBERATE EXCLUSION RATHER THAN INVENTING ONE. `tools/scan-residue.js`'s
    // `collectResidueFiles` drops `exercises-segments.is.md` for two reasons that both
    // apply here: every chapter has one, so they all fold to the single key 'exercises';
    // and the allowlist entries for that content are keyed by NICKNAME, not by 'exercises'.
    // ▶ MEASURED 2026-08-26: all 12 of organic's allowlist entries are nickname-keyed
    // (`11-03-OC-P06`, `26-04-OC-P08`, …) and NOT ONE is reachable from the file's
    // basename, so a lookup here can never tolerate anything — every residue in an
    // exercises bundle would report as untriaged. That is ~11 of organic's 20 stage-1
    // residues turned into false findings by construction.
    // ▶ `tools/exercise-assemble.js` is the authoritative residue gate for os-embed
    // exercise content — nickname-keyed, per-chapter, already wired into the inject-stage
    // exit code — so skipping here delegates rather than leaving the content unchecked.
    // ⚠️ THE GUARD LIVES IN THE GATE, NOT IN THE LOADER, ON PURPOSE: a loader can forget
    // it, and the failure mode is silent over-reporting that looks like a real result.
    if (ctx.module === 'exercises') {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message: `A5: 'exercises' is a per-chapter bundle, not a module — its allowlist entries are nickname-keyed and unreachable from this id, so nothing here could be tolerated. exercise-assemble.js is the authoritative residue gate for this content`,
      };
    }

    const pairs = pairByOccurrence(ctx.segText, ctx.isText);
    const findings = [];
    let tolerated = 0;
    for (const [segmentId, { en, is }] of pairs) {
      if (!detectResidue(en, is).exact) continue;
      // The allowlist is keyed on the BARE seg-id; a repeat occurrence carries the same
      // triage decision as its first, so the `#N` suffix is stripped for the lookup only.
      const verdict = classifyResidue(
        ctx.module,
        segmentId.replace(/#\d+$/, ''),
        ctx.residueAllowlist
      );
      if (verdict.tolerated) {
        tolerated++;
        continue;
      }
      const alpha = alphaLength(is);
      findings.push({ kind: 'en-residue', segmentId, alpha });
      if (alpha >= A5_LONG_RESIDUE_MIN_ALPHA) {
        findings.push({ kind: 'long-en-residue', segmentId, alpha });
      }
    }

    return {
      verdict: findings.length ? VERDICT.WARN : VERDICT.PASS,
      // The unit is PAIRED segments — the population the predicate actually judged. An
      // unpaired segment is A1's and A3's finding, not A5's; counting it here would
      // report a comparison that never ran.
      examined: pairs.size,
      findings,
      message: `${findings.filter((f) => f.kind === 'en-residue').length} EN residues (${findings.filter((f) => f.kind === 'long-en-residue').length} long) over ${pairs.size} paired segments, ${tolerated} tolerated by the allowlist`,
    };
  },
});

/* ── A7: the MIT port of `server/services/qaCheckService.js`'s number check ─────
 *
 * 🔴 NOTHING HERE IMPORTS `server/`. `tools/` is MIT and `server/` is AGPL-3.0, and root
 * LICENSE enumerates the existing edges — `qaCheckService` is not among them and this
 * task does not add it. The port's equivalence to the original is PINNED IN THE TEST,
 * which may `require` the AGPL file because the test suite is not shipped tooling.
 *
 * 🔴 `checkNumbers` CANNOT BE PORTED ALONE, AND `residue-check.js`'s STRIPPER IS NOT A
 * SUBSTITUTE. It calls `extractNumbers` → `stripMath(stripMarkers(text))`, both private
 * to that file, and the two repos' `stripMarkers` differ materially: qaCheckService's
 * DROPS `xref`/`docref` entirely and unwraps `{{type}}…{{/type}}` and `++…++`;
 * `residue-check.js`'s KEEPS the text before `|` for every type and drops `[#id]`.
 * Swapping them changes which numbers are extracted. So all five functions come across
 * as a set.
 *
 * 🔴 AND BOTH `extractNumbers` REGEXES CARRY INVISIBLE CHARACTERS THAT A HAND
 * TRANSCRIPTION LOSES SILENTLY. Measured by code point, not by eye: the numeric
 * character class in the ORIGINAL contains U+00A0 (NBSP) and U+2009 (THIN SPACE)
 * alongside the ASCII space, in BOTH the match and the trailing-trim.
 * ▶ They are written here as explicit `\u00A0` / `\u2009` escapes — behaviourally
 * identical, but VISIBLE to a reader and to a grep, which the raw bytes are not
 * (CLAUDE.md § invisible control bytes: a `U+2009` does not render, so `[.,  ]` and
 * `[., ]` look the same in a diff).
 * ▶ They are LOAD-BEARING, not decorative: NBSP and thin space are exactly the thousands
 * separators European and Icelandic number formatting uses, so dropping them splits
 * `1 000` into `1` and `000` and invents two findings where there are none.
 */

/** Remove `[[MATH:N]]` placeholders (their index is not content). */
const stripMathA7 = (text) => text.replace(/\[\[MATH:\d+\]\]/g, ' ');

/** Strip inline markers to their inner text (display text for pipe forms). */
function stripMarkersA7(text) {
  return text
    .replace(/\[\[(?:link|xref|docref):([^\]|]*)\|[^\]]*\]\]/g, '$1')
    .replace(/ ?\[\[(?:xref|docref):[^\]]*\]\]/g, '')
    .replace(/\[\[(?:i|b|sub|sup):([^\]]*)\]\]/g, '$1')
    .replace(/\+\+([^+]+)\+\+/g, '$1')
    .replace(/\{\{([a-z]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, '$2')
    .replace(
      /\[\[(?:term|fn|em):((?:\[\[MATH:\d+\]\]|\[\[[a-z]+:[^\]]*\]\]|[^\]|])*)\|[^\]]*\]\]/g,
      '$1'
    )
    .replace(/\[\[(?:term|fn|u):((?:\[\[MATH:\d+\]\]|\[\[[a-z]+:[^\]]*\]\]|[^\]])*)\]\]/g, '$1');
}

/**
 * Reduce a numeric token to a comparison key: digits only, leading zeros dropped.
 * `"3.5"→"35"`, `"1,000"→"1000"`. ⚠️ A HEURISTIC BY ITS OWN ADMISSION — `3.5` and `35`
 * collide — which is one of the reasons A7 is advisory rather than blocking.
 */
export const numberKey = (token) => token.replace(/\D/g, '').replace(/^0+(?=\d)/, '');

/** Extract numeric tokens (runs of digits with internal separators). */
export function extractNumbers(text) {
  const cleaned = stripMathA7(stripMarkersA7(text));
  const matches = cleaned.match(/\d[\d.,\u00A0\u2009 ]*\d|\d/g) || [];
  // Trim trailing separators a greedy match may have grabbed (e.g. "5." in "5.")
  return matches.map((m) => m.replace(/[.,\u00A0\u2009 ]+$/, '')).filter(Boolean);
}

/**
 * Numbers present in EN but absent from IS (by comparison key).
 * Returns the ORIGINAL's shape verbatim, which is what the equivalence pin compares.
 *
 * @returns {Array<{type:'number-mismatch', value:string, message:string}>}
 */
export function checkNumbers(enContent, isContent) {
  if (!enContent || !isContent) return [];
  const isKeys = new Set(extractNumbers(isContent).map(numberKey));
  const findings = [];
  const reported = new Set();
  for (const token of extractNumbers(enContent)) {
    const key = numberKey(token);
    if (!key || reported.has(key)) continue;
    if (!isKeys.has(key)) {
      reported.add(key);
      findings.push({
        type: 'number-mismatch',
        value: token,
        message: `Talan \u201E${token}\u201C \u00FAr ensku finnst ekki \u00ED \u00FE\u00FD\u00F0ingunni`,
      });
    }
  }
  return findings;
}

/**
 * A7 — a number present in EN and missing from IS. ADVISORY.
 *
 * 🔴 IT ABSORBS `[[MEDIA:N]]` / `[[TABLE:N]]` PLACEHOLDER INDICES AS IF THEY WERE CONTENT
 * NUMBERS, AND THAT IS A SECOND, INDEPENDENT REASON IT IS ADVISORY.
 * `stripMathA7` removes `[[MATH:\d+]]` and nothing else; `stripMarkersA7` has no rule for
 * `MEDIA`/`TABLE`/`SPACE`/`BR`/`lb`/`rb`, so their indices reach `extractNumbers`.
 * Measured: `extractNumbers('[[MEDIA:5]] see fig')` → `['5']` while the `MATH` form → `[]`.
 * ▶ **BOTH DIRECTIONS ARE WRONG, AND THE SECOND IS THE ONE THAT MATTERS:**
 *   noise   — 12 of A7's 118 corpus findings (10.2%) are index artefacts, not lost numbers.
 *   MASKING — EN carries a real `5`, IS carries only `[[MEDIA:5]]` ⇒ `isKeys` holds `'5'`
 *             and A7 reports CLEAN. A false negative in the check whose only job is to
 *             find lost numbers. Reproduced: `checkNumbers('Add 5 grams', '… [[MEDIA:5]] …')`
 *             returns `[]`.
 * 🔴 DELIBERATELY NOT FIXED HERE, AND THE REASON IS THE POINT: widening the stripper would
 * make this port DIVERGE from `server/services/qaCheckService.js`, and the AGPL equivalence
 * test is the ONLY evidence the port still tracks the code it was copied from — the same
 * test that was vacuous until §C82 L55, which is precisely how the dropped `ð` shipped.
 * **Trading a live pin for a noise reduction on an advisory check is the wrong trade.**
 * ▶ If it is ever fixed, it must be fixed in the AGPL original FIRST and re-ported, so the
 * pin survives. Logged to the active register; do not "tidy" it here.
 *
 * ⚠️ RUN PER SEGMENT, NOT PER MODULE, so a finding names the segment a human must open.
 * The original is called the same way (`qaCheckService.runChecks` takes ONE segment's
 * EN/IS content), so this is the port's own idiom rather than a widening of it.
 * ⚠️ Do NOT also port `checkEnResidue` — it is the §C67 over-reporter, and A5 above
 * already covers the residue class with a measured allowlist behind it.
 */
export const A7 = defineCheck({
  id: 'A7',
  tier: 2,
  blocking: false,
  version: 1,
  run: (ctx) => {
    const skip = skipIfMissing(ctx, 'A7', ['segText', 'isText']);
    if (skip) return skip;

    const pairs = pairByOccurrence(ctx.segText, ctx.isText);
    const findings = [];
    let emptyIs = 0;
    for (const [segmentId, { en, is }] of pairs) {
      // 🔴 THE PORTED GUARD IS NON-MONOTONIC HERE, AND SILENCE WOULD BE A FALSE STATEMENT.
      // `checkNumbers` opens `if (!enContent || !isContent) return []` — faithful to the
      // AGPL original, where an empty IS field means "the editor has not filled it in yet".
      // POST-MT it means the opposite: the translation is GONE. Measured on one EN segment
      // carrying two numbers: IS `'.'` → 2 findings, IS `''` → 0 findings. **Strictly less
      // content yields strictly fewer findings**, and A7 then printed
      // `0 EN numbers missing from IS over 1 paired segments` — not a missing statement but
      // a positively FALSE one, over the only check in the tier that could have spoken.
      // ▶ The fix is NOT to drop the pair from `examined` (that hides the segment and still
      // reports clean). It is to say what happened. Found by adversarial review 2026-08-26;
      // the corpus holds 0 empty IS bodies in 28,822 segments, so no corpus test could see
      // it — the L44③ shape, where a natural rate of 0 is also what a broken detector gives.
      if (en.trim() && !is.trim()) {
        emptyIs++;
        findings.push({
          kind: 'empty-is-segment',
          segmentId,
          enNumbers: extractNumbers(en).length,
        });
        continue;
      }
      for (const f of checkNumbers(en, is)) {
        findings.push({ kind: 'number-mismatch', segmentId, value: f.value });
      }
    }

    const mismatches = findings.length - emptyIs;
    return {
      verdict: findings.length ? VERDICT.WARN : VERDICT.PASS,
      examined: pairs.size,
      findings,
      message: `${mismatches} EN numbers missing from IS over ${pairs.size} paired segments${emptyIs ? `, and ${emptyIs} IS segment(s) EMPTY against non-empty EN — not judged for numbers` : ''}`,
    };
  },
});

/** Tier 2's gating half. Registered separately so the three halves stay legible. */
export const MT_GATING_CHECKS = [A3, A5, A7];

registerChecks(MT_GATING_CHECKS);
