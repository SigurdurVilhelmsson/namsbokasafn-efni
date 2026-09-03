/**
 * Tier 1 — E2, E4, E7.
 *
 * 🔴 WHAT THIS FILE IS REALLY GUARDING. Three of these tests were measured RED against
 * the plan's own reference code before they were written, because a guard written
 * together with its test proves nothing:
 *
 *   E2 FAILs on m68733            plan code: PASS  — `{…}.length` is undefined (L1)
 *   E2 examined > 0 on m68663     plan code: 0     — 0 comparable marker bodies (L9)
 *   E4 examined > 0 on m68663     plan code: 0     — 0 <list> elements (L17)
 *
 * and one more that the plan's code cannot reach at all: `[...dupFindings]` THROWS,
 * because `analyzeModule().dupFindings` is `{sourceDup, rawDup}` (L2).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runCheck, VERDICT, REGISTRY } from '../lib/remt-battery.js';
import { E2, E4, E7, EXTRACT_CHECKS, countSegments } from '../lib/remt-checks-extract.js';
import { modulesWithSegments } from './helpers/remt-corpus.js';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const src = (b, ch, m) =>
  fs.readFileSync(path.join(ROOT, 'books', b, '01-source', ch, `${m}.cnxml`), 'utf8');
const seg = (b, ch, m) =>
  fs.readFileSync(path.join(ROOT, 'books', b, '02-for-mt', ch, `${m}-segments.en.md`), 'utf8');
const mod = (b, ch, m) => ({ cnxml: src(b, ch, m), segText: seg(b, ch, m) });

/**
 * ⚠️ THE `.backup.*` EXCLUSION IS THE WALKER'S JOB, NOT THE CALLER'S — it walks
 * `01-source` and tests for the segment file, so a `02-for-mt` backup is invisible to it
 * by construction. It MOVED to `./helpers/remt-corpus.js` at Task 4, which is what this
 * comment always asked for: Tasks 4-12 inherit the walker rather than re-deriving the
 * filter. It is a helper module and not an export of this file, because importing one
 * `.test.js` from another registers its describes into the importer's run too.
 */

describe('countSegments — the shared examined unit', () => {
  it('counts raw SEG marker occurrences', () => {
    expect(countSegments('<!-- SEG:m1:para:a -->x\n<!-- SEG:m1:para:b -->y')).toBe(2);
  });

  it('counts a REPEATED seg-id twice — a deduped count would hide the dup E4 reports', () => {
    expect(countSegments('<!-- SEG:m1:para:a -->x\n<!-- SEG:m1:para:a -->y')).toBe(2);
  });

  it('returns 0 for a missing segment file rather than throwing', () => {
    expect(countSegments(undefined)).toBe(0);
    expect(countSegments('')).toBe(0);
  });

  it('does NOT count the spaced marker form — it is not what the parser accepts', () => {
    // CLAUDE.md § Inline Marker Format: `<!-- SEG: m001:… -->` parses to [] silently,
    // and prose across this repo writes it that way for readability. A counter that
    // accepted it would report segments the editor cannot see.
    expect(countSegments('<!-- SEG: m1:para:a -->x')).toBe(0);
  });
});

/**
 * 🔴 E2's ONLY NATURAL MUST-TRIP FIXTURES SELF-REPAIR AT THE RE-EXTRACT, AND THERE IS NO
 * REPLACEMENT IN EITHER KEPT BOOK. Filed independently by two review lenses and confirmed
 * by corpus census: run through the REAL `runCheck(E2, …)` over every module carrying both
 * a source CNXML and a segment file (chemistry 149, organic 17, micro 10 = 176), the
 * COMMITTED `02-for-mt` fires on exactly 2 modules / 3 findings — ch04/m68710 and
 * ch06/m68733, which are the two below — while a byte-faithful FRESH extract of the same
 * `01-source` fires on **0**. The extractor fixes both swallows.
 * ▶ SO THE TWO TESTS BELOW GO RED AT THE RE-EXTRACT, and the natural repair — swap the
 * fixture — HAS NO CANDIDATE. The repair after that is to relax the assertion, and once
 * that happens mutating E2 to `verdict: VERDICT.PASS` leaves the whole suite green: a
 * blocking money gate becomes unfalsifiable, and a swallowed marker body reaches the paid
 * MT undetected. That is the FALSE-PASS direction, the expensive one.
 * ▶ THE ANSWER IS A PLANTED CONTROL, exactly as Task 5's E3 row prescribes for a base rate
 * of 0 and as E5's over-emission control already does: corrupt one marker body in a FRESH
 * extract, where the corruption cannot be repaired by re-extracting. That test is last in
 * this block and it is the one that must never be deleted.
 */
