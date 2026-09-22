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

// §C126 #3 — the RENDERED column for exercise <img> alts. A prose `toContain`
// cannot see an alt (§C179: the same words occur elsewhere on a page), so each
// alt gets a WHOLE-VALUE sentinel and is read back at the <img> keyed by its
// own src. 01-04-OC-P04 is public and has one image in the stem and one in the
// solution, with distinct srcs — so a write landing on the wrong image fails.
describe('assemble → render seam — exercise <img> alts (§C126 #3)', () => {
  const P04 = '01-04-OC-P04';
  const STEM_SRC = 'OChem_01_04_006.jpg';
  const SOL_SRC = 'OChem_01_EC_202.jpg';
  const EN_STEM_ALT =
    'The ball and stick model of ethane where grey and black spheres represent hydrogen and carbon, respectively.';
  const EN_SOL_ALT = 'The wedge-dash structure of ethane.';
  // Carries `"` and `&`: 0 corpus alts do, so the renderer has never been
  // handed an entity-bearing sidecar attribute before.
  const STEM_SENTINEL = 'ZQXSTEM "líkan" & etan';
  const SOL_SENTINEL = 'ZQXSOL fleygstrikabygging';

  /** Raw alt value of every rendered <img>, keyed by its src's basename. */
  function altsBySrc(html) {
    const out = {};
    for (const m of html.matchAll(/<img\b(?:"[^"]*"|'[^']*'|[^>'"])*>/g)) {
      const src = /\ssrc="([^"]*)"/.exec(m[0]);
      const alt = /\salt="([^"]*)"/.exec(m[0]);
      if (src) out[src[1].split('/').pop()] = alt ? alt[1] : null;
    }
    return out;
  }

  /** extract → IS (runs pseudo-translated, alts via `alts`) → assemble → render. */
  function renderWithAlts(alts) {
    _loadBookConfigForTest('lifraen-efnafraedi');
    const bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-seam-alt-'));
    const exDir = path.join(bookDir, '01-source', 'exercises');
    fs.mkdirSync(exDir, { recursive: true });
    fs.copyFileSync(path.join(FIXTURES, `${P04}.json`), path.join(exDir, `${P04}.json`));
    extractBook(bookDir, {});
    const en = fs.readFileSync(
      path.join(bookDir, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
      'utf8'
    );
    const blocks = en.split('\n\n').filter((b) => b.trim());
    const is = blocks
      .map((b) => {
        const [marker, text] = b.split('\n');
        const id = /SEG:(\S+) -->/.exec(marker)[1];
        if (!id.includes(':alt:'))
          return `${marker}\n${text.startsWith('[[MEDIA') ? text : `ÞÝТ ${text}`}`;
        return id in alts ? `${marker}\n${alts[id]}` : null; // absent key = no IS segment
      })
      .filter(Boolean)
      .join('\n\n');
    const outDir = path.join(bookDir, '02-mt-output', 'ch01');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'exercises-segments.is.md'), is + '\n', 'utf8');
    const asm = assembleBook(bookDir, { track: 'mt-preview' });
    expect(asm.skipped).toEqual([]);

    const doc =
      '<document xmlns="http://cnx.rice.edu/cnxml"><title>T</title><content>' +
      '<section class="section-exercises" id="s1"><title>Æfingar</title>' +
      '<exercise id="e1"><problem id="p1"><para id="pp1">' +
      `<link class="os-embed" url="#exercise/${P04}"/></para></problem></exercise>` +
      '</section></content></document>';
    _setBooksDirForTest(bookDir);
    _resetOsEmbedStatsForTest();
    try {
      const { html } = renderCnxmlToHtml(doc, {
        lang: 'is',
        chapter: 1,
        moduleId: 'mTEST',
        moduleSections: {},
        track: 'mt-preview',
      });
      expect(_getOsEmbedStatsForTest()).toEqual({ translated: 1, fallback: 0, staleSidecar: 0 });
      return { html, asm };
    } finally {
      _setBooksDirForTest(null);
    }
  }

  it('each translated alt reaches the rendered page as the WHOLE value, at its own image', () => {
    const { html } = renderWithAlts({
      [`${P04}:alt:stem-357566-m0`]: STEM_SENTINEL,
      [`${P04}:alt:sol-357566-m0`]: SOL_SENTINEL,
    });
    expect(altsBySrc(html)).toEqual({
      [STEM_SRC]: 'ZQXSTEM &quot;líkan&quot; &amp; etan', // escaped once — never &amp;quot;
      [SOL_SRC]: SOL_SENTINEL,
    });
  });

  it('control: with no IS alt segments the SAME instrument reads the English alts', () => {
    // Without this, a harness that could not see an alt at all would pass the
    // test above no better than it fails this one.
    const { html, asm } = renderWithAlts({});
    expect(altsBySrc(html)).toEqual({ [STEM_SRC]: EN_STEM_ALT, [SOL_SRC]: EN_SOL_ALT });
    expect(asm.altFallbacks.map((f) => f.reason)).toEqual(['missing', 'missing']);
  });
});
