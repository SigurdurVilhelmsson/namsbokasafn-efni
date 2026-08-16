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
 * Injecting the ENGLISH back is what makes this a pure structural check: no
 * translation is involved, so any difference is the pipeline losing an
 * attribute, never a content decision.
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
