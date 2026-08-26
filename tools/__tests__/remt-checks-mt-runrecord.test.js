/**
 * Tier 2, the run-record half — A2a, A4, A8.
 *
 * ── WHY EVERY POSITIVE FIXTURE IN THIS FILE COMES OUT OF `buildRunRecord()` ────────
 * 🔴 NO MODULE ON `main` CARRIES A RUN RECORD. Measured 2026-08-26 over both kept
 * books: 200 provenance sidecars, 200 carrying `"tool"` (the positive control), **0**
 * with `schemaVersion: 2` and **0** with a `run` key. Every existing pair predates
 * Plan A's writer.
 *
 * ▶ SO THE CORPUS CANNOT FALSIFY THESE THREE CHECKS. There is no real v2 sidecar to
 * read, which means check and fixture can agree with each other, both disagree with
 * the producer, and nothing goes red until the first real record lands MID-PAID-RUN.
 * That is not hypothetical: **the plan specifies A4 as reading `run.unwrapped[]`, and
 * `buildRunRecord()` has never written that key** — it writes `unwrappedCount` and
 * `unwrappedByType`. A literal transcription of the plan, tested against a literal
 * transcription of the plan's fixture, is green and reads nothing.
 *
 * ▶ THE STRUCTURAL ANSWER, AND IT IS THE POINT OF THIS FILE: every fixture that is
 * meant to be READ is built by CALLING `buildRunRecord()`. A producer-side rename then
 * surfaces here as `examined: 0` — a red test — instead of as a silent clean pass on a
 * paid run. This is `run-record.js`'s own lesson about the `usage: {}` vs number bug,
 * applied one layer up: stub the shape the real collaborator RETURNS, not the shape
 * the consumer happens to want.
 *
 * ⚠️ NEGATIVE fixtures are necessarily object literals — a malformed record is by
 * definition one the producer would not emit. They are labelled DELIBERATELY MALFORMED
 * so a later reader does not "repair" them into agreement with the producer.
 *
 * ── THE THREE KINDS OF "NOTHING", WHICH MUST NOT BE CONFLATED (L33/L35, L1) ────────
 *   1. no `ctx.provenance`, or a non-object one   → SKIPPED, ctx key named
 *   2. a v1 sidecar / no `run`                    → SKIPPED, `examined: 0`  ← the deliverable
 *   3. a `run` whose FIELD is absent or mistyped  → SKIPPED, field named    ← the drift path
 * None of the three is a PASS. Case 3 is where `|| []` would have hidden the
 * `unwrapped[]` bug forever.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCheck, VERDICT, REGISTRY } from '../lib/remt-battery.js';
import { buildRunRecord } from '../lib/run-record.js';
import { A2a, A4, A8, MT_RUNRECORD_CHECKS } from '../lib/remt-checks-mt.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A record the REAL producer would emit for a clean module. */
function cleanRecord(over = {}) {
  return buildRunRecord({
    chars: 12345,
    usage: 12345,
    estimatedIsk: 246.9,
    markersNormalized: 0,
    mismatches: [],
    bracketDelta: {},
    unwrapped: [],
    glossaryArm: 'glossary',
    glossaryHash: null,
    glossaryTermCount: 0,
    chunksWithGlossary: 1,
    chunksTotal: 1,
    ...over,
  });
}

const v2 = (run) => ({ provenance: { schemaVersion: 2, tool: 'api-translate', run } });

describe('the premise: the committed corpus is v1 today', () => {
  // ⚠️ A PREMISE PIN, NOT A REGRESSION PIN. It is EXPECTED to go red the moment the
  // clean-break run writes its first sidecar. When it does, that is the corpus moving
  // — update the numbers in the commit that observes it, do not delete the test.
  it('200 sidecars across the two kept books, 200 with a tool, 0 with a run record', () => {
    const found = [];
    const walk = (p) => {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const f = path.join(p, e.name);
        if (e.isDirectory()) walk(f);
        else if (e.name.endsWith('-provenance.json')) found.push(f);
      }
    };
    const byBook = {};
    for (const b of ['efnafraedi-2e', 'lifraen-efnafraedi']) {
      const before = found.length;
      walk(path.join(ROOT, 'books', b, '02-mt-output'));
      byBook[b] = found.length - before;
    }
    // The SPLIT, not just the total: a glob that swept in a third book would otherwise
    // still satisfy a bare `toBe(200)` by coincidence.
    expect(byBook).toEqual({ 'efnafraedi-2e': 150, 'lifraen-efnafraedi': 50 });
    expect(found).toHaveLength(200);

    const parsed = found.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
    // The positive control. Without it, "0 with a run record" is what a broken walk
    // returns — an absence you manufactured is not an answer.
    expect(parsed.filter((p) => p.tool !== undefined)).toHaveLength(200);
    expect(parsed.filter((p) => p.schemaVersion === 2)).toHaveLength(0);
    expect(parsed.filter((p) => p.run !== undefined)).toHaveLength(0);
  });
});

