/**
 * The MT-output guards, wired into api-translate (2026-09-26 ruling, §C183).
 *
 * Two verdicts, deliberately different, each following an existing precedent:
 *
 *  ② TRUNCATION → REFUSE TO WRITE, like the SEG-count mismatch ("API may have truncated
 *    the response") that already throws. A truncated segment is corrupted output, and
 *    under `--force` writing it would OVERWRITE a good prior translation. It joins the
 *    SEG-count check in translateChunk, so it gets the same retry-without-glossary first.
 *
 *  ① GREEK LOSS → WRITE, HOLD THE CHAPTER BACK, EXIT NON-ZERO, like a bracket delta
 *    (§C118 ⑲). One wrong symbol in otherwise good text is suspicious-but-usable output
 *    that was paid for; the module is written and a human reviews it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateChunk, translateModule, classifyModuleOutcome } from '../api-translate.js';
import { readProvenance } from '../lib/provenance.js';

const API_TRANSLATE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'api-translate.js'
);

const LONG_EN = `${'The enthalpy of the system changes as heat flows. '.repeat(20).trim()}`;
const LONG_IS = `${'Vermi kerfisins breytist þegar varmi flæðir. '.repeat(24).trim()}`;
const chunk = (...segs) => segs.map(([id, t]) => `<!-- SEG:m1:para:${id} -->\n${t}\n\n`).join('');

/** A client that answers from a queue of transforms, recording each call. */
function scriptedClient(...transforms) {
  const calls = [];
  return {
    calls,
    translateAuto: async (text, opts) => {
      calls.push({ glossary: Boolean(opts?.glossaries) });
      const f = transforms[Math.min(calls.length - 1, transforms.length - 1)];
      return { text: f(text), usage: { units: text.length, cost: 0 } };
    },
  };
}

const toIcelandic = (text) => text.replace(LONG_EN, LONG_IS);
const truncate = (text) => text.replace(LONG_EN, LONG_IS.slice(0, 120));

const GLOSSARY = {
  name: 'test',
  sourceLanguage: 'en',
  targetLanguage: 'is',
  terms: [{ sourceWord: 'enthalpy', targetWord: 'vermi' }],
};

describe('② truncation — translateChunk refuses a short response', () => {
  it('throws on a truncated one-segment chunk with no glossary, naming the segment', async () => {
    const client = scriptedClient(truncate);
    const err = await translateChunk(client, chunk(['p1', LONG_EN]), null, false, 'm1').catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/truncat/i);
    expect(err.message).toContain('m1:para:p1');
  });

  it('carries the evidence in the error — lengths, ratio and the IS tail', async () => {
    const client = scriptedClient(truncate);
    const err = await translateChunk(client, chunk(['p1', LONG_EN]), null, false, 'm1').catch(
      (e) => e
    );
    expect(err.message).toMatch(/ratio/);
    expect(err.message).toContain(LONG_IS.slice(80, 120));
  });

  it('does not retry when no glossary was sent — there is nothing to drop', async () => {
    const client = scriptedClient(truncate);
    await translateChunk(client, chunk(['p1', LONG_EN]), null, false, 'm1').catch(() => {});
    expect(client.calls).toHaveLength(1);
  });

  it('retries WITHOUT the glossary first, exactly as for a SEG-count shortfall', async () => {
    const client = scriptedClient(truncate, toIcelandic);
    const r = await translateChunk(client, chunk(['p1', LONG_EN]), GLOSSARY, false, 'm1');
    expect(client.calls.map((c) => c.glossary)).toEqual([true, false]);
    expect(r.glossarySent).toBe(false);
  });

  it('throws when the no-glossary retry is truncated too', async () => {
    const client = scriptedClient(truncate, truncate);
    await expect(
      translateChunk(client, chunk(['p1', LONG_EN]), GLOSSARY, false, 'm1')
    ).rejects.toThrow(/truncat/i);
  });

  it('passes a complete response straight through (control)', async () => {
    const client = scriptedClient(toIcelandic);
    const r = await translateChunk(client, chunk(['p1', LONG_EN]), null, false, 'm1');
    expect(r.text).toContain(LONG_IS);
  });
});

