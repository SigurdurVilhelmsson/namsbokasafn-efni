import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const svc = require('../services/propagationService');
const { createSegmentEditsSchema } = require('./helpers/segmentEditsSchema.cjs');

describe('classifyOccurrence', () => {
  const P = 'Sýra og basi'; // propagated text

  it('eligible: no edit, current text differs', () => {
    expect(svc.classifyOccurrence(P, { currentIs: '', existingEdit: null })).toBe('eligible');
    expect(svc.classifyOccurrence(P, { currentIs: 'eitthvað annað', existingEdit: null })).toBe(
      'eligible'
    );
  });

  it('already-matches: no edit, current text equals propagated', () => {
    expect(svc.classifyOccurrence(P, { currentIs: P, existingEdit: null })).toBe('already-matches');
  });

  it('already-matches: existing edit equals propagated', () => {
    expect(
      svc.classifyOccurrence(P, {
        currentIs: 'x',
        existingEdit: { edited_content: P, status: 'pending' },
      })
    ).toBe('already-matches');
  });

  it("conflict: another editor's pending edit differs", () => {
    expect(
      svc.classifyOccurrence(P, {
        currentIs: 'x',
        editorId: '42',
        existingEdit: { edited_content: 'önnur þýðing', status: 'pending', editor_id: '99' },
      })
    ).toBe('conflict');
  });

  it('conflict: existing edit differs (applied)', () => {
    expect(
      svc.classifyOccurrence(P, {
        currentIs: 'x',
        editorId: '42',
        existingEdit: { edited_content: 'önnur', status: 'applied', editor_id: '42' },
      })
    ).toBe('conflict');
  });

  it("eligible: re-propagating over the editor's OWN pending edit (supersede)", () => {
    expect(
      svc.classifyOccurrence(P, {
        currentIs: 'x',
        editorId: '42',
        existingEdit: {
          edited_content: 'eldri sjálfvirk fjölgun',
          status: 'pending',
          editor_id: '42',
        },
      })
    ).toBe('eligible');
  });

  it('conflict: own edit but already approved (no longer supersedable)', () => {
    expect(
      svc.classifyOccurrence(P, {
        currentIs: 'x',
        editorId: '42',
        existingEdit: { edited_content: 'samþykkt', status: 'approved', editor_id: '42' },
      })
    ).toBe('conflict');
  });

  it('conflict: pending edit but editorId unknown (no self-supersede)', () => {
    expect(
      svc.classifyOccurrence(P, {
        currentIs: 'x',
        existingEdit: { edited_content: 'önnur þýðing', status: 'pending', editor_id: '42' },
      })
    ).toBe('conflict');
  });
});

describe('createPropagatedEdits', () => {
  const Database = require('better-sqlite3');

  function freshDb() {
    const d = new Database(':memory:');
    createSegmentEditsSchema(d);
    return d;
  }

  const base = {
    book: 'efnafraedi-2e',
    editorId: '42',
    editorUsername: 'tester',
    propagatedText: 'Sýra og basi',
    category: 'terminology',
    note: 'Sjálfvirk fjölgun',
  };

  it('creates pending edits for eligible occurrences, skips already-matches', () => {
    const d = freshDb();
    const occurrences = [
      { chapter: 1, moduleId: 'm001', segmentId: 'm001:para:a', currentIs: '' }, // eligible
      { chapter: 1, moduleId: 'm002', segmentId: 'm002:para:b', currentIs: 'Sýra og basi' }, // already-matches
    ];
    const res = svc.createPropagatedEdits(d, { ...base, occurrences });
    expect(res.created).toHaveLength(1);
    expect(res.created[0].moduleId).toBe('m001');
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0].reason).toBe('already-matches');

    const row = d.prepare(`SELECT * FROM segment_edits WHERE module_id = 'm001'`).get();
    expect(row.edited_content).toBe('Sýra og basi');
    expect(row.status).toBe('pending');
    expect(row.editor_id).toBe('42');
  });

  it("re-propagation updates the editor's own pending row in place (no duplicate)", () => {
    const d = freshDb();
    // First propagation by editor 42 creates a pending row.
    d.prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, status, editor_id, editor_username)
       VALUES (?, 1, 'm004', 'm004:para:d', 'orig', 'eldri þýðing', 'pending', '42', 'tester')`
    ).run(base.book);
    const occurrences = [
      { chapter: 1, moduleId: 'm004', segmentId: 'm004:para:d', currentIs: 'orig' },
    ];
    const res = svc.createPropagatedEdits(d, { ...base, occurrences });
    // Treated as a successful propagation, not a conflict.
    expect(res.created).toHaveLength(1);
    expect(res.skipped).toHaveLength(0);
    // Same single row, content replaced — invariant: one pending row per (seg, editor).
    const rows = d.prepare(`SELECT * FROM segment_edits WHERE module_id = 'm004'`).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].edited_content).toBe('Sýra og basi');
    expect(rows[0].status).toBe('pending');
  });

  it('skips a target with a conflicting pending edit', () => {
    const d = freshDb();
    d.prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, editor_id, editor_username)
       VALUES (?, 1, 'm003', 'm003:para:c', 'orig', 'önnur þýðing', '99', 'someone')`
    ).run(base.book);
    const occurrences = [
      { chapter: 1, moduleId: 'm003', segmentId: 'm003:para:c', currentIs: 'orig' },
    ];
    const res = svc.createPropagatedEdits(d, { ...base, occurrences });
    expect(res.created).toHaveLength(0);
    expect(res.skipped[0].reason).toBe('conflict');
    // did not overwrite the other editor's edit
    const rows = d.prepare(`SELECT COUNT(*) c FROM segment_edits WHERE module_id = 'm003'`).get();
    expect(rows.c).toBe(1);
  });
});

