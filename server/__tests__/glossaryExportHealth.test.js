/**
 * Glossary-export health (register C14).
 *
 * server/scripts/export-terminology.js writes
 * pipeline-output/.last-glossary-export only on a non-dry-run, UNFILTERED
 * pass with zero ERRORS, so staleness is the alarm.
 *
 * ⚠️ CORRECTED 2026-08-05. This said "only when every book resolved
 * healthily" — falsified by decision D2, under which a book that REFUSES for
 * a correct reason keeps the heartbeat; only a genuine error withholds it.
 *
 * WHY THIS EXISTS: the export is meant to run from scripts/git-backup.sh, and
 * that invocation must be deliberately CONTAINED — a failure logs a WARN and
 * lets the content backup proceed, because terminology-DB health must not be
 * able to abort the backup. That containment means a persistent failure
 * would otherwise be invisible: a WARN in a gitignored log nobody reads,
 * while the glossary silently stayed frozen. Cron environments are the
 * likely cause (no repo cron script invoked `node` before this one). This
 * check is where that becomes visible — ./scripts/deploy.sh prints every
 * not-ok check.
 *
 * ⚠️ TWO FILES, TWO JOBS, and these tests must not blur them. The HEARTBEAT
 * answers liveness (absence is the alarm). The status file
 * .glossary-export-status.json is DETAIL ONLY — written on every non-dry-run,
 * UNFILTERED pass including a failed one, so it can never answer "is the
 * exporter alive". It is read here for `errors`, the per-book breakdown, and
 * refusal AGE. See the D6 block at the bottom for why age matters.
 *
 * ⚠️ Both files are WHOLE-CORPUS and share one rule: a `--book <slug>` run
 * writes NEITHER (decision D6/(c)). So there is no `filtered` field, and these
 * fixtures must not invent one — the plan text specified `filtered` and it was
 * deleted rather than left permanently false. A fixture carrying a field the
 * real producer never writes is how a test starts passing for a shape that
 * cannot occur.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  readGlossaryExportHealth,
  DEFAULT_STALE_HOURS,
  DEFAULT_REFUSAL_STALE_DAYS,
} = require('../lib/glossaryExportHealth');

const H = 3600 * 1000;
const D = 24 * H;
const NOW = 1_800_000_000_000; // fixed clock; no Date.now() in assertions

let root;

function heartbeat(ageHours) {
  const p = path.join(root, 'pipeline-output', '.last-glossary-export');
  writeFileSync(p, new Date(NOW - ageHours * H).toISOString() + '\n');
  const t = new Date(NOW - ageHours * H);
  utimesSync(p, t, t);
}

/**
 * Write the per-book status file. ⚠️ DETAIL ONLY — never a liveness signal;
 * `heartbeat()` above is the alarm. Same convention as its sibling: closes
 * over `root`, takes no root argument.
 */
function status(obj) {
  writeFileSync(
    path.join(root, 'pipeline-output', '.glossary-export-status.json'),
    JSON.stringify(obj, null, 2) + '\n'
  );
}

