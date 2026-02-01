/**
 * Tests for cnxml-to-md.js - CNXML to Markdown conversion
 *
 * This tests the core conversion functions used in the translation pipeline.
 */

import { describe, it, expect } from 'vitest';
import {
  convertMathMLToLatex,
  splitMathParts,
  toRoman,
  getListPrefix,
  processInlineContent,
} from '../cnxml-to-md.js';

// ============================================================================
// toRoman() - Roman Numeral Conversion
// ============================================================================

describe('toRoman', () => {
  it('converts single digit numbers', () => {
    expect(toRoman(1)).toBe('I');
    expect(toRoman(2)).toBe('II');
    expect(toRoman(3)).toBe('III');
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(5)).toBe('V');
    expect(toRoman(6)).toBe('VI');
    expect(toRoman(7)).toBe('VII');
    expect(toRoman(8)).toBe('VIII');
    expect(toRoman(9)).toBe('IX');
  });

  it('converts tens', () => {
    expect(toRoman(10)).toBe('X');
    expect(toRoman(20)).toBe('XX');
    expect(toRoman(40)).toBe('XL');
    expect(toRoman(50)).toBe('L');
    expect(toRoman(90)).toBe('XC');
  });

  it('converts hundreds', () => {
    expect(toRoman(100)).toBe('C');
    expect(toRoman(400)).toBe('CD');
    expect(toRoman(500)).toBe('D');
    expect(toRoman(900)).toBe('CM');
  });

  it('converts common chapter numbers', () => {
    expect(toRoman(11)).toBe('XI');
    expect(toRoman(14)).toBe('XIV');
    expect(toRoman(21)).toBe('XXI');
    expect(toRoman(99)).toBe('XCIX');
  });

  it('converts large numbers', () => {
    expect(toRoman(1000)).toBe('M');
    expect(toRoman(2024)).toBe('MMXXIV');
    expect(toRoman(1984)).toBe('MCMLXXXIV');
  });
});

// ============================================================================
// getListPrefix() - List Numbering Styles
// ============================================================================

describe('getListPrefix', () => {
  describe('arabic style (default)', () => {
    it('returns arabic numerals with period', () => {
      expect(getListPrefix(1, 'arabic')).toBe('1.');
      expect(getListPrefix(5, 'arabic')).toBe('5.');
      expect(getListPrefix(10, 'arabic')).toBe('10.');
    });

    it('uses arabic as default style', () => {
      expect(getListPrefix(1, undefined)).toBe('1.');
      expect(getListPrefix(3, 'unknown-style')).toBe('3.');
    });
  });

  describe('lower-alpha style', () => {
    it('returns lowercase letters', () => {
      expect(getListPrefix(1, 'lower-alpha')).toBe('a.');
      expect(getListPrefix(2, 'lower-alpha')).toBe('b.');
      expect(getListPrefix(26, 'lower-alpha')).toBe('z.');
    });
  });

  describe('upper-alpha style', () => {
    it('returns uppercase letters', () => {
      expect(getListPrefix(1, 'upper-alpha')).toBe('A.');
      expect(getListPrefix(2, 'upper-alpha')).toBe('B.');
      expect(getListPrefix(26, 'upper-alpha')).toBe('Z.');
    });
  });

  describe('lower-roman style', () => {
    it('returns lowercase roman numerals', () => {
      expect(getListPrefix(1, 'lower-roman')).toBe('i.');
      expect(getListPrefix(4, 'lower-roman')).toBe('iv.');
      expect(getListPrefix(10, 'lower-roman')).toBe('x.');
    });
  });

  describe('upper-roman style', () => {
    it('returns uppercase roman numerals', () => {
      expect(getListPrefix(1, 'upper-roman')).toBe('I.');
      expect(getListPrefix(4, 'upper-roman')).toBe('IV.');
      expect(getListPrefix(10, 'upper-roman')).toBe('X.');
    });
  });
});

// ============================================================================
// splitMathParts() - MathML Element Splitting
// ============================================================================

describe('splitMathParts', () => {
  it('splits two sibling elements', () => {
    const content = '<mn>2</mn><mn>3</mn>';
    const parts = splitMathParts(content);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('<mn>2</mn>');
    expect(parts[1]).toBe('<mn>3</mn>');
  });

  it('handles nested elements', () => {
    const content = '<mrow><mn>2</mn></mrow><mn>3</mn>';
    const parts = splitMathParts(content);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('<mrow><mn>2</mn></mrow>');
    expect(parts[1]).toBe('<mn>3</mn>');
  });

  it('handles whitespace between elements', () => {
    const content = '  <mn>2</mn>  <mn>3</mn>  ';
    const parts = splitMathParts(content);
    expect(parts).toHaveLength(2);
  });

  it('handles three elements for msubsup', () => {
    const content = '<mi>x</mi><mn>1</mn><mn>2</mn>';
    const parts = splitMathParts(content);
    expect(parts).toHaveLength(3);
  });
});

// ============================================================================
// convertMathMLToLatex() - MathML to LaTeX Conversion
// ============================================================================

