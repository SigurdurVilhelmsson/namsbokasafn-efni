// server/__tests__/recoverFromBackup.test.js — G1.20 Task 8. Synthetic databases only.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
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
  cp "$FAKE_STORE/$name" "$dest"
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

  it('segment mode shows each wording once, with the first and last copy it appears in', () => {
    putCopy('2027-01-01-000000', { edits: [{ id: 1, text: 'WORD-A' }] });
    putCopy('2027-01-02-000000', { edits: [{ id: 1, text: 'WORD-B' }] });
    putCopy('2027-01-03-000000', { edits: [{ id: 1, text: 'WORD-B' }] });
    const out = sink();
    const code = main(seg(), { out, err: sink(), env });
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

  it('--file reads a local plain copy and prints the row', () => {
    const f = path.join(tmp, 'plain.db');
    makeCopy(f, { edits: [{ id: 1, text: 'FILE-WORD' }] });
    const out = sink();
    const code = main(
      ['segment', '--book', 'b', '--module', 'm1', '--segment', 's1', '--file', f],
      { out, err: sink(), env }
    );
    expect(code).toBe(0);
    expect(out.text).toContain('FILE-WORD');
  });

  it('a corrupt --file exits 1, leaves no temp dir and its bytes unchanged', () => {
    const f = path.join(tmp, 'corrupt.db');
    fs.writeFileSync(f, 'this is not a database');
    const before = recoverDirs();
    const code = main(
      ['segment', '--book', 'b', '--module', 'm1', '--segment', 's1', '--file', f],
      { out: sink(), err: sink(), env }
    );
    expect(code).toBe(1);
    expect(recoverDirs()).toEqual(before);
    expect(fs.readFileSync(f, 'utf8')).toBe('this is not a database');
  });

  it('--at without a timezone is UTC: it picks the same copy as with Z', () => {
    putCopy('2027-01-02-000000', { versions: [{ seg: 's1', version: 1, text: 'AT-TWO' }] });
    putCopy('2027-01-02-040000', { versions: [{ seg: 's1', version: 1, text: 'AT-FOUR' }] });
    const run = (at) => {
      const out = sink();
      main(['module', '--book', 'b', '--module', 'm1', '--at', at], { out, err: sink(), env });
      return out.text;
    };
    const bare = run('2027-01-02T03:04:05');
    expect(bare).toBe(run('2027-01-02T03:04:05Z'));
    expect(bare).toContain('AT-TWO');
  });

  it('module mode prints every segment of the module from the copy at the time', () => {
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
    const code = main(['module', '--book', 'b', '--module', 'm1', '--at', '2027-01-02T12:00:00Z'], {
      out,
      err: sink(),
      env,
    });
    expect(code).toBe(0);
    expect(out.text).toContain('NEW-S1');
    expect(out.text).toContain('NEW-S2');
    expect(out.text).not.toContain('OLD-S1');
    expect(out.text).not.toContain('LATER');
  });

  it('--as-of is passed to both lsf and copyto', () => {
    putCopy('2027-01-01-000000', { edits: [{ id: 1, text: 'W' }] });
    main(seg(['--as-of', '2027-02-01T00:00:00Z']), { out: sink(), err: sink(), env });
    const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
    const lsf = lines.find((l) => l.startsWith('lsf'));
    const cp = lines.find((l) => l.startsWith('copyto'));
    expect(lsf).toContain('--s3-version-at 2027-02-01T00:00:00Z');
    expect(cp).toContain('--s3-version-at 2027-02-01T00:00:00Z');
  });

  it('refuses a --file that is the live database', () => {
    const liveDb = path.join(tmp, 'live.db');
    makeCopy(liveDb, { edits: [{ id: 1, text: 'W' }] });
    const link = path.join(tmp, 'link.db');
    fs.symlinkSync(liveDb, link);
    const prev = process.env.SESSIONS_DB_PATH;
    process.env.SESSIONS_DB_PATH = liveDb;
    const err = sink();
    try {
      const code = main(
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

  it('leaves no temp copy behind after success, a failed download, and a corrupt gzip', () => {
    const before = recoverDirs();
    putCopy('2027-01-01-000000', { edits: [{ id: 1, text: 'W' }] });
    expect(main(seg(), { out: sink(), err: sink(), env })).toBe(0);
    expect(recoverDirs()).toEqual(before);

    main(seg(), { out: sink(), err: sink(), env: { ...env, FAKE_FAIL: 'copyto' } });
    expect(recoverDirs()).toEqual(before);

    fs.writeFileSync(path.join(store, 'sessions.2027-01-02-000000.db.gz'), 'not gzip');
    main(seg(), { out: sink(), err: sink(), env });
    expect(recoverDirs()).toEqual(before);
  });

  it('exits 1 with "no copies in range" when the range is empty', () => {
    const err = sink();
    const code = main(seg(), { out: sink(), err, env });
    expect(code).toBe(1);
    expect(err.text).toContain('no copies in range');
  });

  it('exits 2 on usage errors', () => {
    expect(main(['segment'], { out: sink(), err: sink(), env })).toBe(2);
  });
});
