/**
 * handled-tags-shared.test.js — D2: one source of truth for inline/block tag
 * classification (item 8 PR2).
 *
 * Freezes the membership of the canonical HANDLED_INLINE / HANDLED_BLOCK sets
 * to the exact pre-refactor literals from preintake-checks.js, and (later
 * blocks) asserts each consumer's set is the same object, a documented
 * derivation, or a proven subset — so the probe, renderer, and DOM lib cannot
 * silently disagree on a tag's classification.
 */

import { describe, it, expect } from 'vitest';
import { HANDLED_INLINE, HANDLED_BLOCK } from '../lib/handled-tags.js';

const sorted = (s) => [...s].sort();

// Exact pre-refactor literals (tools/lib/preintake-checks.js @ a7e0c746).
const INLINE_LITERAL = [
  'emphasis',
  'sub',
  'sup',
  'link',
  'term',
  'footnote',
  'newline',
  'space',
  'math',
];
const BLOCK_LITERAL = [
  'para',
  'figure',
  'subfigure',
  'media',
  'image',
  'list',
  'item',
  'table',
  'tgroup',
  'colspec',
  'thead',
  'tbody',
  'row',
  'entry',
  'equation',
  'note',
  'example',
  'exercise',
  'problem',
  'solution',
  'commentary',
  'section',
  'title',
  'caption',
  'label',
  'definition',
  'meaning',
  'glossary',
];

describe('handled-tags — canonical sets match the pre-refactor literals', () => {
  it('HANDLED_INLINE membership is frozen (9 tags)', () => {
    expect(sorted(HANDLED_INLINE)).toEqual([...INLINE_LITERAL].sort());
  });

  it('HANDLED_BLOCK membership is frozen (28 tags)', () => {
    expect(sorted(HANDLED_BLOCK)).toEqual([...BLOCK_LITERAL].sort());
  });

  it('a tag is never both inline and block', () => {
    for (const t of HANDLED_INLINE) {
      expect(HANDLED_BLOCK.has(t), `'${t}' classified both inline and block`).toBe(false);
    }
  });
});
