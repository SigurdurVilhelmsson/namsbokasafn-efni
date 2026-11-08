#!/usr/bin/env node
/**
 * READ-ONLY: the production checks that must be answered before the module-opening step ships
 * and before any research capture (G1.1 + G1.2; spec 2026-11-03 §9; index decision 14).
 *
 * Each section answers one §9 check and runs on its own: a section that fails reports
 * `{ ok: false, error, message }` and the others still run.
 *   G-1a  the crontab half (PR4): every cron source the box holds — each user's crontab in the spool
 *         (root only), `crontab -l`, /etc/crontab, /etc/anacrontab, /etc/cron.d/* and the scripts in
 *         /etc/cron.{hourly,daily,weekly,monthly}/ — one level into the scripts a crontab line runs.
 *         A line holding a copying tool (bare, or named by an absolute path) that names pipeline-output
 *         or a directory above the research file is a COPY; one that also excludes `research` is an
 *         EXCLUDED COPY, returned apart for a person to judge; a line running one of the repository's
 *         backup jobs is KNOWN (by job name, never the line); another line naming pipeline-output, or a
 *         command this probe cannot read as text, is UNCLASSIFIED. Only those lines leave the probe,
 *         each with its NAME=value words and option values redacted, except an --exclude/--include
 *         value. No whole crontab is ever returned. `complete` is false when the spool or any source
 *         could not be read.
 *   G-1h  (PR4) whether the research backup job runs: its cron line is in a crontab, its schedule is the
 *         one scripts/install-cron.sh prints, its RESEARCH_REMOTE is a research remote (a boolean: the
 *         value never leaves the probe), and its heartbeat is present and fresh. It reads the crontab
 *         and the heartbeat only, never research_deletions: this output is pasted into the public
 *         register, where a deletion record would announce a withdrawal.
 *   G-1c  journald's settings from every file systemd 255's journald opens, in its order (strace of
 *         systemd-journald 255.4-1ubuntu8.18 in a private mount namespace): the main file
 *         /etc/systemd/journald.conf and no other; then the *.conf drop-ins of the
 *         systemd/journald.conf.d/ directories of /etc, /run, /usr/local/lib and /usr/lib, where a
 *         same-named file in an earlier directory masks a later one (a /dev/null link included), a
 *         hidden file is skipped, and the survivors run in filename order whatever their directory,
 *         a later one overriding. Of each file only the retention keys and ForwardToSyslog, read as
 *         systemd reads them (a key counts only under a `[Journal]` header, and a file starts outside
 *         every section), with the file's path under its own root (`etc/…`, `run/…`, `usr/…`): as
 *         `Key=value` when the value is in the grammar of that key's parser (sizes, time spans and
 *         counts within their 64 bits, booleans, Storage's four modes; each measured against systemd
 *         255's journald, and narrower than it where it is not equal), and otherwise as the key
 *         alone with `valueUnparsed: true` and no value (systemd keeps a `#` after a value as part of
 *         it, and then refuses the setting). `systemd-analyze cat-config systemd/journald.conf`
 *         differs from journald 255 on the main file: it shows the first of /etc, /run,
 *         /usr/local/lib and /usr/lib's journald.conf that exists, and journald opens none of the
 *         last three, so those are listed by path only, as `notReadBySystemd255`. Whether
 *         /var/log/journal exists; `journalctl --disk-usage`'s line. Forwarding hands the request log
 *         (journald's) to the syslog socket, so: whether /etc/rsyslog.conf exists (never read),
 *         `systemctl is-active rsyslog`'s line, and the rotation directives of
 *         /etc/logrotate.d/rsyslog. nginx's `access_log` directives (nginx.conf, conf.d/*.conf,
 *         sites-enabled/*), found as nginx's tokenizer finds a directive (at a line's start or after
 *         `;`, `{` or `}`), each its own tokens up to its own `;`, a comment inside it dropped, so
 *         nothing else on its line leaves the probe; one with no `;` (which nginx refuses) is
 *         `unterminated: true`, with none of its text. The rotation directives of
 *         /etc/logrotate.d/nginx, and as `defaults` those of /etc/logrotate.conf outside every stanza.
 *         A logrotate directive is reported alone, as logrotate 3.21.0 reads it (measured with
 *         `logrotate -d`): hourly, daily, monthly, yearly; weekly with its weekday; rotate and maxage
 *         with their count as the number logrotate reads (strtol's base 0: 0x10 is 16 and 010 is 8;
 *         `rotate -1` keeps old logs for ever); size, maxsize and minsize with their size as written.
 *         Every directive on a line is read, as logrotate reads them: after a keyword without a value it
 *         reads on (`daily rotate -1`), a `#` where a directive would start ends the line, and a
 *         stanza's `{` and `}` count wherever they fall (`/var/log/wtmp { monthly }`).
 *         One logrotate refuses (a value it cannot read, as in `rotate 4 # …`, or a keyword run into
 *         other text, as in `daily-x`) is `{ directive, valueUnparsed: true }`, with none of its text:
 *         logrotate then skips that stanza, and stops reading the file at that line when the
 *         directive is a bad `weekly` or stands outside every stanza. A script (postrotate …
 *         endscript) holds no directive. It decides what the consent text says about the request log (§6 item 14) and
 *         G1.15's rule.
 *   G-1d  `enforce_assignments` per book; the study book's `user_chapter_assignments` rows, as
 *         (user id, chapter); the `users` rows, as (id, role, active); and AUTO_CREATE_USERS as the
 *         server reads it (systemd's Environment= and EnvironmentFile=, then server/.env where
 *         unset). It decides whether units would open the moment the opening step ships.
 *   G-1e  the study book's segments holding an in-flight edit (pending, or approved and not yet
 *         applied), with counts by state, and its applied rows whose faithful file is gone. It
 *         gives the size of the opening snapshots (§5.5).
 *   G-1f  whether an executable `sqlite3` is on PATH (only backup-db.sh and verify-db-backup.sh
 *         depend on it; §5.17).
 *   G-1g  the study book's units (02-for-mt, every chapter directory, the ids the module route
 *         serves) that lack an MT lock marker, and of those the ones without an MT file. Presence
 *         only: a marker's body holds the time of a person's first act (§5.19) and is never read.
 *
 * The output names no editor: users and assignment rows by id, segments and units by id with
 * counts, from the service configuration and server/.env only the value of AUTO_CREATE_USERS,
 * from nginx, logrotate and journald only the directives named above, and of rsyslog only whether
 * its configuration exists and its unit is active. It may be pasted into the register.
 *
 * An EnvironmentFile= this user cannot read is listed `readable: false`; a readable one without the
 * key has `value: null` and no `readable`. `autoCreateUsers.effective` counts only the files read,
 * so it is unconfirmed when a `readable: false` file outranks its source (every file outranks
 * Environment= and server/.env, a later file an earlier one): that file may set the key, and only a
 * run that can read it settles the value.
 *
 * In G-1c a file this user cannot read, or a directory it cannot list, is listed `{ file, readable:
 * false }` in its place (a journald drop-in directory before the drop-ins, among which its files
 * would sort), and an unreadable logrotate file is `{ readable: false }`: never read as absent (null,
 * or no entry), since journald, nginx and logrotate read their files as root.
 *
 * G-1c's known limits, so its lists are not taken for the whole picture:
 *   - nginx: only the three places above. A file pulled in by any other `include` (snippets/,
 *     modules-enabled/, a path of the site's own) is not read, and an access_log there is missing.
 *     A directive name written in quotes is not recognised.
 *   - journald: a value continued onto the next line by a trailing `\` reads as unparsed.
 *   - logrotate: only logrotate.conf and the nginx and rsyslog files of logrotate.d. A default of
 *     logrotate.conf applies only to stanzas read after it (an `include` above it does not get it);
 *     the defaults are listed in file order, not placed against the include lines. A stanza
 *     logrotate refuses for a reason outside these directives (a file name inside it, a `create`
 *     naming an unknown user, another keyword run into other text) is not detected: its directives
 *     are listed as if applied. A count past logrotate's int is flagged, where logrotate wraps it.
 *
 * It runs where neither PR1 nor PR2 is deployed: it requires only modules present on production
 * before PR1 (its test pins the list; the study-book allowlist is not one of them, so the book is
 * an argument), and it reads PR1's `segment_edits.origin` only when the column exists.
 *
 * The database is opened `readonly: true, fileMustExist: true`, and only while a process holds it:
 * a read-only open of a WAL database whose -wal and -shm are absent would create them, owned by the
 * probe's user (see openReadOnly). Run it while the server runs; then those files exist, are the
 * server's, and the probe creates nothing. Otherwise G-1d and G-1e fail with `WAL_FILES_ABSENT`.
 *
 * Usage (prints one JSON object on stdout; exit 0 every section read, 1 a section failed, 2 usage):
 *   node server/scripts/read-research-preconditions.js efnafraedi-2e
 * On production, where this file is not deployed, send it on stdin from server/scripts, so `../lib` and
 * better-sqlite3 resolve (the route read-pending-edits.js describes), while the server runs:
 *   ssh <prod> "cd <repo>/server/scripts && node - efnafraedi-2e" \
 *     < server/scripts/read-research-preconditions.js > preconditions.json
 * G-1a's spool (every user's crontab) is readable only by root. Run that half as root, opening no database (a root
 * process can leave root-owned -wal/-shm files the service cannot write):
 *   ssh <prod> "cd <repo>/server/scripts && sudo \"\$(command -v node)\" - efnafraedi-2e --sections G-1a,G-1h" \
 *     < server/scripts/read-research-preconditions.js > g1a-g1h.json
 * `--sections <name,...>` reads only the sections named and, when none of them reads the database, never opens it.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const USAGE = 'usage: read-research-preconditions.js <book> [--sections <name,...>]';
const SERVICE_UNIT = 'ritstjorn'; // the unit scripts/deploy.sh restarts
const KEY = 'AUTO_CREATE_USERS'; // its meaning: signInPolicy in server/services/auth.js, never restated here

/** A command's output, or what stopped it. Never throws; a missing command is { ran: false }. */
function execNeverThrow(cmd, args) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ran: true, code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      ran: err.code !== 'ENOENT',
      code: typeof err.status === 'number' ? err.status : null,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || ''),
    };
  }
}

