import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  writeProvenance,
  readProvenance,
  restorePolicyFor,
  resolveRestorePolicy,
  SCHEMA_VERSION,
} from '../lib/provenance.js';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prov-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('restorePolicyFor', () => {
  it('maps api-translate to warn', () => {
    expect(restorePolicyFor('api-translate')).toBe('warn');
  });
  it('maps docx-import to mutate', () => {
    expect(restorePolicyFor('docx-import')).toBe('mutate');
  });
  it('throws on an unknown tool', () => {
    expect(() => restorePolicyFor('web-import')).toThrow(/unknown provenance tool/i);
  });
});

describe('write/read round-trip', () => {
  it('writes a sidecar that reads back with the same tool and schema', () => {
    writeProvenance(dir, 'm66372', {
      tool: 'api-translate',
      generatedAt: '2026-06-30T00:00:00.000Z',
    });
    const got = readProvenance(dir, 'm66372');
    expect(got).toEqual({
      schemaVersion: SCHEMA_VERSION,
      tool: 'api-translate',
      generatedAt: '2026-06-30T00:00:00.000Z',
    });
  });
  it('returns null when no sidecar exists', () => {
    expect(readProvenance(dir, 'm00000')).toBeNull();
  });
  it('throws when writing an unknown tool', () => {
    expect(() => writeProvenance(dir, 'm1', { tool: 'nope' })).toThrow(/unknown provenance tool/i);
  });
  it('throws when reading a sidecar with an unknown tool', () => {
    fs.writeFileSync(
      path.join(dir, 'm1-provenance.json'),
      JSON.stringify({ schemaVersion: 1, tool: 'nope' })
    );
    expect(() => readProvenance(dir, 'm1')).toThrow(/unknown provenance tool/i);
  });
});

describe('resolveRestorePolicy', () => {
  it('returns the sidecar policy when provenance is present', () => {
    writeProvenance(dir, 'm66372', { tool: 'docx-import' });
    expect(resolveRestorePolicy({ mtOutputChapterDir: dir, moduleId: 'm66372' })).toEqual({
      policy: 'mutate',
      tool: 'docx-import',
      source: 'sidecar',
    });
  });
  it('throws when MT segments exist but provenance is missing', () => {
    fs.writeFileSync(path.join(dir, 'm66372-segments.is.md'), '<!-- SEG:m66372:para:x -->\nhi\n');
    expect(() => resolveRestorePolicy({ mtOutputChapterDir: dir, moduleId: 'm66372' })).toThrow(
      /no provenance for m66372/i
    );
  });
  it('returns warn/human-authored when there is no MT origin at all', () => {
    expect(resolveRestorePolicy({ mtOutputChapterDir: dir, moduleId: 'm99999' })).toEqual({
      policy: 'warn',
      tool: null,
      source: 'human-authored',
    });
  });
});