describe('E2 — bracket-marker bodies match 01-source', () => {
  it('📌 L20 REPAIR PIN — the m68733 self-closing <emphasis/> swallow is GONE from the corpus', async () => {
    // 🔴 THE PREDICTED FLIP HAPPENED (§C82 ③ re-extract, 34f870ac). Measured 2026-09-02: the SAME
    // E2 code returns FAIL/1 {segId 'm68733:solution:fs-idm21203088', body ' 3d;'} on the 5895a25b
    // bytes and PASS/0 on today's — corpus repaired, not E2 blinded. Must-trip duty → line 127.
    const r = await runCheck(E2, mod('efnafraedi-2e', 'ch06', 'm68733'));
    expect(r.verdict).toBe(VERDICT.PASS);
  });

  it('📌 L20 REPAIR PIN — m68710 is CLEAN now, and E2 still compared its bodies', async () => {
    // 🔴 RE-BASELINED 2026-09-02, FAIL -> PASS. This asserted `findings).toHaveLength(2)`:
    // the spec's fixture note reads `m68710:716,722`, two locations for one swallow, and
    // only raw (non-deduped) marker iteration reports both. The §C82 ③ re-extract REPAIRED
    // the swallow, so E2 finds nothing here any more.
    // ▶ REPAIR, NOT BLINDNESS, AND THE DIRECTION IS THE PROOF: measured on the pre-re-extract
    // bytes `checkBracketBodies` gave examined 266 / findings 2; on today's bytes it gives
    // examined 292 / findings 0. The comparable population GREW while the findings went to
    // zero. A check that had gone blind would show `examined` FALLING.
    const r = await runCheck(E2, mod('efnafraedi-2e', 'ch04', 'm68710'));
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.findings).toHaveLength(0);
    // 🔴 THE VACUITY CONTROL, AND IT IS THE WHOLE POINT OF KEEPING THIS TEST. A PASS that
    // compared NOTHING is exactly what a broken extractor also produces — m68663 is the
    // live proof that "0 marker bodies compared" is a reachable state on this corpus.
    // Parsing the count (rather than a negative regex) makes a message-format change fail
    // loudly here instead of silently disarming the control.
    const compared = Number(r.message.match(/^(\d+) marker bodies compared/)[1]);
    expect(compared).toBeGreaterThan(0);
    // ⚠️ WHAT THIS TEST NO LONGER PINS, AND WHO DOES. The raw (non-deduped) marker-iteration
    // choice was defended by the `toHaveLength(2)` above. It has TWO other live owners, and
    // the first is STRONGER than what was retired because no re-extract can repair it:
    //   · `bracket-body-corpus.test.js` re-plants the exact pre-C58 swallow on TODAY's bytes
    //     behind a mutation-applied control, and asserts BOTH locations come back;
    //   · `bracket-body-check.test.js:96` — `expect(r.examined).toBe(2); // one marker per
    //     occurrence, not one total`.
    // Do not trim either.
  });

  it('MUST-NOT-TRIP on a clean chemistry module', async () => {
    const r = await runCheck(E2, mod('efnafraedi-2e', 'ch01', 'm68670'));
    expect(r.verdict).toBe(VERDICT.PASS);
  });

  it('🔴 L9 — examines a module with ZERO comparable marker bodies rather than SKIPPING it', async () => {
    // m68663 has 12 segments and 0 comparable marker bodies. Under the plan's unit
    // (marker bodies) this reads examined 0 -> SKIPPED -> a BLOCKING failure -> exit 1,
    // halting a paid run on a module that is clean. Measured: 11 of chemistry's 149.
    const r = await runCheck(E2, mod('efnafraedi-2e', 'ch01', 'm68663'));
    expect(r.verdict).toBe(VERDICT.PASS);
    // 📌 L20 PREMISE PIN — 12 is the COMMITTED segment count after the §C82 ③ re-extract
    // (34f870ac added SEG:m68663:alt:fs-idm52126432-alt); 34f870ac^ had 11.
    expect(r.examined).toBe(12);
    expect(r.message).toMatch(/0 marker bodies compared/);
  });

  it('reports unmatchable (nested) markers in the message rather than judging them', async () => {
    // Nesting is a known, legitimate limitation of the instrument. Failing on it would
    // halt the run on the instrument's blind spot; dropping it would hide how much of
    // the module E2 could not see.
    const r = await runCheck(E2, mod('orverufraedi', 'ch01', 'm58781'));
    expect(r.message).toMatch(/1 unmatchable \(nested\)/);
    // 🔴 THE VERDICT IS THE HALF THIS TEST IS NAMED FOR. `message` is built from
    // `skippedUnmatchable` and the verdict from `findings.length` — they are
    // INDEPENDENT, so without this line the fixture could start FAILing on its
    // nested marker (exactly the ruling being pinned) and the test stays green.
    // It reads the same fixture the assertion above reads, so it adds no drift surface.
    expect(r.verdict).toBe(VERDICT.PASS);
  });

  it('🔴 SHOULD-TRIP on a PLANTED body corruption in a FRESH extract — the flip-proof control', async () => {
    // 🔴 THE ONE E2 MUST-TRIP THAT SURVIVES THE RE-EXTRACT. Both natural fixtures above go
    // green when the corpus is re-extracted (see this block's header); this one cannot,
    // because the corruption is introduced AFTER extraction and no re-extract can repair it.
    // Without it, E2 has no must-trip at all post-flip and `verdict: PASS` is unfalsifiable.
    const cnxml = src('efnafraedi-2e', 'ch04', 'm68710');
    const fresh = formatSegmentsMarkdown(extractSegments(cnxml).segments);

    // CONTROL: the fresh extract really is clean, so the FAIL below is the plant and not
    // a leftover natural defect. This is also the corpus-flip assertion in miniature.
    expect((await runCheck(E2, { cnxml, segText: fresh })).verdict).toBe(VERDICT.PASS);

    const marker = fresh.match(/\[\[i:([^\]]{3,40})\]\]/);
    expect(marker).not.toBeNull(); // control: the fixture carries comparable marker bodies
    const planted = fresh.replace(marker[0], '[[i:ZZQXCORRUPTBODY]]');
    expect(planted).not.toBe(fresh); // control: the substitution actually happened

    const r = await runCheck(E2, { cnxml, segText: planted });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings).toHaveLength(1);
    expect(r.examined).toBeGreaterThan(0); // vacuity control
  });

  it('SKIPPED, naming the key, when the loader supplied no segText', async () => {
    const r = await runCheck(E2, { cnxml: src('efnafraedi-2e', 'ch01', 'm68663') });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.examined).toBe(0);
    expect(r.message).toMatch(/missing segText/);
  });

  it('a SKIPPED E2 is still a blocking failure — no evidence is not a pass', async () => {
    const r = await runCheck(E2, {});
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.blocking).toBe(true);
  });
});

