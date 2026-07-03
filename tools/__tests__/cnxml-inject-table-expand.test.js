import { describe, it, expect } from 'vitest';
import { buildExerciseDom } from '../cnxml-inject.js';

// Original CNXML the builder re-parses (table lives inside the problem para).
const ORIGINAL = `<exercise id="ex1"><problem id="pr1"><para id="pp1">See data:<newline/><table id="t1" class="unnumbered" summary="s"><tgroup cols="2"><tbody><row><entry>a</entry><entry>b</entry></row></tbody></tgroup></table></para><para id="pp2">Find the rate.</para></problem></exercise>`;

// Structure element as extraction (post-F4) produces it: para segment carries the [[TABLE:]] ref.
const element = {
  type: 'exercise',
  id: 'ex1',
  problem: {
    content: [
      { type: 'para', id: 'pp1', segmentId: 'seg-pp1' },
      { type: 'para', id: 'pp2', segmentId: 'seg-pp2' },
    ],
  },
  solution: null,
};

const segs = {
  'seg-pp1': 'Sjá gögn:[[TABLE:t1]]',
  'seg-pp2': 'Finndu hraðann.',
  'seg-cell-a': 'a-is',
  'seg-cell-b': 'b-is',
};
const getSeg = (id) => segs[id] || '';

const ctx = {
  figuresHandledInContainers: new Set(),
  figuresHandledInNotes: new Set(),
  inlineTables: [
    {
      tableId: 't1',
      structure: {
        type: 'table',
        id: 't1',
        class: 'unnumbered',
        summary: 's',
        rows: [
          {
            cells: [{ segmentId: 'seg-cell-a' }, { segmentId: 'seg-cell-b' }],
          },
        ],
      },
    },
  ],
};

describe('buildExerciseDom expands [[TABLE:]] inline and keeps exactly one table', () => {
  const out = buildExerciseDom(element, getSeg, {}, ORIGINAL, ctx);

  it('leaves no [[TABLE: residue', () => {
    expect(out).not.toContain('[[TABLE:');
  });

  it('renders exactly one <table id="t1">', () => {
    const count = (out.match(/<table\b[^>]*\bid="t1"/g) || []).length;
    expect(count).toBe(1);
  });

  it('places the table inside the problem para pp1', () => {
    // the table must appear within pp1's replaced content, before pp2
    expect(out.indexOf('<table')).toBeGreaterThan(out.indexOf('id="pp1"'));
    expect(out.indexOf('<table')).toBeLessThan(out.indexOf('id="pp2"'));
  });
});
