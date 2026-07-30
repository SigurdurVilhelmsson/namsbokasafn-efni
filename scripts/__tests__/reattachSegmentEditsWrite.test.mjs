import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const Database = require(path.join(REPO_ROOT, 'server', 'node_modules', 'better-sqlite3'));
const {
  createSegmentEditsSchema,
} = require(path.join(REPO_ROOT, 'server', '__tests__', 'helpers', 'segmentEditsSchema.cjs'));
const migration043 = require(path.join(REPO_ROOT, 'server', 'migrations', '043-segment-acceptances'));

let tmp, db, booksDir, service;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c16-write-'));
  booksDir = path.join(tmp, 'books');
  const mtDir = path.join(booksDir, 'testbook', '02-mt-output', 'ch01');
  fs.mkdirSync(mtDir, { recursive: true });
  fs.writeFileSync(
    path.join(mtDir, 'm001-segments.is.md'),
    '<!-- SEG:m001:para:fs-id0 -->\nönnur vélþýðing\n\n' +
      '<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n'
  );
  db = new Database(path.join(tmp, 'test.db'));
  createSegmentEditsSchema(db);
  // saveSegmentEdit calls acceptanceService.supersedeForEdit inside BOTH its
  // save transactions, on its own connection — without segment_acceptances the
  // write throws "no such table". Same trap, same fix as
  // server/__tests__/mtLockOnFirstEdit.test.js.
  migration043.up(db);
  service = require(path.join(REPO_ROOT, 'server', 'services', 'segmentEditorService.js'));
  service._setTestDb(db);
});

