/**
 * Tier 2, the free half — A1, A6, A2b, A2c, and the `parseSegmentsMit` port.
 *
 * ── THE POPULATION, STATED ONCE SO EVERY NUMBER BELOW INHERITS IT ──────────────
 * Every count here is over LIVE `02-mt-output/**\/*-segments.is.md` files,
 * `chapter-metadata-*` EXCLUDED, in three books: chemistry 149, organic 48, micro 10
 * = 207 files, 29,476 canonical SEG markers, 207 EN/IS pairs. Measured 2026-08-25.
 * ⚠️ `orverufraedi` is NOT a run target (§C80/§C109) — its committed bytes are static
 * fixture input only, which Global Constraints permits explicitly. `edlisfraedi-2e`,
 * `liffraedi-2e` and `books/__e2e-fixture__` are deliberately OUT of the population: a
 * bare `books/*` walk sweeps them in and every count below moves (the e2e fixture alone
 * carries 8 `++` hits).
 *
 * 🔴 THE CORPUS PINS ARE PREMISE PINS, NOT REGRESSION PINS — §C82 L20/L27, inherited
 * from the Tier-1 legacy suite verbatim. A6's entire natural fixture lives in
 * `02-mt-output`, which the clean-break run REPLACES; when these numbers move that is
 * the corpus changing, and they are updated in the commit that observes it. So every
 * blocking check ALSO carries a PLANTED must-trip that no re-MT can repair.
 *
 * ⚠️ AND EVERY MUST-NOT-TRIP CONTROL IS LOAD-BEARING. A6 over organic is 0 across 48
 * files — which is exactly what a wholly broken detector returns. The planted trip and
 * the chemistry 5,491 are what separate the two readings (L44③).
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { runCheck, VERDICT, REGISTRY } from '../lib/remt-battery.js';
import { LEGACY_MUSTACHE_RE, LEGACY_PLUSPLUS_RE } from '../lib/remt-checks-extract.js';
import {
  A1,
  A6,
  A2b,
  A2c,
  A6_MUSTACHE_RE,
  A6_PLUSPLUS_RE,
  MT_FREE_CHECKS,
  parseSegmentsMit,
  countRawSegTokens,
  SPACED_SEG_RE,
} from '../lib/remt-checks-mt.js';
import { mtOutputSegmentFiles, enCounterpart } from './helpers/remt-corpus.js';
// ⚠️ INJECT'S OWN PARSER, imported so the two-parser disagreement is asserted rather than
// described. `.cjs` under a `"type": "module"` root loads as CommonJS default-only.
import segMarkers from '../lib/seg-markers.cjs';
const { parseSegmentsMap } = segMarkers;

const read = (p) => fs.readFileSync(p, 'utf8');
const BOOKS = ['efnafraedi-2e', 'lifraen-efnafraedi', 'orverufraedi'];
const FILES = Object.fromEntries(BOOKS.map((b) => [b, mtOutputSegmentFiles(b)]));

/** A real, clean chemistry IS file — 11 segments, no legacy dialect, no spaced marker. */
const M68663_IS = 'books/efnafraedi-2e/02-mt-output/ch01/m68663-segments.is.md';
const M68663_EN = 'books/efnafraedi-2e/02-for-mt/ch01/m68663-segments.en.md';
const isText68663 = read(M68663_IS);
const enText68663 = read(M68663_EN);

describe('population controls — an empty walk must not pass anything below', () => {
  it('walks the measured file counts', () => {
    expect(FILES['efnafraedi-2e'].length).toBe(149);
    expect(FILES['lifraen-efnafraedi'].length).toBe(48);
    expect(FILES['orverufraedi'].length).toBe(10);
  });
});

