import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createRequire } from 'module';
import { populatedBooks } from '../verify-source-manifest.js';

const require = createRequire(import.meta.url);
const { readLocalOrigin, MANIFEST_NAME } = require('../lib/source-manifest.cjs');

/**
 * §C93 ⑥ — two fail-open gaps in the source-manifest machinery, both closed while
 * ④ (the append-only supersede write) was descoped. Neither depends on ④.
 *
 * ⓐ `verify-source-manifest.js` enumerated the books to check by CNXML ALONE,
 *    while the Vitest baseline gate had already been fixed (finding ②) to use the
 *    UNION of "has CNXML" and "has a manifest". A book whose 01-source CNXML was
 *    emptied therefore dropped out of `--all` silently — the exact state the
 *    manifest exists to detect, verified by nobody, with exit 0.
 *
 * ⓑ `readLocalOrigin` returned `[]` for a `localOrigin` declared in a v1 manifest.
 *    The carve-out EXEMPTS named files from the hash comparison, so ignoring a
 *    declared one means the author believes files are exempt while the verifier
 *    believes they are not, and nobody is told. A fail-OPEN in the module whose
 *    thesis is fail-closed. Zero reach today (nothing mints v2) — which is exactly
 *    when it is cheap to close.
 *
 * Both tests carry their discriminating case AND the cases that must keep working,
 * so a fix that simply threw on everything, or included every directory, fails here.
 */

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'c93six-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function book(slug, { cnxml = false, manifest = false } = {}) {
  const src = join(dir, slug, '01-source');
  mkdirSync(join(src, 'ch01'), { recursive: true });
  if (cnxml) writeFileSync(join(src, 'ch01', 'm001.cnxml'), '<document id="m001"/>');
  if (manifest)
    writeFileSync(
      join(src, MANIFEST_NAME),
      JSON.stringify({ version: 1, book: slug, algorithm: 'sha256', files: {} })
    );
}

describe('§C93 ⑥ⓐ — the books to verify are the UNION of "has CNXML" and "has a manifest"', () => {
  it('includes a book whose CNXML was emptied but whose manifest remains', () => {
    book('gutted', { cnxml: false, manifest: true });
    book('normal', { cnxml: true, manifest: true }); // positive control
    const found = populatedBooks(dir).sort();
    // The discriminating assertion: a CNXML-only enumeration returns ['normal'].
    expect(found).toEqual(['gutted', 'normal']);
  });

  it('still includes a book with CNXML and no manifest (the un-minted case)', () => {
    book('fresh', { cnxml: true, manifest: false });
    expect(populatedBooks(dir)).toEqual(['fresh']);
  });

  it('excludes a book with neither — the fix must not simply include everything', () => {
    book('empty', { cnxml: false, manifest: false });
    book('real', { cnxml: true, manifest: false });
    expect(populatedBooks(dir)).toEqual(['real']);
  });

  it('returns [] for a missing books dir rather than throwing', () => {
    expect(populatedBooks(join(dir, 'does-not-exist'))).toEqual([]);
  });
});

describe('§C93 ⑥ⓑ — a localOrigin declared below v2 refuses instead of being ignored', () => {
  const writeManifest = (obj) => {
    const src = join(dir, 'b', '01-source');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, MANIFEST_NAME), JSON.stringify(obj));
    return src;
  };

  it('THROWS on a v1 manifest that declares a localOrigin carve-out', () => {
    const src = writeManifest({ version: 1, files: {}, localOrigin: ['ch00/m68662.cnxml'] });
    expect(() => readLocalOrigin(src)).toThrow(/localOrigin/);
    // and the message must say WHY, not just that something is wrong
    expect(() => readLocalOrigin(src)).toThrow(/v2/);
  });

  it('returns [] for an ordinary v1 manifest — the common case must not throw', () => {
    const src = writeManifest({ version: 1, files: {} });
    expect(readLocalOrigin(src)).toEqual([]);
  });

  it('returns the carve-out for a v2 manifest', () => {
    const src = writeManifest({ version: 2, files: {}, localOrigin: ['ch00/m68662.cnxml'] });
    expect(readLocalOrigin(src)).toEqual(['ch00/m68662.cnxml']);
  });

  it('returns [] for a v2 manifest with no localOrigin key', () => {
    const src = writeManifest({ version: 2, files: {} });
    expect(readLocalOrigin(src)).toEqual([]);
  });

  it('returns [] when there is no manifest at all', () => {
    const src = join(dir, 'none', '01-source');
    mkdirSync(src, { recursive: true });
    expect(readLocalOrigin(src)).toEqual([]);
  });
});
