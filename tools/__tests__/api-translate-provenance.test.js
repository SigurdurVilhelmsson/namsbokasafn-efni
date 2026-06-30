import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeProvenance, readProvenance } from '../lib/provenance.js';
import { moduleIdFromOutputPath } from '../api-translate.js';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apiprov-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('moduleIdFromOutputPath', () => {
  it('derives the module id from an mt-output filename', () => {
    expect(moduleIdFromOutputPath('/x/02-mt-output/ch05/m66372-segments.is.md')).toBe('m66372');
  });
});

describe('the production stamp call mirrored', () => {
  it('writes tool=api-translate that reads back', () => {
    const outputPath = path.join(dir, 'm66372-segments.is.md');
    fs.writeFileSync(outputPath, '<!-- SEG:m66372:para:x --> halló\n');
    writeProvenance(dir, moduleIdFromOutputPath(outputPath), { tool: 'api-translate' });
    expect(readProvenance(dir, 'm66372').tool).toBe('api-translate');
  });
});