describe('parseSegmentsMit — the MIT port of the AGPL segmentParser', () => {
  it('parses the measured number of records from a real corpus file', () => {
    // L37: the COUNT is asserted, not merely `> 0` — a one-record parse and a
    // full one are both "truthy", and only one of them is the file.
    expect(parseSegmentsMit(isText68663)).toHaveLength(11);
  });

  it('agrees record-for-record with server/services/segmentParser.parseSegments', () => {
    // ✅ SANCTIONED, AND DELIBERATELY NOT A SHIPPED MIT→AGPL EDGE. `tools/` is MIT and
    // `server/` is AGPL-3.0; root LICENSE's enumeration covers SHIPPED TOOLING, not the
    // test suite, and nothing in `tools/lib/` imports `server/`. This require exists ONLY
    // to pin the port against its original. DO NOT "fix" it by deleting the pin — deleting
    // it removes the only evidence the port still tracks the code it was copied from.
    // ⚠️ `createRequire` is load-bearing: root package.json is `"type": "module"`, so a
    // bare `require` here is undefined and the red would read as a port disagreement.
    const require = createRequire(import.meta.url);
    const { parseSegments } = require('../../server/services/segmentParser.js');
    const mine = parseSegmentsMit(isText68663);
    expect(mine).toHaveLength(11);
    expect(mine).toEqual(parseSegments(isText68663));
  });

  it('normalizes the mustache SEG dialect, which bare parseSegmentRecords does not', () => {
    // The load-bearing half of the port, asserted by VALUE rather than assumed: a
    // `{{SEG:…}}` file parses to 0 records without the normalization and to 2 with it.
    const mustacheFile = '{{SEG:m1:para:a}}\nhalló\n{{SEG:m1:para:b}}\nheimur\n';
    const recs = parseSegmentsMit(mustacheFile);
    expect(recs).toHaveLength(2);
    expect(recs.map((r) => r.segmentId)).toEqual(['m1:para:a', 'm1:para:b']);
  });

  it('applies normalizeWraps — a single newline inside a segment becomes a space', () => {
    const wrapped = '<!-- SEG:m1:para:a -->\nfyrri lína\nseinni lína\n';
    expect(parseSegmentsMit(wrapped)[0].content).toBe('fyrri lína seinni lína');
  });

  it('agrees with the AGPL original across the whole corpus, not one file', () => {
    // ⚠️ The port is character-identical to its original (both delegate to
    // `parseSegmentRecords` + `normalizeWraps`), so this is a TRANSCRIPTION pin, not an
    // independence pin — it catches a drifted copy, never a shared premise. Stated so a
    // future reader does not read it as stronger evidence than it is.
    const require = createRequire(import.meta.url);
    const { parseSegments } = require('../../server/services/segmentParser.js');
    let compared = 0;
    for (const b of BOOKS) {
      for (const f of FILES[b]) {
        const t = read(f);
        expect(parseSegmentsMit(t)).toEqual(parseSegments(t));
        compared++;
      }
    }
    expect(compared).toBe(207);
  });
});

