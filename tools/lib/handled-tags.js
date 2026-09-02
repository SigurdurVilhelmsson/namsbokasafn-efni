/**
 * handled-tags.js — canonical inline/block tag classification for the
 * CNXML pipeline (item 8 / D2).
 *
 * One source of truth: the pre-intake probe (preintake-checks.js) re-exports
 * these sets, and the renderer derives its seam sets from HANDLED_INLINE, so
 * the stages cannot silently disagree on whether a tag is inline or block —
 * the drift class behind past extract/render divergence.
 *
 * Purpose-specific sets stay where they live (cnxml-dom BLOCK_TAGS =
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
  // §C118 ⑬ — ADDED 2026-09-02. <span class="..."> (organic's reaction colouring,
  // kept per CLAUDE.md's clean-CNXML ruling) became a real marker type at
  // cnxml-extract.js's `[[span:inner|class]]` case, so it is now handled inline by
  // the definition above. Without this the pre-intake probe reports <span> as an
  // unknown tag — noise that would bury a real finding on the next chapter's run.
  //
  // ⚠️ THE EXPOSURE IS 286 OCCURRENCES IN 98 OF 342 ORGANIC MODULES — NOT THE 184
  // MODULES THE REGISTER PREDICTED, AND THE GAP IS NOT ROUNDING. 184 is how many
  // modules CONTAIN a class-bearing span; the probe's check 5 examines only DIRECT
  // element children of TEXT_CONTAINERS, so it sees the spans parented by <title>
  // (264), <caption> (13) and <para> (9) — 286 exactly — and never the 559 under
  // <emphasis>, 214 under <entry>, 10 under <item> or 2 under <term>. Measured with
  // a runtime control (delete 'span' from this set, re-sweep): 98 -> 0 on organic,
  // 0 -> 0 on chemistry. ▶ A COUNT OF MODULES HOLDING A SHAPE IS NOT A COUNT OF
  // MODULES A CHECK FIRES ON; the two differ by which containers the check walks.
  //
  // ⚠️ THIS ALSO WIDENS THE RENDERER'S LOUD_SEAM_IGNORE, WHICH IS DERIVED FROM THIS
  // SET — i.e. it SUPPRESSES a drop-detector, the shape §C82 L149 warns about. That
  // was measured, not assumed: a DOM census of all 1,071 class-bearing spans in
  // organic 01-source finds every parent is an inline/text container (emphasis 559,
  // title 264, entry 214, caption 13, item 10, para 9, term 2) and NONE is a direct
  // child of a block container, so a <span> never reaches renderBlockChildrenInOrder's
  // processBlock and the added suppression is inert on the real corpus. Re-run that
  // census before trusting this on a new book.
  'span',
]);

/**
 * Block/structural tags the pipeline builds — these legitimately nest inside a
 * <para> in OpenStax CNXML (figures-in-para etc.) and are NOT stripped. The
 * probe's check 5 flags only elements that are neither handled-inline nor
 * handled-block, so a genuinely-unknown tag (e.g. <quote>) still surfaces.
 *
 * ⚠️ CORRECTED 2026-09-02 (§C118 ⑬) — this sentence named <span> as its example
 * of a genuinely-unknown tag. That became false when <span> gained a marker case
 * in cnxml-extract.js and joined HANDLED_INLINE above; <quote> is the surviving
 * example and is what tools/__tests__/preintake-checks.test.js now asserts on.
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
