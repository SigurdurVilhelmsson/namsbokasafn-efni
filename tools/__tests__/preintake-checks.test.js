import { describe, it, expect } from 'vitest';
import { runFileChecks, evaluateBook } from '../lib/preintake-checks.js';

const baseAgg = () => ({
  osEmbed: 0,
  iframe: 0,
  anyTerm: false,
  anyGlossary: false,
  noteClasses: new Set(),
  unrecognizedInline: new Map(),
});

describe('runFileChecks — regex checks', () => {
  it('counts os-embed exercise links', () => {
    const cnxml = '<document><link class="os-embed" url="#exercise/11-06"/></document>';
    expect(runFileChecks(cnxml).osEmbed).toBe(1);
  });

  it('counts iframe embeds', () => {
    const cnxml = '<document><media><iframe src="https://phet"/></media></document>';
    expect(runFileChecks(cnxml).iframe).toBe(1);
  });

  it('detects term and glossary presence', () => {
    const withGloss = '<document><term>x</term><glossary><definition/></glossary></document>';
    const r1 = runFileChecks(withGloss);
    expect(r1.hasTerm).toBe(true);
    expect(r1.hasGlossary).toBe(true);
    const termOnly = runFileChecks('<document><para>a <term>y</term> b</para></document>');
    expect(termOnly.hasTerm).toBe(true);
    expect(termOnly.hasGlossary).toBe(false);
  });

  it('extracts note class values (deduped)', () => {
    const cnxml =
      '<document><note class="microbiology clinical-focus"/><note class="microbiology clinical-focus"/>' +
      '<note class="evolution"/><note>no class</note></document>';
    expect(runFileChecks(cnxml).noteClasses.sort()).toEqual([
      'evolution',
      'microbiology clinical-focus',
    ]);
  });

  it('is clean on a plain module', () => {
    const r = runFileChecks('<document><para>Hello <emphasis>world</emphasis></para></document>');
    expect(r.osEmbed).toBe(0);
    expect(r.iframe).toBe(0);
    expect(r.noteClasses).toEqual([]);
  });
});

describe('runFileChecks — unrecognized inline (DOM)', () => {
  it('flags an unhandled inline element inside a para', () => {
    const cnxml =
      '<document xmlns:m="http://www.w3.org/1998/Math/MathML">' +
      '<para>A <quote>q</quote> and <emphasis>e</emphasis> and <m:math><m:mn>2</m:mn></m:math></para>' +
      '</document>';
    const r = runFileChecks(cnxml);
    expect(r.unrecognizedInline).toEqual({ quote: 1 });
  });

  it('does not flag handled inline or MathML internals', () => {
    const cnxml =
      '<document xmlns:m="http://www.w3.org/1998/Math/MathML">' +
      '<para><emphasis>e</emphasis><sub>2</sub><link url="x">l</link>' +
      '<m:math><m:mrow><m:mi>x</m:mi></m:mrow></m:math></para></document>';
    expect(runFileChecks(cnxml).unrecognizedInline).toEqual({});
  });

  it('returns {} on malformed CNXML (does not throw)', () => {
    expect(() => runFileChecks('<para>unclosed')).not.toThrow();
    expect(runFileChecks('<para>unclosed').unrecognizedInline).toEqual({});
  });

  it('does not flag pipeline-handled block elements nested in a para', () => {
    // OpenStax nests figure/list/media/equation/table inside <para>; these are
    // built by the pipeline, not stripped. Only genuinely-unknown tags flag.
    //
    // ⚠️ THE POSITIVE CONTROL USED TO BE <span>, AND §C118 ⑬ RETIRED IT. <span>
    // gained a marker case in cnxml-extract.js and joined HANDLED_INLINE, so it is
    // no longer unknown — leaving it here would have left this test asserting
    // `toEqual({})`, i.e. a null with nothing proving the check still fires.
    // <quote> is the replacement: still genuinely unhandled, so the ignore-list
    // below is measured against something that DOES flag.
    const cnxml =
      '<document><para>x<figure id="f"/><list><item>a</item></list>' +
      '<equation/><table/><quote>q</quote></para></document>';
    expect(runFileChecks(cnxml).unrecognizedInline).toEqual({ quote: 1 });
  });

  it('does not flag <span> — it is a handled inline marker type (§C118 ⑬)', () => {
    // The behaviour ⑬ changed, asserted directly rather than inferred from the
    // absence above. Organic's reaction-colouring spans are extracted as
    // `[[span:inner|class]]`; before ⑬ the probe called <span> unknown 286 times
    // across 98 of 342 organic modules (NOT the 184 the register predicted — 184 is
    // how many modules CONTAIN a span; check 5 only walks direct children of
    // TEXT_CONTAINERS), noise that would bury a real finding.
    const cnxml = '<document><para>x<span class="magenta-text">F</span></para></document>';
    const r = runFileChecks(cnxml);
    expect(r.unrecognizedInline).toEqual({});
    // Non-vacuity: the same container with a genuinely-unknown sibling still fires,
    // so the {} above is a classification result and not a dead code path.
    const withUnknown =
      '<document><para>x<span class="magenta-text">F</span><quote>q</quote></para></document>';
    expect(runFileChecks(withUnknown).unrecognizedInline).toEqual({ quote: 1 });
  });
});

describe('evaluateBook — verdict', () => {
  it('GO for a clean, fully-configured book', () => {
    const r = evaluateBook(baseAgg(), { noteTypeLabels: {} });
    expect(r.verdict).toBe('GO');
  });

  it('NO-GO when os-embed is present (BLOCK)', () => {
    const agg = { ...baseAgg(), osEmbed: 260 };
    const r = evaluateBook(agg, { noteTypeLabels: {} });
    expect(r.checks.osEmbed.status).toBe('block');
    expect(r.verdict).toBe('NO-GO');
  });

  it('GO-WITH-GAPS on iframe (WARN)', () => {
    const r = evaluateBook({ ...baseAgg(), iframe: 35 }, { noteTypeLabels: {} });
    expect(r.checks.iframe.status).toBe('warn');
    expect(r.verdict).toBe('GO-WITH-GAPS');
  });

  it('WARN on term-without-glossary', () => {
    const r = evaluateBook(
      { ...baseAgg(), anyTerm: true, anyGlossary: false },
      { noteTypeLabels: {} }
    );
    expect(r.checks.glossary.status).toBe('warn');
  });

  it('does not WARN when a glossary is present', () => {
    const r = evaluateBook(
      { ...baseAgg(), anyTerm: true, anyGlossary: true },
      { noteTypeLabels: {} }
    );
    expect(r.checks.glossary.status).toBe('ok');
  });

  it('WARNs on note classes absent from book-config (+SHARED)', () => {
    const agg = { ...baseAgg(), noteClasses: new Set(['evolution', 'link-to-learning']) };
    const r = evaluateBook(agg, { noteTypeLabels: { career: 'Starfsferill' } });
    // link-to-learning is in SHARED; evolution is not configured
    expect(r.checks.noteClass.status).toBe('warn');
    expect(r.checks.noteClass.items).toEqual(['evolution']);
  });

  it('resolves a compound note class via substring (mirrors render)', () => {
    // "chemistry chemist-portrait" is configured by the un-prefixed key.
    const agg = { ...baseAgg(), noteClasses: new Set(['chemistry chemist-portrait']) };
    const r = evaluateBook(agg, { noteTypeLabels: { 'chemist-portrait': 'Efnafræðingur' } });
    expect(r.checks.noteClass.status).toBe('ok');
  });
});