function runSection(read) {
  try {
    return { ok: true, ...read() };
  } catch (err) {
    return { ok: false, error: err.code || err.name, message: err.message };
  }
}

/** Only AUTO_CREATE_USERS leaves this function; every other key of the text is dropped here. */
function pickKey(text) {
  const parsed = require('dotenv').parse(text);
  return Object.hasOwn(parsed, KEY) ? parsed[KEY] : null;
}

function readAutoCreateUsers({ serverDir, exec }) {
  let dotEnv;
  try {
    dotEnv = {
      present: true,
      value: pickKey(fs.readFileSync(path.join(serverDir, '.env'), 'utf8')),
    };
  } catch {
    dotEnv = { present: false, value: null }; // no .env: the server reads none either
  }
  const env = exec('systemctl', ['show', SERVICE_UNIT, '--property=Environment', '--value']);
  const token =
    env.ran && env.code === 0
      ? env.stdout.split(/\s+/).find((t) => t.startsWith(`${KEY}=`))
      : undefined;
  const service = {
    ran: env.ran && env.code === 0,
    value: token === undefined ? null : token.slice(KEY.length + 1),
  };
  const files = exec('systemctl', ['show', SERVICE_UNIT, '--property=EnvironmentFiles', '--value']);
  const environmentFiles = (files.ran && files.code === 0 ? files.stdout.split('\n') : [])
    .map((l) => l.trim().split(/\s+/)[0])
    .filter(Boolean)
    .map((p) => {
      try {
        return { path: p, value: pickKey(fs.readFileSync(p, 'utf8')) };
      } catch {
        // Unreadable to this user: reported as such, not guessed, and so never mistaken for a file
        // without the key.
        return { path: p, readable: false, value: null };
      }
    });
  // systemd: an EnvironmentFile= assignment overrides Environment=, a later file a former one; dotenv
  // (server/index.js) fills a variable from server/.env only where the process environment does not set it.
  // `effective` counts only the files read: beside a `readable: false` file it is unconfirmed (see the header).
  const fromFile = environmentFiles
    .map((f) => f.value)
    .filter((v) => v !== null)
    .at(-1);
  let effective;
  if (fromFile !== undefined) effective = { value: fromFile, source: 'EnvironmentFile' };
  else if (service.value !== null) effective = { value: service.value, source: 'Environment' };
  else if (dotEnv.value !== null) effective = { value: dotEnv.value, source: 'server/.env' };
  else effective = { value: null, source: 'unset' };
  return { dotEnv, service, environmentFiles, effective };
}

function readG1d({ db, book, serverDir, exec }) {
  const conn = db();
  const enforcement = conn
    .prepare('SELECT book, enforce_assignments FROM book_settings ORDER BY book')
    .all()
    .map((r) => ({ book: r.book, enforceAssignments: !!r.enforce_assignments }));
  // isAssignmentEnforced's rule (userService.js): truthiness, and no row is not enforced, so the study book
  // is never absent.
  const own = enforcement.find((e) => e.book === book);
  const studyBookEnforced = own ? own.enforceAssignments : false;
  const assignments = conn
    .prepare(
      'SELECT user_id, chapter FROM user_chapter_assignments WHERE book_slug = ? ORDER BY chapter, user_id'
    )
    .all(book)
    .map((r) => ({ userId: r.user_id, chapter: r.chapter }));
  const users = conn
    .prepare('SELECT id, role, is_active FROM users ORDER BY id')
    .all()
    .map((r) => ({ id: r.id, role: r.role, active: !!r.is_active })); // truthiness, as the sign-in gate (auth.js)
  return {
    enforcement,
    studyBookEnforced,
    assignments,
    assignedChapters: [...new Set(assignments.map((a) => a.chapter))].sort((a, b) => a - b),
    users,
    autoCreateUsers: readAutoCreateUsers({ serverDir, exec }),
  };
}

function readG1e({ db, book, booksDir }) {
  const conn = db();
  const { chapterDir } = require('../lib/chapterLabel');
  const originColumn = conn.pragma('table_info(segment_edits)').some((c) => c.name === 'origin');
  // In flight is isEditInFlight's rule (accept-eligibility.js), in its SQL twin's words (acceptanceService.js).
  // reattach uses CASE, not SUM(origin = 're-attach'): origin is NULL on every pre-PR1 row, and SUM over NULLs is NULL.
  const inflight = conn
    .prepare(
      `SELECT chapter, module_id, segment_id,
              SUM(status = 'pending') AS pending,
              SUM(status = 'approved' AND applied_at IS NULL) AS approvedUnapplied
              ${originColumn ? ", SUM(CASE WHEN origin = 're-attach' THEN 1 ELSE 0 END) AS reattach" : ''}
         FROM segment_edits
        WHERE book = ? AND (status = 'pending' OR (status = 'approved' AND applied_at IS NULL))
        GROUP BY chapter, module_id, segment_id
        ORDER BY chapter, module_id, segment_id`
    )
    .all(book)
    .map((r) => ({
      chapter: r.chapter,
      moduleId: r.module_id,
      segmentId: r.segment_id,
      pending: r.pending,
      approvedUnapplied: r.approvedUnapplied,
      ...(originColumn ? { reattach: r.reattach } : {}),
    }));
  const appliedWithoutFaithful = conn
    .prepare(
      `SELECT DISTINCT chapter, module_id, segment_id FROM segment_edits
        WHERE book = ? AND status = 'approved' AND applied_at IS NOT NULL
        ORDER BY chapter, module_id, segment_id`
    )
    .all(book)
    .filter(
      (r) =>
        !fs.existsSync(
          path.join(
            booksDir,
            book,
            '03-faithful-translation',
            chapterDir(r.chapter),
            `${r.module_id}-segments.is.md`
          )
        )
    )
    .map((r) => ({ chapter: r.chapter, moduleId: r.module_id, segmentId: r.segment_id }));
  return { originColumn, inflight, appliedWithoutFaithful };
}