describe('case 1 — ctx.provenance absent or not a plain object', () => {
  // L33/L35: `typeof x === 'object'` admits null AND arrays. Both are payloads that
  // pass a container test and carry nothing.
  for (const [label, provenance] of [
    ['absent', undefined],
    ['null', null],
    ['an array', []],
    ['a string', '{"schemaVersion":2}'],
    ['a number', 2],
  ]) {
    it(`every run-record check SKIPs when ctx.provenance is ${label}`, async () => {
      for (const c of MT_RUNRECORD_CHECKS) {
        const r = await runCheck(c, { provenance });
        expect(r.verdict, c.id).toBe(VERDICT.SKIPPED);
        expect(r.examined, c.id).toBe(0);
        expect(r.message, c.id).toMatch(/provenance/i);
      }
    });
  }
});

describe('case 2 — a v1 sidecar is SKIPPED, never a clean pass (THE deliverable)', () => {
  for (const [label, provenance] of [
    ['a v1 sidecar', { schemaVersion: 1, tool: 'api-translate' }],
    ['v2 with no run key', { schemaVersion: 2, tool: 'api-translate' }],
    ['a null run', { schemaVersion: 2, tool: 'api-translate', run: null }],
    ['an array run', { schemaVersion: 2, tool: 'api-translate', run: [] }],
  ]) {
    it(`every run-record check SKIPs on ${label}`, async () => {
      for (const c of MT_RUNRECORD_CHECKS) {
        const r = await runCheck(c, { provenance });
        expect(r.verdict, c.id).toBe(VERDICT.SKIPPED);
        expect(r.examined, c.id).toBe(0);
        expect(r.message, c.id).toMatch(/no run record/i);
      }
    });
  }

  it('this is the whole committed corpus — 200 of 200 sidecars land here', async () => {
    // Not a restatement of the premise pin: that one counts FILES, this one asserts
    // what the CHECKS do with them. The bytes and the verdict are different claims.
    const r = await runCheck(A4, { provenance: { schemaVersion: 1, tool: 'api-translate' } });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.examined).toBe(0);
  });
});

describe("case 3 — a run record missing THIS check's field is SKIPPED, not PASS", () => {
  // 🔴 THE `unwrapped[]` PATH. Written as the plan specifies — `(run.unwrapped || []).length`
  // — A4 reports 0 findings and PASS on every v2 sidecar ever written. These fixtures are
  // DELIBERATELY MALFORMED; do not "fix" them into agreement with the producer.
  const cases = [
    [A2a, 'markersNormalized', { unwrappedCount: 0, chars: 1 }],
    [A4, 'unwrappedCount', { markersNormalized: 0, chars: 1 }],
    [A8, 'chars', { markersNormalized: 0, unwrappedCount: 0 }],
  ];
  for (const [check, field, run] of cases) {
    it(`${check.id} SKIPs and NAMES \`${field}\` when the record lacks it`, async () => {
      const r = await runCheck(check, v2({ runRecordVersion: 1, ...run }));
      expect(r.verdict).toBe(VERDICT.SKIPPED);
      expect(r.examined).toBe(0);
      expect(r.message).toContain(field);
    });

    it(`${check.id} SKIPs when \`${field}\` is present but the wrong type`, async () => {
      const r = await runCheck(check, v2({ runRecordVersion: 1, ...run, [field]: 'lots' }));
      expect(r.verdict).toBe(VERDICT.SKIPPED);
      expect(r.message).toContain(field);
    });
  }
});

