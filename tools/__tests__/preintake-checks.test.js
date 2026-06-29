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
