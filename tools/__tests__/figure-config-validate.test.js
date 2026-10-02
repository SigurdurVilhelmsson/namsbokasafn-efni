import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateFigureConfig, buildValidatorCorpus } from '../lib/figure-config-validate.js';
import { loadFigureTextConfig } from '../lib/figure-text-config.js';
import { readMappingOrRefuse, isTranslatedName } from '../lib/translated-figure-refs.js';
import { DEFAULT_SUFFIX } from '../generate-image-mapping.js';
import { makeTmpDir, cleanupFixtures } from './helpers/git-fixture.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = 'a reason that says what was ruled and why, long enough (test)';
const S = DEFAULT_SUFFIX;

const baseCfg = () => ({
  editionPrecedence: ['updates-2e', 'first-edition'],
  supersededArtwork: { CNX_Sup: R },
  retiredFigures: { CNX_Ret: R },
  artworkPins: {
    CNX_Pin: { kind: 'alias', edition: 'updates-2e', file: 'OSX/Figure 14_03_Pin.eps', reason: R },
  },
});
const baseCorpus = () => ({
  suffix: S,
  basenamesByBook: {
    chem: new Set(['CNX_Sup', 'CNX_Ret', 'CNX_Pin', 'CNX_Other']),
    bio: new Set(['Figure_1']),
  },
  retiredState: { CNX_Ret: { rows: 0, translatedCopies: [] } },
});
const pinOf = (c) => c.artworkPins.CNX_Pin;

describe('validateFigureConfig (§C140 ㊵, spec D11)', () => {
  it('a valid config passes — the baseline every failing case below differs from by one change', () => {
    expect(validateFigureConfig(baseCfg(), baseCorpus())).toEqual([]);
  });

  it('CONTROL: a pin whose file is named like its OWN figure passes', () => {
    const c = baseCfg();
    pinOf(c).file = 'OSX/CNX_Pin.eps';
    expect(validateFigureConfig(c, baseCorpus())).toEqual([]);
  });

  it.each([
    [
      'a table that is not an object',
      (c) => {
        c.retiredFigures = [];
      },
      null,
      /retiredFigures must be an object/,
    ],
    [
      'two keys in one table that fold together',
      (c) => {
        c.supersededArtwork['CNX-Sup'] = R;
      },
      null,
      /fold to the same key/,
    ],
    [
      'a pin on a superseded figure',
      (c) => {
        c.artworkPins = { CNX_Sup: pinOf(c) };
      },
      null,
      /also in supersededArtwork/,
    ],
    [
      'a pin on a retired figure',
      (c) => {
        c.artworkPins = { CNX_Ret: pinOf(c) };
      },
      null,
      /also in retiredFigures/,
    ],
    [
      'a key that is no book’s image',
      (c) => {
        c.supersededArtwork.CNX_Typo = R;
      },
      null,
      /in 0 books/,
    ],
    [
      'a key two books share',
      () => {},
      (k) => {
        k.basenamesByBook.bio.add('CNX_Sup');
      },
      /in 2 books/,
    ],
    [
      'a key that differs from the image only by case',
      (c) => {
        c.supersededArtwork = { cnx_sup: R };
      },
      null,
      /in 0 books/,
    ],
    [
      'a short reason',
      (c) => {
        c.supersededArtwork.CNX_Sup = 'see §C140 ㊵';
      },
      null,
      /over 40 characters/,
    ],
    [
      'a pin without a reason',
      (c) => {
        delete pinOf(c).reason;
      },
      null,
      /artworkPins\.CNX_Pin needs a reason/,
    ],
    [
      'an unknown pin kind',
      (c) => {
        pinOf(c).kind = 'redirect';
      },
      null,
      /kind must be alias or override/,
    ],
    [
      'a pin edition not in editionPrecedence',
      (c) => {
        pinOf(c).edition = 'third';
      },
      null,
      /not in editionPrecedence/,
    ],
    [
      'a pin path with a .. segment',
      (c) => {
        pinOf(c).file = '../x.eps';
      },
      null,
      /relative path inside its tree/,
    ],
    [
      'an absolute pin path',
      (c) => {
        pinOf(c).file = '/abs/x.eps';
      },
      null,
      /relative path inside its tree/,
    ],
    [
      'a pin to our own translated file',
      (c) => {
        pinOf(c).file = `session/CNX_Pin${S}.pdf`;
      },
      null,
      /our own translated files/,
    ],
    [
      'a pin to another figure’s artwork',
      (c) => {
        pinOf(c).file = 'OSX/CNX_Other.eps';
      },
      null,
      /artwork of another figure, CNX_Other/,
    ],
    [
      'two pins naming one file',
      (c) => {
        c.artworkPins.CNX_Other = { ...pinOf(c) };
      },
      null,
      /name the same file/,
    ],
    [
      'a retired figure that still has its row',
      () => {},
      (k) => {
        k.retiredState.CNX_Ret.rows = 1;
      },
      /still has 1 image-mapping row/,
    ],
    [
      'a retired figure that still has its translated copy',
      () => {},
      (k) => {
        k.retiredState.CNX_Ret.translatedCopies = [`CNX_Ret${S}.svg`];
      },
      /still has a translated copy/,
    ],
  ])('refuses %s', (_label, mutateCfg, mutateCorpus, pattern) => {
    const c = baseCfg();
    const k = baseCorpus();
    mutateCfg(c);
    if (mutateCorpus) mutateCorpus(k);
    expect(validateFigureConfig(c, k).join('\n')).toMatch(pattern);
  });
});

