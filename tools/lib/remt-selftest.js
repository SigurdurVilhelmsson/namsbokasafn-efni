/**
 * remt-selftest.js — `--self-test` for the §C82 check battery (Plan B Task 13).
 *
 * Plants a defective state and invokes THE REAL GATE. Never a hand-written
 * `detect` predicate beside the planted defect.
 *
 * ── WHY, AND IT IS A RECORDED FAILURE, NOT A PRINCIPLE ───────────────────────
 * `server/scripts/verify-b4b0-gates.js:289-301` records what happened when a
 * self-test was given its own predicate: "deleting gate 1's assertion left it
 * reporting PASS on a D4 violation while the self-test still printed DETECTED,
 * because the self-test was checking its own predicate, not the gate. Its GATE 2
 * case was worse — a tautology that holds on every input."
 * ▶ So every arm below goes through `runCheck(REGISTRY.get(id), ctx)`. A
 * weakened gate is caught because the SAME code path produces both verdicts.
 *
 * ── BOTH ARMS, AND THE SECOND IS NOT DECORATION ──────────────────────────────
 * 🔴 A KNOWN-BAD FIXTURE ALONE CERTIFIES NOTHING: a gate that returns FAIL on
 * every input passes it. Each id therefore carries a PAIR —
 *
 *     bad  -> must NOT be PASS, and must have examined > 0
 *     good -> must BE PASS,     and must have examined > 0
 *
 * — and the pairing is load-bearing by MEASUREMENT, not by argument. Mutating
 * the Tier-0 module one gate at a time (on a scratch copy, golden-restored and
 * `cmp`'d after every round): of five mutations, THREE were invisible to the bad
 * arm and TWO were invisible to the good arm. Neither arm alone would have
 * caught the set. The over-broadening mutations — a gate that fires on things it
 * should not — are visible ONLY through the good arm, and those are the ones
 * that halt a paid run over healthy content.
 *
 * ── WHY `examined > 0` IS ASSERTED ON *BOTH* ARMS ────────────────────────────
 * 🔴 BECAUSE `runCheck` DOWNGRADES ONLY `PASS`. A bad-arm fixture that never
 * reaches the gate's logic still returns FAIL — from the ctx guard rather than
 * from the defect — with `examined: 0`, and it reads as a working detector.
 * Measured on three separate Tier-2 fixtures during derivation (A6, A2c, A3): a
 * fixture missing its canonical `SEG:` marker gives `FAIL examined 0`, and
 * nothing in the contract objects. The good arm's `examined > 0` closes the
 * mirror case, where a SKIPPED would otherwise read as "not a failure".
 * ▶ THE ONE GATE THIS CANNOT PROTECT: G5 hard-codes `examined: 1`, so its count
 * is no evidence that it read anything (a §C82 L6 survivor). Its verdicts are
 * the whole discriminator, and that is stated at its fixture.
 *
 * ── EVERY REGISTERED CHECK, OR A NAMED FAILURE ───────────────────────────────
 * 🔴 A CHECK WITH NO FIXTURE IS A `no-fixture` FAILURE, NOT AN OMISSION. An
 * absent row reads exactly like a row with nothing to report — §C60 at the
 * self-test level. So a check added later without a fixture turns `--self-test`
 * red, which is the point at which someone is still holding the context needed
 * to write one.
 *
 * ── WHAT THIS INSTRUMENT STRUCTURALLY CANNOT SEE ─────────────────────────────
 * ⚠️ PRODUCER DRIFT. A fixture pasted into this file may do no I/O, so the ctx
 * for a check whose input is another tool's payload (A2a, A4, A8, R2, R3, R4)
 * is a HAND-WRITTEN LITERAL mirroring that producer's output. If the producer
 * renames a field, BOTH ARMS STAY GREEN while the real loader hands the check a
 * record it SKIPs on. That is [[engineering-lessons]]' "build every positive
 * fixture by calling the REAL PRODUCER" — a discipline this file cannot honour
 * and therefore states instead of implying. The pins that DO cover it are
 * `remt-checks-mt-runrecord.test.js` (which calls `buildRunRecord()`) and
 * `remt-checks-output.test.js` (which calls `buildCnxml()`).
 * ▶ A GREEN `--self-test` IS NOT EVIDENCE THAT ANY PAYLOAD SHAPE IS CURRENT.
 *
 * ⚠️ AND IT IS NOT A BASE RATE. `--self-test` says a gate can tell a planted
 * defect from a planted clean; it says nothing about how often the real corpus
 * trips it. That is `tools/remt-sweep.js`, and the two answer different
 * questions — a check can pass this and still be wrong to make blocking.
 */
import { REGISTRY, runCheck, VERDICT } from './remt-battery.js';

// The registry wiring point: importing a tier module is the ONLY thing that puts
// its checks in REGISTRY (§C82 L3). Imported here so `selfTest()` is usable from
// a test without the caller having to know the wiring — and idempotent, so the
// CLI importing them too is not a duplicate registration.
import './remt-checks-glossary.js';
import './remt-checks-extract.js';
import './remt-checks-mt.js';
import './remt-checks-output.js';
import './remt-checks-chapter.js';

/** Why a self-test arm failed. Each names a DIFFERENT defect. */
export const FAILURE = Object.freeze({
  /** the gate returned PASS over a planted defect — it is blind */
  BLIND: 'blind',
  /** the gate reported a finding over a planted CLEAN ctx — it halts healthy content */
  TRIGGER_HAPPY: 'trigger-happy',
  /** the arm never reached the gate's logic: a defect in the FIXTURE, not the gate */
  FIXTURE: 'fixture',
  /** a registered check has no fixture at all */
  NO_FIXTURE: 'no-fixture',
});

