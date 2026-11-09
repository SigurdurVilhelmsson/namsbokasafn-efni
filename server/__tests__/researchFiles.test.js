/**
 * Every research-side path, derived from the research file's own (G1.1 + G1.2 spec §5.15 step 4,
 * §5.17; PR4 Task 2, decision 2).
 *
 * The copies, the exports, the end-of-editing exports, the heartbeat and a restore's staging file
 * all sit beside the research file, so one variable (SESSIONS_DB_PATH) moves every file PR4
 * writes, and no test touches pipeline-output/.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { researchFilesFor } = require('../lib/researchFiles');
const { resolveResearchDbPath } = require('../lib/researchDbPath');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

let saved;
beforeEach(() => {
  saved = process.env.SESSIONS_DB_PATH;
});
afterEach(() => {
  if (saved === undefined) delete process.env.SESSIONS_DB_PATH;
  else process.env.SESSIONS_DB_PATH = saved;
});

const expectedUnder = (d, researchBase) => ({
  dir: d,
  researchPath: path.join(d, researchBase),
  walPath: path.join(d, `${researchBase}-wal`),
  shmPath: path.join(d, `${researchBase}-shm`),
  backupsDir: path.join(d, 'research-backups'),
  exportsDir: path.join(d, 'research-exports'),
  servedVersionExportsDir: path.join(d, 'served-version-exports'),
  heartbeatPath: path.join(d, '.last-research-backup'),
  stagingPath: path.join(d, `${researchBase}.restoring`),
});

describe('researchFilesFor', () => {
  it("maps production's default and a redirected test path", () => {
    delete process.env.SESSIONS_DB_PATH;
    const d = path.join(REPO_ROOT, 'pipeline-output');
    expect({ ...researchFilesFor(resolveResearchDbPath().researchPath) }).toEqual(
      expectedUnder(d, 'research.db')
    );

    process.env.SESSIONS_DB_PATH = '/tmp/x/acc-test-1.db';
    expect({ ...researchFilesFor(resolveResearchDbPath().researchPath) }).toEqual(
      expectedUnder('/tmp/x', 'acc-test-1.research.db')
    );
  });

  it('a staging path keeps the directory and gets its own -wal', () => {
    const files = researchFilesFor('/w/research.db.restoring');
    expect(files.walPath).toBe('/w/research.db.restoring-wal');
    expect(files.exportsDir).toBe('/w/research-exports');
  });

  it('the exports the deletion empties are never the end-of-editing exports, nor the copies', () => {
    const files = researchFilesFor('/w/research.db');
    expect(new Set([files.exportsDir, files.servedVersionExportsDir, files.backupsDir]).size).toBe(
      3
    );
    // spec §5.15 step 4 names this directory
    expect(path.basename(files.exportsDir)).toBe('research-exports');
    expect(Object.isFrozen(files)).toBe(true);
  });
});
