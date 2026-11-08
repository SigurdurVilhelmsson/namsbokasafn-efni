/**
 * §C210: each `.env.example` lists exactly the variables its program reads.
 *
 * Both templates had drifted. `server/.env.example` listed `GITHUB_*` and
 * `MATECAT_*`, which nothing in the server reads, and lacked live ones such as
 * `GREYNIR_URL` and `LOG_LEVEL`. The root `.env.example` listed server variables
 * that the server never reads from there (it runs from `server/` and loads only
 * `server/.env`), plus `OPENSTAX_ARCHIVE_URL`, which nothing reads at all.
 *
 * Server: the set of `process.env.NAME` reads in the running server's code must
 * equal the set of keys the template lists (commented-out `# NAME=` lines count).
 * `server/scripts/` is excluded because the cron scripts do not load `.env`;
 * tests and E2E are excluded because they are not the server.
 *
 * Root: every key the root template lists must be read from the root `.env` by
 * some tool (`loadEnvFile` plus the key, in one file). This direction only: a
 * tool that starts reading a NEW key from `.env` is not detected here, because
 * such reads go through a parsed object and cannot be found by a plain census.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SERVER = join(REPO_ROOT, 'server');

/** Directories under server/ whose code is not the running server. */
const NOT_SERVER = new Set([
  'node_modules',
  '.venv',
  '__tests__',
  'e2e',
  'scripts',
  'greynir-sidecar',
  'test-results',
]);

/** Read by server code only to detect a test run; not configuration. */
const TEST_ONLY = new Set(['VITEST']);

function jsFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!NOT_SERVER.has(e.name)) out.push(...jsFiles(join(dir, e.name)));
    } else if (e.name.endsWith('.js')) {
      out.push(join(dir, e.name));
    }
  }
  return out;
}

function serverReads() {
  const names = new Set();
  for (const f of jsFiles(SERVER)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      if (!TEST_ONLY.has(m[1])) names.add(m[1]);
    }
  }
  return names;
}

/** Keys a template lists, set or commented out (`NAME=` or `# NAME=`). */
function templateKeys(file) {
  const keys = new Set();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

const diff = (a, b) => [...a].filter((x) => !b.has(x)).sort();

describe('§C210: server/.env.example lists exactly what the server reads', () => {
  const reads = serverReads();
  const listed = templateKeys(join(SERVER, '.env.example'));

  it('the census finds the server reads (positive control)', () => {
    expect(reads.has('JWT_SECRET')).toBe(true);
    expect(reads.has('MS_CLIENT_ID')).toBe(true);
    expect(listed.size).toBeGreaterThan(0);
  });

  it('every variable the server reads is listed', () => {
    expect(diff(reads, listed)).toEqual([]);
  });

  it('every listed variable is read by the server', () => {
    expect(diff(listed, reads)).toEqual([]);
  });
});

describe('§C210: the root .env.example lists only keys a tool reads from the root .env', () => {
  const listed = templateKeys(join(REPO_ROOT, '.env.example'));

  function toolFiles(dir) {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!['__tests__', 'archived', 'node_modules'].includes(e.name)) {
          out.push(...toolFiles(join(dir, e.name)));
        }
      } else if (/\.(js|mjs|cjs)$/.test(e.name)) {
        out.push(join(dir, e.name));
      }
    }
    return out;
  }
  const readers = toolFiles(join(REPO_ROOT, 'tools'))
    .map((f) => readFileSync(f, 'utf8'))
    .filter((src) => src.includes('loadEnvFile('));

  it('the template lists keys, and some tool reads the root .env (positive control)', () => {
    expect(listed.size).toBeGreaterThan(0);
    expect(readers.length).toBeGreaterThan(0);
  });

  it('every listed key is read from the root .env by some tool', () => {
    const unread = [...listed].filter((k) => !readers.some((src) => src.includes(k))).sort();
    expect(unread).toEqual([]);
  });

  it('lists none of the server-only variables (the server reads server/.env)', () => {
    const serverOnly = [...listed].filter((k) => serverReads().has(k)).sort();
    expect(serverOnly).toEqual([]);
  });
});
