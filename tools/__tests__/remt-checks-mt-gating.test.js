/**
 * Tier 2, the gating half — A3 (marker delta), A5 (EN residue, two stages), A7 (numbers).
 *
 * ── THE POPULATION, STATED ONCE SO EVERY NUMBER BELOW INHERITS IT ──────────────
 * Run targets only: `02-mt-output/**\/*-segments.is.md`, `chapter-metadata-*` excluded,
 * chemistry **149** + organic **48** = **197** pairs, 28,818 paired segments.
 * ⚠️ `orverufraedi` is EXCLUDED from every rate here (§C80/§C109 withdrew it from the
 * run) but its committed bytes remain legitimate fixture input — `m58781` is A3's
 * true-positive fixture, which Global Constraints permits explicitly.
 * 🔴 THE PLAN'S "220 pairs" AND A5's "9 segments" ARE BOTH STALE IN THE SAME WAY: 220
 * is a population that no longer exists, and 9 is 7 run-target segments plus 2 micro
 * ones. Measured 2026-08-26 → `test-results/c82-a3-baserate-2026-08-26.md`.
 *
 * 🔴 THE CORPUS PINS ARE PREMISE PINS, NOT REGRESSION PINS (§C82 L20/L27). Every number
 * over `02-mt-output` moves when the clean-break run replaces it; that is the corpus
 * changing, and they are updated in the commit that observes it. So every check ALSO
 * carries a PLANTED fixture that no re-MT can repair.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runCheck, VERDICT, REGISTRY } from '../lib/remt-battery.js';
import {
  A3,
  A5,
  A7,
  MT_GATING_CHECKS,
  checkNumbers,
  extractNumbers,
} from '../lib/remt-checks-mt.js';
import { mtOutputSegmentFiles, enCounterpart, REPO_ROOT } from './helpers/remt-corpus.js';
import { loadResidueAllowlist } from '../lib/residue-allowlist.js';

const read = (p) => fs.readFileSync(p, 'utf8');
const BOOKS = ['efnafraedi-2e', 'lifraen-efnafraedi'];

/** The `{segText, isText}` pair for one module, by book+chapter+module. */
const pair = (b, ch, m) => ({
  segText: read(path.join(REPO_ROOT, 'books', b, '02-for-mt', ch, `${m}-segments.en.md`)),
  isText: read(path.join(REPO_ROOT, 'books', b, '02-mt-output', ch, `${m}-segments.is.md`)),
});

