/**
 * book-licences.cjs — per-book licence for export tools.
 *
 * Transcribed from docs/provenance/openstax-cnxml-licence-provenance.md §1
 * (the authoritative record; Physics resolved CC BY-NC-SA by user decision
 * 2026-06-24). Campaign item 17 will move licence metadata into book-config;
 * until then this file is the single swap point.
 *
 * getBookLicence THROWS on an unknown slug: a new book enters the export
 * corpus deliberately, licence-first — add its row here after checking the
 * provenance doc.
 */

const BOOK_LICENCES = {
  'efnafraedi-2e': { licence: 'CC BY 4.0', obtained: '2026-01-19' },
  'liffraedi-2e': { licence: 'CC BY 4.0', obtained: '2026-03-11' },
  orverufraedi: { licence: 'CC BY 4.0', obtained: '2026-03-09' },
  'edlisfraedi-2e': { licence: 'CC BY-NC-SA 4.0', obtained: '2026-03-23' },
  'lifraen-efnafraedi': { licence: 'CC BY-NC-SA 4.0', obtained: '2026-03-23' },
  // TEST FIXTURE — NOT a real-book provenance claim. `__e2e-fixture__` is the
  // committed E2E/apply-flow fixture book (see provenance doc §4 footnote);
  // it has faithful content, so its `scheduleTmRegen` calls would otherwise
  // fail-loud silently (fire-and-forget cron, warn-only) on every apply. A
  // placeholder entry is here purely so the fixture's TM regen doesn't go
  // stale; it says nothing about any real book's licence.
  '__e2e-fixture__': { licence: 'CC BY 4.0', obtained: '2026-01-01' },
};

/**
 * @param {string} slug
 * @returns {{licence: string, obtained: string}}
 */
function getBookLicence(slug) {
  const entry = BOOK_LICENCES[slug];
  if (!entry) {
    throw new Error(
      `No licence recorded for book "${slug}" — add it to tools/lib/book-licences.cjs ` +
        'after checking docs/provenance/openstax-cnxml-licence-provenance.md'
    );
  }
  return entry;
}

module.exports = { BOOK_LICENCES, getBookLicence };
