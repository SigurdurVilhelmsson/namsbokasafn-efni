// server/__tests__/readResearchPreconditions.test.js
//
// G1.1 + G1.2, PR2 Tasks 5 and 6 (spec §9 G-1c to G-1g; index decision 14): the read-only
// production probe, its database half (G-1d, G-1e) and its system half (G-1c, G-1f, G-1g; the
// last over a books tree of its own). Every case seeds a fresh migrated database by SQL and a temp root
// holding `books/`, `server/`, `etc/`, `run/`, `usr/` and `var/`, so no in-process run reads the host's files
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
/** Writes text at <root>/<rel>, making its directories; returns the path. */
function plant(rel, text) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return p;
}

function ctx(over = {}) {
  return {
    book: BOOK,
    openDb: () => new Database(dbPath, { readonly: true, fileMustExist: true }),
    serverDir: path.join(root, 'server'),
    booksDir: path.join(root, 'books'),
    etcRoot: path.join(root, 'etc'),
    runRoot: path.join(root, 'run'),
    usrRoot: path.join(root, 'usr'),
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
  for (const d of ['books', 'server', 'etc', 'run', 'usr', 'var']) fs.mkdirSync(path.join(root, d));

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
  /** stubExec, and the given answer to exactly `systemctl is-active rsyslog`. */
  const execWithRsyslog = (answer) => (cmd, args) =>
    cmd === 'systemctl' && args.length === 2 && args[0] === 'is-active' && args[1] === 'rsyslog'
      ? { ran: true, ...answer }
      : stubExec()(cmd, args);
  const settings = (over) =>
    readResearchPreconditions(ctx(over)).sections['G-1c'].journald.settings;
  // The shape of /etc/logrotate.d/rsyslog in Ubuntu 24.04's rsyslog package.
  const LOGROTATE_RSYSLOG =
    '/var/log/syslog\n/var/log/mail.log\n/var/log/kern.log\n/var/log/auth.log\n/var/log/user.log\n' +
    '/var/log/cron.log\n{\n\trotate 4\n\tweekly\n\tmissingok\n\tnotifempty\n\tcompress\n' +
    '\tdelaycompress\n\tsharedscripts\n\tpostrotate\n\t\t/usr/lib/rsyslog/rsyslog-rotate\n\tendscript\n}\n';

  it('reports the retention keys, the access_log lines and the rotation, and nothing else', () => {
    plant(
      'etc/systemd/journald.conf',
      '[Journal]\n#SystemMaxUse=\nSystemMaxUse=500M\nStorage=persistent\n'
    );
    plant('etc/systemd/journald.conf.d/10-local.conf', '[Journal]\nMaxRetentionSec=1month\n');
    // Not .conf, so neither journald nor nginx reads them, and neither may the probe: each holds a
    // line its directive pattern matches, absent from the expected output below.
    plant('etc/systemd/journald.conf.d/10-local.conf.bak', '[Journal]\nSystemMaxUse=9G\n');
    plant('etc/nginx/conf.d/default.conf.dpkg-old', 'access_log /var/log/nginx/OLD-BACKUP.log;\n');
    plant(
      'etc/nginx/nginx.conf',
      'http {\n  access_log /var/log/nginx/access.log;\n  # access_log off;\n}\n'
    );
    plant(
      'etc/nginx/sites-enabled/ritstjorn',
      'server {\n  server_name SENTINEL-HOST.example;\n  access_log /var/log/nginx/ritstjorn.access.log combined;\n}\n'
    );
    plant('etc/logrotate.d/nginx', '/var/log/nginx/*.log {\n  daily\n  rotate 14\n  compress\n}\n');
    fs.mkdirSync(path.join(root, 'var', 'log', 'journal'), { recursive: true });

    const g = readResearchPreconditions(ctx({ exec: execWithJournal })).sections['G-1c'];
    expect(g).toEqual({
      ok: true,
      journald: {
        settings: [
          { file: 'etc/systemd/journald.conf', line: 'SystemMaxUse=500M' },
          { file: 'etc/systemd/journald.conf', line: 'Storage=persistent' },
          { file: 'etc/systemd/journald.conf.d/10-local.conf', line: 'MaxRetentionSec=1month' },
        ],
        notReadBySystemd255: [],
        persistentDir: true,
        diskUsage: { ran: true, output: DISK_USAGE },
      },
      rsyslog: { configPresent: false, active: { ran: false, output: null } },
      nginx: {
        accessLog: [
          { file: 'nginx/nginx.conf', line: 'access_log /var/log/nginx/access.log;' },
          {
            file: 'nginx/sites-enabled/ritstjorn',
            line: 'access_log /var/log/nginx/ritstjorn.access.log combined;',
          },
        ],
      },
      logrotate: { defaults: null, nginx: ['daily', 'rotate 14'], rsyslog: null },
    });
    // The server name stays behind; control: the file the probe read holds it.
    expect(
      fs.readFileSync(path.join(root, 'etc', 'nginx', 'sites-enabled', 'ritstjorn'), 'utf8')
    ).toContain('SENTINEL-HOST');
    expect(JSON.stringify(g)).not.toContain('SENTINEL-HOST');
  });

  it('reports ForwardToSyslog and the Runtime* limits beside the System* ones; a longer key is not one of them', () => {
    plant(
      'etc/systemd/journald.conf',
      '[Journal]\nForwardToSyslog=yes\nRuntimeKeepFree=1G\nRuntimeMaxFileSize=8M\nRuntimeMaxFiles=10\n' +
        'ForwardToSyslogExtra=NOT-A-KEY\nForwardToConsole=yes\n'
    );
    expect(settings()).toEqual([
      { file: 'etc/systemd/journald.conf', line: 'ForwardToSyslog=yes' },
      { file: 'etc/systemd/journald.conf', line: 'RuntimeKeepFree=1G' },
      { file: 'etc/systemd/journald.conf', line: 'RuntimeMaxFileSize=8M' },
      { file: 'etc/systemd/journald.conf', line: 'RuntimeMaxFiles=10' },
    ]);
  });

  it('reads the vendor drop-in Ubuntu’s systemd ships under usr/lib, ForwardToSyslog included, by its own path', () => {
    // Ubuntu 24.04's /usr/lib/systemd/journald.conf.d/syslog.conf (package systemd), plus a retention key.
    plant(
      'usr/lib/systemd/journald.conf.d/syslog.conf',
      '# Undo upstream commit 46b131574fdd7d77 for now.\n\n[Journal]\nForwardToSyslog=yes\nSystemMaxUse=300M\n'
    );
    plant('etc/systemd/journald.conf', '[Journal]\n#ForwardToSyslog=yes\n#SystemMaxUse=\n'); // Ubuntu's: all commented
    expect(settings()).toEqual([
      { file: 'usr/lib/systemd/journald.conf.d/syslog.conf', line: 'ForwardToSyslog=yes' },
      { file: 'usr/lib/systemd/journald.conf.d/syslog.conf', line: 'SystemMaxUse=300M' },
    ]);
  });

  it('reads a runtime drop-in under run', () => {
    plant('run/systemd/journald.conf.d/50-runtime.conf', '[Journal]\nRuntimeMaxUse=64M\n');
    expect(settings()).toEqual([
      { file: 'run/systemd/journald.conf.d/50-runtime.conf', line: 'RuntimeMaxUse=64M' },
    ]);
  });

  it('a same-named drop-in in a higher directory masks the lower one, a /dev/null link included', () => {
    // Precedence, highest first: etc, run, usr/local/lib, usr/lib (journald 255 under strace; cat-config agrees).
    plant('etc/systemd/journald.conf.d/20-retention.conf', '[Journal]\nMaxRetentionSec=2week\n');
    plant(
      'usr/lib/systemd/journald.conf.d/20-retention.conf',
      '[Journal]\nMaxRetentionSec=MASKED-BY-ETC\n'
    );
    plant('run/systemd/journald.conf.d/30-size.conf', '[Journal]\nSystemMaxUse=1G\n');
    plant(
      'usr/lib/systemd/journald.conf.d/30-size.conf',
      '[Journal]\nSystemMaxUse=MASKED-BY-RUN\n'
    );
    plant('usr/local/lib/systemd/journald.conf.d/40-files.conf', '[Journal]\nSystemMaxFiles=50\n');
    plant(
      'usr/lib/systemd/journald.conf.d/40-files.conf',
      '[Journal]\nSystemMaxFiles=MASKED-BY-LOCAL\n'
    );
    // How an administrator turns a vendor file off: a link to /dev/null of the same name, read as empty.
    plant(
      'usr/lib/systemd/journald.conf.d/syslog.conf',
      '[Journal]\nForwardToSyslog=MASKED-BY-NULL\n'
    );
    fs.symlinkSync('/dev/null', path.join(root, 'etc/systemd/journald.conf.d/syslog.conf'));
    const s = settings();
    expect(s).toEqual([
      { file: 'etc/systemd/journald.conf.d/20-retention.conf', line: 'MaxRetentionSec=2week' },
      { file: 'run/systemd/journald.conf.d/30-size.conf', line: 'SystemMaxUse=1G' },
      { file: 'usr/local/lib/systemd/journald.conf.d/40-files.conf', line: 'SystemMaxFiles=50' },
    ]);
    expect(JSON.stringify(s)).not.toContain('MASKED');
  });

  it('lists the main file first, then the surviving drop-ins in filename order whatever their directory; a hidden file is skipped', () => {
    plant('etc/systemd/journald.conf', '[Journal]\nStorage=persistent\n');
    plant('usr/lib/systemd/journald.conf.d/10-vendor.conf', '[Journal]\nSystemMaxUse=4G\n');
    plant('etc/systemd/journald.conf.d/20-local.conf', '[Journal]\nSystemMaxUse=500M\n');
    plant('run/systemd/journald.conf.d/30-runtime.conf', '[Journal]\nMaxRetentionSec=1month\n');
    plant('usr/lib/systemd/journald.conf.d/syslog.conf', '[Journal]\nForwardToSyslog=yes\n');
    plant('etc/systemd/journald.conf.d/.hidden.conf', '[Journal]\nMaxRetentionSec=HIDDEN\n');
    // A later entry overrides an earlier one of the same key: 20-local's 500M wins over 10-vendor's 4G.
    expect(settings()).toEqual([
      { file: 'etc/systemd/journald.conf', line: 'Storage=persistent' },
      { file: 'usr/lib/systemd/journald.conf.d/10-vendor.conf', line: 'SystemMaxUse=4G' },
      { file: 'etc/systemd/journald.conf.d/20-local.conf', line: 'SystemMaxUse=500M' },
      { file: 'run/systemd/journald.conf.d/30-runtime.conf', line: 'MaxRetentionSec=1month' },
      { file: 'usr/lib/systemd/journald.conf.d/syslog.conf', line: 'ForwardToSyslog=yes' },
    ]);
  });

  it('reads the main file from etc only, as journald 255 does; the other three are listed by path, never opened', () => {
    // Measured: with run's, usr/local/lib's and usr/lib's planted and no etc file, strace of
    // systemd-journald 255 in a private mount namespace opened only /etc/systemd/journald.conf
    // (ENOENT) as its main file, while `systemd-analyze cat-config` showed run's. The probe follows
    // journald.
    plant('etc/systemd/journald.conf.d/00-first.conf', '[Journal]\nMaxFileSec=1day\n');
    const dropIn = { file: 'etc/systemd/journald.conf.d/00-first.conf', line: 'MaxFileSec=1day' };
    const others = [
      ['run/systemd/journald.conf', 'RUN-MAIN'],
      ['usr/local/lib/systemd/journald.conf', 'LOCAL-MAIN'],
      ['usr/lib/systemd/journald.conf', 'USR-MAIN'],
    ];
    for (const [rel, value] of others) plant(rel, `[Journal]\nForwardToSyslog=${value}\n`);
    const read = vi.spyOn(fs, 'readFileSync');
    const open = vi.spyOn(fs, 'openSync');
    let journald;
    let named;
    try {
      journald = readResearchPreconditions(ctx()).sections['G-1c'].journald;
    } finally {
      named = [...read.mock.calls, ...open.mock.calls].map((c) => String(c[0]));
      read.mockRestore();
      open.mockRestore();
    }
    expect(journald.settings).toEqual([dropIn]);
    expect(journald.notReadBySystemd255).toEqual(others.map(([rel]) => rel));
    for (const [rel, value] of others) {
      expect(named).not.toContain(path.join(root, rel));
      expect(JSON.stringify(journald)).not.toContain(value);
    }
    // Control: the drop-in beside them was opened.
    expect(named).toContain(path.join(root, 'etc/systemd/journald.conf.d/00-first.conf'));

    // A dangling etc link is no main file: journald's open gets ENOENT.
    fs.symlinkSync(path.join(root, 'nowhere.conf'), path.join(root, 'etc/systemd/journald.conf'));
    expect(settings()).toEqual([dropIn]);
    fs.unlinkSync(path.join(root, 'etc/systemd/journald.conf'));
    plant('etc/systemd/journald.conf', '[Journal]\nSystemMaxUse=500M\n');
    expect(settings()).toEqual([
      { file: 'etc/systemd/journald.conf', line: 'SystemMaxUse=500M' },
      dropIn,
    ]);
    // An all-commented etc file (Ubuntu's) sets nothing; the other three still are not read.
    plant('etc/systemd/journald.conf', '[Journal]\n#SystemMaxUse=\n');
    expect(settings()).toEqual([dropIn]);
  });

  it('reports a rotation directive alone: the rest of its line stays behind, and what logrotate refuses is flagged', () => {
    // logrotate 3.21.0 (Ubuntu 24.04's, run with -d): a valued directive's value is the rest of its line, so
    // `rotate 14 TRAILING-TEXT` is a bad rotation count and its stanza is skipped; `monthly-RUN-ON` is a keyword
    // "not properly separated", skipped likewise; `yearlyish` is an unknown word, its line ignored; `daily # …`
    // applies daily and ignores the rest.
    plant(
      'etc/logrotate.d/nginx',
      '/var/log/nginx/*.log {\n  daily # KEPT-BY-COMMENT\n  rotate 14 TRAILING-TEXT\n  weekly 1\n' +
        '  monthly-RUN-ON\n  maxage 30\n  yearlyish\n}\n'
    );
    const g = readResearchPreconditions(ctx()).sections['G-1c'];
    expect(g.logrotate.nginx).toEqual([
      'daily',
      { directive: 'rotate', valueUnparsed: true },
      'weekly 1',
      { directive: 'monthly', valueUnparsed: true },
      'maxage 30',
    ]);
    for (const s of ['KEPT-BY-COMMENT', 'TRAILING-TEXT', 'RUN-ON', 'yearlyish']) {
      expect(JSON.stringify(g)).not.toContain(s);
    }
  });

  it('reports whether rsyslog is configured and running, and only the rotation lines of its logrotate file', () => {
    plant('etc/rsyslog.conf', 'module(load="imuxsock")\n$FileOwner RSYSLOG-CONF-SENTINEL\n');
    plant('etc/logrotate.d/rsyslog', LOGROTATE_RSYSLOG);
    const read = vi.spyOn(fs, 'readFileSync');
    const open = vi.spyOn(fs, 'openSync');
    let g;
    let named;
    try {
      g = readResearchPreconditions(
        ctx({ exec: execWithRsyslog({ code: 0, stdout: 'active\n', stderr: '' }) })
      ).sections['G-1c'];
    } finally {
      named = [...read.mock.calls, ...open.mock.calls].map((c) => String(c[0]));
      read.mockRestore();
      open.mockRestore();
    }
    expect(g.rsyslog).toEqual({ configPresent: true, active: { ran: true, output: 'active' } });
    expect(g.logrotate.rsyslog).toEqual(['rotate 4', 'weekly']);
    // The log list and the other directives stay behind; control: the file holds them.
    for (const s of ['/var/log/syslog', 'missingok', 'rsyslog-rotate']) {
      expect(LOGROTATE_RSYSLOG).toContain(s);
      expect(JSON.stringify(g)).not.toContain(s);
    }
    // Presence only: rsyslog.conf is never opened (control: the logrotate file beside it was).
    expect(named).toContain(path.join(root, 'etc', 'logrotate.d', 'rsyslog'));
    expect(named).not.toContain(path.join(root, 'etc', 'rsyslog.conf'));

    // Stopped: systemctl prints the state and exits 3.
    expect(
      readResearchPreconditions(
        ctx({ exec: execWithRsyslog({ code: 3, stdout: 'inactive\n', stderr: '' }) })
      ).sections['G-1c'].rsyslog
    ).toEqual({ configPresent: true, active: { ran: true, output: 'inactive' } });
  });

  it('hourly is a rotation directive, for nginx and rsyslog alike', () => {
    plant(
      'etc/logrotate.d/nginx',
      '/var/log/nginx/*.log {\n  hourly\n  rotate 48\n  compress\n}\n'
    );
    plant('etc/logrotate.d/rsyslog', '/var/log/syslog\n{\n\thourly\n\trotate 24\n\tmissingok\n}\n');
    expect(readResearchPreconditions(ctx()).sections['G-1c'].logrotate).toEqual({
      defaults: null,
      nginx: ['hourly', 'rotate 48'],
      rsyslog: ['hourly', 'rotate 24'],
    });
  });

  // PR2 review U18. Every form below measured with logrotate 3.21.0 -d (Ubuntu 24.04's package).
  it('reports rotate -1, a count in any base logrotate reads (as the number it reads), and the size directives', () => {
    plant(
      'etc/logrotate.d/nginx',
      '/var/log/nginx/*.log {\n  daily\n  rotate -1\n  maxage 0x1e\n  size 100M\n  maxsize=1G\n  minsize +10k\n}\n'
    );
    plant(
      'etc/logrotate.d/rsyslog',
      '/var/log/syslog\n{\n\tweekly 0\n\trotate 0x10\n\trotate 010\n\trotate = 4\n\trotate +5\n\tsize 0x10k\n}\n'
    );
    const { logrotate } = readResearchPreconditions(ctx()).sections['G-1c'];
    // `rotate -1` keeps old logs for ever; strtol base 0 reads 0x10 as 16 and 010 as 8.
    expect(logrotate.nginx).toEqual([
      'daily',
      'rotate -1',
      'maxage 30',
      'size 100M',
      'maxsize 1G',
      'minsize +10k',
    ]);
    expect(logrotate.rsyslog).toEqual([
      'weekly 0',
      'rotate 16',
      'rotate 8',
      'rotate 4',
      'rotate 5',
      'size 0x10k',
    ]);
  });

  it('flags every directive logrotate refuses, with none of its text; an unknown word, a comment or a script is no directive', () => {
    const REFUSED = [
      [
        'rotate',
        ['rotate 4 # SENTINEL', 'rotate 09', 'rotate -2', 'rotate 2147483648', 'rotate', 'rotate4'],
      ],
      ['maxage', ['maxage -1', 'maxage 30 # SENTINEL', 'maxage 09']],
      [
        'size',
        ['size 1g', 'size 100MB', 'size 1.5G', 'size -5', 'size100k', 'size 100M # SENTINEL'],
      ],
      ['weekly', ['weekly 8', 'weekly # SENTINEL', 'weekly=3', 'weekly SENTINEL']],
      ['daily', ['daily-SENTINEL', 'daily1', 'daily;rotate 2']],
    ];
    const IGNORED = [
      'dailyx',
      'rotatepassword SENTINEL',
      'Daily',
      'ROTATE 3',
      '# rotate 9',
      'sizefoo 3',
    ];
    const SCRIPT = ['postrotate', '  rotate 7', '  daily', 'endscript'];
    const ACCEPTED = [
      ['daily # SENTINEL', 'daily'],
      ['hourly SENTINEL', 'hourly'],
      ['daily=SENTINEL', 'daily'],
      ['weekly\t3', 'weekly 3'],
    ];
    const refused = REFUSED.flatMap(([, lines]) => lines);
    plant(
      'etc/logrotate.d/nginx',
      `/var/log/nginx/*.log {\n${[...refused, ...IGNORED, ...SCRIPT, ...ACCEPTED.map(([l]) => l)].join('\n')}\n}\n`
    );
    const g = readResearchPreconditions(ctx()).sections['G-1c'];
    expect(g.logrotate.nginx).toEqual([
      ...REFUSED.flatMap(([directive, lines]) =>
        lines.map(() => ({ directive, valueUnparsed: true }))
      ),
      ...ACCEPTED.map(([, reported]) => reported),
    ]);
    expect(JSON.stringify(g)).not.toContain('SENTINEL');
  });

  it('reports logrotate.conf’s defaults: its rotation directives outside every stanza, in file order', () => {
    // Ubuntu 24.04's /etc/logrotate.conf (package logrotate 3.21.0-2build1), then a stanza of the kind older releases
    // kept there: its directives are the stanza's, not defaults.
    const UBUNTU =
      '# see "man logrotate" for details\n\n# global options do not affect preceding include directives\n\n' +
      '# rotate log files weekly\nweekly\n\n# use the adm group by default, since this is the owning group\n' +
      '# of /var/log/.\nsu root adm\n\n# keep 4 weeks worth of backlogs\nrotate 4\n\n' +
      '# create new (empty) log files after rotating old ones\ncreate\n\n# use date as a suffix of the rotated file\n' +
      '#dateext\n\n# uncomment this if you want your log files compressed\n#compress\n\n' +
      '# packages drop log rotation information into this directory\ninclude /etc/logrotate.d\n\n' +
      '# system-specific logs may also be configured here.\n';
    plant(
      'etc/logrotate.conf',
      `${UBUNTU}/var/log/wtmp {\n    missingok\n    monthly\n    rotate 1\n}\n/var/log/btmp { daily\n  rotate 2\n}\n`
    );
    expect(readResearchPreconditions(ctx()).sections['G-1c'].logrotate.defaults).toEqual([
      'weekly',
      'rotate 4',
    ]);
    // Absent, and unreadable (a directory stands in, as above), are told apart.
    fs.rmSync(path.join(root, 'etc/logrotate.conf'));
    expect(readResearchPreconditions(ctx()).sections['G-1c'].logrotate.defaults).toBe(null);
    fs.mkdirSync(path.join(root, 'etc/logrotate.conf'));
    expect(readResearchPreconditions(ctx()).sections['G-1c'].logrotate.defaults).toEqual({
      readable: false,
    });
  });

  // PR2 review follow-up on U18 (R1–R3). logrotate reads a line as a run of directives: a `#` where a directive
  // would start ends the line, a keyword without a value is followed by the next directive, and a stanza's `{` and
  // `}` count wherever they fall. Both files measured whole with logrotate 3.21.0 -d (Ubuntu 24.04's package).
  it('reads a logrotate line as logrotate does: a comment ends it, every directive on it counts, and so do its braces', () => {
    // logrotate -d: the defaults are daily, rotate 4, maxage 30 and size 1M (a stanza after them rotates "1048576
    // bytes (4 rotations)"); monthly, hourly and rotate 1 are their stanzas' own.
    plant(
      'etc/logrotate.conf',
      'daily # rotate daily {see the SENTINEL-WIKI}\nrotate 4\n/var/log/wtmp { monthly }\nmaxage 30\n' +
        '/var/log/btmp {\n    missingok\n    hourly rotate 1\n    postrotate\n      true\n    endscript }\n' +
        'notifempty size 1M\n'
    );
    // logrotate -d: daily, then rotate -1 (its "(N rotations)" disappears), then size 100M ("104857600 bytes");
    // `foo` is an unknown option, so its line is ignored, rotate 9 included; text after a `}` is ignored.
    plant(
      'etc/logrotate.d/nginx',
      '/var/log/nginx/*.log {\n  daily # see {SENTINEL-WIKI}\n  missingok rotate -1\n  compress size 100M\n' +
        '  foo rotate 9\n} rotate 3\n'
    );
    // logrotate -d: a line starting with `#` among a stanza's file names is a comment, its `{` included (both files
    // rotate); `endscript` ends a script and logrotate reads on along its line, as it does after a script that
    // ends on the line that opens it; after `missingok=` it steps over the `=` and reads rotate 2 ("after 1 days
    // (2 rotations)", 3 without that line).
    plant(
      'etc/logrotate.d/rsyslog',
      '/var/log/syslog\n# rotated {daily} by the SENTINEL rule\n/var/log/mail.log\n{\n\tpostrotate\n\t\ttrue\n' +
        '\tendscript rotate 3\n\tprerotate endscript daily\n\tmissingok=rotate 2\n}\n'
    );
    const g = readResearchPreconditions(ctx()).sections['G-1c'];
    expect(g.logrotate).toEqual({
      defaults: ['daily', 'rotate 4', 'maxage 30', 'size 1M'],
      nginx: ['daily', 'rotate -1', 'size 100M'],
      rsyslog: ['rotate 3', 'daily', 'rotate 2'],
    });
    expect(JSON.stringify(g)).not.toContain('SENTINEL');

    // Controls: without the brace in its comment, and without the stanzas, logrotate.conf has the same defaults;
    // and a stanza whose braces are on their own lines keeps its directives out of them, as before.
    plant('etc/logrotate.conf', 'daily # rotate daily\nrotate 4\nmaxage 30\nnotifempty size 1M\n');
    expect(readResearchPreconditions(ctx()).sections['G-1c'].logrotate.defaults).toEqual([
      'daily',
      'rotate 4',
      'maxage 30',
      'size 1M',
    ]);
    plant('etc/logrotate.conf', 'daily\n/var/log/wtmp\n{\n  monthly\n}\nrotate 4\n');
    expect(readResearchPreconditions(ctx()).sections['G-1c'].logrotate.defaults).toEqual([
      'daily',
      'rotate 4',
    ]);
    // logrotate -d: a file name inside a stanza is "unexpected" and the stanza is skipped to its `}`; rotate 4 after
    // it is still a default (a later stanza rotates with "4 rotations").
    plant('etc/logrotate.conf', '/var/log/wtmp {\n  /var/log/btmp\n  monthly\n}\nrotate 4\n');
    expect(readResearchPreconditions(ctx()).sections['G-1c'].logrotate.defaults).toEqual([
      'rotate 4',
    ]);
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

  // PR2 review U8: the output is pasted into the register, so a line's other directives and comments stay behind.
  it('reports each access_log directive alone, to its own `;`: what else its line holds stays behind', () => {
    const SITE =
      'server {\n  access_log off; server_name SENTINEL-HOST.example;\n' +
      '  access_log /var/log/nginx/r.log combined; # contact SENTINEL-NAME sentinel@skoli.example\n' +
      // A directive over two lines with a comment between: the comment is not part of it.
      '  access_log /var/log/nginx/two.log # SENTINEL-INSIDE\n      combined;\n' +
      // Inside quotes a `;` ends nothing and a `#` starts nothing (nginx's tokenizer).
      '  access_log "/var/log/nginx/a;b#c.log" combined; listen 80; # SENTINEL-AFTER\n}\n';
    plant('etc/nginx/sites-enabled/ritstjorn', SITE);
    const g = readResearchPreconditions(ctx()).sections['G-1c'];
    const file = 'nginx/sites-enabled/ritstjorn';
    expect(g.nginx.accessLog).toEqual([
      { file, line: 'access_log off;' },
      { file, line: 'access_log /var/log/nginx/r.log combined;' },
      { file, line: 'access_log /var/log/nginx/two.log combined;' },
      { file, line: 'access_log "/var/log/nginx/a;b#c.log" combined;' },
    ]);
    for (const s of [
      'SENTINEL-HOST',
      'SENTINEL-NAME',
      '@skoli',
      'SENTINEL-INSIDE',
      'SENTINEL-AFTER',
      'listen',
    ]) {
      expect(SITE, `control: ${s} is in the file`).toContain(s);
      expect(JSON.stringify(g), s).not.toContain(s);
    }
  });

  // PR2 review U19: a directive starts after `{`, `;` or `}` as well as at a line's start; elsewhere the word is an
  // argument.
  it('finds access_log after `{` or `;` on a line, and only where a directive starts', () => {
    plant(
      'etc/nginx/conf.d/inline.conf',
      'server { listen 80; access_log /var/log/nginx/inline.log; }\n' +
        'server { location / { access_log off; } }\n' +
        "log_format main 'access_log NOT-A-DIRECTIVE';\n" +
        'error_log /var/log/nginx/e.log access_log;\n'
    );
    expect(readResearchPreconditions(ctx()).sections['G-1c'].nginx.accessLog).toEqual([
      { file: 'nginx/conf.d/inline.conf', line: 'access_log /var/log/nginx/inline.log;' },
      { file: 'nginx/conf.d/inline.conf', line: 'access_log off;' },
    ]);
  });

  // PR2 review follow-up on U8 (R5). Measured with nginx 1.24.0 (Ubuntu's package) -t: `${host}` in a path is
  // "syntax is ok", since the tokenizer keeps a `{` that follows `$` in the token, and every `{` after it while its
  // `variable` flag holds (`${{x}` passes the tokenizer and is refused later, by the variable compiler, as any bad
  // argument is, which the probe does not judge); an escaped `\$` sets no flag, so its `{` ends the token and nginx
  // refuses the directive as "not terminated by ;".
  it('keeps a `{` after `$` inside an access_log token, as nginx’s tokenizer does; after an escaped `\\$` it ends the token', () => {
    plant(
      'etc/nginx/conf.d/vars.conf',
      'server {\n  access_log /var/log/nginx/${host}.access.log combined;\n  access_log /var/log/nginx/b.log;\n' +
        '  access_log /var/log/nginx/${{x}.log;\n  access_log /var/log/nginx/\\${SENTINEL}.log;\n}\n'
    );
    const g = readResearchPreconditions(ctx()).sections['G-1c'];
    const file = 'nginx/conf.d/vars.conf';
    expect(g.nginx.accessLog).toEqual([
      { file, line: 'access_log /var/log/nginx/${host}.access.log combined;' },
      { file, line: 'access_log /var/log/nginx/b.log;' },
      { file, line: 'access_log /var/log/nginx/${{x}.log;' },
      { file, unterminated: true },
    ]);
    expect(JSON.stringify(g)).not.toContain('SENTINEL');
  });

  it('an access_log with no `;` before a block’s end or the file’s end is flagged, with none of its text', () => {
    // nginx refuses such a file; with no terminator there is no end to the directive, so nothing of it is printed.
    plant(
      'etc/nginx/sites-enabled/broken',
      'server {\n  access_log /var/log/nginx/SENTINEL-UNTERMINATED.log\n}\naccess_log /var/log/SENTINEL-EOF.log'
    );
    const g = readResearchPreconditions(ctx()).sections['G-1c'];
    expect(g.nginx.accessLog).toEqual([
      { file: 'nginx/sites-enabled/broken', unterminated: true },
      { file: 'nginx/sites-enabled/broken', unterminated: true },
    ]);
    expect(JSON.stringify(g)).not.toContain('SENTINEL');
  });

  // PR2 review U8: systemd keeps a `#` after a value as part of it (and then refuses the setting), so a value is
  // printed only when it is in its key's grammar; otherwise the key alone, flagged.
  it('reports a journald value only when it is in its key’s grammar; otherwise the key alone, flagged', () => {
    const MAIN =
      '[Journal]\nSystemMaxUse=500M # set by SENTINEL-NAME\nMaxRetentionSec=SENTINEL-SECRET\n' +
      'Storage="persistent"\nForwardToSyslog=maybe\nSystemMaxFiles=SENTINEL-COUNT\nSystemMaxFileSize=\n' +
      'SystemKeepFree = 1G 512M\nMaxFileSec=1 month\nForwardToSyslog=No\nStorage=volatile\nRuntimeMaxFiles=100\n';
    plant('etc/systemd/journald.conf', MAIN);
    const g = readResearchPreconditions(ctx()).sections['G-1c'];
    const file = 'etc/systemd/journald.conf';
    expect(g.journald.settings).toEqual([
      { file, key: 'SystemMaxUse', valueUnparsed: true },
      { file, key: 'MaxRetentionSec', valueUnparsed: true },
      { file, key: 'Storage', valueUnparsed: true },
      { file, key: 'ForwardToSyslog', valueUnparsed: true },
      { file, key: 'SystemMaxFiles', valueUnparsed: true },
      { file, key: 'SystemMaxFileSize', valueUnparsed: true }, // empty: not a size
      { file, line: 'SystemKeepFree=1G 512M' },
      { file, line: 'MaxFileSec=1 month' },
      { file, line: 'ForwardToSyslog=No' },
      { file, line: 'Storage=volatile' },
      { file, line: 'RuntimeMaxFiles=100' },
    ]);
    expect(MAIN).toContain('SENTINEL'); // control
    expect(JSON.stringify(g)).not.toContain('SENTINEL');
  });

  it('each journald grammar accepts what systemd 255 parses and refuses what it refuses', () => {
    // Measured 2026-11-05 with systemd 255.4-1ubuntu8.18's own parsers, through `systemd-analyze verify` on a unit
    // whose setting shares journald's parser: MemoryMax= (parse_size, base 1024), RuntimeMaxSec= (parse_sec) and
    // RemainAfterExit= (parse_boolean). Refused means systemd logged "ignoring".
    // PR2 review follow-up on U8 (R4): the size, time-span and count rows, the added ones included, were measured
    // again with systemd-journald 255.4-1ubuntu8.18 itself, run in a private mount namespace on a journald.conf of
    // these lines: refused means journald logged "Failed to parse … value, ignoring". `narrower` is what journald
    // takes and the probe flags all the same, never guessing (`010` is 8 to journald, so printing it would mislead).
    const MEASURED = {
      SystemMaxUse: {
        accepted: [
          '500M',
          '1.5G',
          '1G 512M',
          '1G512M',
          '500 M',
          '500',
          '0',
          '500K',
          '1T',
          '2E',
          '1P',
        ],
        accepted2: ['500B', '5.G', '1B 2', '1K 2'],
        // Units strictly descending, a part without one last; the sum within 64 bits (15E 1023P 1023T is the
        // largest of these, 16E the smallest past it).
        accepted3: [
          '1G 512M 3K 2',
          '1E 1P 1T 1G 1M 1K 1B 1',
          '1G1',
          '15E',
          '15E 1023P',
          '15E 1023P 1023T',
          '14.99E',
          '18446744073709551615',
        ],
        refused: [
          '500m',
          '500MB',
          '"500M"',
          '-1M',
          '1,5G',
          '500Mi',
          '500k',
          '.5G',
          '1 2',
          '1 2K',
          '500M # x',
        ],
        refused2: ['1G 2G', '1M 1G', '512M 1G', '1K 1K', '1T 1E', '1KB', '1.5.5G', '5.5.G'],
        refused3: [
          '16E',
          '15.99E',
          '15E 1024P',
          '15E 1023P 1024T',
          '20000000E',
          '99999999999999999999',
          '1.99999999999999999999G',
          '18446744073709551616',
        ],
        narrower: ['+5G'],
      },
      MaxRetentionSec: {
        accepted: [
          '1month',
          '1 month',
          '2week',
          '5min 20s',
          '5min20s',
          '1.5h',
          'infinity',
          '0',
          '1M',
          '1m',
        ],
        accepted2: [
          '3 days',
          '1y',
          '1 years',
          '10',
          '1d12h',
          '1us',
          '1μs',
          '1µs',
          '2 weeks',
          '1 hr',
          '1msec',
        ],
        accepted3: ['1 2', '.5h', '1.5 .5', '1.5s.5', '5 5', '5s5'],
        // Within 64 bits of microseconds: 584542y and 18446744073709 (seconds) are the first past it.
        accepted4: [
          '18446744073708',
          '584541y',
          '584541y 1y',
          '9223372036854775807us',
          '1.99999999999999999999999s',
          '584541y 1.04y',
        ],
        refused: ['1e3', 'month', '1 fortnight', '-1s', '1.s', 'Infinity', '1 month # x'],
        refused2: ['1.5.5', '1.5.5s', '1.55.5', '1..5', '5.', '.'],
        // The ceiling is 584542.046 years: past it by a whole, by a sum and by a fraction.
        refused3: [
          '18446744073709',
          '584542y',
          '9223372036854775808us',
          '584541y 2y',
          '584541y 1.5y',
          '584541y 1.05y',
        ],
        narrower: ['+5s'],
      },
      SystemMaxFiles: {
        accepted: ['0', '5', '100', '18446744073709551615'],
        refused: ['09', '18446744073709551616', '-1', '1.5', '0x1g', 'five'],
        narrower: ['010', '007', '0x10', '+5'],
      },
      ForwardToSyslog: {
        accepted: ['yes', 'YES', 'y', 'Y', 'true', 'True', 't', 'on', 'On', '1'],
        accepted2: ['no', 'n', 'false', 'f', 'off', '0'],
        refused: ['maybe', 'yes # x', 'enable'],
      },
    };
    for (const [key, lists] of Object.entries(MEASURED)) {
      const of = (prefix) =>
        Object.entries(lists)
          .filter(([name]) => name.startsWith(prefix))
          .flatMap(([, values]) => values);
      const accepted = of('accepted');
      const flagged = [...of('refused'), ...of('narrower')];
      plant(
        'etc/systemd/journald.conf',
        `[Journal]\n${[...accepted, ...flagged].map((v) => `${key}=${v}`).join('\n')}\n`
      );
      expect(settings(), key).toEqual([
        ...accepted.map((v) => ({ file: 'etc/systemd/journald.conf', line: `${key}=${v}` })),
        ...flagged.map(() => ({ file: 'etc/systemd/journald.conf', key, valueUnparsed: true })),
      ]);
    }
  });

  // PR2 review U19: systemd applies a key only under its section, matched exactly on the trimmed line (measured with
  // systemd-analyze: `[ Service ]` and `[service]` are unknown sections), and a file starts outside every section.
  it('counts a journald key only under [Journal], as systemd does', () => {
    plant(
      'etc/systemd/journald.conf',
      'SystemMaxUse=1G\n[Other]\nMaxRetentionSec=1d\n[ Journal ]\nSystemMaxFiles=5\n[journal]\nStorage=none\n' +
        '  [Journal]  \nStorage=auto\n[Other]\nSystemMaxUse=2G\n'
    );
    // The main file ends outside [Journal], and a drop-in starts outside every section whatever came before.
    plant('etc/systemd/journald.conf.d/10-noheader.conf', 'SystemMaxUse=3G\n');
    expect(settings()).toEqual([{ file: 'etc/systemd/journald.conf', line: 'Storage=auto' }]);
  });

  // PR2 review U17: as root a mode-000 file still reads, so a directory stands in for a file the probe's user cannot
  // read (EISDIR), and a regular file for a directory it cannot list (ENOTDIR): any error but ENOENT is unreadable.
  it('a file or directory it cannot read is listed `readable: false`, never read as absent', () => {
    fs.mkdirSync(path.join(root, 'etc/systemd/journald.conf'), { recursive: true });
    fs.mkdirSync(path.join(root, 'etc/systemd/journald.conf.d/50-retention.conf'), {
      recursive: true,
    });
    plant('etc/systemd/journald.conf.d/60-size.conf', '[Journal]\nSystemMaxUse=1G\n');
    plant('run/systemd/journald.conf.d', 'not a directory\n');
    plant('etc/nginx/nginx.conf', 'http { access_log /var/log/nginx/access.log; }\n');
    plant('etc/nginx/conf.d', 'not a directory\n');
    fs.mkdirSync(path.join(root, 'etc/nginx/sites-enabled/ritstjorn'), { recursive: true });
    fs.mkdirSync(path.join(root, 'etc/logrotate.d/nginx'), { recursive: true });
    const g = readResearchPreconditions(ctx()).sections['G-1c'];
    // In journald's order: the main file, a drop-in directory it could not list (its files would sort among the
    // drop-ins), then the drop-ins.
    expect(g.journald.settings).toEqual([
      { file: 'etc/systemd/journald.conf', readable: false },
      { file: 'run/systemd/journald.conf.d', readable: false },
      { file: 'etc/systemd/journald.conf.d/50-retention.conf', readable: false },
      { file: 'etc/systemd/journald.conf.d/60-size.conf', line: 'SystemMaxUse=1G' },
    ]);
    expect(g.nginx.accessLog).toEqual([
      { file: 'nginx/nginx.conf', line: 'access_log /var/log/nginx/access.log;' },
      { file: 'nginx/conf.d', readable: false },
      { file: 'nginx/sites-enabled/ritstjorn', readable: false },
    ]);
    expect(g.logrotate.nginx).toEqual({ readable: false });
    expect(g.logrotate.rsyslog).toBe(null); // control: absent is still null
  });

  it('a box with none of these files reports empty findings, not a failure', () => {
    const noCommands = () => ({ ran: false, code: null, stdout: '', stderr: '' });
    expect(readResearchPreconditions(ctx({ exec: noCommands })).sections['G-1c']).toEqual({
      ok: true,
      journald: {
        settings: [],
        notReadBySystemd255: [],
        persistentDir: false,
        diskUsage: { ran: false, output: null },
      },
      rsyslog: { configPresent: false, active: { ran: false, output: null } },
      nginx: { accessLog: [] },
      logrotate: { defaults: null, nginx: null, rsyslog: null },
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
    // G-1c's newer sources: each holds a reported line beside one that only starts like one.
    const vendor = plant(
      'usr/lib/systemd/journald.conf.d/syslog.conf',
      '[Journal]\nForwardToSyslog=yes\nForwardToSyslogToken=SENTINEL-SECRET-4\n'
    );
    const rotation = plant(
      'etc/logrotate.d/rsyslog',
      '/var/log/syslog\n{\n\trotate 4\n\trotatepassword SENTINEL-SECRET-5\n\thourlyToken SENTINEL-SECRET-5\n' +
        '\tdaily-SENTINEL-SECRET-5\n\tmonthly SENTINEL-SECRET-5\n\tweekly # SENTINEL-SECRET-5\n' +
        '\trotate 4 SENTINEL-SECRET-5\n}\n'
    );
    const rsyslogConf = plant(
      'etc/rsyslog.conf',
      '$DefaultNetstreamDriverKeyFile SENTINEL-SECRET-6\n'
    );
    // Text after a reported directive on its own line (PR2 review U8): a journald value systemd would keep whole,
    // another nginx directive, and an nginx comment naming a person.
    const journald = plant(
      'etc/systemd/journald.conf',
      '[Journal]\nSystemMaxUse=500M # set by Jón Jónsson SENTINEL-SECRET-7\n'
    );
    const site = plant(
      'etc/nginx/sites-enabled/ritstjorn',
      'access_log off; server_name SENTINEL-SECRET-8.example;\n' +
        'access_log /var/log/nginx/r.log combined; # Jón Jónsson jon@skoli.example\n'
    );
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
      'SENTINEL-SECRET-4': fs.readFileSync(vendor, 'utf8'),
      'SENTINEL-SECRET-5': fs.readFileSync(rotation, 'utf8'),
      'SENTINEL-SECRET-6': fs.readFileSync(rsyslogConf, 'utf8'),
      'SENTINEL-SECRET-7': fs.readFileSync(journald, 'utf8'),
      'SENTINEL-SECRET-8': fs.readFileSync(site, 'utf8'),
      'Jón Jónsson': fs.readFileSync(site, 'utf8'),
      'jon@skoli.example': fs.readFileSync(site, 'utf8'),
    };
    for (const [s, source] of Object.entries(sources)) {
      expect(source.includes(s), `control: ${s} is in its source`).toBe(true);
      expect(text.includes(s), `${s} must not reach the output`).toBe(false);
    }
    expect(text.includes('m94103:para:a')).toBe(true); // the output is not empty
    // Controls: the probe read the vendor drop-in and the rsyslog logrotate file the sentinels sit in.
    expect(text.includes('ForwardToSyslog=yes')).toBe(true);
    expect(text.includes('"rotate 4"')).toBe(true);
    // Controls: the journald key and both access_log directives on those lines were read and reported.
    expect(
      text.includes(
        '{"file":"etc/systemd/journald.conf","key":"SystemMaxUse","valueUnparsed":true}'
      )
    ).toBe(true);
    expect(text.includes('"access_log off;"')).toBe(true);
    expect(text.includes('"access_log /var/log/nginx/r.log combined;"')).toBe(true);
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
    // Node's own exit code for the uncaught throw is also 1, so this case alone cannot tell the
    // script's failure default from its absence; the case below, with the throw swallowed, can.
    const r = spawn(['-', BOOK], {
      cwd: path.join(root, 'var'),
      input: fs.readFileSync(SCRIPT, 'utf8'),
    });
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBeNull();
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/Cannot find module '\.\.\/lib\/dbPath'/);
  });

  it('refuses a missing book, an extra argument, a malformed book and a lone flag with exit 2', () => {
    // A lone flag is not a book (PR2 review U23): it would otherwise run every section and print the host's readout.
    for (const args of [
      [],
      [BOOK, '--write'],
      ['Efnafraedi 2e'],
      ['--help'],
      ['--write'],
      ['-x'],
    ]) {
      const r = spawn([SCRIPT, ...args]);
      expect(r.status, JSON.stringify(args)).toBe(2);
      expect(r.stdout).toBe('');
    }
  });

  it('a run that dies before its verdict exits 1 by its own failure default, not by Node’s', () => {
    // PR2 review U22: Node exits 1 on an uncaught throw whatever the script set, so the case above cannot see the
    // default. A preload that swallows the throw (as a future path that catches and returns nothing would) takes
    // Node's 1 away: what is left is the script's own process.exitCode.
    const swallow = path.join(root, 'swallow.cjs');
    fs.writeFileSync(
      swallow,
      "process.on('uncaughtException', (e) => process.stderr.write('SWALLOWED ' + e.message + '\\n'));\n"
    );
    const r = spawn(['--require', swallow, '-', BOOK], {
      cwd: path.join(root, 'var'),
      input: fs.readFileSync(SCRIPT, 'utf8'),
    });
    expect(r.stderr).toMatch(/SWALLOWED Cannot find module '\.\.\/lib\/dbPath'/); // control: the throw happened
    expect(r.stdout).toBe('');
    expect(r.status).toBe(1);
  });

  it('a report larger than a pipe’s buffer arrives whole through a pipe (process.exitCode, never process.exit)', () => {
    // PR2 review U21: process.exit() drops whatever stdout still holds for a pipe (CLAUDE.md § Commands); a `>`
    // redirect would hide it. Enough users to put the report well past the pipe's buffer.
    const user = db.prepare(
      `INSERT INTO users (provider_id, provider_username, display_name, email, role, is_active)
       VALUES (?, ?, 'x', ?, 'editor', 1)`
    );
    db.transaction(() => {
      for (let i = 0; i < 6000; i++)
        user.run(`bulk-${i}`, `bulk-${i}@x.example`, `bulk-${i}@x.example`);
    })();
    const r = spawn([SCRIPT, BOOK], { maxBuffer: 16 * 1024 * 1024 });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(256 * 1024); // control: the report outgrew the buffer
    expect(JSON.parse(r.stdout).sections['G-1d'].users).toHaveLength(6002);
  });

  // PR2 review U20: a read-only open of a WAL database whose -wal and -shm are absent creates both, owned by the
  // probe's user, and leaves them (measured). Production's database is WAL (its services set journal_mode = WAL);
  // the test's is not until it is set here.
  const sideFiles = () => ['-wal', '-shm'].filter((x) => fs.existsSync(dbPath + x));
  it('a WAL database no process holds is not opened: its sections fail with the reason, and no file is created', () => {
    db.pragma('journal_mode = WAL');
    db.close(); // the last connection: SQLite removes -wal and -shm
    expect(fs.readFileSync(dbPath).subarray(18, 20)).toEqual(Buffer.from([2, 2])); // control: the file is WAL
    expect(sideFiles()).toEqual([]);
    const r = spawnSync(process.execPath, [SCRIPT, BOOK], { env: env(), encoding: 'utf8' });
    const created = sideFiles();
    db = new Database(dbPath);
    expect(created).toEqual([]);
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    for (const name of ['G-1d', 'G-1e']) {
      expect(out.sections[name]).toMatchObject({ ok: false, error: 'WAL_FILES_ABSENT' });
    }
    for (const name of ['G-1c', 'G-1f', 'G-1g']) expect(out.sections[name].ok).toBe(true);
  });

  it('a WAL database a process holds (the server, running) is read as before', () => {
    db.pragma('journal_mode = WAL');
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(userB); // a write the reader must see
    expect(sideFiles()).toEqual(['-wal', '-shm']); // the held connection keeps them
    const r = spawnSync(process.execPath, [SCRIPT, BOOK], { env: env(), encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).sections['G-1d'].users).toEqual([
      { id: userA, role: 'editor', active: true },
      { id: userB, role: 'admin', active: false },
    ]);
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