describe('validateFigureConfig — the rest of each rule (§C140 ㊵, spec D11)', () => {
  // The suffix in its other case: a pin to that is as much one of OUR files as the exact name.
  const otherCase = S === S.toLowerCase() ? S.toUpperCase() : S.toLowerCase();

  it('PRECONDITION: the suffix has a letter, so its other case is a different string', () => {
    expect(otherCase).not.toBe(S);
  });

  it.each([
    [
      'a retiredFigures table that is null',
      (c) => {
        c.retiredFigures = null;
      },
      null,
      /retiredFigures must be an object/,
    ],
    [
      'a supersededArtwork table that is null',
      (c) => {
        c.supersededArtwork = null;
      },
      null,
      /supersededArtwork must be an object/,
    ],
    [
      'an artworkPins table that is null',
      (c) => {
        c.artworkPins = null;
      },
      null,
      /artworkPins must be an object/,
    ],
    [
      'a pin that is not an object',
      (c) => {
        c.artworkPins.CNX_Pin = 'x';
      },
      null,
      /artworkPins\.CNX_Pin must be an object/,
    ],
    [
      'a pin with no file',
      (c) => {
        delete pinOf(c).file;
      },
      null,
      /artworkPins\.CNX_Pin\.file must be a non-empty string/,
    ],
    [
      'a pin with an empty file',
      (c) => {
        pinOf(c).file = '';
      },
      null,
      /artworkPins\.CNX_Pin\.file must be a non-empty string/,
    ],
    [
      'a pin file of only spaces',
      (c) => {
        pinOf(c).file = '   ';
      },
      null,
      /artworkPins\.CNX_Pin\.file must be a non-empty string/,
    ],
    [
      'a Windows drive path',
      (c) => {
        pinOf(c).file = 'C:/x.eps';
      },
      null,
      /relative path inside its tree/,
    ],
    [
      'a pin path with a backslash',
      (c) => {
        pinOf(c).file = 'a\\b.eps';
      },
      null,
      /relative path inside its tree/,
    ],
    [
      'a pin path that is a bare dot',
      (c) => {
        pinOf(c).file = '.';
      },
      null,
      /relative path inside its tree/,
    ],
    [
      'a pin to our own translated file, in the suffix’s other case',
      (c) => {
        pinOf(c).file = `session/CNX_Pin${otherCase}.pdf`;
      },
      null,
      /our own translated files/,
    ],
    [
      'a pin whose file only FOLDS onto another figure’s basename',
      (c) => {
        pinOf(c).file = 'OSX/cnx-other.eps';
      },
      null,
      /artwork of another figure, CNX_Other/,
    ],
    [
      'a pin to a figure in another book',
      (c) => {
        pinOf(c).file = 'OSX/Figure_1.eps';
      },
      null,
      /artwork of another figure, Figure_1/,
    ],
    [
      'a pin whose key only FOLDS onto a superseded key',
      (c) => {
        c.artworkPins = { 'cnx-sup': pinOf(c) };
      },
      null,
      /also in supersededArtwork/,
    ],
    [
      'a pin whose key only FOLDS onto a retired key',
      (c) => {
        c.artworkPins = { 'cnx-ret': pinOf(c) };
      },
      null,
      /also in retiredFigures/,
    ],
    [
      'two retiredFigures keys that fold together',
      (c) => {
        c.retiredFigures['CNX-Ret'] = R;
      },
      null,
      /retiredFigures: CNX_Ret and CNX-Ret fold to the same key/,
    ],
    [
      'two artworkPins keys that fold together',
      (c) => {
        c.artworkPins['CNX-Pin'] = { ...pinOf(c), file: 'OSX/A_second_file.eps' };
      },
      null,
      /artworkPins: CNX_Pin and CNX-Pin fold to the same key/,
    ],
    [
      'a reason of exactly 40 characters',
      (c) => {
        c.supersededArtwork.CNX_Sup = 'x'.repeat(40);
      },
      null,
      /over 40 characters/,
    ],
    [
      'a reason that is long only because of its spaces',
      (c) => {
        c.supersededArtwork.CNX_Sup = `short${' '.repeat(60)}`;
      },
      null,
      /over 40 characters/,
    ],
    [
      'a retired figure with a short reason',
      (c) => {
        c.retiredFigures.CNX_Ret = 'short';
      },
      null,
      /retiredFigures\.CNX_Ret needs a reason of over 40 characters/,
    ],
    [
      'two pins naming one file by an unnormalised path',
      (c) => {
        c.artworkPins.CNX_Other = { ...pinOf(c), file: 'OSX/./Figure 14_03_Pin.eps' };
      },
      null,
      /name the same file/,
    ],
    [
      'a pin key that is no book’s image',
      (c) => {
        c.artworkPins.CNX_Typo = { ...pinOf(c), file: 'OSX/A_second_file.eps' };
      },
      null,
      /artworkPins\.CNX_Typo names an image in 0 books/,
    ],
    [
      'a retired figure that is no book’s image, and so has no state',
      (c) => {
        c.retiredFigures.CNX_Gone = R;
      },
      null,
      /retiredFigures\.CNX_Gone names an image in 0 books/,
    ],
  ])('refuses %s', (_label, mutateCfg, mutateCorpus, pattern) => {
    const c = baseCfg();
    const k = baseCorpus();
    mutateCfg(c);
    if (mutateCorpus) mutateCorpus(k);
    expect(validateFigureConfig(c, k).join('\n')).toMatch(pattern);
  });

  it.each([
    [
      'a reason of 41 characters',
      (c) => {
        c.supersededArtwork.CNX_Sup = 'x'.repeat(41);
      },
    ],
    [
      'the same file under ANOTHER edition, which is a different file',
      (c) => {
        c.artworkPins.CNX_Other = { ...pinOf(c), edition: 'first-edition' };
      },
    ],
    [
      'a config with none of the three tables (an absent table is an empty one)',
      (c) => {
        delete c.supersededArtwork;
        delete c.retiredFigures;
        delete c.artworkPins;
      },
    ],
  ])('CONTROL: %s passes', (_label, mutateCfg) => {
    const c = baseCfg();
    mutateCfg(c);
    expect(validateFigureConfig(c, baseCorpus())).toEqual([]);
  });

  // R5: the tables are global and sources.py matches a key after the FOLD, so a key exact in one
  // book that folds onto a differently spelt image in another would be applied to BOTH books' figures
  // at run time — while an exact-match owner rule passed it. Measured: 11 such groups, physics
  // against biology, 0 in chemistry. The rule therefore counts fold owners too.
  const twoBooks = (bio) => ({
    suffix: S,
    basenamesByBook: {
      'edlisfraedi-2e': new Set(['Figure 26_01_02']),
      'liffraedi-2e': new Set([bio]),
    },
    retiredState: { 'Figure 26_01_02': { rows: 0, translatedCopies: [] } },
  });
  const retiredOnly = { editionPrecedence: [], retiredFigures: { 'Figure 26_01_02': R } };

  it('refuses a key exact in one book that FOLDS onto a different spelling in another', () => {
    expect(validateFigureConfig(retiredOnly, twoBooks('Figure_26_01_02')).join('\n')).toMatch(
      /retiredFigures\.Figure 26_01_02 names an image in 1 books' source \(edlisfraedi-2e\); it folds onto a differently spelt image in liffraedi-2e/
    );
  });

  it('CONTROL: the same key passes when the other book holds only a look-alike that does NOT fold', () => {
    expect(validateFigureConfig(retiredOnly, twoBooks('Figure_26_01_03'))).toEqual([]);
  });
});