describe('E4 — list coverage and REAL duplicate seg-ids', () => {
  it('📌 L20 PREMISE PIN — SHOULD-TRIP on orverufraedi ch01/m58781, 4 dropped lists', async () => {
    // 🔴 MEASURED TO FLIP: a fresh extract of this same `01-source` gives PASS / 0 findings
    // (committed FAIL/4 -> fresh PASS/0), because the extractor no longer drops the lists.
    // So E4's ONLY natural must-trip self-repairs exactly as E2's two do — the same defect
    // class, found while closing the review rather than by it. The flip-proof replacement is
    // the PLANTED pair at the end of this block; do not delete those when this goes green.
    // ⚠️ Withdrawn-book BYTES as a fixture are fine; pointing a RUN at that book is not.
    // ⚠️ The plan names this fixture as `ch24/m58781`. It is ch01 — ch24 has no such
    // module and the read would have thrown ENOENT. → active register §C82 L18.
    const r = await runCheck(E4, mod('orverufraedi', 'ch01', 'm58781'));
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings).toHaveLength(4);
    expect(r.examined).toBeGreaterThan(0);
  });

  it('📌 L20 PREMISE PIN — the trip is through DROPPED LIST ITEMS, not some other finding', async () => {
    // Pins WHY it fails. A wrapper that spread `rawDup` whole would also make this
    // module FAIL — for the wrong reason, and the SHOULD-TRIP alone could not tell.
    const r = await runCheck(E4, mod('orverufraedi', 'ch01', 'm58781'));
    expect(r.findings.every((f) => f.missing && f.items === 4)).toBe(true);
    expect(r.message).toMatch(/^4 list, 0 source-dup, 0 raw-dup/);
  });

  it('🔴 MUST-NOT-TRIP on a module carrying BENIGN raw duplicates', async () => {
    // m68733 has 5 rawDup entries, every one `kind: 'benign'`. Spreading `rawDup` whole
    // — the obvious reading of the plan's `[...dupFindings]` — FAILs this module and
    // m68710 (3 benign) on a paid run. This test is what separates the two.
    const r = await runCheck(E4, mod('efnafraedi-2e', 'ch06', 'm68733'));
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.message).toMatch(/\(5 benign raw dups not counted\)/);
  });

  it('🔴 L17 — examines a module with ZERO <list> elements rather than SKIPPING it', async () => {
    // The sharpest instance: `analyzeModule` is TWO checks, and the plan keys `examined`
    // to one half's unit. 104 of chemistry's 149 modules (69.8%) and 288 of organic's 342 (84.2%)
    // have no <list> at all — so as planned, E4 halts ~70% of a paid run while the dup
    // half has traversed the whole module and found it clean.
    const r = await runCheck(E4, mod('efnafraedi-2e', 'ch01', 'm68663'));
    expect(r.verdict).toBe(VERDICT.PASS);
    // 📌 L20 PREMISE PIN — 12 is the COMMITTED segment count after the §C82 ③ re-extract
    // (34f870ac added one figure-alt segment; 34f870ac^ had 11). The DURABLE half of this
    // test is `examined > 0` with 0 lists.
    expect(r.examined).toBe(12);
    expect(r.message).toMatch(/^0 list, /);
  });

  /**
   * 🔴 THE FLIP-PROOF PAIR. Both of E4's natural must-trips die at the re-extract — the
   * dropped-list fixture repairs itself (FAIL/4 -> PASS/0, measured), and no real duplicate
   * seg-id exists anywhere in the corpus (0 across all 176 module pairs), so the dup half
   * has NEVER been exercised by a corpus fixture at all. An earlier review round measured
   * that the dup detection could be DELETED ENTIRELY with 91 of 91 tests green.
   * ▶ These two plant each half into a FRESH extract, where no re-extract can repair them.
   */
  it('🔴 SHOULD-TRIP on a PLANTED dropped list item — the list half, flip-proof', async () => {
    const cnxml = src('orverufraedi', 'ch01', 'm58781');
    const fresh = formatSegmentsMarkdown(extractSegments(cnxml).segments);
    // CONTROL: the fresh extract is clean, so the FAIL below is the plant, not a leftover.
    expect((await runCheck(E4, { cnxml, segText: fresh })).verdict).toBe(VERDICT.PASS);

    const parts = fresh.split(/(?=<!--\s*SEG:)/);
    const victim = parts.findIndex((p) => /<!--\s*SEG:[^\s]*:item:[^\s]*\s*-->/.test(p));
    expect(victim).toBeGreaterThan(-1); // control: the fixture really has list-item segments
    const r = await runCheck(E4, {
      cnxml,
      segText: parts.filter((_, i) => i !== victim).join(''),
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.message).toMatch(/^1 list, /);
  });

  it('🔴 SHOULD-TRIP on a PLANTED real duplicate seg-id — the half no corpus module reaches', async () => {
    const cnxml = src('orverufraedi', 'ch01', 'm58781');
    const fresh = formatSegmentsMarkdown(extractSegments(cnxml).segments);
    const first = fresh.match(/<!--\s*SEG:([^\s]+?)\s*-->/);
    expect(first).not.toBeNull(); // control
    // Same id, DIFFERENT visible text — that difference is what makes it `kind: 'real'`
    // rather than one of the benign duplicates the filter deliberately drops.
    const r = await runCheck(E4, {
      cnxml,
      segText: `${fresh}\n\n<!-- SEG:${first[1]} -->\nZZQXDIFFERENTVISIBLETEXT\n`,
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.message).toMatch(/1 raw-dup findings/);
  });

  it("agrees with analyzeModule's own hasFindings across the chemistry corpus", async () => {
    // The battery must not give a different answer than `verify-extraction-coverage.js`,
    // which exits on `hasFindings`. Divergence here means two gates disagree about one
    // module — and the run would be told different things by each.
    const { analyzeModule } = await import('../lib/extraction-coverage.js');
    const mods = modulesWithSegments('efnafraedi-2e');
    expect(mods.length).toBe(149); // control: an empty walk cannot pass
    let compared = 0;
    for (const { ch, m } of mods) {
      const ctx = mod('efnafraedi-2e', ch, m);
      const r = await runCheck(E4, ctx);
      const { hasFindings } = analyzeModule(ctx.cnxml, ctx.segText);
      expect(r.verdict).toBe(hasFindings ? VERDICT.FAIL : VERDICT.PASS);
      compared++;
    }
    expect(compared).toBe(149);
  });
});

