/**
 * api-translate-exercises-discovery.test.js — item 9 (D3): exercises-segments
 * files ride the existing MT path. discoverModules stays strictly m\d+ (its
 * regex is load-bearing for module identity); exercises files are discovered
 * by an explicit sibling helper, mirroring the chapter-metadata precedent.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discoverModules, discoverExercisesFile } from '../api-translate.js';

function makeDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apitr-disc-'));
  for (const f of files) fs.writeFileSync(path.join(dir, f), '<!-- SEG:x:t:1 -->\nseg\n');
  return dir;
}

describe('exercise-file discovery', () => {
  it('discoverModules does NOT return the exercises file (module regex untouched)', () => {
    const dir = makeDir(['m00031-segments.en.md', 'exercises-segments.en.md']);
    expect(discoverModules(dir).map((m) => m.moduleId)).toEqual(['m00031']);
  });

  it('discoverExercisesFile returns the entry when present', () => {
    const dir = makeDir(['exercises-segments.en.md']);
    const e = discoverExercisesFile(dir);
    expect(e).toEqual({
      moduleId: 'exercises',
      filename: 'exercises-segments.en.md',
      path: path.join(dir, 'exercises-segments.en.md'),
    });
  });

  it('discoverExercisesFile returns null when absent', () => {
    const dir = makeDir(['m00031-segments.en.md']);
    expect(discoverExercisesFile(dir)).toBeNull();
  });
});
