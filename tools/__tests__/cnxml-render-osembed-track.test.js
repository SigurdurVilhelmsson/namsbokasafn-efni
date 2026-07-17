/**
 * cnxml-render-osembed-track.test.js — item 9 (D3): resolveOsEmbed prefers the
 * translated sidecar for the active track and falls back to EN loudly
 * (counted, never gating). Uses a temp book dir via _setBooksDirForTest.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  renderCnxmlToHtml,
  _loadBookConfigForTest,
  _setBooksDirForTest,
  _getOsEmbedStatsForTest,
  _resetOsEmbedStatsForTest,
} from '../cnxml-render.js';

// lifraen-efnafraedi (organic chemistry) is the book that actually ships
// os-embed exercises: its book-config.json sets `sectionExercises: 'both'`,
// which drops 'section-exercises' from excludedSectionClasses so the section
// renders inline instead of being routed to the end-of-chapter compilation
// pass. efnafraedi-2e's excludedSectionClasses includes the bare 'exercises'
// class, which substring-matches 'section-exercises' too (EXCLUDED_SECTION_CLASSES.some(cls
// => sectionClass.includes(cls))) and would exclude this fixture's section
// from renderContent entirely — resolveOsEmbed is book-agnostic, but which
// book's render config is loaded is not.
_loadBookConfigForTest('lifraen-efnafraedi');

const EN_EXERCISE = {
  uid: '1@1',
  nickname: '01-03-OC-P01',
  solutions_are_public: true,
  stimulus_html: 'English stimulus',
  questions: [
    {
      id: '9',
      stem_html: 'English stem',
      collaborator_solutions: [{ content_html: 'English solution' }],
    },
  ],
};
const IS_SIDECAR = {
  nickname: '01-03-OC-P01',
  source_uid: '1@1',
  generated_by: 'exercise-assemble.js',
  track: 'mt-preview',
  solutions_are_public: true,
  stimulus_html: 'Íslenskt áreiti',
  questions: [
    {
      id: '9',
      stem_html: 'Íslensk spurning',
      collaborator_solutions: [{ content_html: 'Íslensk lausn' }],
    },
  ],
};
const FAITHFUL_SIDECAR = {
  nickname: '01-03-OC-P01',
  source_uid: '1@1',
  generated_by: 'exercise-assemble.js',
  track: 'faithful',
  solutions_are_public: true,
  stimulus_html: 'Trútt íslenskt áreiti',
  questions: [
    {
      id: '9',
      stem_html: 'Trútt íslensk spurning',
      collaborator_solutions: [{ content_html: 'Trútt íslensk lausn' }],
    },
  ],
};
// source_uid deliberately mismatches EN_EXERCISE.uid ('1@1') — simulates the
// EN cache having been re-fetched/re-numbered since this sidecar was
// assembled (final review I2): the sidecar's translated text no longer
// corresponds to the current source exercise.
const STALE_SIDECAR = {
  nickname: '01-03-OC-P01',
  source_uid: '2@1',
  generated_by: 'exercise-assemble.js',
  track: 'mt-preview',
  solutions_are_public: true,
  stimulus_html: 'Úrelt íslenskt áreiti',
  questions: [
    {
      id: '9',
      stem_html: 'Úrelt íslensk spurning',
      collaborator_solutions: [{ content_html: 'Úrelt íslensk lausn' }],
    },
  ],
};

const DOC =
  '<document xmlns="http://cnx.rice.edu/cnxml"><title>T</title><content>' +
  '<section class="section-exercises" id="s1"><title>Æfingar</title>' +
  '<exercise id="e1"><problem id="p1"><para id="pp1">' +
  '<link class="os-embed" url="#exercise/01-03-OC-P01"/></para></problem></exercise>' +
  '</section></content></document>';

let bookDir;
beforeEach(() => {
  bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osembed-'));
  const src = path.join(bookDir, '01-source', 'exercises');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, '01-03-OC-P01.json'), JSON.stringify(EN_EXERCISE));
  _setBooksDirForTest(bookDir);
  _resetOsEmbedStatsForTest();
});
afterEach(() => _setBooksDirForTest(null));

function render(opts = {}) {
  return renderCnxmlToHtml(DOC, {
    lang: 'is',
    chapter: 1,
    moduleId: 'mTEST',
    moduleSections: {},
    ...opts,
  }).html;
}

describe('resolveOsEmbed track preference', () => {
  it('renders the translated sidecar when present for the track', () => {
    const dir = path.join(bookDir, '03-translated', 'mt-preview', 'exercises');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '01-03-OC-P01.json'), JSON.stringify(IS_SIDECAR));
    const html = render({ track: 'mt-preview' });
    expect(html).toContain('Íslensk spurning');
    expect(html).not.toContain('English stem');
    expect(_getOsEmbedStatsForTest()).toEqual({ translated: 1, fallback: 0, staleSidecar: 0 });
  });

  it('falls back to EN loudly (counted) when no sidecar exists', () => {
    const html = render({ track: 'mt-preview' });
    expect(html).toContain('English stem');
    expect(_getOsEmbedStatsForTest()).toEqual({ translated: 0, fallback: 1, staleSidecar: 0 });
  });

  it('track isolation: a mt-preview sidecar does not leak into faithful renders', () => {
    const dir = path.join(bookDir, '03-translated', 'mt-preview', 'exercises');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '01-03-OC-P01.json'), JSON.stringify(IS_SIDECAR));
    const html = render({ track: 'faithful' });
    expect(html).toContain('English stem');
    expect(_getOsEmbedStatsForTest()).toEqual({ translated: 0, fallback: 1, staleSidecar: 0 });
  });

  // Regression (re-review, fix wave 2): RENDER_TRACK is a DELIBERATELY
  // sticky module global — `if (options.track) RENDER_TRACK = options.track;`
  // only reassigns it when a caller provides options.track, and leaves it
  // alone otherwise. This is load-bearing for the CLI: main() sets
  // RENDER_TRACK once from args.track at the top of a run, and its six
  // internal renderCnxmlToHtml call sites (per-module, end-of-chapter,
  // summary, compiled exercises ×2, answer key) all omit options.track —
  // they rely on that one CLI-set value persisting across the whole run.
  // An earlier fix wave changed this to an *unconditional* reset
  // (`RENDER_TRACK = options.track || 'mt-preview'`), which broke exactly
  // that: the first internal call with no options.track stamped the global
  // back to 'mt-preview', silently defeating `--track faithful`. Reverted.
  // This test writes only a faithful sidecar, renders once with an explicit
  // track:'faithful' to set RENDER_TRACK, then renders again *omitting*
  // track and asserts it still resolves via the faithful sidecar — i.e.
  // the global is inherited, not reset. Any NEW in-process entry point
  // (not main()'s CLI run) MUST pass options.track on every call instead of
  // relying on this stickiness — enforced for the server's renderModule()
  // by server/__tests__/renderService.test.js's track-forwarding test.
  it("an omitted track on a later render inherits the previous call's track (RENDER_TRACK is a sticky module global by design)", () => {
    const dir = path.join(bookDir, '03-translated', 'faithful', 'exercises');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '01-03-OC-P01.json'), JSON.stringify(FAITHFUL_SIDECAR));

    // Sets RENDER_TRACK to 'faithful' explicitly.
    render({ track: 'faithful' });
    _resetOsEmbedStatsForTest();

    // Omits track entirely on this call — must inherit 'faithful' from the
    // previous call, not reset to the 'mt-preview' default.
    const html = render({});
    expect(html).toContain('Trútt íslensk spurning');
    expect(html).not.toContain('English stem');
    expect(_getOsEmbedStatsForTest()).toEqual({ translated: 1, fallback: 0, staleSidecar: 0 });
  });

  // Final review I2: a sidecar's source_uid pins it to the EN exercise it
  // was assembled from. If the EN cache has since moved on (re-fetch,
  // renumbering) the sidecar's translated text no longer corresponds to the
  // current source — rendering it would silently show mistranslated content
  // for a DIFFERENT exercise. Detected and counted, never gating (falls
  // back to EN, same as a missing sidecar).
  it('stale sidecar (source_uid mismatches the current EN cache) → EN rendered, counted, never gating', () => {
    const dir = path.join(bookDir, '03-translated', 'mt-preview', 'exercises');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '01-03-OC-P01.json'), JSON.stringify(STALE_SIDECAR));
    const html = render({ track: 'mt-preview' });
    expect(html).toContain('English stem');
    expect(html).not.toContain('Úrelt íslensk spurning');
    expect(_getOsEmbedStatsForTest()).toEqual({ translated: 0, fallback: 0, staleSidecar: 1 });
  });

  it('matching source_uid → translated sidecar used as before, staleSidecar:0', () => {
    const dir = path.join(bookDir, '03-translated', 'mt-preview', 'exercises');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '01-03-OC-P01.json'), JSON.stringify(IS_SIDECAR));
    const html = render({ track: 'mt-preview' });
    expect(html).toContain('Íslensk spurning');
    expect(_getOsEmbedStatsForTest()).toEqual({ translated: 1, fallback: 0, staleSidecar: 0 });
  });
});
