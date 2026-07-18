/**
 * pipelineService spawn argv — the CLI boundary emits the word 'appendices'
 * for chapter -1 (item 14, finding 23 second half; also fixes Vista+Birta
 * for appendix modules via runPipeline → runInject/runRender).
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// REQUIRED, not insurance: pipelineStatusService resolves SESSIONS_DB_PATH at
// require time, and runExtract's completion continuation (advanceChapterStatus
// + resetChapterStage) WRITES chapter status when the fake spawn exits 0. Point
// all of it at a throwaway migrated DB before the first require.
const work = mkdtempSync(path.join(tmpdir(), 'pipe-spawn-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');

const pipeline = require('../services/pipelineService');

let spawnedCalls;

function fakeSpawn(command, args) {
  spawnedCalls.push({ command, args });
  return {
    stdout: { on() {} },
    stderr: { on() {} },
    on(event, cb) {
      if (event === 'close') setImmediate(() => cb(0));
    },
  };
}

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  spawnedCalls = [];
  pipeline._setTestSpawn(fakeSpawn);
});

afterEach(() => {
  pipeline._setTestSpawn(null);
});

function chapterArgOf(call) {
  const i = call.args.indexOf('--chapter');
  expect(i).toBeGreaterThan(-1);
  return call.args[i + 1];
}

describe('spawn argv chapter dialect', () => {
  it('runInject emits --chapter appendices for -1 and keeps job.chapter = -1', async () => {
    const { jobId, promise } = pipeline.runInject({
      book: 'testbook',
      chapter: -1,
      moduleId: 'm99901',
    });
    await promise;
    expect(chapterArgOf(spawnedCalls[0])).toBe('appendices');
    expect(pipeline.getJob(jobId).chapter).toBe(-1);
  });

  it('runRender emits --chapter appendices for -1', async () => {
    const { promise } = pipeline.runRender({ book: 'testbook', chapter: -1 });
    await promise;
    expect(chapterArgOf(spawnedCalls[0])).toBe('appendices');
  });

  it('runExtract emits --chapter appendices for -1', async () => {
    const { promise } = pipeline.runExtract({ book: 'testbook', chapter: -1 });
    await promise;
    expect(chapterArgOf(spawnedCalls[0])).toBe('appendices');
  });

  it('regular chapters stay plain numbers on argv', async () => {
    const { promise } = pipeline.runRender({ book: 'testbook', chapter: 3 });
    await promise;
    expect(chapterArgOf(spawnedCalls[0])).toBe('3');
  });
});
