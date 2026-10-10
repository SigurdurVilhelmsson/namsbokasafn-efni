/**
 * §C16(a) — a LITERAL asterisk in the source must not be read as Markdown italics.
 *
 * The Markdown-era converter turns `*x*` into `<emphasis effect="italics">` in
 * any segment without API markers, because the segment editor's toolbar still
 * writes that dialect (Ctrl+I). Chemistry's antibonding notation is a literal
 * asterisk, so 8-4's `(σ, σ*, π, π*)` paired the first and last `*` and readers
 * saw `σ<em>, π, π</em>`.
 *
 * Extraction never emits `*` as markup, so every `*` in the EN segment is
 * literal text — 16 chemistry segments carry one (measured 2026-10-09). The
 * gate is decided from that read-only source, never from a translated string:
 * when the IS segment holds no more asterisks than its EN source, none of them
 * can be an editor's markup, and the asterisk converters stand down.
 */
import { describe, it, expect } from 'vitest';
import { reverseInlineMarkup, buildCnxml } from '../cnxml-inject.js';

const rim = (text, literalAsterisks) =>
  reverseInlineMarkup(text, {}, [], [], null, null, null, {
    segmentId: 'm1:para:p1',
    attrMismatches: [],
    literalAsterisks,
  });

describe('reverseInlineMarkup — literal asterisks from the source stay literal', () => {
  it('🔴 keeps the live 8-4 value literal — (σ, σ*, π, π*)', () => {
    expect(rim('svigrúm (σ, σ*, π, π*)', 2)).toBe('svigrúm (σ, σ*, π, π*)');
  });

  it('keeps a bold-shaped literal pair too (**)', () => {
    expect(rim('a ** b ** c', 4)).toBe('a ** b ** c');
  });

  it('still converts an editor’s *italics* when the source has no asterisk — the toolbar keeps working', () => {
    expect(rim('mjög *mikilvægt* atriði', 0)).toBe(
      'mjög <emphasis effect="italics">mikilvægt</emphasis> atriði'
    );
  });

  it('still converts when there are MORE asterisks than the source — the extra ones are markup', () => {
    // EN carries one literal `*`; the IS has three, so an editor added a pair.
    expect(rim('σ* og *áhersla*', 1)).toContain('<emphasis effect="italics">');
  });

  it('behaves as before when no count is supplied (callers without EN)', () => {
    expect(rim('*x*', undefined)).toBe('<emphasis effect="italics">x</emphasis>');
  });
});

describe('buildCnxml — the count comes from the EN segment', () => {
  it('🔴 an EN source with σ*/π* keeps the IS asterisks literal in the injected CNXML', () => {
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml"><content><para id="p1">x</para></content></document>`;
    const structure = {
      moduleId: 'm1',
      title: { text: 'T', segmentId: null },
      content: [{ type: 'para', id: 'p1', segmentId: 'm1:para:p1' }],
    };
    const segments = new Map([['m1:para:p1', 'sameindasvigrúm (σ, σ*, π, π*)']]);
    const enSegments = new Map([['m1:para:p1', 'molecular orbitals (σ, σ*, π, π*)']]);
    const { cnxml } = buildCnxml(structure, segments, {}, originalCnxml, { enSegments });
    expect(cnxml).toContain('(σ, σ*, π, π*)');
    expect(cnxml).not.toContain('<emphasis');
  });
});
