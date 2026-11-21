/**
 * §C248 + G1.11: server/public/js/marker-integrity.js — dialect classification, toolbar pairs, and the save-gate
 * marker rules (spec docs/superpowers/specs/2026-11-21-c248-g111-toolbar-dialect-and-marker-gate-design.md §4).
 *
 * The strings marked "chemistry's own" are copied from books/efnafraedi-2e/02-mt-output; they are the inputs the
 * rules must stay silent on.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mi = require('../public/js/marker-integrity');

describe('isBracketDialect (inject’s hasApiMarkers, verbatim)', () => {
  it('a segment with [[sub:]] is new-format', () => {
    expect(mi.isBracketDialect('H[[sub:2]]O')).toBe(true);
  });
  it('a segment with no marker is not', () => {
    expect(mi.isBracketDialect('Engin merki.')).toBe(false);
  });
  it('a segment with only legacy markup is not', () => {
    expect(mi.isBracketDialect('NO~3~^-^')).toBe(false);
  });
});

describe('hasLegacyMarkup (the forms that depend on the dialect)', () => {
  it('legacy sub/sup markup counts (chemistry’s own alt text)', () => {
    expect(mi.hasLegacyMarkup('NO~3~^-^')).toBe(true);
  });
  it('legacy bold counts', () => {
    expect(mi.hasLegacyMarkup('**feitt**')).toBe(true);
  });
  it('literal asterisks do not (chemistry’s own)', () => {
    expect(mi.hasLegacyMarkup('(σ, σ*, π, π*)')).toBe(false);
  });
  it('an "approximately" tilde does not (chemistry’s own)', () => {
    expect(mi.hasLegacyMarkup('~10[[sup:−3]]) úr móli og því ætti (~')).toBe(false);
  });
  it('legacy underline does not (inject converts it in both dialects)', () => {
    expect(mi.hasLegacyMarkup('++undirstrikað++')).toBe(false);
  });
});

describe('wrapFor (the toolbar writes the segment’s dialect)', () => {
  it('bold in a new-format segment is the bracket pair', () => {
    expect(mi.wrapFor('bold', 'H[[sub:2]]O')).toEqual({ open: '[[b:', close: ']]' });
  });
  it('bold in a plain segment is the bracket pair', () => {
    expect(mi.wrapFor('bold', 'Engin merki.')).toEqual({ open: '[[b:', close: ']]' });
  });
  it('bold in a legacy segment is the legacy pair', () => {
    expect(mi.wrapFor('bold', 'NO~3~^-^')).toEqual({ open: '**', close: '**' });
  });
  it('italic beside literal asterisks is the bracket pair (chemistry’s own)', () => {
    expect(mi.wrapFor('italic', '(σ, σ*, π, π*)')).toEqual({ open: '[[i:', close: ']]' });
  });
  it('all six kinds in a plain segment open with their bracket markers', () => {
    const kinds = ['bold', 'italic', 'term', 'underline', 'sub', 'sup'];
    expect(kinds.map((k) => mi.wrapFor(k, 'x').open)).toEqual([
      '[[b:',
      '[[i:',
      '[[term:',
      '[[u:',
      '[[sub:',
      '[[sup:',
    ]);
  });
  it('all six kinds in a legacy segment use the legacy markers', () => {
    const kinds = ['bold', 'italic', 'term', 'underline', 'sub', 'sup'];
    expect(kinds.map((k) => mi.wrapFor(k, 'NO~3~').open)).toEqual([
      '**',
      '*',
      '__',
      '++',
      '~',
      '^',
    ]);
  });
  it('an unknown kind throws', () => {
    expect(() => mi.wrapFor('strike', '')).toThrow(TypeError);
  });
});

describe('edgeSplit (edge spaces stay outside the pair)', () => {
  it('splits leading and trailing whitespace off', () => {
    expect(mi.edgeSplit('  orð ')).toEqual({ lead: '  ', core: 'orð', trail: ' ' });
  });
  it('an empty selection is all empty', () => {
    expect(mi.edgeSplit('')).toEqual({ lead: '', core: '', trail: '' });
  });
});
