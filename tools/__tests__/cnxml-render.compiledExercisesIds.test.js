import { describe, it, expect } from 'vitest';
import { renderCompiledExercises, _loadBookConfigForTest } from '../cnxml-render.js';

const mod = (cls) => ({
  moduleId: 'm66440',
  sectionNumber: '11.1',
  sectionTitle: 'Prófkafli',
  exercisesContent:
    `<section class="${cls}" id="sec-${cls}"><title>T</title>` +
    `<exercise id="ex-${cls}"><problem id="pr-${cls}"><para id="pa-${cls}">x</para></problem></exercise></section>`,
});

describe('renderCompiledExercises wrapper ids (R5-4)', () => {
  it('multi-type module gets type-suffixed unique wrapper ids', () => {
    _loadBookConfigForTest('liffraedi-2e');
    const html = renderCompiledExercises(
      11,
      {
        'multiple-choice': [mod('multiple-choice')],
        'critical-thinking': [mod('critical-thinking')],
      },
      new Map(),
      {}
    );
    expect(html).toContain('id="exercises-m66440-multiple-choice"');
    expect(html).toContain('id="exercises-m66440-critical-thinking"');
    expect((html.match(/id="exercises-m66440"/g) || []).length).toBe(0); // no bare duplicate
  });
  it('single-type book keeps the legacy bare wrapper id (chemistry stability)', () => {
    _loadBookConfigForTest('efnafraedi-2e');
    const html = renderCompiledExercises(11, { exercises: [mod('exercises')] }, new Map(), {});
    expect((html.match(/id="exercises-m66440"/g) || []).length).toBe(1);
    expect(html).not.toContain('id="exercises-m66440-exercises"');
  });
});
