/**
 * cnxml-render-golden.test.js — byte-exact render baseline (Track C C0 safety net).
 *
 * Freezes the CURRENT renderer's output for a curated set of real efnafraedi-2e
 * modules. The render→DOM migration (C1–C4) must keep these byte-identical
 * (after MathJax normalization — see helpers/render-normalize.js). This is the
 * blunt drift detector; the nesting matrix and parser suites cover structure and
 * the string core respectively.
 *
 * Regenerate after an INTENTIONAL render change:
 *   UPDATE_GOLDEN=1 npx vitest run tools/__tests__/cnxml-render-golden.test.js
 * then review the fixture diff before committing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { renderTranslatedModule } from './helpers/render-normalize.js';

const GOLDEN_DIR = join(import.meta.dirname, 'fixtures', 'render-golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

// Curated real modules: reuse the cnxml-dom-comparison.test.js coverage set
// (PERFECT + problem modules across chapters, varied structure).
const GOLDEN_MODULES = [
  { chapter: 'ch01', moduleId: 'm68683' },
  { chapter: 'ch02', moduleId: 'm68684' },
  { chapter: 'ch03', moduleId: 'm68699' },
  { chapter: 'ch04', moduleId: 'm68710' },
  { chapter: 'ch05', moduleId: 'm68727' },
  { chapter: 'ch06', moduleId: 'm68733' },
  { chapter: 'ch07', moduleId: 'm68739' },
  { chapter: 'ch12', moduleId: 'm68789' },
];

describe('render golden baseline (byte-exact, MathJax-normalized)', () => {
  for (const { chapter, moduleId } of GOLDEN_MODULES) {
    it(`${moduleId} (${chapter}) matches committed golden`, () => {
      const html = renderTranslatedModule({ chapter, moduleId });
      const goldenPath = join(GOLDEN_DIR, chapter, `${moduleId}.html`);

      if (UPDATE) {
        mkdirSync(join(GOLDEN_DIR, chapter), { recursive: true });
        writeFileSync(goldenPath, html, 'utf8');
        return;
      }

      expect(existsSync(goldenPath), `missing golden: run UPDATE_GOLDEN=1 (${goldenPath})`).toBe(
        true
      );
      const golden = readFileSync(goldenPath, 'utf8');
      expect(html).toBe(golden);
    });
  }
});
