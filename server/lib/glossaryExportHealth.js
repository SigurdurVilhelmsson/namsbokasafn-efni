/**
 * Glossary-export health (register C14).
 *
 * TWO FILES, TWO JOBS — do not blur them:
 *
 *   pipeline-output/.last-glossary-export        LIVENESS. Written by
 *     server/scripts/export-terminology.js only on a non-dry-run, UNFILTERED
 *     (no --book) pass with zero ERRORS. Absence is the alarm.
 *
 *   pipeline-output/.glossary-export-status.json DETAIL ONLY. Written on
 *     every non-dry-run, UNFILTERED pass, INCLUDING one that ended in an
 *     error. ⚠️ It can therefore never answer "is the exporter alive" — a file
 *     written on every outcome reads "success" forever once the exporter stops
 *     running, which is the whole reason the heartbeat is not being replaced
 *     by it. Read here for `errors`, the per-book breakdown, and refusal AGE —
 *     never for liveness.
 *
 * ⚠️ BOTH are WHOLE-CORPUS artifacts and share one rule: a `--book <slug>` run
 * writes NEITHER (decision D6/(c), 2026-08-05). A single-book run says nothing
 * about the other books, so it must not stamp either signal on their behalf.
 * There is no `filtered` field to check — the file only ever exists in the
 * unfiltered form, which is why this function can read `books` as the whole
 * corpus without qualification. The two writes differ in exactly one respect:
 * the status file is written even when errors > 0, the heartbeat is not.
 *
 * ⚠️ AMENDED 2026-08-05. This docblock used to say the heartbeat is written
 * "ONLY when every book resolved healthily" and that "the exporter writes no
 * status file". Both are now false: under decision D2 a REFUSAL keeps the
 * heartbeat (only an error withholds it), and the status file above exists.
 *
 * ⚠️ AMENDED 2026-08-05 (Task 7, Controller Amendment §A) — `GET /api/health`
 * is UNAUTHENTICATED (server/index.js, no auth middleware) on an
 * internet-facing, PUBLIC-repository server. A book's `detail` string can
 * embed `err.message` verbatim — including an absolute server filesystem
 * path from an EACCES — so `detail` is stripped before it leaves this file.
 * `readGlossaryExportHealth` projects every book to `{outcome, since}` only;
 * see `projectBookForHealth` below. `detail` still lives in
 * pipeline-output/.glossary-export-status.json (gitignored, on-box only).
 *
 * WHY ANY OF THIS EXISTS: the export runs from scripts/git-backup.sh, the
 * 2-hourly cron, and that invocation must be CONTAINED — a failing export logs
 * a WARN and lets the content backup proceed, since terminology-DB health must
 * never be able to abort the backup or suppress its own C11(b) heartbeat. The
 * cost of that containment is that a persistent failure would otherwise be
 * invisible: a WARN in a gitignored log nobody reads, while books/*\/glossary/
 * silently stayed frozen and MT kept being primed from a months-old file.
 *
 * `ok` FOLDS IN THREE CONDITIONS, and each is load-bearing:
 *
 *   !stale              the exporter is running at all (heartbeat).
 *   errors === 0        no book hit a genuine error.
 *   no STALE refusals   no book has been refusing for longer than the
 *                       threshold (decision D6, below).
 *
 * ⚠️ A REFUSAL ITSELF MUST NOT FLIP `ok` (decision D2). A refusal is the guard
 * working — an un-adopted producer swap, a missing subject mapping, a
 * catastrophic shrink — and a check that is permanently red for expected
 * reasons gets tuned out. That is not hypothetical: on 2026-08-03 /api/health
 * read glossary_export ok=false continuously, because one book was
 * legitimately refusing, straight through the run that wrote and pushed new
 * reader-visible glossaries. The alarm was already ringing for a reason nobody
 * was acting on at the moment the real event happened.
 *
 * ⚠️ BUT A REFUSAL THAT NEVER RESOLVES IS NOT HEALTH (decision D6). Every
 * committed glossary is a merge-glossary file today, so the first cron run
 * after this ships refuses every book THAT HAS ONE — and under D2 alone that state is: exit
 * 0, heartbeat fresh, errors 0, /api/health ok, glossaries frozen
 * indefinitely, until a human runs --adopt per book. That is the exact failure
 * described three paragraphs up, wearing a green badge. So a refusal is given
 * a deadline instead of a veto: quiet while it is fresh, an alarm once it has
 * gone unattended past DEFAULT_REFUSAL_STALE_DAYS.
 *
 * ⚠️ CORRECTED 2026-08-05 by register §C21 — ALL THREE CLAUSES OF THIS
 * PARAGRAPH WERE FALSIFIED, and it is recorded rather than deleted because it
 * is why the gate exists. It read: a book with a `glossary/` directory but NO
 * committed file has an `absent` baseline, which makes BOTH export gates
 * structurally inert, "so that book is never refused, its write is ungated and
 * pushed, and D6 therefore never covers it."
 *
 * The premise still holds — an absent baseline leaves nothing to fingerprint
 * and nothing to compare — but the exporter now REFUSES that state
 * (`refused-absent-baseline`) unless --adopt, so: the book IS refused, there
 * is NO write, and D6 DOES cover it, because findStaleRefusals below
 * classifies on the `refused-` PREFIX and needs no enumeration to learn a new
 * outcome. Which books sit in which state → register §C14 ③ and §C21.
 *
 * All filesystem access lives here rather than in the /api/health handler,
 * because server/index.js calls app.listen() at module load and so cannot be
 * imported by a unit test.
 */