const UNIT_ID = /^(m\d{5}|chapter-metadata)$/; // what the module route serves (validateModule, validateParams.js)
// The retention keys (the Runtime* limits bound the journal when it is volatile, under /run), and
// ForwardToSyslog, which decides whether the request log also reaches rsyslog. Each with the grammar of
// the parser systemd 255's journald gives it (journald-gperf: config_parse_storage, _iec_uint64,
// _uint64, _sec, _bool), measured with systemd-journald 255 itself on a journald.conf of each form (and
// first through systemd-analyze verify on unit settings that share the parser): a value is printed only
// when it is in its key's grammar, so no free text leaves the probe (systemd keeps a `#` after a value as
// part of the value, and then refuses the setting). Each grammar is narrower than systemd's or equal to
// it: a value outside it is flagged, never guessed.
const UINT64_MAX = 2n ** 64n - 1n; // also USEC_INFINITY, parse_time's ceiling
const LLONG_MAX = 2n ** 63n - 1n;
const BLANKS = ' \t\n\r'; // systemd's WHITESPACE
const skipBlanks = (text, i) => {
  let j = i;
  while (j < text.length && BLANKS.includes(text[j])) j += 1;
  return j;
};

// parse_size's units for base 1024, in its order: a part's unit is the first from where the last
// part's left off that starts the text, and '' (no unit) always does.
const SIZE_UNITS = ['E', 'P', 'T', 'G', 'M', 'K', 'B', ''];
/**
 * parse_size(value, 1024), as config_parse_iec_uint64 calls it (systemd 255): parts of digits, an
 * optional `.` and fraction, and a unit, the units strictly descending (`1G 512M`, never `512M 1G` or
 * `1K 1K`) and a part without one last; no whole or fraction past 64 bits, and the sum within them. A
 * fraction is counted as a whole unit (systemd adds less), and a leading `+` (which systemd takes) is
 * refused: narrower, never wider.
 */
function isSize(value) {
  const part = /[ \t\n\r]*(\d+)(?:\.(\d*))?[ \t\n\r]*/y;
  let sum = 0n;
  let first = 0; // the first unit this part may take
  let i = 0;
  do {
    part.lastIndex = i;
    const m = part.exec(value);
    if (!m) return false;
    i = part.lastIndex;
    let u = first;
    while (u < SIZE_UNITS.length && !value.startsWith(SIZE_UNITS[u], i)) u += 1;
    if (u === SIZE_UNITS.length) return false;
    const factor = 1n << BigInt(10 * Math.max(0, 6 - u)); // E is 2^60 … K 2^10, B and '' 1
    const whole = BigInt(m[1]);
    const fraction = m[2] || '';
    if (whole > UINT64_MAX || (fraction && BigInt(fraction) > UINT64_MAX)) return false; // strtoull's ERANGE
    const frac = /[1-9]/.test(fraction) ? 1n : 0n;
    const add = (whole + frac) * factor; // at least what systemd adds, so its own per-part check is in this one
    if (add > UINT64_MAX - sum) return false;
    sum += add;
    i += SIZE_UNITS[u].length;
    first = u + 1;
  } while (i < value.length);
  return true;
}

// parse_time's units (systemd 255, extract_multiplier), in its order: the first that starts the text.
const SEC = 1000000n;
const TIME_UNITS = [
  ...['seconds', 'second', 'sec', 's'].map((u) => [u, SEC]),
  ...['minutes', 'minute', 'min'].map((u) => [u, 60n * SEC]),
  ...['months', 'month', 'M'].map((u) => [u, 2629800n * SEC]),
  ...['msec', 'ms'].map((u) => [u, 1000n]),
  ['m', 60n * SEC],
  ...['hours', 'hour', 'hr', 'h'].map((u) => [u, 3600n * SEC]),
  ...['days', 'day', 'd'].map((u) => [u, 86400n * SEC]),
  ...['weeks', 'week', 'w'].map((u) => [u, 604800n * SEC]),
  ...['years', 'year', 'y'].map((u) => [u, 31557600n * SEC]),
  ...['usec', 'us', 'μs', 'µs'].map((u) => [u, 1n]),
];
/**
 * parse_time(value, USEC_PER_SEC), as config_parse_sec calls it (systemd 255): `infinity`, or parts of
 * digits with an optional `.` and at least one fraction digit, each followed by a blank, a unit or the
 * end (`1.5 .5` and `1.5s.5`, never `1.5.5`); the total in microseconds, and each whole times its unit,
 * below 2^64 - 1, as parse_time checks them. A leading `+` (which systemd takes) is refused.
 */
function isTimespan(value) {
  if (value === 'infinity') return true; // the value is trimmed
  const number = /(\d*)(?:\.(\d+))?/y;
  let usec = 0n;
  let i = skipBlanks(value, 0);
  if (i === value.length) return false;
  while (i < value.length) {
    number.lastIndex = i;
    const [text, whole, fraction = ''] = number.exec(value);
    if (whole === '' && fraction === '') return false; // neither digits nor `.` and digits
    i += text.length;
    const at = skipBlanks(value, i);
    const unit = TIME_UNITS.find(([u]) => value.startsWith(u, at));
    const next = unit ? at + unit[0].length : at;
    if (next === i && i < value.length) return false; // `1.5.5`: neither a blank nor a unit after it
    const multiplier = unit ? unit[1] : SEC;
    const l = BigInt(whole || '0');
    if (l > LLONG_MAX || l >= UINT64_MAX / multiplier) return false; // strtoll's ERANGE; parse_time's
    if (l * multiplier >= UINT64_MAX - usec) return false;
    usec += l * multiplier;
    let m = multiplier / 10n;
    for (const d of fraction) {
      const k = BigInt(d) * m;
      if (k >= UINT64_MAX - usec) return false;
      usec += k;
      m /= 10n;
    }
    i = skipBlanks(value, next);
  }
  return true;
}

/**
 * safe_atou64, as config_parse_uint64 calls it (systemd 255: strtoull, base 0), narrowed to a decimal
 * without a sign or a leading zero, within 64 bits. journald also takes `+5`, `0x10` and `010` (which it
 * reads as 8): flagged here, since printed as written they would read as another number.
 */
function isCount(value) {
  return /^(?:0|[1-9]\d*)$/.test(value) && BigInt(value) <= UINT64_MAX;
}

