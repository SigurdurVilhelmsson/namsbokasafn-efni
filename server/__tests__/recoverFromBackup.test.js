// server/__tests__/recoverFromBackup.test.js — G1.20 Task 8. Synthetic databases only.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { spawn } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const {
  pickCopies,
  pickCopyAt,
  distinctWordings,
  main,
} = require('../scripts/recover-from-backup');

let tmp;
let store;
let log;
let env;

const FAKE_RCLONE = `#!/bin/bash
echo "$@" >> "$FAKE_LOG"
cmd="$1"
if [ "$cmd" = "lsf" ]; then ls -1 "$FAKE_STORE"; exit 0; fi
if [ "$cmd" = "copyto" ]; then
  if [ "$FAKE_FAIL" = "copyto" ]; then exit 1; fi
  args=("$@")
  n=\${#args[@]}
  dest="\${args[$((n-1))]}"
  src="\${args[$((n-2))]}"
  name="\${src##*[:/]}"
  if [ "$FAKE_COPYTO" = "hang" ]; then
    # a download in progress: a partial file in the temp directory, then the pid (the test's cue), then a long wait
    printf partial > "$dest"
    echo $$ > "$FAKE_PIDFILE"
    exec sleep 30
  fi
  cp "$FAKE_STORE/$name" "$dest"
  if [ "$FAKE_COPYTO" = "signal-parent" ]; then
    # The download is done. Signal the tool, wait for its handler's SIGTERM and answer it with SUCCESS: the tool then
    # holds a finished download and a pending signal, so only its checks between copies can stop the next download.
    trap 'kill "$w" 2>/dev/null; exit 0' TERM
    sleep 5 &
    w=$!
    kill -INT "$PPID"
    wait "$w"
  fi
  exit 0
fi
exit 1
`;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rfb-'));
  store = path.join(tmp, 'store');
  fs.mkdirSync(store);
  fs.mkdirSync(path.join(tmp, 'bin'));
  fs.writeFileSync(path.join(tmp, 'bin', 'rclone'), FAKE_RCLONE, { mode: 0o755 });
  fs.writeFileSync(path.join(tmp, 'rclone.conf'), '');
  log = path.join(tmp, 'log');
  fs.writeFileSync(log, '');
  env = {
    ...process.env,
    PATH: `${path.join(tmp, 'bin')}:${process.env.PATH}`,
    FAKE_LOG: log,
    FAKE_STORE: store,
    RCLONE_CONFIG: path.join(tmp, 'rclone.conf'),
    LOCKED_BACKUP_REMOTE: 'locked-fake:',
  };
  delete env.FAKE_FAIL;
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function sink() {
  let s = '';
  return {
    write: (c) => (s += c),
    get text() {
      return s;
    },
  };
}

function makeCopy(file, { edits = [], versions = [] }) {
  const db = new Database(file);
  db.exec(`CREATE TABLE segment_edits(id INTEGER PRIMARY KEY, book TEXT, module_id TEXT, segment_id TEXT,
    status TEXT, editor_username TEXT, created_at TEXT, reviewed_at TEXT, edited_content TEXT);
    CREATE TABLE content_versions(id INTEGER PRIMARY KEY, book TEXT, module_id TEXT, segment_id TEXT,
    version INTEGER, track TEXT, applied_by TEXT, applied_at TEXT, content TEXT);`);
  for (const e of edits)
    db.prepare(
      'INSERT INTO segment_edits(id,book,module_id,segment_id,status,editor_username,created_at,reviewed_at,edited_content) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(e.id, 'b', 'm1', e.seg || 's1', e.status || 'pending', 'ed', 't0', null, e.text);
  for (const v of versions)
    db.prepare(
      'INSERT INTO content_versions(book,module_id,segment_id,version,track,applied_by,applied_at,content) VALUES (?,?,?,?,?,?,?,?)'
    ).run('b', 'm1', v.seg || 's1', v.version, 'faithful', 'ap', 't1', v.text);
  db.close();
}

function putCopy(stamp, rows, gz = true) {
  const f = path.join(tmp, `${stamp}.tmp`);
  makeCopy(f, rows);
  const name = `sessions.${stamp}.db${gz ? '.gz' : ''}`;
  fs.writeFileSync(
    path.join(store, name),
    gz ? zlib.gzipSync(fs.readFileSync(f)) : fs.readFileSync(f)
  );
  fs.rmSync(f);
  return name;
}

const recoverDirs = () =>
  new Set(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('recover-')));