const fs = require('fs');
const path = require('path');
const { computeBackupHeartbeatHealth } = require('./backupHeartbeatHealth');

/** Two missed cycles of the 2-hourly cron, plus margin. */
const DEFAULT_STALE_HOURS = 6;

/**
 * How long a book may sit refusing before that becomes an alarm.
 *
 * Long enough that a refusal appearing on a Friday does not page anyone over
 * the weekend, and that the fix — a human reviewing what the book's glossary
 * should be, then running --adopt — is unhurried, [LEAD] work. Short enough
 * that a forgotten refusal cannot outlive a school term in silence.
 */
const DEFAULT_REFUSAL_STALE_DAYS = 7;

const MS_PER_DAY = 24 * 3_600_000;

/**
 * Books whose CURRENT refusal has gone unattended past the threshold.
 *
 * ⚠️ Classifies by the `refused-` PREFIX, not an enumerated list, so a refusal
 * outcome added later is covered by default. The cost is that a future outcome
 * named otherwise (`declined-x`) would be silently exempt — the exporter's
 * outcome strings are pinned to this convention by tests in
 * server/__tests__/glossaryExportRun.test.js.
 *
 * ⚠️ FAILS TOWARD QUIET on malformed data — a missing or unparseable `since`
 * is NOT stale. Liveness is already covered by the heartbeat, so a garbled
 * detail file must not be able to manufacture an alarm out of nothing; the
 * opposite choice would make a status-file bug indistinguishable from a real
 * unattended refusal.
 */
function findStaleRefusals(books, nowMs, refusalStaleDays) {
  const maxAgeMs = refusalStaleDays * MS_PER_DAY;
  return Object.entries(books)
    .filter(([, entry]) => {
      if (!entry || typeof entry !== 'object') return false;
      if (typeof entry.outcome !== 'string' || !entry.outcome.startsWith('refused-')) return false;
      const sinceMs = Date.parse(entry.since);
      if (!Number.isFinite(sinceMs)) return false;
      return nowMs - sinceMs > maxAgeMs;
    })
    .map(([slug]) => slug);
}

/**
 * Project one book's status-file entry down to what is safe to expose over
 * `GET /api/health` — UNAUTHENTICATED (server/index.js has no auth
 * middleware on that route) on an internet-facing server, and this
 * repository is PUBLIC. `detail` can embed `err.message` verbatim, e.g.
 *
 *   could not read existing export — EACCES: permission denied,
 *   open '/srv/namsbokasafn-efni/books/.../glossary-unified.json'
 *
 * which leaks an absolute SERVER FILESYSTEM PATH to a public endpoint.
 * `detail` MUST NOT leave this file — only `outcome` and `since` are
 * public-safe. This lives here, not in the /api/health route, so that a
 * future second caller of `readGlossaryExportHealth` gets the projection for
 * free instead of re-leaking `detail` by omission. An operator who needs the
 * detail reads pipeline-output/.glossary-export-status.json on the box
 * directly — it is gitignored.
 *
 * Do not "restore" a passed-through `detail` here without re-reading this
 * comment; that is exactly the mistake this function exists to prevent.
 *
 * @param {unknown} entry a raw books[slug] value from the status file — may
 *   be null, a non-object, or missing fields; the status file is written by
 *   a different process and this must not throw on any shape it finds.
 */
