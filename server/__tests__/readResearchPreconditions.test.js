// server/__tests__/readResearchPreconditions.test.js
//
// G1.1 + G1.2, PR2 Tasks 5 and 6 (spec §9 G-1c to G-1g; index decision 14): the read-only
// production probe, its database half (G-1d, G-1e) and its system half (G-1c, G-1f, G-1g; the
// last over a books tree of its own). Every case seeds a fresh migrated database by SQL and a temp root
// holding `books/`, `server/`, `etc/` and `var/`, so no in-process run reads the host's files
// and no run writes under the repository's books/ or pipeline-output/. The probe opens its own
// read-only handle, as on production; the test's writable `db` stays open for seeding and
// controls, and a spawned run closes it first and reopens it after.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const {
  readResearchPreconditions,
  execNeverThrow,
} = require('../scripts/read-research-preconditions');

const BOOK = 'efnafraedi-2e';
const SCRIPT = path.join(__dirname, '..', 'scripts', 'read-research-preconditions.js');
const SCRIPTS_DIR = path.dirname(SCRIPT);

const ENVIRONMENT_LINE =
  'NODE_ENV=production MS_CLIENT_SECRET=SENTINEL-SECRET-2 AUTO_CREATE_USERS=false\n';
const DOT_ENV = 'JWT_SECRET=SENTINEL-SECRET-1\nAUTO_CREATE_USERS=true\n';
const ENV_FILE = 'AUTO_CREATE_USERS=\nOTHER_SECRET=SENTINEL-SECRET-3\n';

let db;
let dbPath;
let root;
let userA;
let userB;

/** systemctl's two answers; any other command did not run (no journalctl, no nginx here). */
function stubExec({ environmentFiles = '' } = {}) {
  return (cmd, args) => {
    if (cmd === 'systemctl' && args.includes('--property=Environment')) {
      return { ran: true, code: 0, stdout: ENVIRONMENT_LINE, stderr: '' };
    }
    if (cmd === 'systemctl' && args.includes('--property=EnvironmentFiles')) {
      return { ran: true, code: 0, stdout: environmentFiles, stderr: '' };
    }
    return { ran: false, code: null, stdout: '', stderr: '' };
  };
}
/** systemctl names one EnvironmentFile=, in the shape `systemctl show … --value` prints it. */
const stubWithEnvironmentFile = () => {
  fs.writeFileSync(path.join(root, 'envfile'), ENV_FILE);
  return stubExec({ environmentFiles: `${path.join(root, 'envfile')} (ignore_errors=no)\n` });
};
/** systemctl names the given files under <root>, in order; `null` text plants an unreadable one. */
function stubWithEnvironmentFiles(files) {
  const lines = files.map(([name, text]) => {
    const p = path.join(root, name);
    // A directory: readFileSync fails on it even as root, where a chmod 000 file would still read.
    if (text === null) fs.mkdirSync(p);
    else fs.writeFileSync(p, text);
    return `${p} (ignore_errors=no)\n`;
  });
  return stubExec({ environmentFiles: lines.join('') });
}

function ctx(over = {}) {
  return {
    book: BOOK,
    openDb: () => new Database(dbPath, { readonly: true, fileMustExist: true }),
    serverDir: path.join(root, 'server'),
    booksDir: path.join(root, 'books'),
    etcRoot: path.join(root, 'etc'),
    varRoot: path.join(root, 'var'),
    pathEnv: '',
    exec: stubExec(),
    ...over,
  };
}

function edit({ chapter, moduleId, seg, status, appliedAt = null, origin = null }) {
  db.prepare(
    `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content,
       status, editor_id, editor_username, applied_at, origin)
     VALUES (?, ?, ?, ?, 'a', 'b', ?, 'e1', 'ED-USERNAME-SENTINEL', ?, ?)`
  ).run(BOOK, chapter, moduleId, seg, status, appliedAt, origin);
}

