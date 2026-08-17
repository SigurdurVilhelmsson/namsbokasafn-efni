import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { writeManifestFor } from '../generate-source-manifest.js';

const require = createRequire(import.meta.url);
const { verifySourceManifest, MANIFEST_NAME } = require('../lib/source-manifest.cjs');

const TMP = join(import.meta.dirname, '..', '..', '.tmp', 'test-manifest-cli');
const sourceDir = join(TMP, '01-source');
const configPath = join(TMP, 'book-config.json');

function setLicence(code) {
  writeFileSync(configPath, JSON.stringify({ licence: { code, obtained: '2026-01-01' } }));
}

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(sourceDir, 'ch01'), { recursive: true });
  writeFileSync(join(sourceDir, 'ch01', 'm001.cnxml'), '<document id="m001"/>');
  setLicence('CC BY 4.0');
});
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe('writeManifestFor', () => {
  it('writes a manifest that verifies clean and carries generatedAt + note', () => {
    writeManifestFor(sourceDir, 'testbook');
    expect(existsSync(join(sourceDir, MANIFEST_NAME))).toBe(true);

    const written = JSON.parse(readFileSync(join(sourceDir, MANIFEST_NAME), 'utf8'));
    expect(written.book).toBe('testbook');
    expect(written.algorithm).toBe('sha256');
    expect(typeof written.generatedAt).toBe('string');
    expect(written.note).toMatch(/CC BY 4\.0/);

    expect(verifySourceManifest(sourceDir).ok).toBe(true);
  });

  it('derives the note from the book licence — an NC-SA book never gets a CC BY note', () => {
    setLicence('CC BY-NC-SA 4.0');
    writeManifestFor(sourceDir, 'testbook');

    const written = JSON.parse(readFileSync(join(sourceDir, MANIFEST_NAME), 'utf8'));
    expect(written.note).toMatch(/CC BY-NC-SA 4\.0/);
    expect(written.note).not.toMatch(/for the CC BY 01-source/);
  });

  it('§C93: is mint-only — refuses to overwrite an existing manifest, leaving it untouched', () => {
    writeManifestFor(sourceDir, 'testbook');
    const before = readFileSync(join(sourceDir, MANIFEST_NAME), 'utf8');

    expect(() => writeManifestFor(sourceDir, 'testbook')).toThrow(/mint-only|already exists/);

    const after = readFileSync(join(sourceDir, MANIFEST_NAME), 'utf8');
    expect(after).toBe(before);
  });
});
