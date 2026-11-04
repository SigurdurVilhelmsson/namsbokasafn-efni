import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const svc = require('../services/propagationService');
const segmentParser = require('../services/segmentParser');
const concordance = require('../services/concordanceService');
const { sha256Text } = require('../lib/servedText');
const { writeModule } = require('./helpers/servedFixture');
const { createSegmentEditsSchema } = require('./helpers/segmentEditsSchema.cjs');
// item 20b final-review F4: createPropagatedEdits now calls
// acceptanceService.supersedeForEdit unconditionally on every eligible
// occurrence, which touches segment_acceptances — every freshDb() that backs
// a createPropagatedEdits call needs the table (migration043 precedent from
// Tasks 3/5).
const migration043 = require('../migrations/043-segment-acceptances');
const migration053 = require('../migrations/053-served-text-versions');

// G1.1 (plan Task 16, decision 13): createPropagatedEdits refuses, before any write, an occurrence
// without a string `en`, a defined `layer` and an integer `occurrence`, because it mints each
// target's served version from them, and (PR1 review C15) without a boolean `duplicated` and a
// string `currentIs`, because the duplicate-id skip and the base are decided from them.
// findOccurrences supplies all five; the literals below get the first four here, and every call
// names its currentIs, so each test still says only what it is about.
const occ = (over) => ({
  en: 'Acid and base.',
  layer: 'mt-output',
  occurrence: 0,
  duplicated: false,
  ...over,
});

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

describe('classifyOccurrence: the G1.1 skips', () => {
  const P = 'Sýra og basi';
  const ownPending = {
    edited_content: 'eldri sjálfvirk fjölgun',
    status: 'pending',
    editor_id: '42',
  };

  it("duplicate-id comes before every existing-edit rule, the editor's own pending row included", () => {
    expect(
      svc.classifyOccurrence(P, {
        duplicated: true,
        currentIs: '',
        existingEdit: ownPending,
        editorId: '42',
      })
    ).toBe('duplicate-id');
    // Before already-matches too: a duplicated id is never placed, whatever its text.
    expect(svc.classifyOccurrence(P, { duplicated: true, currentIs: P, existingEdit: null })).toBe(
      'duplicate-id'
    );
  });

  it('no-layer for a target whose module has no Icelandic layer', () => {
    expect(svc.classifyOccurrence(P, { layer: null, currentIs: '', existingEdit: null })).toBe(
      'no-layer'
    );
  });

  it('control: without duplicated or a null layer the verdicts are unchanged', () => {
    expect(
      svc.classifyOccurrence(P, { currentIs: '', existingEdit: ownPending, editorId: '42' })
    ).toBe('eligible');
    expect(
      svc.classifyOccurrence(P, {
        duplicated: false,
        layer: 'mt-output',
        currentIs: '',
        existingEdit: ownPending,
        editorId: '42',
      })
    ).toBe('eligible');
    expect(svc.classifyOccurrence(P, { layer: 'faithful', currentIs: P, existingEdit: null })).toBe(
      'already-matches'
    );
    // An absent layer is not a null one: only findOccurrences' null means "no layer".
    expect(svc.classifyOccurrence(P, { currentIs: '', existingEdit: null })).toBe('eligible');
  });
});