beforeEach(() => {
  ({ db, path: dbPath } = freshMigratedDb());
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-preconditions-'));
  for (const d of ['books', 'server', 'etc', 'var']) fs.mkdirSync(path.join(root, d));

  db.exec('DELETE FROM book_settings');
  db.prepare('INSERT INTO book_settings (book, enforce_assignments) VALUES (?, ?)').run(BOOK, 1);
  db.prepare('INSERT INTO book_settings (book, enforce_assignments) VALUES (?, ?)').run(
    'liffraedi-2e',
    0
  );
  const user = db.prepare(
    `INSERT INTO users (provider_id, provider_username, display_name, email, role, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  userA = Number(
    user.run(
      'prov-a',
      'profari1@skoli.example',
      'Prófari Eitt',
      'profari1@skoli.example',
      'editor',
      1
    ).lastInsertRowid
  );
  userB = Number(
    user.run(
      'prov-b',
      'profari2@skoli.example',
      'Prófari Tveir',
      'profari2@skoli.example',
      'head-editor',
      0
    ).lastInsertRowid
  );
  const assign = db.prepare(
    `INSERT INTO user_chapter_assignments (user_id, book_slug, chapter, assigned_by) VALUES (?, ?, ?, ?)`
  );
  assign.run(userA, BOOK, 1, 'ASSIGNED-BY-SENTINEL');
  assign.run(userA, BOOK, 2, null);
  assign.run(userB, BOOK, 5, null);
  assign.run(userA, 'liffraedi-2e', 3, null);

  edit({
    chapter: 3,
    moduleId: 'm94103',
    seg: 'm94103:para:a',
    status: 'pending',
    origin: 're-attach',
  });
  edit({ chapter: 3, moduleId: 'm94103', seg: 'm94103:para:a', status: 'approved' });
  edit({ chapter: 3, moduleId: 'm94103', seg: 'm94103:para:b', status: 'rejected' });
  edit({ chapter: 3, moduleId: 'm94103', seg: 'm94103:para:e', status: 'pending' });
  edit({
    chapter: 4,
    moduleId: 'm94104',
    seg: 'm94104:para:c',
    status: 'approved',
    appliedAt: '2026-10-01 10:00:00',
  });
  edit({
    chapter: 4,
    moduleId: 'm94105',
    seg: 'm94105:para:d',
    status: 'approved',
    appliedAt: '2026-10-01 10:00:00',
  });

  const faithful = path.join(root, 'books', BOOK, '03-faithful-translation', 'ch04');
  fs.mkdirSync(faithful, { recursive: true });
  fs.writeFileSync(path.join(faithful, 'm94104-segments.is.md'), 'x\n'); // m94105's is absent
  // One unit for G-1g, so the spawned runs have a 02-for-mt tree to read and still exit 0.
  const forMt = path.join(root, 'books', BOOK, '02-for-mt', 'ch03');
  fs.mkdirSync(forMt, { recursive: true });
  fs.writeFileSync(path.join(forMt, 'm94103-segments.en.md'), '<!-- SEG:m94103:para:a -->\nA.\n');
  fs.writeFileSync(path.join(root, 'server', '.env'), DOT_ENV);
});

afterEach(() => {
  if (db.open) db.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('G-1d (spec §9): whether units would open the moment the step ships', () => {
  it('reports enforcement per book, chemistry’s rows as (user id, chapter), and the users as ids and roles', () => {
    const g = readResearchPreconditions(ctx()).sections['G-1d'];
    expect(g).toMatchObject({
      ok: true,
      enforcement: [
        { book: 'efnafraedi-2e', enforceAssignments: true },
        { book: 'liffraedi-2e', enforceAssignments: false },
      ],
      studyBookEnforced: true,
      assignments: [
        { userId: userA, chapter: 1 },
        { userId: userA, chapter: 2 },
        { userId: userB, chapter: 5 },
      ],
      assignedChapters: [1, 2, 5],
      users: [
        { id: userA, role: 'editor', active: true },
        { id: userB, role: 'head-editor', active: false },
      ],
    });
    // Exact shapes, so a field such as assigned_by cannot ride along in an entry.
    expect(g.assignments).toEqual([
      { userId: userA, chapter: 1 },
      { userId: userA, chapter: 2 },
      { userId: userB, chapter: 5 },
    ]);
    expect(g.users).toEqual([
      { id: userA, role: 'editor', active: true },
      { id: userB, role: 'head-editor', active: false },
    ]);
    // Control: liffraedi's assignment row is in the table and not in the output.
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM user_chapter_assignments WHERE book_slug = 'liffraedi-2e'"
        )
        .get().n
    ).toBe(1);
  });

  it('a study book with no book_settings row reads as not enforced, not as missing', () => {
    expect(readResearchPreconditions(ctx()).sections['G-1d'].studyBookEnforced).toBe(true); // control
    db.prepare('DELETE FROM book_settings WHERE book = ?').run(BOOK);
    const g = readResearchPreconditions(ctx()).sections['G-1d'];
    expect(g.studyBookEnforced).toBe(false);
    expect(g.enforcement).toEqual([{ book: 'liffraedi-2e', enforceAssignments: false }]);
  });

  it('AUTO_CREATE_USERS as the server reads it: systemd first, .env only where unset', () => {
    expect(readResearchPreconditions(ctx()).sections['G-1d'].autoCreateUsers).toEqual({
      dotEnv: { present: true, value: 'true' },
      service: { ran: true, value: 'false' },
      environmentFiles: [],
      effective: { value: 'false', source: 'Environment' },
    });

    const withFile = readResearchPreconditions(ctx({ exec: stubWithEnvironmentFile() })).sections[
      'G-1d'
    ].autoCreateUsers;
    expect(withFile.effective).toEqual({ value: '', source: 'EnvironmentFile' });
    expect(withFile.environmentFiles).toEqual([{ path: path.join(root, 'envfile'), value: '' }]);

    const noSystemd = () => ({ ran: false, code: null, stdout: '', stderr: '' });
    expect(
      readResearchPreconditions(ctx({ exec: noSystemd })).sections['G-1d'].autoCreateUsers.effective
    ).toEqual({ value: 'true', source: 'server/.env' });

    fs.rmSync(path.join(root, 'server', '.env'));
    expect(
      readResearchPreconditions(ctx({ exec: noSystemd })).sections['G-1d'].autoCreateUsers.effective
    ).toEqual({ value: null, source: 'unset' });
  });

  it('a later EnvironmentFile overrides an earlier one; a file without the key, or unreadable, overrides nothing', () => {
    const read = (files) =>
      readResearchPreconditions(ctx({ exec: stubWithEnvironmentFiles(files) })).sections['G-1d']
        .autoCreateUsers;

    const both = read([
      ['env-first', 'AUTO_CREATE_USERS=first\n'],
      ['env-second', 'AUTO_CREATE_USERS=second\n'],
    ]);
    expect(both.effective).toEqual({ value: 'second', source: 'EnvironmentFile' });
    expect(both.environmentFiles).toEqual([
      { path: path.join(root, 'env-first'), value: 'first' },
      { path: path.join(root, 'env-second'), value: 'second' },
    ]);

    // Environment= says false; neither file below may hide it.
    const keyless = read([['env-keyless', 'OTHER_SECRET=SENTINEL-SECRET-3\n']]);
    expect(keyless.environmentFiles).toEqual([
      { path: path.join(root, 'env-keyless'), value: null },
    ]);
    expect(keyless.effective).toEqual({ value: 'false', source: 'Environment' });

    // Unreadable is reported as such, never as a file without the key, and never as a value.
    const unreadable = read([['env-unreadable', null]]);
    expect(unreadable.environmentFiles).toEqual([
      { path: path.join(root, 'env-unreadable'), readable: false, value: null },
    ]);
    expect(unreadable.effective).toEqual({ value: 'false', source: 'Environment' });
  });

  it('reads enforcement and activity by truthiness, as isAssignmentEnforced and the sign-in gate do', () => {
    // setAssignmentEnforced writes only 1 or 0, but no CHECK holds the columns to them.
    db.prepare('UPDATE book_settings SET enforce_assignments = 2 WHERE book = ?').run(BOOK);
    db.prepare('UPDATE users SET is_active = 2 WHERE id = ?').run(userA);
    const g = readResearchPreconditions(ctx()).sections['G-1d'];
    expect(g.studyBookEnforced).toBe(true);
    expect(g.enforcement).toEqual([
      { book: 'efnafraedi-2e', enforceAssignments: true },
      { book: 'liffraedi-2e', enforceAssignments: false },
    ]);
    expect(g.users).toEqual([
      { id: userA, role: 'editor', active: true },
      { id: userB, role: 'head-editor', active: false },
    ]);
  });
});

describe('G-1e (spec §9): the size of the opening snapshots', () => {
  const INFLIGHT = [
    {
      chapter: 3,
      moduleId: 'm94103',
      segmentId: 'm94103:para:a',
      pending: 1,
      approvedUnapplied: 1,
      reattach: 1,
    },
    {
      chapter: 3,
      moduleId: 'm94103',
      segmentId: 'm94103:para:e',
      pending: 1,
      approvedUnapplied: 0,
      reattach: 0,
    },
  ];

  it('lists chemistry’s in-flight segments with counts by state, and applied rows whose faithful file is gone', () => {
    // b (rejected) and m94104 (its faithful file exists) are the controls; e's reattach is 0,
    // not null, which is the case of every pre-PR1 row on production (SUM over NULLs is NULL).
    expect(readResearchPreconditions(ctx()).sections['G-1e']).toEqual({
      ok: true,
      originColumn: true,
      inflight: INFLIGHT,
      appliedWithoutFaithful: [{ chapter: 4, moduleId: 'm94105', segmentId: 'm94105:para:d' }],
    });
  });

  it('reads a database that does not have PR1’s origin column', () => {
    db.exec('ALTER TABLE segment_edits DROP COLUMN origin');
    const g = readResearchPreconditions(ctx()).sections['G-1e'];
    expect(g.ok).toBe(true);
    expect(g.originColumn).toBe(false);
    expect(g.inflight).toEqual(INFLIGHT.map(({ reattach: _reattach, ...rest }) => rest));
  });
});

describe('G-1c (spec §9): journald retention and nginx’s request log', () => {
  const DISK_USAGE = 'Archived and active journals take up 1.2G in the file system.';
  /** systemctl as stubExec answers it, and journalctl's one line. */
  const execWithJournal = (cmd, args) =>
    cmd === 'journalctl' && args.includes('--disk-usage')
      ? { ran: true, code: 0, stdout: `${DISK_USAGE}\n`, stderr: '' }
      : stubExec()(cmd, args);
  function plant(rel, text) {
    const p = path.join(root, 'etc', rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }

  it('reports the retention keys, the access_log lines and the rotation, and nothing else', () => {
    plant(
      'systemd/journald.conf',
      '[Journal]\n#SystemMaxUse=\nSystemMaxUse=500M\nStorage=persistent\n'
    );
    plant('systemd/journald.conf.d/10-local.conf', '[Journal]\nMaxRetentionSec=1month\n');
    // Not .conf, so neither journald nor nginx reads them, and neither may the probe: each holds a
    // line its directive pattern matches, absent from the expected output below.
    plant('systemd/journald.conf.d/10-local.conf.bak', '[Journal]\nSystemMaxUse=9G\n');
    plant('nginx/conf.d/default.conf.dpkg-old', 'access_log /var/log/nginx/OLD-BACKUP.log;\n');
    plant(
      'nginx/nginx.conf',
      'http {\n  access_log /var/log/nginx/access.log;\n  # access_log off;\n}\n'
    );
    plant(
      'nginx/sites-enabled/ritstjorn',
      'server {\n  server_name SENTINEL-HOST.example;\n  access_log /var/log/nginx/ritstjorn.access.log combined;\n}\n'
    );
    plant('logrotate.d/nginx', '/var/log/nginx/*.log {\n  daily\n  rotate 14\n  compress\n}\n');
    fs.mkdirSync(path.join(root, 'var', 'log', 'journal'), { recursive: true });

    const g = readResearchPreconditions(ctx({ exec: execWithJournal })).sections['G-1c'];
    expect(g).toEqual({
      ok: true,
      journald: {
        settings: [
          { file: 'systemd/journald.conf', line: 'SystemMaxUse=500M' },
          { file: 'systemd/journald.conf', line: 'Storage=persistent' },
          { file: 'systemd/journald.conf.d/10-local.conf', line: 'MaxRetentionSec=1month' },
        ],
        persistentDir: true,
        diskUsage: { ran: true, output: DISK_USAGE },
      },
      nginx: {
        accessLog: [
          { file: 'nginx/nginx.conf', line: 'access_log /var/log/nginx/access.log;' },
          {
            file: 'nginx/sites-enabled/ritstjorn',
            line: 'access_log /var/log/nginx/ritstjorn.access.log combined;',
          },
        ],
      },
      logrotate: { nginx: ['daily', 'rotate 14'] },
    });
    // The server name stays behind; control: the file the probe read holds it.
    expect(
      fs.readFileSync(path.join(root, 'etc', 'nginx', 'sites-enabled', 'ritstjorn'), 'utf8')
    ).toContain('SENTINEL-HOST');
    expect(JSON.stringify(g)).not.toContain('SENTINEL-HOST');
  });

  it('journalctl’s line comes from stderr when its stdout is empty', () => {
    const DENIED = 'No journal files were opened due to insufficient permissions.';
    const execDenied = (cmd, args) =>
      cmd === 'journalctl'
        ? { ran: true, code: 1, stdout: '', stderr: `${DENIED}\n` }
        : stubExec()(cmd, args);
    expect(
      readResearchPreconditions(ctx({ exec: execDenied })).sections['G-1c'].journald.diskUsage
    ).toEqual({ ran: true, output: DENIED });
    // Control: with both streams written, stdout's line is the one reported.
    const execBoth = (cmd, args) =>
      cmd === 'journalctl'
        ? {
            ran: true,
            code: 0,
            stdout: `${DISK_USAGE}\n`,
            stderr: 'No journal files were found.\n',
          }
        : stubExec()(cmd, args);
    expect(
      readResearchPreconditions(ctx({ exec: execBoth })).sections['G-1c'].journald.diskUsage
    ).toEqual({ ran: true, output: DISK_USAGE });
  });

  it('a box with none of these files reports empty findings, not a failure', () => {
    const noCommands = () => ({ ran: false, code: null, stdout: '', stderr: '' });
    expect(readResearchPreconditions(ctx({ exec: noCommands })).sections['G-1c']).toEqual({
      ok: true,
      journald: { settings: [], persistentDir: false, diskUsage: { ran: false, output: null } },
      nginx: { accessLog: [] },
      logrotate: { nginx: null },
    });
  });
});

describe('G-1f (spec §9): is the sqlite3 command on PATH', () => {
  it('finds an executable sqlite3 and skips a non-executable one', () => {
    const [first, second] = ['bin-first', 'bin-second'].map((d) => path.join(root, d));
    for (const [dir, mode] of [
      [first, 0o644],
      [second, 0o755],
    ]) {
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'sqlite3'), '#!/bin/sh\n');
      fs.chmodSync(path.join(dir, 'sqlite3'), mode);
    }
    const g1f = (pathEnv) => readResearchPreconditions(ctx({ pathEnv })).sections['G-1f'];
    expect(g1f([first, second].join(path.delimiter))).toEqual({
      ok: true,
      sqlite3: { onPath: true, path: path.join(second, 'sqlite3') },
    });
    // Controls: the non-executable copy alone, and an empty PATH, find nothing.
    expect(g1f(first)).toEqual({ ok: true, sqlite3: { onPath: false, path: null } });
    expect(g1f('')).toEqual({ ok: true, sqlite3: { onPath: false, path: null } });
  });

  it('a directory named sqlite3 is not the command', () => {
    const shadow = path.join(root, 'bin-shadow');
    const real = path.join(root, 'bin-real');
    fs.mkdirSync(path.join(shadow, 'sqlite3'), { recursive: true, mode: 0o755 });
    fs.mkdirSync(real);
    fs.writeFileSync(path.join(real, 'sqlite3'), '#!/bin/sh\n', { mode: 0o755 });
    // Control: the directory passes the executable check, so only the file check can skip it.
    expect(() => fs.accessSync(path.join(shadow, 'sqlite3'), fs.constants.X_OK)).not.toThrow();
    const g1f = (pathEnv) => readResearchPreconditions(ctx({ pathEnv })).sections['G-1f'];
    expect(g1f([shadow, real].join(path.delimiter))).toEqual({
      ok: true,
      sqlite3: { onPath: true, path: path.join(real, 'sqlite3') },
    });
    expect(g1f(shadow)).toEqual({ ok: true, sqlite3: { onPath: false, path: null } });
  });
});

describe('G-1g (spec §9, §5.19): which study units lack an MT lock marker', () => {
  // A books tree of its own: the shared root holds a ch03/m94103 unit, which would add to the counts.
  let unitsRoot;
  let booksDir;
  let marker;
  const put = (layer, rel) => {
    const p = path.join(booksDir, BOOK, layer, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, '<!-- SEG:x:para:a -->\nx\n');
    return p;
  };
  beforeEach(() => {
    unitsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'research-preconditions-units-'));
    booksDir = path.join(unitsRoot, 'books');
    put('02-for-mt', 'ch01/m94201-segments.en.md');
    put('02-mt-output', 'ch01/m94201-segments.is.md');
    marker = put('02-mt-output', 'ch01/m94201-segments.locked');
    put('02-for-mt', 'ch01/m94202-segments.en.md');
    put('02-mt-output', 'ch01/m94202-segments.is.md');
    put('02-for-mt', 'ch02/chapter-metadata-segments.en.md');
    put('02-mt-output', 'ch02/chapter-metadata-segments.is.md');
    put('02-for-mt', 'appendices/m94203-segments.en.md');
    put('02-for-mt', 'ch01/m94204-segments(b).en.md'); // legacy
    put('02-for-mt', 'ch01/exercises-segments.en.md'); // not an editable module (decision 22)
    put('02-for-mt', 'tmp/m94205-segments.en.md'); // not a chapter directory
  });
  afterEach(() => {
    fs.rmSync(unitsRoot, { recursive: true, force: true });
  });

  const EXPECTED = {
    ok: true,
    unitCount: 4,
    lacking: ['appendices/m94203', 'ch01/m94202', 'ch02/chapter-metadata'],
    lackingMtFile: ['appendices/m94203'],
  };

  it('lists every unit without a marker, and those without an MT file', () => {
    // ch01/m94201 (locked), the legacy file, exercises and the tmp directory are the controls.
    expect(readResearchPreconditions(ctx({ booksDir })).sections['G-1g']).toEqual(EXPECTED);
  });

  it('a locked unit without an MT file is not among those lacking one', () => {
    put('02-for-mt', 'ch02/m94206-segments.en.md');
    put('02-mt-output', 'ch02/m94206-segments.locked'); // a marker, and no MT file beside it
    // Counted (control: the unit was read), and in neither list: lackingMtFile is a subset of lacking.
    expect(readResearchPreconditions(ctx({ booksDir })).sections['G-1g']).toEqual({
      ...EXPECTED,
      unitCount: EXPECTED.unitCount + 1,
    });
  });

  it('a book without a 02-for-mt tree fails the section, never reads as no unit lacking a marker', () => {
    expect(readResearchPreconditions(ctx({ booksDir })).sections['G-1g']).toEqual(EXPECTED); // control
    // A mistyped book passes the command line's check and reaches this branch, as does a wrong books root.
    const mistyped = readResearchPreconditions(ctx({ booksDir, book: 'efnafraedi-2' }));
    expect(mistyped.sections['G-1g']).toMatchObject({ ok: false, error: 'ENOENT' });
    expect(mistyped.ok).toBe(false); // so a run exits 1
    fs.rmSync(path.join(booksDir, BOOK, '02-for-mt'), { recursive: true });
    expect(readResearchPreconditions(ctx({ booksDir })).sections['G-1g']).toMatchObject({
      ok: false,
      error: 'ENOENT',
    });
  });

  it('never reads a marker’s body', () => {
    // The spies sit on the fs object the probe requires, so they see every read it makes.
    const read = vi.spyOn(fs, 'readFileSync');
    const open = vi.spyOn(fs, 'openSync');
    let g;
    let named;
    try {
      g = readResearchPreconditions(ctx({ booksDir })).sections['G-1g'];
    } finally {
      named = [...read.mock.calls, ...open.mock.calls].map((c) => String(c[0]));
      read.mockRestore();
      open.mockRestore();
    }
    expect(g).toEqual(EXPECTED);
    // Control: the spies saw the probe's own read of server/.env (G-1d).
    expect(named).toContain(path.join(root, 'server', '.env'));
    expect(named.filter((p) => p.endsWith('.locked'))).toEqual([]);
    // An unreadable marker changes nothing (as root it still reads, so this half needs a user).
    if (process.getuid?.() !== 0) {
      fs.chmodSync(marker, 0o000);
      expect(readResearchPreconditions(ctx({ booksDir })).sections['G-1g']).toEqual(EXPECTED);
    }
  });
});

describe('the database (decision 15)', () => {
  it('is opened once, lazily, for every section that reads it, and closed after', () => {
    const handles = [];
    const report = readResearchPreconditions(
      ctx({
        openDb: () => {
          const h = new Database(dbPath, { readonly: true, fileMustExist: true });
          handles.push(h);
          return h;
        },
      })
    );
    expect(report.sections['G-1d'].ok).toBe(true);
    expect(report.sections['G-1e'].ok).toBe(true); // both sections read it
    expect(handles).toHaveLength(1);
    expect(handles[0].open).toBe(false);
  });
});

describe('execNeverThrow (decision 19): a command’s answer, never a throw', () => {
  it('a missing command did not run; a failing one ran with its code; a passing one with its output', () => {
    expect(execNeverThrow('no-such-command-research-preconditions', [])).toMatchObject({
      ran: false,
    });
    expect(execNeverThrow(process.execPath, ['-e', 'process.exit(3)'])).toMatchObject({
      ran: true,
      code: 3,
    });
    expect(execNeverThrow(process.execPath, ['-e', "process.stdout.write('ok')"])).toEqual({
      ran: true,
      code: 0,
      stdout: 'ok',
      stderr: '',
    });
  });
});

describe('it names no editor (spec §9, index decision 14)', () => {
  it('no name, email, username, assigned_by or secret reaches the output', () => {
    const exec = stubWithEnvironmentFile();
    const text = JSON.stringify(readResearchPreconditions(ctx({ exec })));

    // Positive control: each sentinel really is in what the probe read.
    const users = JSON.stringify(db.prepare('SELECT * FROM users').all());
    const assignments = JSON.stringify(db.prepare('SELECT * FROM user_chapter_assignments').all());
    const edits = JSON.stringify(db.prepare('SELECT * FROM segment_edits').all());
    const dotEnv = fs.readFileSync(path.join(root, 'server', '.env'), 'utf8');
    const envFile = fs.readFileSync(path.join(root, 'envfile'), 'utf8');
    const environment = exec('systemctl', [
      'show',
      'x',
      '--property=Environment',
      '--value',
    ]).stdout;
    const sources = {
      'Prófari Eitt': users,
      'profari1@skoli.example': users,
      'ED-USERNAME-SENTINEL': edits,
      'ASSIGNED-BY-SENTINEL': assignments,
      'SENTINEL-SECRET-1': dotEnv,
      'SENTINEL-SECRET-2': environment,
      'SENTINEL-SECRET-3': envFile,
    };
    for (const [s, source] of Object.entries(sources)) {
      expect(source.includes(s), `control: ${s} is in its source`).toBe(true);
      expect(text.includes(s), `${s} must not reach the output`).toBe(false);
    }
    expect(text.includes('m94103:para:a')).toBe(true); // the output is not empty
  });
});

describe('the command line', () => {
  const env = (over = {}) => ({
    ...process.env,
    SESSIONS_DB_PATH: dbPath,
    BOOKS_ROOT_OVERRIDE: path.join(root, 'books'),
    ...over,
  });
  const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  /** Close the writable handle for the spawned run and reopen it after, as readApplyExposure does. */
  function spawn(args, opts = {}) {
    db.close();
    try {
      return spawnSync(process.execPath, args, { env: env(), encoding: 'utf8', ...opts });
    } finally {
      db = new Database(dbPath);
    }
  }

  it('a file run opens the database read-only, prints one JSON object and exits 0', () => {
    // The unchanged bytes below cannot tell a read-write open that only reads from a read-only
    // one, so a preload reports the options main() passes to better-sqlite3, once per open.
    const preload = path.join(root, 'open-options.cjs');
    fs.writeFileSync(
      preload,
      `const Module = require('module');
const load = Module._load;
Module._load = function (request, ...rest) {
  const loaded = load.call(this, request, ...rest);
  if (request !== 'better-sqlite3') return loaded;
  return new Proxy(loaded, {
    construct(target, args) {
      process.stderr.write('OPEN-OPTIONS ' + JSON.stringify(args[1]) + '\\n');
      return Reflect.construct(target, args);
    },
  });
};
`
    );
    db.close();
    const before = sha256(dbPath);
    db = new Database(dbPath);
    const r = spawn(['--require', preload, SCRIPT, BOOK]);
    db.close();
    const after = sha256(dbPath);
    db = new Database(dbPath);
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out).toMatchObject({ probe: 'read-research-preconditions', book: BOOK, ok: true });
    expect(out.sections['G-1d'].users).toHaveLength(2); // the run read the database
    // The printed sections, in the order the plan gives them (what is pasted into the register).
    expect(Object.keys(out.sections)).toEqual(['G-1c', 'G-1d', 'G-1e', 'G-1f', 'G-1g']);
    // The temp books root, not the repository's: m94104's faithful file exists only there.
    expect(out.sections['G-1e'].appliedWithoutFaithful).toEqual([
      { chapter: 4, moduleId: 'm94105', segmentId: 'm94105:para:d' },
    ]);
    expect(after).toBe(before);
    const opens = r.stderr.split('\n').filter((l) => l.startsWith('OPEN-OPTIONS '));
    expect(opens.map((l) => JSON.parse(l.slice('OPEN-OPTIONS '.length)))).toEqual([
      { readonly: true, fileMustExist: true },
    ]);
  });

  it('a stdin run from server/scripts (the route used on production) also runs', () => {
    const r = spawn(['-', BOOK], { cwd: SCRIPTS_DIR, input: fs.readFileSync(SCRIPT, 'utf8') });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).sections['G-1d'].users).toHaveLength(2);
  });

  it('control: a stdin run with no book exits 2, so the stdin branch really executes main()', () => {
    const r = spawn(['-'], { cwd: SCRIPTS_DIR, input: fs.readFileSync(SCRIPT, 'utf8') });
    expect(r.status).toBe(2);
  });

  it('a stdin run that dies before its verdict exits non-zero and prints nothing', () => {
    // From a directory where ../lib/dbPath does not resolve, main() throws before any output.
    // Node's own exit code for the uncaught throw is also 1, so this case cannot tell the
    // script's failure default from its absence; it answers that such a run is never 0.
    const r = spawn(['-', BOOK], {
      cwd: path.join(root, 'var'),
      input: fs.readFileSync(SCRIPT, 'utf8'),
    });
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBeNull();
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/Cannot find module '\.\.\/lib\/dbPath'/);
  });

  it('refuses a missing book, an extra argument and a malformed book with exit 2', () => {
    for (const args of [[], [BOOK, '--write'], ['Efnafraedi 2e']]) {
      const r = spawn([SCRIPT, ...args]);
      expect(r.status, JSON.stringify(args)).toBe(2);
      expect(r.stdout).toBe('');
    }
  });

  it('a missing database fails its sections, not the run: exit 1, with the JSON still printed', () => {
    const missing = path.join(root, 'no-such.db');
    const r = spawn([SCRIPT, BOOK], { env: env({ SESSIONS_DB_PATH: missing }) });
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.sections['G-1d']).toMatchObject({ ok: false, error: 'SQLITE_CANTOPEN' });
    expect(out.sections['G-1e']).toMatchObject({ ok: false, error: 'SQLITE_CANTOPEN' });
    // Positive control: only the database sections failed; the system half still read.
    expect(out.sections['G-1c'].ok).toBe(true);
    expect(out.sections['G-1f'].ok).toBe(true);
    expect(out.sections['G-1g'].ok).toBe(true);
    expect(fs.existsSync(missing)).toBe(false); // fileMustExist: the probe created nothing
    // Control: the same run with the database present exits 0.
    expect(spawn([SCRIPT, BOOK]).status).toBe(0);
  });
});

describe('it can run where PR1 and PR2 are not deployed', () => {
  const source = () => fs.readFileSync(SCRIPT, 'utf8');

  it('requires only modules production has at ed10180c', () => {
    const specifiers = [
      ...new Set([...source().matchAll(/require\('([^']+)'\)/g)].map((m) => m[1])),
    ];
    expect(specifiers.sort()).toEqual([
      '../../tools/lib/mt-lock.cjs',
      '../lib/chapterLabel',
      '../lib/dbPath',
      'better-sqlite3',
      'child_process',
      'dotenv',
      'fs',
      'path',
    ]);
  });

  it('the documented command names a study book', () => {
    const m = source().match(/node - ([a-z0-9-]+)/);
    expect(m).not.toBeNull();
    expect(require('../lib/researchScope').STUDY_BOOKS).toContain(m[1]);
  });
});