const JOURNALD_GRAMMAR = new Map([
  ['Storage', (v) => /^(?:volatile|persistent|auto|none)$/.test(v)],
  ...[
    'SystemMaxUse',
    'SystemKeepFree',
    'SystemMaxFileSize',
    'RuntimeMaxUse',
    'RuntimeKeepFree',
    'RuntimeMaxFileSize',
  ].map((k) => [k, isSize]),
  ['SystemMaxFiles', isCount],
  ['RuntimeMaxFiles', isCount],
  ['MaxRetentionSec', isTimespan],
  ['MaxFileSec', isTimespan],
  ['ForwardToSyslog', (v) => /^(?:1|yes|y|true|t|on|0|no|n|false|f|off)$/i.test(v)],
]);
// logrotate's rotation and retention directives, read as logrotate 3.21.0 (Ubuntu 24.04's package,
// run with -d on each form) reads them. Along a line it reads a run of directives (config.c's default
// state): a keyword is a run of letters, and a digit or a punctuation mark right after it is "not
// properly separated" (logrotate refuses it); an unknown keyword is ignored with the rest of its line;
// a `#` where a keyword would start ends the line. After a keyword without a value logrotate steps
// over the one character that follows it (a space or `=`) and reads on. A valued keyword's value is
// the whole rest of its line, so `rotate 4 # …` is a bad count and is refused too.
const NO_VALUE = new Set(['hourly', 'daily', 'monthly', 'yearly']);
const VALUED = new Set(['weekly', 'rotate', 'maxage', 'size', 'maxsize', 'minsize']);
// logrotate 3.21.0's other keywords without a value (config.c): after one, too, it reads on.
const OTHER_NO_VALUE = new Set([
  'compress',
  'nocompress',
  'delaycompress',
  'nodelaycompress',
  'shred',
  'noshred',
  'allowhardlink',
  'noallowhardlink',
  'sharedscripts',
  'nosharedscripts',
  'copytruncate',
  'nocopytruncate',
  'renamecopy',
  'norenamecopy',
  'copy',
  'nocopy',
  'ifempty',
  'notifempty',
  'dateext',
  'nodateext',
  'dateyesterday',
  'datehourago',
  'noolddir',
  'mailfirst',
  'maillast',
  'nocreateolddir',
  'nocreate',
  'errors',
  'nomail',
  'missingok',
  'nomissingok',
  'ignoreduplicates',
]);
const SCRIPT = new Set(['postrotate', 'prerotate', 'firstaction', 'lastaction', 'preremove']);
const ENDSCRIPT = /^[ \t]*endscript(?![A-Za-z])/;
const FILE_NAME_START = new Set(['/', '"', "'", '~']); // what opens a stanza (config.c, with GLOB_TILDE)
const INT_MAX = 2 ** 31 - 1;

/** A file or directory that exists but that this user cannot read: never mistaken for an absent one. */
const UNREADABLE = Symbol('unreadable');

/** A file's text; null when it is absent (a dangling link included, as for journald); UNREADABLE otherwise. */
function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    return err.code === 'ENOENT' ? null : UNREADABLE;
  }
}

/** The sorted paths of a directory's entries that pass filter; [] when it is absent; UNREADABLE otherwise. */
function listDir(dir, filter = () => true) {
  try {
    return fs
      .readdirSync(dir)
      .filter(filter)
      .sort()
      .map((f) => path.join(dir, f));
  } catch (err) {
    return err.code === 'ENOENT' ? [] : UNREADABLE;
  }
}

/**
 * The journald settings of one file's text, as systemd's parser reads them: each line trimmed, `#` and
 * `;` lines comments, a key counted only under a `[Journal]` header matched exactly (a file starts
 * outside every section), whitespace around `=` and the value stripped. Each as `Key=value`, or as the
 * key alone with `valueUnparsed: true` when the value is not in its grammar.
 */
function journaldSettings(text, file) {
  const out = [];
  let inJournal = false;
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith('#') || l.startsWith(';')) continue;
    if (l.startsWith('[')) {
      inJournal = l === '[Journal]';
      continue;
    }
    const m = inJournal && /^([^=]+?)\s*=\s*(.*)$/.exec(l);
    const grammar = m && JOURNALD_GRAMMAR.get(m[1]);
    if (!grammar) continue;
    out.push(
      grammar(m[2]) ? { file, line: `${m[1]}=${m[2]}` } : { file, key: m[1], valueUnparsed: true }
    );
  }
  return out;
}

/**
 * The access_log directives of an nginx file's text, by nginx's tokenizer (ngx_conf_read_token): a
 * directive starts at the file's start or after `;`, `{` or `}`; a `#` at a token's start comments out
 * the rest of the line; inside quotes `;` and `#` are text; a bare token ends at whitespace, `;` or `{`,
 * except a `{` after an unescaped `$` (`${host}`), which nginx keeps in the token.
 * Each directive is its tokens joined by one space, up to its own `;`: a comment inside it, and whatever
 * follows the `;`, stay behind. One with no `;` before a `{`, `}` or the file's end (which nginx
 * refuses) is `{ unterminated: true }`, with none of its text: without a terminator it has no end.
 */
function accessLogDirectives(text) {
  const out = [];
  let atStart = true;
  let tokens = null; // the access_log being read
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i += 1;
    } else if (c === '#') {
      while (i < text.length && text[i] !== '\n') i += 1;
    } else if (c === ';' || c === '{' || c === '}') {
      if (tokens) out.push(c === ';' ? { line: `${tokens.join(' ')};` } : { unterminated: true });
      tokens = null;
      atStart = true;
      i += 1;
    } else {
      const start = i;
      if (c === '"' || c === "'") {
        i += 1;
        while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
        i += 1;
      } else {
        while (i < text.length && !/[\s;{]/.test(text[i])) {
          if (text[i] === '\\') {
            i += 2;
          } else if (text[i] === '$') {
            i += 1;
            while (text[i] === '{') i += 1; // a `{` after `$` is the token's (`${host}`), as its variable flag holds
          } else {
            i += 1;
          }
        }
      }
      const token = text.slice(start, i);
      if (atStart && token === 'access_log') tokens = [token];
      else if (tokens) tokens.push(token);
      atStart = false;
    }
  }
  if (tokens) out.push({ unterminated: true });
  return out;
}

/** strtol's base 0 over the whole text (0x10 is 16, 010 is 8); NaN where its parse would stop early. */
function baseZero(text) {
  const m = /^([+-]?)(?:0[xX]([0-9a-fA-F]+)|(0[0-7]*)|([1-9]\d*))$/.exec(text);
  if (!m) return NaN;
  const [, sign, hex, octal, decimal] = m;
  const v =
    hex !== undefined
      ? parseInt(hex, 16)
      : octal !== undefined
        ? parseInt(octal, 8)
        : parseInt(decimal, 10);
  return sign === '-' ? -v : v;
}

/**
 * A valued rotation directive, its value the rest of its trimmed line (`rest`, the text after the
 * keyword), as logrotate reads it: the directive alone (a count as the number logrotate reads, a size
 * as written), or `{ directive, valueUnparsed: true }`, with none of its text, where logrotate refuses it.
 */
function valuedDirective(word, rest) {
  const refused = { directive: word, valueUnparsed: true };
  if (word === 'weekly') {
    // Its optional weekday, 0 to 7, alone; `weekly=3` and `weekly 8` are bad weekly directives.
    if (rest === '') return 'weekly'; // the line is trimmed, so trailing blanks are gone
    const day = /^[ \t]+([0-7])[ \t]*$/.exec(rest);
    return day ? `weekly ${day[1]}` : refused;
  }
  const value = /^(?:[ \t]*=[ \t]*|[ \t]+)(.+)$/.exec(rest)?.[1].trim();
  if (!value) return refused; // no argument, or a value run into the keyword (`rotate4`)
  if (word === 'rotate') {
    // -1 keeps old logs for ever; below it logrotate refuses. Past its int, logrotate wraps: flagged.
    const n = baseZero(value);
    return Number.isInteger(n) && n >= -1 && n <= INT_MAX ? `rotate ${n}` : refused;
  }
  if (word === 'maxage') {
    const n = value.startsWith('-') ? NaN : baseZero(value);
    return Number.isInteger(n) && n <= INT_MAX ? `maxage ${n}` : refused;
  }
  // size, maxsize, minsize: a count in base 0, then k, K, M or G (`1g`, `100MB`, `1.5G` are refused).
  return /^\+?(?:0[xX][0-9a-fA-F]+|0[0-7]*|[1-9]\d*)[kKMG]?$/.test(value)
    ? `${word} ${value}`
    : refused;
}

/**
 * A logrotate file's rotation directives in its order, outside every stanza only when `topLevel` (the
 * defaults logrotate.conf sets); null when absent, `{ readable: false }` when unreadable. Each line is
 * read as logrotate reads it (above): every directive on it, a stanza's `{` and `}` wherever they fall
 * (its file names, never read, run from a file name to the next `{`, over lines, a line starting with
 * `#` among them a comment; nothing after a `}` is read), and a script (postrotate … endscript) holds
 * no directive, logrotate reading on after its `endscript`.
 */