describe('the examined-unit census that drove the decision', () => {
  /**
   * ⚠️ TWO PINS WITH DIFFERENT LIFETIMES, AND THE DIFFERENCE IS THE POINT.
   * The <list> count is derived from `01-source`, which cannot drift by project rule —
   * 104 is stable. The marker-body count is derived from `02-for-mt`, which the loop's
   * own re-extract rewrites — 11 is a PREMISE PIN EXPECTED TO MOVE. When it moves, that
   * is the corpus changing, not a defect: update it in the same commit that observes it.
   */
  it('104 of 149 chemistry modules have NO <list> — the E4 false-halt population', async () => {
    const { parseModuleDoc } = await import('../lib/extraction-coverage.js');
    const mods = modulesWithSegments('efnafraedi-2e');
    expect(mods.length).toBe(149);
    const zero = mods.filter(({ ch, m }) => {
      const { content } = parseModuleDoc(src('efnafraedi-2e', ch, m));
      return !content || content.getElementsByTagName('list').length === 0;
    });
    expect(zero.length).toBe(104);
    // Every one of them still examines something under the shipped unit.
    for (const { ch, m } of zero) {
      const r = await runCheck(E4, mod('efnafraedi-2e', ch, m));
      expect(r.examined).toBeGreaterThan(0);
    }
  });

  it('11 of 149 have NO comparable marker body — the E2 population, and L9 said 10', async () => {
    // 🔴 L9 counted modules with zero bracket markers of ANY kind and got 10. E2's unit
    // is `checkBracketBodies`'s own `examined`, which counts only BODY_SOURCE_ELEMENTS
    // types — m68748 (1 xref) and m68864 (3 fn) carry markers and nothing comparable.
    // ⚠️ m68670 LEFT this set at the §C82 ③ re-extract: its markers migrated dialect and it
    // now carries term x6, xref x5, u x6 and examines 12. The population is 12 -> 11 while
    // m68663's OWN segment count went 11 -> 12 — two numbers moving opposite ways, which is
    // why they are pinned separately rather than shared.
    // Same shape, different population; 11/149 = 7.4%, still over the 5% blocking bar.
    const { checkBracketBodies } = await import('../lib/bracket-body-check.js');
    const mods = modulesWithSegments('efnafraedi-2e');
    expect(mods.length).toBe(149);
    const zero = mods.filter(
      ({ ch, m }) =>
        checkBracketBodies(src('efnafraedi-2e', ch, m), seg('efnafraedi-2e', ch, m)).examined === 0
    );
    expect(zero.length).toBe(11);
    // 🔴 THE DISCRIMINATOR, AND IT MUST NAME A MODULE THAT CARRIES MARKERS. Without it this
    // set is indistinguishable from L9's ("zero markers of ANY kind", 10 modules). Measured
    // 2026-09-02, EXACTLY TWO of the 11 carry markers with no comparable body — m68864
    // {fn:3} and m68748 {xref:1} — so both are pinned rather than one. The old pin named
    // m68670 (5 xref); it LEFT this set at the §C82 ③ re-extract when its markers migrated
    // dialect, and it now examines 12.
    const zeroIds = zero.map((z) => z.m);
    expect(zeroIds).toContain('m68748'); // 1 xref marker, 0 comparable bodies
    expect(zeroIds).toContain('m68864'); // 3 fn markers, 0 comparable bodies
    for (const { ch, m } of zero) {
      const r = await runCheck(E2, mod('efnafraedi-2e', ch, m));
      expect(r.examined).toBeGreaterThan(0);
    }
  });

  it('and NO chemistry module has zero SEG markers — the unit that was chosen', async () => {
    const mods = modulesWithSegments('efnafraedi-2e');
    expect(mods.length).toBe(149);
    const zero = mods.filter(({ ch, m }) => countSegments(seg('efnafraedi-2e', ch, m)) === 0);
    expect(zero).toEqual([]);
  });
});

