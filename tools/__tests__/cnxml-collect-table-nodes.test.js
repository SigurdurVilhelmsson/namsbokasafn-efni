import { describe, it, expect } from 'vitest';
import { collectTableNodes } from '../cnxml-inject.js';

describe('collectTableNodes', () => {
  it('maps table ids to their structure nodes, including nested ones', () => {
    const structure = [
      {
        type: 'section',
        id: 's1',
        content: [
          { type: 'para', id: 'p1' },
          { type: 'table', id: 't-top', rows: [{ cells: [{ segmentId: 'seg:a' }] }] },
          {
            type: 'example',
            id: 'ex1',
            content: [
              { type: 'table', id: 't-nested', rows: [{ cells: [{ segmentId: 'seg:b' }] }] },
            ],
          },
        ],
      },
    ];
    const map = {};
    collectTableNodes(structure, map);
    expect(Object.keys(map).sort()).toEqual(['t-nested', 't-top']);
    expect(map['t-top'].rows[0].cells[0].segmentId).toBe('seg:a');
  });
});