describe('createPropagatedEdits', () => {
  const Database = require('better-sqlite3');

  function freshDb() {
    const d = new Database(':memory:');
    createSegmentEditsSchema(d);
    migration043.up(d);
    migration053.up(d);
    return d;
  }

  const base = {
    book: 'efnafraedi-2e',
    editorId: '42',
    editorUsername: 'tester',
    propagatedText: 'Sýra og basi',
    category: 'terminology',
    note: 'Sjálfvirk fjölgun',
    // No EN-rule interference intended in this describe block — '' legitimately
    // carries no EN markers, so only original-IS rules can fire (SR-OOS-2 FIX4:
    // sourceEn is now required, not just checked with `!== undefined`).
    sourceEn: '',
  };

  it('creates pending edits for eligible occurrences, skips already-matches', () => {
    const d = freshDb();
    const occurrences = [
      occ({ chapter: 1, moduleId: 'm001', segmentId: 'm001:para:a', currentIs: '' }), // eligible
      occ({ chapter: 1, moduleId: 'm002', segmentId: 'm002:para:b', currentIs: 'Sýra og basi' }), // already-matches
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
      occ({ chapter: 1, moduleId: 'm004', segmentId: 'm004:para:d', currentIs: 'orig' }),
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
      occ({ chapter: 1, moduleId: 'm003', segmentId: 'm003:para:c', currentIs: 'orig' }),
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
    migration043.up(d);
    migration053.up(d);
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
    // No EN-rule interference intended — see the sibling describe block's note.
    sourceEn: '',
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
      occ({ chapter: 1, moduleId: 'm005', segmentId: 'm005:para:e', currentIs: 'orig' }),
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

describe('createPropagatedEdits supersedes an active acceptance (final-review F4)', () => {
  const Database = require('better-sqlite3');

  function freshDb() {
    const d = new Database(':memory:');
    createSegmentEditsSchema(d);
    migration043.up(d);
    migration053.up(d);
    return d;
  }

  const base = {
    book: 'efnafraedi-2e',
    editorId: '42',
    editorUsername: 'tester',
    propagatedText: 'Sýra og basi',
    category: 'terminology',
    note: 'Sjálfvirk fjölgun',
    sourceEn: '',
  };

  it("an eligible propagated edit flips the segment's active acceptance to superseded-by-edit", () => {
    const d = freshDb();
    d.prepare(
      `INSERT INTO segment_acceptances
         (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
       VALUES (?, 1, 'm020', 'm020:para:h', 'gömul', 'u1', 'editor1')`
    ).run(base.book);
    const occurrences = [
      occ({ chapter: 1, moduleId: 'm020', segmentId: 'm020:para:h', currentIs: 'gömul' }),
    ];
    const res = svc.createPropagatedEdits(d, { ...base, occurrences });
    expect(res.created).toHaveLength(1);

    const acc = d.prepare(`SELECT * FROM segment_acceptances WHERE module_id = 'm020'`).get();
    expect(acc.status).toBe('superseded');
    expect(acc.superseded_reason).toBe('superseded-by-edit');
  });

  it('a skipped (already-matches) occurrence leaves its acceptance untouched', () => {
    const d = freshDb();
    d.prepare(
      `INSERT INTO segment_acceptances
         (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
       VALUES (?, 1, 'm021', 'm021:para:i', 'Sýra og basi', 'u1', 'editor1')`
    ).run(base.book);
    const occurrences = [
      // currentIs already equals propagatedText → already-matches, not eligible.
      occ({ chapter: 1, moduleId: 'm021', segmentId: 'm021:para:i', currentIs: 'Sýra og basi' }),
    ];
    const res = svc.createPropagatedEdits(d, { ...base, occurrences });
    expect(res.skipped).toHaveLength(1);

    const acc = d.prepare(`SELECT * FROM segment_acceptances WHERE module_id = 'm021'`).get();
    expect(acc.status).toBe('active');
  });
});

describe('structural-marker guard on propagation (SR-OOS-2 D8)', () => {
  const Database = require('better-sqlite3');

  function freshDb() {
    const d = new Database(':memory:');
    createSegmentEditsSchema(d);
    migration043.up(d);
    migration053.up(d);
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

  it('skips an occurrence whose currentIs carries a link the propagated text drops', () => {
    const d = freshDb();
    const occurrences = [
      // baseline carries a markdown link; propagatedText ('Sýra og basi') omits it → blocked.
      occ({
        chapter: 1,
        moduleId: 'm010',
        segmentId: 'm010:para:link',
        currentIs: 'Sjá [hlekk](http://example.com) hér.',
      }),
      // no structural markers, differs from propagatedText → still eligible.
      occ({ chapter: 1, moduleId: 'm011', segmentId: 'm011:para:plain', currentIs: '' }),
    ];
    const res = svc.createPropagatedEdits(d, {
      ...base,
      sourceEn: 'See the link here.',
      occurrences,
    });
    expect(res.created).toHaveLength(1);
    expect(res.created[0].moduleId).toBe('m011');
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]).toEqual({
      moduleId: 'm010',
      segmentId: 'm010:para:link',
      reason: 'structure_blocked',
    });

    const blockedRow = d.prepare(`SELECT * FROM segment_edits WHERE module_id = 'm010'`).get();
    expect(blockedRow).toBeUndefined();
    const createdRow = d.prepare(`SELECT * FROM segment_edits WHERE module_id = 'm011'`).get();
    expect(createdRow.edited_content).toBe('Sýra og basi');
  });

  it('propagates normally when baselines are marker-compatible', () => {
    const d = freshDb();
    const occurrences = [
      occ({ chapter: 1, moduleId: 'm012', segmentId: 'm012:para:g', currentIs: '' }),
    ];
    const res = svc.createPropagatedEdits(d, {
      ...base,
      sourceEn: 'Acid and base.',
      occurrences,
    });
    expect(res.created).toHaveLength(1);
    expect(res.skipped).toHaveLength(0);

    const row = d.prepare(`SELECT * FROM segment_edits WHERE module_id = 'm012'`).get();
    expect(row.edited_content).toBe('Sýra og basi');
    expect(row.status).toBe('pending');
  });

  it('omitting sourceEn throws — arming must fail loud, not silently disarm (SR-OOS-2 FIX4)', () => {
    const d = freshDb();
    const occurrences = [
      occ({ chapter: 1, moduleId: 'm099', segmentId: 'm099:para:z', currentIs: '' }),
    ];
    expect(() => {
      svc.createPropagatedEdits(d, {
        book: base.book,
        editorId: base.editorId,
        editorUsername: base.editorUsername,
        propagatedText: base.propagatedText,
        category: base.category,
        note: base.note,
        occurrences,
        // sourceEn intentionally omitted.
      });
    }).toThrow(/sourceEn is required/);
    const row = d.prepare(`SELECT * FROM segment_edits WHERE module_id = 'm099'`).get();
    expect(row).toBeUndefined();
  });
});

describe('createPropagatedEdits: each target gets its own served base (G1.1, T16, T5)', () => {
  const Database = require('better-sqlite3');

  function freshDb() {
    const d = new Database(':memory:');
    createSegmentEditsSchema(d);
    migration043.up(d);
    migration053.up(d);
    return d;
  }

  const base = {
    book: 'efnafraedi-2e',
    editorId: '42',
    editorUsername: 'tester',
    propagatedText: 'Sýra og basi',
    category: 'terminology',
    note: 'Sjálfvirk fjölgun',
    sourceEn: '',
  };

  const rowsOf = (d, moduleId) =>
    d.prepare('SELECT * FROM segment_edits WHERE module_id = ? ORDER BY id').all(moduleId);
  const versionsOf = (d, moduleId) =>
    d.prepare('SELECT * FROM served_text_versions WHERE module_id = ? ORDER BY id').all(moduleId);
  const versionById = (d, id) =>
    d.prepare('SELECT * FROM served_text_versions WHERE id = ?').get(id);

  it('T16: an inserted target carries origin, the target’s loaded base and its served version', () => {
    const d = freshDb();
    const res = svc.createPropagatedEdits(d, {
      ...base,
      occurrences: [
        {
          chapter: 1,
          moduleId: 'm030',
          segmentId: 'm030:para:a',
          en: 'Acid.',
          currentIs: 'Sýra.',
          layer: 'mt-output',
          occurrence: 0,
          duplicated: false,
        },
      ],
    });
    expect(res).toEqual({ created: [{ moduleId: 'm030', segmentId: 'm030:para:a' }], skipped: [] });

    const rows = rowsOf(d, 'm030');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      original_content: 'Sýra.',
      edited_content: 'Sýra og basi',
      origin: 'propagation',
      occurrence: 0,
      displayed_edit_id: null,
      displayed_edit_sha256: null,
    });
    expect(rows[0].served_version_id).not.toBeNull();
    expect(versionById(d, rows[0].served_version_id)).toMatchObject({
      book: 'efnafraedi-2e',
      chapter: 1,
      module_id: 'm030',
      segment_id: 'm030:para:a',
      occurrence: 0,
      en_text: 'Acid.',
      is_text: 'Sýra.',
      en_sha256: sha256Text('Acid.'),
      is_sha256: sha256Text('Sýra.'),
      layer: 'mt-output',
    });
  });

  it('T16: the in-place update of the propagator’s own pending row moves the base and clears the displayed pair', () => {
    const d = freshDb();
    const seeded = d
      .prepare(
        `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content,
           status, editor_id, editor_username, origin, displayed_edit_id, displayed_edit_sha256)
         VALUES (?, 1, 'm031', 'm031:para:b', 'gamalt', 'eldri þýðing', 'pending', '42', 'tester',
           'editor-save', 5, ?)`
      )
      .run(base.book, sha256Text('sýnd breyting'));
    const res = svc.createPropagatedEdits(d, {
      ...base,
      occurrences: [
        occ({
          chapter: 1,
          moduleId: 'm031',
          segmentId: 'm031:para:b',
          en: 'Base.',
          currentIs: 'nýtt grunn',
        }),
      ],
    });
    expect(res.created).toEqual([{ moduleId: 'm031', segmentId: 'm031:para:b', superseded: true }]);

    const rows = rowsOf(d, 'm031');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(Number(seeded.lastInsertRowid));
    expect(rows[0]).toMatchObject({
      original_content: 'nýtt grunn',
      edited_content: 'Sýra og basi',
      origin: 'propagation',
      occurrence: 0,
      status: 'pending',
    });
    expect([rows[0].displayed_edit_id, rows[0].displayed_edit_sha256]).toEqual([null, null]);
    expect(rows[0].served_version_id).not.toBeNull();
    expect(versionById(d, rows[0].served_version_id)).toMatchObject({
      module_id: 'm031',
      segment_id: 'm031:para:b',
      en_text: 'Base.',
      is_text: 'nýtt grunn',
      layer: 'mt-output',
    });
  });

  it('T5: a duplicated target is skipped and listed with its occurrence; nothing is written for it', () => {
    const d = freshDb();
    const res = svc.createPropagatedEdits(d, {
      ...base,
      occurrences: [
        occ({
          chapter: 1,
          moduleId: 'm032',
          segmentId: 'm032:para:d',
          currentIs: '',
          duplicated: true,
          occurrence: 0,
        }),
        occ({
          chapter: 1,
          moduleId: 'm032',
          segmentId: 'm032:para:d',
          currentIs: '',
          duplicated: true,
          occurrence: 1,
        }),
        occ({ chapter: 1, moduleId: 'm033', segmentId: 'm033:para:e', currentIs: '' }),
      ],
    });
    expect(res.skipped).toEqual([
      { moduleId: 'm032', segmentId: 'm032:para:d', reason: 'duplicate-id', occurrence: 0 },
      { moduleId: 'm032', segmentId: 'm032:para:d', reason: 'duplicate-id', occurrence: 1 },
    ]);
    expect(rowsOf(d, 'm032')).toEqual([]);
    expect(versionsOf(d, 'm032')).toEqual([]);

    // Control: the plain target in the same call is created, with its version.
    expect(res.created).toEqual([{ moduleId: 'm033', segmentId: 'm033:para:e' }]);
    const created = rowsOf(d, 'm033');
    expect(created).toHaveLength(1);
    expect(versionById(d, created[0].served_version_id)).toMatchObject({
      module_id: 'm033',
      segment_id: 'm033:para:e',
    });
  });

  it('a layerless target is skipped as no-layer', () => {
    const d = freshDb();
    const res = svc.createPropagatedEdits(d, {
      ...base,
      occurrences: [
        occ({ chapter: 1, moduleId: 'm034', segmentId: 'm034:para:f', currentIs: '', layer: null }),
        occ({ chapter: 1, moduleId: 'm039', segmentId: 'm039:para:g', currentIs: '' }),
      ],
    });
    expect(res.skipped[0].reason).toBe('no-layer');
    // Every skip but duplicate-id keeps its shape: no occurrence key.
    expect(res.skipped).toEqual([
      { moduleId: 'm034', segmentId: 'm034:para:f', reason: 'no-layer' },
    ]);
    expect(rowsOf(d, 'm034')).toEqual([]);
    expect(versionsOf(d, 'm034')).toEqual([]);
    // Control: the target with a layer is written.
    expect(rowsOf(d, 'm039')).toHaveLength(1);
  });

  it('refuses before any write when an occurrence lacks en, layer, occurrence, duplicated or currentIs', () => {
    const omissions = {
      en: (o) => delete o.en,
      layer: (o) => delete o.layer,
      occurrence: (o) => delete o.occurrence,
      'a non-string en': (o) => (o.en = 7),
      'a non-integer occurrence': (o) => (o.occurrence = '0'),
      // PR1 review C15: an absent or falsy-but-not-false `duplicated` read as "not duplicated", so a
      // duplicated-id target was written; a non-string currentIs got past this guard and threw only
      // inside the write's transaction, at the mint.
      duplicated: (o) => delete o.duplicated,
      'a non-boolean duplicated': (o) => (o.duplicated = 0),
      currentIs: (o) => delete o.currentIs,
      'a non-string currentIs': (o) => (o.currentIs = null),
    };
    for (const [what, omit] of Object.entries(omissions)) {
      const d = freshDb();
      const bad = occ({ chapter: 1, moduleId: 'm036', segmentId: 'm036:para:i', currentIs: '' });
      omit(bad);
      const occurrences = [
        // A valid target first: a check inside the loop would reach it before the bad one.
        occ({ chapter: 1, moduleId: 'm035', segmentId: 'm035:para:h', currentIs: '' }),
        bad,
      ];
      expect(() => svc.createPropagatedEdits(d, { ...base, occurrences }), what).toThrow(
        /createPropagatedEdits:/
      );
      expect(d.prepare('SELECT COUNT(*) AS n FROM segment_edits').get().n, what).toBe(0);
      expect(d.prepare('SELECT COUNT(*) AS n FROM served_text_versions').get().n, what).toBe(0);
    }
  });

  it('a direct call on organic mints nothing and writes nothing (the route refuses it first)', () => {
    const d = freshDb();
    expect(() =>
      svc.createPropagatedEdits(d, {
        ...base,
        book: 'lifraen-efnafraedi',
        occurrences: [
          occ({ chapter: 1, moduleId: 'm040', segmentId: 'm040:para:j', currentIs: '' }),
        ],
      })
    ).toThrow(expect.objectContaining({ code: 'BOOK_NOT_MINTED' }));
    expect(d.prepare('SELECT COUNT(*) AS n FROM segment_edits').get().n).toBe(0);
    expect(d.prepare('SELECT COUNT(*) AS n FROM served_text_versions').get().n).toBe(0);
  });
});

describe('findOccurrences reports occurrence, duplicated and layer (G1.1)', () => {
  const Database = require('better-sqlite3');
  const BOOK = 'efnafraedi-2e';
  const EN = 'Recurring sentence.';

  it('findOccurrences reports occurrence, duplicated and layer', () => {
    const d = new Database(':memory:');
    createSegmentEditsSchema(d);
    svc._setTestDb(d);
    const realBooksDir = segmentParser.BOOKS_DIR;
    const root = mkdtempSync(path.join(tmpdir(), 'find-occurrences-'));
    try {
      writeModule(root, {
        book: BOOK,
        chapterDir: 'ch01',
        moduleId: 'm037',
        en: [
          ['m037:para:c', EN],
          ['m037:para:d', EN],
          ['m037:para:d', EN],
          ['m037:para:z', 'Something else.'],
        ],
        mt: [
          ['m037:para:c', 'IS c'],
          ['m037:para:d', 'IS d1'],
          ['m037:para:d', 'IS d2'],
          ['m037:para:z', 'IS z'],
        ],
      });
      // EN only: the module has no Icelandic layer.
      writeModule(root, {
        book: BOOK,
        chapterDir: 'ch02',
        moduleId: 'm038',
        en: [['m038:para:e', EN]],
      });
      segmentParser._setTestBooksDir(root);

      const found = svc.findOccurrences(BOOK, concordance.normalizeEn(EN));
      const pick = ({ chapter, moduleId, segmentId, occurrence, duplicated, layer, en }) => ({
        chapter,
        moduleId,
        segmentId,
        occurrence,
        duplicated,
        layer,
        en,
      });
      expect(found.map(pick)).toEqual([
        {
          chapter: 1,
          moduleId: 'm037',
          segmentId: 'm037:para:c',
          occurrence: 0,
          duplicated: false,
          layer: 'mt-output',
          en: EN,
        },
        {
          chapter: 1,
          moduleId: 'm037',
          segmentId: 'm037:para:d',
          occurrence: 0,
          duplicated: true,
          layer: 'mt-output',
          en: EN,
        },
        {
          chapter: 1,
          moduleId: 'm037',
          segmentId: 'm037:para:d',
          occurrence: 1,
          duplicated: true,
          layer: 'mt-output',
          en: EN,
        },
        {
          chapter: 2,
          moduleId: 'm038',
          segmentId: 'm038:para:e',
          occurrence: 0,
          duplicated: false,
          layer: null,
          en: EN,
        },
      ]);
      // The existing fields are unchanged beside the new ones.
      expect(found[0].currentIs).toBe('IS c');
      expect(found[0].existingEdit).toBeNull();
      expect(found[3].currentIs).toBe('');
    } finally {
      segmentParser._setTestBooksDir(realBooksDir);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
