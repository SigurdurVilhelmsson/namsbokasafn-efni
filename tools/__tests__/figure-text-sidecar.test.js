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
 * 🔴 THE PYTHON TREE DOES NO HASHING AT ALL, and that is now a FACT about the
 * code rather than a rule a test has to police.
 *
 * `composedHash` was briefly stamped by `compose.py`, which meant Python held a
 * copy-don't-compute rule that a pin had to enforce. ⑰ moved the stamp to
 * `tools/publish-figure-svg.js` — where it belongs, because that is where the
 * file lands in `books/<slug>/media/` and therefore where "the image on disk was
 * composed from these blocks" becomes true. `computeRenderHash` lives beside it.
 *
 * ▶ So the pin below is stronger and simpler than the pair it replaces: not
 * "the composer must copy rather than compute", but "there is nothing in the
 * Python tree that could compute". An absence is cheaper to keep true.
 */
describe('the composer computes no hashes — there is no second implementation', () => {
  const composerDir = new URL('../../experiments/figure-text-translation/', import.meta.url);

  // §C140 ⑥a: figsym.py fail-closed-verifies the local STIX font file and the
  // committed licence text against pinned sha256 digests (spec
  // docs/superpowers/specs/2026-09-17-c140-c6a-stix-regular-design.md T3/T5).
  // That is font/licence integrity, not a sidecar hash — ⑰'s invariant is "no
  // Python implementation of renderHash/composedHash", not "no hashing at all".
  // Each allowlisted file is exempted from exactly what it needs and no more:
  // - figsym.py may use hashlib, at EXACTLY `FIGSYM_SHA256_CALLS` call sites
  //   (every STIX font file in _read_pinned(), which load() and §C140 '6'
  //   M6's load_face() share for all four faces; the licence text in
  //   metadata_element()), so a new hashing site is a conscious change to
  //   this number, not a silent one;
  // - test_figsym.py only NAMES 'sha256' in assertion strings — it may say the
  //   word, and must still never import hashlib.
  // Every other .py file still gets the full absence check, and both are
  // checked below for the sidecar-hash symbols specifically.
  // §C140 ㉗ adds figis.py on the same terms: it verifies the four Liberation
  // Sans faces (one call, in _verified()) and the committed licence text (one
  // call, in metadata_element()) — spec
  // docs/superpowers/specs/2026-09-29-c140-c27-c14-composer-design.md. The
  // shared fontsubset.py computes NO hash and gets the full absence check.
  const HASH_ALLOWLIST = ['figsym.py', 'test_figsym.py', 'figis.py', 'test_figis.py'];
  const FIGSYM_SHA256_CALLS = 2;
  const FIGIS_SHA256_CALLS = 2;

  it('no Python file in the figure-text tree reaches for a hashing library, except the allowlisted STIX/licence integrity checks', () => {
    const files = fs.readdirSync(composerDir).filter((f) => f.endsWith('.py'));
    expect(files.length).toBeGreaterThan(4); // control: the directory really was read
    // control: a rename of an allowlisted file cannot silently no-op this pin
    for (const name of HASH_ALLOWLIST) {
      expect(files, `${name} must still exist for the allowlist to mean anything`).toContain(name);
    }
    for (const f of files) {
      if (HASH_ALLOWLIST.includes(f)) continue;
      const src = fs.readFileSync(new URL(f, composerDir), 'utf-8');
      expect(src, `${f} must not hash`).not.toMatch(/\bhashlib\b|\bsha256\b/);
    }
  });

  it('figsym.py hashes at exactly its pinned call sites, and test_figsym.py never imports hashlib', () => {
    const figsym = fs.readFileSync(new URL('figsym.py', composerDir), 'utf-8');
    expect(
      figsym.split('hashlib.sha256(').length - 1,
      'a new hashlib.sha256( site in figsym.py must be a conscious change to FIGSYM_SHA256_CALLS'
    ).toBe(FIGSYM_SHA256_CALLS);
    // ... and every hashlib use in it IS one of those calls (no second algorithm beside them)
    expect(figsym.split('hashlib.').length - 1).toBe(FIGSYM_SHA256_CALLS);
    const testFigsym = fs.readFileSync(new URL('test_figsym.py', composerDir), 'utf-8');
    expect(testFigsym, 'test_figsym.py may name sha256 but must not hash').not.toMatch(
      /\bhashlib\b/
    );
    // control: the exemption is for a word the file really contains
    expect(testFigsym).toMatch(/\bsha256\b/);
  });

  it('figis.py hashes at exactly its pinned call sites, and test_figis.py never imports hashlib', () => {
    const figis = fs.readFileSync(new URL('figis.py', composerDir), 'utf-8');
    expect(
      figis.split('hashlib.sha256(').length - 1,
      'a new hashlib.sha256( site in figis.py must be a conscious change to FIGIS_SHA256_CALLS'
    ).toBe(FIGIS_SHA256_CALLS);
    expect(figis.split('hashlib.').length - 1).toBe(FIGIS_SHA256_CALLS);
    const testFigis = fs.readFileSync(new URL('test_figis.py', composerDir), 'utf-8');
    expect(testFigis, 'test_figis.py may name sha256 but must not hash').not.toMatch(/\bhashlib\b/);
    expect(testFigis).toMatch(/\bsha256\b/);
  });

  it('the allowlisted files still implement no sidecar hash, even though they hash', () => {
    for (const f of HASH_ALLOWLIST) {
      const src = fs.readFileSync(new URL(f, composerDir), 'utf-8');
      expect(src, `${f} must not implement a sidecar hash`).not.toMatch(
        /renderHash|composedHash|computeRenderHash|composed_hash|render_hash/
      );
    }
  });

  it('compose.py no longer stamps the sidecar — the publisher does', () => {
    // A leftover stamp in compose.py would claim the sidecar describes
    // out/translated.svg, which is precisely the dishonesty ⑰ closed.
    const src = fs.readFileSync(new URL('compose.py', composerDir), 'utf-8');
    expect(src).toContain('write_svg'); // control: the right file, still composing
    expect(src).not.toContain('composedHash');
    expect(src).not.toContain('stamp_composed_hash');
  });
});

