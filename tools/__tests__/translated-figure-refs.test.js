import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { DEFAULT_SUFFIX } from '../generate-image-mapping.js';
import {
  isTranslatedName,
  referenceNeedle,
  gitVisibleFiles,
  findReferences,
  publishedCopies,
  cleanTrackedSet,
  locate,
  readMappingOrRefuse,
  topLevelTranslatedCopies,
  writeAtomically,
  restoreFromHead,
} from '../lib/translated-figure-refs.js';
import { makeGitFixture, makeTmpDir, cleanupFixtures } from './helpers/git-fixture.js';

const S = DEFAULT_SUFFIX;
const PUB = 'books/b/05-publication/mt-preview/chapters/01';

// /tmp is a small tmpfs: every fixture and temp directory below is removed after its test.
afterEach(cleanupFixtures);

describe('names (§C140 ㊵)', () => {
  it('a translated name is <stem><suffix>.<ext>', () => {
    expect(isTranslatedName(`CNX_A${S}.svg`, S)).toBe(true);
    expect(isTranslatedName('CNX_A.jpg', S)).toBe(false);
    expect(isTranslatedName(`CNX_A${S}.svg.backup.2026`, S)).toBe(false);
    expect(isTranslatedName(`CNX_A${S}`, S)).toBe(false);
  });

  it("a reference needle is the file's stem plus a dot", () => {
    expect(referenceNeedle(`CNX_A${S}.svg`)).toBe(`CNX_A${S}.`);
  });
});

