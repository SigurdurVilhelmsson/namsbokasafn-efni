/**
 * `<dfn data-en="…">` — the attribute vefur's term matching will consume.
 *
 * SITE A is the ONLY live <dfn> emitter: the id-bearing branch of
 * processInlineContent (tools/lib/cnxml-elements.js). `renderTerm` in the same
 * file has ZERO callers and is deliberately not tested here — a test that
 * imported it would pass while asserting on unreachable code.
 *
 * ⚠️ The naive check for that is a trap: `grep -ran renderTerm tools/ server/`
 * returns two hits in server/views/my-work.html, but they are `renderTerms`,
 * PLURAL — an unrelated browser-side function. The control is that the same
 * search finds renderGlossary referenced from a test.
 *
 * The chapter key-terms page emits <dt>, not <dfn>, and is Task 4.
 */
import { describe, it, expect } from 'vitest';
import { processInlineContent } from '../lib/cnxml-elements.js';

const ctx = (termEnglish) => ({ termEnglish, terms: {}, equations: [], figures: [] });

describe('site A — the id-bearing <term> branch', () => {
  it('emits data-en when the id is in THIS module’s map', () => {
    const html = processInlineContent(
      'Eitt <term id="term-00002">mól</term> af efni',
      ctx({ 'term-00002': 'mole' })
    );
    expect(html).toContain('<dfn id="term-00002" class="term" data-en="mole">');
  });

  it('omits the attribute when the id is absent — degrade, never corrupt', () => {
    const html = processInlineContent(
      '<term id="term-00777">x</term>',
      ctx({ 'term-00002': 'mole' })
    );
    expect(html).not.toContain('data-en');
    expect(html).toContain('<dfn id="term-00777" class="term">');
  });

  it('omits it when the context carries no map at all — every pre-rollout chapter', () => {
    const html = processInlineContent('<term id="term-00002">mól</term>', ctx(null));
    expect(html).not.toContain('data-en');
    expect(html).toContain('<dfn id="term-00002" class="term">');
  });

  it('escapes a quote rather than breaking out of the attribute', () => {
    const html = processInlineContent('<term id="t1">x</term>', ctx({ t1: 'the "mole" concept' }));
    expect(html).not.toMatch(/data-en="the "mole"/);
    expect(html).toContain('&quot;');
  });

  it('🔴 the SAME id yields DIFFERENT English under different module maps', () => {
    // m00032 term-00001 = "functional group"; m00033 term-00001 = "alkanes".
    // This is what a chapter-flat merge would get wrong on 31 of 79 ch03 pairs —
    // a HIT with the wrong value, which no hits/total counter can see.
    const src = '<term id="term-00001">virknihópur</term>';
    expect(processInlineContent(src, ctx({ 'term-00001': 'functional group' }))).toContain(
      'data-en="functional group"'
    );
    expect(processInlineContent(src, ctx({ 'term-00001': 'alkanes' }))).toContain(
      'data-en="alkanes"'
    );
  });

  it('CONTROL — an empty map still yields a well-formed, id-bearing <dfn>', () => {
    // Must pass BEFORE the change too. If it fails, the emission shape moved and
    // every "unchanged output" claim downstream is void.
    expect(processInlineContent('<term id="t1">x</term>', ctx({}))).toBe(
      '<dfn id="t1" class="term">x</dfn>'
    );
  });
});
