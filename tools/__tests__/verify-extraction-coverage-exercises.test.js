/**
 * verify-extraction-coverage-exercises.test.js — item 9 (D3): the pre-freeze
 * coverage gate measures CNXML extraction; exercises-segments.en.md is
 * JSON-sourced (os-embed path) and must be skipped BY NAME, not treated as a
 * module (it would otherwise land in modulesMissingSource as a false finding).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { collectModuleFiles } from '../verify-extraction-coverage.js';

describe('collectModuleFiles', () => {
  it('ignores exercises-segments.en.md (no phantom module finding)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-ex-'));
    try {
      fs.mkdirSync(path.join(dir, '02-for-mt', 'ch01'), { recursive: true });
      fs.mkdirSync(path.join(dir, '01-source'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
        '<!-- SEG:01-03-OC-P01:stimulus:b0 -->\ntext\n'
      );

      const files = collectModuleFiles(path.join(dir, '02-for-mt'));
      expect(files.map((f) => f.moduleId)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still collects a real module alongside a skipped exercises file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-ex-'));
    try {
      fs.mkdirSync(path.join(dir, '02-for-mt', 'ch01'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
        '<!-- SEG:01-03-OC-P01:stimulus:b0 -->\ntext\n'
      );
      fs.writeFileSync(
        path.join(dir, '02-for-mt', 'ch01', 'm00031-segments.en.md'),
        '<!-- SEG:m00031:para:p1 -->\ntext\n'
      );

      const files = collectModuleFiles(path.join(dir, '02-for-mt'));
      expect(files.map((f) => f.moduleId)).toEqual(['m00031']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