/** A book refusing since `ageDays` before the fixed clock. */
const refusedSince = (ageDays, outcome = 'refused-producer') => ({
  outcome,
  since: new Date(NOW - ageDays * D).toISOString(),
});

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'glossaryexport-'));
  mkdirSync(path.join(root, 'pipeline-output'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('readGlossaryExportHealth', () => {
  it('defaults to a 6 hour threshold (2-hourly cron, two missed cycles + margin)', () => {
    expect(DEFAULT_STALE_HOURS).toBe(6);
  });

  it('is not ok when the heartbeat is missing entirely', () => {
    // The state on any box where the export has never succeeded — including
    // one where cron cannot resolve `node`.
    const r = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.stale).toBe(true);
    expect(r.age_hours).toBeNull();
  });

  it('is ok when the heartbeat is fresh', () => {
    heartbeat(2);
    const r = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(true);
    expect(r.age_hours).toBe(2);
  });

  it('is not ok when the heartbeat is older than the threshold', () => {
    heartbeat(9);
    const r = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.age_hours).toBe(9);
  });

  it('honours an explicit staleHours override', () => {
    heartbeat(9);
    expect(readGlossaryExportHealth({ projectRoot: root, nowMs: NOW, staleHours: 24 }).ok).toBe(
      true
    );
  });

  it('does not throw when pipeline-output does not exist at all', () => {
    const bare = mkdtempSync(path.join(tmpdir(), 'glossaryexport-bare-'));
    try {
      expect(readGlossaryExportHealth({ projectRoot: bare, nowMs: NOW }).ok).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

describe('readGlossaryExportHealth — refusals vs errors (D2)', () => {
  it('is ok when the heartbeat is fresh and books merely refused', () => {
    heartbeat(1);
    status({
      ran: 'x',
      errors: 0,
      books: { 'efnafraedi-2e': refusedSince(0) },
    });
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.ok).toBe(true);
    expect(h.books['efnafraedi-2e'].outcome).toBe('refused-producer');
  });

  it('is NOT ok when a book errored, even with a fresh heartbeat', () => {
    heartbeat(1);
    status({
      ran: 'x',
      errors: 1,
      books: { 'efnafraedi-2e': { outcome: 'error', detail: 'boom' } },
    });
    expect(readGlossaryExportHealth({ projectRoot: root, nowMs: NOW }).ok).toBe(false);
  });

  it('is NOT ok when stale, whatever the status file says', () => {
    heartbeat(40);
    status({ ran: 'x', errors: 0, books: {} });
    expect(readGlossaryExportHealth({ projectRoot: root, nowMs: NOW }).ok).toBe(false);
  });

  it('a missing status file does not throw — the heartbeat alone still answers liveness', () => {
    heartbeat(1);
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.ok).toBe(true);
    expect(h.books).toEqual({});
  });

  it('an UNPARSEABLE status file does not throw either', () => {
    heartbeat(1);
    writeFileSync(path.join(root, 'pipeline-output', '.glossary-export-status.json'), '{ not json');
    expect(readGlossaryExportHealth({ projectRoot: root, nowMs: NOW }).ok).toBe(true);
  });

  it('a status file whose `books` is not an object does not throw', () => {
    heartbeat(1);
    status({ ran: 'x', errors: 0, books: 'not an object' });
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.ok).toBe(true);
    expect(h.books).toEqual({});
  });
});

describe('readGlossaryExportHealth — a refusal that never resolves (D6)', () => {
  // ⚠️ THE HOLE D2 LEFT OPEN. A refusal is a CORRECT outcome and must not flip
  // ok — a check permanently red for expected reasons gets tuned out, which is
  // how a live incident hid inside a steady ok=false on 2026-08-03. But all
  // three committed glossaries are merge-glossary today, so the first cron run
  // after this ships refuses EVERY book, and under plain D2 that reads: exit 0,
  // heartbeat written, /api/health ok, glossaries frozen — indefinitely, until
  // a human runs --adopt per book. The only other evidence would be REFUSING
  // lines in a gitignored log. A refusal is fine; a refusal that never resolves
  // is the exact failure this register item was raised about.
  it('defaults to a 7 day refusal threshold', () => {
    expect(DEFAULT_REFUSAL_STALE_DAYS).toBe(7);
  });

  it('is ok for a FRESH refusal', () => {
    heartbeat(1);
    status({ ran: 'x', errors: 0, books: { 'efnafraedi-2e': refusedSince(1) } });
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.ok).toBe(true);
    expect(h.stale_refusals).toEqual([]);
  });

  it('is NOT ok once that refusal is older than the threshold, and NAMES the book', () => {
    heartbeat(1);
    status({ ran: 'x', errors: 0, books: { 'efnafraedi-2e': refusedSince(8) } });
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.ok).toBe(false);
    // Naming it is the point: /api/health and ./scripts/deploy.sh print this,
    // and "something refused" with no slug is not actionable — the fix is
    // per-book (`--adopt <slug>`), so the operator needs the slug.
    expect(h.stale_refusals).toEqual(['efnafraedi-2e']);
  });

  it('names EVERY stale refusal, not just the first', () => {
    heartbeat(1);
    status({
      ran: 'x',
      errors: 0,
      books: {
        'efnafraedi-2e': refusedSince(8),
        'liffraedi-2e': refusedSince(30, 'refused-no-mapping'),
        'lifraen-efnafraedi': refusedSince(1), // fresh — must not appear
      },
    });
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.stale_refusals.sort()).toEqual(['efnafraedi-2e', 'liffraedi-2e']);
  });

  it('an OLD non-refusal outcome is not a stale refusal', () => {
    // A book written months ago and unchanged since is the healthiest state
    // there is. Only outcomes starting `refused-` are candidates.
    heartbeat(1);
    status({
      ran: 'x',
      errors: 0,
      books: {
        a: { outcome: 'unchanged', since: new Date(NOW - 300 * D).toISOString() },
        b: { outcome: 'wrote', since: new Date(NOW - 300 * D).toISOString() },
        c: { outcome: 'adopted', since: new Date(NOW - 300 * D).toISOString() },
      },
    });
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.ok).toBe(true);
    expect(h.stale_refusals).toEqual([]);
  });

  it('a refusal with NO `since` does not flip ok — fail toward quiet on malformed data', () => {
    // The heartbeat still covers liveness, so a missing field must not
    // manufacture an alarm out of nothing.
    heartbeat(1);
    status({
      ran: 'x',
      errors: 0,
      books: { 'efnafraedi-2e': { outcome: 'refused-producer' } },
    });
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.ok).toBe(true);
    expect(h.stale_refusals).toEqual([]);
  });

  it('a refusal with an UNPARSEABLE `since` does not flip ok either', () => {
    heartbeat(1);
    status({
      ran: 'x',
      errors: 0,
      books: { 'efnafraedi-2e': { outcome: 'refused-producer', since: 'síðasta þriðjudag' } },
    });
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.ok).toBe(true);
    expect(h.stale_refusals).toEqual([]);
  });

  it('a null book entry does not throw', () => {
    heartbeat(1);
    status({ ran: 'x', errors: 0, books: { 'efnafraedi-2e': null } });
    expect(readGlossaryExportHealth({ projectRoot: root, nowMs: NOW }).ok).toBe(true);
  });

  it('honours a refusalStaleDays override (wired to GLOSSARY_REFUSAL_STALE_DAYS)', () => {
    heartbeat(1);
    status({ ran: 'x', errors: 0, books: { 'efnafraedi-2e': refusedSince(8) } });
    // Raised above the age: no longer stale.
    expect(
      readGlossaryExportHealth({ projectRoot: root, nowMs: NOW, refusalStaleDays: 30 }).ok
    ).toBe(true);
    // Lowered below it: stale.
    expect(
      readGlossaryExportHealth({ projectRoot: root, nowMs: NOW, refusalStaleDays: 1 }).ok
    ).toBe(false);
  });

  it('a stale refusal flips ok even though the heartbeat is fresh and errors are 0', () => {
    // The whole point: every OTHER signal reads healthy in this state. That is
    // what made it invisible.
    heartbeat(1);
    status({ ran: 'x', errors: 0, books: { 'efnafraedi-2e': refusedSince(8) } });
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.stale).toBe(false);
    expect(h.errors).toBe(0);
    expect(h.ok).toBe(false);
  });
});

