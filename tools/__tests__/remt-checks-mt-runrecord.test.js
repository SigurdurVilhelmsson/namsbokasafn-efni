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
    // 🔴 THE THREE NUMBERS ARE DELIBERATELY DISTINCT. They were `chars: 12345` and
    // `usage: 12345`, which made `expect(message).toContain('12345')` satisfiable by
    // EITHER field — so the assertion bound neither, and the whole `usage` branch was
    // unbound in both directions. Measured: a record with `chars: 999, usage: 12345`
    // still contained '12345'. Distinct values are what make the message assertions real.
    chars: 12345,
    usage: 777,
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
  it("records all three values EXACTLY — the message is A8's entire deliverable", async () => {
    // An exact match, not three `toContain`s. A8 always returns PASS / examined 1 /
    // findings [], so the message IS the output; a partial matcher leaves most of it
    // unbound, and `toContain` on a shared value binds nothing at all.
    const r = await runCheck(A8, v2(cleanRecord()));
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(1);
    expect(r.findings).toHaveLength(0);
    expect(r.message).toBe('chars=12345 estimatedIsk=246.9 usage=777');
  });

  it('SKIPs when estimatedIsk is absent — a recorder with nothing to record', async () => {
    const r = await runCheck(A8, v2({ runRecordVersion: 1, chars: 10 }));
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('estimatedIsk');
  });

  // 🔴 `usage` IS THE ONE FIELD IN THIS RECORD WHOSE CORRUPTION ACTUALLY SHIPPED.
  // `run-record.js`'s own docstring records it: `totalUsage += result.usage || 0` against
  // an API that returns an OBJECT persisted the literal string "0[object Object]" into
  // every real sidecar until 2026-08-16. A8 is the only check that looks at `usage`, so
  // if A8 drops a malformed one silently, a recurrence has no observer anywhere.
  for (const [label, usage] of [
    ['the historical "0[object Object]" string', '0[object Object]'],
    ['the raw API object it came from', { units: 12345 }],
    ['null', null],
    ['NaN', NaN],
    ['a numeric STRING', '777'],
  ]) {
    it(`WARNs and names the shape when usage is ${label}`, async () => {
      const r = await runCheck(A8, v2(cleanRecord({ usage })));
      expect(r.verdict).toBe(VERDICT.WARN);
      expect(r.examined).toBe(1);
      expect(r.findings).toHaveLength(1);
      expect(r.findings[0]).toMatchObject({ kind: 'malformed-usage' });
      // The message must NOT read as though usage were simply absent — that is the
      // coerce-to-empty this fix removes.
      expect(r.message).toContain('usage');
    });
  }

  it('a MISSING usage key is not a finding — absent and malformed are different', async () => {
    // The discriminator is the KEY, not the value: JSON.stringify drops an undefined
    // value, so a sidecar that never carried one has no key at all.
    // A JSON round-trip is the honest way to produce this: it is exactly what strips an
    // undefined-valued key on the way to disk.
    const noUsage = JSON.parse(JSON.stringify(cleanRecord({ usage: undefined })));
    const r = await runCheck(A8, v2(noUsage));
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.findings).toHaveLength(0);
    expect(r.message).toBe('chars=12345 estimatedIsk=246.9');
  });
});

describe('the case-2 message must not assert a cause the code cannot know', () => {
  // 🔴 `writeProvenance` stamps `schemaVersion: 2` UNCONDITIONALLY and attaches `run`
  // only when passed one. Measured 2026-08-26: of three production callers, only
  // `api-translate.js:1347` passes it — `docx-import.js:829` and
  // `backfill-provenance.js:36` both write v2-WITHOUT-run TODAY. So "this module
  // predates the run-record writer" is false for a shape two live tools produce, and it
  // is the message — the only thing distinguishing the three kinds of nothing — that
  // carries this task's whole deliverable.
  it('names the producer-emits-none cause alongside the predates-the-writer one', async () => {
    const r = await runCheck(A4, v2(undefined));
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toMatch(/no run record/i);
    expect(r.message).toMatch(/predates the writer/i);
    expect(r.message).toMatch(/docx-import|producer emits none/i);
  });
});

/**
 * ── PINS ADDED BY MUTATION TESTING, NOT BY REVIEW ──────────────────────────────────
 * A first pass caught 16 of 21 mutants. The five survivors below were all cases where
 * the CODE was already correct and NOTHING BOUND IT — a later "simplification" of
 * `FIELD_KIND` or of A2a's threshold would have gone green. §C82 L39: mutation-test the
 * predicate's BREADTH, not merely its presence. Each `it` here kills exactly one mutant,
 * named in its comment, so a future reader can tell what the test is defending.
 */
describe('predicate breadth — the cases a green suite did not bind', () => {
  // MUTANT: `count: (v) => typeof v === 'number' && v >= 0` (integer-ness dropped).
  // A fractional counter is nonsense that would flow straight into a finding's magnitude.
  it('A2a SKIPs on a FRACTIONAL markersNormalized', async () => {
    const r = await runCheck(A2a, v2(cleanRecord({ markersNormalized: 1.5 })));
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('markersNormalized');
  });

  // MUTANT: `count: (v) => Number.isInteger(v)` (the `>= 0` clause dropped).
  // 🔴 THE DANGEROUS DIRECTION: a negative counter passes `n > 0` as FALSE, so the module
  // would read PASS — a clean verdict manufactured from a corrupt number.
  it('A2a SKIPs on a NEGATIVE markersNormalized rather than reading it as clean', async () => {
    const r = await runCheck(A2a, v2(cleanRecord({ markersNormalized: -1 })));
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('markersNormalized');
  });

  // MUTANT: `const findings = n > 1 ? ...` — the classic boundary. Exactly one re-glued
  // marker is still damage the file cannot show you.
  it('A2a WARNs at markersNormalized === 1, the boundary', async () => {
    const r = await runCheck(A2a, v2(cleanRecord({ markersNormalized: 1 })));
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ kind: 'markers-normalized', occurrences: 1 });
  });

  // MUTANT: `record: (v) => typeof v === 'object'` — which admits an ARRAY. `[]` then
  // yields `Object.entries([]) === []`, so an empty tally beside `unwrappedCount: 0`
  // reads PASS. L33/L35's container-vs-payload trap, one layer in.
  it('A4 SKIPs when unwrappedByType is an ARRAY, not a record', async () => {
    const r = await runCheck(
      A4,
      v2({ runRecordVersion: 1, unwrappedCount: 0, unwrappedByType: [] })
    );
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('unwrappedByType');
  });

  // MUTANT: `unwrappedByType` dropped from A4's required field list. Every fixture that
  // reaches A4's body comes from buildRunRecord and always carries one, so nothing
  // distinguished "required" from "happens to be there".
  it('A4 SKIPs when unwrappedByType is absent but the count is present', async () => {
    const r = await runCheck(A4, v2({ runRecordVersion: 1, unwrappedCount: 3 }));
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.examined).toBe(0);
    expect(r.message).toContain('unwrappedByType');
  });

  // Same breadth gap on A8's side of the field table.
  it('A8 SKIPs on a FRACTIONAL chars', async () => {
    const r = await runCheck(A8, v2(cleanRecord({ chars: 1.5 })));
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('chars');
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