describe('② truncation — translateModule never writes a truncated module', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outguards-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('leaves a PRE-EXISTING good translation untouched — the --force case', async () => {
    const inputPath = path.join(dir, 'm1-segments.en.md');
    const outputPath = path.join(dir, 'm1-segments.is.md');
    fs.writeFileSync(inputPath, chunk(['p1', LONG_EN]));
    fs.writeFileSync(outputPath, 'GOOD PRIOR TRANSLATION');
    await translateModule(scriptedClient(truncate), inputPath, outputPath, null, false).catch(
      () => {}
    );
    expect(fs.readFileSync(outputPath, 'utf8')).toBe('GOOD PRIOR TRANSLATION');
  });
});

describe('① Greek loss — translateModule writes, records, and reports it', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outguards-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const sigmaToDelta = (text) =>
    text.replace('A σ bond forms.', 'Δ-tengi myndast.').replace('A π bond.', 'π-tengi.');

  async function runGreek() {
    const inputPath = path.join(dir, 'm1-segments.en.md');
    const outputPath = path.join(dir, 'm1-segments.is.md');
    fs.writeFileSync(inputPath, chunk(['p1', 'A σ bond forms.'], ['p2', 'A π bond.']));
    const result = await translateModule(
      scriptedClient(sigmaToDelta),
      inputPath,
      outputPath,
      null,
      false
    );
    return { result, outputPath };
  }

  it('still writes the module — the output was paid for', async () => {
    const { outputPath } = await runGreek();
    expect(fs.readFileSync(outputPath, 'utf8')).toContain('Δ-tengi myndast.');
  });

  it('returns the loss, keyed on its segment', async () => {
    const { result } = await runGreek();
    expect(result.greekLost).toEqual([{ segId: 'm1:para:p1', lost: ['σ'], added: ['Δ'] }]);
  });

  it('records the loss in the provenance run record', async () => {
    await runGreek();
    const greek = readProvenance(dir, 'm1').run.greek;
    expect(greek.lostCount).toBe(1);
    expect(greek.lost[0].segId).toBe('m1:para:p1');
  });

  it('records a clean module as zero losses (control)', async () => {
    const inputPath = path.join(dir, 'm1-segments.en.md');
    fs.writeFileSync(inputPath, chunk(['p1', 'A π bond.']));
    await translateModule(
      scriptedClient((t) => t.replace('A π bond.', 'π-tengi.')),
      inputPath,
      path.join(dir, 'm1-segments.is.md'),
      null,
      false
    );
    expect(readProvenance(dir, 'm1').run.greek).toMatchObject({ lostCount: 0, addedCount: 0 });
  });
});

describe('① Greek loss — classifyModuleOutcome holds the chapter back', () => {
  it('holds back on a Greek loss, and names the letters', () => {
    const out = classifyModuleOutcome({
      greekLost: [{ segId: 'm1:para:p1', lost: ['σ'], added: ['Δ'] }],
    });
    expect(out.heldBack).toBe(true);
    expect(out.reasons.join(' ')).toMatch(/Greek.*σ/);
  });

  it('does NOT hold back an empty loss list (control)', () => {
    expect(classifyModuleOutcome({ greekLost: [] }).heldBack).toBe(false);
  });
});

describe('① Greek loss — the verdict is wired into main()', () => {
  const src = fs.readFileSync(API_TRANSLATE, 'utf8');
  const mainBody = src.slice(src.indexOf('async function main('));

  it('passes the Greek losses to classifyModuleOutcome', () => {
    const i = mainBody.indexOf('classifyModuleOutcome(');
    expect(mainBody.slice(i, mainBody.indexOf(')', i))).toContain('greekLost');
  });

  it('feeds a Greek held-back set into computeCompleteChapters', () => {
    const i = mainBody.indexOf('computeCompleteChapters(');
    expect(mainBody.slice(i, mainBody.indexOf(')', i))).toContain('greekChapters');
  });

  it('a Greek loss contributes to the non-zero exit', () => {
    const exitLine = mainBody
      .split('\n')
      .find((l) => l.includes('process.exit(1)') && l.includes('results.'));
    expect(exitLine).toMatch(/greekModules/);
  });
});