describe('E7 — re-extract equivalence, advisory', () => {
  const snapshot = (segText, equations = {}, inlineAttrs = '') => {
    const ids = new Set();
    const map = new Map();
    for (const part of segText.split(/(?=<!--\s*SEG:)/)) {
      const m = part.match(/<!--\s*SEG:([^\s]+?)\s*-->/);
      if (!m) continue;
      ids.add(m[1]);
      map.set(
        m[1],
        part
          .replace(/<!--\s*SEG:[^>]*-->/, '')
          .replace(/\s+/g, ' ')
          .trim()
      );
    }
    return {
      segIds: ids,
      segText: map,
      equations: new Map(Object.entries(equations)),
      inlineAttrs,
    };
  };

  it('SKIPPED — and says so — when no fresh extraction exists yet', async () => {
    const r = await runCheck(E7, mod('efnafraedi-2e', 'ch01', 'm68663'));
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.examined).toBe(0);
    expect(r.message).toMatch(/none exists until the re-extract/);
  });

  it('a SKIPPED E7 does NOT block — it is advisory by ruling, not by accident', async () => {
    const r = await runCheck(E7, {});
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.blocking).toBe(false);
  });

  it('PASSes when the fresh extraction is equivalent', async () => {
    const s = seg('efnafraedi-2e', 'ch01', 'm68663');
    const r = await runCheck(E7, { committedExtract: snapshot(s), freshExtract: snapshot(s) });
    expect(r.verdict).toBe(VERDICT.PASS);
    // 12 = m68663's 12 committed seg-ids + 0 equation keys (§C82 ③; 34f870ac^ had 11).
    expect(r.examined).toBe(12);
  });

  it('WARNs — never FAILs — when a seg-id disappears', async () => {
    const s = snapshot(seg('efnafraedi-2e', 'ch01', 'm68663'));
    const dropped = { ...s, segIds: new Set([...s.segIds].slice(1)) };
    const r = await runCheck(E7, { committedExtract: s, freshExtract: dropped });
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.findings).toContain('segment-id-set changed');
  });

  it('🔴 examined counts BOTH seg-ids and equation keys — a dropped addend must show', async () => {
    // The two addends are deliberately DIFFERENT non-zero numbers (2 seg-ids, 3
    // equation keys). A pin on a sum whose addends the fixture cannot separate is
    // no pin at all: with 1 and 1, deleting the equations half still yields a
    // plausible number. Measured: real = 5, equations-half deleted = 2.
    const segs = '<!-- SEG:m1:para:a -->one\n\n<!-- SEG:m1:para:b -->two';
    const eq = { 'math-1': 'x', 'math-2': 'y', 'math-3': 'z' };
    const r = await runCheck(E7, {
      committedExtract: snapshot(segs, eq),
      freshExtract: snapshot(segs, eq),
    });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(5);
  });

  it('WARNs on an equation key added — the m68852 renumbering mechanism', async () => {
    const s = snapshot('<!-- SEG:m1:para:a -->text', { 'math-1': 'x' });
    const b = snapshot('<!-- SEG:m1:para:a -->text', { 'math-1': 'x', 'math-2': 'y' });
    const r = await runCheck(E7, { committedExtract: s, freshExtract: b });
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.findings).toContain('equation key added: math-2');
  });

  it('MUST-NOT-TRIP on marker SYNTAX modernization — that is what normalizeVisibleText is for', async () => {
    // An under-built normalizer false-positives on ~20 benign chemistry modules and
    // halts the run. This is the control that the built one is being used.
    const a = snapshot('<!-- SEG:m1:para:a -->{{i}}water{{/i}} is a liquid');
    const b = snapshot('<!-- SEG:m1:para:a -->[[i:water]] is a liquid');
    const r = await runCheck(E7, { committedExtract: a, freshExtract: b });
    expect(r.verdict).toBe(VERDICT.PASS);
  });

  it('rejects a malformed snapshot as SKIPPED rather than reporting it as a content defect', async () => {
    const s = snapshot('<!-- SEG:m1:para:a -->x');
    const r = await runCheck(E7, { committedExtract: s, freshExtract: { segIds: new Set() } });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
  });
});

