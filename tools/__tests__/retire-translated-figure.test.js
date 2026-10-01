import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { run } from '../retire-translated-figure.js';
import { DEFAULT_SUFFIX } from '../generate-image-mapping.js';
import { runGit } from '../lib/translated-figure-refs.js';
import { makeGitFixture, makeTmpDir, cleanupFixtures } from './helpers/git-fixture.js';

const S = DEFAULT_SUFFIX;
const TOOL = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'retire-translated-figure.js'
);
const ROW = (n) => ({ originalImage: n, outputName: `${n}${S}.svg`, extension: '.svg' });
const LEGACY = { figureId: 'fig-legacy', outputName: `legacy${S}.png` };
const PUB = 'books/b/05-publication/mt-preview/chapters/01';

// /tmp is a small tmpfs: every fixture repo made below is removed after its test. A top-level hook,
// so it also covers the --prune tests appended to this file.
afterEach(() => {
  cleanupFixtures();
});

function standardBook(extra = {}) {
  return makeGitFixture({
    'books/b/01-source/ch01/m1.cnxml':
      '<document>' +
      ['CNX_A', 'CNX_B', 'CNX_C']
        .map(
          (n, i) => `<figure id="f${i}"><media><image src="../../media/${n}.jpg"/></media></figure>`
        )
        .join('') +
      '</document>',
    'books/b/media/image-mapping.json':
      JSON.stringify([ROW('CNX_A'), ROW('CNX_B'), LEGACY], null, 2) + '\n',
    [`books/b/media/CNX_A${S}.svg`]: '<svg>A</svg>',
    [`books/b/media/CNX_B${S}.svg`]: '<svg>B</svg>',
    'books/b/03-translated/mt-preview/ch01/m1.cnxml': `<image src="../../media/CNX_A${S}.svg"/><image src="../../media/CNX_B${S}.svg"/>`,
    [`${PUB}/1-1-page.html`]: `<img src="/content/b/chapters/01/images/media/CNX_A${S}.svg"><img src="/content/b/chapters/01/images/media/CNX_B${S}.svg">`,
    [`${PUB}/images/media/CNX_A${S}.svg`]: '<svg>A</svg>',
    [`${PUB}/images/media/CNX_B${S}.svg`]: '<svg>B</svg>',
    ...extra,
  });
}

