/**
 * ai-review-records.test.js — the per-run record directory (Unit D,
 * docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  RECORD_FILES,
  CUSTOM_ID_RE,
  mintRunId,
  mintCustomId,
  createRunDir,
  openRunDir,
  createRecordWriter,
  harnessCommit,
  harnessDirty,
} from '../ai-review/records.js';

const tmpDirs = [];
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-review-records-'));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

const SECRET = 'sk-ant-records-test-SECRET-0123456789';

describe('ids', () => {
  it('mints a sortable, filesystem-safe run id from the clock', () => {
    const id = mintRunId(new Date('2026-10-26T22:38:53.123Z'));
    expect(id).toMatch(/^20261026T223853Z-[0-9a-f]{8}$/);
  });

  it('mints distinct run ids within one second', () => {
    const now = new Date('2026-10-26T22:38:53Z');
    expect(mintRunId(now)).not.toBe(mintRunId(now));
  });

  it('mints custom_ids that satisfy the Batch API pattern', () => {
    expect(CUSTOM_ID_RE.source).toBe('^[A-Za-z0-9_-]{1,64}$');
    for (const i of [0, 7, 99_999]) expect(mintCustomId(i)).toMatch(CUSTOM_ID_RE);
    expect(mintCustomId(7)).toBe('q000007');
  });

  it('refuses a custom_id index outside the batch limit', () => {
    expect(() => mintCustomId(-1)).toThrow();
    expect(() => mintCustomId(1.5)).toThrow();
    expect(() => mintCustomId(1_000_000)).toThrow();
  });
});

describe('run directories', () => {
  it('creates runs/<runId> under the records dir', () => {
    const dir = tmp();
    const runDir = createRunDir(dir, '20261026T223853Z-abcdef01');
    expect(runDir).toBe(path.join(dir, 'runs', '20261026T223853Z-abcdef01'));
    expect(fs.statSync(runDir).isDirectory()).toBe(true);
  });

  it('refuses to create a run directory that already exists', () => {
    const dir = tmp();
    createRunDir(dir, '20261026T223853Z-abcdef01');
    expect(() => createRunDir(dir, '20261026T223853Z-abcdef01')).toThrow(/exists/);
  });

  it('refuses a run id that is not a plain name', () => {
    const dir = tmp();
    expect(() => createRunDir(dir, '../escape')).toThrow(/run id/);
    expect(() => openRunDir(dir, 'a/b')).toThrow(/run id/);
  });

  it('opens an existing run directory and refuses a missing one', () => {
    const dir = tmp();
    createRunDir(dir, 'r1');
    expect(openRunDir(dir, 'r1')).toBe(path.join(dir, 'runs', 'r1'));
    expect(() => openRunDir(dir, 'r2')).toThrow(/no run directory/);
  });
});

describe('createRecordWriter', () => {
  it('names the record files the spec lists', () => {
    expect(RECORD_FILES).toMatchObject({
      run: 'run.json',
      requests: 'requests.jsonl',
      responses: 'responses.jsonl',
      errors: 'errors.jsonl',
      runEnd: 'run-end.json',
    });
  });

  it('appends JSONL and writes JSON atomically, and reads them back', () => {
    const dir = tmp();
    const w = createRecordWriter({ dir, secrets: [SECRET] });
    w.appendJsonl(RECORD_FILES.requests, { a: 1 });
    w.appendJsonl(RECORD_FILES.requests, { a: 2 });
    w.writeJson(RECORD_FILES.run, { x: 'y' });
    expect(w.readJsonl(RECORD_FILES.requests)).toEqual([{ a: 1 }, { a: 2 }]);
    expect(w.readJson(RECORD_FILES.run)).toEqual({ x: 'y' });
    expect(fs.readdirSync(dir).sort()).toEqual(['requests.jsonl', 'run.json']);
  });

  it('refuses a record that carries a secret, and writes nothing', () => {
    const dir = tmp();
    const w = createRecordWriter({ dir, secrets: [SECRET] });
    expect(() => w.appendJsonl(RECORD_FILES.responses, { echoed: `key ${SECRET}` })).toThrow(
      /secret/
    );
    expect(() => w.writeJson(RECORD_FILES.run, { k: SECRET })).toThrow(/secret/);
    expect(fs.readdirSync(dir)).toEqual([]);
    // control: an innocent record is written
    w.appendJsonl(RECORD_FILES.responses, { ok: true });
    expect(fs.readdirSync(dir)).toEqual(['responses.jsonl']);
  });

  it.each([
    ['a NUL', 'sk-ant-records-\u0000-escaped-0123'],
    ['a double quote', 'sk-ant-records-"-escaped-0123'],
    ['a backslash', 'sk-ant-records-\\-escaped-0123'],
    ['a C0 control', 'sk-ant-records-\u0001-escaped-0123'],
  ])(
    'refuses a secret holding %s, which JSON writes escaped (and writes nothing)',
    (_name, secret) => {
      const dir = tmp();
      const w = createRecordWriter({ dir, secrets: [secret] });
      expect(() => w.appendJsonl(RECORD_FILES.errors, { message: `boom ${secret}` })).toThrow(
        /secret/
      );
      expect(() => w.writeJson(RECORD_FILES.run, { k: secret })).toThrow(/secret/);
      expect(fs.readdirSync(dir)).toEqual([]);
    }
  );

  it('guards secrets supplied by a function, read at each write', () => {
    const dir = tmp();
    const live = [];
    const w = createRecordWriter({ dir, secrets: () => live });
    // control: before the secret is known, a record carrying its text is written
    w.appendJsonl(RECORD_FILES.responses, { echoed: `key ${SECRET}` });
    live.push(SECRET);
    expect(() => w.appendJsonl(RECORD_FILES.responses, { echoed: `key ${SECRET}` })).toThrow(
      /secret/
    );
    expect(w.readJsonl(RECORD_FILES.responses)).toHaveLength(1);
  });

  it('refuses a too-short secret from a function at the write', () => {
    const w = createRecordWriter({ dir: tmp(), secrets: () => ['abc'] });
    expect(() => w.appendJsonl(RECORD_FILES.responses, { ok: true })).toThrow(/secret/);
  });

  it('refuses a secret too short to guard reliably', () => {
    expect(() => createRecordWriter({ dir: tmp(), secrets: ['abc'] })).toThrow(/secret/);
  });

  it('refuses a record file name outside the run directory', () => {
    const w = createRecordWriter({ dir: tmp(), secrets: [] });
    expect(() => w.appendJsonl('../x.jsonl', {})).toThrow(/record file/);
  });

  it('refuses to read a malformed JSONL line', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'responses.jsonl'), '{"a":1}\n{bad\n');
    const w = createRecordWriter({ dir, secrets: [] });
    expect(() => w.readJsonl('responses.jsonl')).toThrow(/malformed/);
  });
});

describe('harnessCommit', () => {
  it('returns HEAD as 40 hex characters in a git checkout', () => {
    expect(harnessCommit()).toMatch(/^[0-9a-f]{40}$/);
  });

  it('returns null when git fails', () => {
    const exec = () => {
      throw new Error('not a git repository');
    };
    expect(harnessCommit({ exec })).toBeNull();
  });
});

describe('harnessDirty', () => {
  it('is true when git reports a change under tools/ai-review', () => {
    const exec = () => ' M tools/ai-review/harness.js\n';
    expect(harnessDirty({ exec })).toBe(true);
  });

  it('is false when git reports nothing (control)', () => {
    expect(harnessDirty({ exec: () => '' })).toBe(false);
  });

  it('asks git about tools/ai-review only', () => {
    let args = null;
    harnessDirty({
      exec: (_cmd, a) => {
        args = a;
        return '';
      },
    });
    expect(args).toEqual(['status', '--porcelain', '--', 'tools/ai-review']);
  });

  it('returns null when git fails', () => {
    const exec = () => {
      throw new Error('not a git repository');
    };
    expect(harnessDirty({ exec })).toBeNull();
  });
});
