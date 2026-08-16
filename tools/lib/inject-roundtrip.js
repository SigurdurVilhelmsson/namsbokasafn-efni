/**
 * inject-roundtrip.js — the extract -> inject round-trip check (§C81 follow-up).
 *
 * ⚠️ WHY EXTRACTION-SIDE COUNTS CANNOT REPLACE THIS. §C81 shipped a fix that
 * stripped `alt` outright from 14 media elements across 5 modules while every
 * extraction-side count stayed clean and 4,600+ tests stayed green. The
 * mechanism: `structure.inlineMedia` entries carried no `alt` key at all, so
 * `readAlt(undefined)` was falsy and `buildMediaElement` never wrote the
 * attribute — regardless of what the segment map held. The SEGMENTS were right;
 * the rendered CNXML was wrong. tools/__tests__/cnxml-extract-alt-corpus.test.js
 * counts alt=" from raw source and never calls buildCnxml, so it is structurally
 * blind to this.
 *
 * §C82 runs module-by-module for weeks with both 02-structure shapes live —
 * exactly the condition that produced the regression. That is why this is
 * committed rather than run ad-hoc.
 *
 * Counting, not byte-diffing, deliberately: a byte diff over the corpus reports
 * whitespace-only changes as findings (17 physics modules did, in §C81 round 3),
 * which buries the one that matters.
 */
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

/** Non-empty alt attributes in a CNXML string. */
function countAlt(cnxml) {
  return (String(cnxml || '').match(/\balt="[^"]+"/g) || []).length;
}

/**
 * Extract a module, inject its own English straight back, and compare alt counts.
 *
 * Injecting the ENGLISH back means no translation is involved, so any difference
 * in the COUNT is the pipeline losing or duplicating an attribute, never a
 * content decision.
 *
 * ⚠️ IT IS NOT A "PURE STRUCTURAL CHECK", AND THE OVERCLAIM MATTERED — THIS
 * COUNTS ATTRIBUTES, NOT CONTENT. Measured 2026-08-16 by a reviewer: deleting
 * EVERY `:alt:` segment from the parsed map before buildCnxml (951 chemistry,
 * 1,918 organic, and all 11/19/8/8/22 in the regression fixtures) leaves all
 * eight committed assertions GREEN. Two mechanisms bypass the segment path and
 * keep the count intact — `readAlt` falls back to `alt.text`, the extraction-
 * captured ENGLISH, and `buildFigure` copies id-bearing figures verbatim.
 * ▶ So a future divergence between the alt segment ids written to 02-for-mt and
 * the ids `readAlt` looks up would ship ENGLISH alt text to Icelandic readers —
 * §C81's original reader-visible symptom — while this check reports
 * `rawAlt === outAlt` on all 491 in-scope modules. **A green round-trip is not
 * evidence for that class.** Catching it needs a sentinel distinct from the
 * source text, which is a different instrument; logged to the register.
 *
 * Round-tripping through formatSegmentsMarkdown -> parseSegments rather than
 * building a Map by hand is deliberate — it exercises the same serialize/parse
 * pair the real pipeline uses, so a marker-level regression is in scope too.
 * This mirrors the existing helper at
 * tools/__tests__/cnxml-extract-example-title.test.js:28-32.
 *
 * ⚠️ Going through parseSegments here (rather than iterating raw segments) is
 * deliberate: parseSegments dedupes duplicate seg-ids ('first' wins), which is
 * exactly what the real pipeline does on inject. This check measures what the
 * real pipeline actually produces, so it must inherit that behaviour. Checks
 * that audit what happened to each occurrence (checkAltCoverage,
 * bracketMarkerDeltaBySegment, checkBracketBodies) need raw, undeduped
 * iteration instead — that is a different question from this one.
 *
 * @param {string} cnxmlText a module's 01-source CNXML
 * @returns {{rawAlt: number, outAlt: number, ok: boolean}}
 */
export function roundTripAltCount(cnxmlText) {
  const rawAlt = countAlt(cnxmlText);
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxmlText);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  const outAlt = countAlt(
    buildCnxml(structure, parsed, equations, cnxmlText, {}, inlineAttrs).cnxml
  );
  return { rawAlt, outAlt, ok: rawAlt === outAlt };
}
