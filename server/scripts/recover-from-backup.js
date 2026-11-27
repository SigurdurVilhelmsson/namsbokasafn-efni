#!/usr/bin/env node
/**
 * G1.20 — read-only recovery from the locked editorial backups.
 *
 * [USER] RUNS THIS, IN A PLAIN TERMINAL ON THE SERVER, NEVER THROUGH A CLAUDE CODE SESSION'S `!`
 * PREFIX: it prints editors' text and names, and everything a session reads goes to Anthropic
 * (CLAUDE.md § Purpose; design spec §4.4). It never writes to any database: copies are opened
 * readonly, from a private temp directory that is removed afterwards.
 *
 *   segment --book B --module M --segment S (--from YYYY-MM-DD --to YYYY-MM-DD [--every] | --file F)
 *           [--as-of ISO] [--remote R]
 *   module  --book B --module M (--at ISO | --file F) [--as-of ISO] [--remote R]
 *
 * --as-of maps to rclone's --s3-version-at: the bucket is listed and read as it was at that time,
 * so a copy hidden behind a delete marker is still recovered.
 * Exit codes: 0 rows printed; 1 no copies in range or no rows; 2 usage, or --file is the live database.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');
const { DAY_MS } = require('../lib/editorialBackupPolicy');

const COPY_RE = /^sessions\.(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.db(\.gz)?$/;

const USAGE = `usage:
  recover-from-backup segment --book B --module M --segment S (--from YYYY-MM-DD --to YYYY-MM-DD [--every] | --file F) [--as-of ISO] [--remote R]
  recover-from-backup module --book B --module M (--at ISO | --file F) [--as-of ISO] [--remote R]
ISO times (--at, --as-of) without Z or +HH:MM are read as UTC, like the copy names.
`;

/** @param {string} name @returns {number|null} UTC ms of the copy's stamp */
function stampMs(name) {
  const m = COPY_RE.exec(name);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/**
 * Copies with a stamp in [fromMs, toMs + one day), oldest first; without `every`, the newest of each UTC day.
 * @param {string[]} names
 * @param {{fromMs: number, toMs: number, every: boolean}} range
 * @returns {string[]}
 */
function pickCopies(names, { fromMs, toMs, every }) {
  const inRange = names
    .map((n) => ({ n, t: stampMs(n) }))
    .filter((c) => c.t !== null && c.t >= fromMs && c.t < toMs + DAY_MS)
    .sort((a, b) => a.t - b.t);
  if (every) return inRange.map((c) => c.n);
  const newestPerDay = new Map();
  for (const c of inRange) newestPerDay.set(Math.floor(c.t / DAY_MS), c.n); // sorted, so the last wins
  return [...newestPerDay.values()];
}

/** @returns {string|null} the newest copy at or before atMs */
function pickCopyAt(names, atMs) {
  let best = null;
  for (const n of names) {
    const t = stampMs(n);
    if (t !== null && t <= atMs && (best === null || t > best.t)) best = { n, t };
  }
  return best ? best.n : null;
}

function openRo(dbPath) {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

function readSegment(dbPath, { book, module, segment }) {
  const db = openRo(dbPath);
  try {
    return {
      edits: db
        .prepare(
          'SELECT id, status, editor_username, created_at, reviewed_at, edited_content FROM segment_edits WHERE book=? AND module_id=? AND segment_id=? ORDER BY id'
        )
        .all(book, module, segment),
      versions: db
        .prepare(
          'SELECT version, track, applied_by, applied_at, content FROM content_versions WHERE book=? AND module_id=? AND segment_id=? ORDER BY version'
        )
        .all(book, module, segment),
    };
  } finally {
    db.close();
  }
}

function readModule(dbPath, { book, module }) {
  const db = openRo(dbPath);
  try {
    return {
      edits: db
        .prepare(
          'SELECT segment_id, id, status, editor_username, created_at, reviewed_at, edited_content FROM segment_edits WHERE book=? AND module_id=? ORDER BY segment_id, id'
        )
        .all(book, module),
      versions: db
        .prepare(
          'SELECT segment_id, version, track, applied_by, applied_at, content FROM content_versions WHERE book=? AND module_id=? ORDER BY segment_id, version'
        )
        .all(book, module),
    };
  } finally {
    db.close();
  }
}

/**
 * Each distinct wording once, with the first and last copy it appears in.
 * @param {Array<{copy: string, edits: object[], versions: object[]}>} perCopy in copy order
 */
function distinctWordings(perCopy) {
  const seen = new Map();
  const note = (copy, source, row, idOrVersion, status, text) => {
    const key = `${source}|${idOrVersion}|${status}|${text}`;
    const hit = seen.get(key);
    if (hit) {
      hit.last = copy;
      hit.copies += 1;
    } else seen.set(key, { key, source, row, first: copy, last: copy, copies: 1 });
  };
  for (const { copy, edits, versions } of perCopy) {
    for (const r of edits) note(copy, 'edit', r, r.id, r.status, r.edited_content);
    for (const r of versions) note(copy, 'version', r, r.version, r.track, r.content);
  }
  return [...seen.values()].sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0));
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const opts = { mode };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--every') opts.every = true;
    else if (a.startsWith('--')) {
      const v = rest[++i];
      if (v === undefined || v.startsWith('--')) return { error: `${a} needs a value` };
      opts[a.slice(2)] = v;
    } else return { error: `unexpected argument ${a}` };
  }
  return opts;
}

