/**
 * cnxml-render-loud-seam.test.js — the DOM seam records undispatched blocks (C3).
 *
 * renderBlockChildrenInOrder used `if (!dispatch[name]) return;` — any block
 * element absent from a container's dispatch map was SILENTLY discarded. Three
 * hand-maintained maps drifted (renderExample had `equation`; renderExercise and
 * renderNote didn't), each a silent content drop found only after the fact.
 *
 * The seam now records undispatched block elements into context.undispatchedBlocks
 * (ignoring known container-meta/inline tags so the signal isn't drowned in
 * noise). Rendering is unchanged — the element is still not emitted — but the drop
 * is now visible instead of silent. (Golden tests prove the output-neutrality.)
 */

import { describe, it, expect } from 'vitest';
import { renderBlockChildrenInOrder } from '../cnxml-render.js';

const para = (o) => `<p>${o.content}</p>`;

describe('loud seam — records undispatched block elements', () => {
  it('records a block element missing from the dispatch map (not silently dropped)', () => {
    const ctx = { undispatchedBlocks: [] };
    const out = renderBlockChildrenInOrder(
      '<para id="p">x</para><table id="T"><tgroup cols="1"/></table>',
      ctx,
      { para }
    );
    expect(ctx.undispatchedBlocks).toEqual([{ tag: 'table', id: 'T' }]);
    // still not emitted (output-neutral — recording, not rendering)
    expect(out.join('')).not.toContain('<table');
  });

  it('ignores known container-meta / inline tags (signal, not noise)', () => {
    const ctx = { undispatchedBlocks: [] };
    renderBlockChildrenInOrder('<title>T</title><newline/><label>1</label>', ctx, { para });
    expect(ctx.undispatchedBlocks).toEqual([]);
  });

  it('records nothing when every block is dispatched', () => {
    const ctx = { undispatchedBlocks: [] };
    renderBlockChildrenInOrder('<para id="a">x</para><para id="b">y</para>', ctx, { para });
    expect(ctx.undispatchedBlocks).toEqual([]);
  });
});