describe('population control — an empty walk must not pass anything below', () => {
  it('walks the measured run-target file counts', () => {
    expect(mtOutputSegmentFiles('efnafraedi-2e')).toHaveLength(149);
    expect(mtOutputSegmentFiles('lifraen-efnafraedi')).toHaveLength(48);
  });

  it('🔴 pins that ORGANIC IS 5% EXTRACTED — every organic rate here is a sliver', () => {
    // Raised as a lead question on 2026-08-26 ("have we downloaded the complete organic
    // source?"). The answer is that the DOWNLOAD is complete and the EXTRACTION is not,
    // and the second is the more dangerous of the two because it is invisible: a
    // partial download shows up as absent files and a manifest mismatch, while a
    // 5%-extracted book yields 02-mt-output numbers that read as whole-book numbers.
    // ▶ So this pin exists to make the denominator impossible to lose. Chemistry is
    // 149/149; organic is 19/342, and every organic percentage in this file is over 17.
    const srcCount = (b) =>
      fs
        .readdirSync(path.join(REPO_ROOT, 'books', b, '01-source'), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .reduce(
          (n, d) =>
            n +
            fs
              .readdirSync(path.join(REPO_ROOT, 'books', b, '01-source', d.name))
              .filter((f) => f.endsWith('.cnxml')).length,
          0
        );
    // The source really is all there — 342 of 342, matching collection-order.json and
    // .source-info.json's moduleCount. No upstream refresh is implied by any of this,
    // and organic is the one kept book the CC BY-NC-SA refresh path could touch.
    expect(srcCount('lifraen-efnafraedi')).toBe(342);
    expect(srcCount('efnafraedi-2e')).toBe(149);

    const enModules = (b) =>
      mtOutputSegmentFiles(b).filter(
        (p2) => enCounterpart(p2) && path.basename(p2) !== 'exercises-segments.is.md'
      ).length;
    expect(enModules('efnafraedi-2e')).toBe(149); // 100% of source
    expect(enModules('lifraen-efnafraedi')).toBe(17); // 5.0% of 342
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A3 — per-segment bracket-marker delta', () => {
  /**
   * 🔴 THE ASSERTION THAT SEPARATES THE TWO DESIGNS, AND THE CORPUS CANNOT MAKE IT.
   *
   * `bracketMarkerDeltaBySegment` DELETES types whose per-segment deltas sum to zero
   * (`api-translate.js:612`), so a module that loses a MATH in one segment and gains one
   * in another has `total === {}` and TWO `bySegment` entries. A check keyed on `total`
   * returns PASS here; one keyed on `segmentsWithDelta` returns WARN.
   *
   * ⚠️ MEASURED: on all 197 run-target pairs the two predicates agree EXACTLY
   * (107 = 107, cancel-only modules = 0). So the natural corpus is structurally
   * incapable of catching the wrong choice — this planted fixture is the only detector,
   * and the plan's acceptance trio is written in `total`-shaped notation (`m68791 → {}`),
   * which is exactly what a literal transcription would build against.
   */
  it('FIRES on a cross-segment cancellation, where `total` is empty', async () => {
    const en = '<!-- SEG:m1:para:a -->\n[[MATH:1]] hello\n\n<!-- SEG:m1:para:b -->\nworld\n';
    const is = '<!-- SEG:m1:para:a -->\nhalló\n\n<!-- SEG:m1:para:b -->\n[[MATH:1]] heimur\n';
    const r = await runCheck(A3, { segText: en, isText: is });
    expect(r.verdict).toBe(VERDICT.WARN);
    // Both segments carry a delta; neither survives into `total`.
    expect(r.findings.filter((f) => f.kind === 'marker-delta')).toHaveLength(2);
    expect(r.examined).toBe(2);
  });

  it('PASSES a module whose markers are preserved segment for segment', async () => {
    const en = '<!-- SEG:m1:para:a -->\n[[i:hello]] and [[MATH:1]]\n';
    const is = '<!-- SEG:m1:para:a -->\n[[i:halló]] og [[MATH:1]]\n';
    const r = await runCheck(A3, { segText: en, isText: is });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.findings).toHaveLength(0);
    expect(r.examined).toBe(1);
  });

  it('reports an unpaired segment as its own finding, not as silence', async () => {
    // The instrument's own docstring: "a missing occurrence is a worse defect than a
    // marker delta and a comparison that quietly drops it reads as clean."
    const en = '<!-- SEG:m1:para:a -->\nhello\n\n<!-- SEG:m1:para:b -->\nworld\n';
    const is = '<!-- SEG:m1:para:a -->\nhalló\n';
    const r = await runCheck(A3, { segText: en, isText: is });
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.findings.filter((f) => f.kind === 'unpaired-segment')).toHaveLength(1);
    expect(r.findings.find((f) => f.kind === 'unpaired-segment').segmentId).toBe('m1:para:b');
  });

  describe('the acceptance trio, re-measured against today’s tree', () => {
    it('m58781 (micro fixture bytes) is the true positive — b:-2', async () => {
      const r = await runCheck(A3, pair('orverufraedi', 'ch01', 'm58781'));
      expect(r.verdict).toBe(VERDICT.WARN);
      expect(r.findings.filter((f) => f.kind === 'marker-delta')).toHaveLength(1);
      expect(r.findings[0].delta).toEqual({ b: -2 });
    });

    it('m68791 is the true negative — 380 segments, no delta', async () => {
      const r = await runCheck(A3, pair('efnafraedi-2e', 'ch12', 'm68791'));
      expect(r.verdict).toBe(VERDICT.PASS);
      expect(r.findings).toHaveLength(0);
      expect(r.examined).toBe(380);
    });

    it('🔴 m68823 — the PROVEN false negative the §C69 widening exists to close', async () => {
      // It returned `{}` before `MATH` entered the tallied set, while MATH went 56→54.
      const r = await runCheck(A3, pair('efnafraedi-2e', 'ch17', 'm68823'));
      expect(r.verdict).toBe(VERDICT.WARN);
      const deltas = r.findings.filter((f) => f.kind === 'marker-delta');
      expect(deltas).toHaveLength(2);
      expect(deltas.every((f) => 'MATH' in f.delta)).toBe(true);
      // L37: the COUNT beside the predicate — `[].every(...)` is vacuously true.
      expect(deltas.reduce((a, f) => a + f.delta.MATH, 0)).toBe(-2);
    });
  });

  it('is ADVISORY, and the measured base rate is why', () => {
    // 🔴 THE PLAN'S TASK HEADING IS "A3 gating". THE MEASUREMENT REFUSES IT.
    // Global Constraints rule 4: a post-MT check that blocks needs a base rate ≤ ~5%.
    // Measured 2026-08-26: 107/197 = 54.31% over the committed corpus, and 11/101 =
    // 10.89% over the pairs whose EN side does NOT postdate their IS side. Blocking is
    // refused on BOTH numbers, so the verdict does not turn on the split.
    expect(A3.blocking).toBe(false);
  });

  it('SKIPS — never passes — when the ctx cannot supply a side', async () => {
    for (const ctx of [{ isText: 'x' }, { segText: 'x' }, { segText: 'x', isText: '' }, {}]) {
      const r = await runCheck(A3, ctx);
      expect(r.verdict).toBe(VERDICT.SKIPPED);
      expect(r.examined).toBe(0);
    }
    expect((await runCheck(A3, { isText: 'x' })).message).toMatch(/segText/);
  });

  it('premise pin — the base rate that refuses blocking, split by finding kind', () => {
    // 🔴 THE THREE NUMBERS ARE PINNED SEPARATELY BECAUSE THEY ANSWER DIFFERENT QUESTIONS,
    // and a single "modules with findings" count silently conflates them. Folding
    // `unpaired-segment` into A3 (see its docstring) moves the module rate 107 → 111; the
    // decision to fold it in is a correctness one, and this is what it costs.
    let deltaMods = 0;
    let unpairedMods = 0;
    let anyMods = 0;
    let pairs = 0;
    for (const b of BOOKS) {
      for (const isPath of mtOutputSegmentFiles(b)) {
        const enPath = enCounterpart(isPath);
        if (!enPath) continue;
        pairs++;
        const f = A3.run({ segText: read(enPath), isText: read(isPath) }).findings;
        if (f.some((x) => x.kind === 'marker-delta')) deltaMods++;
        if (f.some((x) => x.kind === 'unpaired-segment')) unpairedMods++;
        if (f.length) anyMods++;
      }
    }
    expect(pairs).toBe(197); // control: an empty walk cannot pass
    expect(deltaMods).toBe(107); // 54.31% — the marker-destruction rate
    expect(unpairedMods).toBe(4); //  2.03% — segments that went missing entirely
    expect(anyMods).toBe(111); // 56.35% — what A3 would halt on, were it blocking
    // Global Constraints rule 4 needs ≤ ~5%. Every one of these is an order of magnitude
    // over it, which is why `A3.blocking === false` above.
    expect(anyMods / pairs).toBeGreaterThan(0.05);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A5 — untranslated-EN residue, two stages', () => {
  const allowFor = (b) => loadResidueAllowlist(path.join(REPO_ROOT, 'books', b));

  it('🔴 SKIPS when the allowlist is absent — absent is NOT "nothing is tolerated"', async () => {
    // `classifyResidue` does `(allowlist.entries || [])`, so an absent or empty allowlist
    // silently tolerates NOTHING and m68662's 76 known-good residues all fire. The gate
    // is pure (Global Constraints rule 5) so it cannot read the file itself: the loader
    // must supply it, and a loader that does not gets SKIPPED naming the key.
    const r = await runCheck(A5, { segText: 'x', isText: 'y', module: 'm1' });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.examined).toBe(0);
    expect(r.message).toMatch(/residueAllowlist/);
  });

  it('SKIPS when the module id is absent — the allowlist is keyed on it', async () => {
    const r = await runCheck(A5, { segText: 'x', isText: 'y', residueAllowlist: { entries: [] } });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toMatch(/module/);
  });

  it('🔴 SKIPS an exercises bundle — its allowlist entries are unreachable from that id', async () => {
    // Measured: ALL 12 of organic's allowlist entries are nickname-keyed (11-03-OC-P06,
    // 26-04-OC-P08, …). A lookup on the literal 'exercises' matches none of them, so every
    // residue in the bundle would report as untriaged — ~11 of organic's 20. This mirrors
    // `scan-residue.js`'s `collectResidueFiles`, which drops the same file by exact name.
    const prose = 'The quick brown fox jumps over the lazy dog while the chemist observes.';
    const text = `<!-- SEG:m1:para:a -->\n${prose}\n`;
    const r = await runCheck(A5, {
      segText: text,
      isText: text,
      module: 'exercises',
      residueAllowlist: { entries: [] },
    });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.examined).toBe(0);
    expect(r.findings).toHaveLength(0);
    expect(r.message).toMatch(/nickname-keyed/);
    // The control that makes the skip mean something: the SAME text under a real module id
    // is a finding. Without this, a guard that skipped everything would also pass.
    const control = await runCheck(A5, {
      segText: text,
      isText: text,
      module: 'm1',
      residueAllowlist: { entries: [] },
    });
    expect(control.verdict).toBe(VERDICT.WARN);
    expect(control.findings).toHaveLength(1);
  });

  it('stage 1 flags a verbatim-EN segment, and the allowlist tolerates it', async () => {
    const prose =
      'The quick brown fox jumps over the lazy dog while the chemist observes the reaction.';
    const en = `<!-- SEG:m1:para:a -->\n${prose}\n`;
    const is = `<!-- SEG:m1:para:a -->\n${prose}\n`;
    const bare = await runCheck(A5, {
      segText: en,
      isText: is,
      module: 'm1',
      residueAllowlist: { entries: [] },
    });
    expect(bare.verdict).toBe(VERDICT.WARN);
    expect(bare.findings.filter((f) => f.kind === 'en-residue')).toHaveLength(1);

    const tolerated = await runCheck(A5, {
      segText: en,
      isText: is,
      module: 'm1',
      residueAllowlist: {
        entries: [
          { moduleId: 'm1', segmentId: 'm1:para:a', class: 'proper-noun', reason: 'test fixture' },
        ],
      },
    });
    expect(tolerated.verdict).toBe(VERDICT.PASS);
    expect(tolerated.findings).toHaveLength(0);
    expect(tolerated.examined).toBe(1); // it examined the segment and cleared it
  });

  it('stage 2 fires only past the 120-alphabetic-character floor', async () => {
    const short = 'The cat sat on the mat and watched.'; // < 120 alpha chars
    const long =
      'Among the most common mass spectrometers used for routine purposes in the laboratory is the electron impact magnetic sector instrument shown here.';
    const mk = (t) => `<!-- SEG:m1:para:a -->\n${t}\n`;
    const base = { module: 'm1', residueAllowlist: { entries: [] } };

    const s = await runCheck(A5, { ...base, segText: mk(short), isText: mk(short) });
    expect(s.findings.filter((f) => f.kind === 'long-en-residue')).toHaveLength(0);
    expect(s.findings.filter((f) => f.kind === 'en-residue')).toHaveLength(1); // stage 1 still fires

    const l = await runCheck(A5, { ...base, segText: mk(long), isText: mk(long) });
    expect(l.findings.filter((f) => f.kind === 'long-en-residue')).toHaveLength(1);
  });

  it('🔴 stage 2 RESPECTS the allowlist — the corpus cannot adjudicate this', () => {
    // Stage 2 is a strict SUBSET of stage 1, allowlist filter included: an allowlist entry
    // records a human triage, so re-queueing it for a human contradicts the record.
    // ⚠️ MEASURED: none of the 7 real stage-2 hits is allowlisted, so BOTH designs give 7
    // today and the corpus is structurally incapable of separating them. Planted, as A3's
    // cancellation fixture is planted, for exactly the same reason.
    const long =
      'Among the most common mass spectrometers used for routine purposes in the laboratory is the electron impact magnetic sector instrument shown here.';
    const text = `<!-- SEG:m1:para:a -->\n${long}\n`;
    const ctx = { segText: text, isText: text, module: 'm1' };

    const unlisted = A5.run({ ...ctx, residueAllowlist: { entries: [] } });
    expect(unlisted.findings.map((f) => f.kind).sort()).toEqual(['en-residue', 'long-en-residue']);

    const listed = A5.run({
      ...ctx,
      residueAllowlist: {
        entries: [
          { moduleId: 'm1', segmentId: 'm1:para:a', class: 'proper-noun', reason: 'triaged' },
        ],
      },
    });
    expect(listed.findings).toHaveLength(0);
    expect(listed.verdict).toBe(VERDICT.PASS);
    expect(listed.examined).toBe(1); // it judged the segment and cleared it
    expect(listed.message).toMatch(/1 tolerated/);
  });

  it('🔴 tolerates a REPEATED occurrence of an allowlisted seg-id, not just the first', () => {
    // Found by mutation testing, not by design: `segmentId.replace(/#\\d+$/, '')` had
    // nothing binding it, and deleting the strip left every test green.
    // A duplicated raw `SEG:` marker's second occurrence is keyed `id#2` (so that a delta
    // confined to it is not silently dropped — see `pairByOccurrence`), but the allowlist
    // is keyed on the BARE id and carries ONE triage decision for the segment. Without the
    // strip, occurrence #2 is judged un-triaged and reports a finding a human already
    // cleared — the allowlist would appear to work while covering only first occurrences.
    const prose = 'The quick brown fox jumps over the lazy dog while the chemist observes.';
    const dup = `<!-- SEG:m1:para:a -->\n${prose}\n\n<!-- SEG:m1:para:a -->\n${prose}\n`;
    const allowlisted = {
      entries: [
        { moduleId: 'm1', segmentId: 'm1:para:a', class: 'proper-noun', reason: 'triaged once' },
      ],
    };

    // The control that makes the assertion mean something: BOTH occurrences are real
    // residues, so an un-allowlisted run must report exactly two.
    const bare = A5.run({
      segText: dup,
      isText: dup,
      module: 'm1',
      residueAllowlist: { entries: [] },
    });
    expect(bare.examined).toBe(2);
    expect(bare.findings.filter((f) => f.kind === 'en-residue')).toHaveLength(2);
    expect(bare.findings.map((f) => f.segmentId)).toEqual(['m1:para:a', 'm1:para:a#2']);

    const listed = A5.run({
      segText: dup,
      isText: dup,
      module: 'm1',
      residueAllowlist: allowlisted,
    });
    expect(listed.examined).toBe(2); // it judged both, and cleared both
    expect(listed.findings).toHaveLength(0);
    expect(listed.message).toMatch(/2 tolerated/);
  });

  it('is ADVISORY — stage 1 is blocking only AFTER the allowlist is re-derived', () => {
    // 🔴 THE CONSTRAINT IS SEQUENCING, NOT THE BASE RATE. Measured 2026-08-26 the rate is
    // 5/166 = 3.01%, which is UNDER the 5% bar — but `residue-allowlist.json` is keyed on
    // exact moduleId+segmentId and the re-extract renumbers seg-ids, voiding every entry.
    // ⚠️ And the pooled rate hides the spread: chemistry 1/149 = 0.67%, organic 4/17 =
    // 23.53%. Organic has only SEVENTEEN non-exercises modules carrying segments — never
    // quote that percentage without its denominator.
    expect(A5.blocking).toBe(false);
  });

  it('premise pin — m68662 carries 76 stage-1 residues past its allowlist', () => {
    const r = A5.run({
      ...pair('efnafraedi-2e', 'ch00', 'm68662'),
      module: 'm68662',
      residueAllowlist: allowFor('efnafraedi-2e'),
    });
    expect(r.findings.filter((f) => f.kind === 'en-residue')).toHaveLength(76);
  });

  it('premise pin — 31 of the 197 pairs are exercises bundles A5 must skip', () => {
    // A load-bearing population fact, not a curiosity: the guard removes 15.7% of the
    // corpus from A5's judgement, and ALL of it is organic — which has only 17
    // non-exercises modules carrying segments at all.
    let pairs = 0;
    let skipped = 0;
    for (const b of BOOKS) {
      for (const isPath of mtOutputSegmentFiles(b)) {
        if (!enCounterpart(isPath)) continue;
        pairs++;
        if (path.basename(isPath) === 'exercises-segments.is.md') skipped++;
      }
    }
    expect(pairs).toBe(197); // control
    expect(skipped).toBe(31);
  });

  it('premise pin — stage 2 finds 7 long residues in 3 run-target modules', () => {
    const hits = [];
    let pairs = 0;
    for (const b of BOOKS) {
      const allow = allowFor(b);
      for (const isPath of mtOutputSegmentFiles(b)) {
        const enPath = enCounterpart(isPath);
        if (!enPath) continue;
        pairs++;
        const m = path.basename(isPath).replace('-segments.is.md', '');
        const r = A5.run({
          segText: read(enPath),
          isText: read(isPath),
          module: m,
          residueAllowlist: allow,
        });
        for (const f of r.findings.filter((x) => x.kind === 'long-en-residue')) hits.push({ m, f });
      }
    }
    expect(pairs).toBe(197); // control
    expect(hits).toHaveLength(7);
    expect([...new Set(hits.map((h) => h.m))].sort()).toEqual(['m00037', 'm00135', 'm68662']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A7 — number consistency, ported from the AGPL qaCheckService', () => {
  /**
   * ⚠️ A test-only `require` of `server/` is NOT a shipped MIT→AGPL edge — root LICENSE's
   * enumeration covers the tooling, not the test suite. This pin is the ONLY evidence the
   * port still tracks the code it was copied from. Do not "fix" it by deleting it.
   */
  const require_ = createRequire(import.meta.url);
  const agpl = require_('../../server/services/qaCheckService.js');

  it('agrees with the AGPL original on real corpus text', () => {
    const { segText, isText } = pair('efnafraedi-2e', 'ch01', 'm68663');
    const mine = checkNumbers(segText, isText);
    expect(mine).toEqual(agpl.checkNumbers(segText, isText));
    expect(extractNumbers(segText).length).toBeGreaterThan(0); // control: it found numbers
  });

  it('\U0001f534 preserves U+00A0 and U+2009 inside the numeric character class', () => {
    // BOTH `extractNumbers` regexes carry a NBSP and a THIN SPACE beside the ASCII space,
    // and neither renders. They are load-bearing: NBSP and thin space are exactly the
    // thousands separators European/Icelandic formatting uses, so a hand transcription
    // that loses them splits "1 000" into "1" and "000" and invents two findings.
    // \u26a0\ufe0f THE SEPARATORS ARE WRITTEN AS ESCAPES ON PURPOSE. Typed literally they are
    // invisible in a diff and in `grep`, so an editor that normalises whitespace — or a
    // careful reader "tidying" what looks like three identical spaces — would silently
    // reduce this to three copies of the ASCII case, leaving the test green and the very
    // regression it exists to catch uncovered. CLAUDE.md \u00a7 invisible control bytes.
    const SEPARATORS = { space: '\u0020', nbsp: '\u00a0', thin: '\u2009' };
    for (const [name, sep] of Object.entries(SEPARATORS)) {
      expect(extractNumbers(`1${sep}000`), name).toEqual([`1${sep}000`]);
      expect(
        checkNumbers(`we need 1${sep}000 grams`, 'vi\u00f0 \u00feurfum 1000 gr\u00f6mm'),
        name
      ).toHaveLength(0);
    }
    // L37: the COUNT beside the predicate — a loop over an empty object is vacuously true.
    expect(Object.keys(SEPARATORS)).toHaveLength(3);
    // The mutant this kills: drop the two invisible members from the character class and
    // `1\u00a0000` splits into `1` and `000`, so this asserts ONE finding where a broken
    // port reports two. Paired with a control that must stay clean, above.
    expect(checkNumbers('we need 1\u00a0000 grams', 'vi\u00f0 \u00feurfum ekkert')).toHaveLength(1);
  });

  it('flags a number present in EN and absent from IS', () => {
    expect(checkNumbers('heat to 350 degrees', 'hitið að 200 gráðum')).toEqual([
      expect.objectContaining({ type: 'number-mismatch', value: '350' }),
    ]);
  });

  it('tolerates the decimal comma, which is why the port keeps numberKey', () => {
    expect(checkNumbers('3.5 mol', '3,5 mól')).toHaveLength(0);
  });

  it('is ADVISORY — numberKey collides 3.5 with 35 by its own admission', async () => {
    expect(A7.blocking).toBe(false);
    const r = await runCheck(A7, {
      segText: '<!-- SEG:m1:para:a -->\nheat to 350 degrees\n',
      isText: '<!-- SEG:m1:para:a -->\nhitið að 200 gráðum\n',
    });
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.examined).toBe(1);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].segmentId).toBe('m1:para:a');
  });

  it('SKIPS when a side is missing', async () => {
    const r = await runCheck(A7, { isText: 'x' });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toMatch(/segText/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('registry', () => {
  it('registers exactly the three gating checks', () => {
    expect(MT_GATING_CHECKS.map((c) => c.id)).toEqual(['A3', 'A5', 'A7']);
    for (const c of MT_GATING_CHECKS) {
      expect(c.tier).toBe(2);
      expect(c.blocking).toBe(false);
    }
  });

  it('tier 2 now holds all ten Tier-2 checks', () => {
    const tier2 = [...REGISTRY.values()].filter((c) => c.tier === 2);
    expect(tier2.map((c) => c.id).sort()).toEqual([
      'A1',
      'A2a',
      'A2b',
      'A2c',
      'A3',
      'A4',
      'A5',
      'A6',
      'A7',
      'A8',
    ]);
  });
});
