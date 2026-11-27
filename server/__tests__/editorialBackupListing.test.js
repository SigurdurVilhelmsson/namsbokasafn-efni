// server/__tests__/editorialBackupListing.test.js — G1.20 Task 3. rclone lsjson listings on stdin.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { main } = require('../scripts/editorial-backup');

const NOW = Date.parse('2027-01-02T03:04:05Z');
const DAY = 86400000;
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edbk-list-'));
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

function item(name, ageDays, size = 100) {
  return {
    Path: name,
    Size: size,
    IsDir: false,
    ModTime: new Date(NOW - ageDays * DAY).toISOString(),
  };
}

async function run(args, stdinText) {
  const out = sink();
  const err = sink();
  const code = await main(['node', 'editorial-backup.js', ...args], {
    stdin: Readable.from([stdinText]),
    out,
    err,
    nowMs: () => NOW,
  });
  return { code, out: out.text, err: err.text };
}

const recent = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => item(`r${i}.gz`, 0.1)));

describe('rate-ok', () => {
  it('passes an empty listing (the first run)', async () => {
    expect((await run(['rate-ok'], '[]')).code).toBe(0);
  });
  it('passes 7 recent copies', async () => {
    expect((await run(['rate-ok'], recent(7))).code).toBe(0);
  });
  it('refuses 8 recent copies and says why', async () => {
    const r = await run(['rate-ok'], recent(8));
    expect(r.code).toBe(1);
    expect(r.err).toContain('editorial-backup: rate guard: 8 copies in 24 h');
  });
  it.each(['', 'garbage'])('refuses an unreadable listing %j', async (text) => {
    const r = await run(['rate-ok'], text);
    expect(r.code).toBe(1);
    expect(r.err).toContain('editorial-backup: listing-invalid');
  });
});

describe('expired', () => {
  const HOUR = 1 / 24; // in days
  it('prints exactly the copy older than 356 days (355.99 days is the control)', async () => {
    const text = JSON.stringify([
      item('old.gz', 356.01),
      item('edge.gz', 355.99),
      item('new.gz', 0.1 * HOUR),
    ]);
    const r = await run(['expired'], text);
    expect(r.code).toBe(0);
    expect(r.out).toBe('old.gz\n');
  });
  it('refuses to delete when the newest copy is 2 hours old (a skewed clock): no paths, exit 1', async () => {
    const r = await run(
      ['expired'],
      JSON.stringify([item('old.gz', 357), item('new.gz', 2 * HOUR)])
    );
    expect(r.code).toBe(1);
    expect(r.out).toBe('');
    expect(r.err).toContain('editorial-backup: no fresh copy in the listing; refusing to delete');
  });
  it('refuses when the only fresh-looking entry is a delete marker', async () => {
    const r = await run(['expired'], JSON.stringify([item('old.gz', 357), item('mk', 0, 0)]));
    expect(r.code).toBe(1);
    expect(r.out).toBe('');
  });
  it('control: a fresh copy beside a 357-day copy prints the old path', async () => {
    const r = await run(
      ['expired'],
      JSON.stringify([item('old.gz', 357), item('new.gz', 0.5 * HOUR)])
    );
    expect(r.code).toBe(0);
    expect(r.out).toBe('old.gz\n');
  });
  it('prints nothing and exits 1 on an unreadable listing', async () => {
    const r = await run(['expired'], 'garbage');
    expect(r.code).toBe(1);
    expect(r.out).toBe('');
  });
});

describe('status', () => {
  const file = () => path.join(tmp, 'status.json');
  const read = () => JSON.parse(fs.readFileSync(file(), 'utf8'));
  const good = JSON.stringify([item('a.gz', 0.01), item('b.gz', 5)]);

  it('writes ok:true for a good listing, stamped with the injected now', async () => {
    const r = await run(['status', '--uploaded-seen', 'yes', '--out', file()], good);
    expect(r.code).toBe(0);
    expect(r.out).toContain('editorial-backup: status ok');
    expect(read()).toMatchObject({ at: new Date(NOW).toISOString(), ok: true });
  });
  it('reports uploaded-not-seen with --uploaded-seen no', async () => {
    const r = await run(['status', '--uploaded-seen', 'no', '--out', file()], good);
    expect(r.code).toBe(1);
    expect(r.out).toContain('status not ok (');
    expect(read().reasons).toContain('uploaded-not-seen');
  });
  it('reports no-fresh-copy when the newest copy is 2 hours old', async () => {
    const stale = JSON.stringify([item('a.gz', 2 / 24), item('b.gz', 5)]);
    const r = await run(['status', '--uploaded-seen', 'yes', '--out', file()], stale);
    expect(r.code).toBe(1);
    expect(read()).toMatchObject({ ok: false, reasons: ['no-fresh-copy'] });
  });
  it('still writes the file for an unreadable listing', async () => {
    const r = await run(['status', '--uploaded-seen', 'yes', '--out', file()], '');
    expect(r.code).toBe(1);
    expect(read()).toEqual({
      at: new Date(NOW).toISOString(),
      ok: false,
      reasons: ['listing-invalid'],
    });
  });
  it('leaves no .tmp behind', async () => {
    await run(['status', '--uploaded-seen', 'yes', '--out', file()], good);
    expect(fs.existsSync(`${file()}.tmp`)).toBe(false);
  });
  it('exits 2 without --out', async () => {
    expect((await run(['status', '--uploaded-seen', 'yes'], good)).code).toBe(2);
  });
  it('exits 2 for an --uploaded-seen value other than yes/no', async () => {
    expect((await run(['status', '--uploaded-seen', 'maybe', '--out', file()], good)).code).toBe(2);
  });
});
