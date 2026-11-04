/**
 * T17: nothing of the research reaches a browser (spec §10 and §11; index decision 15).
 *
 * One file, grown by every PR: each PR appends its own `describe`, and a new editing column joins
 * ALLOWED_COLUMNS only in the commit of the migration that adds it. Every `describe` carries a
 * planted control, so a check that cannot see a violation cannot pass.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');

// Every column the module route sends to every editor's browser through SELECT *
// (segmentEditorService.getModuleEdits, acceptanceService.getModuleAcceptances). A column joins
// this list only after asking whether the tool needs it and whether every editor may see it
// (spec §5.8, R3).
const ALLOWED_COLUMNS = Object.freeze({
  segment_edits: [
    'id',
    'book',
    'chapter',
    'module_id',
    'segment_id',
    'original_content',
    'edited_content',
    'category',
    'editor_note',
    'status',
    'editor_id',
    'editor_username',
    'reviewer_id',
    'reviewer_username',
    'reviewer_note',
    'created_at',
    'reviewed_at',
    'applied_at',
    'review_id',
    // PR1
    'served_version_id',
    'occurrence',
    'origin',
    'displayed_edit_id',
    'displayed_edit_sha256',
  ],
  segment_acceptances: [
    'id',
    'book',
    'chapter',
    'module_id',
    'segment_id',
    'accepted_content',
    'accepted_by',
    'accepted_by_username',
    'accepted_at',
    'status',
    'superseded_at',
    'superseded_reason',
    'applied_at',
    // PR1
    'served_version_id',
    'occurrence',
  ],
});

function columnDrift(db, table, allowed) {
  const have = db.pragma(`table_info(${table})`).map((c) => c.name);
  return {
    unexpected: have.filter((c) => !allowed.includes(c)).sort(),
    missing: allowed.filter((c) => !have.includes(c)).sort(),
  };
}

describe('T17 (PR1): the editing columns the module route sends are an allowlist', () => {
  for (const table of Object.keys(ALLOWED_COLUMNS)) {
    it(`${table} has exactly the allowed columns`, () => {
      const { db } = freshMigratedDb();
      expect(columnDrift(db, table, ALLOWED_COLUMNS[table])).toEqual({
        unexpected: [],
        missing: [],
      });
    });
  }

  it('control: a planted column is reported by name', () => {
    const { db } = freshMigratedDb();
    db.exec('ALTER TABLE segment_edits ADD COLUMN research_probe TEXT');
    expect(columnDrift(db, 'segment_edits', ALLOWED_COLUMNS.segment_edits).unexpected).toEqual([
      'research_probe',
    ]);
  });
});