function projectBookForHealth(entry) {
  // Fail CLOSED, not merely toward-quiet: a non-object entry has nothing
  // safe to project, so this returns null rather than passing an unknown
  // shape through verbatim. Unreachable today — the exporter always writes
  // {outcome, since[, detail][, integrity]} objects (D5, §C36 B4a spec added
  // `integrity`) — but this function's whole reason to exist is "extra
  // fields must never leave this file", and a fail-open branch inside it
  // would undermine that even though nothing currently exercises it. Do not
  // "simplify" this back to `return entry`.
  if (!entry || typeof entry !== 'object') return null;
  return { outcome: entry.outcome, since: entry.since };
}

/** Apply {@link projectBookForHealth} across the whole per-book map. */
function projectBooksForHealth(books) {
  const projected = {};
  for (const [slug, entry] of Object.entries(books)) {
    projected[slug] = projectBookForHealth(entry);
  }
  return projected;
}

/**
 * @param {{projectRoot: string, nowMs: number, staleHours?: number,
 *   refusalStaleDays?: number}} p
 *   projectRoot — the repo root. Derive it from `__dirname`, never
 *   `process.cwd()`: the server runs with cwd=server/.
 * @returns {{age_hours: number|null, stale: boolean, errors: number,
 *   ran: string|null, books: object, stale_refusals: string[], ok: boolean}}
 *   `books` is `{[slug]: {outcome, since}}` — `detail` is deliberately not
 *   included; see `projectBookForHealth`. `ran` is the status file's own
 *   `ran` timestamp (ISO string), or null if the file is missing/unreadable.
 *   It is distinct from `age_hours`: the status write happens BEFORE the
 *   `errors > 0` early return in export-terminology.js while the heartbeat
 *   write happens AFTER it, so a persistently-erroring exporter shows a
 *   fresh `ran` next to a growing, stale `age_hours` — proof the cron is
 *   running at all, just failing every time, which a frozen heartbeat alone
 *   cannot distinguish from "cron stopped firing".
 */
function readGlossaryExportHealth({
  projectRoot,
  nowMs,
  staleHours = DEFAULT_STALE_HOURS,
  refusalStaleDays = DEFAULT_REFUSAL_STALE_DAYS,
}) {
  let heartbeatMtimeMs = null;
  try {
    heartbeatMtimeMs = fs.statSync(
      path.join(projectRoot, 'pipeline-output', '.last-glossary-export')
    ).mtimeMs;
  } catch {
    /* missing heartbeat => stale, handled by the helper */
  }

  let detail = { errors: 0, books: {}, ran: null };
  try {
    const raw = fs.readFileSync(
      path.join(projectRoot, 'pipeline-output', '.glossary-export-status.json'),
      'utf-8'
    );
    const parsed = JSON.parse(raw);
    detail = {
      errors: Number(parsed.errors) || 0,
      books: parsed.books && typeof parsed.books === 'object' ? parsed.books : {},
      ran: typeof parsed.ran === 'string' ? parsed.ran : null,
    };
  } catch {
    // No status file (or an unreadable one) — the heartbeat alone still
    // answers liveness, which is the question `ok` is really about.
  }

  const stale_refusals = findStaleRefusals(detail.books, nowMs, refusalStaleDays);

  const health = computeBackupHeartbeatHealth({ heartbeatMtimeMs, nowMs, staleHours });
  return {
    ...health,
    errors: detail.errors,
    ran: detail.ran,
    books: projectBooksForHealth(detail.books),
    stale_refusals,
    ok: !health.stale && detail.errors === 0 && stale_refusals.length === 0,
  };
}

module.exports = {
  readGlossaryExportHealth,
  DEFAULT_STALE_HOURS,
  DEFAULT_REFUSAL_STALE_DAYS,
};