function rotationDirectives(file, { topLevel = false } = {}) {
  const text = readText(file);
  if (text === UNREADABLE) return { readable: false };
  if (text === null) return null;
  const out = [];
  let inStanza = false;
  let inFileNames = false; // between a stanza's first file name and its `{`
  let inScript = false;
  const push = (d) => {
    if (!(topLevel && inStanza)) out.push(d);
  };
  for (const raw of text.split('\n')) {
    let rest = raw.trim();
    if (inScript) {
      const end = ENDSCRIPT.exec(rest);
      if (!end) continue;
      inScript = false;
      rest = rest.slice(end[0].length + 1); // logrotate steps over the one character after it
    } else if (inFileNames) {
      const open = rest.startsWith('#') ? -1 : rest.indexOf('{');
      if (open < 0) continue;
      inFileNames = false;
      inStanza = true;
      rest = rest.slice(open + 1);
    }
    for (;;) {
      rest = rest.replace(/^[ \t]+/, '');
      if (rest === '' || rest[0] === '#') break;
      if (rest[0] === '}') {
        inStanza = false;
        break; // logrotate reads nothing after a stanza's `}`
      }
      if (FILE_NAME_START.has(rest[0])) {
        if (inStanza) break; // logrotate refuses a file name inside a stanza
        const open = rest.indexOf('{');
        if (open < 0) {
          inFileNames = true;
          break;
        }
        inStanza = true;
        rest = rest.slice(open + 1);
        continue;
      }
      const word = /^[A-Za-z]+/.exec(rest)?.[0];
      if (!word) break; // neither a keyword nor a file name: logrotate refuses the line
      const after = rest.slice(word.length);
      if (VALUED.has(word)) {
        push(valuedDirective(word, after));
        break; // its value is the rest of the line
      }
      if (after !== '' && !/^[\s=]/.test(after)) {
        if (NO_VALUE.has(word)) push({ directive: word, valueUnparsed: true }); // `daily-x`
        break;
      }
      rest = after.slice(1); // the one character that separates it
      if (NO_VALUE.has(word)) push(word);
      else if (SCRIPT.has(word)) {
        const end = ENDSCRIPT.exec(rest); // a script that ends on the line that opens it
        if (!end) {
          inScript = true;
          break;
        }
        rest = rest.slice(end[0].length + 1);
      } else if (!OTHER_NO_VALUE.has(word)) break; // a valued keyword's line, or an unknown one's
    }
  }
  return out;
}

/**
 * The files journald applies, in its order, each as { abs, file } with `file` under its own root; the
 * drop-in directories it could not list; and the main-file candidates journald never opens: systemd
 * 255's journald, measured by strace.
 */
function journaldFiles({ etcRoot, runRoot, usrRoot }) {
  // Highest precedence first.
  const dirs = [
    ['etc', etcRoot, 'systemd'],
    ['run', runRoot, 'systemd'],
    ['usr', usrRoot, path.join('local', 'lib', 'systemd')],
    ['usr', usrRoot, path.join('lib', 'systemd')],
  ].map(([label, root, sub]) => ({ abs: path.join(root, sub), file: path.join(label, sub) }));
  const at = (d, name) => ({ abs: path.join(d.abs, name), file: path.join(d.file, name) });
  // One main file, etc's, whatever it holds: journald 255 opens no other (cat-config shows the first
  // of the four that exists, and the strace shows journald opening none of the other three).
  const [main, ...notRead] = dirs.map((d) => at(d, 'journald.conf'));
  // Drop-ins: a name taken by an earlier directory masks it in every later one.
  const byName = new Map();
  const unlisted = [];
  for (const d of dirs) {
    const dropIns = at(d, 'journald.conf.d');
    const names = listDir(dropIns.abs, (n) => n.endsWith('.conf') && !n.startsWith('.'));
    if (names === UNREADABLE) {
      unlisted.push(dropIns.file);
      continue;
    }
    for (const f of names) {
      const name = path.basename(f);
      if (!byName.has(name)) byName.set(name, at(dropIns, name));
    }
  }
  const dropIns = [...byName.keys()].sort().map((name) => byName.get(name));
  return {
    // An absent or dangling etc file reads as no lines, as journald's open gets ENOENT.
    main,
    unlisted,
    dropIns,
    // Presence only: never opened, by journald 255 or by the probe.
    notRead: notRead.filter((f) => fs.existsSync(f.abs)).map((f) => f.file),
  };
}

function readG1c({ etcRoot, runRoot, usrRoot, varRoot, exec }) {
  const rel = (f) => path.relative(etcRoot, f);
  const du = exec('journalctl', ['--disk-usage']);
  const rsyslogActive = exec('systemctl', ['is-active', 'rsyslog']);
  // A command's first non-blank line, at most 200 characters, or null when it printed none.
  const firstLine = (s) => {
    const line = String(s || '')
      .split('\n')
      .find((l) => l.trim());
    return line ? line.trim().slice(0, 200) : null;
  };
  const journal = journaldFiles({ etcRoot, runRoot, usrRoot });
  const settingsOf = ({ abs, file }) => {
    const text = readText(abs);
    if (text === UNREADABLE) return [{ file, readable: false }];
    return text === null ? [] : journaldSettings(text, file);
  };
  const ng = path.join(etcRoot, 'nginx');
  const listed = (dir, filter) => {
    const files = listDir(dir, filter);
    return files === UNREADABLE ? [{ unlisted: dir }] : files;
  };
  const accessLogOf = (f) => {
    if (typeof f === 'object') return [{ file: rel(f.unlisted), readable: false }];
    const text = readText(f);
    if (text === UNREADABLE) return [{ file: rel(f), readable: false }];
    return text === null ? [] : accessLogDirectives(text).map((d) => ({ file: rel(f), ...d }));
  };
  return {
    journald: {
      settings: [
        ...settingsOf(journal.main),
        ...journal.unlisted.map((file) => ({ file, readable: false })),
        ...journal.dropIns.flatMap(settingsOf),
      ],
      notReadBySystemd255: journal.notRead,
      persistentDir: fs.existsSync(path.join(varRoot, 'log', 'journal')),
      diskUsage: { ran: du.ran, output: du.ran ? firstLine(du.stdout || du.stderr) : null },
    },
    // Where a forwarded line may go. Presence only: rsyslog.conf is never read.
    rsyslog: {
      configPresent: fs.existsSync(path.join(etcRoot, 'rsyslog.conf')),
      active: {
        ran: rsyslogActive.ran,
        output: rsyslogActive.ran ? firstLine(rsyslogActive.stdout || rsyslogActive.stderr) : null,
      },
    },
    nginx: {
      // Only the access_log directives, each cut at its own `;`: a server_name, a comment or any
      // other directive stays behind, on its line or beside it.
      accessLog: [
        path.join(ng, 'nginx.conf'),
        ...listed(path.join(ng, 'conf.d'), (f) => f.endsWith('.conf')),
        ...listed(path.join(ng, 'sites-enabled')),
      ].flatMap(accessLogOf),
    },
    // The access log's and the syslog's retention are set here (§6 item 14, G1.15), so only the
    // rotation directives.
    logrotate: {
      defaults: rotationDirectives(path.join(etcRoot, 'logrotate.conf'), { topLevel: true }),
      nginx: rotationDirectives(path.join(etcRoot, 'logrotate.d', 'nginx')),
      rsyslog: rotationDirectives(path.join(etcRoot, 'logrotate.d', 'rsyslog')),
    },
  };
}

function readG1f({ pathEnv }) {
  for (const dir of String(pathEnv || '')
    .split(path.delimiter)
    .filter(Boolean)) {
    const p = path.join(dir, 'sqlite3');
    try {
      fs.accessSync(p, fs.constants.X_OK);
      if (fs.statSync(p).isFile()) return { sqlite3: { onPath: true, path: p } };
    } catch {
      // not here, or not executable: keep looking
    }
  }
  return { sqlite3: { onPath: false, path: null } };
}

