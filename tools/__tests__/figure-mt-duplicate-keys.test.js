/**
 * The paid figure leg buys ONE REQUEST PER DISTINCT BLOCK KEY — not one per occurrence.
 *
 * 🔴 THE DEFECT THIS FILE PINS (review money/F4 + dataflow/F1, two lenses, one bug).
 * `blocks.json` legitimately carries the same key more than once — `compose.py` DRAWS
 * both, which is ruling R-13, and the acceptance table records thousands of duplicate
 * keys corpus-wide. `translate-blocks.mjs` filtered to `send:true` and issued one BILLED
 * request per OCCURRENCE, while the result went into `out[b.key]` — a JSON object, so
 * last-write-wins. Every extra request was paid for and thrown away before it could be
 * written anywhere.
 *
 * Measured on a population neither reviewer used (chemistry ch03/05/06/07, 265 figures
 * prepared fresh, 102 with sendable text): 446 send occurrences over 426 distinct keys,
 * i.e. 20 requests (4.5%) and 238 characters (3.1%, 2.38 ISK) bought for nothing, on 9 of
 * the 102 figures. Chemistry ch04 is heavier still — the review measured 11.0% of its
 * requests there. Two populations, both non-zero; they are NOT averaged.
 *
 * 🔴 WHY THE SURVIVOR IS THE **LAST** TWIN, WHICH IS NOT THE OBVIOUS `seen`-SET FORM.
 * The write was ALREADY last-wins. Keeping the last occurrence therefore makes "the file
 * this tool writes is unchanged" true BY CONSTRUCTION rather than by measurement — and
 * there is a case where the two differ: `blockkey.block_key` joins an arc block's runs
 * bare and a non-arc block's lines with '|', so a one-line block `NaCl` and an arc block
 * spelling N-a-C-l produce the SAME key with the SAME `english` and DIFFERENT `arc`. Only
 * `arc` reaches the written value (`out[b.key] = b.arc ? got : [got]`), so a keep-first
 * dedupe would silently change the written SHAPE on exactly that collision. It is
 * unobserved in 265 figures — and it is the one thing a test can hold, so it is held
 * below, in `writes the LAST twin's shape …`, which a keep-first implementation fails.
 *
 * ⚠️ THE STUB IS TEXT-DETERMINISTIC (`IS:${text}`) AND MUST STAY SO. A call-indexed stub
 * (`IS#3(…)`) is the right instrument for SHOWING a discarded purchase and the wrong one
 * for proving the output is unchanged: fewer calls renumber the survivors, and the
 * comparison then reports a difference the fix did not make. That is this repo's
 * "volatile field in a comparator invents a difference" lesson.
 *
 * ⚠️ NO NETWORK, EVER — `main` takes its API pair as a parameter and every test here
 * injects a stub. The instrument for this defect IS the stub's recorded call count;
 * nothing else in the pipeline can see a request that was made and discarded.
 *
 * ⚠️ Lives in `tools/__tests__/` though the module is in `experiments/`, for the reason
 * `figure-mt-glossary.test.js` states: `experiments/` belongs to no vitest project the
 * moment `vitest.workspace.js` is repaired.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  main,
  dedupeSendBlocks,
} from '../../experiments/figure-text-translation/translate-blocks.mjs';

/** A block record in the shape `emit-blocks.py` writes. */
const block = (key, english, extra = {}) => ({
  key,
  english,
  lines: english.split(' '),
  arc: false,
  send: true,
  ...extra,
});

/**
 * A per-figure `--out` directory holding exactly what the paid stage reads.
 * The figure stem is a sentinel, so `api-run.json` proves WHICH meta.json was read.
 */
function fixtureOut(blocks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figdup-'));
  fs.writeFileSync(path.join(dir, 'blocks.json'), JSON.stringify(blocks));
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify({ source: '/nowhere/DUP_FIXTURE_FIGURE.pdf' })
  );
  return dir;
}

/**
 * Records every request, and reports usage DERIVED from what it was actually asked to
 * do — so `api-run.json`'s `usage` is a second, independent witness to the call count
 * rather than a constant that would agree with any number of requests.
 */
function countingStub(seen) {
  return {
    translate: async (text, opts) => {
      seen.push({ text, opts });
      return { text: `IS:${text}` };
    },
    getUsage: () => ({
      requests: seen.length,
      chars: seen.reduce((n, s) => n + s.text.length, 0),
    }),
  };
}

const runWith = async (dir, seen) =>
  main(['--book', 'efnafraedi-2e', '--out', dir], {
    createClient: () => countingStub(seen),
    estimateIsk: () => 0,
    envPath: path.join(dir, 'absent.env'),
  });