/** An ISO time with no timezone suffix is UTC, like the copy stamps (Date.parse would say local). */
const utcIso = (s) =>
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s || '')
    ? `${s.replace(' ', 'T')}Z`
    : s;

const parseDay = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.parse(`${s}T00:00:00Z`) : NaN);

function realOrResolved(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function printRows(out, label, rows) {
  for (const r of rows) {
    const { segment_id: seg, ...rest } = r;
    out.write(`${label}${seg ? ` ${seg}` : ''} ${JSON.stringify(rest)}\n`);
  }
}

/**
 * @param {string[]} argv arguments after the script name
 * @param {{out: {write: Function}, err: {write: Function}, env: object}} io
 * @returns {number} exit code
 */
function main(argv, { out, err, env }) {
  const o = parseArgs(argv);
  const usage = (msg) => {
    err.write(`${msg ? `${msg}\n` : ''}${USAGE}`);
    return 2;
  };
  if (o.error) return usage(o.error);
  if (o.mode !== 'segment' && o.mode !== 'module') return usage();
  if (!o.book || !o.module || (o.mode === 'segment' && !o.segment))
    return usage('missing --book/--module/--segment');
  let fromMs;
  let toMs;
  let atMs;
  if (o.file) {
    if (realOrResolved(o.file) === realOrResolved(resolveDbPath())) {
      err.write('recover-from-backup: refuses the live database\n');
      return 2;
    }
  } else if (o.mode === 'segment') {
    fromMs = parseDay(o.from);
    toMs = parseDay(o.to);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs))
      return usage('--from and --to must be YYYY-MM-DD');
  } else {
    atMs = Date.parse(utcIso(o.at));
    if (Number.isNaN(atMs)) return usage('--at must be an ISO time');
  }
  const remote = o.remote || env.LOCKED_BACKUP_REMOTE;
  if (!o.file && !remote) return usage('no remote: pass --remote or set LOCKED_BACKUP_REMOTE');
  const asOfIso = o['as-of'] ? utcIso(o['as-of']) : null;
  if (asOfIso && Number.isNaN(Date.parse(asOfIso))) return usage('--as-of must be an ISO time');
  const asOf = asOfIso ? ['--s3-version-at', asOfIso] : [];

  const read = (p) =>
    o.mode === 'segment'
      ? readSegment(p, { book: o.book, module: o.module, segment: o.segment })
      : readModule(p, { book: o.book, module: o.module });

  let tmpDir = null;
  try {
    const perCopy = [];
    if (o.file) {
      perCopy.push({ copy: path.basename(o.file), ...read(o.file) });
    } else {
      const names = execFileSync('rclone', ['lsf', '--files-only', ...asOf, remote], {
        env,
        encoding: 'utf8',
      })
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const chosen =
        o.mode === 'segment'
          ? pickCopies(names, { fromMs, toMs, every: !!o.every })
          : [pickCopyAt(names, atMs)].filter(Boolean);
      if (!chosen.length) {
        err.write('recover-from-backup: no copies in range\n');
        return 1;
      }
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recover-'));
      fs.chmodSync(tmpDir, 0o700);
      for (const name of chosen) {
        const fetched = path.join(tmpDir, name);
        execFileSync('rclone', ['copyto', ...asOf, `${remote}${name}`, fetched], {
          env,
          stdio: 'ignore',
        });
        fs.chmodSync(fetched, 0o600);
        let dbFile = fetched;
        if (name.endsWith('.gz')) {
          dbFile = fetched.slice(0, -3);
          fs.writeFileSync(dbFile, zlib.gunzipSync(fs.readFileSync(fetched)), { mode: 0o600 });
          fs.rmSync(fetched);
        } else fs.chmodSync(dbFile, 0o600);
        try {
          perCopy.push({ copy: name, ...read(dbFile) });
        } finally {
          fs.rmSync(dbFile, { force: true });
        }
      }
    }
    if (o.mode === 'module') {
      const { copy, edits, versions } = perCopy[0];
      if (!edits.length && !versions.length) {
        err.write('recover-from-backup: no rows\n');
        return 1;
      }
      out.write(`copy ${copy}\n`);
      printRows(out, 'version', versions);
      printRows(out, 'edit', edits);
      return 0;
    }
    const words = distinctWordings(perCopy);
    if (!words.length) {
      err.write('recover-from-backup: no rows\n');
      return 1;
    }
    for (const w of words) {
      out.write(
        `${w.source} ${JSON.stringify(w.row)}\n  first ${w.first}  last ${w.last}  in ${w.copies} copies\n`
      );
    }
    return 0;
  } catch (e) {
    err.write(`recover-from-backup: ${e.code || e.name}: ${e.message}\n`);
    return 1;
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  process.exitCode = 1; // only a verdict overwrites this
  process.exitCode = main(process.argv.slice(2), {
    out: process.stdout,
    err: process.stderr,
    env: process.env,
  });
}

module.exports = {
  COPY_RE,
  USAGE,
  pickCopies,
  pickCopyAt,
  readSegment,
  readModule,
  distinctWordings,
  main,
};