/**
 * The planted states. `bad` must trip the gate; `good` must not.
 *
 * 🔴 THUNKS, NOT VALUES, so every arm gets a fresh object and no check can
 * contaminate a later one through a shared ctx. Gates are meant to be pure; this
 * removes the need to trust that.
 *
 * 🔴 NO I/O, NO IMPORTS, NO FILE PATHS. These run inside a tool that reads
 * nothing, and that property is what keeps `tools/remt-battery.js` off
 * `source-write-guard.test.js`'s toucher list.
 *
 * Every pair below was derived by EXECUTION against the real gate and
 * re-executed independently before landing: 33 ids, 66 arms, 0 defects.
 */
export const SELF_TEST_FIXTURES = Object.freeze({
  /* ── TIER 0 — glossary ─────────────────────────────────────────── */
  /**
   * TRIPS: competition leg only (kind 'glossary-competition').
   * UNCOVERED: the comma-list leg.
   * `status: 'approved'` must be on EVERY row — G1's `examined` is the approved count, so a row
   * missing it gives examined 0 and a PASS is downgraded to SKIPPED. G2/G3 will NOT warn you:
   * `wireTerms` unions the approvedOnly:false arm and still examines the row.
   */
  G1: {
    bad: () => ({
      glossary: [
        { english: 'atom', icelandic: 'frumeind', status: 'approved' },
        { english: 'atom', icelandic: 'atóm', status: 'approved' },
        { english: 'bond', icelandic: 'tengi', status: 'approved' },
      ],
    }),
    good: () => ({
      glossary: [
        { english: 'atom', icelandic: 'frumeind', status: 'approved' },
        { english: 'bond', icelandic: 'tengi', status: 'approved' },
      ],
    }),
  },
  /**
   * TRIPS: the §C73 element-suffix leg, ACCENTED spelling (magnesium -> magnesin with an accent).
   * UNCOVERED: the UNACCENTED `-in` half of IN_ENDING.
   * the GOOD arm carries TWO `-ium` headwords on purpose so both reach the predicate. Deleting
   * `&& IN_ENDING.test(...)` is invisible to the bad arm and flips the good arm PASS->FAIL —
   * the good arm is its only detector.
   */
  G2: {
    bad: () => ({
      glossary: [
        { english: 'magnesium', icelandic: 'magnesín', status: 'approved' },
        { english: 'bond', icelandic: 'tengi', status: 'approved' },
      ],
    }),
    good: () => ({
      glossary: [
        { english: 'magnesium', icelandic: 'magnesíum', status: 'approved' },
        { english: 'barium', icelandic: 'baríum', status: 'approved' },
      ],
    }),
  },
  /**
   * TRIPS: the §C77 function-word-headword leg via the CASE-INSENSITIVE path — `As` (arsenic) is a homograph of the conjunction.
   * UNCOVERED: nothing structurally; the lowercase instances hit the same single predicate.
   * the GOOD arm deliberately holds SHORT headwords (`Fe` 2 chars, `ATP` 3). Replacing
   * FUNCTION_WORDS with the min-length rule the docstring forbids is invisible to the bad arm
   * and flips the good arm.
   */
  G3: {
    bad: () => ({
      glossary: [
        { english: 'As', icelandic: 'arsen', status: 'approved' },
        { english: 'Fe', icelandic: 'járn', status: 'approved' },
      ],
    }),
    good: () => ({
      glossary: [
        { english: 'Fe', icelandic: 'járn', status: 'approved' },
        { english: 'ATP', icelandic: 'adenosínþrífosfat', status: 'approved' },
      ],
    }),
  },
  /**
   * TRIPS: cross-book-disagreement. THE FINDING VERDICT IS WARN — G4 is the only advisory Tier-0 gate.
   * UNCOVERED: the unreadable-book leg.
   * the ctx key is `glossariesByBook`, NOT `glossary` — G4 is the one gate whose subject is a
   * RELATION; and at least TWO books are required or it SKIPs in both arms.
   */
  G4: {
    bad: () => ({
      glossariesByBook: {
        bookA: [{ english: 'cell', icelandic: 'fruma', status: 'approved' }],
        bookB: [{ english: 'cell', icelandic: 'sella', status: 'approved' }],
      },
    }),
    good: () => ({
      glossariesByBook: {
        bookA: [{ english: 'cell', icelandic: 'fruma', status: 'approved' }],
        bookB: [{ english: 'cell', icelandic: 'fruma', status: 'approved' }],
      },
    }),
  },
  /**
   * TRIPS: the §C21 four-byte `null` payload leg ONLY.
   * UNCOVERED: empty/whitespace text, unparseable JSON, array/number/string payloads, the
   * producer-'unknown' leg, the leg-not-checked leg.
   * the bad fixture's `payloadVerdict` is DELIBERATELY NON-'unknown', and the pairing is
   * SYNTHETIC. Measured: with the REALISTIC pairing ({kind:'corrupt',producer:'unknown'}, what
   * the real spawn returns for these bytes) deleting the `payload === null ||` clause STILL
   * leaves the bad arm FAIL via the producer leg — the weakening goes UNDETECTED, which is
   * verify-b4b0-gates.js:289-301's blind-gate failure exactly. Isolated, the same deletion
   * flips it to PASS. A realistic fixture was measurably WORSE. ALSO: G5's `examined` is a
   * hard-coded 1, so runCheck's PASS+0->SKIPPED backstop can NEVER fire for it (a §C82 L6
   * survivor) — the verdicts are the whole discriminator.
   */
  G5: {
    bad: () => ({
      payloadText: 'null',
      payloadVerdict: { kind: 'ok', producer: 'export-terminology-resolved' },
    }),
    good: () => ({
      payloadText: '{"producer":"export-terminology-resolved","terms":[]}',
      payloadVerdict: { kind: 'ok', producer: 'export-terminology-resolved' },
    }),
  },

  /* ── TIER 1 — extract ──────────────────────────────────────────── */
  /**
   * TRIPS: the legacy mustache-dialect leg.
   * both arms carry the same CNXML; only the segment dialect differs.
   */
  E1: {
    bad: () => ({
      cnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m1</md:content-id></metadata><content><para id="p1">Water is a liquid</para></content></document>',
      segText: '<!-- SEG:m1:para:p1 -->{{i}}Water{{/i}} is a liquid\n',
    }),
    good: () => ({
      cnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m1</md:content-id></metadata><content><para id="p1">Water is a liquid</para></content></document>',
      segText: '<!-- SEG:m1:para:p1 -->[[i:Water]] is a liquid\n',
    }),
  },
  /**
   * TRIPS: the bracket-body mismatch leg.
   * the body text inside `[[i:...]]` must differ from the source element's text, not merely be
   * absent.
   */
  E2: {
    bad: () => ({
      cnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m1</md:content-id></metadata><content><para id="p1">Heat of <emphasis effect="italics">fusion</emphasis></para></content></document>',
      segText: '<!-- SEG:m1:para:p1 -->Heat of [[i:usion]]\n',
    }),
    good: () => ({
      cnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m1</md:content-id></metadata><content><para id="p1">Heat of <emphasis effect="italics">fusion</emphasis></para></content></document>',
      segText: '<!-- SEG:m1:para:p1 -->Heat of [[i:fusion]]\n',
    }),
  },
  /**
   * TRIPS: the XML-residue leg.
   * a bare closing tag in segment text is the shape; `XML_RESIDUE_TAGS` is the closed set.
   */
  E3: {
    bad: () => ({ segText: '<!-- SEG:m1:para:p1 -->Water is a</emphasis> liquid\n' }),
    good: () => ({ segText: '<!-- SEG:m1:para:p1 -->Water is a liquid\n' }),
  },
  /**
   * TRIPS: the segment-count leg.
   */
  E4: {
    bad: () => ({
      cnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m1</md:content-id></metadata><content><para id="p1">one</para><para id="p1">two</para></content></document>',
      segText:
        '<!-- SEG:m1:para:p1 -->one\n\n<!-- SEG:m1:para:p2 -->two\n\n<!-- SEG:m1:para:p1 -->one\n',
    }),
    good: () => ({
      cnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m1</md:content-id></metadata><content><para id="p1">one</para><para id="p2">two</para></content></document>',
      segText:
        '<!-- SEG:m1:para:p1 -->one\n\n<!-- SEG:m1:para:p2 -->two\n\n<!-- SEG:m1:para:p1 -->one\n',
    }),
  },
  /**
   * TRIPS: the figure-alt coverage leg.
   * E5 is the check the acceptance table expects at ~100% FAIL on today's corpus — the vintage
   * predates §C81.
   */
  E5: {
    bad: () => ({
      cnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m1</md:content-id></metadata><content><figure id="f1"><media id="me1" alt="a beaker"><image src="beaker.jpg" mime-type="image/jpeg"/></media></figure></content></document>',
      segText:
        '<!-- SEG:m1:figure-caption:f1 -->A beaker\n\n<!-- SEG:m1:alt:fs-idORPHAN -->a beaker\n',
    }),
    good: () => ({
      cnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m1</md:content-id></metadata><content><figure id="f1"><media id="me1" alt="a beaker"><image src="beaker.jpg" mime-type="image/jpeg"/></media></figure></content></document>',
      segText: '<!-- SEG:m1:figure-caption:f1 -->A beaker\n\n<!-- SEG:m1:alt:me1-alt -->a beaker\n',
    }),
  },
  /**
   * TRIPS: the emitted-file classification leg.
   * `emittedFiles` is a LISTING, not a path; the real loader must scope it to one run's output
   * or 14,634 historical backups drown it.
   */
  E6: {
    bad: () => ({
      emittedFiles: ['m1-segments.en.md', 'm1-segments(b).en.md', 'm1-structure.json'],
    }),
    good: () => ({
      emittedFiles: [
        'm1-segments.en.md',
        'm1-segments.en.md.backup.2026-08-25T10-00-00Z',
        'm1-structure.json',
      ],
    }),
  },
  /**
   * TRIPS: the committed-vs-fresh comparison leg. ADVISORY => WARN.
   * E7 reads `ctx.committedExtract` and `ctx.freshExtract`, and NEITHER IS IN THE CheckContext
   * TYPEDEF (measured 2026-08-27, §C82 L105). A loader built to the documented contract leaves
   * E7 permanently SKIPPED, and on an advisory check that reads as ignorable.
   */
  E7: {
    bad: () => ({
      committedExtract: {
        segIds: new Set(['m1:para:p1']),
        segText: new Map([['m1:para:p1', 'one']]),
        equations: new Map([['math-1', '<m:math/>']]),
        inlineAttrs: '{}',
      },
      freshExtract: {
        segIds: new Set(['m1:para:p2']),
        segText: new Map([['m1:para:p2', 'one']]),
        equations: new Map([['math-1', '<m:math/>']]),
        inlineAttrs: '{}',
      },
    }),
    good: () => ({
      committedExtract: {
        segIds: new Set(['m1:para:p1']),
        segText: new Map([['m1:para:p1', 'one']]),
        equations: new Map([['math-1', '<m:math/>']]),
        inlineAttrs: '{}',
      },
      freshExtract: {
        segIds: new Set(['m1:para:p1']),
        segText: new Map([['m1:para:p1', 'one']]),
        equations: new Map([['math-1', '<m:math/>']]),
        inlineAttrs: '{}',
      },
    }),
  },
  /**
   * TRIPS: the five-leg pre-flight; the bad arm trips one leg.
   * `examined` is the LEG COUNT (5), not content — Plan B's own E9 test asserts `toBe(5)`,
   * which is why a scope-only ctx once reported PASS/5 over nothing (§C82 L6). The self-test
   * cannot repair that; it only refuses to be fooled by it.
   */
  E9: {
    bad: () => ({
      locked: false,
      handEdits: [],
      inputs: [{ path: 'm1-segments.en.md', exists: true, bytes: 4096 }],
      force: false,
      costEstimate: { isk: 1200, withForce: true },
      costBand: { minIsk: 100, maxIsk: 5000 },
    }),
    good: () => ({
      locked: false,
      handEdits: [],
      inputs: [{ path: 'm1-segments.en.md', exists: true, bytes: 4096 }],
      force: true,
      costEstimate: { isk: 1200, withForce: true },
      costBand: { minIsk: 100, maxIsk: 5000 },
    }),
  },

  /* ── TIER 2 — MT ───────────────────────────────────────────────── */
  /**
   * TRIPS: seg-id-set-mismatch. ADVISORY => WARN.
   * `examined` is the UNION of both sides' seg-ids, not either side — the bad arm reports 2
   * while IS holds 1. Deleting the EN-only segment to 'simplify' removes the defect itself.
   */
  A1: {
    bad: () => ({
      segText: '<!-- SEG:m1:para:a -->\nhello\n\n<!-- SEG:m1:para:b -->\nworld\n',
      isText: '<!-- SEG:m1:para:a -->\nhalló\n',
    }),
    good: () => ({
      segText: '<!-- SEG:m1:para:a -->\nhello\n',
      isText: '<!-- SEG:m1:para:a -->\nhalló\n',
    }),
  },
  /**
   * TRIPS: markers-normalized. ADVISORY => WARN.
   * a HAND-WRITTEN literal mirroring `buildRunRecord()`. If the producer renames
   * `markersNormalized`, BOTH ARMS STAY GREEN while the real loader hands the check a record it
   * SKIPs on. The only pin on producer drift is `remt-checks-mt-runrecord.test.js`, whose
   * fixtures CALL `buildRunRecord()`.
   */
  A2a: {
    bad: () => ({
      provenance: {
        schemaVersion: 2,
        tool: 'api-translate',
        run: { runRecordVersion: 1, markersNormalized: 3 },
      },
    }),
    good: () => ({
      provenance: {
        schemaVersion: 2,
        tool: 'api-translate',
        run: { runRecordVersion: 1, markersNormalized: 0 },
      },
    }),
  },
  /**
   * TRIPS: `id-charset` ALONE — verified by printing findings.map(f => f.leg). BLOCKING, version 3.
   * UNCOVERED: raw-vs-parsed, inject-dialect, cross-side.
   * THE ISOLATION IS THE POINT: all three COUNT legs cancel on this damage (rawTokens 1 ===
   * parsed 1, enParsed 1 === parsed 1, no `{{SEG:`), so only the charset leg can see it. 🔴 KEEP
   * `String.fromCharCode(0x200b)` AND DO NOT TIDY IT INTO A LITERAL: a JSON field or a copy-
   * paste round-trip decodes the escape into a RAW U+200B, which is invisible to a reader AND
   * outside the `[\x01-\x08\x0b\x0c\x0e-\x1f]` range CLAUDE.md's control-byte census greps for
   * — the fixture would silently stop testing what its label says.
   */
  A2b: {
    bad: () => ({
      isText: '<!-- SEG:m1:title:aut' + String.fromCharCode(0x200b) + 'o-1 -->\nhalló\n',
      segText: '<!-- SEG:m1:title:auto-1 -->\nhello\n',
    }),
    good: () => ({
      isText: '<!-- SEG:m1:title:auto-1 -->\nhalló\n',
      segText: '<!-- SEG:m1:title:auto-1 -->\nhello\n',
    }),
  },
  /**
   * TRIPS: spaced-seg-marker. BLOCKING.
   * the defect is the space AFTER the colon. `seg-markers.cjs` TOLERATES space BEFORE `SEG:`
   * and rejects any after it, so a fixture spaced on the wrong side reports a false clean. And
   * `examined` counts markers that DID parse, so the bad arm must keep one canonical marker
   * beside the spaced one.
   */
  A2c: {
    bad: () => ({ isText: '<!-- SEG:m1:para:a -->\nhalló\n\n<!-- SEG: m1:para:b -->\nheimur\n' }),
    good: () => ({ isText: '<!-- SEG:m1:para:a -->\nhalló\n' }),
  },
  /**
   * TRIPS: marker-delta. ADVISORY by measurement (54.31%) => WARN.
   * UNCOVERED: unpaired-segment.
   * 🔴 THIS BAD ARM IS A CROSS-SEGMENT CANCELLATION, DELIBERATELY: `bracketMarkerDeltaBySegment`
   * deletes types whose per-segment deltas sum to zero, so a check keyed on `total` PASSes on
   * these exact bytes while one keyed on `bySegment` WARNs. Measured over all 197 run-target
   * pairs the two predicates agree EXACTLY (cancel-only modules = 0) — THE CORPUS IS
   * STRUCTURALLY INCAPABLE OF SEPARATING THEM, and this planted fixture is the only detector.
   * The plan's acceptance trio is written in `total`-shaped notation, which is what a literal
   * transcription builds against. Do not simplify it.
   */
  A3: {
    bad: () => ({
      segText: '<!-- SEG:m1:para:a -->\n[[MATH:1]] hello\n\n<!-- SEG:m1:para:b -->\nworld\n',
      isText: '<!-- SEG:m1:para:a -->\nhalló\n\n<!-- SEG:m1:para:b -->\n[[MATH:1]] heimur\n',
    }),
    good: () => ({
      segText: '<!-- SEG:m1:para:a -->\n[[i:hello]] and [[MATH:1]]\n',
      isText: '<!-- SEG:m1:para:a -->\n[[i:halló]] og [[MATH:1]]\n',
    }),
  },
  /**
   * TRIPS: invented-marker. ADVISORY => WARN.
   * UNCOVERED: tally-disagrees-with-count (the bad arm is deliberately self-consistent,
   * isolating one leg).
   * THE FIELD NAMES ARE THE POINT: Plan B:738 specifies A4 as reading `run.unwrapped[]`, and
   * `buildRunRecord()` has NEVER written that key — it writes `unwrappedCount` and
   * `unwrappedByType` (§C82 L48). Do not 'correct' this fixture toward the plan's shape. Same
   * producer-drift blindness as A2a.
   */
  A4: {
    bad: () => ({
      provenance: {
        schemaVersion: 2,
        tool: 'api-translate',
        run: { runRecordVersion: 1, unwrappedCount: 2, unwrappedByType: { i: 2 } },
      },
    }),
    good: () => ({
      provenance: {
        schemaVersion: 2,
        tool: 'api-translate',
        run: { runRecordVersion: 1, unwrappedCount: 0, unwrappedByType: {} },
      },
    }),
  },
  /**
   * TRIPS: stage 1 `en-residue` only. ADVISORY => WARN.
   * UNCOVERED: stage 2 long-en-residue (needs >=120 alphabetic characters).
   * the GOOD arm must STILL carry `residueAllowlist` and `module`: A5 requires four ctx keys
   * and SKIPs on any missing one. The bad arm's prose is reused VERBATIM from the existing
   * suite because `detectResidue(...).exact` is THREE conjuncts (normalized-equal AND not
   * language-neutral AND >=3 content words) — invented prose silently misses the minTokens
   * floor. `module: 'm1'` is load-bearing: A5 SKIPs the literal id `exercises` by design.
   */
  A5: {
    bad: () => ({
      segText:
        '<!-- SEG:m1:para:a -->\nThe quick brown fox jumps over the lazy dog while the chemist observes the reaction.\n',
      isText:
        '<!-- SEG:m1:para:a -->\nThe quick brown fox jumps over the lazy dog while the chemist observes the reaction.\n',
      module: 'm1',
      residueAllowlist: { entries: [] },
    }),
    good: () => ({
      segText:
        '<!-- SEG:m1:para:a -->\nThe quick brown fox jumps over the lazy dog while the chemist observes the reaction.\n',
      isText:
        '<!-- SEG:m1:para:a -->\nFljóti brúni refurinn stekkur yfir lata hundinn á meðan efnafræðingurinn fylgist með hvarfinu.\n',
      module: 'm1',
      residueAllowlist: { entries: [] },
    }),
  },
  /**
   * TRIPS: the `{{}}` mustache-dialect leg (2 occurrences: open and close). BLOCKING.
   * UNCOVERED: the `++` LEGACY_PLUSPLUS_RE leg.
   * both arms are deliberately `+`-FREE: `LEGACY_PLUSPLUS_RE`'s `[^+]+` crosses words, so
   * ordinary ion prose (`Ca++ ... Mg++`) reads as one legacy marker and would halt a paid run.
   * Do not introduce a `+`. And `examined` is the parsed-marker count, so the bad arm MUST keep
   * its canonical marker.
   */
  A6: {
    bad: () => ({ isText: '<!-- SEG:m1:para:a -->\n{{i}}sýnishorn{{/i}} hér\n' }),
    good: () => ({ isText: '<!-- SEG:m1:para:a -->\nsýnishorn hér\n' }),
  },
  /**
   * TRIPS: number-mismatch. ADVISORY => WARN.
   * UNCOVERED: empty-is-segment.
   * `numberKey` strips every non-digit, so the arms must differ in DIGITS, not formatting:
   * `3.5` vs `35` collide by design and `3.5 mol` vs `3,5 mol` is deliberately not a finding.
   * Do not build on a placeholder index either — `stripMathA7` removes `[[MATH:N]]` but nothing
   * strips `[[MEDIA:N]]`, so those digits reach `extractNumbers` and can MASK a real loss.
   */
  A7: {
    bad: () => ({
      segText: '<!-- SEG:m1:para:a -->\nheat to 350 degrees\n',
      isText: '<!-- SEG:m1:para:a -->\nhitið að 200 gráðum\n',
    }),
    good: () => ({
      segText: '<!-- SEG:m1:para:a -->\nheat to 350 degrees\n',
      isText: '<!-- SEG:m1:para:a -->\nhitið að 350 gráðum\n',
    }),
  },
  /**
   * TRIPS: malformed-usage — A8's ONLY failure mode, so LEG COVERAGE IS COMPLETE. ADVISORY => WARN.
   * the discriminator is the KEY, not the value: `JSON.stringify` drops an undefined value, so
   * a sidecar that never carried a usage has NO key and is silence (PASS). A bad arm that OMITS
   * `usage` therefore PASSes and is a fixture defect. `{units: 777}` is the real historical
   * shape. Same producer-drift blindness as A2a.
   */
  A8: {
    bad: () => ({
      provenance: {
        schemaVersion: 2,
        tool: 'api-translate',
        run: { runRecordVersion: 1, chars: 12345, estimatedIsk: 246.9, usage: { units: 777 } },
      },
    }),
    good: () => ({
      provenance: {
        schemaVersion: 2,
        tool: 'api-translate',
        run: { runRecordVersion: 1, chars: 12345, estimatedIsk: 246.9, usage: 777 },
      },
    }),
  },

  /* ── TIER 3 — output ───────────────────────────────────────────── */
  /**
   * TRIPS: the tag-count leg (classifyDiff -> 'unexplained').
   * UNCOVERED: the element-ORDER advisory sub-leg, the undefined-allowlist SKIP, the genuinely-
   * no-discrepancies PASS path.
   * THE PAIR IS BYTE-IDENTICAL CNXML ON BOTH ARMS; ONLY `fidelityAllowlist` DIFFERS — so it
   * kills 'always PASS', 'always FAIL' and 'wiring removed' at once. The good arm's allowlist
   * entry must match the EXACT TRIPLE (moduleId, tag, diff), and `diff = translated - source`,
   * so a DROP is NEGATIVE. `fidelityAllowlist: undefined` is a SKIP, not a pass.
   */
  R1: {
    bad: () => ({
      book: 'efnafraedi-2e',
      module: 'm00001',
      cnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><content><para id="p1">Water is <emphasis effect="italics">wet</emphasis> and <emphasis effect="italics">cold</emphasis>.</para></content></document>',
      translatedCnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><content><para id="p1">Vatn er <emphasis effect="italics">blautt</emphasis> og kalt.</para></content></document>',
      fidelityAllowlist: null,
    }),
    good: () => ({
      book: 'efnafraedi-2e',
      module: 'm00001',
      cnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><content><para id="p1">Water is <emphasis effect="italics">wet</emphasis> and <emphasis effect="italics">cold</emphasis>.</para></content></document>',
      translatedCnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><content><para id="p1">Vatn er <emphasis effect="italics">blautt</emphasis> og kalt.</para></content></document>',
      fidelityAllowlist: {
        entries: [
          {
            moduleId: 'm00001',
            tag: 'emphasis',
            diff: -1,
            class: 'benign',
            reason: 'self-test fixture: one emphasis deliberately dropped',
          },
        ],
      },
    }),
  },
  /**
   * TRIPS: a non-empty `injectReport.attrMismatches` — R2's only finding leg.
   * UNCOVERED: the documented blindness to marker DUPLICATION and PARTIAL loss (both return []
   * from the real producer), and the two SKIP guards.
   * an ABSENT `attrMismatches` key is a SKIP, not a pass, so the good fixture carries the empty
   * array EXPLICITLY. `segmentsFound` must be a non-negative integer or `examined` falls to 0
   * and the good arm is downgraded. HAND-WRITTEN PAYLOAD: a producer-side rename in
   * `buildCnxml` will NOT surface here — only through `remt-checks-output.test.js`'s
   * `injectFixture`, which imports the producer.
   */
  R2: {
    bad: () => ({
      injectReport: {
        segmentsFound: 81,
        attrMismatches: [{ segmentId: 'm00001:para:p1', family: 'terms', expected: 1, found: 0 }],
      },
    }),
    good: () => ({ injectReport: { segmentsFound: 81, attrMismatches: [] } }),
  },
  /**
   * TRIPS: the STRUCTURAL-ERROR leg on a SCHEMA_STRICT_BOOKS book, which is FAIL.
   * UNCOVERED: the fatal leg, the organic WARN branch, instrumentMissing, the targets-binding
   * SKIP, the unknown-book SKIP, the directory-scoped path.
   * 🔴 `errors[].file` MUST HAVE A BASENAME EXACTLY `${ctx.module}.cnxml` — R3's `inScope`
   * filter splits on '/' and compares, so an error with no `file` is filtered out and R3
   * returns PASS examined 1 from a fixture LABELLED known-bad. `targets` is REQUIRED whenever
   * `ctx.module` is set or R3 SKIPs, and R3 is BLOCKING. `book` must be in SCHEMA_STRICT_BOOKS
   * or the same payload yields WARN.
   */
  R3: {
    bad: () => ({
      book: 'efnafraedi-2e',
      module: 'm00001',
      schemaVerdict: {
        filesChecked: 1,
        targets: ['m00001.cnxml'],
        errors: [
          {
            type: 'error',
            file: 'm00001.cnxml',
            line: 12,
            rule: 'c1-abstract-id',
            message: 'element para not allowed here',
          },
        ],
        suppressed: [],
      },
    }),
    good: () => ({
      book: 'efnafraedi-2e',
      module: 'm00001',
      schemaVerdict: { filesChecked: 1, targets: ['m00001.cnxml'], errors: [], suppressed: [] },
    }),
  },
  /**
   * TRIPS: render-error — an audited module carrying an issue with severity 'error'. ADVISORY.
   * UNCOVERED: module-not-audited (structurally uncoverable as a bad arm: an entry carrying
   * `error` is excluded from `audited`, forcing examined 0), the unbound path, the not-an-array
   * SKIP.
   * the GOOD arm carries a severity:'warning' issue rather than an empty array — that pins the
   * SEVERITY DISCRIMINATION itself. `severity` must be exactly 'error'; 'ERROR' silently
   * becomes a non-finding and the bad arm PASSes.
   */
  R4: {
    bad: () => ({
      module: 'm00001',
      auditResults: [
        {
          moduleId: 'm00001',
          issues: [{ severity: 'error', check: 'id-preservation', message: '3 ID(s) missing' }],
        },
      ],
    }),
    good: () => ({
      module: 'm00001',
      auditResults: [
        {
          moduleId: 'm00001',
          issues: [{ severity: 'warning', check: 'exercises', message: '0/7 in output' }],
        },
      ],
    }),
  },
  /**
   * TRIPS: untranslated-leaf. R5's FINDING VERDICT IS WARN, NEVER FAIL — advisory by measurement (>=16.8% chemistry).
   * UNCOVERED: shouldSkip's URL/DOI/numeric/short-text branches, the id-less positional-key
   * path, the one-sided-leaf path.
   * THE FIXTURE CARRIES ITS OWN IN-FIXTURE POSITIVE CONTROL: p2 is translated in BOTH arms, so
   * the bad arm reports examined 2 with 1 finding and a harness that broke everything equally
   * could not read as a pass. The good arm must change BOTH paras. No `<metadata>` block:
   * `findUntranslatedText` calls `preprocess()` first and strips it.
   */
  R5: {
    bad: () => ({
      cnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><content><para id="p1">The nucleus contains protons and neutrons.</para><para id="p2">Electrons occupy the surrounding orbitals.</para></content></document>',
      translatedCnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><content><para id="p1">The nucleus contains protons and neutrons.</para><para id="p2">Rafeindir sitja a svigrunum i kring.</para></content></document>',
    }),
    good: () => ({
      cnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><content><para id="p1">The nucleus contains protons and neutrons.</para><para id="p2">Electrons occupy the surrounding orbitals.</para></content></document>',
      translatedCnxml:
        '<document xmlns="http://cnx.rice.edu/cnxml"><content><para id="p1">Kjarninn inniheldur roteindir og nifteindir.</para><para id="p2">Rafeindir sitja a svigrunum i kring.</para></content></document>',
    }),
  },

  /* ── TIER 4 — chapter ──────────────────────────────────────────── */
  /**
   * TRIPS: shape-drift against a full 16-bucket baseline. WARN (advisory).
   * the baseline must carry EVERY bucket key with a NUMBER: `{}` is TRUTHY and manufactures
   * wholesale false drift, and `baseline[b] || 0` coerces null/''/NaN to 0 (§C82 L90, L103). K1
   * short-circuits on `renderBaseline: null` BEFORE `checkChapter` is called, so a null-
   * baseline fixture tests nothing.
   */
  K1: {
    bad: () => ({
      chapterInputs: { cnxml: ['<para>texti</para>'], html: ['<p><em>vatn</em></p>'] },
      renderBaseline: {
        figure: 0,
        img: 0,
        table: 0,
        ul: 0,
        ol: 0,
        li: 0,
        em: 3,
        strong: 0,
        'aside.example': 0,
        'aside.note': 0,
        'div.eoc-exercise': 0,
        'div.equation': 0,
        'mjx-container': 0,
        'span.math-inline': 0,
        'span.mathjax-display': 0,
        'a[href]': 0,
      },
    }),
    good: () => ({
      chapterInputs: { cnxml: ['<para>texti</para>'], html: ['<p><em>vatn</em></p>'] },
      renderBaseline: {
        figure: 0,
        img: 0,
        table: 0,
        ul: 0,
        ol: 0,
        li: 0,
        em: 1,
        strong: 0,
        'aside.example': 0,
        'aside.note': 0,
        'div.eoc-exercise': 0,
        'div.equation': 0,
        'mjx-container': 0,
        'span.math-inline': 0,
        'span.mathjax-display': 0,
        'a[href]': 0,
      },
    }),
  },
  /**
   * TRIPS: cross-stage-drop on `math`. BLOCKING.
   * UNCOVERED: the image unit and the `>=` PASS-margin path.
   * `knownIntentionalImageDrops` is REQUIRED and is PER CHAPTER, never the book total (§C82
   * L88/L96①). The good arm's message discloses `PASS margin math +1` — rollups legitimately
   * re-present equations, so the `>=` invariant is correct and must not be tightened.
   */
  K2: {
    bad: () => ({
      chapterInputs: {
        cnxml: ['<para><m:math><m:mi>x</m:mi></m:math><m:math><m:mi>y</m:mi></m:math></para>'],
        html: ['<p><mjx-container></mjx-container></p>'],
      },
      knownIntentionalImageDrops: 0,
    }),
    good: () => ({
      chapterInputs: {
        cnxml: ['<para><m:math><m:mi>x</m:mi></m:math></para>'],
        html: ['<p><mjx-container></mjx-container><mjx-container></mjx-container></p>'],
      },
      knownIntentionalImageDrops: 0,
    }),
  },
  /**
   * TRIPS: unaccounted-rename. BLOCKING.
   * UNCOVERED: the module-in-multiple-files leg and the cross-track refusal.
   * 🔴 `slugMap.renames` IS AN OBJECT KEYED BY `from`, NOT AN ARRAY — the producer writes
   * `map.renames[from] = {to, moduleId, recordedAt}` and `readSlugMap` explicitly refuses an
   * array. Reading it as an array coerced every correctly-recorded rename to UNACCOUNTED, i.e.
   * a FALSE HALT on exactly the chapters whose renames were properly recorded (§C82 L93).
   * `ctx.track` is also required — K3 validates it against TRACKS.
   */
  K3: {
    bad: () => ({
      track: 'mt-preview',
      publishedBefore: new Map([['10-5-old.html', 'm68770']]),
      publishedAfter: new Map([['10-5-new.html', 'm68770']]),
      slugMap: null,
    }),
    good: () => ({
      track: 'mt-preview',
      publishedBefore: new Map([['10-5-old.html', 'm68770']]),
      publishedAfter: new Map([['10-5-new.html', 'm68770']]),
      slugMap: {
        book: 'efnafraedi-2e',
        track: 'mt-preview',
        renames: {
          'chapters/10/10-5-old.html': {
            to: 'chapters/10/10-5-new.html',
            moduleId: 'm68770',
            recordedAt: '2026-08-18',
          },
        },
      },
    }),
  },
  /**
   * TRIPS: genuine-math-drop by MathML skeleton multiset. ADVISORY.
   * K4 exists because `identityDiffChapter` was called from `main()` and NOWHERE ELSE —
   * importing `checkChapter` alone orphans the most sensitive detector in the file (§C82 L91).
   * Its skeleton diff is immune to the rollup masking that a count-based invariant suffers.
   */
  K4: {
    bad: () => ({
      chapterInputs: {
        cnxml: ['<para><m:math><m:mi>x</m:mi></m:math></para>'],
        html: ['<p>engin jafna</p>'],
      },
    }),
    good: () => ({
      chapterInputs: {
        cnxml: ['<para><m:math><m:mi>x</m:mi></m:math></para>'],
        html: ['<p><math class="assistive-mathml"><mi>x</mi></math></p>'],
      },
    }),
  },
  /**
   * TRIPS: raw-cnxml-leak, `link` pattern. BLOCKING.
   * UNCOVERED: the other leak patterns.
   * the GOOD arm is a real HTML `<link rel=stylesheet>` ON PURPOSE — the pattern is `<link
   * document=`, and a good fixture with no `<link` at all would not separate a mutant that
   * keyed on the bare tag name. K5 is NOT a consumer of `knownIntentionalImageDrops`; demanding
   * it was a pure false-halt surface on a blocking check (§C82 L96②).
   */
  K5: {
    bad: () => ({
      chapterInputs: {
        cnxml: ['<para>texti</para>'],
        html: ['<p><link document="m58797">Nonproteobacteria</link></p>'],
      },
    }),
    good: () => ({
      chapterInputs: {
        cnxml: ['<para>texti</para>'],
        html: ['<link rel="stylesheet" href="/styles/content.css">'],
      },
    }),
  },
});