describe('readGlossaryExportHealth — books are projected for GET /api/health (Task 7 §A, security)', () => {
  // GET /api/health is UNAUTHENTICATED and internet-facing, and this repo is
  // public. `detail` can embed `err.message` verbatim, including an absolute
  // server filesystem path (e.g. an EACCES). It must never reach a caller of
  // this function, even though the on-disk status file legitimately has one.
  it('strips `detail` from every book, even though the status file on disk has one', () => {
    heartbeat(1);
    status({
      ran: 'x',
      errors: 0,
      books: {
        'efnafraedi-2e': {
          outcome: 'refused-producer',
          detail:
            "EACCES: permission denied, open '/srv/namsbokasafn-efni/books/x/glossary-unified.json'",
          since: new Date(NOW).toISOString(),
        },
      },
    });
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.books['efnafraedi-2e'].outcome).toBe('refused-producer');
    expect(h.books['efnafraedi-2e'].detail).toBeUndefined();
  });

  it('keeps `outcome` and `since` for a non-refusing book too', () => {
    heartbeat(1);
    status({
      ran: 'x',
      errors: 0,
      books: {
        'liffraedi-2e': {
          outcome: 'wrote',
          detail: 'anything',
          since: new Date(NOW).toISOString(),
        },
      },
    });
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.books['liffraedi-2e']).toEqual({
      outcome: 'wrote',
      since: new Date(NOW).toISOString(),
    });
  });
});

describe('readGlossaryExportHealth — `ran` (Task 7 §C)', () => {
  it("surfaces the status file's `ran` timestamp verbatim", () => {
    heartbeat(1);
    const ranAt = new Date(NOW - 3 * H).toISOString();
    status({ ran: ranAt, errors: 0, books: {} });
    expect(readGlossaryExportHealth({ projectRoot: root, nowMs: NOW }).ran).toBe(ranAt);
  });

  it('is null when the status file is missing', () => {
    heartbeat(1);
    expect(readGlossaryExportHealth({ projectRoot: root, nowMs: NOW }).ran).toBeNull();
  });

  it('is null when `ran` is missing or not a string, without throwing', () => {
    heartbeat(1);
    status({ errors: 0, books: {} });
    expect(readGlossaryExportHealth({ projectRoot: root, nowMs: NOW }).ran).toBeNull();
  });

  it('stays fresh across a run that errored, even though the heartbeat does not', () => {
    // export-terminology.js writes the status file BEFORE the `errors > 0`
    // early return, and the heartbeat only AFTER it — so a persistently
    // erroring exporter shows a fresh `ran` beside a stale `age_hours`. That
    // is the signal that distinguishes "still running, just failing" from
    // "cron stopped firing", which a frozen heartbeat alone cannot.
    heartbeat(40); // stale
    const ranAt = new Date(NOW - 5 * 60 * 1000).toISOString(); // 5 min ago
    status({ ran: ranAt, errors: 1, books: { x: { outcome: 'error', detail: 'boom' } } });
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.stale).toBe(true);
    expect(h.ran).toBe(ranAt);
    expect(h.ok).toBe(false);
  });
});
