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
import {
  HANDLED_INLINE as PROBE_INLINE,
  HANDLED_BLOCK as PROBE_BLOCK,
} from '../lib/preintake-checks.js';
import { LOUD_SEAM_IGNORE, ITEM_INLINE_OK } from '../cnxml-render.js';
import { BLOCK_TAGS } from '../lib/cnxml-dom.js';

const sorted = (s) => [...s].sort();

// Exact pre-refactor literals (tools/lib/preintake-checks.js @ a7e0c746), plus
// every deliberate addition since — each one named, so a drifting set cannot pass
// by looking like an intentional change.
//   + 'span' (§C118 ⑬, 2026-09-02): <span class="..."> gained a marker case in
//     cnxml-extract.js, so it is handled inline by this set's own definition.
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
  'span',
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
  it('HANDLED_INLINE membership is frozen (10 tags)', () => {
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

describe('preintake-checks re-exports the canonical sets', () => {
  it('HANDLED_INLINE is the same Set object (not a drifting copy)', () => {
    expect(PROBE_INLINE).toBe(HANDLED_INLINE);
  });

  it('HANDLED_BLOCK is the same Set object (not a drifting copy)', () => {
    expect(PROBE_BLOCK).toBe(HANDLED_BLOCK);
  });
});

describe('renderer seam sets derive from the canonical classification', () => {
  // Exact pre-refactor literal (tools/cnxml-render.js:1084 @ a7e0c746), plus every
  // deliberate addition since. This literal is the CROSS-SIDE anchor: it is written
  // out by hand rather than derived, so that the formula test below cannot be the
  // only witness — two sides derived from one token cannot see damage to that token.
  //   + 'span' (§C118 ⑬, 2026-09-02): arrives via HANDLED_INLINE. Measured inert —
  //     all 1,071 class-bearing spans in organic 01-source have an inline/text
  //     parent, so none ever reaches the block seam this set suppresses.
  const LOUD_SEAM_LITERAL = [
    'title',
    'label',
    'caption',
    'meta',
    'newline',
    'sub',
    'sup',
    'emphasis',
    'term',
    'link',
    'math',
    'footnote',
    'span',
  ];

  it('LOUD_SEAM_IGNORE membership is frozen (13 tags)', () => {
    expect(sorted(LOUD_SEAM_IGNORE)).toEqual([...LOUD_SEAM_LITERAL].sort());
  });

  it('LOUD_SEAM_IGNORE = HANDLED_INLINE − {space} ∪ container metadata', () => {
    const derived = new Set(
      [...HANDLED_INLINE].filter((t) => t !== 'space').concat(['title', 'label', 'caption', 'meta'])
    );
    expect(sorted(LOUD_SEAM_IGNORE)).toEqual(sorted(derived));
  });

  it('ITEM_INLINE_OK = LOUD_SEAM_IGNORE ∪ {para, space, image, span} (frozen)', () => {
    const derived = new Set([...LOUD_SEAM_IGNORE, 'para', 'space', 'image', 'span']);
    expect(sorted(ITEM_INLINE_OK)).toEqual(sorted(derived));
    expect(ITEM_INLINE_OK.size).toBe(16);
  });
});

describe('cnxml-dom BLOCK_TAGS is a purpose-specific subset of HANDLED_BLOCK', () => {
  it('every traversal block tag is a canonically handled block tag', () => {
    for (const t of BLOCK_TAGS) {
      expect(HANDLED_BLOCK.has(t), `BLOCK_TAGS has '${t}' but HANDLED_BLOCK does not`).toBe(true);
    }
  });

  it('membership is frozen (7 tags — the para-replacement traversal boundary)', () => {
    expect(sorted(BLOCK_TAGS)).toEqual(
      ['equation', 'figure', 'list', 'media', 'note', 'para', 'table'].sort()
    );
  });
});
