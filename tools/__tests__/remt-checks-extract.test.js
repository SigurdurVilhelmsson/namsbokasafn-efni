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

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const src = (b, ch, m) =>
  fs.readFileSync(path.join(ROOT, 'books', b, '01-source', ch, `${m}.cnxml`), 'utf8');
const seg = (b, ch, m) =>
  fs.readFileSync(path.join(ROOT, 'books', b, '02-for-mt', ch, `${m}-segments.en.md`), 'utf8');
const mod = (b, ch, m) => ({ cnxml: src(b, ch, m), segText: seg(b, ch, m) });

/**
 * ⚠️ THE `.backup.*` EXCLUSION IS THE HELPER'S JOB, NOT THE CALLER'S. `02-for-mt` holds
 * dated backups beside every live segment file (ch01 alone has three for m68663), and a
 * naive `endsWith('.md')` walk would count each stale vintage as a module. Tasks 4-12
 * inherit this walker rather than re-deriving the filter.
 */
function modulesWithSegments(book) {
  const srcRoot = path.join(ROOT, 'books', book, '01-source');
  const segRoot = path.join(ROOT, 'books', book, '02-for-mt');
  const out = [];
  for (const ch of fs
    .readdirSync(srcRoot)
    .filter((d) => fs.statSync(path.join(srcRoot, d)).isDirectory())
    .sort()) {
    for (const f of fs
      .readdirSync(path.join(srcRoot, ch))
      .filter((f) => f.endsWith('.cnxml'))
      .sort()) {
      const m = f.replace(/\.cnxml$/, '');
      const sp = path.join(segRoot, ch, `${m}-segments.en.md`);
      if (fs.existsSync(sp)) out.push({ ch, m });
    }
  }
  return out;
}

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

describe('E2 — bracket-marker bodies match 01-source', () => {
  it('SHOULD-TRIP on m68733 (a self-closing <emphasis/> swallow)', async () => {
    const r = await runCheck(E2, mod('efnafraedi-2e', 'ch06', 'm68733'));
    expect(r.verdict).toBe(VERDICT.FAIL);
  });

  it('SHOULD-TRIP on m68710, and reports BOTH locations', async () => {
    // The spec's fixture note reads `m68710:716,722` — two locations for one swallow.
    // Only raw (non-deduped) marker iteration reports both; asserting the count is what
    // keeps `checkBracketBodies`'s raw-iteration choice from being "simplified" away.
    const r = await runCheck(E2, mod('efnafraedi-2e', 'ch04', 'm68710'));
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings).toHaveLength(2);
  });

  it('MUST-NOT-TRIP on a clean chemistry module', async () => {
    const r = await runCheck(E2, mod('efnafraedi-2e', 'ch01', 'm68670'));
    expect(r.verdict).toBe(VERDICT.PASS);
  });

  it('🔴 L9 — examines a module with ZERO comparable marker bodies rather than SKIPPING it', async () => {
    // m68663 has 11 segments and 0 comparable marker bodies. Under the plan's unit
    // (marker bodies) this reads examined 0 -> SKIPPED -> a BLOCKING failure -> exit 1,
    // halting a paid run on a module that is clean. Measured: 12 of chemistry's 149.
    const r = await runCheck(E2, mod('efnafraedi-2e', 'ch01', 'm68663'));
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(11);
    expect(r.message).toMatch(/0 marker bodies compared/);
  });

  it('reports unmatchable (nested) markers in the message rather than judging them', async () => {
    // Nesting is a known, legitimate limitation of the instrument. Failing on it would
    // halt the run on the instrument's blind spot; dropping it would hide how much of
    // the module E2 could not see.
    const r = await runCheck(E2, mod('orverufraedi', 'ch01', 'm58781'));
    expect(r.message).toMatch(/1 unmatchable \(nested\)/);
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
  it('SHOULD-TRIP on orverufraedi ch01/m58781 — 4 dropped multiple-choice lists', async () => {
    // ⚠️ Withdrawn-book BYTES as a fixture are fine; pointing a RUN at that book is not.
    // ⚠️ The plan names this fixture as `ch24/m58781`. It is ch01 — ch24 has no such
    // module and the read would have thrown ENOENT. → active register §C82 L18.
    const r = await runCheck(E4, mod('orverufraedi', 'ch01', 'm58781'));
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings).toHaveLength(4);
    expect(r.examined).toBeGreaterThan(0);
  });

  it('the trip is through DROPPED LIST ITEMS, not through some other finding', async () => {
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
    // to one half's unit. 104 of chemistry's 149 modules (69.8%) and 14 of organic's 17
    // have no <list> at all — so as planned, E4 halts ~70% of a paid run while the dup
    // half has traversed the whole module and found it clean.
    const r = await runCheck(E4, mod('efnafraedi-2e', 'ch01', 'm68663'));
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(11);
    expect(r.message).toMatch(/^0 list, /);
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
   * own re-extract rewrites — 12 is a PREMISE PIN EXPECTED TO MOVE. When it moves, that
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

  it('12 of 149 have NO comparable marker body — the E2 population, and L9 said 10', async () => {
    // 🔴 L9 counted modules with zero bracket markers of ANY kind and got 10. E2's unit
    // is `checkBracketBodies`'s own `examined`, which counts only BODY_SOURCE_ELEMENTS
    // types — m68670 (5 xref) and m68748 (1 xref) carry markers and nothing comparable.
    // Same shape, different population; 12/149 = 8.1%, still over the 5% blocking bar.
    const { checkBracketBodies } = await import('../lib/bracket-body-check.js');
    const mods = modulesWithSegments('efnafraedi-2e');
    expect(mods.length).toBe(149);
    const zero = mods.filter(
      ({ ch, m }) =>
        checkBracketBodies(src('efnafraedi-2e', ch, m), seg('efnafraedi-2e', ch, m)).examined === 0
    );
    expect(zero.length).toBe(12);
    expect(zero.map((z) => z.m)).toContain('m68670'); // has 5 xref markers, 0 comparable
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
    expect(r.examined).toBe(11);
  });

  it('WARNs — never FAILs — when a seg-id disappears', async () => {
    const s = snapshot(seg('efnafraedi-2e', 'ch01', 'm68663'));
    const dropped = { ...s, segIds: new Set([...s.segIds].slice(1)) };
    const r = await runCheck(E7, { committedExtract: s, freshExtract: dropped });
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.findings).toContain('segment-id-set changed');
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

describe('the contract holds for every extract check', () => {
  it('each stamps a version and an examined count', async () => {
    for (const c of [E2, E4]) {
      const r = await runCheck(c, mod('efnafraedi-2e', 'ch01', 'm68663'));
      expect(typeof r.version).toBe('number');
      expect(r.examined).toBeGreaterThan(0);
    }
  });

  it("all three register themselves at tier 1, and the blocking split is the spec's", () => {
    expect(EXTRACT_CHECKS.map((c) => c.id)).toEqual(['E2', 'E4', 'E7']);
    for (const c of EXTRACT_CHECKS) expect(c.tier).toBe(1);
    expect(EXTRACT_CHECKS.map((c) => c.blocking)).toEqual([true, true, false]);
  });

  it('importing this module is what puts them in the REGISTRY', () => {
    // L3: nothing else calls registerChecks(). If this ever reads empty, the CLI runs
    // an empty registry and exits 0 for every tier.
    for (const c of EXTRACT_CHECKS) expect(REGISTRY.get(c.id)).toBe(c);
  });
});