describe('A6 — zero legacy inline-marker dialects on the IS side (BLOCKING)', () => {
  it("re-exports E1's patterns by identity, not by copy", () => {
    expect(A6_MUSTACHE_RE).toBe(LEGACY_MUSTACHE_RE);
    expect(A6_PLUSPLUS_RE).toBe(LEGACY_PLUSPLUS_RE);
  });

  it("A6 SCANS WITH E1's binding — the re-export pin above does not establish this", async () => {
    // 🔴 THIS TEST EXISTS BECAUSE THE ONE ABOVE WAS MEASURED TO BE INSUFFICIENT. A
    // mutation that left the re-export alone and gave A6's `run` a character-identical
    // RE-TYPED copy of the pattern passed the whole suite (mutation round 1, M4). The
    // re-export pins what the module EXPORTS; only replacing E1's binding and watching
    // A6's behaviour follow pins what it USES — which is the thing that silently stops
    // tracking E1 the first time either pattern is widened (§C82 L41).
    // ⚠️ BOTH BINDINGS, NOT ONE. The first version of this test overrode only the
    // mustache pattern — and a re-typed copy of `LEGACY_PLUSPLUS_RE` then passed the whole
    // suite (mutation M9, measured). That is L41 a second time, in the test written to
    // enforce L41, one commit after closing it for the mustache half: a ruling applied to
    // one instance and not swept to its sibling. A6 scans with TWO patterns, so both are
    // replaced and both directions are asserted.
    vi.resetModules();
    vi.doMock('../lib/remt-checks-extract.js', async (importOriginal) => ({
      ...(await importOriginal()),
      LEGACY_MUSTACHE_RE: /SENTINEL-MUSTACHE/g,
      LEGACY_PLUSPLUS_RE: /SENTINEL-PLUSPLUS/g,
    }));
    const { A6: A6mocked } = await import('../lib/remt-checks-mt.js');
    const { runCheck: rc } = await import('../lib/remt-battery.js');

    // It fires on E1's (replaced) patterns — one assertion per dialect...
    const onMustacheSentinel = await rc(A6mocked, {
      isText: '<!-- SEG:m1:para:a -->\nSENTINEL-MUSTACHE hér\n',
    });
    expect(onMustacheSentinel.findings.filter((f) => f.dialect === '{{}}')).toHaveLength(1);
    const onPlusSentinel = await rc(A6mocked, {
      isText: '<!-- SEG:m1:para:a -->\nSENTINEL-PLUSPLUS hér\n',
    });
    expect(onPlusSentinel.findings.filter((f) => f.dialect === '++')).toHaveLength(1);

    // ...and NOT on the real forms, which a re-typed copy of either would still catch.
    const onRealForms = await rc(A6mocked, {
      isText: '<!-- SEG:m1:para:a -->\n{{i}} ++undirstrikað++\n',
    });
    expect(onRealForms.findings).toHaveLength(0);
    expect(onRealForms.verdict).toBe(VERDICT.PASS);

    vi.doUnmock('../lib/remt-checks-extract.js');
    vi.resetModules();
  });

  it('PREMISE PIN — chemistry: 5,442 mustache + 49 ++ hits over 115 of 149 files', async () => {
    let mustache = 0;
    let plus = 0;
    let carriers = 0;
    let examined = 0;
    for (const f of FILES['efnafraedi-2e']) {
      const r = await runCheck(A6, { isText: read(f) });
      examined += r.examined;
      const m = r.findings.find((x) => x.dialect === '{{}}');
      const p = r.findings.find((x) => x.dialect === '++');
      if (m) mustache += m.occurrences;
      if (p) plus += p.regexHits;
      if (r.verdict === VERDICT.FAIL) carriers++;
    }
    expect(mustache).toBe(5442);
    expect(plus).toBe(49);
    expect(mustache + plus).toBe(5491);
    expect(carriers).toBe(115);
    expect(examined).toBe(21515); // segments inspected; an empty walk cannot reach it
  });

  it('MUST-NOT-TRIP CONTROL — organic: 0 findings over all 48 files', async () => {
    let clean = 0;
    for (const f of FILES['lifraen-efnafraedi']) {
      const r = await runCheck(A6, { isText: read(f) });
      expect(r.verdict).toBe(VERDICT.PASS);
      expect(r.findings).toHaveLength(0);
      clean++;
    }
    // L37: `[].every(...)` is vacuously true, and so is a loop over an empty walk.
    expect(clean).toBe(48);
  });

  it('PREMISE PIN — micro fixture bytes: 146 mustache over 4 of 10 files', async () => {
    let mustache = 0;
    let carriers = 0;
    for (const f of FILES['orverufraedi']) {
      const r = await runCheck(A6, { isText: read(f) });
      const m = r.findings.find((x) => x.dialect === '{{}}');
      if (m) {
        mustache += m.occurrences;
        carriers++;
      }
    }
    expect(mustache).toBe(146);
    expect(carriers).toBe(4);
  });

  it('PLANTED must-trip — survives any re-MT, unlike every corpus pin above', async () => {
    const planted = isText68663.replace(
      '<!-- SEG:',
      '{{i}}sýnishorn{{/i}} ++undirstrikað++\n<!-- SEG:'
    );
    const r = await runCheck(A6, { isText: planted });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.map((f) => f.dialect).sort()).toEqual(['++', '{{}}']);
    expect(r.examined).toBe(11); // it FAILED having actually read the file
  });

  it('reports the ++ count as a labelled DETECTOR hit count, never as authoritative', async () => {
    // 🔴 `LEGACY_PLUSPLUS_RE` OVER-COUNTS BY 25.6%, MEASURED (E1's docstring). E1 anchors
    // its authoritative count to `countUnderlineElements(ctx.cnxml)`; the Tier-2 ctx
    // carries NO `cnxml`, so A6 cannot. The contract is therefore that the field is NAMED
    // `regexHits` and there is NO `sourceElements` field to be mistaken for a truth.
    const r = await runCheck(A6, { isText: '++a++ ++b++' });
    const p = r.findings.find((x) => x.dialect === '++');
    expect(p.regexHits).toBe(2);
    expect(p.countIs).toBe('detector');
    expect(p).not.toHaveProperty('sourceElements');
  });

  it('PINS THE FALSE-POSITIVE DIRECTION — ion notation blocking-FAILs A6, deliberately', async () => {
    // 🔴 A CHARACTERIZATION PIN, NOT A REGRESSION PIN. `LEGACY_PLUSPLUS_RE` is
    // `/\+\+[^+]+\+\+/` — `[^+]+` crosses words, so in
    // `Kalsíumjónin Ca++ og magnesíumjónin Mg++ eru tvígildar.` it matches
    // `++ og magnesíumjónin Mg++`: the closing `++` of one ion and the opening of the
    // next, read as one legacy marker. A6 is BLOCKING, so legitimate chemistry prose
    // would halt a paid run.
    //
    // ▶ THE REGEX IS NOT CHANGED, AND THE MEASUREMENT IS WHY. It is E1's binding, shared
    // by identity (see the two pins above) and pinned by E1's own tests — widening it
    // here would silently change a Tier-1 blocking check. And the live risk is ZERO:
    // measured 2026-08-25 over all 207 population files, **49 `++` regex hits and 98 raw
    // `++` occurrences — exactly 49 × 2**, i.e. every `++` in the corpus is half of a
    // paired legacy marker and there are NO orphans. Inspected in context, the four
    // ion-SHAPED candidates are all a marker's closing delimiter (`++bráðnar við −220 °C++`,
    // `(++C++H)`, `K++N++O`). ZERO genuine ion-notation instances.
    //
    // ⚠️ SO THIS IS LATENT, NOT LIVE — and it becomes live exactly when the re-MT run
    // replaces this corpus with prose no legacy marker survives into. This pin exists so
    // whoever meets the first false halt meets it as a DOCUMENTED, measured trade-off
    // rather than as a mystery in production. If the re-MT output carries ion notation,
    // the fix belongs in E1's pattern, with E1's tests, not here.
    const ionProse =
      '<!-- SEG:m1:para:a -->\nKalsíumjónin Ca++ og magnesíumjónin Mg++ eru tvígildar.\n';
    const r = await runCheck(A6, { isText: ionProse });
    expect(r.verdict).toBe(VERDICT.FAIL); // ← the false halt, pinned
    expect(r.findings.find((f) => f.dialect === '++')).toMatchObject({
      regexHits: 1,
      countIs: 'detector', // and it is still LABELLED a detector, never a count
    });
    // By value, so the mechanism is visible rather than asserted: ONE match spanning two
    // separate ions, not two matches.
    expect(ionProse.match(A6_PLUSPLUS_RE)).toEqual(['++ og magnesíumjónin Mg++']);
  });

  it('SKIPPED, not PASS, when the ctx carries no isText — L6/L33', async () => {
    for (const ctx of [{}, { isText: '' }, { isText: null }, { isText: ['x'] }, { segText: 'x' }]) {
      const r = await runCheck(A6, ctx);
      expect(r.verdict).toBe(VERDICT.SKIPPED);
      expect(r.examined).toBe(0);
      expect(r.message).toMatch(/isText/);
    }
  });

  it('is BLOCKING', () => {
    expect(A6.blocking).toBe(true);
    expect(A6.tier).toBe(2);
  });
});

