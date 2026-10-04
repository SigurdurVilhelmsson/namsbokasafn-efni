/**
 * Faithful retirement, Decision 4: `--track faithful` is refused unless the
 * source directory maps to faithful.
 *
 * `--source-dir` chooses which segments are read and `--track` chooses where the
 * output is written, and nothing tied the two together. So a bare
 * `cnxml-inject --track faithful` read MACHINE text from the default
 * `02-mt-output` and wrote it into `03-translated/faithful/`, where a faithful
 * render publishes it as reviewed text with no MT banner. The server is not
 * affected: `runInject` always passes `--source-dir` and never `--track`.
 *
 * Every run here is a spawned CLI against a throwaway copy of chemistry ch01.
 * Never point it at the real tree: before the guard, the refused shape WRITES.
 * The title segment of m68663 carries a different token in each source dir, so
 * each assertion reads which text reached the output, by value, not by count.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import {
  cpSync,
  rmSync,
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const REAL_ROOT = join(import.meta.dirname, '..', '..');
const REAL_BOOK = join(REAL_ROOT, 'books', 'efnafraedi-2e');
const INJECT = join(REAL_ROOT, 'tools', 'cnxml-inject.js');
const MOD = 'm68663';
const MT_TOKEN = 'MTSENTINELq7x';
const FAITHFUL_TOKEN = 'FAITHFULSENTINELk3z';
const TITLE_SEG = `<!-- SEG:${MOD}:title:auto-1 -->`;

/** Replace the text of m68663's title segment with `token`. */
function withTitle(segmentsMd, token) {
  const at = segmentsMd.indexOf(TITLE_SEG);
  if (at < 0) throw new Error(`fixture: ${TITLE_SEG} not found`);
  const start = at + TITLE_SEG.length + 1; // past the marker's newline
  const end = segmentsMd.indexOf('\n', start);
  return segmentsMd.slice(0, start) + token + segmentsMd.slice(end);
}

// Book-level files plus ch01 of the four stages inject reads. 03-translated and
// the residue manifests are left out so every existence check below measures
// what THIS run wrote, never a copy of an earlier one.
let BASE;
beforeAll(() => {
  BASE = mkdtempSync(join(tmpdir(), 'efni-d4-base-'));
  const book = join(BASE, 'efnafraedi-2e');
  mkdirSync(book, { recursive: true });
  for (const entry of readdirSync(REAL_BOOK, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.startsWith('residue-report.')) {
      cpSync(join(REAL_BOOK, entry.name), join(book, entry.name));
    }
  }
  cpSync(join(REAL_BOOK, 'glossary'), join(book, 'glossary'), { recursive: true });
  for (const stage of ['01-source', '02-for-mt', '02-structure', '02-mt-output']) {
    cpSync(join(REAL_BOOK, stage, 'ch01'), join(book, stage, 'ch01'), { recursive: true });
  }
  const mtPath = join(book, '02-mt-output', 'ch01', `${MOD}-segments.is.md`);
  const mt = readFileSync(mtPath, 'utf8');
  writeFileSync(mtPath, withTitle(mt, MT_TOKEN));
  mkdirSync(join(book, '03-faithful-translation', 'ch01'), { recursive: true });
  writeFileSync(
    join(book, '03-faithful-translation', 'ch01', `${MOD}-segments.is.md`),
    withTitle(mt, FAITHFUL_TOKEN)
  );
}, 60_000);
afterAll(() => {
  if (BASE) rmSync(BASE, { recursive: true, force: true });
});

let WORK, BOOK;
beforeEach(() => {
  WORK = mkdtempSync(join(tmpdir(), 'efni-d4-work-'));
  BOOK = join(WORK, 'books', 'efnafraedi-2e');
  cpSync(join(BASE, 'efnafraedi-2e'), BOOK, { recursive: true });
});
afterEach(() => {
  if (WORK) rmSync(WORK, { recursive: true, force: true });
});

function runInject(extraArgs) {
  return spawnSync(
    'node',
    [INJECT, '--book', 'efnafraedi-2e', '--chapter', '1', '--module', MOD, ...extraArgs],
    { cwd: WORK, encoding: 'utf8', timeout: 60_000 }
  );
}

const OUT = (track) => join(BOOK, '03-translated', track, 'ch01', `${MOD}.cnxml`);
const MANIFEST = (track) => join(BOOK, `residue-report.${track}.json`);
const ERRORS = () => join(BOOK, 'translation-errors.json');

describe('Decision 4: --track faithful needs a faithful source dir', () => {
  for (const [label, args] of [
    ['--track faithful with no --source-dir', ['--track', 'faithful']],
    [
      '--track faithful --source-dir 02-mt-output',
      ['--track', 'faithful', '--source-dir', '02-mt-output'],
    ],
  ]) {
    it(`refuses ${label}, before any write`, () => {
      const errorsBefore = readFileSync(ERRORS(), 'utf8');
      const r = runInject(args);
      expect(r.status).toBe(1);
      expect(existsSync(OUT('faithful'))).toBe(false); // no machine text in the faithful tree
      expect(existsSync(OUT('mt-preview'))).toBe(false); // refused, not rerouted
      expect(existsSync(MANIFEST('faithful'))).toBe(false);
      expect(readFileSync(ERRORS(), 'utf8')).toBe(errorsBefore);
      expect(r.stderr).toContain("--track faithful but --source-dir '02-mt-output'");
      expect(r.stderr).toContain('--source-dir 03-faithful-translation');
      expect(r.stderr).not.toContain('FAILED'); // the guard refused; no module ran and crashed
    });
  }
});

// Controls: the same fixture and harness DO write when the pair agrees, so the
// absences above are the guard's doing, not the harness's.
describe('Decision 4 controls: the shapes that must keep working', () => {
  it("the server's shape (--source-dir 03-faithful-translation, no --track) writes faithful text", () => {
    const r = runInject(['--source-dir', '03-faithful-translation']);
    expect(r.status).toBe(0);
    const out = readFileSync(OUT('faithful'), 'utf8');
    expect(out).toContain(FAITHFUL_TOKEN);
    expect(out).not.toContain(MT_TOKEN);
    expect(existsSync(MANIFEST('faithful'))).toBe(true);
  });

  it('the agreeing pair (--source-dir 03-faithful-translation --track faithful) writes faithful text', () => {
    const r = runInject(['--source-dir', '03-faithful-translation', '--track', 'faithful']);
    expect(r.status).toBe(0);
    const out = readFileSync(OUT('faithful'), 'utf8');
    expect(out).toContain(FAITHFUL_TOKEN);
    expect(out).not.toContain(MT_TOKEN);
  });

  it('the default (no flags) still writes MT text to mt-preview and nothing to faithful', () => {
    const r = runInject([]);
    expect(r.status).toBe(0);
    expect(readFileSync(OUT('mt-preview'), 'utf8')).toContain(MT_TOKEN);
    expect(existsSync(OUT('faithful'))).toBe(false);
  });
});
