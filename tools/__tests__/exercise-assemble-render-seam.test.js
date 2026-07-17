/**
 * exercise-assemble-render-seam.test.js — item 9 (D3, final review I3): pins
 * the assemble-output ↔ resolveOsEmbed contract with REAL artifacts. Runs a
 * real extract → pseudo-translate → assemble pipeline, then renders a DOC
 * that os-embeds the resulting nickname and asserts the render picked up the
 * assembled sidecar (translated, not EN fallback) — the two halves of the
 * D3 pipeline (assemble writes the on-disk shape, resolveOsEmbed reads it)
 * are exercised together here, not just unit-tested in isolation.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { extractBook } from '../exercise-extract.js';
import { assembleBook } from '../exercise-assemble.js';
import {
  renderCnxmlToHtml,
  _loadBookConfigForTest,
  _setBooksDirForTest,
  _getOsEmbedStatsForTest,
  _resetOsEmbedStatsForTest,
} from '../cnxml-render.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'exercises');
const NICKNAME = '01-03-OC-P01';

// Mirrors cnxml-render-osembed-track.test.js's DOC shape: lifraen-efnafraedi
// is the book that actually ships os-embed exercises inline (its
// book-config.json sets sectionExercises:'both', which keeps
// 'section-exercises' out of excludedSectionClasses).
const DOC =
  '<document xmlns="http://cnx.rice.edu/cnxml"><title>T</title><content>' +
  '<section class="section-exercises" id="s1"><title>Æfingar</title>' +
  '<exercise id="e1"><problem id="p1"><para id="pp1">' +
  `<link class="os-embed" url="#exercise/${NICKNAME}"/></para></problem></exercise>` +
  '</section></content></document>';

describe('assemble → render seam (I3)', () => {
  it('a real assembled sidecar renders as translated, not EN fallback', () => {
    _loadBookConfigForTest('lifraen-efnafraedi');

    const bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-seam-'));
    const exDir = path.join(bookDir, '01-source', 'exercises');
    fs.mkdirSync(exDir, { recursive: true });
    fs.copyFileSync(path.join(FIXTURES, `${NICKNAME}.json`), path.join(exDir, `${NICKNAME}.json`));

    extractBook(bookDir, {});

    const en = fs.readFileSync(
      path.join(bookDir, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
      'utf8'
    );
    // Pseudo-translate: prefix every non-marker, non-blank line — clearly
    // different text (defeats the residue exact-match) while preserving
    // markers. Same recipe as exercise-assemble.test.js's makeBook().
    const is = en
      .split('\n')
      .map((l) => (l.startsWith('<!-- SEG:') || l.trim() === '' ? l : `ÞÝТ ${l}`))
      .join('\n');
    const outDir = path.join(bookDir, '02-mt-output', 'ch01');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'exercises-segments.is.md'), is, 'utf8');

    const asm = assembleBook(bookDir, { track: 'mt-preview' });
    expect(asm.skipped).toEqual([]);
    expect(asm.written.length).toBe(1);

    _setBooksDirForTest(bookDir);
    _resetOsEmbedStatsForTest();
    try {
      const { html } = renderCnxmlToHtml(DOC, {
        lang: 'is',
        chapter: 1,
        moduleId: 'mTEST',
        moduleSections: {},
        track: 'mt-preview',
      });
      expect(html).toContain('ÞÝТ');
      expect(_getOsEmbedStatsForTest()).toEqual({ translated: 1, fallback: 0, staleSidecar: 0 });
    } finally {
      _setBooksDirForTest(null);
    }
  });
});