describe('pickCopies / pickCopyAt', () => {
  const names = [
    'sessions.2027-01-01-000000.db.gz',
    'sessions.2027-01-01-120000.db.gz',
    'sessions.2027-01-02-060000.db.gz',
    'sessions.2027-01-03-180000.db.gz',
    'sessions.2027-01-04-000000.db.gz',
    'notes.txt',
    'sessions.bad.db',
  ];
  const fromMs = Date.parse('2027-01-01T00:00:00Z');
  const toMs = Date.parse('2027-01-03T00:00:00Z');
  it('keeps one per day by default, newest of the day', () => {
    expect(pickCopies(names, { fromMs, toMs, every: false })).toEqual([
      'sessions.2027-01-01-120000.db.gz',
      'sessions.2027-01-02-060000.db.gz',
      'sessions.2027-01-03-180000.db.gz',
    ]);
  });
  it('keeps every copy with every, oldest first, end day included, non-matching ignored', () => {
    expect(pickCopies([...names].reverse(), { fromMs, toMs, every: true })).toEqual([
      'sessions.2027-01-01-000000.db.gz',
      'sessions.2027-01-01-120000.db.gz',
      'sessions.2027-01-02-060000.db.gz',
      'sessions.2027-01-03-180000.db.gz',
    ]);
  });
  it('pickCopyAt picks the newest at or before the time', () => {
    expect(pickCopyAt(names, Date.parse('2027-01-02T06:00:00Z'))).toBe(
      'sessions.2027-01-02-060000.db.gz'
    );
  });
  it('pickCopyAt returns null before the first copy', () => {
    expect(pickCopyAt(names, Date.parse('2026-12-31T00:00:00Z'))).toBeNull();
  });
  it('distinctWordings orders by first copy', () => {
    const r = distinctWordings([
      { copy: 'a', edits: [{ id: 1, status: 'p', edited_content: 'x' }], versions: [] },
      { copy: 'b', edits: [{ id: 1, status: 'p', edited_content: 'x' }], versions: [] },
    ]);
    expect(r).toHaveLength(1);
    expect([r[0].first, r[0].last]).toEqual(['a', 'b']);
  });
});

