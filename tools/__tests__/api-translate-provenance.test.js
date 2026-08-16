import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeProvenance, readProvenance } from '../lib/provenance.js';
import { moduleIdFromOutputPath, translateModule } from '../api-translate.js';
import { estimateIsk } from '../lib/malstadur-api.js';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apiprov-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('moduleIdFromOutputPath', () => {
  it('derives the module id from an mt-output filename', () => {
    expect(moduleIdFromOutputPath('/x/02-mt-output/ch05/m66372-segments.is.md')).toBe('m66372');
  });
});

describe('the production stamp call mirrored', () => {
  it('writes tool=api-translate that reads back', () => {
    const outputPath = path.join(dir, 'm66372-segments.is.md');
    fs.writeFileSync(outputPath, '<!-- SEG:m66372:para:x --> halló\n');
    writeProvenance(dir, moduleIdFromOutputPath(outputPath), { tool: 'api-translate' });
    expect(readProvenance(dir, 'm66372').tool).toBe('api-translate');
  });
});

describe('translateModule persists the run record (§C82 prerequisite 2)', () => {
  /** A stub Málstaður client: echoes the wire text back, so every SEG marker survives. */
  const echoClient = {
    // ⚠️ `usage` is an OBJECT — the shape the REAL client returns. This stub said
    // `usage: text.length` (a number) until 2026-08-16, and that fiction is what
    // hid the "0[object Object]" defect from 4,733 green tests. See usageUnits().
    translateAuto: async (text) => ({ text, usage: { units: text.length, cost: 0.01 } }),
  };

  const SEGMENTS = [
    '<!-- SEG:m66372:para:p1 -->',
    'The [[i:atom]] is the unit of an element.',
    '',
    '<!-- SEG:m66372:para:p2 -->',
    'A [[sub:2]] subscript rides through unchanged.',
    '',
  ].join('\n');

  it('writes a run record beside the output', async () => {
    const inputPath = path.join(dir, 'm66372-segments.en.md');
    const outputPath = path.join(dir, 'm66372-segments.is.md');
    fs.writeFileSync(inputPath, SEGMENTS);

    await translateModule(echoClient, inputPath, outputPath, null, false);

    const run = readProvenance(dir, 'm66372').run;
    expect(run).toBeDefined();
    expect(run.runRecordVersion).toBe(1);
    expect(run.chars).toBe(SEGMENTS.length);
    expect(run.markersNormalized).toBe(0);
    expect(run.bracketDelta).toEqual({});
    expect(run.unwrappedCount).toBe(0);
  });

  it('records the no-glossary arm when no glossary was sent', async () => {
    const inputPath = path.join(dir, 'm66373-segments.en.md');
    const outputPath = path.join(dir, 'm66373-segments.is.md');
    fs.writeFileSync(inputPath, SEGMENTS.replace(/m66372/g, 'm66373'));

    await translateModule(echoClient, inputPath, outputPath, null, false);

    expect(readProvenance(dir, 'm66373').run.glossary).toEqual({
      arm: 'no-glossary',
      contentHash: null,
      termCount: null,
      chunksWithGlossary: 0,
      chunksTotal: 1,
    });
  });

  it('never hands writeProvenance a null run record', async () => {
    // ⚠️ ADDED at Task 2/3 review (Minor finding, closed here rather than by rework).
    // The reviewer built an alternate writeProvenance WITHOUT the `run !== null`
    // guard and it passed all four of Task 3's cases — because JSON.stringify drops
    // `undefined` keys for free, so "omits the key" cannot tell the two apart. The
    // guard is only observable when a caller passes an explicit null, and THIS is
    // the call site where a conditionally-computed record could produce one.
    const inputPath = path.join(dir, 'm66375-segments.en.md');
    const outputPath = path.join(dir, 'm66375-segments.is.md');
    fs.writeFileSync(inputPath, SEGMENTS.replace(/m66372/g, 'm66375'));

    await translateModule(echoClient, inputPath, outputPath, null, false);

    const parsed = readProvenance(dir, 'm66375');
    expect(parsed.run).not.toBeNull();
    expect(parsed.run).toBeTypeOf('object');
  });

  it('writeProvenance omits the key for an explicit null run (pins the guard)', () => {
    // The direct pin the reviewer showed was missing. Without the `!== null` guard
    // this writes `"run": null` and the assertion fails.
    writeProvenance(dir, 'm66376', { tool: 'api-translate', run: null });
    expect('run' in readProvenance(dir, 'm66376')).toBe(false);
  });

  it('records the glossary arm, its hash and its size', async () => {
    const inputPath = path.join(dir, 'm66374-segments.en.md');
    const outputPath = path.join(dir, 'm66374-segments.is.md');
    fs.writeFileSync(inputPath, SEGMENTS.replace(/m66372/g, 'm66374'));
    const glossary = {
      terms: [
        { sourceWord: 'atom', targetWord: 'frumeind' },
        { sourceWord: 'element', targetWord: 'frumefni' },
      ],
    };

    await translateModule(echoClient, inputPath, outputPath, glossary, false);

    const g = readProvenance(dir, 'm66374').run.glossary;
    expect(g.arm).toBe('glossary');
    expect(g.termCount).toBe(2);
    expect(g.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // "atom" and "element" both appear in SEGMENTS, so the one chunk actually
    // carries the glossary — this is the happy-path counterpart to the
    // arm-vs-outcome mismatch test below.
    expect(g.chunksWithGlossary).toBe(1);
    expect(g.chunksTotal).toBe(1);
  });
});

describe('translateModule records glossary OUTCOME, not just intent (§C82 fix round 1, Finding 2)', () => {
  /** Same echo stub as above — its output equals its input, so filtering is
   *  the only thing under test here, not any repair/mismatch machinery. */
  const echoClient = {
    // ⚠️ `usage` is an OBJECT — the shape the REAL client returns. This stub said
    // `usage: text.length` (a number) until 2026-08-16, and that fiction is what
    // hid the "0[object Object]" defect from 4,733 green tests. See usageUnits().
    translateAuto: async (text) => ({ text, usage: { units: text.length, cost: 0.01 } }),
  };

  const SEGMENTS = [
    '<!-- SEG:m66372:para:p1 -->',
    'The [[i:atom]] is the unit of an element.',
    '',
    '<!-- SEG:m66372:para:p2 -->',
    'A [[sub:2]] subscript rides through unchanged.',
    '',
  ].join('\n');

  it('records arm=glossary but chunksWithGlossary=0 when no term matches the chunk text', async () => {
    // The reviewer's exact bug: a glossary was PASSED (arm reflects that), but
    // filterGlossaryForText finds none of its terms in this text, so
    // translateChunk never puts it on the wire. Before this fix, `arm` alone
    // was the only signal recorded, and it reported 'glossary' — a false
    // positive for "was a glossary actually used".
    const inputPath = path.join(dir, 'm66377-segments.en.md');
    const outputPath = path.join(dir, 'm66377-segments.is.md');
    fs.writeFileSync(inputPath, SEGMENTS.replace(/m66372/g, 'm66377'));
    const glossary = { terms: [{ sourceWord: 'xenomorph', targetWord: 'framandvera' }] };

    await translateModule(echoClient, inputPath, outputPath, glossary, false);

    const g = readProvenance(dir, 'm66377').run.glossary;
    expect(g.arm).toBe('glossary'); // caller intent: a glossary object WAS passed
    expect(g.chunksWithGlossary).toBe(0); // outcome: it never reached the wire
    expect(g.chunksTotal).toBe(1);
  });
});

describe('translateModule wiring survives a stub whose output diverges from input (§C82 fix round 1, Finding 3)', () => {
  // The prior round's echoClient returns its input unchanged, so input and
  // output are always byte-identical — every delta is structurally {} and
  // every list structurally []. That stub cannot tell "correctly wired" from
  // several concretely wrong wirings (chars<->output.length,
  // bracketMarkerDelta(output, input) instead of (input, output), etc.) — the
  // reviewer proved this by making exactly those swaps and watching all 7
  // tests still pass. This stub's output genuinely differs from its input so
  // those wirings are distinguishable.
  const DIVERGE_USAGE = 424242; // deliberately unrelated to any string's .length
  // The REAL client wraps it: `{units, cost}`. Keeping the bare number here as
  // the expected VALUE while sending the object shape on the wire is the whole
  // point — it pins that the units are unwrapped, not stringified.
  const DIVERGE_USAGE_WIRE = { units: DIVERGE_USAGE, cost: 12.5 };

  // p1 carries an [[i:]] real marker (dropped by the stub, below) and a bare
  // invented marker [[efni]] ('efni' is not in KNOWN_BRACKET_TYPES, so
  // unwrapInventedMarkers — which runs unconditionally inside translateChunk,
  // independent of what the stub does — strips it to plain "efni" text and
  // records it). p2 carries an id-anchored [[term:atom|term-1]] marker.
  const SEGMENTS_DIVERGE = [
    '<!-- SEG:m66378:para:p1 -->',
    'The [[i:atom]] is the [[efni]] of everything.',
    '',
    '<!-- SEG:m66378:para:p2 -->',
    'A [[term:atom|term-1]] rides through.',
    '',
  ].join('\n');

  /**
   * Diverges from its input in three independent, simultaneously-checkable
   * ways:
   * - drops the [[i:]] bracket marker — bracketDelta must go negative;
   * - drops the wire-form [[/term]] closer stripTermFnToPaired produces for
   *   [[term:atom|term-1]] — reattachIds' per-segment count-guard trips
   *   (expected 1 term span, got 0), producing a non-empty `mismatches`;
   * - reports a usage value with no arithmetic relationship to any string's
   *   .length in this test.
   * (The [[efni]] → `unwrapped` case above needs no stub cooperation — it is
   * unwrapped by translateChunk's own post-processing regardless of what the
   * "MT" text says, as long as the marker rides through to `output`.)
   */
  const divergeClient = {
    translateAuto: async (text) => ({
      text: text.replace('[[i:atom]]', 'atom').replace('[[/term]]', ''),
      usage: DIVERGE_USAGE_WIRE,
    }),
  };

  it('pins chars/usage/estimatedIsk/bracketDelta/mismatchCount/unwrappedByType to the correct variables', async () => {
    const inputPath = path.join(dir, 'm66378-segments.en.md');
    const outputPath = path.join(dir, 'm66378-segments.is.md');
    fs.writeFileSync(inputPath, SEGMENTS_DIVERGE);

    await translateModule(divergeClient, inputPath, outputPath, null, false);

    const run = readProvenance(dir, 'm66378').run;

    // input.length: the [[i:]] marker is present in the INPUT and dropped
    // from the OUTPUT, so a chars<->output.length swap reports a different
    // number here.
    expect(run.chars).toBe(SEGMENTS_DIVERGE.length);
    // the stub's literal usage value, not text.length as echoClient's stub
    // would coincidentally satisfy either way.
    // 🔴 TYPE FIRST, VALUE SECOND — deliberately. The historical defect produced
    // the STRING "0[object Object]", and a `toBe(number)` alone reads identically
    // whether the accumulator added or concatenated. Assert the type explicitly so
    // a regression names itself instead of showing up as a puzzling value diff.
    expect(typeof run.usage).toBe('number');
    expect(run.usage).toBe(DIVERGE_USAGE);
    expect(run.estimatedIsk).toBe(estimateIsk(SEGMENTS_DIVERGE.length));
    // bracketMarkerDelta(input, output): input HAS the [[i:]] marker, output
    // does not, so this MUST be negative. A reversed
    // bracketMarkerDelta(output, input) call would report +1 instead.
    expect(run.bracketDelta).toEqual({ i: -1 });
    // Both counts happen to be 1, so count alone would not catch a
    // mismatches<->unwrapped swap — unwrappedByType's KEY ('efni' vs 'term')
    // is what a swap changes, since a reattachIds mismatch record also
    // carries a `.type` field (tallyByType reads `.type` off whatever array
    // it's handed) and would tally as { term: 1 } instead.
    expect(run.mismatchCount).toBe(1);
    expect(run.unwrappedCount).toBe(1);
    expect(run.unwrappedByType).toEqual({ efni: 1 });
  });
});
