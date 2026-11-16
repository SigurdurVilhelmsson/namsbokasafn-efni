/**
 * Register §C141 ②: `pipelineService` no longer carries `runProtect` and
 * `runUnprotect`.
 *
 * Both spawned a tool from `<root>/tools/` (`protect-segments-for-mt.js`,
 * `unprotect-segments.js`). Those tools belong to the archived protect step and
 * live in `tools/archived/`, so either job could only fail to start. Nothing
 * called them: no route, no service, no script, no test.
 *
 * The first block is red before the removal. The second block is the reason the
 * removal is safe, and holds before and after it: outside the service file, no
 * code line names either function. Its control shows the scan can see a caller,
 * by finding the callers of `runInject`, a job that is in use.
 */
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..', '..');
const servicePath = path.join(__dirname, '..', 'services', 'pipelineService.js');

const pipelineService = require('../services/pipelineService');
const serviceSource = readFileSync(servicePath, 'utf-8');

const SKIP_DIRS = new Set(['node_modules', '.venv', '.git']);
const CODE_EXT = /\.(js|mjs|cjs|html)$/;

/**
 * Every code file under a directory, recursively.
 *
 * @param {string} dir absolute directory
 * @returns {string[]} absolute file paths
 */
function codeFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...codeFiles(full));
    } else if (CODE_EXT.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

const isCommentLine = (line) => /^\s*(\*|\/\*|\/\/)/.test(line);

/**
 * Files, other than the service and this test, with a code line matching a pattern.
 *
 * @param {RegExp} pattern
 * @returns {string[]} repo-relative paths
 */
function filesNaming(pattern) {
  return ['server', 'tools', 'scripts']
    .flatMap((d) => codeFiles(path.join(repoRoot, d)))
    .filter((f) => f !== servicePath && f !== __filename)
    .filter((f) =>
      readFileSync(f, 'utf-8')
        .split('\n')
        .some((line) => !isCommentLine(line) && pattern.test(line))
    )
    .map((f) => path.relative(repoRoot, f));
}

describe('pipelineService carries no protect or unprotect job (§C141 ②)', () => {
  it('does not export runProtect', () => {
    expect(pipelineService).not.toHaveProperty('runProtect');
  });

  it('does not export runUnprotect', () => {
    expect(pipelineService).not.toHaveProperty('runUnprotect');
  });

  it('does not name the archived protect tool', () => {
    expect(serviceSource).not.toContain('protect-segments-for-mt.js');
  });

  it('does not name the archived unprotect tool', () => {
    expect(serviceSource).not.toContain('unprotect-segments.js');
  });
});

describe('nothing calls them', () => {
  it('no code line outside the service names runProtect or runUnprotect', () => {
    expect(filesNaming(/\brun(Un)?[Pp]rotect\b/)).toEqual([]);
  });

  it('control: the same scan finds the callers of a job that is in use', () => {
    expect(filesNaming(/\brunInject\b/).length).toBeGreaterThan(0);
  });

  it('control: the service still exports the jobs that are in use', () => {
    expect(typeof pipelineService.runInject).toBe('function');
  });
});
