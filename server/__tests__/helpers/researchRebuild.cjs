// server/__tests__/helpers/researchRebuild.cjs
/**
 * The editing record rebuilt purely from the research events, and its comparison with the real table
 * (G1.2 PR3, Task 29, spec T11; Task 30 reuses it). Plain CJS so ESM vitest files can load it via createRequire.
 *
 * Timestamps are not rebuilt (they are compared only as order, by the test). Keys are projected on the actual side
 * (provider id -> editor key), so the rebuild needs no inverse map.
 */
const { sha256Text } = require('../../lib/servedText');

const FIELDS = [
  'book',
  'chapter',
  'module_id',
  'segment_id',
  'occurrence',
  'edited_content',
  'editor_note_sha256',
  'reviewer_note_sha256',
  'category',
  'status',
  'applied',
  'served_version_id',
  'origin',
  'editor_key',
  'reviewer_key',
];
const n = (v) => (v === null || v === undefined ? null : Number(v)); // sessions.db ids: safe as Number
const noteSha = (c) => (c && c.note ? c.note.sha256 : null);

/** events: allEvents() order (server time, then key_seq). Returns Map<editId, row-projection>. */
function rebuildSegmentEdits(events) {
  // Decision 65: a text another editor held live is stored as content.textSha256. It is resolved from any event in
  // the file whose content carries that text (the other editor's own save, if they consented); a text no event
  // carries (a decliner's) stays { sha256 }, which diffRebuild compares by hash.
  const textByHash = new Map();
  for (const e of events) {
    if (e.content && typeof e.content.text === 'string') {
      textByHash.set(sha256Text(e.content.text), e.content.text);
    }
  }
  const textOf = (c) =>
    typeof c.text === 'string'
      ? c.text
      : (textByHash.get(c.textSha256) ?? { sha256: c.textSha256 });
  const rows = new Map();
  for (const e of events) {
    const id = n(e.editing_id);
    const at = {
      book: e.book,
      chapter: n(e.chapter),
      module_id: e.module_id,
      segment_id: e.segment_id,
      occurrence: n(e.occurrence),
    };
    const write = (r) =>
      Object.assign(r, {
        edited_content: textOf(e.content),
        editor_note_sha256: noteSha(e.content),
        category: e.content.category ?? null,
        served_version_id: n(e.served_version_id),
        origin: e.origin,
      });
    const fresh = () =>
      write({
        ...at,
        status: 'pending',
        applied: false,
        reviewer_note_sha256: null,
        editor_key: e.editor_key,
        reviewer_key: null,
      });
    // A row whose creating event is missing (the dropped-event control) is skipped, never invented: the
    // difference must show up in diffRebuild, not as a TypeError here.
    const set = (rid, fields) => {
      const r = rows.get(n(rid));
      if (r) Object.assign(r, fields);
    };
    switch (e.event_type) {
      case 'edit-save':
        rows.set(id, fresh());
        for (const s of e.detail.supersededEditIds) set(s, { status: 'superseded' });
        break;
      case 'edit-resave':
        if (rows.has(id)) write(rows.get(id));
        for (const s of e.detail.supersededEditIds) set(s, { status: 'superseded' });
        break;
      case 'propagation':
        if (!e.before) rows.set(id, fresh());
        else if (rows.has(id)) write(rows.get(id));
        break;
      case 'edit-withdraw':
      case 'edit-delete':
        rows.delete(id);
        break;
      case 'edit-approve':
      case 'edit-reject':
      case 'edit-discuss':
        set(id, {
          status: {
            'edit-approve': 'approved',
            'edit-reject': 'rejected',
            'edit-discuss': 'discuss',
          }[e.event_type],
          reviewer_key: e.editor_key,
          reviewer_note_sha256: noteSha(e.content),
        });
        break;
      case 'edit-unapprove':
      case 'edit-return-to-pending':
        set(id, { status: 'pending', reviewer_key: null, reviewer_note_sha256: null });
        break;
      case 'apply':
        for (const a of e.detail.selfHealReset.editIds) set(a, { applied: false });
        for (const a of e.detail.applied) set(a, { applied: true });
        for (const s of e.detail.superseded) {
          set(s, {
            status: 'superseded',
            applied: true,
            reviewer_note_sha256: e.detail.supersededReviewerNote.sha256,
          });
        }
        break;
      default:
        break; // module-level and acceptance events do not change segment_edits
    }
  }
  return rows;
}

/** The real table projected onto FIELDS. keyOfProvider(providerId) -> editor key or null. */
function actualSegmentEdits(db, keyOfProvider) {
  const out = new Map();
  for (const r of db.prepare('SELECT * FROM segment_edits ORDER BY id').all()) {
    out.set(Number(r.id), {
      book: r.book,
      chapter: n(r.chapter),
      module_id: r.module_id,
      segment_id: r.segment_id,
      occurrence: n(r.occurrence),
      edited_content: r.edited_content,
      editor_note_sha256: r.editor_note === null ? null : sha256Text(r.editor_note),
      reviewer_note_sha256: r.reviewer_note === null ? null : sha256Text(r.reviewer_note),
      category: r.category ?? null,
      status: r.status,
      applied: r.applied_at !== null,
      served_version_id: n(r.served_version_id),
      origin: r.origin,
      editor_key: keyOfProvider(r.editor_id),
      reviewer_key: r.reviewer_id === null ? null : keyOfProvider(r.reviewer_id),
    });
  }
  return out;
}

const sameValue = (rebuilt, actual) =>
  rebuilt && typeof rebuilt === 'object' && 'sha256' in rebuilt
    ? typeof actual === 'string' && sha256Text(actual) === rebuilt.sha256
    : rebuilt === actual;

/** @returns {{id: number, field: string, rebuilt?: any, actual?: any}[]} sorted by id, then field */
function diffRebuild(rebuilt, actual) {
  const diffs = [];
  const ids = [...new Set([...rebuilt.keys(), ...actual.keys()])].sort((a, b) => a - b);
  for (const id of ids) {
    const a = rebuilt.get(id);
    const b = actual.get(id);
    if (!a || !b) {
      diffs.push({ id, field: '<row>' });
      continue;
    }
    for (const field of FIELDS) {
      if (!sameValue(a[field], b[field])) {
        diffs.push({ id, field, rebuilt: a[field], actual: b[field] });
      }
    }
  }
  return diffs;
}

module.exports = { FIELDS, rebuildSegmentEdits, actualSegmentEdits, diffRebuild };
