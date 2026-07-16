import { describe, it, expect } from 'vitest';
import { checkDuplicateSegIds, analyzeModule } from '../lib/extraction-coverage.js';

const seg = (id, text) => `<!-- SEG:${id} -->\n${text}\n`;

describe('checkDuplicateSegIds — content classification', () => {
  it('classifies a byte-identical duplicate as benign', () => {
    const segText = seg('m1:para:p1', 'Hello world') + seg('m1:para:p1', 'Hello world');
    const { rawDup } = checkDuplicateSegIds(null, segText);
    expect(rawDup).toHaveLength(1);
    expect(rawDup[0]).toMatchObject({ segId: 'm1:para:p1', count: 2, kind: 'benign' });
  });

  it('classifies a duplicate differing only in [[MATH:N]] index as benign', () => {
    const segText =
      seg('m1:para:p1', '4.586 [[MATH:12]] atoms') + seg('m1:para:p1', '4.586 [[MATH:13]] atoms');
    const { rawDup } = checkDuplicateSegIds(null, segText);
    expect(rawDup[0].kind).toBe('benign');
  });

  it('classifies a duplicate with different words as real', () => {
    const segText = seg('m1:para:p1', 'The cat sat') + seg('m1:para:p1', 'A dog ran');
    const { rawDup } = checkDuplicateSegIds(null, segText);
    expect(rawDup[0].kind).toBe('real');
    expect(rawDup[0].sampleA).toContain('cat');
    expect(rawDup[0].sampleB).toContain('dog');
  });

  it('does not flag a unique seg-id', () => {
    const segText = seg('m1:para:p1', 'x') + seg('m1:para:p2', 'y');
    expect(checkDuplicateSegIds(null, segText).rawDup).toHaveLength(0);
  });
});

describe('analyzeModule — hasFindings counts only real dups', () => {
  const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml"><content><section id="s"><title>S</title></section></content></document>`;
  it('is clean when the only duplicate is benign', () => {
    const segText = seg('m1:para:p1', 'same') + seg('m1:para:p1', 'same');
    expect(analyzeModule(cnxml, segText).hasFindings).toBe(false);
  });
  it('flags when a duplicate is real', () => {
    const segText = seg('m1:para:p1', 'alpha') + seg('m1:para:p1', 'beta gamma');
    expect(analyzeModule(cnxml, segText).hasFindings).toBe(true);
  });
});
