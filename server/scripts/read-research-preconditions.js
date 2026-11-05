#!/usr/bin/env node
/**
 * READ-ONLY: the production checks that must be answered before the module-opening step ships
 * and before any research capture (G1.1 + G1.2; spec 2026-11-03 §9; index decision 14).
 *
 * Each section answers one §9 check and runs on its own: a section that fails reports
 * `{ ok: false, error, message }` and the others still run.
 *   G-1c  journald's settings from every file systemd 255's journald opens, in its order (strace of
 *         systemd-journald 255.4-1ubuntu8.18 in a private mount namespace): the main file
 *         /etc/systemd/journald.conf and no other; then the *.conf drop-ins of the
 *         systemd/journald.conf.d/ directories of /etc, /run, /usr/local/lib and /usr/lib, where a
 *         same-named file in an earlier directory masks a later one (a /dev/null link included), a
 *         hidden file is skipped, and the survivors run in filename order whatever their directory,
 *         a later one overriding. Of each file only the retention keys and ForwardToSyslog, read as
 *         systemd reads them (a key counts only under a `[Journal]` header, and a file starts outside
 *         every section), with the file's path under its own root (`etc/…`, `run/…`, `usr/…`): as
 *         `Key=value` when the value is in the grammar of that key's parser (sizes, time spans, counts,
 *         booleans, Storage's four modes; each measured against systemd 255), and otherwise as the key
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
 *         One logrotate refuses (a value it cannot read, as in `rotate 4 # …`, or a keyword run into
 *         other text, as in `daily-x`) is `{ directive, valueUnparsed: true }`, with none of its text:
 *         logrotate then does not apply that stanza. A script (postrotate … endscript) holds no
 *         directive. It decides what the consent text says about the request log (§6 item 14) and
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
 *     the defaults are listed in file order, not placed against the include lines. Only a line's
 *     first directive is read, where logrotate also reads one after a keyword without a value
 *     (`daily rotate 2`). A count past logrotate's int is flagged, where logrotate wraps it.
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
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const USAGE = 'usage: read-research-preconditions.js <book>';
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
// _uint64, _sec, _bool), measured through systemd-analyze verify on unit settings that share the
// parser: a value is printed only when it is in its key's grammar, so no free text leaves the probe
// (systemd keeps a `#` after a value as part of the value, and then refuses the setting). Each grammar
// is narrower than systemd's or equal to it: a value outside it is flagged, never guessed.
const SIZE_PART = String.raw`\d+(?:\.\d*)?`; // parse_size: "5.G" is a size, ".5G" is not
const SIZE = new RegExp(
  String.raw`^(?:${SIZE_PART}\s*[KMGTPEB]\s*)*${SIZE_PART}(?:\s*[KMGTPEB])?$`
);
const TIME_UNIT =
  'usec|us|μs|µs|msec|ms|seconds|second|sec|s|minutes|minute|min|m|hours|hour|hr|h|days|day|d|weeks|week|w|months|month|M|years|year|y';
const TIMESPAN = new RegExp(
  String.raw`^(?:infinity|(?:(?:\d+(?:\.\d+)?|\.\d+)\s*(?:${TIME_UNIT})?\s*)+)$`
);
const JOURNALD_GRAMMAR = new Map([
  ['Storage', /^(?:volatile|persistent|auto|none)$/],
  ...[
    'SystemMaxUse',
    'SystemKeepFree',
    'SystemMaxFileSize',
    'RuntimeMaxUse',
    'RuntimeKeepFree',
    'RuntimeMaxFileSize',
  ].map((k) => [k, SIZE]),
  ['SystemMaxFiles', /^\d+$/],
  ['RuntimeMaxFiles', /^\d+$/],
  ['MaxRetentionSec', TIMESPAN],
  ['MaxFileSec', TIMESPAN],
  ['ForwardToSyslog', /^(?:1|yes|y|true|t|on|0|no|n|false|f|off)$/i],
]);
// logrotate's rotation and retention directives, read as logrotate 3.21.0 (Ubuntu 24.04's package,
// run with -d on each form) reads them. A keyword is the run of letters at a line's start: more
// letters make another word (an unknown option, its line ignored), and a digit or a punctuation mark
// right after it is "not properly separated" (logrotate refuses the stanza). A keyword without a value
// applies whatever follows a space or `=`. A valued keyword's value is the whole rest of its line, so
// `rotate 4 # …` is a bad count and the stanza is refused too.
const NO_VALUE = new Set(['hourly', 'daily', 'monthly', 'yearly']);
const VALUED = new Set(['weekly', 'rotate', 'maxage', 'size', 'maxsize', 'minsize']);
const SCRIPT_START = /^(?:postrotate|prerotate|firstaction|lastaction|preremove)(?![A-Za-z])/;
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
      grammar.test(m[2])
        ? { file, line: `${m[1]}=${m[2]}` }
        : { file, key: m[1], valueUnparsed: true }
    );
  }
  return out;
}

/**
 * The access_log directives of an nginx file's text, by nginx's tokenizer (ngx_conf_read_token): a
 * directive starts at the file's start or after `;`, `{` or `}`; a `#` at a token's start comments out
 * the rest of the line; inside quotes `;` and `#` are text; a bare token ends at whitespace, `;` or `{`.
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
        while (i < text.length && !/[\s;{]/.test(text[i])) i += text[i] === '\\' ? 2 : 1;
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
 * One trimmed logrotate line's directive: the directive alone (a count as the number logrotate reads,
 * a size as written); `{ directive, valueUnparsed: true }`, with none of its text, where logrotate
 * refuses it; null where the line is no rotation directive.
 */
