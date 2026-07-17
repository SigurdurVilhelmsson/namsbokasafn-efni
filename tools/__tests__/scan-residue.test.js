/**
 * scan-residue.test.js — item 9 (D3, final review I1): scan-residue.js must
 * skip exercises-segments.is.md BY EXACT NAME, mirroring the guards in
 * verify-extraction-coverage.js's collectModuleFiles and
 * server/services/segmentParser.js's listing filter. Before the fix, every
 * chapter's exercises-segments.is.md mapped to the SAME moduleId
 * ('exercises'), so a later chapter's entry silently overwrote an earlier
 * chapter's in the scan report and allowlist keying (nickname-based) never
 * matched.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { collectResidueFiles } from '../scan-residue.js';

describe('collectResidueFiles', () => {
  it('ignores exercises-segments.is.md (no cross-chapter moduleId collision)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-res-ex-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'exercises-segments.is.md'),
        '<!-- SEG:01-03-OC-P01:stimulus:b0 -->\ntexti\n'
      );
      const files = collectResidueFiles(dir);
      expect(files.map((f) => f.moduleId)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still collects a real module alongside a skipped exercises file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-res-ex-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'exercises-segments.is.md'),
        '<!-- SEG:01-03-OC-P01:stimulus:b0 -->\ntexti\n'
      );
      fs.writeFileSync(
        path.join(dir, 'm00031-segments.is.md'),
        '<!-- SEG:m00031:para:p1 -->\ntexti\n'
      );
      const files = collectResidueFiles(dir);
      expect(files.map((f) => f.moduleId)).toEqual(['m00031']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('excludes .backup.* and .json siblings (pre-existing filter, unaffected by the guard)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-res-ex-'));
    try {
      fs.writeFileSync(path.join(dir, 'm00031-segments.is.md'), 'x');
      fs.writeFileSync(path.join(dir, 'm00031-segments.is.md.backup.20260101'), 'x');
      fs.writeFileSync(path.join(dir, 'm00031-segments.is.md.json'), '{}');
      const files = collectResidueFiles(dir);
      expect(files.map((f) => f.moduleId)).toEqual(['m00031']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
