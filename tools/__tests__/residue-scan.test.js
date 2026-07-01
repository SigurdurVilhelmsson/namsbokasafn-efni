import { describe, it, expect } from 'vitest';
import { scanSegmentsForResidue } from '../lib/residue-scan.js';

// Real SEG-marker syntax: <!-- SEG:<id> -->\n<text>
const seg = (id, text) => `<!-- SEG:${id} -->\n${text}\n\n`;

describe('scanSegmentsForResidue', () => {
  it('flags a verbatim-English segment as exact residue', () => {
    const en = seg('m1:para:1', 'The reaction reaches equilibrium quickly.');
    const is = seg('m1:para:1', 'The reaction reaches equilibrium quickly.');
    const out = scanSegmentsForResidue(en, is);
    expect(out.exact).toEqual(['m1:para:1']);
    expect(out.warnings).toEqual([]);
  });

  it('does not flag a properly translated segment', () => {
    const en = seg('m1:para:1', 'The reaction reaches equilibrium quickly.');
    const is = seg('m1:para:1', 'Efnahvarfið nær jafnvægi hratt.');
    const out = scanSegmentsForResidue(en, is);
    expect(out.exact).toEqual([]);
    expect(out.warnings).toEqual([]);
  });

  it('does not flag a numeric/formula cell that is identical EN==IS (content-word floor)', () => {
    const en = seg('m1:entry:1', 'neon 0.83 g/L');
    const is = seg('m1:entry:1', 'neon 0.83 g/L');
    const out = scanSegmentsForResidue(en, is);
    expect(out.exact).toEqual([]);
  });

  it('skips IS segments with no EN counterpart', () => {
    const en = seg('m1:para:1', 'Only in English file.');
    const is = seg('m1:para:2', 'Aðeins í íslensku skránni.');
    const out = scanSegmentsForResidue(en, is);
    expect(out.exact).toEqual([]);
    expect(out.warnings).toEqual([]);
  });
});
