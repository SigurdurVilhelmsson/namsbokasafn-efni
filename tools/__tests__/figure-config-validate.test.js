import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateFigureConfig, buildValidatorCorpus } from '../lib/figure-config-validate.js';
import { loadFigureTextConfig } from '../lib/figure-text-config.js';
import { readMappingOrRefuse, isTranslatedName } from '../lib/translated-figure-refs.js';
import { DEFAULT_SUFFIX } from '../generate-image-mapping.js';

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
