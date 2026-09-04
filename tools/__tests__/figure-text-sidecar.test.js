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
  editorialState,
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

/**
 * TWO LAYERS, and conflating them deadlocks the feature.
 *
 *  editorialState — "has an editor approved THESE EXACT blocks?" DB state plus
 *    the blocks-vs-renderHash check. This is what gets WRITTEN as the sidecar's
 *    `state`, so it must not depend on whether the composer has run.
 *  effectiveState — what the card, the payload and the renderer show. Adds:
 *    the SVG on disk must have been composed from those same blocks.
 *
 * 🔴 A single gated function cannot work. applyApprovedFigureEdits writes
 * `state: <derived>`, so gating that derivation on composedHash would write
 * 'mt-preview' on every approval; effectiveState then short-circuits on
 * `state !== 'approved'` and the composer's stamp could never flip it. Approved
 * would become unreachable — permanently.
 */
const approvedSidecar = (blocks = BLOCKS, extra = {}) => ({
  state: 'approved',
  renderHash: computeRenderHash(blocks, '1'),
  ...extra,
});

describe('editorialState — did an editor approve these blocks?', () => {
  it('is mt-preview when there is no sidecar at all', () => {
    expect(editorialState(null, BLOCKS, '1')).toBe('mt-preview');
  });
  it('is approved on matching blocks with NO composedHash — the composer is not its business', () => {
    // Load-bearing: this is the value applyApprovedFigureEdits writes. If it
    // were gated on composedHash, approval could never be recorded at all.
    expect(editorialState(approvedSidecar(), BLOCKS, '1')).toBe('approved');
  });
  it('DEGRADES to mt-preview when the blocks have changed since approval', () => {
    expect(editorialState(approvedSidecar(), { ...BLOCKS, Celsius: 'Selsíus' }, '1')).toBe(
      'mt-preview'
    );
  });
  it('keeps a flag visible even when the hash matches', () => {
    expect(editorialState({ state: 'flagged', renderHash: 'x' }, BLOCKS, '1')).toBe('flagged');
  });
});

describe('effectiveState — does the PUBLISHED IMAGE carry approved text?', () => {
  it('is mt-preview when there is no sidecar at all', () => {
    expect(effectiveState(null, BLOCKS, '1')).toBe('mt-preview');
  });

  it('is approved when the blocks match AND the SVG was composed from them', () => {
    const s = approvedSidecar();
    expect(effectiveState({ ...s, composedHash: s.renderHash }, BLOCKS, '1')).toBe('approved');
  });

  it('composedHash ABSENT is mt-preview — approved but never composed', () => {
    // 🔴 FAIL SAFE. This is the whole defect: an editor corrects a label,
    // approves, and every surface says approved while the published SVG still
    // carries the old text. No check in the repo could see it, because the
    // sidecar's hash is consistent with its own blocks by construction.
    expect(effectiveState(approvedSidecar(), BLOCKS, '1')).toBe('mt-preview');
  });

  it('composedHash STALE is mt-preview — the SVG is from older blocks', () => {
    expect(effectiveState(approvedSidecar(BLOCKS, { composedHash: 'older' }), BLOCKS, '1')).toBe(
      'mt-preview'
    );
  });

  it('DEGRADES to mt-preview when the blocks changed, even if both hashes agree', () => {
    // The pre-existing rule must not regress: a matching composedHash describes
    // an image composed from the OLD blocks, which is not approval of the new.
    const s = approvedSidecar();
    expect(
      effectiveState({ ...s, composedHash: s.renderHash }, { ...BLOCKS, Celsius: 'Selsíus' }, '1')
    ).toBe('mt-preview');
  });

  it('keeps a flag visible regardless of either hash', () => {
    const flagged = { state: 'flagged', renderHash: 'x', composedHash: 'x' };
    expect(effectiveState(flagged, BLOCKS, '1')).toBe('flagged');
    expect(effectiveState({ state: 'flagged', renderHash: 'x' }, BLOCKS, '1')).toBe('flagged');
  });

  it('an EMPTY composedHash does not satisfy the gate by matching an empty renderHash', () => {
    // A degenerate pair ('' === '') would otherwise read as approved. Guarding
    // on truthiness as well as equality is what keeps two absences from
    // cancelling into a false all-clear.
    expect(effectiveState({ state: 'approved', renderHash: '', composedHash: '' }, {}, '1')).toBe(
      'mt-preview'
    );
  });
});