describe('dedupeSendBlocks — one request per distinct key, the last twin surviving', () => {
  it('returns an all-distinct list unchanged, object for object', () => {
    // THE POSITIVE CONTROL FOR EVERY REFUSAL BELOW. A dedupe that collapsed too much —
    // or that rebuilt the block records instead of passing them through — would satisfy
    // "no duplicates in the result" perfectly while destroying the ordinary case.
    const send = [block('A', 'A'), block('B', 'B'), block('C', 'C')];
    const out = dedupeSendBlocks(send);
    expect(out.map((b) => b.key)).toEqual(['A', 'B', 'C']);
    expect(out[0]).toBe(send[0]);
    expect(out[1]).toBe(send[1]);
    expect(out[2]).toBe(send[2]);
  });

  it('keeps each key ONCE, in first-occurrence order, holding the LAST twin object', () => {
    // Identity, not a field: the twins share `key` and `english` by construction (both
    // derive from the same lines), so no value comparison can say which survived. `toBe`
    // is the only assertion that discriminates keep-last from keep-first.
    const first = block('A', 'A');
    const other = block('B', 'B');
    const last = block('A', 'A', { arc: true });
    const out = dedupeSendBlocks([first, other, last]);
    expect(out.map((b) => b.key)).toEqual(['A', 'B']); // first-occurrence ORDER
    expect(out[0]).toBe(last); // last-occurrence VALUE
    expect(out[1]).toBe(other);
  });

  it('answers the multiset question: every input key survives, exactly once', () => {
    // Name the unit. The question is not "is any key missing" (a set test) and not "how
    // many blocks are there" (the read layer's count, which R-13 keeps at 3) — it is
    // "how many REQUESTS will be billed", one per distinct key.
    const send = [block('A', 'A'), block('B', 'B'), block('A', 'A'), block('B', 'B')];
    const keys = dedupeSendBlocks(send).map((b) => b.key);
    expect(new Set(keys)).toEqual(new Set(['A', 'B'])); // nothing dropped
    expect(keys.length).toBe(2); // and nothing bought twice
  });

  it('is empty for an empty plan, without throwing', () => {
    expect(dedupeSendBlocks([])).toEqual([]);
  });
});

describe('main — a duplicated block key is bought ONCE', () => {
  let savedExitCode;
  let realLog;
  beforeEach(() => {
    savedExitCode = process.exitCode;
    process.exitCode = undefined; // a stale value must not mask a missing set
    realLog = console.log;
    console.log = () => {};
  });
  afterEach(() => {
    console.log = realLog;
    process.exitCode = savedExitCode;
  });

  it('bills one request per distinct key, and writes exactly what it wrote before', async () => {
    // 🔴 RED ON HEAD: 3 requests, one per occurrence, the first 'Reactant' answer paid for
    // and overwritten. The translations assertion was GREEN on HEAD and stays green — that
    // pair IS the before/after proof that de-duplicating the REQUESTS changed no output.
    const dir = fixtureOut([
      block('Reactant', 'Reactant'),
      block('Product', 'Product'),
      block('Reactant', 'Reactant'),
      block('Held|back', 'Held back', { send: false }),
      block('Held|back', 'Held back', { send: false }),
    ]);
    const seen = [];

    await runWith(dir, seen);

    // Verdict before payload: a refusal returns early, and then "only 2 requests" is true
    // for the wrong reason.
    expect(process.exitCode).toBeUndefined();
    // NON-VACUITY: a client that is never called would satisfy every count below.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.map((s) => s.text)).toEqual(['Reactant', 'Product']);

    const trans = JSON.parse(fs.readFileSync(path.join(dir, 'translations-api.json'), 'utf-8'));
    expect(trans.blocks).toEqual({
      Reactant: ['IS:Reactant'],
      Product: ['IS:Product'],
    });

    // The durable record must not claim purchases that were never made — and `usage`
    // is derived by the stub from the calls it received, so it is a second witness.
    const apiRun = JSON.parse(fs.readFileSync(path.join(dir, 'api-run.json'), 'utf-8'));
    expect(apiRun.blocks.map((b) => b.key)).toEqual(['Reactant', 'Product']);
    expect(apiRun.usage).toEqual({ requests: 2, chars: 'ReactantProduct'.length });
  });

  it('buys every distinct key when there are no duplicates — nothing is collapsed', async () => {
    // The positive control for the test above, in the same file: "2 requests for 3 blocks"
    // and "the dedupe eats distinct keys too" look identical from a count alone.
    const dir = fixtureOut([
      block('Reactant', 'Reactant'),
      block('Product', 'Product'),
      block('Catalyst', 'Catalyst'),
      block('Held|back', 'Held back', { send: false }),
    ]);
    const seen = [];

    await runWith(dir, seen);

    expect(process.exitCode).toBeUndefined();
    expect(seen.map((s) => s.text)).toEqual(['Reactant', 'Product', 'Catalyst']);
    const trans = JSON.parse(fs.readFileSync(path.join(dir, 'translations-api.json'), 'utf-8'));
    expect(Object.keys(trans.blocks)).toEqual(['Reactant', 'Product', 'Catalyst']);
  });

  it('writes the LAST twin’s shape when two occurrences disagree about `arc`', async () => {
    // 🔴 THE ONE TEST THAT DISCRIMINATES KEEP-LAST FROM KEEP-FIRST. `block_key` joins an
    // arc block's runs bare and a non-arc block's lines with '|', so a single-line block
    // and an arc block spelling the same letters collide on both `key` and `english` and
    // differ only in `arc` — and `arc` is the whole of what reaches the written value.
    // HEAD writes the bare string here (last wins); a keep-first dedupe would write
    // `['IS:NaCl']` and change a file this fix must leave alone.
    const dir = fixtureOut([
      block('NaCl', 'NaCl', { arc: false }),
      block('NaCl', 'NaCl', { arc: true, lines: ['N', 'a', 'C', 'l'] }),
    ]);
    const seen = [];

    await runWith(dir, seen);

    expect(process.exitCode).toBeUndefined();
    expect(seen.map((s) => s.text)).toEqual(['NaCl']); // bought once
    const trans = JSON.parse(fs.readFileSync(path.join(dir, 'translations-api.json'), 'utf-8'));
    expect(trans.blocks).toEqual({ NaCl: 'IS:NaCl' }); // a STRING, as HEAD wrote it
  });
});