describe('A2b — every marker-like token actually parses (BLOCKING)', () => {
  it('BASE RATE — 0 mismatches over all 207 pairs, BOTH legs, so it can block', async () => {
    // 🔴 THE POPULATION IS NOW PAIRS, NOT FILES, because A2b acquired a cross-side leg.
    // Measured 2026-08-25: 207 IS files, 207 with an EN counterpart (0 without), 207
    // count-equal on the cross-side leg and 0 raw-vs-parsed mismatches. The two-book
    // run-target subset (chemistry 149 + organic 48) is 197/197 — the same measurement,
    // stated over the narrower population, and NOT a disagreement with the 207 above.
    let examined = 0;
    let pairs = 0;
    for (const b of BOOKS) {
      for (const f of FILES[b]) {
        const en = enCounterpart(f);
        expect(en).not.toBeNull(); // 0 IS files lack an EN pair — asserted, not assumed
        const r = await runCheck(A2b, { isText: read(f), segText: read(en) });
        expect(r.verdict).toBe(VERDICT.PASS);
        examined += r.examined;
        pairs++;
      }
    }
    expect(pairs).toBe(207);
    expect(examined).toBe(29476);
  });

  it('MUST-TRIP — a DESTROYED `SEG:` token, which the raw leg structurally cannot see', async () => {
    // 🔴 THIS IS THE DEFECT THE CROSS-SIDE LEG WAS ADDED FOR, AND THE RAW LEG'S BLINDNESS
    // TO IT IS ASSERTED HERE RATHER THAN DESCRIBED. `<!-- SEG:` → `<!-- SEG :` (a space
    // BEFORE the colon — the mirror of the spacing `/v1/grammar` was measured to insert)
    // destroys the 4-byte token BOTH sides of the raw comparison are derived from, so
    // `rawTokens` and `parsed` fall together, 11 → 10, and the comparison cancels.
    // Measured on `main` before this leg existed: A6 PASS, A2b PASS, A2c PASS, 0 findings
    // — a segment silently merged into its predecessor and every blocking check waved it
    // through. A self-referential invariant cannot see damage to its own anchor.
    const destroyed = isText68663.replace('<!-- SEG:', '<!-- SEG :', 1);
    const r = await runCheck(A2b, { isText: destroyed, segText: enText68663 });
    expect(r.verdict).toBe(VERDICT.FAIL);

    // The cross-side leg fires, and carries BOTH counts so the DIRECTION is readable —
    // a damaged EN side must not be reported as MT damage.
    const cross = r.findings.find((f) => f.leg === 'cross-side');
    expect(cross).toMatchObject({
      kind: 'seg-count-cross-side-mismatch',
      enParsed: 11,
      isParsed: 10,
    });

    // ...and the raw leg does NOT, on the very same bytes. That is the positive control
    // that proves the new leg is what caught it, not a coincidental second detector.
    expect(r.findings.find((f) => f.leg === 'raw-vs-parsed')).toBeUndefined();
    expect(countRawSegTokens(destroyed)).toBe(10);
    expect(parseSegmentsMit(destroyed)).toHaveLength(10);
  });

  it('KEEPS the raw leg — it catches damage that PRESERVES the token, which cross-side may not', async () => {
    // Neither leg subsumes the other, asserted by value in the direction the new leg is
    // weak: an eaten `-->` with an EN side that has the SAME parsed count would pass
    // cross-side alone. Here the EN counterpart is the clean IS file itself (11 records),
    // so cross-side ALSO fires — the point is that raw fires too, independently.
    const broken = isText68663.replace('-->', '--', 1);
    const r = await runCheck(A2b, { isText: broken, segText: enText68663 });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.find((f) => f.leg === 'raw-vs-parsed')).toMatchObject({
      kind: 'unparsed-seg-token',
      rawTokens: 11,
      parsed: 10,
    });
  });

  it('SKIPPED, never a silent PASS, when the ctx cannot supply the cross-side leg — L33/L41', async () => {
    // 🔴 §C82 L33/L41: A LEG THE ctx DOES NOT CARRY IS ITSELF A FINDING. This exact rule
    // was closed in E9 and shipped broken again in G5 three commits later, so it is
    // asserted here rather than trusted. Falling back to the single-leg comparison would
    // report PASS on a module whose cross-side check never ran — and `exitCodeFor` reads
    // `verdict` and NEVER `message`, so a caveat in the message is invisible to the gate.
    for (const ctx of [
      { isText: isText68663 },
      { isText: isText68663, segText: '' },
      { isText: isText68663, segText: 42 },
      { isText: isText68663, segText: null },
    ]) {
      const r = await runCheck(A2b, ctx);
      expect(r.verdict).toBe(VERDICT.SKIPPED);
      expect(r.examined).toBe(0);
      expect(r.message).toMatch(/segText/);
    }
  });

  it('PLANTED must-trip — an eaten `-->` leaves a marker-like token that does not parse', async () => {
    const broken = isText68663.replace('-->', '--', 1);
    const r = await runCheck(A2b, { isText: broken, segText: enText68663 });
    expect(r.verdict).toBe(VERDICT.FAIL);
    // ⚠️ BY LEG, NOT BY INDEX. A2b emits up to three findings now, so `findings[0]` would
    // silently stop testing the leg it names the first time another leg fires first.
    expect(r.findings.find((f) => f.leg === 'raw-vs-parsed')).toMatchObject({
      kind: 'unparsed-seg-token',
      rawTokens: 11,
      parsed: 10,
    });
    // The unit is the RAW token count, not the parsed one — 11, the population the
    // predicate compared over, so a file whose markers ALL failed to parse cannot report
    // `examined: 0` as though nothing had been looked at.
    expect(r.examined).toBe(11);
    // Proven BY VALUE, not by the verdict alone: a marker really was lost.
    expect(parseSegmentsMit(broken)).toHaveLength(10);
  });

  it('PLANTED must-trip — the spaced MUSTACHE form, which A6 and A2c both miss', async () => {
    // A6's `LEGACY_MUSTACHE_RE` matches only `i|b|term|fn`, and A2c matches only the
    // HTML-comment form — so this token is invisible to both and A2b is its ONLY detector.
    // This is why the predicate is a raw-token count and not `parseSegmentRecords().length
    // === SEG_MARKER matches`, which would be a tautology.
    const spacedMustache = '{{SEG: m1:para:a}}\nhalló\n<!-- SEG:m1:para:b -->\nheimur\n';
    const enPair = '<!-- SEG:m1:para:a -->\nhello\n<!-- SEG:m1:para:b -->\nworld\n';
    expect((await runCheck(A6, { isText: spacedMustache })).findings).toHaveLength(0);
    expect((await runCheck(A2c, { isText: spacedMustache })).verdict).toBe(VERDICT.PASS);
    const r = await runCheck(A2b, { isText: spacedMustache, segText: enPair });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.find((f) => f.leg === 'raw-vs-parsed')).toMatchObject({
      rawTokens: 2,
      parsed: 1,
    });
  });

  it('EVERY marker damaged — rawTokens stays high, so the FAIL cannot read as an empty run', async () => {
    const allBroken = isText68663.replaceAll('-->', '--');
    const r = await runCheck(A2b, { isText: allBroken, segText: enText68663 });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.find((f) => f.leg === 'raw-vs-parsed')).toMatchObject({
      rawTokens: 11,
      parsed: 0,
      unparsed: 11,
    });
    // ⚠️ This is why the unit is the RAW token count: keyed to `parsed` it would be 0
    // here, and a blocking gate reporting "examined nothing" over a wholly corrupted file
    // is a loader-shaped message for a content-shaped defect.
    expect(r.examined).toBe(11);
  });

  it('counts raw tokens in both delimiter dialects', () => {
    expect(countRawSegTokens('<!-- SEG:a:b:c -->{{SEG:d:e:f}}')).toBe(2);
    expect(countRawSegTokens('engir merkimiðar hér')).toBe(0);
  });

  it('a marker-less IS file against a REAL EN side is a content FAIL, not a SKIPPED', async () => {
    // 🔴 THE CROSS-SIDE LEG STRENGTHENED THIS CASE, AND THE CHANGE IS THE POINT. Before
    // leg 2 this returned PASS at examined 0, which `runCheck` downgraded to SKIPPED — a
    // LOADER-shaped verdict for a CONTENT-shaped defect. With the EN side present the
    // wholesale loss is now named: 11 EN records against 0 IS ones. `runCheck` downgrades
    // only PASS, so the FAIL survives examined 0 and the finding is not lost.
    const r = await runCheck(A2b, {
      isText: 'bara texti, engin SEG merki\n',
      segText: enText68663,
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.examined).toBe(0);
    expect(r.findings.find((f) => f.leg === 'cross-side')).toMatchObject({
      enParsed: 11,
      isParsed: 0,
    });
  });

  it('SKIPPED — genuinely empty on BOTH sides is a loader defect, and still reads as one', async () => {
    // The other half of the branch above: with nothing on either side there is no content
    // finding to make, both legs agree at 0, and PASS+0 correctly downgrades to SKIPPED.
    const r = await runCheck(A2b, {
      isText: 'bara texti, engin SEG merki\n',
      segText: 'just text, no SEG markers\n',
    });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.examined).toBe(0);
  });

  it('MUST-TRIP — the mustache SEG dialect, which the PORT reads and INJECT cannot', async () => {
    // 🔴 THE IDENTITY CLAIM THIS LEG EXISTS TO REPAIR. `parseSegmentsMit` FIRST normalizes
    // `{{SEG:…}}` → `<!-- SEG:… -->`, so it reads a mustache file happily. `cnxml-inject.js`
    // uses `parseSegmentsMap` from the same shared lib with NO such normalization, and that
    // returns ZERO. Measured: on these bytes A6, A2b (pre-fix) and A2c ALL passed while the
    // port saw 2 records and inject saw 0 — a file inject cannot read, passing the gates
    // that exist to protect inject.
    const mustache = '{{SEG:m1:para:a}}\nhalló\n{{SEG:m1:para:b}}\nheimur\n';
    const enPair = '<!-- SEG:m1:para:a -->\nhello\n<!-- SEG:m1:para:b -->\nworld\n';

    // Proven BY VALUE, on the same bytes the check judges — the two parsers disagree.
    expect(parseSegmentsMit(mustache)).toHaveLength(2);
    expect(parseSegmentsMap(mustache).size).toBe(0);

    const r = await runCheck(A2b, { isText: mustache, segText: enPair });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.find((f) => f.leg === 'inject-dialect')).toMatchObject({
      kind: 'mustache-seg-dialect',
      occurrences: 2,
    });
    // The other two legs are SILENT here — the raw and cross-side counts both read 2,
    // because the port normalizes. That is exactly why this needs its own leg.
    expect(r.findings.find((f) => f.leg === 'raw-vs-parsed')).toBeUndefined();
    expect(r.findings.find((f) => f.leg === 'cross-side')).toBeUndefined();
  });

  it('PREMISE PIN — 0 mustache-dialect files in the population, so the leg can block', async () => {
    // 🔴 A GUARD THAT MATCHES NOTHING IS INDISTINGUISHABLE FROM A BROKEN ONE (L44③), so
    // this zero is only interpretable beside the planted trip above. Measured 2026-08-25:
    // 0 of 207 IS files and 0 of 207 EN files carry `{{SEG:`.
    // ⚠️ AND THE ZERO IS A STATEMENT ABOUT THE POPULATION, NOT ABOUT THE TREE. 7 files on
    // disk DO carry the dialect — `books/efnafraedi-2e/02-mt-output/ch05/m6872{4,6,7}-
    // segments(b|c|d).is.md` — and every one is OUTSIDE the walker, whose `-segments.is.md`
    // suffix filter excludes the parenthesized variants. They are unexamined by this
    // battery, deliberately: widening the filter to reach them moves every corpus count in
    // this file. Logged to the active register rather than fixed here.
    let mustacheFiles = 0;
    let files = 0;
    for (const b of BOOKS) {
      for (const f of FILES[b]) {
        files++;
        if (read(f).includes('{{SEG:')) mustacheFiles++;
        const en = enCounterpart(f);
        if (en && read(en).includes('{{SEG:')) mustacheFiles++;
      }
    }
    expect(files).toBe(207);
    expect(mustacheFiles).toBe(0);
  });

  it('SKIPPED on a missing or wrong-typed isText — L33: a wrong shape is not an empty result', async () => {
    for (const ctx of [
      {},
      { isText: 42, segText: enText68663 },
      { isText: {}, segText: enText68663 },
    ]) {
      const r = await runCheck(A2b, ctx);
      expect(r.verdict).toBe(VERDICT.SKIPPED);
      expect(r.examined).toBe(0);
    }
  });

  it('is BLOCKING', () => {
    expect(A2b.blocking).toBe(true);
  });
});