function readG1g({ book, booksDir }) {
  const { mtLockPathFor } = require('../../tools/lib/mt-lock.cjs');
  const { chapterFromDir } = require('../lib/chapterLabel');
  const forMt = path.join(booksDir, book, '02-for-mt');
  const units = [];
  for (const dir of fs.readdirSync(forMt).filter((d) => chapterFromDir(d) !== null)) {
    for (const f of fs.readdirSync(path.join(forMt, dir))) {
      if (!f.endsWith('-segments.en.md')) continue; // skips the legacy -segments(b).en.md files
      const moduleId = f.slice(0, -'-segments.en.md'.length);
      if (!UNIT_ID.test(moduleId)) continue; // skips exercises-segments.en.md, as listChapterModules does
      const mtOutput = path.join(booksDir, book, '02-mt-output', dir, `${moduleId}-segments.is.md`);
      units.push({
        unit: `${dir}/${moduleId}`,
        mt: fs.existsSync(mtOutput),
        locked: fs.existsSync(mtLockPathFor(mtOutput)), // presence only: never the body (spec §5.19)
      });
    }
  }
  const sorted = (xs) => xs.map((u) => u.unit).sort();
  return {
    unitCount: units.length,
    lacking: sorted(units.filter((u) => !u.locked)),
    lackingMtFile: sorted(units.filter((u) => !u.locked && !u.mt)),
  };
}

