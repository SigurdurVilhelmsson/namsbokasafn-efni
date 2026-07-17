/**
 * cnxml-elements-appendix-fragment.test.js — item 10 (#20): a
 * document=<appendix>+target-id link keeps its fragment. The no-owner A1
 * branch's fragment drop is a DOCUMENTED decision and stays (pinned here).
 */

import { describe, it, expect } from 'vitest';
import { resolveCrossModuleHref } from '../lib/cnxml-elements.js';

const ctx = {
  moduleId: 'm1',
  bookSlug: 'liffraedi-2e',
  appendixModuleLetters: new Map([['m9001', 'B']]),
  appendixIdMap: new Map([['deep-id', { letter: 'C' }]]),
};

describe('#20 — documentId-keyed appendix branch', () => {
  it('appends #targetId when present', () => {
    const r = resolveCrossModuleHref('m9001', 'tbl-5', ctx);
    expect(r.href).toBe('/liffraedi-2e/vidauki/B#tbl-5');
  });
  it('no fragment when target-id absent (today’s document-only shape)', () => {
    const r = resolveCrossModuleHref('m9001', null, ctx);
    expect(r.href).toBe('/liffraedi-2e/vidauki/B');
  });
});

describe('A1 no-owner branch — fragment drop is deliberate (pin)', () => {
  it('still drops the fragment (documented A1 decision)', () => {
    const r = resolveCrossModuleHref(null, 'deep-id', ctx);
    expect(r.href).toBe('/liffraedi-2e/vidauki/C');
  });
});
