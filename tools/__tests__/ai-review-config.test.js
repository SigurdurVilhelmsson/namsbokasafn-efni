/**
 * ai-review-config.test.js — the cap and the API-key source (Unit D,
 * docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md).
 *
 * The cap is an ENFORCEABLE VALUE ([USER] 2026-10-26, decision record
 * docs/decisions/2026-10-26-pre-s-week-ai-layer-answers.md): this test is its pin.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  CAP_USD,
  REPO_ROOT,
  resolveApiKey,
  resolveWorkspaceId,
  defaultRecordsDir,
  assertBookSlug,
  assertRecordsDir,
  assertLedgerPath,
} from '../ai-review/config.js';

const tmpDirs = [];
function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-review-config-'));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('CAP_USD', () => {
  it('is USD 100, as [USER] ruled on 2026-10-26', () => {
    expect(CAP_USD).toBe(100);
  });
});

describe('REPO_ROOT', () => {
  it('is resolved from the module file, not from process.cwd()', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'tools', 'ai-review', 'config.js'))).toBe(true);
  });
});

describe('defaultRecordsDir', () => {
  it('is books/<slug>/ai-review under the repo root', () => {
    expect(defaultRecordsDir('efnafraedi-2e')).toBe(
      path.join(REPO_ROOT, 'books', 'efnafraedi-2e', 'ai-review')
    );
  });

  it('refuses a slug that is not a plain book slug (control: a real slug passes)', () => {
    expect(() => assertBookSlug('efnafraedi-2e')).not.toThrow();
    expect(() => defaultRecordsDir('../efnafraedi-2e')).toThrow(/slug/);
    expect(() => defaultRecordsDir('')).toThrow(/slug/);
  });

  it('refuses organic chemistry, which OpenStax has not authorised for translation', () => {
    expect(() => defaultRecordsDir('lifraen-efnafraedi')).toThrow(/not translated/);
  });
});

describe('assertRecordsDir — the safe shapes of a records directory', () => {
  const inRepo = (...parts) => path.join(REPO_ROOT, ...parts);

  it('admits books/<slug>/ai-review under the repo root (control)', () => {
    const dir = defaultRecordsDir('efnafraedi-2e');
    expect(assertRecordsDir(dir)).toBe(dir);
  });

  it('admits a directory outside the repository (scratch and test runs)', () => {
    const dir = path.join(os.tmpdir(), 'ai-review-scratch-records');
    expect(assertRecordsDir(dir)).toBe(dir);
  });

  it('refuses a relative path, which would resolve against the working directory', () => {
    expect(() => assertRecordsDir('books/efnafraedi-2e/ai-review')).toThrow(/absolute/);
    expect(() => assertRecordsDir('')).toThrow(/absolute/);
    expect(() => assertRecordsDir(undefined)).toThrow(/absolute/);
  });

  it.each([
    ['a READ-ONLY 02-mt-output chapter', ['books', 'efnafraedi-2e', '02-mt-output', 'ch05']],
    ['the READ-ONLY 01-source', ['books', 'efnafraedi-2e', '01-source']],
    ['a book directory itself', ['books', 'efnafraedi-2e']],
    ['books/', ['books']],
    ['the repository root', []],
    ['tools/', ['tools']],
    ['a directory below ai-review', ['books', 'efnafraedi-2e', 'ai-review', 'runs']],
    [
      'a path that climbs out of ai-review',
      ['books', 'efnafraedi-2e', 'ai-review', '..', '02-mt-output'],
    ],
  ])('refuses %s inside the repository', (_name, parts) => {
    expect(() => assertRecordsDir(inRepo(...parts))).toThrow(/books\/<slug>\/ai-review/);
  });

  it('refuses organic chemistry, which is not translated', () => {
    expect(() => assertRecordsDir(inRepo('books', 'lifraen-efnafraedi', 'ai-review'))).toThrow(
      /not translated/
    );
  });

  // Outside this checkout the repo-root test cannot see a book tree — a sibling worktree,
  // the main checkout, or a copy — so any path through a books/ directory must still end
  // in books/<slug>/ai-review.
  const sibling = (...parts) => path.join(path.dirname(REPO_ROOT), 'other-checkout', ...parts);

  it.each([
    ['another checkout’s 02-mt-output', sibling('books', 'efnafraedi-2e', '02-mt-output')],
    ['another checkout’s 01-source', sibling('books', 'efnafraedi-2e', '01-source')],
    ['another checkout’s book directory', sibling('books', 'efnafraedi-2e')],
    [
      'a copy of a book tree under the temp directory',
      path.join(os.tmpdir(), 'shape', 'books', 'efnafraedi-2e', '02-mt-output', 'ch05'),
    ],
  ])('refuses %s outside the repository', (_name, dir) => {
    expect(() => assertRecordsDir(dir)).toThrow(/books\/<slug>\/ai-review/);
  });

  it('admits another checkout’s books/<slug>/ai-review (control)', () => {
    const dir = sibling('books', 'efnafraedi-2e', 'ai-review');
    expect(assertRecordsDir(dir)).toBe(dir);
  });
});

describe('assertLedgerPath', () => {
  it('admits ledger.jsonl in a safe records directory (control)', () => {
    const p = path.join(defaultRecordsDir('efnafraedi-2e'), 'ledger.jsonl');
    expect(assertLedgerPath(p)).toBe(p);
    const q = path.join(os.tmpdir(), 'x', 'ledger.jsonl');
    expect(assertLedgerPath(q)).toBe(q);
  });

  it('refuses a relative path, another file name, or an unsafe directory', () => {
    expect(() => assertLedgerPath('ledger.jsonl')).toThrow(/absolute/);
    expect(() => assertLedgerPath(path.join(os.tmpdir(), 'x', 'spend.jsonl'))).toThrow(
      /ledger\.jsonl/
    );
    expect(() =>
      assertLedgerPath(
        path.join(REPO_ROOT, 'books', 'efnafraedi-2e', '02-mt-output', 'ledger.jsonl')
      )
    ).toThrow(/books\/<slug>\/ai-review/);
  });
});

describe('resolveApiKey', () => {
  it('prefers ANTHROPIC_API_KEY from the environment', () => {
    const dir = tmp();
    const envFile = path.join(dir, '.env');
    fs.writeFileSync(envFile, 'ANTHROPIC_API_KEY=from-file\n');
    expect(resolveApiKey({ env: { ANTHROPIC_API_KEY: 'from-env' }, envFile })).toBe('from-env');
  });

  it('falls back to the .env file when the environment has no key', () => {
    const dir = tmp();
    const envFile = path.join(dir, '.env');
    fs.writeFileSync(envFile, '# comment\nOTHER=1\nANTHROPIC_API_KEY="from-file"\n');
    expect(resolveApiKey({ env: {}, envFile })).toBe('from-file');
  });

  it('treats an empty environment value as absent', () => {
    const dir = tmp();
    const envFile = path.join(dir, '.env');
    fs.writeFileSync(envFile, 'ANTHROPIC_API_KEY=from-file\n');
    expect(resolveApiKey({ env: { ANTHROPIC_API_KEY: '  ' }, envFile })).toBe('from-file');
  });

  it('refuses loudly with neither, naming both sources and no key', () => {
    const dir = tmp();
    const envFile = path.join(dir, '.env'); // does not exist
    let message = '';
    try {
      resolveApiKey({ env: {}, envFile });
    } catch (e) {
      message = e.message;
    }
    expect(message).toMatch(/ANTHROPIC_API_KEY/);
    expect(message).toMatch(/\.env/);
  });

  it('refuses when the .env exists but carries no Anthropic key', () => {
    const dir = tmp();
    const envFile = path.join(dir, '.env');
    fs.writeFileSync(envFile, 'MALSTADUR_API_KEY=something-else\n');
    expect(() => resolveApiKey({ env: {}, envFile })).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe('resolveWorkspaceId — for a key that is not scoped to a workspace', () => {
  it('prefers ANTHROPIC_WORKSPACE_ID from the environment', () => {
    const envFile = path.join(tmp(), '.env');
    fs.writeFileSync(envFile, 'ANTHROPIC_WORKSPACE_ID=wrkspc_from_file\n');
    expect(
      resolveWorkspaceId({ env: { ANTHROPIC_WORKSPACE_ID: 'wrkspc_from_env' }, envFile })
    ).toBe('wrkspc_from_env');
  });

  it('falls back to the .env file when the environment has none', () => {
    const envFile = path.join(tmp(), '.env');
    fs.writeFileSync(envFile, 'ANTHROPIC_API_KEY=k\nANTHROPIC_WORKSPACE_ID="wrkspc_from_file"\n');
    expect(resolveWorkspaceId({ env: {}, envFile })).toBe('wrkspc_from_file');
  });

  it('treats an empty environment value as absent', () => {
    const envFile = path.join(tmp(), '.env');
    fs.writeFileSync(envFile, 'ANTHROPIC_WORKSPACE_ID=wrkspc_from_file\n');
    expect(resolveWorkspaceId({ env: { ANTHROPIC_WORKSPACE_ID: '  ' }, envFile })).toBe(
      'wrkspc_from_file'
    );
  });

  it('is undefined when neither source has one: a workspace-scoped key needs none', () => {
    const envFile = path.join(tmp(), '.env'); // does not exist
    expect(resolveWorkspaceId({ env: {}, envFile })).toBeUndefined();
  });
});