describe('A2c — no spaced `<!-- SEG: ` form (BLOCKING)', () => {
  it('POSITIVE CONTROL — 0 spaced forms against 29,476 canonical markers over 207 files', async () => {
    // 🔴 A GUARD THAT MATCHES NOTHING IS INDISTINGUISHABLE FROM ONE THAT WORKS (L44③).
    // The clean corpus is only interpretable beside the planted trip below.
    let markers = 0;
    let files = 0;
    for (const b of BOOKS) {
      for (const f of FILES[b]) {
        const r = await runCheck(A2c, { isText: read(f) });
        expect(r.verdict).toBe(VERDICT.PASS);
        markers += r.examined;
        files++;
      }
    }
    expect(files).toBe(207);
    expect(markers).toBe(29476);
  });

  it('PLANTED must-trip — and the SILENT DROP is proven by value, not by the verdict', async () => {
    const spaced = isText68663.replace('<!-- SEG:', '<!-- SEG: ', 1);
    const r = await runCheck(A2c, { isText: spaced });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings[0]).toMatchObject({ kind: 'spaced-seg-marker', occurrences: 1 });
    // The mechanism: the spaced form does not parse, so a whole segment vanishes with
    // no error anywhere. 11 → 10, measured on the same bytes the check judged.
    expect(parseSegmentsMit(isText68663)).toHaveLength(11);
    expect(parseSegmentsMit(spaced)).toHaveLength(10);
  });

  it('EVERY marker spaced — a blocking FAIL at examined 0, which runCheck must NOT hide', async () => {
    // 🔴 THE REALISTIC WORST CASE, AND THE ONLY FIXTURE WHERE THE CONTRACT ITSELF IS LOAD
    // BEARING. `/v1/grammar` was measured to introduce exactly this spacing into the
    // sibling bracket markers, and it would not do it to one marker. Every other A2c
    // fixture spaces ONE, so `examined` stays non-zero and this branch never runs.
    // `runCheck` downgrades PASS+0 to SKIPPED and deliberately does NOT downgrade FAIL —
    // a check that found something wrong while examining zero units has a defect worth
    // surfacing. If that ever changed, the file where NOTHING parses would read SKIPPED.
    const allSpaced = isText68663.replaceAll('<!-- SEG:', '<!-- SEG: ');
    const r = await runCheck(A2c, { isText: allSpaced });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.examined).toBe(0);
    expect(r.findings[0]).toMatchObject({ kind: 'spaced-seg-marker', occurrences: 11 });
    // By value: all 11 records are gone, and no error was raised anywhere.
    expect(parseSegmentsMit(allSpaced)).toHaveLength(0);
  });

  it('SPACED_SEG_RE fires on the spaced form and not on the canonical one', () => {
    expect('<!-- SEG: m1:para:a -->'.match(SPACED_SEG_RE)).toHaveLength(1);
    expect('<!-- SEG:m1:para:a -->'.match(SPACED_SEG_RE)).toBeNull();
  });

  it('SKIPPED, not PASS, when the ctx carries no isText', async () => {
    const r = await runCheck(A2c, {});
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.examined).toBe(0);
  });

  it('is BLOCKING', () => {
    expect(A2c.blocking).toBe(true);
  });
});

