import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  listCnxmlFiles,
  computeFiles,
  computeSourceManifest,
  verifySourceManifest,
} = require('../lib/source-manifest.cjs');

const TMP = join(import.meta.dirname, '..', '..', '.tmp', 'test-source-manifest');
const sourceDir = join(TMP, '01-source');

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(sourceDir, 'ch01'), { recursive: true });
  mkdirSync(join(sourceDir, 'appendices'), { recursive: true });
  mkdirSync(join(sourceDir, 'media'), { recursive: true });
  writeFileSync(join(sourceDir, 'ch01', 'm001.cnxml'), '<document id="m001"/>');
  writeFileSync(join(sourceDir, 'appendices', 'm999.cnxml'), '<document id="m999"/>');
  writeFileSync(join(sourceDir, 'media', 'fig1.png'), 'not-cnxml');
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('listCnxmlFiles', () => {
  it('finds only .cnxml files recursively', () => {
    const found = listCnxmlFiles(sourceDir)
      .map((p) => p.replace(sourceDir, ''))
      .sort();
    expect(found).toEqual(['/appendices/m999.cnxml', '/ch01/m001.cnxml']);
  });

  it('returns [] for a nonexistent dir', () => {
    expect(listCnxmlFiles(join(TMP, 'nope'))).toEqual([]);
  });
});

describe('computeFiles', () => {
  it('keys by posix path relative to sourceDir, sorted', () => {
    const files = computeFiles(sourceDir);
    expect(Object.keys(files)).toEqual(['appendices/m999.cnxml', 'ch01/m001.cnxml']);
    expect(files['ch01/m001.cnxml']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('excludes non-cnxml files', () => {
    const files = computeFiles(sourceDir);
    expect(Object.keys(files).some((k) => k.includes('media'))).toBe(false);
  });
});

describe('computeSourceManifest', () => {
  it('produces a stable shape with no timestamp', () => {
    const m = computeSourceManifest(sourceDir, { book: 'testbook' });
    expect(m.version).toBe(1);
    expect(m.book).toBe('testbook');
    expect(m.algorithm).toBe('sha256');
    expect(m).not.toHaveProperty('generatedAt');
    expect(Object.keys(m.files)).toHaveLength(2);
  });
});

describe('verifySourceManifest', () => {
  function writeManifest(extra = {}) {
    const m = computeSourceManifest(sourceDir, { book: 'testbook' });
    writeFileSync(
      join(sourceDir, '.source-manifest.json'),
      JSON.stringify({ ...m, ...extra }, null, 2)
    );
  }

  it('ok:true on a clean tree', () => {
    writeManifest();
    expect(verifySourceManifest(sourceDir)).toMatchObject({
      ok: true,
      manifestMissing: false,
      changed: [],
      missing: [],
      added: [],
    });
  });

  it('manifestMissing:true, ok:false when the file is absent', () => {
    const r = verifySourceManifest(sourceDir);
    expect(r.ok).toBe(false);
    expect(r.manifestMissing).toBe(true);
  });

  it('reports a changed byte', () => {
    writeManifest();
    writeFileSync(join(sourceDir, 'ch01', 'm001.cnxml'), '<document id="m001">TAMPERED</document>');
    const r = verifySourceManifest(sourceDir);
    expect(r.ok).toBe(false);
    expect(r.changed).toEqual(['ch01/m001.cnxml']);
  });

  it('reports a deleted file', () => {
    writeManifest();
    rmSync(join(sourceDir, 'appendices', 'm999.cnxml'));
    const r = verifySourceManifest(sourceDir);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['appendices/m999.cnxml']);
  });

  it('reports an added file', () => {
    writeManifest();
    writeFileSync(join(sourceDir, 'ch01', 'm002.cnxml'), '<document id="m002"/>');
    const r = verifySourceManifest(sourceDir);
    expect(r.ok).toBe(false);
    expect(r.added).toEqual(['ch01/m002.cnxml']);
  });
});