describe('writeSidecar byte format', () => {
  it('emits stable, minimally-diffing bytes for a committed file', () => {
    // The sidecar is COMMITTED and read as a diff, and TWO writers rewrite it in
    // alternation — applyApprovedFigureEdits on approval and publish-figure-svg
    // on publish. Pinning the exact bytes is what keeps an approve/publish cycle
    // from churning the file. (Until ⑰ this also anchored a Python writer; that
    // one is gone, which is why the format now has one implementation. Rather than
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

/**
 * §C140 '6' R-5a — an LF in a translated block value is the editor's explicit line break, and this
 * module is the ONE owner of the rule the boundaries refuse a malformed one by (D6): the save route
 * (server/routes/segment-editor.js), the CI corpus sweep (V10 below) and, through
 * `keyInkLineCount`, the review panel's textarea predicate and the heldBlockValues validator.
 * The composer refuses the same shapes by name (figtext.explicit_lines, test_compose_explicit_breaks.py).
 *
 * Read through the module OBJECT, not the destructure above, so a missing export fails each case
 * on its own rather than the whole file at import.
 */
describe("blockValueProblems — R-5a explicit line breaks (§C140 '6' T10b)", () => {
  const owner = require('../lib/figure-text-sidecar.cjs');
  const codes = (key, value) => owner.blockValueProblems(key, value).map((p) => p.split(':')[0]);

  it('V1 CONTROL: a value with no LF is accepted, whatever its key', () => {
    expect(owner.blockValueProblems('Celsius', 'Celsíus')).toEqual([]);
    expect(owner.blockValueProblems('pure water|blood', 'hreint vatn blóð')).toEqual([]);
  });

  it("V2: phscale's planned edit — two lines on a two-line key — is accepted", () => {
    expect(owner.blockValueProblems('pure water|blood', 'hreint vatn\nblóð')).toEqual([]);
  });

  it('V3: an LF on a single-line key is refused line-count — a one-line block takes no break', () => {
    expect(codes('Celsius', 'Cel\nsíus')).toEqual(['line-count']);
  });

  it('V4: more lines than the key has source lines is refused line-count', () => {
    expect(codes('pure water|blood', 'hreint\nvatn\nblóð')).toEqual(['line-count']);
  });

  it('V5: a CR is refused anywhere — with an LF, and alone', () => {
    expect(codes('pure water|blood', 'hreint vatn\r\nblóð')).toContain('carriage-return');
    expect(codes('Celsius', 'Cel\rsíus')).toEqual(['carriage-return']);
  });

  it('V6: an empty or whitespace-only line is refused empty-line, naming its line', () => {
    expect(codes('a|b|c', 'x\n\ny')).toEqual(['empty-line']);
    expect(codes('a|b', 'x\n  ')).toEqual(['empty-line']);
    expect(owner.blockValueProblems('a|b|c', 'x\n\ny')[0]).toMatch(/line 2\b/);
  });

  it('V7: a line with leading or trailing whitespace is refused edge-space', () => {
    expect(codes('a|b', 'x \ny')).toEqual(['edge-space']);
    expect(codes('a|b', 'x\n y')).toEqual(['edge-space']);
  });

  it('V8: a line of only invisible characters (U+200B) is refused invisible-line', () => {
    // U+200B is not whitespace to String.prototype.trim, so the empty-line rule cannot see it.
    expect('​'.trim()).toBe('​'); // the premise
    expect(codes('a|b', 'x\n​')).toEqual(['invisible-line']);
  });

  it("V9: R-17 — a spaces-only key segment is no line, so 'more is| ' takes no break", () => {
    expect(codes('more is| ', 'minna er\nlágt')).toEqual(['line-count']);
    expect(owner.blockValueProblems('more is| ', 'minna er lágt')).toEqual([]); // control
  });

  it('V10: every committed sidecar value in books/*/figure-text passes', () => {
    const booksRoot = new URL('../../books/', import.meta.url);
    let checked = 0;
    let total = 0;
    const failures = [];
    for (const book of fs.readdirSync(booksRoot)) {
      const dir = new URL(`${book}/figure-text/`, booksRoot);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.is.json'))) {
        const side = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf-8'));
        for (const [k, v] of Object.entries(side.blocks || {})) {
          total += 1;
          if (typeof v !== 'string') {
            failures.push(`${book}/${f} ${JSON.stringify(k)}: not a string`);
            continue;
          }
          checked += 1;
          for (const p of owner.blockValueProblems(k, v)) failures.push(`${book}/${f} ${p}`);
        }
      }
    }
    expect(failures).toEqual([]);
    // Positive control: a sweep that found no file would pass the line above vacuously.
    expect(total).toBeGreaterThan(0);
    expect(checked).toBe(total);
  });

  it("keyInkLineCount is M2's rule: a spaces-only segment is not a line, an empty one is", () => {
    expect(owner.keyInkLineCount('Celsius')).toBe(1);
    expect(owner.keyInkLineCount('pure water|blood')).toBe(2);
    expect(owner.keyInkLineCount('more is| ')).toBe(1);
    expect(owner.keyInkLineCount('a||b')).toBe(3);
    expect(owner.keyInkLineCount(' ')).toBe(1); // nothing but spaces: the whole key is one line
    expect(owner.keyInkSegments('more is| ')).toEqual(['more is']);
  });

  it('INVISIBLE_LINE is exported and matches a line that draws nothing, not one that does', () => {
    expect(owner.INVISIBLE_LINE.test('​­')).toBe(true);
    expect(owner.INVISIBLE_LINE.test('x​')).toBe(false);
  });

  it('single owner (D6): figure-config-validate.js keeps no copy of either predicate', () => {
    const src = fs.readFileSync(
      new URL('../lib/figure-config-validate.js', import.meta.url),
      'utf-8'
    );
    expect(src).toContain('heldBlockValues'); // control: the right file
    expect(src).not.toContain('\\p{Cf}'); // INVISIBLE_LINE's literal
    expect(src).not.toMatch(/\/\^ \+\$\//); // the spaces-only segment test
  });
});
