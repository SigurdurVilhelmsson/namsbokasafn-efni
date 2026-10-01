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
    // The report says WHERE each reference is: area · track · chapter · file.
    expect(r.out).toMatch(/03-translated · mt-preview · ch01 · m1\.cnxml/);
    expect(r.out).toMatch(/05-publication · mt-preview · 01 · 1-1-page\.html/);
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

  // A row that is flat and inside media/ but is not THIS figure's copy would make a retire of
  // CNX_A delete somebody else's file: the exact-name rule is the only thing that stops it.
  it.each([
    [
      "another figure's copy",
      (n) => ({ originalImage: n, outputName: `CNX_B${S}.svg`, extension: '.svg' }),
    ],
    ['no extension', (n) => ({ originalImage: n, outputName: `${n}${S}`, extension: '' })],
    ['no outputName at all', (n) => ({ originalImage: n, extension: '.svg' })],
  ])('refuses a mapping row naming %s, and deletes nothing', (_kind, makeRow) => {
    const fx = standardBook({
      'books/b/media/image-mapping.json':
        JSON.stringify([makeRow('CNX_A'), ROW('CNX_B')], null, 2) + '\n',
    });
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/which is not CNX_A.*<ext> inside media\//);
    expect(fx.snapshot()).toEqual(before);
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

  it('still restores the deleted files when restoring the mapping fails too', () => {
    const fx = standardBook();
    const mapping = path.join(fx.booksRoot, 'b', 'media', 'image-mapping.json');
    let calls = 0;
    const unlink = (p) => {
      calls += 1;
      if (calls === 2) {
        // The mapping is written through `<mapping>.<pid>.tmp` (writeAtomically). A directory of that
        // name makes the NEXT write fail — the restore — and only it, the retire's own write being done.
        fs.mkdirSync(`${mapping}.${process.pid}.tmp`);
        throw Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' });
      }
      fs.unlinkSync(p);
    };
    const r = runTool(fx, ['--book', 'b', '--retire', 'CNX_A,CNX_B', '--apply'], {
      retired: new Set(['CNX_A', 'CNX_B']),
      unlink,
    });
    expect(r.code).toBe(1);
    // Control: the mapping restore really did fail, so this is the double fault and not a clean rollback.
    expect(r.err).toMatch(/RESTORE ALSO FAILED: EISDIR/);
    // The failed mapping restore must not stop the files being restored: the copy deleted first is back.
    expect(fx.exists(`books/b/media/CNX_A${S}.svg`)).toBe(true);
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
    [['--book', 'b', '--retire', ','], /--retire needs at least one name/],
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

describe('retire-translated-figure --prune (§C140 ㊵)', () => {
  /** CNX_A retired, then what ②'s re-inject and re-render do: its pages point at the English image again. */
  function retiredAndRerendered(extra = {}) {
    const fx = standardBook(extra);
    expect(runTool(fx, ['--book', 'b', '--retire', 'CNX_A', '--apply']).code).toBe(0);
    fx.git('commit', '-qam', 'retire CNX_A');
    fx.write(
      'books/b/03-translated/mt-preview/ch01/m1.cnxml',
      `<image src="../../media/CNX_A.jpg"/><image src="../../media/CNX_B${S}.svg"/>`
    );
    fx.write(
      `${PUB}/1-1-page.html`,
      `<img src="/content/b/chapters/01/images/media/CNX_A.jpg"><img src="/content/b/chapters/01/images/media/CNX_B${S}.svg">`
    );
    return fx;
  }
  const COPY_A = `${PUB}/images/media/CNX_A${S}.svg`;

  it('POSITIVE CONTROL: deletes the unreferenced, unmapped copy and keeps the mapped one', () => {
    const fx = retiredAndRerendered();
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(r.code).toBe(0);
    expect(fx.exists(COPY_A)).toBe(false);
    expect(fx.exists(`${PUB}/images/media/CNX_B${S}.svg`)).toBe(true);
  });

  it('a dry run deletes nothing', () => {
    const fx = retiredAndRerendered();
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--prune']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/would delete .*CNX_A/);
    expect(fx.snapshot()).toEqual(before);
  });

  it.each([
    [
      'a page in the OTHER track',
      (fx) =>
        fx.write(
          'books/b/05-publication/faithful/chapters/01/1-1-page.html',
          `<img src="CNX_A${S}.svg">`
        ),
    ],
    [
      'a CNXML file only',
      (fx) =>
        fx.write(
          'books/b/03-translated/mt-preview/ch01/m1.cnxml',
          `<image src="../../media/CNX_A${S}.svg"/>`
        ),
    ],
    [
      'a JSON file',
      (fx) => fx.write('books/b/05-publication/mt-preview/index.json', `{"img":"CNX_A${S}.svg"}`),
    ],
  ])('keeps a copy still referenced from %s', (_where, setup) => {
    const fx = retiredAndRerendered();
    setup(fx);
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(r.code).toBe(0);
    expect(fx.exists(COPY_A)).toBe(true);
    expect(r.out).toMatch(/keep .*CNX_A.* still referenced by/);
  });

  it('an ignored .backup file naming the copy does not keep it', () => {
    const fx = retiredAndRerendered();
    fx.write('books/b/03-translated/mt-preview/ch01/m1.cnxml.backup.2026-10-01', `CNX_A${S}.svg`);
    expect(runTool(fx, ['--book', 'b', '--prune', '--apply']).code).toBe(0);
    expect(fx.exists(COPY_A)).toBe(false);
  });

  it('a page referencing a look-alike name does not keep the copy', () => {
    const fx = retiredAndRerendered();
    fx.write(`${PUB}/1-2-other.html`, `<img src="CNX_A2${S}.svg">`);
    expect(runTool(fx, ['--book', 'b', '--prune', '--apply']).code).toBe(0);
    expect(fx.exists(COPY_A)).toBe(false);
  });

  it('keeps an untracked copy — git could not restore it', () => {
    const fx = retiredAndRerendered();
    fx.write(`${PUB}/images/media/CNX_Z${S}.svg`, '<svg/>');
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(fx.exists(`${PUB}/images/media/CNX_Z${S}.svg`)).toBe(true);
    expect(r.out).toMatch(/keep .*CNX_Z.* not tracked by git/);
  });

  it('keeps a copy whose name could be URL-encoded where a page references it', () => {
    const fx = retiredAndRerendered({ [`${PUB}/images/media/CNX_Q Space${S}.svg`]: '<svg/>' });
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(fx.exists(`${PUB}/images/media/CNX_Q Space${S}.svg`)).toBe(true);
    expect(r.out).toMatch(/URL-encoded/);
  });

  it('finds copies under appendices too', () => {
    const fx = retiredAndRerendered({
      [`books/b/05-publication/mt-preview/chapters/appendices/images/media/CNX_Old${S}.svg`]:
        '<svg/>',
    });
    expect(runTool(fx, ['--book', 'b', '--prune', '--apply']).code).toBe(0);
    expect(
      fx.exists(
        `books/b/05-publication/mt-preview/chapters/appendices/images/media/CNX_Old${S}.svg`
      )
    ).toBe(false);
  });

  it('refuses an unreadable mapping and deletes nothing', () => {
    const fx = retiredAndRerendered();
    fx.write('books/b/media/image-mapping.json', '{not json');
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(r.code).toBe(1);
    // The reason, not only the code: a run that refuses for any other reason also exits 1 and writes nothing.
    expect(r.err).toMatch(/is not valid JSON/);
    expect(fx.snapshot()).toEqual(before);
  });

  it('a failure part-way restores every copy already deleted', () => {
    const fx = retiredAndRerendered({ [`${PUB}/images/media/CNX_Old${S}.svg`]: '<svg/>' });
    const before = fx.snapshot();
    let calls = 0;
    const unlink = (p) => {
      calls += 1;
      if (calls === 2) throw Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' });
      fs.unlinkSync(p);
    };
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply'], { unlink });
    // Control: the fault fired on the SECOND deletion, so the first copy really was deleted before it.
    expect(calls).toBe(2);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/every file already deleted was restored/);
    expect(fx.snapshot()).toEqual(before);
  });

  // ── One failing case per keep reason and per safety condition ──────────────────────────────────
  // In the rows above, CNX_B is kept for TWO reasons at once (mapped AND referenced), the counts
  // line has no row of its own, and a rollback that exits 1 with the tree unchanged is also what a
  // refusal looks like. Each row below isolates one of these.

  it('prints the plan counts, lists no keep line for a mapped copy, and says it was a dry run', () => {
    const fx = retiredAndRerendered();
    const r = runTool(fx, ['--book', 'b', '--prune']);
    expect(r.out.split('\n')[0]).toBe(
      '2 published translated copies: 1 to delete, 1 kept (1 still mapped).'
    );
    // D10: mapped copies are a count, never a line each (chemistry would print about 745 of them).
    expect(r.out).not.toMatch(/keep .*CNX_B/);
    expect(r.out).toMatch(/Dry run — nothing was deleted/);
  });

  it('keeps a mapped copy that nothing references: its mapping row alone keeps it', () => {
    const fx = retiredAndRerendered();
    // Everything but the row stops naming CNX_B's translated copy.
    fx.write(
      'books/b/03-translated/mt-preview/ch01/m1.cnxml',
      '<image src="../../media/CNX_A.jpg"/>'
    );
    fx.write(`${PUB}/1-1-page.html`, '<img src="/content/b/chapters/01/images/media/CNX_A.jpg">');
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(r.code).toBe(0);
    expect(fx.exists(`${PUB}/images/media/CNX_B${S}.svg`)).toBe(true);
    expect(r.out).toMatch(/\(1 still mapped\)/);
    // Control: the unmapped copy beside it IS deleted, so this run really pruned.
    expect(fx.exists(COPY_A)).toBe(false);
  });

  it('a legacy row (a figureId, no originalImage) still names its copy', () => {
    const fx = retiredAndRerendered({ [`${PUB}/images/media/legacy${S}.png`]: 'png' });
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(r.code).toBe(0);
    expect(fx.exists(`${PUB}/images/media/legacy${S}.png`)).toBe(true);
    expect(r.out).toMatch(/\(2 still mapped\)/);
    // Control: the unmapped copy is deleted, so this run really pruned.
    expect(fx.exists(COPY_A)).toBe(false);
  });

  it('keeps a MODIFIED copy — an edit git cannot restore is not deleted', () => {
    const fx = retiredAndRerendered();
    fx.write(COPY_A, '<svg>edited since the last commit</svg>');
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(r.code).toBe(0);
    expect(fx.read(COPY_A)).toBe('<svg>edited since the last commit</svg>');
    expect(r.out).toMatch(/keep .*CNX_A.* not tracked by git, or modified/);
  });

  it('names the first referrer and counts the rest', () => {
    const fx = retiredAndRerendered();
    const faithful = 'books/b/05-publication/faithful/chapters/01';
    fx.write(`${faithful}/1-1-page.html`, `<img src="CNX_A${S}.svg">`);
    fx.write(`${faithful}/1-2-page.html`, `<img src="CNX_A${S}.svg">`);
    const r = runTool(fx, ['--book', 'b', '--prune']);
    expect(r.out).toMatch(/keep .*CNX_A.* still referenced by \S+-page\.html and 1 more/);
  });

  it.each([
    ['a space', 'CNX_Q Space'],
    ['parentheses', 'CNX_Q(1)'],
    ['a non-ASCII letter', 'CNX_Qé'],
  ])('keeps a copy whose name has %s, for that reason', (_what, stem) => {
    const name = `${stem}${S}.svg`;
    const fx = retiredAndRerendered({ [`${PUB}/images/media/${name}`]: '<svg/>' });
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(r.code).toBe(0);
    expect(fx.exists(`${PUB}/images/media/${name}`)).toBe(true);
    // The name is matched as text, not as a pattern: it has regex metacharacters in it.
    expect(r.out.split('\n').find((l) => l.includes(name))).toMatch(/^ {2}keep .* URL-encoded/);
  });

  it('refuses a missing mapping when media/ exists — absent is not "no row names anything"', () => {
    const fx = retiredAndRerendered();
    fx.git('rm', '-q', 'books/b/media/image-mapping.json');
    fx.git('commit', '-qm', 'mapping gone');
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/cannot be read \(ENOENT\)/);
    expect(fx.snapshot()).toEqual(before);
  });

  it('refuses a book with a published copy but no media/ folder, rather than reading its mapping as empty', () => {
    // A translated copy reaches 05-publication only through a mapping row, so a copy with no mapping at
    // all is an inconsistent checkout. Had the pages been re-rendered as well, every copy would read
    // unmapped AND unreferenced, and --apply would delete them all.
    const fx = makeGitFixture({ [`${PUB}/images/media/CNX_Old${S}.svg`]: '<svg/>' });
    expect(fx.exists('books/b/media')).toBe(false); // control: the premise holds
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/image-mapping\.json cannot be read \(ENOENT\)/);
    expect(fx.snapshot()).toEqual(before);
  });

  it.each([
    ['no media/ folder', {}],
    ['a media/ folder but no mapping file', { 'books/b/media/CNX_Loose.svg': '<svg/>' }],
  ])(
    'a book with %s and no published copies still runs: there is nothing to judge',
    (_state, extra) => {
      const fx = makeGitFixture({
        'books/b/03-translated/mt-preview/ch01/m1.cnxml': '<image src="../../media/CNX_A.jpg"/>',
        ...extra,
      });
      expect(fx.exists('books/b/media/image-mapping.json')).toBe(false); // control: no mapping to read
      const before = fx.snapshot();
      const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
      expect(r.code).toBe(0);
      expect(r.out.split('\n')[0]).toBe(
        '0 published translated copies: 0 to delete, 0 kept (0 still mapped).'
      );
      expect(fx.snapshot()).toEqual(before);
    }
  );

  it('refuses a book that does not exist, rather than reading its missing pages as "no copies"', () => {
    const fx = retiredAndRerendered();
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'nope', '--prune', '--apply']);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/no book directory/);
    expect(fx.snapshot()).toEqual(before);
  });

  it('fails loudly, never as "no references", when the book lies outside the repository', () => {
    const fx = standardBook();
    const outside = makeTmpDir('c40-outside-');
    const copy = path.join(
      outside,
      'b',
      '05-publication',
      'mt-preview',
      'chapters',
      '01',
      'images',
      'media',
      `CNX_Z${S}.svg`
    );
    fs.mkdirSync(path.dirname(copy), { recursive: true });
    fs.writeFileSync(copy, '<svg/>');
    // A readable mapping, so the run gets past the missing-mapping refusal and reaches the corpus scan.
    fs.mkdirSync(path.join(outside, 'b', 'media'), { recursive: true });
    fs.writeFileSync(path.join(outside, 'b', 'media', 'image-mapping.json'), '[]\n');
    // git refuses the escaping pathspec. An unreadable corpus must never read as an empty one:
    // then every unmapped copy would look unreferenced.
    expect(() =>
      runTool(fx, ['--book', 'b', '--prune', '--apply'], { booksRoot: outside })
    ).toThrow(/git ls-files failed/);
    expect(fs.existsSync(copy)).toBe(true);
  });

  it('a failure at the very first deletion has nothing to restore, and is still reported', () => {
    const fx = retiredAndRerendered();
    const before = fx.snapshot();
    const unlink = () => {
      throw Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' });
    };
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply'], { unlink });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(
      /FAILED part-way \(EACCES: simulated\); every file already deleted was restored/
    );
    expect(r.err).not.toMatch(/RESTORE ALSO FAILED/);
    expect(fx.snapshot()).toEqual(before);
  });

  it('says so, and where the files are, when the restore itself fails', () => {
    const fx = retiredAndRerendered({ [`${PUB}/images/media/CNX_Old${S}.svg`]: '<svg/>' });
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
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply'], { unlink, git });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(
      /RESTORE ALSO FAILED: git restore failed: simulated restore failure — restore by hand from git/
    );
    expect(r.err).not.toMatch(/was restored/);
    // The message is true: the copy deleted before the failure is still gone, and git still holds it.
    expect(fx.exists(COPY_A)).toBe(false);
    expect(fx.git('ls-files', COPY_A).trim()).toBe(COPY_A);
  });

  it('a failure on the third deletion restores BOTH copies already deleted, not just one', () => {
    const fx = retiredAndRerendered({
      [`${PUB}/images/media/CNX_Old1${S}.svg`]: '<svg>1</svg>',
      [`${PUB}/images/media/CNX_Old2${S}.svg`]: '<svg>2</svg>',
    });
    const before = fx.snapshot();
    let calls = 0;
    const unlink = (p) => {
      calls += 1;
      if (calls === 3) throw Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' });
      fs.unlinkSync(p);
    };
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply'], { unlink });
    // Control: two copies really were deleted before the fault, so a restore of only one would show.
    expect(calls).toBe(3);
    expect(r.code).toBe(1);
    expect(fx.snapshot()).toEqual(before);
  });

  it('the counts line says how many KEPT copies are mapped, not how many are kept', () => {
    const fx = retiredAndRerendered();
    // Kept, but not for being mapped: nothing tracks it.
    fx.write(`${PUB}/images/media/CNX_Z${S}.svg`, '<svg/>');
    const r = runTool(fx, ['--book', 'b', '--prune']);
    expect(r.out.split('\n')[0]).toBe(
      '3 published translated copies: 1 to delete, 2 kept (1 still mapped).'
    );
  });

  it('--apply says what it deleted, one line per copy, and how many', () => {
    const fx = retiredAndRerendered({ [`${PUB}/images/media/CNX_Old${S}.svg`]: '<svg/>' });
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(r.code).toBe(0);
    expect(r.out.split('\n').filter((l) => /^ {2}delete /.test(l))).toHaveLength(2);
    expect(r.out).toMatch(/Done: 2 deleted\./);
  });

  it('a second run deletes nothing more', () => {
    const fx = retiredAndRerendered();
    expect(runTool(fx, ['--book', 'b', '--prune', '--apply']).code).toBe(0);
    fx.git('commit', '-qam', 'pruned');
    const before = fx.snapshot();
    const r = runTool(fx, ['--book', 'b', '--prune', '--apply']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(
      /1 published translated copies: 0 to delete, 1 kept \(1 still mapped\)\./
    );
    expect(r.out).toMatch(/Done: 0 deleted\./);
    expect(fx.snapshot()).toEqual(before);
  });
});