describe('buildValidatorCorpus on a throwaway books/ tree (§C140 ㊵, spec D11)', () => {
  // These cases run the retiredState branch on a tree built to fail, with a control: a fail-open
  // there would let a half-done retire pass. (The committed config held no retired entry until the
  // retire run of 2026-10-02, so until then the real tree never reached this branch at all.)
  const row = (n) => ({ originalImage: n, outputName: `${n}${S}.svg`, extension: '.svg' });
  const cnxmlOf = (names) =>
    `<document><content>${names
      .map((n) => `<figure id="f-${n}"><media><image src="../../media/${n}.jpg"/></media></figure>`)
      .join('')}</content></document>`;
  const retiredCfg = (...names) => ({
    retiredFigures: Object.fromEntries(names.map((n) => [n, R])),
  });

  /**
   * `books/<slug>/` for each entry: a source CNXML naming `images`, and — only when `media` is
   * given — a media/ directory holding `mapping` (rows, or raw text) and `files` at its top level.
   * Built with fs in test code, never a shell redirect: the project's source-tree guard refuses those.
   * @returns {string} the repo root; cleanupFixtures() removes it
   */
  const makeRepo = (books) => {
    const root = makeTmpDir('figcfg-');
    fs.mkdirSync(path.join(root, 'books'));
    fs.writeFileSync(path.join(root, 'books', 'notes.txt'), 'a plain file, not a book');
    for (const [slug, { images, media }] of Object.entries(books)) {
      const bookDir = path.join(root, 'books', slug);
      fs.mkdirSync(path.join(bookDir, '01-source', 'ch01'), { recursive: true });
      fs.writeFileSync(path.join(bookDir, '01-source', 'ch01', 'm1.cnxml'), cnxmlOf(images));
      if (!media) continue;
      fs.mkdirSync(path.join(bookDir, 'media'));
      const { mapping, files = [] } = media;
      fs.writeFileSync(
        path.join(bookDir, 'media', 'image-mapping.json'),
        typeof mapping === 'string' ? mapping : JSON.stringify(mapping)
      );
      for (const f of files) fs.writeFileSync(path.join(bookDir, 'media', f), '<svg/>');
    }
    return root;
  };

  let cfg;
  let corpus;
  beforeAll(() => {
    // b1: CNX_Row has only its mapping row, CNX_Copy only its top-level copy, CNX_Clean neither;
    //     CNX_Other has both and is NOT retired, so a count that leaks across figures shows.
    // b2: CNX_Shared is also in b1 (two owners); CNX_NoMedia's book has no media directory at all.
    // CNX_Absent is in no book. books/ also holds a plain file, which is not a book.
    const root = makeRepo({
      b1: {
        images: ['CNX_Row', 'CNX_Copy', 'CNX_Clean', 'CNX_Other', 'CNX_Shared'],
        media: {
          mapping: [row('CNX_Row'), row('CNX_Other')],
          files: [`CNX_Copy${S}.svg`, `CNX_Other${S}.svg`],
        },
      },
      b2: { images: ['CNX_Shared', 'CNX_NoMedia'] },
    });
    cfg = retiredCfg('CNX_Row', 'CNX_Copy', 'CNX_Clean', 'CNX_NoMedia', 'CNX_Shared', 'CNX_Absent');
    corpus = buildValidatorCorpus(root, cfg);
  });
  afterAll(cleanupFixtures);

  it('reports a retired figure that still has its mapping row', () => {
    expect(corpus.retiredState.CNX_Row).toEqual({ rows: 1, translatedCopies: [] });
  });

  it('reports a retired figure that still has its top-level translated copy', () => {
    expect(corpus.retiredState.CNX_Copy).toEqual({
      rows: 0,
      translatedCopies: [`CNX_Copy${S}.svg`],
    });
  });

  it('CONTROL: a retired figure with neither a row nor a copy reports nothing', () => {
    expect(corpus.retiredState.CNX_Clean).toEqual({ rows: 0, translatedCopies: [] });
  });

  it('a retired figure in a book with no media directory reports nothing, and does not throw', () => {
    expect(corpus.retiredState.CNX_NoMedia).toEqual({ rows: 0, translatedCopies: [] });
  });

  it('gives no state to a retired key that no book or two books name — the exactly-one-book rule names it', () => {
    expect(Object.keys(corpus.retiredState).sort()).toEqual([
      'CNX_Clean',
      'CNX_Copy',
      'CNX_NoMedia',
      'CNX_Row',
    ]);
  });

  it('carries the suffix the validator compares pins against', () => {
    expect(corpus.suffix).toBe(S);
  });

  it('indexes each book directory, in order, and skips a plain file', () => {
    expect(Object.keys(corpus.basenamesByBook)).toEqual(['b1', 'b2']);
  });

  it('feeds the validator, which names exactly the half-retired and the unresolvable figures', () => {
    const named = validateFigureConfig(cfg, corpus).map((p) => p.split(' ')[0]);
    expect(named.sort()).toEqual([
      'retiredFigures.CNX_Absent',
      'retiredFigures.CNX_Copy',
      'retiredFigures.CNX_Row',
      'retiredFigures.CNX_Shared',
    ]);
  });

  it('refuses a mapping it cannot parse instead of reading it as no rows', () => {
    const root = makeRepo({ b1: { images: ['CNX_Row'], media: { mapping: '{not json' } } });
    expect(() => buildValidatorCorpus(root, retiredCfg('CNX_Row'))).toThrow(/not valid JSON/);
  });
});

