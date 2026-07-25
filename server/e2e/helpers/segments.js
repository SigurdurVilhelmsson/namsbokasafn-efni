// @ts-check
/**
 * Pick a real, editable segment out of a module at run time.
 *
 * WHY (C2): specs used to invent segment ids like `m68664:para:test-persist`.
 * That worked until the SR-OOS-2 backstop (2026-07-12) started resolving the
 * segment against the SERVER-loaded baseline before saving — invented ids now
 * 404, and `editor-workflow` + `ux-phase2` sat red on `main` for two weeks. A
 * hardcoded id is a standing bet that fixture content never moves; this helper
 * takes the bet off the table by reading the module the server actually serves.
 *
 * TWO INDEPENDENT CONSTRAINTS ARE ENCODED HERE.
 *
 * 1. The edit must survive the backstop. It re-runs `validateStructure` against
 *    its own baseline, so an edit that loses a structural marker is rejected
 *    with 400. Appending to the live baseline preserves every marker already in
 *    it — but it cannot conjure a marker that EN carries and the MT baseline
 *    dropped (`[[MATH:1]]`, `[#xref]`, `[doc#id]`, `[[MEDIA:1]]`). So candidates
 *    are screened with the REAL validator against the EXACT bytes that will be
 *    POSTed, not a hand-rolled regex approximation. New backstop rules are
 *    honoured automatically.
 *
 * 2. Sibling specs must not collide. `books/__e2e-fixture__` holds two modules
 *    and Playwright runs spec FILES in parallel, so several suites edit
 *    `m68664` at once. The claims as of 2026-07-25:
 *
 *      | spec                        | selector                     | resolves to     |
 *      |-----------------------------|------------------------------|-----------------|
 *      | concurrent-editing.spec.js  | `segments.find(s => s.is)`   | first segment   |
 *      | editor-lifecycle.spec.js    | `button.btn-edit` `.first()` | first segment   |
 *      | acceptance.spec.js          | `.btn-accept` `.last()`      | last segment    |
 *      | segment-editor.spec.js      | literal id                   | `…:abstract:auto-2` |
 *
 *    Hence: never the first segment, never the last, plus a caller-supplied
 *    `exclude` for id-pinned claims. Uniqueness across runs lives in the
 *    CONTENT (the caller's suffix), never in the id.
 *
 * @see docs/plans/2026-07-25-c2-playwright-red-handoff.md
 */

const segmentValidation = require('../../public/js/segment-validation');

/**
 * Would appending `suffix` to this segment's baseline survive the route's
 * structural-marker backstop? Uses the same function the route calls.
 *
 * @param {{en?: string, is?: string}} segment
 * @param {string} suffix
 * @returns {boolean}
 */
function isAppendSafe(segment, suffix) {
  // `validateStructure` returns `blocked: null` — not `[]` — when clean.
  const { blocked } = segmentValidation.validateStructure(
    segment.en,
    segment.is,
    `${segment.is}${suffix}`
  );
  return !blocked;
}

/**
 * @typedef {object} PickedSegment
 * @property {string} segmentId       Real id, as the server knows it.
 * @property {string} en              English source (for assertions/debugging).
 * @property {string} originalContent The live baseline — send this as `originalContent`.
 * @property {string} editedContent   Baseline + suffix — send this as `editedContent`.
 */

/**
 * Choose an append-safe segment that no sibling spec claims.
 *
 * @param {Array<{segmentId: string, en?: string, is?: string}>} segments
 * @param {{suffix: string, exclude?: string[]}} options
 *   `suffix` — run-unique text appended to the baseline; also the exact bytes
 *   screened for backstop safety. `exclude` — segment ids other specs pin.
 * @returns {PickedSegment}
 * @throws  If no segment qualifies — never returns undefined, because a silent
 *          miss here reappears downstream as an inscrutable 404.
 */
function chooseSegment(segments, options = {}) {
  const { suffix, exclude = [] } = options;

  if (!Array.isArray(segments)) {
    throw new Error(
      `chooseSegment: expected an array of segments, got ${Object.prototype.toString.call(segments)}`
    );
  }
  if (typeof suffix !== 'string' || suffix.length === 0) {
    throw new Error('chooseSegment: a non-empty `suffix` is required (run-unique edit content)');
  }

  const lastIndex = segments.length - 1;
  const candidate = segments.find(
    (segment, index) =>
      index !== 0 &&
      index !== lastIndex &&
      typeof segment.is === 'string' &&
      segment.is.length > 0 &&
      !exclude.includes(segment.segmentId) &&
      isAppendSafe(segment, suffix)
  );

  if (!candidate) {
    throw new Error(
      `chooseSegment: no append-safe segment among ${segments.length} ` +
        `(first and last are reserved for sibling specs` +
        `${exclude.length ? `; excluded: ${exclude.join(', ')}` : ''}). ` +
        `The fixture may have been regenerated — see server/e2e/helpers/segments.js.`
    );
  }

  return {
    segmentId: candidate.segmentId,
    en: candidate.en,
    originalContent: candidate.is,
    editedContent: `${candidate.is}${suffix}`,
  };
}

/**
 * Load a module through the real API and choose a segment from it.
 *
 * @param {{get: (url: string) => Promise<any>}} request Playwright `page.request`.
 * @param {{book: string, chapter: string|number, moduleId: string,
 *          suffix: string, exclude?: string[]}} options
 * @returns {Promise<PickedSegment>}
 */
async function pickEditableSegment(request, options) {
  const { book, chapter, moduleId, suffix, exclude } = options;
  const url = `/api/segment-editor/${book}/${chapter}/${moduleId}`;

  const res = await request.get(url);
  if (!res.ok()) {
    // Body included so a CI-only failure is diagnosable without a rerun.
    throw new Error(`pickEditableSegment: GET ${url} → ${res.status()}\n${await res.text()}`);
  }

  const data = await res.json();
  return chooseSegment(data.segments, { suffix, exclude });
}

module.exports = { chooseSegment, pickEditableSegment, isAppendSafe };
