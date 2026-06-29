import { describe, it, expect } from 'vitest';
import { runFileChecks } from '../lib/preintake-checks.js';

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
});