describe('the committed figure config (§C140 ㊵)', () => {
  let cfg;
  let corpus;
  beforeAll(() => {
    cfg = loadFigureTextConfig();
    corpus = buildValidatorCorpus(REPO_ROOT, cfg);
  }, 180_000);

  it('passes every rule', () => {
    expect(validateFigureConfig(cfg, corpus)).toEqual([]);
  });

  it('NON-VACUITY: the corpus holds chemistry, and the superseded entries are real', () => {
    expect(corpus.basenamesByBook['efnafraedi-2e'].size).toBeGreaterThan(1000);
    expect(Object.keys(cfg.supersededArtwork).length).toBeGreaterThan(0);
  });

  // `buildValidatorCorpus` skips a key that is not exactly one book's basename, so a green "passes
  // every rule" alone cannot show the retired-state rule looked at each retired figure on the real
  // tree. Every key must have been examined, and each examination must have found the figure gone.
  it('NON-VACUITY: every retired key was examined on the real tree, and found retired', () => {
    const keys = Object.keys(cfg.retiredFigures).sort();
    expect(keys.length).toBeGreaterThan(0);
    expect(Object.keys(corpus.retiredState).sort()).toEqual(keys);
    for (const k of keys) {
      expect(corpus.retiredState[k], k).toEqual({ rows: 0, translatedCopies: [] });
    }
  });

  it("chemistry's mapping rows and its top-level translated copies match one-to-one", () => {
    const bookDir = path.join(REPO_ROOT, 'books', 'efnafraedi-2e');
    const rows = readMappingOrRefuse(path.join(bookDir, 'media', 'image-mapping.json'));
    const files = fs
      .readdirSync(path.join(bookDir, 'media'), { withFileTypes: true })
      .filter((e) => e.isFile() && isTranslatedName(e.name, S))
      .map((e) => e.name)
      .sort();
    expect(rows.length).toBeGreaterThan(600);
    expect(rows.map((r) => r.outputName).sort()).toEqual(files);
  });
});
