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

describe('② truncation — a segment whose MARKER was lost is refused too', () => {
  // Adversarial review 2026-09-28: `validateMarkers` counts the literal `<!-- SEG:`, and
  // the value checks only compare ids parsed on BOTH sides (the parser needs `-->`). So a
  // response cut INSIDE the next marker kept the count equal, the cut segment was never
  // judged, and a raw `<!-- SEG:` fragment was written into the previous segment. For a
  // table summary, inject then silently keeps the English (peekSeg, best-effort).
  // ▶ Compare id SETS, never counts. Measured: 0 of 205 committed EN/IS pairs in four
  // books differ in id set, so no historical response would have been refused.
  const two = `<!-- SEG:m68724:para:p1 -->\n${LONG_EN}\n\n<!-- SEG:m68724:para:p2 -->\n${LONG_EN}\n\n`;
  const both = (text) => text.replaceAll(LONG_EN, LONG_IS);

  it('refuses a response cut inside the next SEG marker', async () => {
    const cut = (text) => both(text).replace(/<!-- SEG:m68724:para:p2 -->[\s\S]*$/, '<!-- SEG:');
    const err = await translateChunk(scriptedClient(cut), two, null, false, 'm68724').catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('m68724:para:p2');
  });

  it('refuses a mangled id the repairs cannot restore (digit transposition)', async () => {
    const mangle = (text) => both(text).replace('SEG:m68724:para:p2', 'SEG:m68742:para:p2');
    await expect(
      translateChunk(scriptedClient(mangle), two, null, false, 'm68724')
    ).rejects.toThrow(/m68724:para:p2/);
  });

  it('refuses a duplicated marker that stands in for a dropped one', async () => {
    const three = `${two}<!-- SEG:m68724:para:p3 -->\n${LONG_EN}\n\n`;
    const dup = (text) => both(text).replace('SEG:m68724:para:p3', 'SEG:m68724:para:p2');
    await expect(translateChunk(scriptedClient(dup), three, null, false, 'm68724')).rejects.toThrow(
      /m68724:para:p3/
    );
  });

  it('passes an intact two-segment response (control)', async () => {
    const r = await translateChunk(scriptedClient(both), two, null, false, 'm68724');
    expect(r.text).toContain('m68724:para:p2');
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

  // ⚠️ EXACT strings, not "contains the word". The 2026-09-28 mutation review found two
  // mutants that survived looser pins: `greekLost: []` still contains "greekLost", and
  // `if (false && greekLost …)` still contains the increment.
  it('passes the Greek losses to classifyModuleOutcome', () => {
    expect(mainBody).toContain('classifyModuleOutcome({ mismatches, bracketDelta, greekLost })');
  });

  it('counts a Greek-loss module and holds its chapter', () => {
    expect(mainBody).toMatch(
      /if \(greekLost && greekLost\.length > 0\) \{\s*results\.greekModules\+\+;\s*greekChapters\.add\(mod\.chapterDir\);/
    );
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