describe('findReferences — one corpus, one predicate (spec D13)', () => {
  const fx = () =>
    makeGitFixture({
      [`${PUB}/1-1-page.html`]: `<img src="/content/b/chapters/01/images/media/CNX_A${S}.svg">`,
      'books/b/03-translated/mt-preview/ch01/m1.cnxml': `<image src="../../media/CNX_T${S}.svg"/>`,
      [`${PUB}/images/media/CNX_D${S}.svg`]: `<svg><!-- mentions CNX_E${S}.svg --></svg>`,
      [`${PUB}/images/media/raster.jpg`]: `binary-ish CNX_F${S}.svg`,
      [`${PUB}/1-2-lookalike.html`]: `<img src="CNX_G2${S}.svg"><img src="CNX_G.jpg">`,
    });
  const needles = (...names) => new Set(names.map((n) => `${n}${S}.`));

  it('finds a reference in a page and in a CNXML file', () => {
    const f = fx();
    const hits = findReferences({
      repoRoot: f.root,
      bookRel: 'books/b',
      needles: needles('CNX_A', 'CNX_T'),
      suffix: S,
    });
    expect(hits.get(`CNX_A${S}.`)).toEqual([`${PUB}/1-1-page.html`]);
    expect(hits.get(`CNX_T${S}.`)).toEqual(['books/b/03-translated/mt-preview/ch01/m1.cnxml']);
  });

  it('counts an UNTRACKED, not-ignored page — a re-render not yet committed', () => {
    const f = fx();
    f.write(`${PUB}/1-9-new.html`, `<img src="CNX_U${S}.svg">`);
    const hits = findReferences({
      repoRoot: f.root,
      bookRel: 'books/b',
      needles: needles('CNX_U'),
      suffix: S,
    });
    expect(hits.get(`CNX_U${S}.`)).toEqual([`${PUB}/1-9-new.html`]);
  });

  it('ignores a gitignored .backup file, which names every figure inject ever saw', () => {
    const f = fx();
    f.write('books/b/03-translated/mt-preview/ch01/m1.cnxml.backup.2026-10-01', `CNX_B${S}.svg`);
    const hits = findReferences({
      repoRoot: f.root,
      bookRel: 'books/b',
      needles: needles('CNX_B'),
      suffix: S,
    });
    expect(hits.get(`CNX_B${S}.`)).toEqual([]);
  });

  it('does not scan translated copies or raster files', () => {
    const f = fx();
    const hits = findReferences({
      repoRoot: f.root,
      bookRel: 'books/b',
      needles: needles('CNX_E', 'CNX_F'),
      suffix: S,
    });
    expect(hits.get(`CNX_E${S}.`)).toEqual([]);
    expect(hits.get(`CNX_F${S}.`)).toEqual([]);
  });

  it('a look-alike name and the restored English image are not references', () => {
    const f = fx();
    const hits = findReferences({
      repoRoot: f.root,
      bookRel: 'books/b',
      needles: needles('CNX_G', 'CNX_G2'),
      suffix: S,
    });
    expect(hits.get(`CNX_G${S}.`)).toEqual([]);
    expect(hits.get(`CNX_G2${S}.`)).toEqual([`${PUB}/1-2-lookalike.html`]);
  });

  it('skips a tracked file deleted from the working tree instead of throwing', () => {
    const f = fx();
    fs.unlinkSync(path.join(f.root, `${PUB}/1-1-page.html`));
    const hits = findReferences({
      repoRoot: f.root,
      bookRel: 'books/b',
      needles: needles('CNX_A'),
      suffix: S,
    });
    expect(hits.get(`CNX_A${S}.`)).toEqual([]);
  });

  // CP-1: only the figure copies are skipped, i.e. a translated name in a directory named `media`.
  // A page, JSON or CNXML file whose own stem ends in the suffix is a referrer like any other.
  it('scans a page whose own name ends in the suffix; a copy in images/media/ is still skipped', () => {
    const f = fx();
    f.write(
      `${PUB}/glossary${S}.html`,
      `<img src="/content/b/chapters/01/images/media/CNX_H${S}.svg">`
    );
    const hits = findReferences({
      repoRoot: f.root,
      bookRel: 'books/b',
      needles: needles('CNX_H', 'CNX_E'),
      suffix: S,
    });
    expect(hits.get(`CNX_H${S}.`)).toEqual([`${PUB}/glossary${S}.html`]);
    // CONTROL: the copy CNX_D's text names CNX_E's copy, and it sits in images/media/, so it is not read.
    expect(hits.get(`CNX_E${S}.`)).toEqual([]);
  });

  it('scans a NON-translated .svg outside media/: the skip is for the copies, not for a format', () => {
    const f = fx();
    f.write(`${PUB}/diagram.svg`, `<svg><image href="images/media/CNX_K${S}.svg"/></svg>`);
    const hits = findReferences({
      repoRoot: f.root,
      bookRel: 'books/b',
      needles: needles('CNX_K'),
      suffix: S,
    });
    expect(hits.get(`CNX_K${S}.`)).toEqual([`${PUB}/diagram.svg`]);
  });

  // #14: the window before each marker is clamped at the file's start. Unclamped, a negative start
  // counts from the END, so a reference that opens a file — with a longer needle in the set — is missed.
  it('finds a reference at the very start of a file while a longer needle is in the set', () => {
    const f = fx();
    f.write(
      `${PUB}/1-3-starts.html`,
      `CNX_M${S}.svg opens this file, which runs on well past the longest needle in the set.`
    );
    const hits = findReferences({
      repoRoot: f.root,
      bookRel: 'books/b',
      needles: needles('CNX_M', 'CNX_A_much_longer_figure_name'),
      suffix: S,
    });
    expect(hits.get(`CNX_M${S}.`)).toEqual([`${PUB}/1-3-starts.html`]);
  });

  it('rethrows a read error other than ENOENT: an unreadable referrer must not make a copy look orphaned', () => {
    const f = fx();
    const readFile = (file, enc) => {
      if (file.endsWith('1-1-page.html')) {
        throw Object.assign(new Error('EACCES: simulated'), { code: 'EACCES' });
      }
      return fs.readFileSync(file, enc);
    };
    expect(() =>
      findReferences({
        repoRoot: f.root,
        bookRel: 'books/b',
        needles: needles('CNX_A'),
        suffix: S,
        readFile,
      })
    ).toThrow(/EACCES: simulated/);
  });

  it('gitVisibleFiles throws outside a git repository rather than returning nothing', () => {
    const notRepo = makeTmpDir('c40-norepo-');
    expect(() => gitVisibleFiles(notRepo, ['books'])).toThrow(/git ls-files failed/);
  });
});

describe('publishedCopies', () => {
  it('walks every track and chapter directory, appendices included', () => {
    const f = makeGitFixture({
      [`${PUB}/images/media/CNX_A${S}.svg`]: 'x',
      [`${PUB}/images/media/CNX_A.jpg`]: 'x',
      [`books/b/05-publication/faithful/chapters/appendices/images/media/CNX_Z${S}.svg`]: 'x',
      [`${PUB}/images/media/nested/CNX_N${S}.svg`]: 'x',
    });
    expect(publishedCopies(f.root, 'books/b', S)).toEqual([
      `books/b/05-publication/faithful/chapters/appendices/images/media/CNX_Z${S}.svg`,
      `${PUB}/images/media/CNX_A${S}.svg`,
    ]);
  });
});

