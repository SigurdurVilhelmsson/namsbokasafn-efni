import { describe, it, expect } from 'vitest';
import { applyMathLabelSubstitution } from '../cnxml-inject.js';
import { buildResolver } from '../lib/math-label-substitute.js';

describe('applyMathLabelSubstitution', () => {
  const resolve = buildResolver({ overlay: { rate: 'hraði' }, glossaryMap: new Map() });

  it('mutates eq.mathml in place and counts changed equations', () => {
    const equations = {
      'math-1': { mathml: '<m:math><m:mi>rate</m:mi></m:math>' },
      'math-2': { mathml: '<m:math><m:mtext>14.82 g carbon</m:mtext></m:math>' },
    };
    const report = applyMathLabelSubstitution(equations, resolve);
    expect(equations['math-1'].mathml).toBe('<m:math><m:mi>hraði</m:mi></m:math>');
    expect(equations['math-2'].mathml).toBe('<m:math><m:mtext>14.82 g carbon</m:mtext></m:math>');
    expect(report.modulesSubstituted).toBe(1);
  });

  it('tolerates equations without a mathml string', () => {
    const equations = { 'math-1': {}, 'math-2': null };
    expect(() => applyMathLabelSubstitution(equations, resolve)).not.toThrow();
  });
});
