// tools/__tests__/cnxml-inject-m68710-table-regression.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

// Build m68710 in memory from its COMMITTED inputs (no disk writes) and assert the
// Reactants/charge container table is translated to Icelandic (OC-B regression guard).
const B = join(import.meta.dirname, '..', '..', 'books', 'efnafraedi-2e');

describe('m68710 container-table translation (OC-B regression, in-memory)', () => {
  it('emits Icelandic table cells, not English source', () => {
    const structure = JSON.parse(
      readFileSync(join(B, '02-structure', 'ch04', 'm68710-structure.json'), 'utf8')
    );
    const equations = JSON.parse(
      readFileSync(join(B, '02-structure', 'ch04', 'm68710-equations.json'), 'utf8')
    );
    const segments = parseSegments(
      readFileSync(join(B, '02-mt-output', 'ch04', 'm68710-segments.is.md'), 'utf8')
    );
    const originalCnxml = readFileSync(join(B, '01-source', 'ch04', 'm68710.cnxml'), 'utf8');

    // inlineAttrs={} is fine: table cell text comes from segments, not inline attrs.
    const { cnxml } = buildCnxml(structure, segments, equations, originalCnxml, {}, {});

    expect(cnxml).toContain('<entry align="left">Hvarfefni</entry>');
    expect(cnxml).toContain('<entry align="left">Hleðsla</entry>');
    expect(cnxml).not.toContain('<entry align="left">Reactants</entry>');
    expect(cnxml).not.toContain('<entry align="left">charge</entry>');
  });
});
