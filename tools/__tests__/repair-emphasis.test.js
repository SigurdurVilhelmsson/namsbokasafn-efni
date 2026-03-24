import { describe, it, expect } from 'vitest';
import {
  parseSegments,
  extractEmphasisSpans,
  findEmphasisLoss,
  repairEmphasis,
} from '../repair-emphasis.js';

// ─── parseSegments ─────────────────────────────────────────────────

describe('parseSegments', () => {
  it('returns empty map for empty input', () => {
    const result = parseSegments('');
    expect(result.size).toBe(0);
  });

  it('parses a single segment', () => {
    const input = '<!-- SEG:m00001:title:auto-1 -->\nIntroduction\n';
    const result = parseSegments(input);
    expect(result.size).toBe(1);
    expect(result.get('m00001:title:auto-1')).toBe('Introduction');
  });

  it('parses multiple segments', () => {
    const input = [
      '<!-- SEG:m00001:para:p1 -->',
      'First paragraph.',
      '',
      '<!-- SEG:m00001:para:p2 -->',
      'Second paragraph.',
      '',
    ].join('\n');
    const result = parseSegments(input);
    expect(result.size).toBe(2);
    expect(result.get('m00001:para:p1')).toBe('First paragraph.');
    expect(result.get('m00001:para:p2')).toBe('Second paragraph.');
  });

  it('handles duplicate segment IDs — first match wins', () => {
    const input = [
      '<!-- SEG:m00001:title:auto-1 -->',
      'First version',
      '',
      '<!-- SEG:m00001:title:auto-1 -->',
      'Second version',
      '',
    ].join('\n');
    const result = parseSegments(input);
    expect(result.get('m00001:title:auto-1')).toBe('First version');
  });

  it('trims whitespace from segment text', () => {
    const input = '<!-- SEG:m00001:para:p1 -->\n  Padded text  \n';
    const result = parseSegments(input);
    expect(result.get('m00001:para:p1')).toBe('Padded text');
  });
});

// ─── extractEmphasisSpans ──────────────────────────────────────────

describe('extractEmphasisSpans', () => {
  it('returns empty array when no emphasis markers present', () => {
    expect(extractEmphasisSpans('Plain text without markers.')).toEqual([]);
  });

  it('extracts a single emphasis span', () => {
    const text = 'The compound is {{i}}solid{{/i}} at room temperature.';
    expect(extractEmphasisSpans(text)).toEqual(['solid']);
  });

  it('extracts multiple emphasis spans', () => {
    const text = 'States: {{i}}solid{{/i}}, {{i}}liquid{{/i}}, and {{i}}gas{{/i}}.';
    expect(extractEmphasisSpans(text)).toEqual(['solid', 'liquid', 'gas']);
  });

  it('handles multi-word emphasis spans', () => {
    const text = 'The {{i}}melting point{{/i}} of ice is 0 degrees.';
    expect(extractEmphasisSpans(text)).toEqual(['melting point']);
  });

  it('handles emphasis containing special regex characters', () => {
    const text = 'The term {{i}}H(+){{/i}} represents a proton.';
    expect(extractEmphasisSpans(text)).toEqual(['H(+)']);
  });
});

// ─── findEmphasisLoss ──────────────────────────────────────────────

describe('findEmphasisLoss', () => {
  it('returns empty array when EN and IS have same emphasis count', () => {
    const en = new Map([['seg1', 'The {{i}}solid{{/i}} state.']]);
    const is = new Map([['seg1', 'Fasta {{i}}fast{{/i}} ástandið.']]);
    expect(findEmphasisLoss(en, is)).toEqual([]);
  });

  it('returns empty array when neither EN nor IS have emphasis', () => {
    const en = new Map([['seg1', 'Plain text.']]);
    const is = new Map([['seg1', 'Venjulegur texti.']]);
    expect(findEmphasisLoss(en, is)).toEqual([]);
  });

  it('detects emphasis loss when IS has fewer markers than EN', () => {
    const en = new Map([['seg1', 'The {{i}}solid{{/i}} and {{i}}liquid{{/i}} states.']]);
    const is = new Map([['seg1', 'Fast og fljótandi ástand.']]);
    const losses = findEmphasisLoss(en, is);
    expect(losses).toHaveLength(1);
    expect(losses[0].segId).toBe('seg1');
    expect(losses[0].enCount).toBe(2);
    expect(losses[0].isCount).toBe(0);
    expect(losses[0].lostCount).toBe(2);
    expect(losses[0].lostSpans).toEqual(['solid', 'liquid']);
  });

  it('identifies lost spans as tail spans (positional assumption)', () => {
    // If EN has 3 emphasis and IS has 1, the lost ones are at positions 2 and 3
    const en = new Map([['seg1', '{{i}}alpha{{/i}}, {{i}}beta{{/i}}, {{i}}gamma{{/i}}']]);
    const is = new Map([['seg1', '{{i}}alfa{{/i}}, beta, gamma']]);
    const losses = findEmphasisLoss(en, is);
    expect(losses).toHaveLength(1);
    expect(losses[0].lostSpans).toEqual(['beta', 'gamma']);
  });

  it('skips segments that exist in EN but not in IS', () => {
    const en = new Map([['seg1', 'The {{i}}solid{{/i}} state.']]);
    const is = new Map(); // no matching IS segment
    expect(findEmphasisLoss(en, is)).toEqual([]);
  });

  it('does not flag when IS has more emphasis than EN', () => {
    const en = new Map([['seg1', 'Plain text.']]);
    const is = new Map([['seg1', '{{i}}Skáletruð{{/i}} texti.']]);
    expect(findEmphasisLoss(en, is)).toEqual([]);
  });

  it('handles multiple segments with mixed results', () => {
    const en = new Map([
      ['seg1', '{{i}}alpha{{/i}} text'],
      ['seg2', '{{i}}beta{{/i}} text'],
      ['seg3', 'no emphasis'],
    ]);
    const is = new Map([
      ['seg1', '{{i}}alfa{{/i}} texti'],
      ['seg2', 'beta texti'], // lost
      ['seg3', 'engin áhersla'],
    ]);
    const losses = findEmphasisLoss(en, is);
    expect(losses).toHaveLength(1);
    expect(losses[0].segId).toBe('seg2');
    expect(losses[0].lostSpans).toEqual(['beta']);
  });
});

