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
    expect(_getOsEmbedStatsForTest()).toEqual({ translated: 1, fallback: 0 });
  });

  it('falls back to EN loudly (counted) when no sidecar exists', () => {
    const html = render({ track: 'mt-preview' });
    expect(html).toContain('English stem');
    expect(_getOsEmbedStatsForTest()).toEqual({ translated: 0, fallback: 1 });
  });

  it('track isolation: a mt-preview sidecar does not leak into faithful renders', () => {
    const dir = path.join(bookDir, '03-translated', 'mt-preview', 'exercises');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '01-03-OC-P01.json'), JSON.stringify(IS_SIDECAR));
    const html = render({ track: 'faithful' });
    expect(html).toContain('English stem');
    expect(_getOsEmbedStatsForTest()).toEqual({ translated: 0, fallback: 1 });
  });

  // Regression (task review finding 1): the renderer module is cached for
  // the life of the server process, so RENDER_TRACK must reset on every
  // call, not just when options.track is truthy. Before the fix,
  // `if (options.track) RENDER_TRACK = options.track;` left RENDER_TRACK at
  // whatever the *previous* call set it to when a later call omitted
  // options.track — silently leaking one caller's track into another's
  // render. This writes only a mt-preview sidecar, renders once with an
  // explicit non-default track ('faithful', which falls back to EN since no
  // faithful sidecar exists) to poison RENDER_TRACK, then renders again
  // omitting track entirely and asserts it resolves as mt-preview — never
  // inheriting 'faithful' from the prior call.
  it("an omitted track on a later render resets to mt-preview, never inheriting a previous call's track", () => {
    const dir = path.join(bookDir, '03-translated', 'mt-preview', 'exercises');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '01-03-OC-P01.json'), JSON.stringify(IS_SIDECAR));

    // Poison RENDER_TRACK with an explicit non-default track.
    render({ track: 'faithful' });
    _resetOsEmbedStatsForTest();

    // Omits track entirely — must reset to the 'mt-preview' default, not
    // inherit 'faithful' from the previous call.
    const html = render({});
    expect(html).toContain('Íslensk spurning');
    expect(html).not.toContain('English stem');
    expect(_getOsEmbedStatsForTest()).toEqual({ translated: 1, fallback: 0 });
  });
});
