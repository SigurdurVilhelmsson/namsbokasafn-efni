// server/__tests__/researchSessionsRestore.test.js
//
// The replay of server/verification/research-withdrawal/'s known finding on the REAL consent
// functions. TLC's shortest path: Consent -> SessionsCopy -> WithdrawCommit -> SessionsRestore (->
// Capture). docs/technical/backup-and-restore.md's sessions.db restore copies the newest copy into
// place and restarts; no step reconciles research_consent with a withdrawal made after the copy. So
// the restored row is live again, and captureStateFor (record()'s step 3) captures for someone who
// withdrew.
//
// WHAT THIS PROVES: the finding's PRECONDITION, on the real code. On a sessions.db copy taken before the
// withdrawal, captureStateFor captures and dueIntervals drops the interval: the consent functions hold no
// state of their own that survives a restore of that file. Each half sits beside its control.
// WHAT IT CANNOT DO: detect a fix. The restore is a manual runbook step with no code to run, so these
// tests open the copy directly. A fix (a reconcile at boot, a migration, a runbook step) is not on their
// path and leaves them passing; only a fix inside captureStateFor or dueIntervals would flip them.
// A FIX MUST BRING ITS OWN TEST that runs the new step on such a copy; then remove these and the finding.
// Latent today: no consent text is approved in the repo, so no one can consent yet.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const researchConsent = require('../services/researchConsent');
const researchConsentText = require('../lib/researchConsentText');
const { APPROVED } = require('./helpers/researchFixture.cjs');
const { ensureResearchSchema } = require('../lib/researchSchema');
const { dueIntervals } = require('../scripts/research-withdrawal');

const USER = 1;

describe('a sessions.db restore after a withdrawal (verify-research-withdrawal finding)', () => {
  let live;
  let copy;
  let intervalId;
  beforeEach(() => {
    researchConsentText._setTestApprovedTexts(APPROVED);
    const fresh = freshMigratedDb();
    expect(fresh.errors).toEqual([]);
    live = fresh.db;
    researchConsent._setTestDb(live);
    const started = researchConsent.recordDecision({
      userId: USER,
      decision: 'consented',
      text: APPROVED[0],
      nowMs: Date.now(),
    });
    expect(started.outcome).toBe('started');
    intervalId = started.intervalId;
    expect(researchConsent.captureStateFor(USER).capturing).toBe(true);
    // SessionsCopy: backup-db.sh's copy, taken while the interval is live.
    copy = live.serialize();
    // WithdrawCommit: the withdraw route's own commit.
    expect(researchConsent.withdraw({ userId: USER, nowMs: Date.now() }).withdrawn).toBe(true);
  });
  afterEach(() => {
    researchConsent._setTestDb(null);
    researchConsentText._setTestApprovedTexts(null);
  });

  it('CONTROL: after the withdrawal, nothing is captured', () => {
    expect(researchConsent.captureStateFor(USER).capturing).toBe(false);
  });

  it('PRECONDITION: restoring the pre-withdrawal copy makes the interval capture again', () => {
    // SessionsRestore: the runbook's step, the copy put in place as it is.
    const restored = new Database(copy);
    researchConsent._setTestDb(restored);
    expect(researchConsent.captureStateFor(USER).capturing).toBe(true);
  });

  it('PRECONDITION: after the restore the interval is no longer due, so its key row stays', () => {
    // The research file, with the real schema, still holding the interval's key (the withdraw route's
    // immediate deletion leaves the key row for research-withdrawal.js).
    const research = new Database(':memory:');
    ensureResearchSchema(research);
    research
      .prepare('INSERT INTO editor_keys (interval_id, editor_key) VALUES (?, ?)')
      .run(intervalId, 'a'.repeat(32)); // the schema's shape: 32 lowercase hex
    // CONTROL: on the live sessions.db the withdrawn interval is due.
    expect(dueIntervals(live, research)).toEqual([intervalId]);
    // On the restored copy it is not, so no run deletes the key (QuiescentClean).
    expect(dueIntervals(new Database(copy), research)).toEqual([]);
  });
});