/**
 * Run the self-test.
 *
 * @param {object}   [opts]
 * @param {Array}    [opts.overrides]  checks (from `defineCheck`) replacing the
 *                                     registered one of the same id. This is how
 *                                     the meta-test neuters a gate and confirms
 *                                     the self-test notices.
 * @param {Map}      [opts.registry]   defaults to the live REGISTRY
 * @returns {Promise<{ok:boolean, checked:number, results:Array, failures:Array}>}
 */
export async function selfTest({ overrides = [], registry = REGISTRY } = {}) {
  const byId = new Map(registry);
  for (const o of overrides) {
    // 🔴 AN OVERRIDE FOR AN UNKNOWN ID IS REFUSED, AND THAT IS NOT PEDANTRY. A
    // typo'd id would ADD a check nobody registered, so the meta-test would
    // "neuter" a gate that never existed and pass while proving nothing about
    // the battery — the tautology this whole file is built against.
    if (!byId.has(o.id)) {
      throw new Error(
        `selfTest: override '${o.id}' is not a registered check id — an override must REPLACE a real gate`
      );
    }
    byId.set(o.id, o);
  }

  const results = [];
  const failures = [];

  for (const [id, check] of byId) {
    const fixture = SELF_TEST_FIXTURES[id];
    if (!fixture) {
      failures.push({
        id,
        tier: check.tier,
        blocking: check.blocking,
        kind: FAILURE.NO_FIXTURE,
        detail: `no self-test fixture for ${id} — add a bad/good pair, or this gate is certified by nothing`,
      });
      continue;
    }

    const row = { id, tier: check.tier, blocking: check.blocking, version: check.version };
    for (const arm of ['bad', 'good']) {
      let r;
      try {
        // The fixture thunk runs OUTSIDE `runCheck`, so a throwing fixture would
        // take the whole self-test down rather than reporting itself.
        r = await runCheck(check, fixture[arm]());
      } catch (err) {
        failures.push({
          id,
          tier: check.tier,
          blocking: check.blocking,
          arm,
          kind: FAILURE.FIXTURE,
          detail: `${arm} fixture threw: ${err && err.message ? err.message : err}`,
        });
        row[arm] = { verdict: 'THREW', examined: 0, message: String(err && err.message) };
        continue;
      }
      row[arm] = {
        verdict: r.verdict,
        examined: r.examined,
        findings: r.findings.length,
        message: r.message,
      };

      // An arm that examined nothing never reached the gate's logic. Checked
      // FIRST and for BOTH arms, because `runCheck` downgrades only PASS: a bad
      // arm can return FAIL from a ctx guard, with examined 0, and read as a
      // working detector.
      if (r.examined === 0) {
        failures.push({
          id,
          tier: check.tier,
          blocking: check.blocking,
          arm,
          kind: FAILURE.FIXTURE,
          detail: `${arm} arm examined 0 units (${r.verdict}) — the ctx never reached the gate; this is a fixture defect, not a verdict`,
        });
        continue;
      }

      if (arm === 'bad' && r.verdict === VERDICT.PASS) {
        failures.push({
          id,
          tier: check.tier,
          blocking: check.blocking,
          arm,
          kind: FAILURE.BLIND,
          detail: `${id} returned PASS over a planted defect (examined ${r.examined}) — the gate is blind`,
        });
      }
      if (arm === 'bad' && r.verdict === VERDICT.SKIPPED) {
        failures.push({
          id,
          tier: check.tier,
          blocking: check.blocking,
          arm,
          kind: FAILURE.FIXTURE,
          detail: `${id} SKIPPED its known-bad fixture — the ctx never reached the gate`,
        });
      }
      if (arm === 'good' && r.verdict !== VERDICT.PASS) {
        failures.push({
          id,
          tier: check.tier,
          blocking: check.blocking,
          arm,
          kind: r.verdict === VERDICT.SKIPPED ? FAILURE.FIXTURE : FAILURE.TRIGGER_HAPPY,
          detail:
            r.verdict === VERDICT.SKIPPED
              ? `${id} SKIPPED its known-good fixture — the ctx never reached the gate`
              : `${id} returned ${r.verdict} over a planted CLEAN ctx (${r.findings.length} finding(s)) — it would halt healthy content`,
        });
      }
    }
    results.push(row);
  }

  return { ok: failures.length === 0, checked: byId.size, results, failures };
}

