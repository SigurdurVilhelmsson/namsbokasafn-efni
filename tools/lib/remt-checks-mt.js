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
 * `segText` — the `02-for-mt` EN segment file (A1 only; it is a two-sided comparison)
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
 * ✅ This is not a different parser from the one injection uses: `tools/cnxml-inject.js`
 * imports `SEG_MARKER`/`parseSegmentsMap` from the same `seg-markers.cjs`, so A2b judges
 * the very recognizer that will later read these files.
 *
 * @param {string} content raw segment-file text
 * @returns {Array<{segmentId:string,moduleId:string,segmentType:string,elementId:string,content:string}>}
 */
export function parseSegmentsMit(content) {
  const normalized = String(content).replace(/\{\{SEG:([^}]+)\}\}/g, '<!-- SEG:$1 -->');
  return parseSegmentRecords(normalized).map((r) => ({ ...r, content: normalizeWraps(r.content) }));
}

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
 * A2b is its ONLY detector.
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
  return (String(text).match(/SEG:/g) || []).length;
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
 *   RENAMED  count identical, id rewritten → A1 ONLY, advisory, 4/207 on `main`
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
 * the plan's number counts the MUSTACHE DIALECT ONLY. A6 as specified covers BOTH, so its
 * real fixture is 5,491 occurrences over 115 chemistry files plus 146 over 4 micro ones.
 * State the dialect and the population in the same breath as any of these counts.
 * ▶ Every one of those lives in a tree the re-MT REPLACES, so the corpus pins are premise
 * pins and the test carries a PLANTED must-trip that no re-MT can repair.
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
 * ── TWO LEGS, AND NEITHER SUBSUMES THE OTHER ──────────────────────────────────────────
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
  version: 2,
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
    const parsed = parseSegmentsMit(ctx.isText).length;
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