describe('the two layers really are different', () => {
  it('there is a state on which they disagree — otherwise the split is decoration', () => {
    // The control. If someone made effectiveState an alias of editorialState,
    // every test above still passes except this one.
    const s = approvedSidecar();
    expect(editorialState(s, BLOCKS, '1')).toBe('approved');
    expect(effectiveState(s, BLOCKS, '1')).toBe('mt-preview');
  });
});

/**
 * The composer is Python and its own tests are plain scripts that neither
 * `npm test` nor CI runs (both are node-only). These two pins therefore live
 * HERE, where the authoritative gate can see them — a rule guarded only by a
 * test nothing executes is not guarded.
 */
describe('the Python composer must COPY the hash, never compute one', () => {
  const composerDir = new URL('../../experiments/figure-text-translation/', import.meta.url);
  const readPy = (name) => fs.readFileSync(new URL(name, composerDir), 'utf-8');

  /**
   * Docstrings and # comments removed, so this judges CODE.
   *
   * ⚠️ Not fussiness — measured. A pin that FORBIDS a token trips on the very
   * comment that documents the prohibition: figtext.py's docstring says "If you
   * are reaching for hashlib, you have taken the wrong branch", and the first
   * draft of the assertion below went red against exactly that sentence. The
   * prose is doing its job; the pin has to look past it.
   */
  const pyCode = (src) =>
    src
      .replace(/"""[\s\S]*?"""/g, '')
      .replace(/'''[\s\S]*?'''/g, '')
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n');

  it('figtext.py reaches for no hashing library', () => {
    // 🔴 computeRenderHash is JS. A Python reimplementation would be two
    // implementations of one rule in two languages, which CLAUDE.md then
    // requires to be proved equal ON THE CORPUS rather than on a fixture.
    // Copying the value leaves nothing to disagree with — so the tripwire is
    // the import, not the output.
    const src = pyCode(readPy('figtext.py'));
    expect(src).toContain('def stamp_composed_hash'); // control: the right file, still code
    expect(src).not.toMatch(/\bhashlib\b/);
    expect(src).not.toMatch(/\bsha256\b/);
  });

  it('compose.py stamps only a real SVG compose, never a --control run', () => {
    // A --control run re-injects the ENGLISH through the same code, and a
    // PNG-only run does not produce the published format. Neither is a
    // composition of approved Icelandic, so neither may claim to be one.
    const src = pyCode(readPy('compose.py'));
    expect(src).toContain('stamp_composed_hash');
    const stampIdx = src.indexOf('stamp_composed_hash');
    const svgIdx = src.indexOf('if SVG:');
    expect(svgIdx).toBeGreaterThan(-1);
    expect(stampIdx).toBeGreaterThan(svgIdx); // inside the SVG branch
    expect(src.slice(svgIdx, stampIdx)).not.toContain('CONTROL =');
  });
});

describe('writeSidecar byte format — the constant the Python composer is anchored on', () => {
  it('emits exactly the bytes experiments/.../test_composed_hash.py hardcodes', () => {
    // 🔴 CROSS-LANGUAGE ANCHOR. figtext.stamp_composed_hash rewrites this file
    // from Python, and the sidecar is COMMITTED and read as a diff. Rather than
    // reimplement the format in Python and then have to prove two
    // implementations agree, both sides are pinned to ONE literal: this test
    // owns it, and the Python test hardcodes the same bytes.
    writeSidecar(bookDir, 'CNX_Chem_01_06_TempScales', {
      version: 1,
      basename: 'CNX_Chem_01_06_TempScales',
      state: 'approved',
      renderHash: '0123456789abcdef',
      composerVersion: '1',
      blocks: { 'Boiling point of water': 'Suðumark vatns' },
    });
    expect(fs.readFileSync(sidecarPath(bookDir, 'CNX_Chem_01_06_TempScales'), 'utf-8')).toBe(
      '{\n' +
        ' "version": 1,\n' +
        ' "basename": "CNX_Chem_01_06_TempScales",\n' +
        ' "state": "approved",\n' +
        ' "renderHash": "0123456789abcdef",\n' +
        ' "composerVersion": "1",\n' +
        ' "blocks": {\n' +
        '  "Boiling point of water": "Suðumark vatns"\n' +
        ' }\n' +
        '}\n'
    );
  });
});
