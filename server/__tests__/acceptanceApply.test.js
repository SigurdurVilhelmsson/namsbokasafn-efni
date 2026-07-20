/**
 * Apply-path integration for MT acceptances (item 20b, spec §8) — the
 * previously-IMPOSSIBLE path: an accept-only module applies, writes the
 * faithful file + sidecar, stamps acceptances, and fires the post-apply
 * hooks. Plus mixed modules, the unchanged both-empty gate, and
 * getApplyStatus widening.
 *
 * Hook assertions are behavioral at the service seam: tmService/
 * concordanceService are called via module-object property lookup, so
 * vi.spyOn intercepts. advanceChapterStatus is destructured at import time
 * in segmentEditorService, so the spy seam is one level down —
 * pipelineStatusService.transitionStage (called via property lookup from
 * pipelineService).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
process.env.SESSIONS_DB_PATH = join(tmpdir(), `acc-apply-${process.pid}.db`);

const Database = require('better-sqlite3');
const service = require('../services/segmentEditorService');
const acceptance = require('../services/acceptanceService');
const segmentParser = require('../services/segmentParser');
const tmService = require('../services/tmService');
const concordanceService = require('../services/concordanceService');
const pipelineStatusService = require('../services/pipelineStatusService');
const { createSegmentEditsSchema } = require('./helpers/segmentEditsSchema.cjs');
const migration042 = require('../migrations/042-content-versions-track');
const migration043 = require('../migrations/043-segment-acceptances');

const BOOK = 'accapplybook';
const MODULE = 'm00001';
const originalBooksDir = segmentParser.BOOKS_DIR;

let db;
let tmpDir;
let booksDir;

beforeAll(() => {
  // Build the temp FILE DB's schema too: services this suite does NOT inject
  // a test DB into (activityLog inside restoreVersion, concordance) lazily
  // open SESSIONS_DB_PATH — give them real tables (locRestoreRoutes pattern).
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();

  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  createSegmentEditsSchema(db);
  // content_versions in its production (042) shape — apply snapshots into it
  db.exec(`
    CREATE TABLE content_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book TEXT NOT NULL, chapter INTEGER NOT NULL,
      module_id TEXT NOT NULL, segment_id TEXT NOT NULL,
      content TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
      applied_by TEXT, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book, module_id, segment_id, version)
    );
  `);
  migration042.up(db);
  migration043.up(db);
  service._setTestDb(db);
  acceptance._setTestDb(db);

  tmpDir = mkdtempSync(join(tmpdir(), 'acc-apply-'));
  booksDir = join(tmpDir, 'books');
  const en = join(booksDir, BOOK, '02-for-mt', 'ch01');
  const mt = join(booksDir, BOOK, '02-mt-output', 'ch01');
  mkdirSync(en, { recursive: true });
  mkdirSync(mt, { recursive: true });
  writeFileSync(
    join(en, `${MODULE}-segments.en.md`),
    [
      '<!-- SEG:m00001:para:fs-id001 -->',
      'Paragraph one.',
      '',
      '<!-- SEG:m00001:para:fs-id002 -->',
      'Paragraph two.',
      '',
      '<!-- SEG:m00001:title:fs-id003 -->',
      'Chapter Title',
    ].join('\n'),
    'utf-8'
  );
  writeFileSync(
    join(mt, `${MODULE}-segments.is.md`),
    [
      '<!-- SEG:m00001:para:fs-id001 -->',
      'Fyrsta efnisgrein.',
      '',
      '<!-- SEG:m00001:para:fs-id002 -->',
      'Önnur efnisgrein.',
      '',
      '<!-- SEG:m00001:title:fs-id003 -->',
      'Titill kafla',
    ].join('\n'),
    'utf-8'
  );
  service._setTestBooksDir(booksDir);
  segmentParser._setTestBooksDir(booksDir);
});

afterAll(() => {
  db.close();
  service._setTestDb(null);
  acceptance._setTestDb(null);
  service._setTestBooksDir(originalBooksDir);
  segmentParser._setTestBooksDir(originalBooksDir);
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec('DELETE FROM segment_edits');
  db.exec('DELETE FROM segment_acceptances');
  db.exec('DELETE FROM content_versions');
  rmSync(join(booksDir, BOOK, '03-faithful-translation'), { recursive: true, force: true });
  vi.restoreAllMocks();
});

function accept(segmentId, content) {
  return acceptance.acceptSegment({
    book: BOOK,
    chapter: 1,
    moduleId: MODULE,
    segmentId,
    acceptedContent: content,
    userId: 'user-1',
    username: 'editor1',
  });
}

function saveAndApprove(segmentId, editedContent) {
  const { id } = service.saveSegmentEdit({
    book: BOOK,
    chapter: 1,
    moduleId: MODULE,
    segmentId,
    originalContent: 'original',
    editedContent,
    editorId: 'editor-1',
    editorUsername: 'editor1',
  });
  service.approveEdit(id, 'reviewer-1', 'reviewer1');
  return id;
}

describe('accept-only apply (the previously-impossible path)', () => {
  it('applies with zero edits: writes the faithful file, stamps acceptances, writes the sidecar', () => {
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');

    const transitionSpy = vi
      .spyOn(pipelineStatusService, 'transitionStage')
      .mockImplementation(() => {});
    const tmSpy = vi.spyOn(tmService, 'scheduleTmRegen').mockImplementation(() => {});
    const concSpy = vi.spyOn(concordanceService, 'indexModule').mockImplementation(() => {});

    const result = service.applyApprovedEdits(BOOK, 1, MODULE);
    expect(result.appliedCount).toBe(0);
    expect(result.acceptedCount).toBe(2);
    expect(existsSync(result.savedPath)).toBe(true);

    // File content = untouched MT baseline
    const segs = segmentParser.parseSegments(readFileSync(result.savedPath, 'utf-8'));
    expect(segs.find((s) => s.segmentId === 'm00001:para:fs-id001').content).toBe(
      'Fyrsta efnisgrein.'
    );

    // Acceptances stamped
    const stamped = db
      .prepare(
        `SELECT COUNT(*) AS n FROM segment_acceptances
         WHERE status = 'active' AND applied_at IS NOT NULL`
      )
      .get().n;
    expect(stamped).toBe(2);

    // Sidecar: accepted ×2 + carryover ×1, file key order
    const sidecar = JSON.parse(readFileSync(acceptance.sidecarPathFor(BOOK, 1, MODULE), 'utf-8'));
    expect(Object.keys(sidecar.segments)).toEqual([
      'm00001:para:fs-id001',
      'm00001:para:fs-id002',
      'm00001:title:fs-id003',
    ]);
    expect(sidecar.segments['m00001:para:fs-id001'].status).toBe('accepted');
    expect(sidecar.segments['m00001:title:fs-id003'].status).toBe('carryover');

    // Post-apply hooks fired (behavioral: the seams were invoked)
    expect(transitionSpy).toHaveBeenCalledWith(BOOK, 1, 'linguisticReview', 'complete', null, null);
    expect(tmSpy).toHaveBeenCalledWith(BOOK);
    expect(concSpy).toHaveBeenCalledWith(BOOK, 1, MODULE);
  });

  it('mixed module: edit overlays its segment, acceptance stamps, sidecar mixes statuses', () => {
    saveAndApprove('m00001:para:fs-id001', 'Yfirfarin efnisgrein.');
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');
    vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});

    const result = service.applyApprovedEdits(BOOK, 1, MODULE);
    expect(result.appliedCount).toBe(1);
    expect(result.acceptedCount).toBe(1);

    const segs = segmentParser.parseSegments(readFileSync(result.savedPath, 'utf-8'));
    expect(segs.find((s) => s.segmentId === 'm00001:para:fs-id001').content).toBe(
      'Yfirfarin efnisgrein.'
    );
    const sidecar = JSON.parse(readFileSync(acceptance.sidecarPathFor(BOOK, 1, MODULE), 'utf-8'));
    expect(sidecar.segments['m00001:para:fs-id001'].status).toBe('edited');
    expect(sidecar.segments['m00001:para:fs-id002'].status).toBe('accepted');
  });

  it('gate still throws verbatim with neither edits nor acceptances', () => {
    expect(() => service.applyApprovedEdits(BOOK, 1, MODULE)).toThrow('No approved edits to apply');
  });

  it('all-already-applied still throws verbatim (acceptance-only module, second apply)', () => {
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
    service.applyApprovedEdits(BOOK, 1, MODULE);
    expect(() => service.applyApprovedEdits(BOOK, 1, MODULE)).toThrow(
      'All approved edits have already been applied'
    );
  });

  it('acceptance-only self-heal: file deleted → re-apply rebuilds and restamps', () => {
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
    const first = service.applyApprovedEdits(BOOK, 1, MODULE);
    rmSync(first.savedPath);
    const second = service.applyApprovedEdits(BOOK, 1, MODULE);
    expect(existsSync(second.savedPath)).toBe(true);
    expect(second.acceptedCount).toBe(1);
  });
});

describe('getApplyStatus widening', () => {
  it('reports unapplied/applied acceptance counts', () => {
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    let status = service.getApplyStatus(BOOK, MODULE, 1);
    expect(status.unapplied_acceptances).toBe(1);
    expect(status.applied_acceptances).toBe(0);
    vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
    service.applyApprovedEdits(BOOK, 1, MODULE);
    status = service.getApplyStatus(BOOK, MODULE, 1);
    expect(status.unapplied_acceptances).toBe(0);
    expect(status.applied_acceptances).toBe(1);
  });

  it('can_rebuild covers an acceptance-only module whose faithful file vanished', () => {
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
    const result = service.applyApprovedEdits(BOOK, 1, MODULE);
    rmSync(result.savedPath);
    const status = service.getApplyStatus(BOOK, MODULE, 1);
    expect(status.faithful_exists).toBe(false);
    expect(status.can_rebuild).toBe(true);
  });
});

describe('faithful restore lapses drifted acceptances (spec §7)', () => {
  it('restoreVersion supersedes acceptances whose bytes it rewrote, and refreshes the sidecar', () => {
    const contentVersionService = require('../services/contentVersionService');
    contentVersionService._setTestDb(db);
    try {
      vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
      // Round 1: an edit publishes v-baseline snapshot
      saveAndApprove('m00001:para:fs-id001', 'Útgáfa eitt.');
      service.applyApprovedEdits(BOOK, 1, MODULE);
      // Round 2: edit again → apply snapshots "Útgáfa eitt." as version 2
      saveAndApprove('m00001:para:fs-id001', 'Útgáfa tvö.');
      service.applyApprovedEdits(BOOK, 1, MODULE);
      // Accept an untouched sibling segment at its current bytes
      accept('m00001:para:fs-id002', 'Önnur efnisgrein.');
      // Accept-record for the edited segment's CURRENT bytes via direct
      // insert (UI never offers this; simulates the restore-drift edge)
      db.prepare(
        `INSERT INTO segment_acceptances
           (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
         VALUES (?, 1, ?, 'm00001:para:fs-id001', 'Útgáfa tvö.', 'u1', 'editor1')`
      ).run(BOOK, MODULE);

      // Restore version 2 ("Útgáfa eitt.") → fs-id001's acceptance drifts,
      // fs-id002's survives (same bytes restored)
      contentVersionService.restoreVersion(BOOK, 1, MODULE, 2, { username: 'he1' });

      const rows = db
        .prepare(
          `SELECT segment_id, status, superseded_reason FROM segment_acceptances ORDER BY id`
        )
        .all();
      const drifted = rows.find((r) => r.segment_id === 'm00001:para:fs-id001');
      const kept = rows.find((r) => r.segment_id === 'm00001:para:fs-id002');
      expect(drifted).toMatchObject({ status: 'superseded', superseded_reason: 'content-drift' });
      expect(kept.status).toBe('active');

      const sidecar = JSON.parse(readFileSync(acceptance.sidecarPathFor(BOOK, 1, MODULE), 'utf-8'));
      expect(sidecar.segments['m00001:para:fs-id002'].status).toBe('accepted');
    } finally {
      contentVersionService._setTestDb(null);
    }
  });
});

describe('regenSidecarSafe (final-review F1: revoke must refresh the stale sidecar)', () => {
  it('after a DB-level status flip (simulating revoke), regenSidecarSafe rewrites the segment as carryover', () => {
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    vi.spyOn(pipelineStatusService, 'transitionStage').mockImplementation(() => {});
    service.applyApprovedEdits(BOOK, 1, MODULE);

    let sidecar = JSON.parse(readFileSync(acceptance.sidecarPathFor(BOOK, 1, MODULE), 'utf-8'));
    expect(sidecar.segments['m00001:para:fs-id001'].status).toBe('accepted');

    // revokeAcceptance itself does not touch the sidecar (route-level concern) —
    // simulate its DB effect directly, then call the fix's helper.
    db.prepare(
      `UPDATE segment_acceptances SET status = 'superseded', superseded_reason = 'revoked'`
    ).run();
    acceptance.regenSidecarSafe(BOOK, 1, MODULE);

    sidecar = JSON.parse(readFileSync(acceptance.sidecarPathFor(BOOK, 1, MODULE), 'utf-8'));
    expect(sidecar.segments['m00001:para:fs-id001'].status).toBe('carryover');
  });

  it('no-ops (never throws) when there is no faithful file yet', () => {
    expect(() => acceptance.regenSidecarSafe(BOOK, 1, MODULE)).not.toThrow();
  });
});

describe('getReviewedSegmentsByModule (final-review F3 extraction)', () => {
  it('counts distinct approved-edit ∪ active-acceptance segments per module', () => {
    saveAndApprove('m00001:para:fs-id001', 'Yfirfarin efnisgrein.');
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');
    const byModule = service.getReviewedSegmentsByModule(BOOK);
    expect(byModule[MODULE]).toBe(2);
  });

  it('dedupes an edit and an acceptance on the SAME segment to 1', () => {
    saveAndApprove('m00001:para:fs-id001', 'Yfirfarin efnisgrein.');
    db.prepare(
      `INSERT INTO segment_acceptances
         (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
       VALUES (?, 1, ?, 'm00001:para:fs-id001', 'Yfirfarin efnisgrein.', 'u1', 'editor1')`
    ).run(BOOK, MODULE);
    const byModule = service.getReviewedSegmentsByModule(BOOK);
    expect(byModule[MODULE]).toBe(1);
  });

  it('an acceptance-only module counts via the UNION path (not edits-only)', () => {
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');
    const byModule = service.getReviewedSegmentsByModule(BOOK);
    expect(byModule[MODULE]).toBe(2);
  });
});

describe('metrics redefinition: reviewed = approved ∪ accepted (spec §8)', () => {
  it('getModuleStats reports accepted count', () => {
    accept('m00001:para:fs-id001', 'Fyrsta efnisgrein.');
    const stats = service.getModuleStats(BOOK, MODULE);
    expect(stats.accepted).toBe(1);
  });

  it('module completes when distinct approved ∪ accepted covers every segment', () => {
    // 3 segments: 1 approved edit + 2 acceptances = complete
    saveAndApprove('m00001:para:fs-id001', 'Yfirfarin.');
    accept('m00001:para:fs-id002', 'Önnur efnisgrein.');
    accept('m00001:title:fs-id003', 'Titill kafla');
    const progress = service.getEditorialProgress(BOOK);
    expect(progress.summary.modulesComplete).toBe(1);
    expect(progress.chapters[1].approvedSegments).toBe(3);
  });

  it('overlap does not double-count: edit + acceptance on the same segment = 1', () => {
    saveAndApprove('m00001:para:fs-id001', 'Yfirfarin.');
    // acceptance on the SAME segment via direct insert (API blocks this
    // while the edit is active; the metric must still be distinct-safe)
    db.prepare(
      `INSERT INTO segment_acceptances
         (book, chapter, module_id, segment_id, accepted_content, accepted_by, accepted_by_username)
       VALUES (?, 1, ?, 'm00001:para:fs-id001', 'Yfirfarin.', 'u1', 'editor1')`
    ).run(BOOK, MODULE);
    const progress = service.getEditorialProgress(BOOK);
    expect(progress.chapters[1].approvedSegments).toBe(1);
    expect(progress.summary.modulesComplete).toBe(0);
  });
});