/** Human-readable rendering. The CLI prints this; nothing parses it. */
export function formatSelfTest(report) {
  const lines = [];
  lines.push(`# §C82 battery self-test — ${report.checked} registered check(s)`);
  lines.push('');
  lines.push('ID   T B  BAD ARM (must trip)        GOOD ARM (must pass)');
  for (const r of report.results) {
    const cell = (a) =>
      a ? `${a.verdict}/${a.examined}`.padEnd(12) + `f${a.findings ?? '?'}` : '—';
    lines.push(
      `${r.id.padEnd(4)} ${r.tier} ${r.blocking ? '*' : ' '}  ${cell(r.bad).padEnd(26)}${cell(r.good)}`
    );
  }
  lines.push('');
  if (report.ok) {
    lines.push(`OK — every gate distinguished its planted defect from its planted clean.`);
    lines.push(
      '⚠️ This is NOT a base rate, and NOT evidence that any producer payload shape is current ' +
        '(see the file header). Run `tools/remt-sweep.js` for rates.'
    );
  } else {
    lines.push(`${report.failures.length} FAILURE(S):`);
    for (const f of report.failures) {
      lines.push(`  ${f.id.padEnd(4)} [${f.kind}] ${f.detail}`);
    }
  }
  return lines.join('\n');
}
