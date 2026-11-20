import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'check-held-glossary.sh');
const require = createRequire(import.meta.url);
const { termsSha256 } = require('../../tools/lib/glossary-terms-hash.cjs');

function run(args, env) {
  try {
    const stdout = execFileSync('bash', [SCRIPT, ...args], {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function envWithout(...names) {
  const env = { ...process.env };
  for (const n of names) delete env[n];
  return env;
}

describe('check-held-glossary.sh', () => {
  it('exits 2 and names PROD_SSH when it is unset', () => {
    const r = run(['chemistry'], envWithout('PROD_SSH'));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('PROD_SSH');
  });

  it('exits 2 on a slug that is not [a-z0-9-]+', () => {
    const r = run(['../x'], { ...process.env, PROD_SSH: 'nobody@example.invalid' });
    expect(r.status).toBe(2);
  });

  it("--hash-only prints the exporter's terms hash", () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'chg-'));
    try {
      const payload = { terms: [{ english: 'atom', icelandic: 'frumeind' }], generated: 'x' };
      const file = path.join(dir, 'p.json');
      writeFileSync(file, JSON.stringify(payload));
      const r = run(['--hash-only', file], envWithout('PROD_SSH'));
      expect(r.stdout.trim()).toBe(termsSha256(payload));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 2 with "nothing held" when production\'s status does not hold the book', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'chg-'));
    try {
      const fake = path.join(dir, 'ssh');
      const status = JSON.stringify({ books: { chemistry: { outcome: 'unchanged' } } });
      writeFileSync(fake, `#!/bin/sh\nprintf '%s' '${status}'\n`);
      chmodSync(fake, 0o755);
      const r = run(['chemistry'], {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        PROD_SSH: 'fake-host',
      });
      expect(r.status).toBe(2);
      expect(r.stderr + r.stdout).toContain('nothing held');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * A fake `ssh` on PATH: answers `git … rev-parse` with `head` and anything else (the status
   * read) with `status`, and records every call in `<dir>/ssh-calls`.
   */
  function fakeSsh(dir, { status, head }) {
    const calls = path.join(dir, 'ssh-calls');
    writeFileSync(
      path.join(dir, 'ssh'),
      `#!/bin/sh\necho "$*" >> '${calls}'\ncase "$*" in\n*rev-parse*) echo '${head}' ;;\n*) printf '%s' '${status}' ;;\nesac\n`
    );
    chmodSync(path.join(dir, 'ssh'), 0o755);
    return { ...process.env, PATH: `${dir}:${process.env.PATH}`, PROD_SSH: 'fake-host' };
  }

  it('exits 2 on a token that looks like a flag, without reaching ssh', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'chg-'));
    try {
      const env = fakeSsh(dir, { status: '{}', head: 'x' });
      const r = run(['--held-file-onyl', 'chemistry'], env);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('Usage');
      expect(existsSync(path.join(dir, 'ssh-calls'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('without --held-file-only, a hold the status does not show is "nothing held" and names the flag', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'chg-'));
    try {
      const status = JSON.stringify({
        books: { chemistry: { outcome: 'refused-absent-baseline' } },
      });
      const r = run(['chemistry'], fakeSsh(dir, { status, head: 'not-a-sha' }));
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('nothing held');
      expect(r.stderr).toContain('--held-file-only');
      expect(r.stderr).not.toContain('HEAD');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--held-file-only skips the status check, says so, and goes on to the HEAD check', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'chg-'));
    try {
      const status = JSON.stringify({
        books: { chemistry: { outcome: 'refused-absent-baseline' } },
      });
      const r = run(['--held-file-only', 'chemistry'], fakeSsh(dir, { status, head: 'not-a-sha' }));
      expect(r.status).toBe(2);
      expect(r.stderr).toContain("production's HEAD is not a commit id");
      expect(r.stderr).toMatch(/--held-file-only.*status.*NOT consulted/);
      expect(r.stderr).not.toContain('nothing held');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 2 with "unreadable", not "nothing held", when production\'s status is not JSON', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'chg-'));
    try {
      const r = run(['chemistry'], fakeSsh(dir, { status: 'not json at all', head: 'x' }));
      expect(r.status).toBe(2);
      expect(r.stderr).toContain("production's status file is unreadable");
      expect(r.stderr).not.toContain('nothing held');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--hash-only exits 2, not 1, on a file that is not valid JSON', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'chg-'));
    try {
      const file = path.join(dir, 'p.json');
      writeFileSync(file, '{ not json');
      const r = run(['--hash-only', file], envWithout('PROD_SSH'));
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('could not hash');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 2 when the worktree filesystem has too little space', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'chg-'));
    const work = path.join(dir, 'work');
    try {
      mkdirSync(work);
      const status = JSON.stringify({
        books: { chemistry: { outcome: 'refused-layer-change', termsSha256: 'x' } },
      });
      const head = 'a'.repeat(40);
      writeFileSync(
        path.join(dir, 'ssh'),
        `#!/bin/sh\ncase "$*" in\n*rev-parse*) echo ${head} ;;\n*) printf '%s' '${status}' ;;\nesac\n`
      );
      writeFileSync(
        path.join(dir, 'df'),
        "#!/bin/sh\necho 'Filesystem 1024-blocks Used Available Capacity Mounted on'\necho '/dev/x 100 99 1024 99% /'\n"
      );
      chmodSync(path.join(dir, 'ssh'), 0o755);
      chmodSync(path.join(dir, 'df'), 0o755);
      const r = run(['chemistry'], {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        PROD_SSH: 'fake-host',
        HELD_GLOSSARY_WORKDIR: work,
      });
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('5 GB');
      expect(existsSync(work) && readdirSync(work)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
