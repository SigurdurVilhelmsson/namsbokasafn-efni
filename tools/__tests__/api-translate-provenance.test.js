import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeProvenance, readProvenance } from '../lib/provenance.js';
import { moduleIdFromOutputPath, translateModule } from '../api-translate.js';

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
    translateAuto: async (text) => ({ text, usage: text.length }),
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
  });
});
