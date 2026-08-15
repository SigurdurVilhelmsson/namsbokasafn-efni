import { describe, it, expect } from 'vitest';
import { buildFigure, buildMedia } from '../cnxml-inject.js';
// NOTE: Task 7 (§C81) will widen this import to buildMediaElement as it adds tests to this
// file that use it. The brief's Step 1 imports all three at once; the LEAD ruling in
// progress.md split the three inject sites across separate commits (5 | 6 | 7), so importing
// names this task's tests don't use trips `no-unused-vars` (eslint.config.js sets
// `argsIgnorePattern` only, not `varsIgnorePattern` — an underscore prefix would not have
// silenced it either).

const getSeg = (id) => (id === 'm1:alt:fig-1-alt' ? 'Íslensk lýsing' : undefined);

describe('buildFigure alt (§C81)', () => {
  it('emits the translated alt for the new shape', () => {
    const out = buildFigure(
      {
        id: 'fig-1',
        media: {
          id: 'med-1',
          alt: { segmentId: 'm1:alt:fig-1-alt', text: 'English alt' },
          src: 'a.png',
        },
      },
      getSeg,
      '',
      null
    );
    expect(out).toContain('alt="Íslensk lýsing"');
    expect(out).not.toContain('[object Object]');
  });

  it('falls back to the English text when the segment is missing', () => {
    const out = buildFigure(
      {
        id: 'fig-1',
        media: { id: 'med-1', alt: { segmentId: 'nope', text: 'English alt' }, src: 'a.png' },
      },
      getSeg,
      '',
      null
    );
    expect(out).toContain('alt="English alt"');
  });

  // CONTROL: the legacy shape §C82 guarantees will coexist must be untouched
  it('emits a legacy string alt unchanged', () => {
    const out = buildFigure(
      { id: 'fig-1', media: { id: 'med-1', alt: 'Legacy English alt', src: 'a.png' } },
      getSeg,
      '',
      null
    );
    expect(out).toContain('alt="Legacy English alt"');
  });

  it('emits no alt attribute when there is no alt', () => {
    const out = buildFigure(
      { id: 'fig-1', media: { id: 'med-1', src: 'a.png' } },
      getSeg,
      '',
      null
    );
    expect(out).not.toContain('alt=');
  });
});

describe('buildMedia alt (§C81)', () => {
  const g = (id) => (id === 'm1:alt:med-9-alt' ? 'Íslensk staðalmynd' : undefined);

  it('emits the translated alt for the new shape', () => {
    const out = buildMedia(
      { id: 'med-9', alt: { segmentId: 'm1:alt:med-9-alt', text: 'English' }, src: 'c.png' },
      g
    );
    expect(out).toContain('alt="Íslensk staðalmynd"');
    expect(out).not.toContain('[object Object]');
  });

  // CONTROL: legacy string, and no getSeg supplied at all
  it('emits a legacy string alt unchanged even with no getSeg', () => {
    const out = buildMedia({ id: 'med-9', alt: 'Legacy alt', src: 'c.png' });
    expect(out).toContain('alt="Legacy alt"');
  });
});