describe('THE producer/consumer equivalence test — a real record must be READ', () => {
  // 🔴 THIS IS THE ONE THAT CATCHES SHAPE DRIFT. Every other positive assertion below
  // could be satisfied by a check and a literal that agree with each other and not with
  // `buildRunRecord()`. Here the fixture IS the producer's output, so a rename on the
  // producer side turns this red instead of shipping a silent clean pass.
  it('all three checks read a clean record built by buildRunRecord()', async () => {
    const ctx = v2(cleanRecord());
    for (const c of MT_RUNRECORD_CHECKS) {
      const r = await runCheck(c, ctx);
      expect(r.examined, `${c.id} did not read the producer's own record`).toBe(1);
      expect(r.verdict, c.id).toBe(VERDICT.PASS);
    }
    // L37: the COUNT beside the predicate — a `for` over an empty array asserts nothing.
    expect(MT_RUNRECORD_CHECKS).toHaveLength(3);
  });

  it('all three checks report on a DIRTY record built by buildRunRecord()', async () => {
    const ctx = v2(
      cleanRecord({
        markersNormalized: 3,
        unwrapped: [{ type: 'i' }, { type: 'i' }, { type: 'term' }],
      })
    );
    const [a2a, a4, a8] = await Promise.all(MT_RUNRECORD_CHECKS.map((c) => runCheck(c, ctx)));
    expect(a2a.verdict).toBe(VERDICT.WARN);
    expect(a4.verdict).toBe(VERDICT.WARN);
    // A8 is a RECORDER. It has no failure mode by design — see its docstring.
    expect(a8.verdict).toBe(VERDICT.PASS);
    expect([a2a.examined, a4.examined, a8.examined]).toEqual([1, 1, 1]);
  });
});

describe('A2a — markersNormalized', () => {
  it('PASSes at examined 1 when the counter is 0 — a clean run is a MEASUREMENT', async () => {
    // `examined` is the number of RECORDS read (0 or 1), never the counter's value.
    // Keying it to the counter makes `runCheck` downgrade PASS+0 to SKIPPED and a
    // genuinely clean module becomes indistinguishable from a v1 one.
    const r = await runCheck(A2a, v2(cleanRecord()));
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(1);
  });

  it('WARNs with the count when markers were re-glued', async () => {
    const r = await runCheck(A2a, v2(cleanRecord({ markersNormalized: 7 })));
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.examined).toBe(1);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ kind: 'markers-normalized', occurrences: 7 });
  });
});

describe('A4 — unwrappedCount + unwrappedByType', () => {
  it('PASSes when no invented markers were removed', async () => {
    const r = await runCheck(A4, v2(cleanRecord()));
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(1);
    expect(r.findings).toHaveLength(0);
  });

  it('reports ONE finding PER TYPE, carrying the total as magnitude', async () => {
    // The plan's `toHaveLength(2)` assumed a per-ITEM array. The producer tallies, so
    // the natural unit is the type — richer than the plan assumed, not poorer.
    const r = await runCheck(
      A4,
      v2(cleanRecord({ unwrapped: [{ type: 'i' }, { type: 'i' }, { type: 'term' }] }))
    );
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.findings).toHaveLength(2);
    expect(r.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'invented-marker', type: 'i', occurrences: 2 }),
        expect.objectContaining({ kind: 'invented-marker', type: 'term', occurrences: 1 }),
      ])
    );
    expect(r.message).toContain('3');
  });

  it('flags a tally that does not sum to the count — post-write tampering', async () => {
    // NOT a tautology: `.length` and the tally are computed by different code over the
    // same input, so damage to one does not move the other. DELIBERATELY MALFORMED.
    const r = await runCheck(
      A4,
      v2({ runRecordVersion: 1, unwrappedCount: 9, unwrappedByType: { i: 2 } })
    );
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'tally-disagrees-with-count' })])
    );
  });
});

describe('A8 — chars and estimatedIsk, RECORD ONLY', () => {
  it('records both values in the message and never fails', async () => {
    const r = await runCheck(A8, v2(cleanRecord()));
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(1);
    expect(r.findings).toHaveLength(0);
    expect(r.message).toContain('12345');
    expect(r.message).toContain('246.9');
  });

  it('SKIPs when estimatedIsk is absent — a recorder with nothing to record', async () => {
    const r = await runCheck(A8, v2({ runRecordVersion: 1, chars: 10 }));
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('estimatedIsk');
  });
});

describe('registry and contract', () => {
  it('tier 2 now holds SEVEN checks — the free four plus the run-record three', async () => {
    const tier2 = [...REGISTRY.values()].filter((c) => c.tier === 2);
    expect(tier2.map((c) => c.id).sort()).toEqual(['A1', 'A2a', 'A2b', 'A2c', 'A4', 'A6', 'A8']);
    expect(tier2).toHaveLength(7);
  });

  it('all three are ADVISORY and version-stamped', async () => {
    expect(
      Object.fromEntries(MT_RUNRECORD_CHECKS.map((c) => [c.id, [c.blocking, c.version, c.tier]]))
    ).toEqual({ A2a: [false, 1, 2], A4: [false, 1, 2], A8: [false, 1, 2] });
  });
});
