/**
 * Register §C226: `pipelineService` no longer carries `runExtract`, nor the two
 * helpers only it used, `resetChapterStage` and `computeSourceHash`.
 *
 * Extraction is done from the command line (`tools/cnxml-extract.js`). The
 * route that started the server job was removed on 2026-03-23, and nothing has
 * called `runExtract` since except one test case. Unlike the protect and
 * unprotect jobs (§C141 ②) it would have run if called: its tool exists. It is
 * removed as unused, not as broken.
 *
 * The first block is red before the removal. Its last case is red for one
 * cause: the test case in pipelineSpawnArgs.test.js that called `runExtract`.
 *
 * The second block is the reason the removal is safe, and holds before and
 * after it: outside the service and that one test file, no code line names any
 * of the three. Its control shows the scan can see a caller, by finding the
 * callers of `runInject`, a job that is in use.
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
const spawnArgsTestPath = path.join(__dirname, 'pipelineSpawnArgs.test.js');

const pipelineService = require('../services/pipelineService');
const serviceSource = readFileSync(servicePath, 'utf-8');

const REMOVED = /\b(runExtract|resetChapterStage|computeSourceHash)\b/;
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
 * Files with a code line matching a pattern, leaving out the service, this
 * test, and any further files named.
 *
 * @param {RegExp} pattern
 * @param {string[]} [alsoSkip] absolute paths to leave out
 * @returns {string[]} repo-relative paths
 */
function filesNaming(pattern, alsoSkip = []) {
  const skip = new Set([servicePath, __filename, ...alsoSkip]);
  return ['server', 'tools', 'scripts']
    .flatMap((d) => codeFiles(path.join(repoRoot, d)))
    .filter((f) => !skip.has(f))
    .filter((f) =>
      readFileSync(f, 'utf-8')
        .split('\n')
        .some((line) => !isCommentLine(line) && pattern.test(line))
    )
    .map((f) => path.relative(repoRoot, f));
}

describe('pipelineService carries no extract job (§C226)', () => {
  it('does not export runExtract', () => {
    expect(pipelineService).not.toHaveProperty('runExtract');
  });

  it('does not export computeSourceHash', () => {
    expect(pipelineService).not.toHaveProperty('computeSourceHash');
  });

  it('defines none of the three functions', () => {
    const defined = ['runExtract', 'resetChapterStage', 'computeSourceHash'].filter((name) =>
      serviceSource.includes(`function ${name}(`)
    );
    expect(defined).toEqual([]);
  });

  it('does not name the extraction tool', () => {
    expect(serviceSource).not.toContain('cnxml-extract.js');
  });

  it('no code line outside the service names any of the three', () => {
    expect(filesNaming(REMOVED)).toEqual([]);
  });
});

// `runExtract` was the only caller that passed `sourceHash` to
// `advanceChapterStatus`, which turned it into the stage's note. With the job
// gone that branch could not be reached, so it is removed too. The stage write
// is stubbed: `pipelineService` calls it through the shared module object.
describe('advanceChapterStatus no longer records a source hash', () => {
  const pipelineStatus = require('../services/pipelineStatusService');

  /**
   * The note `advanceChapterStatus` hands to the stage write for one call.
   *
   * @param {object} extra
   * @returns {string|null}
   */
  function noteFor(extra) {
    const original = pipelineStatus.transitionStage;
    let note;
    pipelineStatus.transitionStage = (...args) => {
      note = args[5];
    };
    try {
      pipelineService.advanceChapterStatus('testbook', 3, 'injection', extra);
    } finally {
      pipelineStatus.transitionStage = original;
    }
    return note;
  }

  it('writes no note for a sourceHash', () => {
    expect(noteFor({ sourceHash: 'abc123' })).toBeNull();
  });

  it('does not mention sourceHash in the service', () => {
    expect(serviceSource).not.toContain('sourceHash');
  });

  it('control: still writes the track as the note', () => {
    expect(noteFor({ track: 'faithful' })).toBe('track: faithful');
  });

  it('control: still writes an explicit note', () => {
    expect(noteFor({ notes: 'by hand' })).toBe('by hand');
  });
});

describe('nothing else calls them', () => {
  it('no code line outside the service and its spawn-args test names any of the three', () => {
    expect(filesNaming(REMOVED, [spawnArgsTestPath])).toEqual([]);
  });

  it('control: the same scan finds the callers of a job that is in use', () => {
    expect(filesNaming(/\brunInject\b/).length).toBeGreaterThan(0);
  });

  it('control: the service still exports the jobs that are in use', () => {
    expect(typeof pipelineService.runInject).toBe('function');
  });
});
