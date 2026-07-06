import { describe, it, expect } from 'vitest';
import { translateKeptContainerTables } from '../cnxml-inject.js';

const originalCnxml = `<table id="t1"><row><entry>Reactants</entry></row></table>`;
const node = { id: 't1', type: 'table', rows: [{ cells: [{ segmentId: 's:1' }] }] };
const ctx = { tableNodesById: { t1: node } };
const getSeg = (id) => (id === 's:1' ? 'Hvarfefni' : '');

describe('translateKeptContainerTables', () => {
  it('splices the translated table over the source block', () => {
    const result = `<example><table id="t1"><row><entry>Reactants</entry></row></table></example>`;
    const out = translateKeptContainerTables(
      result,
      new Set(['t1']),
      ctx,
      getSeg,
      originalCnxml,
      'mX'
    );
    expect(out).toContain('Hvarfefni');
    expect(out).not.toContain('Reactants');
    expect(out).toContain('<example>'); // surrounding structure preserved
  });

  it('returns result unchanged when the id set is empty', () => {
    const result = `<example>x</example>`;
    expect(translateKeptContainerTables(result, new Set(), ctx, getSeg, originalCnxml, 'mX')).toBe(
      result
    );
  });

  it('throws (fail loud) when the structure node is missing', () => {
    const result = `<example><table id="t9"></table></example>`;
    expect(() =>
      translateKeptContainerTables(result, new Set(['t9']), ctx, getSeg, originalCnxml, 'mX')
    ).toThrow(/t9/);
  });

  it('returns result unchanged (no throw) when ctx has no tableNodesById (isolated-builder context)', () => {
    const result = `<example><table id="t1"><row><entry>Reactants</entry></row></table></example>`;
    expect(
      translateKeptContainerTables(result, new Set(['t1']), {}, getSeg, originalCnxml, 'mX')
    ).toBe(result);
  });

  it('returns result unchanged (no throw) when ctx itself is undefined (isolated-builder context)', () => {
    const result = `<example><table id="t1"><row><entry>Reactants</entry></row></table></example>`;
    expect(
      translateKeptContainerTables(result, new Set(['t1']), undefined, getSeg, originalCnxml, 'mX')
    ).toBe(result);
  });

  it('throws (fail loud) when buildTable cannot find the table by id in originalCnxml (returns null)', () => {
    // result DOES contain the id-anchored block (so the later block-not-found check
    // would pass) — this isolates the buildTable-null throw, which runs first.
    const result = `<example><table id="t1"><row><entry>Reactants</entry></row></table></example>`;
    // originalCnxml lacks a table with id="t1" — buildTable's id-anchored regex
    // won't match, so it falls through to `return null`.
    const originalCnxmlMissingId = `<table id="t2"><row><entry>Reactants</entry></row></table>`;
    expect(() =>
      translateKeptContainerTables(
        result,
        new Set(['t1']),
        ctx,
        getSeg,
        originalCnxmlMissingId,
        'mX'
      )
    ).toThrow(/buildTable returned null.*t1|t1.*buildTable returned null/);
  });

  it('throws (fail loud) when the id-anchored source block is not found in result', () => {
    // originalCnxml DOES contain the id="t1" table, so buildTable succeeds and
    // returns a non-null translation — this isolates the block-not-found throw.
    const result = `<example>no table here</example>`;
    expect(() =>
      translateKeptContainerTables(result, new Set(['t1']), ctx, getSeg, originalCnxml, 'mX')
    ).toThrow(/source table block.*t1|t1.*not found/);
  });
});