describe('cleanTrackedSet — git is the backup a deletion relies on', () => {
  it('keeps only files tracked and unmodified against HEAD', () => {
    const f = makeGitFixture({
      'books/b/media/clean.svg': 'c',
      'books/b/media/edited.svg': 'e',
      'books/b/media/staged.svg': 's',
    });
    f.write('books/b/media/edited.svg', 'edited');
    f.write('books/b/media/staged.svg', 'staged');
    f.git('add', 'books/b/media/staged.svg');
    f.write('books/b/media/untracked.svg', 'u');
    f.write('books/b/media/ignored.tmp', 'i');
    const rels = ['clean', 'edited', 'staged', 'untracked']
      .map((n) => `books/b/media/${n}.svg`)
      .concat('books/b/media/ignored.tmp');
    expect([...cleanTrackedSet(f.root, rels)]).toEqual(['books/b/media/clean.svg']);
  });

  it('reads a modified file as modified when repoRoot is below the git top-level', () => {
    // ls-files prints paths relative to the -C directory; diff --name-only prints them from the
    // top-level unless given --relative. In two different bases a MODIFIED file never matched the
    // dirty list and read as clean: the guard failing open. y is the control that returns.
    const f = makeGitFixture({ 'sub/books/x.svg': 'x', 'sub/books/y.svg': 'y' });
    f.write('sub/books/x.svg', 'edited');
    const clean = cleanTrackedSet(path.join(f.root, 'sub'), ['books/x.svg', 'books/y.svg']);
    expect([...clean]).toEqual(['books/y.svg']);
  });

  it('is empty in a repository with no commits', () => {
    const f = makeGitFixture({ 'books/b/media/x.svg': 'x' });
    const fresh = makeTmpDir('c40-fresh-');
    execFileSync('git', ['-C', fresh, 'init', '-q']);
    fs.mkdirSync(path.join(fresh, 'books'), { recursive: true });
    fs.writeFileSync(path.join(fresh, 'books', 'x.svg'), 'x');
    // Staged but never committed: git KNOWS the file and has no HEAD to restore it from. An
    // untracked file would read as empty for the wrong reason, and the guard would go untested.
    execFileSync('git', ['-C', fresh, 'add', 'books/x.svg']);
    expect(cleanTrackedSet(fresh, ['books/x.svg']).size).toBe(0);
    expect(cleanTrackedSet(f.root, ['books/b/media/x.svg']).size).toBe(1);
  });
});

describe('locate', () => {
  it('names the area, track and chapter of a corpus path', () => {
    expect(locate(`${PUB}/1-1-page.html`, 'books/b')).toEqual({
      area: '05-publication',
      track: 'mt-preview',
      chapter: '01',
    });
    expect(locate('books/b/03-translated/mt-preview/ch11/m1.cnxml', 'books/b')).toEqual({
      area: '03-translated',
      track: 'mt-preview',
      chapter: 'ch11',
    });
  });
});

describe('readMappingOrRefuse', () => {
  const tmpFile = (content) => {
    const dir = makeTmpDir('c40-map-');
    const file = path.join(dir, 'image-mapping.json');
    if (content !== undefined) fs.writeFileSync(file, content);
    return file;
  };
  it('reads an array of objects', () => {
    expect(readMappingOrRefuse(tmpFile('[{"a":1}]'))).toEqual([{ a: 1 }]);
  });
  it('refuses invalid JSON, a non-array and an array holding a non-object', () => {
    expect(() => readMappingOrRefuse(tmpFile('{not json'))).toThrow(/not valid JSON/);
    expect(() => readMappingOrRefuse(tmpFile('{}'))).toThrow(/not an array of objects/);
    expect(() => readMappingOrRefuse(tmpFile('[1]'))).toThrow(/not an array of objects/);
  });
  // F6: typeof null and typeof [] are both 'object', so each needs its own clause — a `[null]` row
  // crashed planRetire at `r.originalImage`, and a `[[]]` row was kept and rewritten as legacy.
  it('refuses an array holding null', () => {
    expect(() => readMappingOrRefuse(tmpFile('[null]'))).toThrow(/not an array of objects/);
  });
  it('refuses an array holding an array', () => {
    expect(() => readMappingOrRefuse(tmpFile('[[]]'))).toThrow(/not an array of objects/);
  });
  it('treats a missing file as empty only when told it may', () => {
    expect(readMappingOrRefuse(tmpFile(undefined), { allowMissing: true })).toEqual([]);
    expect(() => readMappingOrRefuse(tmpFile(undefined))).toThrow(/cannot be read/);
  });
});

