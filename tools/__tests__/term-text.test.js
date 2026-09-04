/**
 * term-text.js — the shared, case-preserving half of the old
 * stripTermMarkersToText, plus a depth-aware [[term:…]] scanner.
 *
 * 🔴 The nesting cases below are not hypothetical. `TERM_TEXT` in
 * cnxml-inject.js tolerates ONE level of nested markers while the corpus has
 * TWO, and a truncated match put a literal `[[term:` into published CNXML
 * (register ⑰). A `[^\]]*` character class cannot find the end of a nested
 * marker; only depth counting can.
 *
 * 🔴 THE SECOND describe BLOCK IS A CHARACTERIZATION GUARD, NOT A NEW FEATURE,
 * AND IT EXISTS BECAUSE THE PLAN'S PROPOSED REWIRE WAS MEASURED TO BREAK IT.
 * `stripTermMarkersToText` lowercases its text and then substitutes MathML —
 * in that ORDER — so MathML-derived text escapes the fold. Routing it through
 * a lib that substitutes MathML first folds the symbols too. Measured over the
 * real corpus with the real per-module equations maps: 6 inputs diverge (1 of
 * 1,406 [[term:]] bodies, 5 of 763 glossary-term segments) and every one
 * destroys a chemistry symbol — ΔHf° → δhf°, ΔGf° → δgf°, Ecell° → ecell°.
 * Δ and δ are different symbols in chemistry, and both call sites WRITE this
 * value into the output CNXML as "(e. …)", so the corruption reaches readers.
 * No test in the repo covered it.
 */
import { describe, it, expect } from 'vitest';
import {
  flattenMarkersToText,
  scanTermMarkers,
  stripInlineMarkers,
  resolveMathPlaceholders,
} from '../lib/term-text.js';
import { stripTermMarkersToText } from '../cnxml-inject.js';

describe('flattenMarkersToText', () => {
  it('strips inline markers and PRESERVES case', () => {
    expect(flattenMarkersToText('Avogadro’s number ([[i:N[[sub:A]]]])', {})).toBe(
      'Avogadro’s number (NA)'
    );
  });

  it('leaves plain text untouched', () => {
    expect(flattenMarkersToText('formula mass', {})).toBe('formula mass');
  });

  it('unwraps an id-anchored marker to its display text', () => {
    expect(flattenMarkersToText('[[term:mole|term-00002]]', {})).toBe('mole');
  });

  it('resolves a MATH placeholder from the equations map', () => {
    const eq = { 'math-1': { mathml: '<m:mi>x</m:mi>' } };
    expect(flattenMarkersToText('value [[MATH:1]]', eq)).toBe('value x');
  });

  it('drops an unresolvable MATH placeholder rather than emitting the marker', () => {
    expect(flattenMarkersToText('value [[MATH:9]]', {})).toBe('value');
  });

  it('preserves MathML case, because data-en is a display value', () => {
    const eq = { 'math-1': { mathml: '<m:mi>ΔHf°</m:mi>' } };
    expect(flattenMarkersToText('standard enthalpy of formation [[MATH:1]]', eq)).toBe(
      'standard enthalpy of formation ΔHf°'
    );
  });

  it('normalises whitespace, because an attribute value may not carry newlines', () => {
    expect(flattenMarkersToText('\n a  b \n', {})).toBe('a b');
  });
});

