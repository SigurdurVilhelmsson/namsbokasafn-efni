/**
 * `--glossary-only` — send a NAMED subset of the approved glossary, nothing else.
 *
 * Why it exists (2026-09-19, chemistry ch05): with the glossary off the wire
 * ([USER] 2026-09-06), a paid probe of m68727 rendered `enthalpy` as `varmaorka`,
 * `varmi` and `entalpía` — 40 of 86 enthalpy segments `varm-` only, against 0 of 86
 * under the glossary. That is CLAUDE.md's mirror case (two English terms collapsing
 * onto one Icelandic word), the one class the glossary earns its place for; the rest
 * of the glossary stays off.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { restrictGlossary, parseHeadwordList, translateModule } from '../api-translate.js';
import { readProvenance } from '../lib/provenance.js';

const GLOSSARY = {
  domain: 'chemistry',
  sourceLanguage: 'en',
  targetLanguage: 'is',
  terms: [
    { sourceWord: 'enthalpy', targetWord: 'vermi' },
    { sourceWord: 'enthalpy change', targetWord: 'vermibreyting' },
    { sourceWord: 'heat', targetWord: 'varmi' },
    { sourceWord: 'addition', targetWord: 'álagning' },
  ],
};

describe('parseHeadwordList', () => {
  it('splits on commas, trims, and drops empties', () => {
    expect(parseHeadwordList(' enthalpy , enthalpy change,, ')).toEqual([
      'enthalpy',
      'enthalpy change',
    ]);
  });
});

describe('restrictGlossary', () => {
  it('keeps only the named headwords', () => {
    const { glossary } = restrictGlossary(GLOSSARY, ['enthalpy', 'enthalpy change']);
    expect(glossary.terms.map((t) => t.sourceWord)).toEqual(['enthalpy', 'enthalpy change']);
  });

  it('matches headwords case-insensitively', () => {
    const { glossary, missing } = restrictGlossary(GLOSSARY, ['Enthalpy']);
    expect([glossary.terms.length, missing.length]).toEqual([1, 0]);
  });

  it('keeps the request-body fields of the glossary it narrows', () => {
    const { glossary } = restrictGlossary(GLOSSARY, ['enthalpy']);
    expect(Object.keys(glossary).sort()).toEqual(Object.keys(GLOSSARY).sort());
  });

  it('names every requested headword the glossary does not carry', () => {
    const { missing } = restrictGlossary(GLOSSARY, ['enthalpy', 'entropy']);
    expect(missing).toEqual(['entropy']);
  });

  it('reports every headword missing when there is no glossary at all', () => {
    const { glossary, missing } = restrictGlossary(null, ['enthalpy']);
    expect([glossary, missing]).toEqual([null, ['enthalpy']]);
  });
});

describe('translateModule records the glossary-only arm', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glossonly-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('stamps arm "glossary-only" when the caller says so', async () => {
    const echoClient = {
      translateAuto: async (text) => ({ text, usage: { units: text.length, cost: 0.01 } }),
    };
    const inputPath = path.join(dir, 'm68727-segments.en.md');
    const outputPath = path.join(dir, 'm68727-segments.is.md');
    fs.writeFileSync(inputPath, '<!-- SEG:m68727:para:p1 -->\nEnthalpy is a state function.\n');
    const { glossary } = restrictGlossary(GLOSSARY, ['enthalpy']);

    await translateModule(echoClient, inputPath, outputPath, glossary, false, undefined, {
      glossaryArm: 'glossary-only',
    });

    expect(readProvenance(dir, 'm68727').run.glossary.arm).toBe('glossary-only');
  });
});

describe('the CLI refuses a contradictory arm before any spend', () => {
  it('exits 1 on --glossary-only with --no-glossary', () => {
    const tool = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../api-translate.js');
    const r = spawnSync(
      process.execPath,
      [
        tool,
        '--book',
        'efnafraedi-2e',
        '--chapter',
        '5',
        '--dry-run',
        '--no-glossary',
        '--glossary-only',
        'enthalpy',
      ],
      { encoding: 'utf8', env: { ...process.env, MALSTADUR_API_KEY: '' } }
    );
    expect([r.status, /--glossary-only/.test(r.stderr)]).toEqual([1, true]);
  });

  it('exits 1 when a named headword is not in the glossary', () => {
    const tool = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../api-translate.js');
    const r = spawnSync(
      process.execPath,
      [
        tool,
        '--book',
        'efnafraedi-2e',
        '--chapter',
        '5',
        '--dry-run',
        '--glossary-only',
        'zzz-not-a-headword',
      ],
      { encoding: 'utf8', env: { ...process.env, MALSTADUR_API_KEY: '' } }
    );
    expect([r.status, /zzz-not-a-headword/.test(r.stderr)]).toEqual([1, true]);
  });
});
