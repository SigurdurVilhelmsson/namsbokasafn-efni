/**
 * Shared accept-eligibility scenarios (MTA-R3).
 *
 * ONE table, asserted TWICE: against the client predicate
 * (`public/js/accept-eligibility.js`, which gates the "Staðfesta MT" button and
 * the Óyfirfarnir facet) and against the authoritative server guard
 * (`acceptanceService.acceptSegment`).
 *
 * Divergence between those two gates IS the MTA-R3 defect — the client was
 * stricter than the server, so a segment the server would accept never offered
 * the button. A sixth hand-written copy of the rule would guarantee the next
 * divergence, so the rule lives in one module and this table is the pin that
 * keeps both sides honest: a change to either gate that the other doesn't
 * follow fails a test instead of shipping.
 *
 * `expect` is the blocking code, or null when the segment is accept-eligible.
 * Edit rows are given in the shape both sides can consume: the client reads
 * them off moduleData.edits, the parity test INSERTs them into segment_edits.
 */

const MT = 'Fyrsta efnisgrein.';

module.exports = {
  BASELINE: MT,
  CASES: [
    {
      name: 'virgin MT segment with no edit history',
      edits: [],
      expect: null,
    },
    {
      name: 'a pending edit is a revision in flight',
      edits: [{ status: 'pending', edited_content: 'Breytt.', applied_at: null }],
      expect: 'EDIT_EXISTS',
    },
    {
      name: 'an approved but unapplied edit is still in flight',
      edits: [{ status: 'approved', edited_content: 'Breytt.', applied_at: null }],
      expect: 'EDIT_EXISTS',
    },
    {
      name: 'a rejected edit leaves the MT standing (the MTA-R3 headline case)',
      edits: [{ status: 'rejected', edited_content: 'Breytt.', applied_at: null }],
      expect: null,
    },
    {
      name: 'a superseded edit leaves the MT standing',
      edits: [{ status: 'superseded', edited_content: 'Dregið til baka.', applied_at: null }],
      expect: null,
    },
    {
      name: 'an open discussion blocks attestation',
      edits: [{ status: 'discuss', edited_content: 'Breytt.', applied_at: null }],
      expect: 'DISCUSS_OPEN',
    },
    {
      name: 'an open discussion blocks even beside a rejected edit',
      edits: [
        { status: 'rejected', edited_content: 'Breytt.', applied_at: null },
        { status: 'discuss', edited_content: 'Önnur tillaga.', applied_at: null },
      ],
      expect: 'DISCUSS_OPEN',
    },
    {
      name: 'published human text that IS the live baseline is not MT',
      edits: [
        { status: 'approved', edited_content: MT, applied_at: '2026-07-19 10:05:00' },
      ],
      expect: 'HUMAN_CONTENT',
    },
    {
      name: 'a published edit no longer on disk does not block (restore edge, MTA-R4)',
      edits: [
        { status: 'approved', edited_content: 'Gömul breyting.', applied_at: '2026-07-01 10:05:00' },
      ],
      expect: null,
    },
  ],
};