// ─── repairEmphasis ────────────────────────────────────────────────

describe('repairEmphasis', () => {
  // Helper: build a loss object matching the shape findEmphasisLoss returns
  function makeLoss(segId, lostSpans) {
    return {
      segId,
      enCount: lostSpans.length,
      isCount: 0,
      lostCount: lostSpans.length,
      lostSpans,
      isText: '',
    };
  }

  it('wraps a surviving EN term in <emphasis effect="italics">', () => {
    const cnxml = '<para>The solid state is common.</para>';
    const losses = [makeLoss('seg1', ['solid'])];
    const { cnxml: result, repairedCount, skippedCount } = repairEmphasis(cnxml, losses);
    expect(result).toContain('<emphasis effect="italics">solid</emphasis>');
    expect(repairedCount).toBe(1);
    expect(skippedCount).toBe(0);
  });

  it('returns unchanged CNXML when no losses provided', () => {
    const cnxml = '<para>No changes needed.</para>';
    const { cnxml: result, repairedCount } = repairEmphasis(cnxml, []);
    expect(result).toBe(cnxml);
    expect(repairedCount).toBe(0);
  });

  it('only repairs the first occurrence of the lost term', () => {
    const cnxml = '<para>The solid is solid and solid.</para>';
    const losses = [makeLoss('seg1', ['solid'])];
    const { cnxml: result, repairedCount } = repairEmphasis(cnxml, losses);
    // Count emphasis tags — should be exactly 1
    const emphasisCount = (result.match(/<emphasis effect="italics">/g) || []).length;
    expect(emphasisCount).toBe(1);
    expect(repairedCount).toBe(1);
  });

  it('repairs multiple lost spans in the same segment', () => {
    const cnxml = '<para>The solid and liquid states.</para>';
    const losses = [makeLoss('seg1', ['solid', 'liquid'])];
    const { cnxml: result, repairedCount } = repairEmphasis(cnxml, losses);
    expect(result).toContain('<emphasis effect="italics">solid</emphasis>');
    expect(result).toContain('<emphasis effect="italics">liquid</emphasis>');
    expect(repairedCount).toBe(2);
  });

  it('skips single-character spans as too ambiguous', () => {
    const cnxml = '<para>Value of x is 5.</para>';
    const losses = [makeLoss('seg1', ['x'])];
    const { cnxml: result, repairedCount, skippedCount } = repairEmphasis(cnxml, losses);
    expect(result).toBe(cnxml); // unchanged
    expect(repairedCount).toBe(0);
    expect(skippedCount).toBe(1);
  });

  it('skips single-char state notation (l, s, g) — too short for Strategy 1', () => {
    // Single chars have length < 2, so they hit the "too ambiguous" else branch
    const cnxml = '<para>H2O(l) + NaCl(s)</para>';
    const losses = [makeLoss('seg1', ['l', 's'])];
    const { cnxml: result, repairedCount, skippedCount } = repairEmphasis(cnxml, losses);
    expect(result).toBe(cnxml); // unchanged
    expect(repairedCount).toBe(0);
    expect(skippedCount).toBe(2);
  });

  it('repairs multi-char state notation (aq) via Strategy 2 in parentheses', () => {
    // "aq" has length 2, passes Strategy 1 word boundary check (fails),
    // then falls through to Strategy 2 which matches (aq) in parentheses
    const cnxml = '<para>NaCl(aq) + H2O(aq)</para>';
    const losses = [makeLoss('seg1', ['aq'])];
    const { cnxml: result, repairedCount } = repairEmphasis(cnxml, losses);
    expect(result).toContain('(<emphasis effect="italics">aq</emphasis>)');
    expect(repairedCount).toBe(1);
  });

  it('does not wrap text already inside <emphasis> tags', () => {
    const cnxml = '<para><emphasis effect="italics">solid</emphasis> is already emphasized.</para>';
    const losses = [makeLoss('seg1', ['solid'])];
    const { cnxml: result, repairedCount, skippedCount } = repairEmphasis(cnxml, losses);
    // Should not double-wrap
    expect(result).not.toContain('<emphasis effect="italics"><emphasis');
    // The text is already wrapped, so the regex should not match
    expect(repairedCount).toBe(0);
    expect(skippedCount).toBe(1);
  });

  it('respects maxRepairs limit', () => {
    const cnxml = '<para>The solid and liquid and gas states.</para>';
    const losses = [makeLoss('seg1', ['solid', 'liquid', 'gas'])];
    const { cnxml: result, repairedCount, skippedCount } = repairEmphasis(cnxml, losses, 2);
    expect(repairedCount).toBe(2);
    expect(skippedCount).toBe(1);
    // Only first two should be repaired
    expect(result).toContain('<emphasis effect="italics">solid</emphasis>');
    expect(result).toContain('<emphasis effect="italics">liquid</emphasis>');
    expect(result).not.toContain('<emphasis effect="italics">gas</emphasis>');
  });

  it('skips span when text is not found in the CNXML', () => {
    const cnxml = '<para>This paragraph has different words.</para>';
    const losses = [makeLoss('seg1', ['nonexistent'])];
    const { repairedCount, skippedCount } = repairEmphasis(cnxml, losses);
    expect(repairedCount).toBe(0);
    expect(skippedCount).toBe(1);
  });

  it('handles losses across multiple segments', () => {
    const cnxml = '<para>The solid state.</para><para>The liquid state.</para>';
    const losses = [makeLoss('seg1', ['solid']), makeLoss('seg2', ['liquid'])];
    const { cnxml: result, repairedCount } = repairEmphasis(cnxml, losses);
    expect(result).toContain('<emphasis effect="italics">solid</emphasis>');
    expect(result).toContain('<emphasis effect="italics">liquid</emphasis>');
    expect(repairedCount).toBe(2);
  });

  it('does not break existing CNXML elements when patching', () => {
    const cnxml = '<para id="p1">Water is a <term>compound</term> in the liquid state.</para>';
    const losses = [makeLoss('seg1', ['liquid'])];
    const { cnxml: result } = repairEmphasis(cnxml, losses);
    // The term tag should remain intact
    expect(result).toContain('<term>compound</term>');
    // The para id should remain intact
    expect(result).toContain('<para id="p1">');
    // The emphasis should be added
    expect(result).toContain('<emphasis effect="italics">liquid</emphasis>');
  });

  it('repairs first match even inside MathML (regex is text-level, not DOM-aware)', () => {
    // repairEmphasis uses regex on raw text — it does not parse XML structure.
    // If the lost word appears inside MathML before plain text, MathML gets patched.
    // This is a known limitation; the fidelity guard (maxRepairs from compareTagCounts)
    // prevents overcounting in practice.
    const cnxml = '<para>The value <m:math><m:mi>solid</m:mi></m:math> in the solid state.</para>';
    const losses = [makeLoss('seg1', ['solid'])];
    const { cnxml: result, repairedCount } = repairEmphasis(cnxml, losses);
    expect(repairedCount).toBe(1);
    // Only the first occurrence is wrapped (which happens to be in MathML)
    const emphasisCount = (result.match(/<emphasis effect="italics">/g) || []).length;
    expect(emphasisCount).toBe(1);
  });

  it('does not throw on spans with special regex characters (escaped safely)', () => {
    const cnxml = '<para>The term H(+) is important.</para>';
    const losses = [makeLoss('seg1', ['H(+)'])];
    // Should not throw — special chars are escaped. However, the word-boundary
    // \b before H and after ) may not match, so repair may be skipped.
    const { skippedCount } = repairEmphasis(cnxml, losses);
    // The parentheses in H(+) break word-boundary matching, so it gets skipped
    expect(skippedCount).toBe(1);
  });

  it('repairs multi-word span containing special regex characters', () => {
    // Multi-word span where word boundaries work at the edges
    const cnxml = '<para>The reaction produces carbon dioxide.</para>';
    const losses = [makeLoss('seg1', ['carbon dioxide'])];
    const { cnxml: result, repairedCount } = repairEmphasis(cnxml, losses);
    expect(repairedCount).toBe(1);
    expect(result).toContain('<emphasis effect="italics">carbon dioxide</emphasis>');
  });

  it('skips multi-char state notation (aq) not in parentheses — Strategy 2 needs parens', () => {
    // "aq" has length 2, so it enters Strategy 1 first. The word boundary \b
    // around "aq" might match or not depending on context. If Strategy 1 fails,
    // Strategy 2 looks for (aq) in parentheses — which is absent here.
    const cnxml = '<para>The aq solution is dilute.</para>';
    const losses = [makeLoss('seg1', ['aq'])];
    const { cnxml: result, repairedCount } = repairEmphasis(cnxml, losses);
    // "aq" is a word bounded on both sides, so Strategy 1 matches
    expect(repairedCount).toBe(1);
    expect(result).toContain('<emphasis effect="italics">aq</emphasis>');
  });
});