describe('topLevelTranslatedCopies', () => {
  it('finds <name><suffix>.<ext> at the top of media/, and nothing else', () => {
    const f = makeGitFixture({
      [`books/b/media/CNX_A${S}.svg`]: 'x',
      [`books/b/media/CNX_A${S}.png`]: 'x',
      [`books/b/media/CNX_A2${S}.svg`]: 'x',
      [`books/b/media/CNX_A${S}.svg.backup.1`]: 'x',
      [`books/b/media/sub/CNX_A${S}.svg`]: 'x',
    });
    expect(topLevelTranslatedCopies(path.join(f.root, 'books/b'), 'CNX_A', S)).toEqual([
      `CNX_A${S}.png`,
      `CNX_A${S}.svg`,
    ]);
  });
});

describe('makeGitFixture — the test helper (FR L28)', () => {
  // A git hook can export an ABSOLUTE GIT_INDEX_FILE (`git commit -a`, or a partial commit, hands one
  // to its hooks). Inherited, it pointed the fixture's own `git add -A` at that index — the OUTER
  // repository's. Only makeGitFixture runs while it is set: the tool's runGit inherits it too.
  it('runs git with every GIT_* variable removed, so an outer index is never written', () => {
    const outerIndex = path.join(makeTmpDir('c40-outer-'), 'index');
    const saved = process.env.GIT_INDEX_FILE;
    let f;
    process.env.GIT_INDEX_FILE = outerIndex;
    try {
      f = makeGitFixture({ 'books/b/media/x.svg': 'x' });
    } finally {
      if (saved === undefined) delete process.env.GIT_INDEX_FILE;
      else process.env.GIT_INDEX_FILE = saved;
    }
    expect(fs.existsSync(outerIndex)).toBe(false);
    // CONTROL: the fixture's own commit holds its files, so git really ran.
    expect(f.git('ls-tree', '-r', '--name-only', 'HEAD').split('\n')).toContain(
      'books/b/media/x.svg'
    );
  });
});

describe('writeAtomically and restoreFromHead', () => {
  it('writes through a temp file in the same directory and leaves none behind', () => {
    const dir = makeTmpDir('c40-atomic-');
    const file = path.join(dir, 'image-mapping.json');
    writeAtomically(file, '[]\n');
    expect(fs.readFileSync(file, 'utf-8')).toBe('[]\n');
    expect(fs.readdirSync(dir)).toEqual(['image-mapping.json']);
  });
  it('restores deleted tracked files from HEAD', () => {
    const f = makeGitFixture({ 'books/b/media/x.svg': 'committed' });
    fs.unlinkSync(path.join(f.root, 'books/b/media/x.svg'));
    restoreFromHead(f.root, ['books/b/media/x.svg']);
    expect(f.read('books/b/media/x.svg')).toBe('committed');
  });
  // X-F9: `--literal-pathspecs` makes a name with `[` a name. As a glob, `CNX_Q[1]` also matches
  // `CNX_Q1`, and the rollback would revert that neighbour's uncommitted edit.
  it('restores only the named file when its name holds glob characters, leaving an edited neighbour alone', () => {
    const named = `books/b/media/CNX_Q[1]${S}.svg`;
    const neighbour = `books/b/media/CNX_Q1${S}.svg`;
    const f = makeGitFixture({ [named]: 'named, committed', [neighbour]: 'neighbour, committed' });
    fs.unlinkSync(path.join(f.root, named));
    f.write(neighbour, 'neighbour, edited and not committed');
    restoreFromHead(f.root, [named]);
    expect(f.read(named)).toBe('named, committed');
    expect(f.read(neighbour)).toBe('neighbour, edited and not committed');
  });
});
