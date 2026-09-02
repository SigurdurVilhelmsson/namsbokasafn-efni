// tools/__tests__/figure-text-sidecar.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const {
  sidecarPath,
  readSidecar,
  writeSidecar,
  computeRenderHash,
  effectiveState,
  SIDECAR_VERSION,
  COMPOSER_VERSION,
} = require('../lib/figure-text-sidecar.cjs');

let bookDir;
beforeEach(() => {
  bookDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'figtext-')), 'efnafraedi-2e');
  fs.mkdirSync(bookDir, { recursive: true });
});
afterEach(() => fs.rmSync(path.dirname(bookDir), { recursive: true, force: true }));

const BLOCKS = { 'Boiling|point|of water': 'Suðumark vatns', Celsius: 'Celsíus' };

describe('sidecarPath', () => {
  it('is per-figure under the book, not under 01-source', () => {
    const p = sidecarPath(bookDir, 'CNX_Chem_01_06_TempScales');
    expect(p).toContain(path.join('efnafraedi-2e', 'figure-text'));
    expect(p.endsWith('CNX_Chem_01_06_TempScales.is.json')).toBe(true);
    expect(p).not.toContain('01-source');
  });
});

describe('readSidecar', () => {
  it('returns null when the figure has none', () => {
    expect(readSidecar(bookDir, 'CNX_Nope')).toBeNull();
  });
  it('round-trips what writeSidecar wrote', () => {
    writeSidecar(bookDir, 'CNX_A', {
      version: SIDECAR_VERSION,
      basename: 'CNX_A',
      state: 'approved',
      renderHash: 'x',
      composerVersion: COMPOSER_VERSION,
      blocks: BLOCKS,
    });
    const got = readSidecar(bookDir, 'CNX_A');
    expect(got.blocks).toEqual(BLOCKS);
    expect(got.state).toBe('approved');
  });
  it('returns null rather than throwing on malformed JSON', () => {
    const p = sidecarPath(bookDir, 'CNX_Bad');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '{ not json');
    expect(readSidecar(bookDir, 'CNX_Bad')).toBeNull();
  });
});

describe('computeRenderHash', () => {
  it('is stable across key order', () => {
    const a = computeRenderHash({ x: '1', y: '2' }, '1');
    const b = computeRenderHash({ y: '2', x: '1' }, '1');
    expect(a).toBe(b);
  });
  it('changes when any block text changes', () => {
    const a = computeRenderHash(BLOCKS, '1');
    const b = computeRenderHash({ ...BLOCKS, Celsius: 'Selsíus' }, '1');
    expect(b).not.toBe(a);
  });
  it('changes when the composer version changes', () => {
    expect(computeRenderHash(BLOCKS, '2')).not.toBe(computeRenderHash(BLOCKS, '1'));
  });
});

describe('effectiveState', () => {
  it('is mt-preview when there is no sidecar at all', () => {
    expect(effectiveState(null, BLOCKS, '1')).toBe('mt-preview');
  });
  it('is approved when the hash still matches', () => {
    const s = { state: 'approved', renderHash: computeRenderHash(BLOCKS, '1') };
    expect(effectiveState(s, BLOCKS, '1')).toBe('approved');
  });
  it('DEGRADES to mt-preview when the blocks have changed since approval', () => {
    const s = { state: 'approved', renderHash: computeRenderHash(BLOCKS, '1') };
    const edited = { ...BLOCKS, Celsius: 'Selsíus' };
    expect(effectiveState(s, edited, '1')).toBe('mt-preview');
  });
  it('keeps a flag visible even when the hash matches', () => {
    const s = { state: 'flagged', renderHash: computeRenderHash(BLOCKS, '1') };
    expect(effectiveState(s, BLOCKS, '1')).toBe('flagged');
  });
});