// G-1a, crontab half (spec §9; PR4 decision 34). A line is a COPY when it holds a copying tool and names pipeline-output
// or anything above the research directory. Lines are returned redacted; a whole crontab never leaves this function.
const KNOWN_JOBS = Object.freeze([
  'git-backup.sh',
  'backup-db.sh',
  'verify-db-backup.sh',
  'research-backup.sh',
  'verify-research-backup.sh',
]);
// The tool bare or by an absolute path: /usr/bin/rsync is a copy too (a bare-name test misses it, measured).
// A quote counts as a word start too, so `bash -c 'tar …'` is seen (review finding 2026-11-08).
const COPY_TOOL =
  /(?:^|[\s;|&(`'"])(?:\/[^\s;|&()`'"]*\/)?(?:tar|rsync|cp|scp|rclone|restic|borg|duplicity|zip|cpio|dd)(?=\s)/;
const ASSIGNMENT_ONLY = /^[A-Za-z_][A-Za-z0-9_]*=\S*$/;
const ASSIGNMENT_WORD = /^[A-Za-z_][A-Za-z0-9_]*=/;
// A copy that leaves the research file out: returned apart, for [USER]'s judgment (spec §9: "excluded the file").
const EXCLUDES_RESEARCH = /--exclude(?:-from)?[= ]['"]?[^\s'"]*research/;
const unquote = (w) => w.replace(/^["'(]+|["');]+$/g, '');
// Programs that run the script named among their arguments: the script is what is read.
const WRAPPERS = new Set([
  'sh',
  'bash',
  'dash',
  'zsh',
  'ksh',
  'python',
  'python3',
  'perl',
  'node',
  'env',
  'nice',
  'ionice',
  'nohup',
  'flock',
  'timeout',
  'sudo',
  'setsid',
  'chronic',
  'xargs',
]);

// Redaction keeps only the words it knows are safe and replaces every other word with <redacted> (review finding
// 2026-11-08: a list of the shapes a secret takes — NAME=value, --opt=value — missed `--password X`, `-p X`, `-pX`
// and a URL's user:password@). Kept: a crontab line's schedule fields and user field (by position), every command
// word (the first, and the first after &&, ||, ; or |), a copying tool's or wrapper's name, an option made of
// letters and dashes only, a shell operator or redirection, a path word (/, ~, $HOME, ./ or ../; never one holding
// @ or ://), and an --exclude/--include value, which a reader needs in order to judge the exclusion. A NAME=value
// or --opt=value word keeps its name. What no rule can tell from a flag: a letters-only secret glued to a short
// option (`-pHunter`), so G-1a's output is still read before it is pasted.
const KEEP_VALUE = /^--(?:exclude|include)(?:-from)?$/;
const SAFE_NAMES = new Set([
  'tar',
  'rsync',
  'cp',
  'scp',
  'rclone',
  'restic',
  'borg',
  'duplicity',
  'zip',
  'cpio',
  'dd',
]);
const SHELL_OPERATOR = /^[0-9]*[<>|&;]+[&0-9]*$/;
const LETTERS_OPTION = /^--?[A-Za-z][A-Za-z-]*$/;
const isPathWord = (w) =>
  /^(?:\/|~|\$HOME\b|\$\{HOME\}|\.\.?\/)/.test(unquote(w)) && !/@|:\/\//.test(w);

/** @param {string} line @param {{ skip?: string, hasUser?: boolean } | null} kind a crontab's, or null for a script */
function redactLine(line, kind = null) {
  const words = line.trim().split(/\s+/);
  let fixed = 0;
  if (kind) {
    fixed = kind.skip === 'anacron' ? 3 : words[0].startsWith('@') ? 1 : 5;
    if (kind.hasUser) fixed += 1;
  }
  let expectCommand = true;
  let keepNext = false;
  return words
    .map((w, i) => {
      if (i < fixed) return w;
      const keep = keepNext;
      keepNext = false;
      const assign = /^(--?[A-Za-z][\w-]*|[A-Za-z_]\w*)=/.exec(w);
      if (assign) return KEEP_VALUE.test(assign[1]) ? w : `${assign[1]}=<redacted>`;
      if (SHELL_OPERATOR.test(w)) {
        if (/^(?:&&|\|\||;|\|)$/.test(w)) expectCommand = true;
        return w;
      }
      if (expectCommand) {
        expectCommand = false;
        return w;
      }
      if (keep || isPathWord(w) || w === '-') return w;
      if (LETTERS_OPTION.test(w)) {
        if (KEEP_VALUE.test(w)) keepNext = true; // --exclude PATTERN, space form
        return w;
      }
      const bare = path.basename(unquote(w));
      if (SAFE_NAMES.has(bare) || WRAPPERS.has(bare)) return w;
      return '<redacted>';
    })
    .join(' ');
}

/** Whether a word of the line is ~, $HOME, / or an absolute path at or above dir. */
function namesAncestor(line, dir) {
  for (const raw of line.split(/\s+/)) {
    const p = raw.replace(/^["'(]+|["');]+$/g, '');
    if (/^(?:~|\$HOME|\$\{HOME\})(?:\/|$)/.test(p)) return true;
    if (p.startsWith('/')) {
      const q = p.replace(/\/+$/, '') || '/';
      if (q === '/' || dir === q || dir.startsWith(`${q}/`)) return true;
    }
  }
  return false;
}

/** @returns {null | { kind: 'copy' | 'excluded-copy' | 'unclassified', line } | { kind: 'known', job }} */
function classifyCronLine(line, dir, kind = null) {
  const t = line.trim();
  if (!t || t.startsWith('#') || ASSIGNMENT_ONLY.test(t)) return null;
  const mentions = t.includes('pipeline-output');
  if (COPY_TOOL.test(t) && (mentions || namesAncestor(t, dir))) {
    return {
      kind: EXCLUDES_RESEARCH.test(t) ? 'excluded-copy' : 'copy',
      line: redactLine(t, kind),
    };
  }
  const job = KNOWN_JOBS.find((j) =>
    new RegExp(`/scripts/${j.replace(/\./g, '\\.')}(?:\\s|$)`).test(t)
  );
  if (job) return { kind: 'known', job };
  if (mentions) return { kind: 'unclassified', line: redactLine(t, kind) };
  return null;
}

const OPERATOR = /^(?:&&|\|\||;|\|)$/;
const UNRESOLVABLE = /^(?:~|\$HOME\b|\$\{HOME\})/;

/**
 * Every command a crontab line runs, with its arguments: the first word after its schedule (five fields, or an @
 * keyword; an anacrontab line's period, delay and job id), its user field where the file has one, and any NAME=value
 * words; then the first word after each &&, ||, ; or |.
 */
function commandsOf(line, { skip, hasUser }) {
  const words = line.trim().split(/\s+/);
  let i = skip === 'anacron' ? 3 : words[0].startsWith('@') ? 1 : 5;
  if (hasUser) i += 1;
  const out = [];
  let current = null;
  let expectCommand = true;
  for (; i < words.length; i++) {
    let w = words[i];
    const ends = w.length > 1 && w.endsWith(';'); // `a; b`
    if (ends) w = w.slice(0, -1);
    if (OPERATOR.test(w)) {
      expectCommand = true;
      continue;
    }
    if (expectCommand) {
      if (!ASSIGNMENT_WORD.test(w)) {
        current = { word: unquote(w), args: [] };
        out.push(current);
        expectCommand = false;
      }
    } else current.args.push(unquote(w));
    if (ends) expectCommand = true;
  }
  return out;
}

/**
 * What one command position runs, for the probe to read: a list of { path } (a script to follow) and { path, refused }
 * (one it cannot follow); empty when the command reads no script (a bare program such as cp, cd or run-parts). A
 * wrapper yields EVERY regular file among its absolute-path arguments, because the first may not be the script: flock
 * creates its lock file on the first run, and a lock file has no lines (review, 2026-11-08). An absent path or a
 * directory is passed over, a NAME=value word is not a path, and a relative or ~-rooted path cannot be resolved here,
 * so it is listed, never dropped.
 */
function followTargets({ word, args }) {
  const name = path.basename(word);
  if (WRAPPERS.has(name)) {
    const out = [];
    for (const a of args) {
      if (a.startsWith('-') || ASSIGNMENT_WORD.test(a) || !/[/~$]/.test(a)) continue; // not a path
      if (UNRESOLVABLE.test(a) || !path.isAbsolute(a)) {
        out.push({ path: a, refused: 'command not followed' });
        continue;
      }
      try {
        if (fs.statSync(a).isFile()) out.push({ path: a });
      } catch {
        // absent: not a script this wrapper runs
      }
    }
    return out;
  }
  if (path.isAbsolute(word)) return [{ path: word }];
  if (word.includes('/') || UNRESOLVABLE.test(word)) {
    return [{ path: word, refused: 'command not followed' }];
  }
  return [];
}

const SCRIPT_TEXT_MAX = 1024 * 1024;
/** A command file's text, or why it cannot be read as text: 'unreadable', or 'not a text file' (binary or large). */
function readCommandFile(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > SCRIPT_TEXT_MAX) return { refused: 'not a text file' };
    const bytes = fs.readFileSync(file);
    if (bytes.subarray(0, 4096).includes(0)) return { refused: 'not a text file' };
    return { text: bytes.toString('utf8') };
  } catch {
    return { refused: 'unreadable' };
  }
}

/** Every cron source, in order, with its text; the spool's own state apart. */
function cronSources({ etcRoot, varRoot, exec }) {
  const sources = [];
  const label = (abs) => `/etc/${path.relative(etcRoot, abs)}`;
  const addFile = (abs, source, kind) => {
    const text = readText(abs);
    const state = text === null ? 'absent' : text === UNREADABLE ? 'unreadable' : 'read';
    sources.push({ source, state, text: state === 'read' ? text : null, kind });
  };
  const spoolDir = path.join(varRoot, 'spool', 'cron', 'crontabs');
  let spool = 'absent';
  if (fs.existsSync(spoolDir)) {
    const users = listDir(spoolDir);
    if (users === UNREADABLE) spool = 'unreadable';
    else {
      spool = 'read';
      for (const f of users) addFile(f, `spool:${path.basename(f)}`, { hasUser: false });
    }
  }
  const mine = exec('crontab', ['-l']);
  if (mine.ran && mine.code === 0) {
    sources.push({
      source: 'crontab -l',
      state: 'read',
      text: mine.stdout,
      kind: { hasUser: false },
    });
  } else if (mine.ran && mine.code === 1 && /no crontab/i.test(mine.stderr)) {
    sources.push({ source: 'crontab -l', state: 'none', text: null, kind: null });
  } else {
    sources.push({ source: 'crontab -l', state: 'unreadable', text: null, kind: null });
  }
  addFile(path.join(etcRoot, 'crontab'), '/etc/crontab', { hasUser: true });
  addFile(path.join(etcRoot, 'anacrontab'), '/etc/anacrontab', { skip: 'anacron', hasUser: false });
  const visible = (f) => !f.startsWith('.');
  const cronD = path.join(etcRoot, 'cron.d');
  const dropIns = listDir(cronD, visible);
  if (dropIns === UNREADABLE)
    sources.push({ source: label(cronD), state: 'unreadable', text: null, kind: null });
  else for (const f of dropIns) addFile(f, label(f), { hasUser: true });
  for (const period of ['hourly', 'daily', 'weekly', 'monthly']) {
    const dir = path.join(etcRoot, `cron.${period}`);
    const scripts = listDir(dir, visible);
    if (scripts === UNREADABLE)
      sources.push({ source: label(dir), state: 'unreadable', text: null, kind: null });
    else for (const f of scripts) addFile(f, label(f), null); // scripts: classified, never followed
  }
  return { spool, sources };
}

function readG1a({ etcRoot, varRoot, exec, researchDir }) {
  const dir = researchDir();
  const { spool, sources } = cronSources({ etcRoot, varRoot, exec });
  const copies = [];
  const excludedCopies = [];
  const unclassified = [];
  const known = new Set();
  const take = (source, line, kind) => {
    const c = classifyCronLine(line, dir, kind);
    if (!c) return false;
    if (c.kind === 'copy') copies.push({ source, line: c.line });
    else if (c.kind === 'excluded-copy') excludedCopies.push({ source, line: c.line });
    else if (c.kind === 'unclassified') unclassified.push({ source, line: c.line });
    else known.add(c.job);
    return true;
  };
  for (const s of sources) {
    if (s.text === null) continue;
    for (const line of s.text.split('\n')) {
      if (take(s.source, line, s.kind) || !s.kind) continue;
      const t = line.trim();
      if (!t || t.startsWith('#') || ASSIGNMENT_ONLY.test(t)) continue;
      // One level into each command a crontab line runs: a program the probe cannot read may copy anything, so what
      // it cannot follow is listed, never dropped.
      for (const command of commandsOf(t, s.kind)) {
        for (const target of followTargets(command)) {
          const file = target.refused ? target : readCommandFile(target.path);
          if (file.refused) {
            unclassified.push({
              source: `${s.source} → ${target.path} (${file.refused})`,
              line: redactLine(t, s.kind),
            });
          } else {
            for (const inner of file.text.split('\n')) take(`${s.source} → ${target.path}`, inner);
          }
        }
      }
    }
  }
  const bySourceThenLine = (a, b) =>
    a.source < b.source
      ? -1
      : a.source > b.source
        ? 1
        : a.line < b.line
          ? -1
          : a.line > b.line
            ? 1
            : 0;
  return {
    spool,
    sources: sources.map(({ source, state }) => ({ source, state })),
    complete: spool !== 'unreadable' && sources.every((s) => s.state !== 'unreadable'),
    copies: copies.sort(bySourceThenLine),
    excludedCopies: excludedCopies.sort(bySourceThenLine),
    unclassified: unclassified.sort(bySourceThenLine),
    known: [...known].sort(),
  };
}

const RESEARCH_JOB_LINE = /\/scripts\/research-backup\.sh(\s|$)/;
const cronLinesOf = (text) =>
  text.split('\n').filter((l) => {
    const s = l.trim();
    return s && !s.startsWith('#') && RESEARCH_JOB_LINE.test(s);
  });
const scheduleOf = (line) => line.trim().split(/\s+/).slice(0, 5).join(' ');

function readG1h({ serverDir, etcRoot, varRoot, exec, researchDir }) {
  // Required lazily, as researchDir's default: they exist on production once PR4 is deployed.
  const { researchFilesFor } = require('../lib/researchFiles');
  const { RESEARCH_BACKUP_STALE_HOURS } = require('../lib/researchBackupPolicy');
  const { sources } = cronSources({ etcRoot, varRoot, exec });
  const found = [];
  for (const s of sources) {
    if (s.text === null || !s.kind) continue; // crontabs only: a cron script is not where the job is installed
    for (const line of cronLinesOf(s.text)) found.push({ source: s.source, line });
  }
  const templateText = fs.readFileSync(
    path.join(serverDir, '..', 'scripts', 'install-cron.sh'),
    'utf8'
  );
  const [template] = cronLinesOf(templateText);
  const installed = found.length > 0;
  const scheduleMatchesTemplate =
    installed &&
    Boolean(template) &&
    found.every((f) => scheduleOf(f.line) === scheduleOf(template));
  // Computed here and never returned: only whether the value names a research remote leaves the probe.
  const researchRemote =
    installed &&
    found.every((f) => {
      const m = /(?:^|\s)RESEARCH_REMOTE=(\S+)/.exec(f.line);
      return Boolean(m) && /^research/.test(m[1]) && /[:/]$/.test(m[1]);
    });
  // Every research-side path but the file's own derives from its directory (researchFiles.js).
  const beat = researchFilesFor(path.join(researchDir(), 'research.db')).heartbeatPath;
  let mtimeMs = null;
  try {
    mtimeMs = fs.statSync(beat).mtimeMs;
  } catch {
    // missing: not present
  }
  const ageHours = mtimeMs === null ? null : Math.round((Date.now() - mtimeMs) / 3_600_000);
  const fresh = ageHours !== null && ageHours <= RESEARCH_BACKUP_STALE_HOURS;
  return {
    cron: {
      installed,
      sources: [...new Set(found.map((f) => f.source))].sort(),
      scheduleMatchesTemplate,
      researchRemote,
    },
    heartbeat: { present: mtimeMs !== null, ageHours, fresh },
    ready: installed && scheduleMatchesTemplate && researchRemote && fresh,
  };
}

const SECTIONS = {
  'G-1a': readG1a,
  'G-1c': readG1c,
  'G-1d': readG1d,
  'G-1e': readG1e,
  'G-1f': readG1f,
  'G-1g': readG1g,
  'G-1h': readG1h,
};

function readResearchPreconditions({
  book,
  openDb,
  serverDir,
  booksDir,
  etcRoot = '/etc',
  runRoot = '/run',
  usrRoot = '/usr',
  varRoot = '/var',
  pathEnv = process.env.PATH,
  exec = execNeverThrow,
  only = null,
  // Required lazily: G-1a and G-1h are read after PR4's deploy, and a run on an older tree reports those sections as
  // failed while the others read.
  researchDir = () => {
    const { researchFilesFor } = require('../lib/researchFiles');
    const { resolveResearchDbPath } = require('../lib/researchDbPath');
    return researchFilesFor(resolveResearchDbPath().researchPath).dir;
  },
}) {
  let handle = null;
  let openError = null;
  // Opened once, lazily, on the first section that reads the database; a failed open fails
  // every database section with the same error and leaves the others to run.
  const db = () => {
    if (!handle && !openError) {
      try {
        handle = openDb();
      } catch (err) {
        openError = err;
      }
    }
    if (openError) throw openError;
    return handle;
  };
  const ctx = {
    book,
    db,
    serverDir,
    booksDir,
    etcRoot,
    runRoot,
    usrRoot,
    varRoot,
    pathEnv,
    exec,
    researchDir,
  };
  const sections = {};
  try {
    for (const [name, read] of Object.entries(SECTIONS)) {
      if (only && !only.includes(name)) continue; // --sections: a section not named never runs, nor opens the db
      sections[name] = runSection(() => read(ctx));
    }
  } finally {
    if (handle) handle.close();
  }
  return { book, ok: Object.values(sections).every((s) => s.ok), sections };
}

/**
 * The database, opened `readonly: true, fileMustExist: true`. A read-only open of a WAL database whose
 * -wal and -shm files are absent creates both, owned by this user, and leaves them after close
 * (measured); made by another user than the server's, they can keep the server from opening its
 * database. They are absent only when no process holds the database, so that case is refused here,
 * before any open, and the database sections fail with the reason. While the server runs, both files
 * exist and this is the plain read-only open (measured against a process writing throughout: no
 * refusal, no error, every read current).
 */
function openReadOnly(dbPath) {
  let header = null;
  try {
    const fd = fs.openSync(dbPath, 'r');
    try {
      header = Buffer.alloc(20);
      fs.readSync(fd, header, 0, 20, 0);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    header = null; // absent or unreadable: the open below reports it as it always has
  }
  // SQLite's header: the magic string, then bytes 18 and 19 (write and read versions) are 2 in WAL mode.
  const wal =
    header !== null &&
    header.subarray(0, 16).toString('latin1') === 'SQLite format 3\0' &&
    header[18] === 2 &&
    header[19] === 2;
  if (wal && !(fs.existsSync(`${dbPath}-wal`) && fs.existsSync(`${dbPath}-shm`))) {
    const err = new Error(
      'the database is in WAL mode and its -wal and -shm files are absent, so no process holds it (is the ' +
        'server stopped?); a read-only open would create them as this user. Run the probe while the server runs.'
    );
    err.code = 'WAL_FILES_ABSENT';
    throw err;
  }
  return new (require('better-sqlite3'))(dbPath, { readonly: true, fileMustExist: true });
}

/** @returns {0|1|2} */
function main(argv, env = process.env) {
  const args = argv.slice(2);
  // `<book>` or `<book> --sections <name,...>`; anything else (an unknown or empty name, any other flag) is usage.
  const only =
    args.length === 3 && args[1] === '--sections' ? args[2].split(',').filter(Boolean) : null;
  const sectionsOk =
    args.length === 1 ||
    (only !== null && only.length > 0 && only.every((n) => Object.hasOwn(SECTIONS, n)));
  // A book starts with a letter or a digit, so a lone flag (`--help`, `--write`) is a usage error, not a book.
  if (!sectionsOk || !/^[a-z0-9][a-z0-9-]*$/.test(args[0])) {
    console.error(USAGE);
    return 2;
  }
  const resolveDbPath = require('../lib/dbPath');
  // Absolute in a file run and in a stdin run alike, and anchored on the file that locates the database.
  const serverDir = path.resolve(path.dirname(require.resolve('../lib/dbPath')), '..');
  const report = readResearchPreconditions({
    book: args[0],
    openDb: () => openReadOnly(resolveDbPath()),
    serverDir,
    // Test seam, as scripts/backfill-mt-locks.js: never set in production.
    booksDir: env.BOOKS_ROOT_OVERRIDE || path.join(serverDir, '..', 'books'),
    only,
  });
  process.stdout.write(
    JSON.stringify(
      { probe: 'read-research-preconditions', readAt: new Date().toISOString(), ...report },
      null,
      1
    ) + '\n'
  );
  return report.ok ? 0 : 1;
}

// A file run sets require.main; a stdin run (`node -`) does not, and must still execute (read-apply-exposure.js).
const runDirectly = require.main === module || (module.id === '[stdin]' && process.argv[1] === '-');
if (runDirectly) {
  process.exitCode = 1; // a failure default: a run that dies before main() returns is never 0
  process.exitCode = main(process.argv);
}

module.exports = {
  readResearchPreconditions,
  readAutoCreateUsers,
  readG1c,
  readG1d,
  readG1e,
  readG1f,
  readG1g,
  readG1a,
  readG1h,
  classifyCronLine,
  redactLine,
  execNeverThrow,
  SECTIONS,
};
