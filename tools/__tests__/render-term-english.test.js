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
import { renderCompiledGlossary } from '../cnxml-render.js';

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

/**
 * SITE C — the chapter key-terms page. It emits `<dt>`, NOT `<dfn>`.
 *
 * 🔴 This is where the glossary population actually lands. The old plan aimed at
 * an "id-less <dfn> branch" that annotates 0 of the 763 in-definition terms:
 * extractChapterGlossary strips the <term> tag before processInlineContent ever
 * sees it. Measured on a published page: 2 `<dt id="fs-id…">`, 0 `<dfn>`.
 *
 * ⚠️ CROSS-REPO, RECORDED NOT DECIDED: vefur's glossaryTerms.ts walks
 * `dfn.term`, so a `<dt data-en>` is invisible to the consumer that exists
 * today. Emitting it is additive and reader-invisible, so it ships — but
 * retiring annotateInlineTerms stays BLOCKED until either vefur widens its
 * walker or the <dt> wraps its term in a <dfn>. See Task 7's handover doc.
 */
describe('site C — the chapter key-terms page (<dt>, not <dfn>)', () => {
  const defs = [
    {
      id: 'fs-idp40905984',
      term: 'formúlumassi',
      termContent: 'formúlumassi',
      meaningContent: 'skilgreining',
      moduleId: 'm68700',
    },
  ];
  const gctx = (byModule) => ({
    termEnglishByModule: byModule,
    terms: {},
    figures: {},
    tables: {},
    examples: {},
    footnotes: [],
  });

  it('emits data-en on the <dt>, keyed on (def.moduleId, def.id)', () => {
    const byModule = new Map([['m68700', { 'fs-idp40905984': 'formula mass' }]]);
    const html = renderCompiledGlossary(3, defs, gctx(byModule));
    expect(html).toContain('<dt id="fs-idp40905984" data-en="formula mass">');
  });

  it('🔴 keys on the DEFINITION’S module, not on any chapter-flat merge', () => {
    // Same definition id, two modules, two Englishes. A flat merge cannot tell
    // them apart; this asserts the code reads def.moduleId.
    const byModule = new Map([
      ['m68700', { 'fs-idp40905984': 'formula mass' }],
      ['m68703', { 'fs-idp40905984': 'WRONG — other module' }],
    ]);
    expect(renderCompiledGlossary(3, defs, gctx(byModule))).toContain('data-en="formula mass"');
  });

  it('omits the attribute when that module’s map lacks the id', () => {
    const byModule = new Map([['m68700', { 'fs-idOTHER': 'x' }]]);
    const html = renderCompiledGlossary(3, defs, gctx(byModule));
    expect(html).not.toContain('data-en');
    expect(html).toContain('<dt id="fs-idp40905984">');
  });

  it('omits it when there is no map at all — every pre-rollout chapter', () => {
    const html = renderCompiledGlossary(3, defs, gctx(undefined));
    expect(html).not.toContain('data-en');
    expect(html).toContain('<dt id="fs-idp40905984">');
  });

  it('🔴 CONTROL — this page emits NO <dfn>, so a future refactor routing it through the <dfn> path is caught here', () => {
    const byModule = new Map([['m68700', { 'fs-idp40905984': 'formula mass' }]]);
    const html = renderCompiledGlossary(3, defs, gctx(byModule));
    expect(html).not.toContain('<dfn');
    expect(html).toContain('<dl>');
  });
});
