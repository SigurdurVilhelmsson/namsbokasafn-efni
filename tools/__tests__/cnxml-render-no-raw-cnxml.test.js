import { describe, it, expect } from 'vitest';
import { renderTranslatedModule } from './helpers/render-normalize.js';
import { findRawCnxmlLeaks } from '../cnxml-render-fidelity-check.js';

// m68727 (ch05) carried document-only <link document="m68865">…</link> refs
// before the arm-4b fix (10 in source; 3 render into this per-module page, the
// rest into chapter rollups via the same arm). A fresh render of the module page
// must now contain zero raw CNXML markup.
describe('fresh render of a formerly-leaking module has no raw CNXML', () => {
  it('m68727 renders leak-free', () => {
    const html = renderTranslatedModule({ chapter: 'ch05', moduleId: 'm68727' });
    expect(findRawCnxmlLeaks(html)).toEqual([]);
  });
});