function rotationDirective(line) {
  const word = /^[A-Za-z]+/.exec(line)?.[0];
  if (!word || !(NO_VALUE.has(word) || VALUED.has(word))) return null;
  const rest = line.slice(word.length);
  const refused = { directive: word, valueUnparsed: true };
  if (NO_VALUE.has(word)) return rest === '' || /^[\s=]/.test(rest) ? word : refused;
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
 * defaults logrotate.conf sets); null when absent, `{ readable: false }` when unreadable. A script
 * (postrotate … endscript) holds no directive, and a stanza's file names are never read.
 */
function rotationDirectives(file, { topLevel = false } = {}) {
  const text = readText(file);
  if (text === UNREADABLE) return { readable: false };
  if (text === null) return null;
  const out = [];
  let depth = 0;
  let inScript = false;
  for (const raw of text.split('\n')) {
    let l = raw.trim();
    if (inScript) {
      if (/^endscript(?![A-Za-z])/.test(l)) inScript = false;
      continue;
    }
    if (l.startsWith('#')) continue;
    if (l.startsWith('}')) {
      depth = Math.max(0, depth - 1);
      l = l.slice(1).trim();
    }
    const open = l.indexOf('{');
    if (open >= 0) {
      depth += 1;
      l = l.slice(open + 1).trim(); // logrotate reads a directive after the `{` on its line
    }
    if (!l || l.startsWith('#')) continue;
    if (SCRIPT_START.test(l)) {
      inScript = true;
      continue;
    }
    if (topLevel && depth > 0) continue;
    const d = rotationDirective(l);
    if (d) out.push(d);
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

// PR4 adds G-1a (the crontab) and G-1h.
const SECTIONS = {
  'G-1c': readG1c,
  'G-1d': readG1d,
  'G-1e': readG1e,
  'G-1f': readG1f,
  'G-1g': readG1g,
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
  const ctx = { book, db, serverDir, booksDir, etcRoot, runRoot, usrRoot, varRoot, pathEnv, exec };
  const sections = {};
  try {
    for (const [name, read] of Object.entries(SECTIONS)) {
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
  // A book starts with a letter or a digit, so a lone flag (`--help`, `--write`) is a usage error, not a book.
  if (args.length !== 1 || !/^[a-z0-9][a-z0-9-]*$/.test(args[0])) {
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
  execNeverThrow,
  SECTIONS,
};