describe('latestEditedText', () => {
  const Database = require('better-sqlite3');

  function freshDb() {
    const d = new Database(':memory:');
    createSegmentEditsSchema(d);
    return d;
  }

  const BOOK = 'efnafraedi-2e';
  const MOD = 'm68664';
  const SEG = 'm68664:abstract:auto-2';

  function insertEdit(d, content, status = 'pending', appliedAt = null) {
    d.prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, status, editor_id, editor_username, applied_at)
       VALUES (?, 1, ?, ?, 'orig', ?, ?, '1', 'tester', ?)`
    ).run(BOOK, MOD, SEG, content, status, appliedAt);
  }

  it('returns null when no edit exists', () => {
    const d = freshDb();
    svc._setTestDb(d);
    expect(svc.latestEditedText(BOOK, MOD, SEG)).toBeNull();
  });

  it('returns the latest non-rejected edit content', () => {
    const d = freshDb();
    svc._setTestDb(d);
    insertEdit(d, 'Þýðing 1');
    expect(svc.latestEditedText(BOOK, MOD, SEG)).toBe('Þýðing 1');
  });

  it('ignores a rejected edit and returns null when that is the only edit', () => {
    const d = freshDb();
    svc._setTestDb(d);
    insertEdit(d, 'Þýðing hafnað', 'rejected');
    expect(svc.latestEditedText(BOOK, MOD, SEG)).toBeNull();
  });

  it('returns the newest non-rejected edit when multiple exist', () => {
    const d = freshDb();
    svc._setTestDb(d);
    // "applied" is not a status value — applied-ness is `applied_at IS NOT
    // NULL` on an 'approved' row. Seed the older edit as approved+applied.
    insertEdit(d, 'Þýðing gömul', 'approved', '2026-01-01 12:00:00');
    insertEdit(d, 'Þýðing ný', 'pending');
    expect(svc.latestEditedText(BOOK, MOD, SEG)).toBe('Þýðing ný');
  });

  it('skips rejected edits and returns the newest non-rejected one', () => {
    const d = freshDb();
    svc._setTestDb(d);
    insertEdit(d, 'Þýðing 1', 'approved');
    insertEdit(d, 'Þýðing hafnað', 'rejected');
    expect(svc.latestEditedText(BOOK, MOD, SEG)).toBe('Þýðing 1');
  });
});

describe('superseded rows are not live content', () => {
  const Database = require('better-sqlite3');

  function freshDb() {
    const d = new Database(':memory:');
    createSegmentEditsSchema(d);
    return d;
  }

  const BOOK = 'efnafraedi-2e';
  const MOD = 'm68664';
  const SEG = 'm68664:abstract:auto-2';

  const base = {
    book: BOOK,
    editorId: '42',
    editorUsername: 'tester',
    propagatedText: 'Sýra og basi',
    category: 'terminology',
    note: 'Sjálfvirk fjölgun',
  };

  function insertEdit(d, content, status = 'pending') {
    d.prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, status, editor_id, editor_username)
       VALUES (?, 1, ?, ?, 'orig', ?, ?, '1', 'tester')`
    ).run(BOOK, MOD, SEG, content, status);
  }

  it("latestEditedText ignores a superseded row even when it's the highest-id non-rejected candidate", () => {
    const d = freshDb();
    svc._setTestDb(d);
    // Lower-id rejected row, then a higher-id superseded row — the superseded
    // row would win a naive `status != 'rejected'` ORDER BY id DESC LIMIT 1.
    insertEdit(d, 'Þýðing hafnað eldri', 'rejected');
    insertEdit(d, 'Þýðing úrelt', 'superseded');
    expect(svc.latestEditedText(BOOK, MOD, SEG)).toBeNull();
  });

  it('createPropagatedEdits treats a superseded-only occurrence as propagatable, not conflict', () => {
    const d = freshDb();
    // Same shape: an older rejected row, then a newer superseded row is the
    // only non-rejected candidate for this segment.
    d.prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, status, editor_id, editor_username)
       VALUES (?, 1, 'm005', 'm005:para:e', 'orig', 'gömul höfnun', 'rejected', '7', 'someone')`
    ).run(base.book);
    d.prepare(
      `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, status, editor_id, editor_username)
       VALUES (?, 1, 'm005', 'm005:para:e', 'orig', 'úrelt eldri þýðing', 'superseded', '7', 'someone')`
    ).run(base.book);
    const occurrences = [
      { chapter: 1, moduleId: 'm005', segmentId: 'm005:para:e', currentIs: 'orig' },
    ];
    const res = svc.createPropagatedEdits(d, { ...base, occurrences });
    // A superseded row must not be read back as "the latest live edit" — the
    // occurrence should be eligible (propagated), not skipped as a conflict.
    expect(res.created).toHaveLength(1);
    expect(res.skipped).toHaveLength(0);
    const rows = d.prepare(`SELECT * FROM segment_edits WHERE module_id = 'm005'`).all();
    expect(rows).toHaveLength(3); // rejected + superseded (untouched) + new pending
    const pending = rows.find((r) => r.status === 'pending');
    expect(pending.edited_content).toBe('Sýra og basi');
  });
});