afterEach(() => {
  db.close();
  // Clear the service's module-level singleton too: leaving the closed handle
  // installed would make any later save in this file fail on a dead DB.
  service._setTestDb(null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

const snapshot = {
  schema: 1,
  book: 'testbook',
  modules: ['m001'],
  edits: [
    {
      id: 1,
      book: 'testbook',
      chapter: 1,
      module_id: 'm001',
      segment_id: 'm001:para:fs-id1',
      original_content: 'gamalt',
      edited_content: 'leiðrétt',
      editor_id: 'u1',
      editor_username: 'Editor',
      status: 'approved',
      category: null,
      editor_note: null,
      reviewer_note: null,
      context: { en: 'English one', mtAtSnapshot: 'gamalt' },
    },
  ],
};

describe('applyReattach', () => {
  it('writes the restored edit as PENDING', async () => {
    const { planReattach, applyReattach } = await import('../reattach-segment-edits.js');
    const plan = planReattach({ snapshot, booksDir });
    applyReattach({ plan, saveSegmentEdit: service.saveSegmentEdit });
    const row = db.prepare('SELECT * FROM segment_edits').get();
    expect(row.status).toBe('pending');
    expect(row.edited_content).toBe('leiðrétt');
  });

  it('sets original_content to the NEW MT so the editor diff is meaningful', async () => {
    const { planReattach, applyReattach } = await import('../reattach-segment-edits.js');
    applyReattach({
      plan: planReattach({ snapshot, booksDir }),
      saveSegmentEdit: service.saveSegmentEdit,
    });
    expect(db.prepare('SELECT original_content c FROM segment_edits').get().c).toBe('ný vélþýðing');
  });

  it('preserves the original editor attribution', async () => {
    const { planReattach, applyReattach } = await import('../reattach-segment-edits.js');
    applyReattach({
      plan: planReattach({ snapshot, booksDir }),
      saveSegmentEdit: service.saveSegmentEdit,
    });
    const row = db.prepare('SELECT editor_id, editor_username FROM segment_edits').get();
    expect(row.editor_id).toBe('u1');
    expect(row.editor_username).toBe('Editor');
  });

  it('carries the composed note, old MT included', async () => {
    const { planReattach, applyReattach } = await import('../reattach-segment-edits.js');
    applyReattach({
      plan: planReattach({ snapshot, booksDir }),
      saveSegmentEdit: service.saveSegmentEdit,
    });
    expect(db.prepare('SELECT editor_note n FROM segment_edits').get().n).toContain('gamalt');
  });
});

// Two restorable rows on ONE saveSegmentEdit key. Realistic, not contrived:
// the pending-uniqueness index is partial and the supersede sweep never
// touches `approved`, so production can hold both, and RESTORABLE_STATUSES
// admits both. Written blind, the second UPDATEs the first and an editor's
// text is gone while the counter reports two writes.
// ⚠️ The CLEAN row is ordered FIRST on purpose, and the fixture is worthless
// without it. With only the colliding pair, the colliding item is item 1, so a
// per-item mid-loop refusal and a pre-flight refusal are indistinguishable —
// measured: a mid-loop variant passed the entire suite. With a clean row ahead
// of the pair, a mid-loop check INSERTs it and only then throws, leaving one row
// in a one-way migration while telling the operator nothing was written.
const collidingSnapshot = {
  ...snapshot,
  edits: [
    { ...snapshot.edits[0], id: 3, segment_id: 'm001:para:fs-id0', edited_content: 'HREINN' },
    { ...snapshot.edits[0], id: 1, status: 'approved', edited_content: 'GÖMUL-SAMÞYKKT' },
    { ...snapshot.edits[0], id: 2, status: 'pending', edited_content: 'NÝRRI-Í-BIÐ' },
  ],
};

describe('applyReattach — duplicate-key refusal', () => {
  it('refuses rather than let one snapshot key overwrite itself', async () => {
    const { planReattach, applyReattach } = await import('../reattach-segment-edits.js');
    const plan = planReattach({ snapshot: collidingSnapshot, booksDir });
    expect(() => applyReattach({ plan, saveSegmentEdit: service.saveSegmentEdit })).toThrow(
      /m001:para:fs-id1/
    );
  });

  it('writes NOTHING when it refuses — the check is pre-flight, not mid-loop', async () => {
    const { planReattach, applyReattach } = await import('../reattach-segment-edits.js');
    const plan = planReattach({ snapshot: collidingSnapshot, booksDir });
    // Non-vacuity: without this the test is also green when the planner
    // produced nothing at all — e.g. the silent empty parse a spaced
    // `<!-- SEG: … -->` marker causes (CLAUDE.md's documented trap).
    expect(plan.restore).toHaveLength(3);
    try {
      applyReattach({ plan, saveSegmentEdit: service.saveSegmentEdit });
    } catch {
      /* expected — the assertion is about the DB, not the throw */
    }
    expect(db.prepare('SELECT COUNT(*) n FROM segment_edits').get().n).toBe(0);
  });
});

describe('applyReattach — honest counts', () => {
  it('counts a first run as inserted, not merely written', async () => {
    const { planReattach, applyReattach } = await import('../reattach-segment-edits.js');
    const res = applyReattach({
      plan: planReattach({ snapshot, booksDir }),
      saveSegmentEdit: service.saveSegmentEdit,
    });
    expect(res.inserted).toBe(1);
  });

  // The runbook tells the operator, on a non-zero `updated`, to note WHICH
  // segments took the UPDATE branch and warn the editor their diff view is
  // against a stale draft — those are exactly the rows where spec §7's
  // "originalContent = the new MT" silently failed. Three integers cannot
  // answer that, so the keys travel with the tally.
  it('names the segments that took the UPDATE branch, not just how many', async () => {
    const { planReattach, applyReattach } = await import('../reattach-segment-edits.js');
    const plan = planReattach({ snapshot, booksDir });
    applyReattach({ plan, saveSegmentEdit: service.saveSegmentEdit });
    const second = applyReattach({ plan, saveSegmentEdit: service.saveSegmentEdit });
    expect(second.updatedKeys).toEqual(['testbook/m001/m001:para:fs-id1/u1']);
  });

  it('counts a re-run as updated, so a repeat is not reported as fresh work', async () => {
    const { planReattach, applyReattach } = await import('../reattach-segment-edits.js');
    const plan = planReattach({ snapshot, booksDir });
    applyReattach({ plan, saveSegmentEdit: service.saveSegmentEdit });
    const second = applyReattach({ plan, saveSegmentEdit: service.saveSegmentEdit });
    expect(second).toMatchObject({ inserted: 0, updated: 1 });
  });

  it('attaches the partial tally to a mid-loop failure, so an aborted run is still diagnosable', async () => {
    const { applyReattach } = await import('../reattach-segment-edits.js');
    const item = (segmentId) => ({
      row: { ...snapshot.edits[0], segment_id: segmentId },
      newMt: 'ný vélþýðing',
      flags: [],
      editorNote: 'n',
    });
    let calls = 0;
    const throwOnSecond = () => {
      calls += 1;
      if (calls === 2) throw new Error('CHECK constraint failed: category');
      return { id: calls, updated: false };
    };
    let caught;
    try {
      applyReattach({
        plan: { restore: [item('seg-a'), item('seg-b')] },
        saveSegmentEdit: throwOnSecond,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught.tally).toEqual({ inserted: 1, updated: 0, reverted: 0, updatedKeys: [] });
  });
});