function runTool(fx, argv, opts = {}) {
  const out = [];
  const err = [];
  const code = run(argv, {
    repoRoot: fx.root,
    booksRoot: fx.booksRoot,
    retired: new Set(['CNX_A']),
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    ...opts,
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('retire-translated-figure --retire (§C140 ㊵)', () => {
  it('a dry run writes nothing, and reports the row, the copy and every reference', () => {
    const fx = standardBook();
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A']);
    expect(r.code).toBe(0);
    expect(fx.snapshot()).toEqual(before);
    expect(r.out).toMatch(/would remove: 1 mapping row\(s\); media\/CNX_A.*\.svg/);
    expect(r.out).toMatch(/still referenced by 2 file\(s\)/);
    expect(r.out).toMatch(/Dry run/);
  });

  it('--apply removes exactly the row and the translated copy, and leaves every page alone', () => {
    const fx = standardBook();
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(0);
    expect(fx.read('books/b/media/image-mapping.json')).toBe(
      JSON.stringify([ROW('CNX_B'), LEGACY], null, 2) + '\n'
    );
    expect(fx.exists(`books/b/media/CNX_A${S}.svg`)).toBe(false);
    expect(fx.exists(`books/b/media/CNX_B${S}.svg`)).toBe(true);
    const after = fx.snapshot();
    for (const rel of Object.keys(before).filter(
      (p) => p.includes('03-translated') || p.includes('05-publication')
    )) {
      expect(after[rel]).toBe(before[rel]);
    }
    expect(r.out).toMatch(/--prune/);
  });

  it('refuses a figure with no retiredFigures entry, and writes nothing', () => {
    const fx = standardBook();
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_C', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/no retiredFigures entry/);
    expect(fx.snapshot()).toEqual(before);
  });

  it('reads the retired set from the figure config when none is given (empty in this PR)', () => {
    const fx = standardBook();
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A'], { retired: undefined });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/no retiredFigures entry/);
  });

  it('refuses a name this book does not use (wrong --book), rather than reporting a no-op', () => {
    const fx = standardBook({
      'books/b2/01-source/ch01/m1.cnxml': '<image src="../../media/CNX_Q.jpg"/>',
    });
    const r = runTool(fx, ['--book', 'b2', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/wrong --book/);
  });

  it('refuses a figure with a sidecar', () => {
    const fx = standardBook({ 'books/b/figure-text/CNX_A.is.json': '{}' });
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/CNX_A: has a sidecar/);
    expect(fx.snapshot()).toEqual(before);
  });

  it('refuses an unreadable mapping and leaves it as it is', () => {
    const fx = standardBook({ 'books/b/media/image-mapping.json': '{not json' });
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/is not valid JSON/);
    expect(fx.read('books/b/media/image-mapping.json')).toBe('{not json');
  });

  it('refuses a row whose outputName would reach outside media/', () => {
    const bad = { originalImage: 'CNX_A', outputName: `../CNX_A${S}.svg`, extension: '.svg' };
    const fx = standardBook({
      'books/b/media/image-mapping.json': JSON.stringify([bad], null, 2) + '\n',
    });
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/inside media/);
  });

  it.each([
    ['modified', (fx) => fx.write(`books/b/media/CNX_A${S}.svg`, '<svg>edited</svg>')],
    ['untracked', (fx) => fx.write(`books/b/media/CNX_A${S}.png`, 'u')],
    ['ignored', (fx) => fx.write(`books/b/media/CNX_A${S}.tmp`, 'i')],
  ])('refuses to delete a %s translated copy — git is the backup', (_kind, setup) => {
    const fx = standardBook();
    setup(fx);
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/not tracked by git, or modified/);
  });

  it('an unrelated modified file in media/ does not block a retire', () => {
    const fx = standardBook();
    fx.write(`books/b/media/CNX_B${S}.svg`, '<svg>B, edited</svg>');
    expect(runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']).code).toBe(0);
  });

  it('is batch-atomic: one bad name and nothing is written for the good one', () => {
    const fx = standardBook();
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A,CNX_C', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/CNX_C: no retiredFigures entry/);
    expect(fx.snapshot()).toEqual(before);
  });

  it('a failure part-way restores the mapping and every file already deleted', () => {
    const fx = standardBook();
    const before = fx.snapshot();
    let calls = 0;
    const unlink = (p) => {
      calls += 1;
      if (calls === 2) throw Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' });
      fs.unlinkSync(p);
    };
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A,CNX_B', '--apply'], {
      retired: new Set(['CNX_A', 'CNX_B']),
      unlink,
    });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/were restored/);
    expect(fx.snapshot()).toEqual(before);
  });

  it('a failure at the very first deletion still restores the mapping, with nothing else to restore', () => {
    const fx = standardBook();
    const before = fx.snapshot();
    const unlink = () => {
      throw Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' });
    };
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply'], { unlink });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/were restored/);
    expect(r.err).not.toMatch(/RESTORE ALSO FAILED/);
    expect(fx.snapshot()).toEqual(before);
  });

  it('says so, and where the files are, when the restore itself fails', () => {
    const fx = standardBook();
    let calls = 0;
    const unlink = (p) => {
      calls += 1;
      if (calls === 2) throw Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' });
      fs.unlinkSync(p);
    };
    const git = (root, args) =>
      args.includes('restore')
        ? { status: 1, stdout: '', stderr: 'simulated restore failure' }
        : runGit(root, args);
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A,CNX_B', '--apply'], {
      retired: new Set(['CNX_A', 'CNX_B']),
      unlink,
      git,
    });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(
      /RESTORE ALSO FAILED: git restore failed: simulated restore failure — restore by hand from git/
    );
    expect(r.err).not.toMatch(/were restored/);
    // The message is true: the copy deleted before the failure is still gone, and git still holds it.
    expect(fx.exists(`books/b/media/CNX_A${S}.svg`)).toBe(false);
    expect(fx.git('ls-files', `books/b/media/CNX_A${S}.svg`).trim()).toBe(
      `books/b/media/CNX_A${S}.svg`
    );
  });

  it('a re-run finishes a half-done retire: the row is gone, the copy is not', () => {
    const fx = standardBook();
    fx.write(
      'books/b/media/image-mapping.json',
      JSON.stringify([ROW('CNX_B'), LEGACY], null, 2) + '\n'
    );
    fx.git('commit', '-qam', 'row removed by hand');
    expect(runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']).code).toBe(0);
    expect(fx.exists(`books/b/media/CNX_A${S}.svg`)).toBe(false);
  });

  it('removes a row whose translated copy is already gone, deleting nothing', () => {
    const fx = standardBook();
    fx.git('rm', '-q', `books/b/media/CNX_A${S}.svg`);
    fx.git('commit', '-qm', 'copy gone');
    expect(runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']).code).toBe(0);
    expect(JSON.parse(fx.read('books/b/media/image-mapping.json'))).toEqual([ROW('CNX_B'), LEGACY]);
  });

  it('a second run changes nothing and says there is nothing to retire', () => {
    const fx = standardBook();
    expect(runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']).code).toBe(0);
    fx.git('commit', '-qam', 'retired');
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/nothing to retire/);
    expect(fx.snapshot()).toEqual(before);
  });

  it('refuses a book that does not exist, rather than reading its missing pages as "no references"', () => {
    const fx = standardBook();
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'nope', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/no book directory/);
    expect(fx.snapshot()).toEqual(before);
  });

  it('fails loudly, never as "no references", when the book lies outside the repository', () => {
    const fx = standardBook();
    const outside = makeTmpDir('c40-outside-');
    fs.mkdirSync(path.join(outside, 'b', '01-source', 'ch01'), { recursive: true });
    fs.writeFileSync(
      path.join(outside, 'b', '01-source', 'ch01', 'm1.cnxml'),
      '<image src="../../media/CNX_A.jpg"/>'
    );
    // Nothing to delete here, so the run reaches the reference scan: git refuses the escaping pathspec.
    expect(() => runTool(fx, ['--book', 'b', '--retire', 'CNX_A'], { booksRoot: outside })).toThrow(
      /git ls-files failed/
    );
  });

  it.each([
    [['--book', 'b', '--retire', 'CNX_A', '--dryrun'], /Unknown argument: --dryrun/],
    [['--book', 'b', '--retire', 'CNX_A', '--prune'], /exactly one of --retire/],
    [['--retire', 'CNX_A'], /--book is required/],
    [['--book', '../x', '--prune'], /is not a book slug/],
    [['--book', 'b', '--retire'], /--retire needs a value, and got nothing/],
    [['--book', 'b', '--retire', '--apply'], /--retire needs a value, and got "--apply"/],
    [['--book', 'b'], /exactly one of --retire/],
  ])('refuses usage %j with exit 2 and writes nothing', (argv, reason) => {
    const fx = standardBook();
    const before = fx.snapshot();
    const r = runTool(fx, argv);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(reason);
    expect(fx.snapshot()).toEqual(before);
  });

  it('runs from any working directory: --help exits 0 with the usage', () => {
    const r = spawnSync(process.execPath, [TOOL, '--help'], {
      cwd: os.tmpdir(),
      encoding: 'utf-8',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/--retire <name>/);
  });
});