describe('A1 — the EN and IS seg-id SETS are equal (ADVISORY)', () => {
  it('is ADVISORY — 4/207 = 1.9% on the committed corpus, which cannot block a paid run', () => {
    // ⚠️ THE FIGURE AND ITS POPULATION IN ONE BREATH, and it is the SAME figure the
    // docstring carries. This line read "1.7%" while `remt-checks-mt.js` read "4/207
    // (1.9%)" — two numbers for one measurement, in a repo whose § One source of truth
    // exists to stop exactly that. 4/207 = 1.932%, so 1.9% is the correct rounding; 1.7%
    // was arithmetic on no population at all.
    expect(A1.blocking).toBe(false);
  });

  it('PASSES on a clean real pair', async () => {
    const r = await runCheck(A1, { segText: enText68663, isText: isText68663 });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(11);
  });

  it('NATURAL must-trip — 4 organic exercises bundles whose MT ALTERED seg-id digits', async () => {
    // 🔴 THIS FALSIFIES THE PLAN'S RATIONALE FOR A1 BEING ADVISORY, AND THE MECHANISM IS
    // THE POINT: `validateMarkers` (api-translate.js:280) compares
    // `input.match(/<!-- SEG:/g).length === output.match(...).length` — COUNTS. An id
    // whose digits the MT rewrote leaves the count untouched, so the pre-write guard is
    // structurally blind to it and these four reached disk. §C89 verbatim: a count cannot
    // see a substitution. A1 stays advisory because the base rate is 4/207, not 0.
    const hits = [];
    for (const b of BOOKS) {
      for (const f of FILES[b]) {
        const en = enCounterpart(f);
        if (!en) continue;
        const r = await runCheck(A1, { segText: read(en), isText: read(f) });
        if (r.verdict !== VERDICT.PASS) hits.push([f, r]);
      }
    }
    expect(hits).toHaveLength(4);
    expect(hits.map(([f]) => f.match(/(ch\d+)\/exercises/)[1])).toEqual([
      'ch06',
      'ch12',
      'ch26',
      'ch29',
    ]);
    const [, first] = hits[0];
    expect(first.verdict).toBe(VERDICT.WARN); // advisory: a finding, never a halt
    // L6, pinned by VALUE: the unit is the UNION of both sides. ch06 is 153 EN and 153 IS
    // seg-ids with one differing on each side, so the union is 154 — a number neither
    // side alone can produce, which is what kills an `examined = isIds.size` mutant.
    expect(first.examined).toBe(154);
    expect(first.findings[0]).toMatchObject({
      kind: 'seg-id-set-mismatch',
      enOnly: ['06-99-OC-VC03:stem:353278-b0'],
      isOnly: ['06-99-OC-VC03:stem:353282-b0'],
    });
  });

  it('SKIPPED when EITHER side is missing — L6: examined must not count an unrun comparison', async () => {
    // The exact L6 shape: keying `examined` to the IS side alone would report a high
    // count over a comparison that never happened, in the one check with two inputs.
    const enOnly = await runCheck(A1, { segText: enText68663 });
    expect(enOnly.verdict).toBe(VERDICT.SKIPPED);
    expect(enOnly.examined).toBe(0);
    expect(enOnly.message).toMatch(/isText/);

    const isOnly = await runCheck(A1, { isText: isText68663 });
    expect(isOnly.verdict).toBe(VERDICT.SKIPPED);
    expect(isOnly.examined).toBe(0);
    expect(isOnly.message).toMatch(/segText/);
  });
});

describe('registry wiring — a check that is never selected does not exist', () => {
  it('registers exactly the four free-half checks at tier 2', () => {
    expect(MT_FREE_CHECKS.map((c) => c.id)).toEqual(['A1', 'A6', 'A2b', 'A2c']);
    for (const c of MT_FREE_CHECKS) {
      expect(REGISTRY.get(c.id)).toBe(c);
      expect(c.tier).toBe(2);
    }
    // ⚠️ VERSIONS ARE PINNED INDIVIDUALLY, NOT AS "all 1". `defineCheck`'s contract is
    // "bump whenever the JUDGEMENT changes", and A2b's did: it acquired the cross-side
    // leg. Decision ① scopes quarantine on this stamp, so a verdict recorded by A2b v1
    // must not be readable as one this version would have produced.
    expect(Object.fromEntries(MT_FREE_CHECKS.map((c) => [c.id, c.version]))).toEqual({
      A1: 1,
      A6: 1,
      A2b: 2,
      A2c: 1,
    });
    expect([...REGISTRY.values()].filter((c) => c.tier === 2)).toHaveLength(4);
  });
});