describe('main', () => {
  const seg = (extra = []) => [
    'segment',
    '--book',
    'b',
    '--module',
    'm1',
    '--segment',
    's1',
    '--from',
    '2027-01-01',
    '--to',
    '2027-01-03',
    ...extra,
  ];

  it('segment mode shows each wording once, with the first and last copy it appears in', async () => {
    putCopy('2027-01-01-000000', { edits: [{ id: 1, text: 'WORD-A' }] });
    putCopy('2027-01-02-000000', { edits: [{ id: 1, text: 'WORD-B' }] });
    putCopy('2027-01-03-000000', { edits: [{ id: 1, text: 'WORD-B' }] });
    const out = sink();
    const code = await main(seg(), { out, err: sink(), env });
    expect(code).toBe(0);
    expect(out.text.match(/WORD-A/g)).toHaveLength(1);
    expect(out.text.match(/WORD-B/g)).toHaveLength(1);
    const entries = out.text.split('\n').filter((l) => l.startsWith('  first '));
    expect(entries).toHaveLength(2);
    const c = (d) => `sessions.2027-01-0${d}-000000.db.gz`;
    const [a, b] = out.text.split(/\n(?=edit )/);
    expect(a).toContain('WORD-A');
    expect(a).toContain(`first ${c(1)}  last ${c(1)}`);
    expect(b).toContain('WORD-B');
    expect(b).toContain(`first ${c(2)}  last ${c(3)}`);
  });

  it('--file reads a local plain copy and prints the row', async () => {
    const f = path.join(tmp, 'plain.db');
    makeCopy(f, { edits: [{ id: 1, text: 'FILE-WORD' }] });
    const out = sink();
    const code = await main(
      ['segment', '--book', 'b', '--module', 'm1', '--segment', 's1', '--file', f],
      { out, err: sink(), env }
    );
    expect(code).toBe(0);
    expect(out.text).toContain('FILE-WORD');
  });

  it('a corrupt --file exits 1, leaves no temp dir and its bytes unchanged', async () => {
    const f = path.join(tmp, 'corrupt.db');
    fs.writeFileSync(f, 'this is not a database');
    const before = recoverDirs();
    const code = await main(
      ['segment', '--book', 'b', '--module', 'm1', '--segment', 's1', '--file', f],
      { out: sink(), err: sink(), env }
    );
    expect(code).toBe(1);
    expect(recoverDirs()).toEqual(before);
    expect(fs.readFileSync(f, 'utf8')).toBe('this is not a database');
  });

  it('--at without a timezone, T or space separated, is UTC: the same copy as with Z', async () => {
    putCopy('2027-01-02-000000', { versions: [{ seg: 's1', version: 1, text: 'AT-TWO' }] });
    putCopy('2027-01-02-040000', { versions: [{ seg: 's1', version: 1, text: 'AT-FOUR' }] });
    const prevTz = process.env.TZ;
    process.env.TZ = 'Asia/Tokyo'; // a non-UTC zone, so a local-time reading picks another copy
    try {
      const run = async (at) => {
        const out = sink();
        const code = await main(['module', '--book', 'b', '--module', 'm1', '--at', at], {
          out,
          err: sink(),
          env,
        });
        expect(code).toBe(0);
        return out.text;
      };
      const withZ = await run('2027-01-02T03:04:05Z');
      expect(withZ).toContain('AT-TWO');
      expect(await run('2027-01-02T03:04:05')).toBe(withZ);
      expect(await run('2027-01-02 03:04:05')).toBe(withZ);
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  });

  it('module mode prints every segment of the module from the copy at the time', async () => {
    putCopy('2027-01-01-000000', {
      versions: [{ seg: 's1', version: 1, text: 'OLD-S1' }],
    });
    putCopy('2027-01-02-000000', {
      versions: [
        { seg: 's1', version: 1, text: 'NEW-S1' },
        { seg: 's2', version: 1, text: 'NEW-S2' },
      ],
    });
    putCopy('2027-01-03-000000', { versions: [{ seg: 's1', version: 1, text: 'LATER' }] });
    const out = sink();
    const code = await main(
      ['module', '--book', 'b', '--module', 'm1', '--at', '2027-01-02T12:00:00Z'],
      {
        out,
        err: sink(),
        env,
      }
    );
    expect(code).toBe(0);
    expect(out.text).toContain('NEW-S1');
    expect(out.text).toContain('NEW-S2');
    expect(out.text).not.toContain('OLD-S1');
    expect(out.text).not.toContain('LATER');
  });

  it('--as-of is passed to both lsf and copyto', async () => {
    putCopy('2027-01-01-000000', { edits: [{ id: 1, text: 'W' }] });
    expect(
      await main(seg(['--as-of', '2027-02-01T00:00:00Z']), { out: sink(), err: sink(), env })
    ).toBe(0);
    const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
    const lsf = lines.find((l) => l.startsWith('lsf'));
    const cp = lines.find((l) => l.startsWith('copyto'));
    expect(lsf).toContain('--s3-version-at 2027-02-01T00:00:00Z');
    expect(cp).toContain('--s3-version-at 2027-02-01T00:00:00Z');
  });

  it('refuses a --file that is the live database', async () => {
    const liveDb = path.join(tmp, 'live.db');
    makeCopy(liveDb, { edits: [{ id: 1, text: 'W' }] });
    const link = path.join(tmp, 'link.db');
    fs.symlinkSync(liveDb, link);
    const prev = process.env.SESSIONS_DB_PATH;
    process.env.SESSIONS_DB_PATH = liveDb;
    const err = sink();
    try {
      const code = await main(
        ['segment', '--book', 'b', '--module', 'm1', '--segment', 's1', '--file', link],
        { out: sink(), err, env: { ...env, SESSIONS_DB_PATH: liveDb } }
      );
      expect(code).toBe(2);
      expect(err.text).toContain('refuses the live database');
    } finally {
      if (prev === undefined) delete process.env.SESSIONS_DB_PATH;
      else process.env.SESSIONS_DB_PATH = prev;
    }
  });

  it('leaves no temp copy behind after success, a failed download, and a corrupt gzip', async () => {
    const before = recoverDirs();
    putCopy('2027-01-01-000000', { edits: [{ id: 1, text: 'W' }] });
    expect(await main(seg(), { out: sink(), err: sink(), env })).toBe(0);
    expect(recoverDirs()).toEqual(before);

    expect(
      await main(seg(), { out: sink(), err: sink(), env: { ...env, FAKE_FAIL: 'copyto' } })
    ).toBe(1);
    expect(recoverDirs()).toEqual(before);

    fs.writeFileSync(path.join(store, 'sessions.2027-01-02-000000.db.gz'), 'not gzip');
    expect(await main(seg(), { out: sink(), err: sink(), env })).toBe(1);
    expect(recoverDirs()).toEqual(before);
  });

  it('exits 1 with "no copies in range" when the range is empty', async () => {
    const err = sink();
    const code = await main(seg(), { out: sink(), err, env });
    expect(code).toBe(1);
    expect(err.text).toContain('no copies in range');
  });

  it('exits 2 on usage errors', async () => {
    expect(await main(['segment'], { out: sink(), err: sink(), env })).toBe(2);
  });

  it('--file reads a gzipped copy: unzipped into a private temp directory, removed afterwards', async () => {
    const f = path.join(tmp, 'plain.db');
    makeCopy(f, { edits: [{ id: 1, text: 'GZ-WORD' }] });
    const gz = path.join(tmp, 'sessions.2027-01-01-000000.db.gz');
    fs.writeFileSync(gz, zlib.gzipSync(fs.readFileSync(f)));
    const before = recoverDirs();
    const out = sink();
    const err = sink();
    const code = await main(
      ['segment', '--book', 'b', '--module', 'm1', '--segment', 's1', '--file', gz],
      { out, err, env }
    );
    expect(code).toBe(0);
    expect(out.text).toContain('GZ-WORD');
    expect(out.text).toContain('sessions.2027-01-01-000000.db.gz');
    const named = /temporary directory (\S+)/.exec(err.text);
    expect(named).not.toBeNull(); // the path is printed, so a killed run can be cleaned by hand
    expect(fs.existsSync(named[1])).toBe(false);
    expect(recoverDirs()).toEqual(before);
  });
});

// Ctrl-C must not leave a decrypted copy behind (final review I5). The tool runs as a child process with a private
// TMPDIR, so "no recover-* directory remains" is exact; SIGKILL, which no handler can catch, is the positive control
// that proves the check would see a leaked directory.
describe('interrupted by a signal', () => {
  const SCRIPT = path.join(import.meta.dirname, '..', 'scripts', 'recover-from-backup.js');
  let childTmp;
  let pidFile;
  beforeEach(() => {
    childTmp = path.join(tmp, 'childtmp');
    fs.mkdirSync(childTmp);
    pidFile = path.join(tmp, 'rclone.pid');
  });
  afterEach(() => {
    // the SIGKILL control orphans the fake's sleep: end it
    try {
      process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGKILL');
    } catch {
      // gone already, or never started
    }
  });

  const leftovers = () => fs.readdirSync(childTmp).filter((n) => n.startsWith('recover-'));

  function start(copytoMode) {
    putCopy('2027-01-01-000000', { edits: [{ id: 1, text: 'W1' }] });
    putCopy('2027-01-02-000000', { edits: [{ id: 1, text: 'W2' }] });
    const child = spawn(
      process.execPath,
      [
        SCRIPT,
        'segment',
        '--book',
        'b',
        '--module',
        'm1',
        '--segment',
        's1',
        '--from',
        '2027-01-01',
        '--to',
        '2027-01-03',
      ],
      {
        env: { ...env, TMPDIR: childTmp, FAKE_COPYTO: copytoMode, FAKE_PIDFILE: pidFile },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    const got = { out: '', err: '' };
    child.stdout.on('data', (c) => (got.out += c));
    child.stderr.on('data', (c) => (got.err += c));
    const exited = new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('the tool did not exit within 15 s'));
      }, 15000);
      child.on('exit', (code, signal) => {
        clearTimeout(t);
        resolve({ code, signal });
      });
    });
    return { child, got, exited };
  }

  async function downloadStarted() {
    for (let i = 0; i < 500; i++) {
      if (fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8').trim()) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('the fake download never started');
  }

  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ])(
    '%s during a download: exit %i, temp directory removed, long before the download would end',
    async (sig, want) => {
      const t0 = Date.now();
      const { child, got, exited } = start('hang');
      await downloadStarted();
      expect(leftovers()).toHaveLength(1); // the directory exists while the download runs
      child.kill(sig);
      const { code } = await exited;
      expect(code).toBe(want);
      expect(Date.now() - t0).toBeLessThan(15000); // the fake would sleep 30 s: the tool killed it
      expect(leftovers()).toEqual([]);
      const named = /temporary directory (\S+)/.exec(got.err);
      expect(named).not.toBeNull();
      expect(fs.existsSync(named[1])).toBe(false);
      expect(got.out).toBe('');
    }
  );

  it('a signal between two copies stops before the next download; nothing printed, exit 130', async () => {
    const { got, exited } = start('signal-parent');
    const { code } = await exited;
    expect(code).toBe(130);
    expect(leftovers()).toEqual([]);
    expect(got.out).toBe('');
    const copies = fs
      .readFileSync(log, 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('copyto'));
    expect(copies).toHaveLength(1); // two copies were in range
  });

  it('positive control: SIGKILL cannot be caught, and the check sees the directory it leaves', async () => {
    const { child, exited } = start('hang');
    await downloadStarted();
    child.kill('SIGKILL');
    const { signal } = await exited;
    expect(signal).toBe('SIGKILL');
    expect(leftovers()).toHaveLength(1);
  });
});
