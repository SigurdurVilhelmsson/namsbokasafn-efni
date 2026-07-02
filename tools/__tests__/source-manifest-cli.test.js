import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { writeManifestFor } from '../generate-source-manifest.js';

const require = createRequire(import.meta.url);
const { verifySourceManifest, MANIFEST_NAME } = require('../lib/source-manifest.cjs');

const TMP = join(import.meta.dirname, '..', '..', '.tmp', 'test-manifest-cli');
const sourceDir = join(TMP, '01-source');

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(sourceDir, 'ch01'), { recursive: true });
  writeFileSync(join(sourceDir, 'ch01', 'm001.cnxml'), '<document id="m001"/>');
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
    expect(written.note).toMatch(/CC BY/);

    expect(verifySourceManifest(sourceDir).ok).toBe(true);
  });
});