describe('convertMathMLToLatex', () => {
  describe('basic elements', () => {
    it('converts numbers', () => {
      const mathml = '<m:math><m:mn>42</m:mn></m:math>';
      expect(convertMathMLToLatex(mathml)).toBe('42');
    });

    it('converts identifiers', () => {
      const mathml = '<m:math><m:mi>x</m:mi></m:math>';
      expect(convertMathMLToLatex(mathml)).toBe('x');
    });

    it('converts text', () => {
      const mathml = '<m:math><m:mtext>mol</m:mtext></m:math>';
      expect(convertMathMLToLatex(mathml)).toBe('\\text{mol}');
    });
  });

  describe('operators', () => {
    it('converts multiplication', () => {
      const mathml = '<m:math><m:mo>×</m:mo></m:math>';
      expect(convertMathMLToLatex(mathml)).toBe('\\times');
    });

    it('converts minus', () => {
      const mathml = '<m:math><m:mo>−</m:mo></m:math>';
      expect(convertMathMLToLatex(mathml)).toBe('-');
    });

    it('converts arrows', () => {
      const mathml = '<m:math><m:mo>→</m:mo></m:math>';
      expect(convertMathMLToLatex(mathml)).toBe('\\rightarrow');
    });

    it('converts long arrows', () => {
      const mathml = '<m:math><m:mo>⟶</m:mo></m:math>';
      expect(convertMathMLToLatex(mathml)).toBe('\\longrightarrow');
    });

    it('converts plus-minus', () => {
      const mathml = '<m:math><m:mo>±</m:mo></m:math>';
      expect(convertMathMLToLatex(mathml)).toBe('\\pm');
    });

    it('converts approximation', () => {
      const mathml = '<m:math><m:mo>≈</m:mo></m:math>';
      expect(convertMathMLToLatex(mathml)).toBe('\\approx');
    });

    it('converts degree symbol', () => {
      const mathml = '<m:math><m:mo>°</m:mo></m:math>';
      expect(convertMathMLToLatex(mathml)).toBe('^{\\circ}');
    });
  });

  describe('fractions', () => {
    it('converts simple fractions', () => {
      const mathml = '<m:math><m:mfrac><m:mn>1</m:mn><m:mn>2</m:mn></m:mfrac></m:math>';
      const result = convertMathMLToLatex(mathml);
      expect(result).toContain('\\frac');
      expect(result).toContain('1');
      expect(result).toContain('2');
    });
  });

  describe('subscripts and superscripts', () => {
    it('converts subscripts', () => {
      const mathml = '<m:math><m:msub><m:mi>x</m:mi><m:mn>2</m:mn></m:msub></m:math>';
      const result = convertMathMLToLatex(mathml);
      expect(result).toContain('_');
      expect(result).toContain('x');
      expect(result).toContain('2');
    });

    it('converts superscripts', () => {
      const mathml = '<m:math><m:msup><m:mi>x</m:mi><m:mn>2</m:mn></m:msup></m:math>';
      const result = convertMathMLToLatex(mathml);
      expect(result).toContain('^');
      expect(result).toContain('x');
      expect(result).toContain('2');
    });
  });

  describe('square roots', () => {
    it('converts simple square roots', () => {
      const mathml = '<m:math><m:msqrt><m:mn>2</m:mn></m:msqrt></m:math>';
      const result = convertMathMLToLatex(mathml);
      expect(result).toContain('\\sqrt');
      expect(result).toContain('2');
    });
  });

  describe('complex expressions', () => {
    it('handles H2O formula', () => {
      const mathml = '<m:math><m:msub><m:mi>H</m:mi><m:mn>2</m:mn></m:msub><m:mi>O</m:mi></m:math>';
      const result = convertMathMLToLatex(mathml);
      expect(result).toContain('H');
      expect(result).toContain('2');
      expect(result).toContain('O');
    });

    it('removes empty groups', () => {
      const mathml = '<m:math><m:mrow></m:mrow><m:mn>1</m:mn></m:math>';
      const result = convertMathMLToLatex(mathml);
      expect(result).not.toContain('{}');
    });
  });
});

// ============================================================================
// processInlineContent() - Inline Markup Conversion
// ============================================================================

describe('processInlineContent', () => {
  describe('emphasis', () => {
    it('converts italics', () => {
      const content = '<emphasis effect="italics">text</emphasis>';
      expect(processInlineContent(content)).toBe('*text*');
    });

    it('converts underline', () => {
      const content = '<emphasis effect="underline">text</emphasis>';
      expect(processInlineContent(content)).toBe('_text_');
    });

    it('converts bold (default emphasis)', () => {
      const content = '<emphasis>text</emphasis>';
      expect(processInlineContent(content)).toBe('**text**');
    });
  });

  describe('terms', () => {
    it('preserves term IDs', () => {
      const content = '<term id="term-00001">chemistry</term>';
      const result = processInlineContent(content);
      expect(result).toContain('**chemistry**');
      expect(result).toContain('id="term-00001"');
    });
  });

  describe('superscripts and subscripts', () => {
    it('converts superscripts', () => {
      const content = '<sup>2</sup>';
      expect(processInlineContent(content)).toBe('^2^');
    });

    it('converts subscripts', () => {
      const content = '<sub>2</sub>';
      expect(processInlineContent(content)).toBe('~2~');
    });

    it('handles chemical formulas', () => {
      const content = 'H<sub>2</sub>O';
      expect(processInlineContent(content)).toBe('H~2~O');
    });
  });

  describe('links', () => {
    it('handles simple links', () => {
      const content = '<link url="http://example.com">click here</link>';
      const result = processInlineContent(content);
      expect(result).toContain('[click here]');
      expect(result).toContain('url="http://example.com"');
    });
  });
});
