/**
 * handled-tags.js — canonical inline/block tag classification for the
 * CNXML pipeline (item 8 / D2).
 *
 * One source of truth: the pre-intake probe (preintake-checks.js) re-exports
 * these sets, and the renderer derives its seam sets from HANDLED_INLINE, so
 * the stages cannot silently disagree on whether a tag is inline or block —
 * the drift class behind past extract/render divergence.
 *
 * Purpose-specific subsets stay where they live (cnxml-dom BLOCK_TAGS =
 * "blocks preserved during para content replacement"; cnxml-render
 * ITEM_INLINE_OK = "tags allowed inline in a list item") — they answer
 * narrower questions and are drift-guarded against these sets by
 * tools/__tests__/handled-tags-shared.test.js.
 *
 * Leaf module by design: no imports, so any pipeline file can import it
 * without cycle risk.
 */

/** Inline tags the extractor converts to markers (everything else gets stripped). */
export const HANDLED_INLINE = new Set([
  'emphasis',
  'sub',
  'sup',
  'link',
  'term',
  'footnote',
  'newline',
  'space',
  'math', // <m:math> localName is 'math'
]);

/**
 * Block/structural tags the pipeline builds — these legitimately nest inside a
 * <para> in OpenStax CNXML (figures-in-para etc.) and are NOT stripped. The
 * probe's check 5 flags only elements that are neither handled-inline nor
 * handled-block, so a genuinely-unknown tag (e.g. <span>, <quote>) still
 * surfaces.
 */
export const HANDLED_BLOCK = new Set([
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
]);