/**
 * 🔴 THESE THREE TESTS EXIST BECAUSE THE CORPUS CANNOT PROVIDE THE FIXTURE, AND A
 * MUTATION REVIEW PROVED THE ABSENCE MATTERED. Across every module with a segment file
 * — chemistry 149, organic 17, micro 10 — there are ZERO `sourceDup` and ZERO
 * `kind: 'real'` rawDup findings. So the corpus parity test below ran
 * `expect(PASS).toBe(PASS)` 149 times and its FAIL branch never executed anywhere in the
 * suite: deleting E4's ENTIRE duplicate-seg-id detection from a blocking money-gate left
 * 91 of 91 tests green.
 * ⚠️ ONE FIXTURE WITH BOTH LEGS WOULD NOT HAVE CLOSED IT. E4's verdict is
 * `findings.length ? FAIL : PASS`, so dropping only ONE leg leaves length 1 and still
 * FAILs — a verdict assertion would kill the both-legs mutation and survive each single-leg
 * one, i.e. the same hole, one leg narrower. **Each leg gets its own fixture.**
 * ⚠️ A duplicate seg-id is "a latent inject drop", the class most likely to APPEAR in a
 * NEW `02-for-mt` tree — which is exactly what the §C82 re-extract produces. The leg with
 * no corpus fixture today is the one most likely to matter tomorrow.
 */