describe('scanTermMarkers — depth aware', () => {
  it('finds a flat marker with its id', () => {
    expect(scanTermMarkers('a [[term:mole|term-00002]] b')).toEqual([
      { body: 'mole', id: 'term-00002' },
    ]);
  });

  it('🔴 finds a TWO-level nested marker without truncating — the ⑰ case', () => {
    expect(
      scanTermMarkers('as [[term:Avogadro’s number ([[i:N[[sub:A]]]])|term-00003]] or')
    ).toEqual([{ body: 'Avogadro’s number ([[i:N[[sub:A]]]])', id: 'term-00003' }]);
  });

  it('finds several markers in one segment', () => {
    const got = scanTermMarkers('[[term:mole|term-1]] and [[term:mass|term-2]]');
    expect(got.map((m) => m.id)).toEqual(['term-1', 'term-2']);
  });

  it('reports id null when the marker carries none', () => {
    expect(scanTermMarkers('[[term:mole]]')).toEqual([{ body: 'mole', id: null }]);
  });

  it('ignores non-term markers', () => {
    expect(scanTermMarkers('[[i:x]] [[sub:2]]')).toEqual([]);
  });

  it('🔴 does not mistake a NESTED marker’s pipe for the id separator', () => {
    // [[span:text|class]] is real in the organic corpus (register §C118 ①).
    // A lastIndexOf('|') split would return id "red-text" and truncate the body.
    expect(scanTermMarkers('[[term:see [[span:X|red-text]]]]')).toEqual([
      { body: 'see [[span:X|red-text]]', id: null },
    ]);
  });

  it('splits on the TOP-LEVEL pipe when a nested marker also has one', () => {
    expect(scanTermMarkers('[[term:see [[span:X|red-text]]|term-00009]]')).toEqual([
      { body: 'see [[span:X|red-text]]', id: 'term-00009' },
    ]);
  });

  it('CONTROL — a naive [^\\]]* regex truncates where the scanner does not', () => {
    const s = '[[term:Avogadro’s number ([[i:N[[sub:A]]]])|term-00003]]';
    const naive = /\[\[term:([^\]]*)\|([^\]]*)\]\]/.exec(s);
    expect(naive).toBeNull(); // the regex cannot match it at all
    expect(scanTermMarkers(s)[0].id).toBe('term-00003');
  });
});

describe('stripTermMarkersToText — the two live callers must not change', () => {
  // Both call sites WRITE this value into output CNXML as "(e. <value>)".
  // These pin the behaviour the rewire must reproduce exactly.

  it('🔴 keeps MathML-derived symbols UNFOLDED while lowercasing the prose', () => {
    const eq = { 'math-1': { mathml: '<m:mi>ΔHf°</m:mi>' } };
    expect(stripTermMarkersToText('Standard Enthalpy Of Formation [[MATH:1]]', eq)).toBe(
      'standard enthalpy of formation ΔHf°'
    );
  });

  it('🔴 keeps Eker° unfolded — the glossary-term shape, site B', () => {
    // "Eker°" and not "Ecell°": applyMathLabelSubstitution runs BEFORE this, so
    // the value that actually ships is the Icelandic label. It is in published
    // output today — 05-publication/mt-preview/chapters/17/17-key-terms.html.
    const eq = { 'math-1': { mathml: '<m:mi>Eker°</m:mi>' } };
    expect(stripTermMarkersToText('standard cell potential ([[MATH:1]])', eq, { trim: true })).toBe(
      'standard cell potential (Eker°)'
    );
  });

  it('does NOT trim when trim is false — site A depends on this', () => {
    expect(stripTermMarkersToText('  Padded  ', {})).toBe('  padded  ');
  });

  it('does NOT collapse internal whitespace', () => {
    expect(stripTermMarkersToText('a  b', {})).toBe('a  b');
  });

  it('trims when asked — site B passes trim: true', () => {
    expect(stripTermMarkersToText('  Padded  ', {}, { trim: true })).toBe('padded');
  });

  it('CONTROL — ordinary prose IS folded, so the guards above are not vacuous', () => {
    expect(stripTermMarkersToText('ABC', {})).toBe('abc');
  });
});

describe('the primitives the wrapper composes', () => {
  it('stripInlineMarkers leaves MATH placeholders in place for the caller to resolve', () => {
    expect(stripInlineMarkers('Avogadro ([[i:N]]) [[MATH:4]]')).toBe('Avogadro (N) [[MATH:4]]');
  });

  it('resolveMathPlaceholders substitutes without touching case', () => {
    const eq = { 'math-4': { mathml: '<m:mi>ΔG</m:mi>' } };
    expect(resolveMathPlaceholders('x [[MATH:4]]', eq)).toBe('x ΔG');
  });

  it('resolveMathPlaceholders also matches the lowercased marker the wrapper produces', () => {
    const eq = { 'math-4': { mathml: '<m:mi>ΔG</m:mi>' } };
    expect(resolveMathPlaceholders('x [[math:4]]', eq)).toBe('x ΔG');
  });
});
