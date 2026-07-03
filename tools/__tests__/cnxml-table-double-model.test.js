import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

const SRC = join(import.meta.dirname, '..', '..', 'books', 'efnafraedi-2e', '01-source');

const MODULES = [
  { moduleId: 'm68764', chapter: 'ch10' },
  { moduleId: 'm68770', chapter: 'ch10' },
  { moduleId: 'm68789', chapter: 'ch12' },
  { moduleId: 'm68791', chapter: 'ch12' },
  { moduleId: 'm68793', chapter: 'ch12' },
  { moduleId: 'm68829', chapter: 'ch18' },
];

function countTag(xml, tag) {
  return (xml.match(new RegExp(`<${tag}\\b`, 'g')) || []).length;
}

describe.each(MODULES)('F4 single-model build: $moduleId', ({ moduleId, chapter }) => {
  const source = readFileSync(join(SRC, chapter, `${moduleId}.cnxml`), 'utf8');
  const { segments, structure, equations, inlineAttrs } = extractSegments(source);
  // Round-trip segments through the on-disk markdown format so getSeg sees them
  // exactly as the CLI does.
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  // buildCnxml returns { cnxml, report } — verified against its signature and
  // the CLI's own call site in cnxml-inject.js (the brief's draft treated the
  // return value as a bare string; it isn't).
  const { cnxml: output } = buildCnxml(structure, parsed, equations, source, {}, inlineAttrs);

  it('produces no [[TABLE: residue', () => {
    expect(output).not.toContain('[[TABLE:');
  });

  it('emits the same number of <table> as the source (no duplication)', () => {
    expect(countTag(output, 'table')).toBe(countTag(source, 'table'));
  });
});
