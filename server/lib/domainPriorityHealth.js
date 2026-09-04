'use strict';
/**
 * Domain-priority reconcile health (§C119).
 *
 * Migration 047 enforces each book's domain fallback order from domains.js on
 * every boot. That is correct and unchanged. What is new is that it now RECORDS
 * when the enforcement actually overwrote live rows, and this check is what
 * carries that verdict to a human: /api/health reports it and
 * ./scripts/deploy.sh prints every not-ok check.
 *
 * WHY THE SURFACE MATTERS MORE THAN THE DETECTION. On 2026-08-31 a hand-made
 * trim was reverted 102 seconds later by a deploy's restart, with no error and
 * no log line, and was discovered days afterwards from a glossary that had
 * silently doubled. A log line at boot goes to journalctl, which nobody was
 * reading; the deploy's own output is where the operator was actually looking.
 *
 * THE ALARM IS SHORT-LIVED BY DESIGN. 047 reverts on one boot and finds nothing
 * to change on the next, so this goes not-ok on the boot that did the damage and
 * clears afterwards — and that boot is the deploy whose output is being read.
 * It is a "something was just undone" notice, never a standing condition.
 *
 * All filesystem access lives here rather than in the /api/health handler,
 * because server/index.js calls app.listen() at module load and so cannot be
 * imported by a unit test.
 */
const fs = require('fs');
const path = require('path');

/** Written by migration 047. Gitignored (pipeline-output/). */
const STATUS_REL = path.join('pipeline-output', '.domain-priority-reconcile.json');

/**
 * @param {{projectRoot: string}} p projectRoot — the repo root. Derive it from
 *   `__dirname`, never `process.cwd()`: the server runs with cwd=server/.
 * @returns {{ok: boolean, ran: string|null, reverted: Array<object>, message: string|null}}
 */
function readDomainPriorityHealth({ projectRoot }) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(projectRoot, STATUS_REL), 'utf8');
  } catch {
    // Never recorded on this box. Nothing was overwritten, but say so with
    // ran=null rather than letting it read as a clean run — an absence is not
    // an answer.
    return { ok: true, ran: null, reverted: [], message: null };
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    // A broken detector must not report healthy; that is the failure mode this
    // whole guard exists because of.
    return { ok: false, ran: null, reverted: [], message: `unreadable status file: ${err.message}` };
  }

  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.reverted)) {
    return { ok: false, ran: null, reverted: [], message: 'status file has no reverted[] array' };
  }

  const reverted = payload.reverted;
  const ran = typeof payload.ran === 'string' ? payload.ran : null;
  if (reverted.length === 0) return { ok: true, ran, reverted, message: null };

  const names = reverted.map((r) => (r && r.slug) || '?').join(', ');
  return {
    ok: false,
    ran,
    reverted,
    message:
      `migration 047 overwrote live book_domain_priority rows for ${reverted.length} book(s): ${names}. ` +
      `If that undid a deliberate change, the change belongs in server/lib/domains.js — the table is re-asserted on every boot.`,
  };
}

module.exports = { readDomainPriorityHealth, STATUS_REL };