describe('E4 — the duplicate-seg-id legs, which no corpus module exercises', () => {
  const doc = (body) =>
    `<document xmlns="http://cnx.rice.edu/cnxml"><metadata xmlns:md="http://cnx.rice.edu/mdml">` +
    `<md:content-id>m1</md:content-id></metadata><content>${body}</content></document>`;

  it('SHOULD-TRIP on a SOURCE duplicate id — one element id defining two elements', async () => {
    const r = await runCheck(E4, {
      cnxml: doc('<para id="p1">one</para><para id="p1">two</para>'),
      segText: '<!-- SEG:m1:para:p1 -->one\n',
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings).toHaveLength(1);
    expect(r.message).toMatch(/1 source-dup/);
  });

  it('SHOULD-TRIP on a REAL raw duplicate — one marker repeated with differing text', async () => {
    const r = await runCheck(E4, {
      cnxml: doc('<para id="p1">one</para><para id="p2">two</para>'),
      segText: '<!-- SEG:m1:para:p1 -->one\n\n<!-- SEG:m1:para:p1 -->two different\n',
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings).toHaveLength(1);
    expect(r.message).toMatch(/1 raw-dup/);
  });

  it('MUST-NOT-TRIP on the same shape without a duplicate — the fixtures discriminate', async () => {
    // Without this, both tests above are satisfied by a check that fails everything.
    const r = await runCheck(E4, {
      cnxml: doc('<para id="p1">one</para><para id="p2">two</para>'),
      segText: '<!-- SEG:m1:para:p1 -->one\n\n<!-- SEG:m1:para:p2 -->two\n',
    });
    expect(r.verdict).toBe(VERDICT.PASS);
  });
});

/**
 * 🔴 `examined` IS KEYED TO `segText`, SO IT CANNOT SEE A SOURCE-SIDE VOID. Three
 * independent review lenses found this. Both instruments read the SOURCE side, and
 * `analyzeModule`'s source halves go inert on a null `<content>` — so a wrong-but-
 * well-formed cnxml took E4's own 4-dropped-list fixture from `FAIL examined 80
 * findings 4` to `PASS examined 80 findings 0`, with `runCheck`'s `PASS + examined 0`
 * backstop structurally unable to fire.
 * ⚠️ THE ROW THAT JUSTIFIES TWO LEGS RATHER THAN A NULL-CHECK is `three-element decoy`:
 * it HAS a `<content>`, so `content == null` waves it through. Identity catches it.
 * And `<content> renamed` has a matching content-id, so identity waves THAT through.
 * Neither leg is redundant.
 */
describe('the ctx guard — a gate must refuse the wrong module, not judge it', () => {
  const REAL = () => mod('orverufraedi', 'ch01', 'm58781'); // FAILs with 4 findings
  const CHEM = () => mod('efnafraedi-2e', 'ch01', 'm68663');

  const CASES = [
    [
      '<content> renamed away',
      (c) => c.replace(/<content([ >])/, '<contentX$1').replace('</content>', '</contentX>'),
    ],
    ['an empty <content/>', (c) => c.replace(/<content[\s\S]*<\/content>/, '<content/>')],
    [
      'a wholly unrelated XML document',
      () => '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    ],
    ["ANOTHER module's cnxml", () => CHEM().cnxml],
    [
      'a three-element decoy that HAS a <content>',
      () =>
        '<document xmlns="http://cnx.rice.edu/cnxml"><title>t</title><content><para id="z">x</para></content></document>',
    ],
  ];

  it('📌 L20 PREMISE PIN — POSITIVE CONTROL: the real pair still FAILs with its 4 findings', async () => {
    // Without this, a guard that skipped everything would satisfy every case below.
    // 🔴 IT IS A POSITIVE CONTROL **AND** A PREMISE PIN, WHICH IS THE DANGEROUS COMBINATION
    // THE REVIEW NAMED: the fixture PASSes on a fresh extract, so at the flip the natural
    // 'repair' is to weaken the very assertion that proves the guard does not refuse
    // everything. ▶ WHEN IT FLIPS, RE-POINT IT AT A PLANTED INPUT (the pair at the end of
    // the E4 block), never relax it to `not.toBe(SKIPPED)`.
    const r = await runCheck(E4, REAL());
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings).toHaveLength(4);
  });

  for (const [name, mutate] of CASES) {
    it(`SKIPS both blocking gates on ${name}`, async () => {
      const { cnxml, segText } = REAL();
      const ctx = { cnxml: mutate(cnxml), segText };
      for (const c of [E2, E4]) {
        const r = await runCheck(c, ctx);
        expect(r.verdict).toBe(VERDICT.SKIPPED);
        expect(r.examined).toBe(0);
      }
    });
  }

  it('LEG ORDER: a chapter-metadata unit reaches the missing-key branch, not the identity one', async () => {
    // 🔴 ORDERING IS THE ASSERTION HERE, NOT THE VERDICT. `chapter-metadata` units have
    // NO `01-source` counterpart at all (21 in chemistry, 2 in organic → §C82 L19), and
    // their markers read `SEG:chapter:…` — so the module id they report is the literal
    // string `chapter`, which leg 2 would happily call a mismatch. Leg 1 must get there
    // first, or the message blames a disagreement between two files when one of them
    // simply does not exist. Was a hand check until this test.
    const metaSeg = fs.readFileSync(
      path.join(
        ROOT,
        'books',
        'efnafraedi-2e',
        '02-for-mt',
        'ch01',
        'chapter-metadata-segments.en.md'
      ),
      'utf8'
    );
    expect(metaSeg).toMatch(/<!--\s*SEG:chapter:/); // control: the fixture is what we think
    for (const c of [E2, E4]) {
      const r = await runCheck(c, { segText: metaSeg });
      expect(r.verdict).toBe(VERDICT.SKIPPED);
      expect(r.message).toMatch(/missing cnxml/);
      expect(r.message).not.toMatch(/disagree about the module/);
    }
  });

  it('and the guard NEVER fires on a real module — 501 pairs, three books', async () => {
    // The false-halt control. A guard measured only against defects is indistinguishable
    // from one that refuses everything, and this file's own L17 is what that costs.
    let checked = 0;
    for (const [book, expected] of [
      ['efnafraedi-2e', 149],
      ['lifraen-efnafraedi', 342],
      ['orverufraedi', 10],
    ]) {
      const mods = modulesWithSegments(book);
      expect(mods.length).toBe(expected);
      for (const { ch, m } of mods) {
        for (const c of [E2, E4]) {
          expect((await runCheck(c, mod(book, ch, m))).verdict).not.toBe(VERDICT.SKIPPED);
          checked++;
        }
      }
    }
    expect(checked).toBe(1002); // 501 pairs x 2 gates (149 + 342 + 10; organic 17 -> 342 at §C82 ③)
  });
});

describe('the contract holds for every extract check', () => {
  it('each stamps a version and an examined count', async () => {
    for (const c of [E2, E4]) {
      const r = await runCheck(c, mod('efnafraedi-2e', 'ch01', 'm68663'));
      expect(typeof r.version).toBe('number');
      expect(r.examined).toBeGreaterThan(0);
    }
  });

  it("every extract check registers at tier 1, and the blocking split is the spec's", () => {
    // E5 joined at Task 4, in id order. The blocking split is the spec's ruling and not a
    // default: E7 is advisory BECAUSE §C81 intends to change extraction this cycle, so a
    // halt on "extraction changed" would fire on the very thing the loop exists to do.
    // Tier 1 completed at Tasks 5-6: E1/E3/E6 then E9, all in id order. There is no E8 —
    // the fingerprint is Plan C, not Plan B.
    expect(EXTRACT_CHECKS.map((c) => c.id)).toEqual([
      'E1',
      'E2',
      'E3',
      'E4',
      'E5',
      'E6',
      'E7',
      'E9',
    ]);
    for (const c of EXTRACT_CHECKS) expect(c.tier).toBe(1);
    // Keyed rather than positional: a bare [true,true,…,false] array made the ONE advisory
    // check identifiable only by counting, and the list has now grown twice.
    expect(Object.fromEntries(EXTRACT_CHECKS.map((c) => [c.id, c.blocking]))).toEqual({
      E1: true,
      E2: true,
      E3: true,
      E4: true,
      E5: true,
      E6: true,
      E7: false, // the only advisory gate in Tier 1 — see the comment above
      E9: true,
    });
  });

  it('importing this module is what puts them in the REGISTRY', () => {
    // L3: nothing else calls registerChecks(). If this ever reads empty, the CLI runs
    // an empty registry and exits 0 for every tier.
    for (const c of EXTRACT_CHECKS) expect(REGISTRY.get(c.id)).toBe(c);
  });
});
