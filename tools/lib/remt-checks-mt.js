/**
 * remt-checks-mt.js — Tier 2 of the §C82 battery: the FREE half (A1, A6, A2b, A2c).
 *
 * Tier 2 is PER MODULE, POST-MT. The money is already spent when these run, so unlike
 * Tier 1 a halt here does not save ISK — it stops a corrupted module from being frozen
 * into `03-faithful-translation`, edited by a human, and published. That is why three of
 * the four are blocking despite sitting downstream of the spend.
 *
 * ── THE ctx THIS TIER TAKES, AND THE ONE KEY IT DOES NOT HAVE ─────────────────────────
 * `isText` — the `02-mt-output` IS segment file (A1, A6, A2b, A2c)
 * `segText` — the `02-for-mt` EN segment file (A1 AND A2b; both are two-sided). This
 *             line read "A1 only" until A2b acquired its cross-side leg — when a check
 *             starts consuming a ctx key, this list is part of the change.
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
 * 2026-08-25: **0 spaced forms across 207 live IS files carrying 29,476 canonical markers**
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
