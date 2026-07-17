/**
 * segmentParserExercises.test.js — item 9 (D3): the editorial server's module
 * listing must not surface a phantom module named 'exercises'
 * (exercises-segments.en.md is os-embed pipeline data; editor wiring for it
 * is deliberately out of scope — spec § Out of scope).
 *
 * Isolation mirrors applyStatusRebuild.test.js / segmentEditBackstop.test.js:
 * segmentParser exposes a test-only `_setTestBooksDir` seam (segmentParser.js
 * ~:513-516) that repoints its module-level BOOKS_DIR at a temp tree; no DB
 * is involved since listChapterModules is a pure fs reader.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
const segmentParser = require('../services/segmentParser');

const BOOK = 'testbook';
const CHAPTER = 1;

describe('listChapterModules — exercises-segments.en.md exclusion', () => {
  let tmpDir;
  let realBooksDir;

  beforeEach(() => {
    realBooksDir = segmentParser.BOOKS_DIR;
    tmpDir = mkdtempSync(join(tmpdir(), 'segparser-ex-'));
    const enDir = join(tmpDir, BOOK, '02-for-mt', 'ch01');
    mkdirSync(enDir, { recursive: true });
    writeFileSync(
      join(enDir, 'm00031-segments.en.md'),
      '<!-- SEG:m00031:para:fs-id001 -->\nReal module content.\n'
    );
    writeFileSync(
      join(enDir, 'exercises-segments.en.md'),
      '<!-- SEG:01-03-OC-P01:stimulus:b0 -->\nJSON-sourced exercise text.\n'
    );
    segmentParser._setTestBooksDir(tmpDir);
  });

  afterEach(() => {
    segmentParser._setTestBooksDir(realBooksDir);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists the real module and never a phantom "exercises" module', () => {
    const modules = segmentParser.listChapterModules(BOOK, CHAPTER);
    const moduleIds = modules.map((m) => m.moduleId);
    expect(moduleIds).toEqual(['m00031']);
    expect(moduleIds).not.toContain('exercises');
  });
});
