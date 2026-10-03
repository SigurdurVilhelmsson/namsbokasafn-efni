import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validateFigureConfig,
  buildValidatorCorpus,
  HELD_SCRIPT_CHARS,
} from '../lib/figure-config-validate.js';
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
  keptCopies: { CNX_Kept: R },
  artworkPins: {
    CNX_Pin: { kind: 'alias', edition: 'updates-2e', file: 'OSX/Figure 14_03_Pin.eps', reason: R },
  },
});
const baseCorpus = () => ({
  suffix: S,
  basenamesByBook: {
    chem: new Set(['CNX_Sup', 'CNX_Ret', 'CNX_Kept', 'CNX_Pin', 'CNX_Other']),
    bio: new Set(['Figure_1']),
  },
  retiredState: { CNX_Ret: { rows: 0, translatedCopies: [] } },
  keptState: { CNX_Kept: { rows: 1, translatedCopies: [`CNX_Kept${S}.svg`] } },
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
    // §C140 ㊾ — keptCopies, the inverse of retiredFigures (spec 2026-10-02 D1).
    [
      'a keptCopies table that is not an object',
      (c) => {
        c.keptCopies = [];
      },
      null,
      /keptCopies must be an object/,
    ],
    [
      'a pin on a kept figure',
      (c) => {
        c.artworkPins = { CNX_Kept: pinOf(c) };
      },
      null,
      /artworkPins\.CNX_Kept is also in keptCopies \(CNX_Kept\)/,
    ],
    [
      'a kept figure that is also retired',
      (c) => {
        c.retiredFigures.CNX_Kept = R;
      },
      null,
      /keptCopies\.CNX_Kept is also in retiredFigures \(CNX_Kept\)/,
    ],
    [
      'a kept figure with no image-mapping row',
      () => {},
      (k) => {
        k.keptState.CNX_Kept.rows = 0;
      },
      /keptCopies\.CNX_Kept has no image-mapping row/,
    ],
    [
      'a kept figure with no translated copy',
      () => {},
      (k) => {
        k.keptState.CNX_Kept.translatedCopies = [];
      },
      /keptCopies\.CNX_Kept has no translated copy/,
    ],
    [
      'a kept key that is no book’s image',
      (c) => {
        c.keptCopies.CNX_Typo = R;
      },
      null,
      /keptCopies\.CNX_Typo names an image in 0 books/,
    ],
    [
      'a kept figure with a short reason',
      (c) => {
        c.keptCopies.CNX_Kept = 'kept, see §C140';
      },
      null,
      /keptCopies\.CNX_Kept needs a reason of over 40 characters/,
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
    [
      'a keptCopies table that is null',
      (c) => {
        c.keptCopies = null;
      },
      null,
      /keptCopies must be an object/,
    ],
    [
      'a pin whose key only FOLDS onto a kept key',
      (c) => {
        c.artworkPins = { 'cnx-kept': pinOf(c) };
      },
      null,
      /artworkPins\.cnx-kept is also in keptCopies \(CNX_Kept\)/,
    ],
    [
      'a kept key that only FOLDS onto a retired key',
      (c) => {
        c.retiredFigures['cnx-kept'] = R;
      },
      null,
      /keptCopies\.CNX_Kept is also in retiredFigures \(cnx-kept\)/,
    ],
    [
      'two keptCopies keys that fold together',
      (c) => {
        c.keptCopies['CNX-Kept'] = R;
      },
      null,
      /keptCopies: CNX_Kept and CNX-Kept fold to the same key/,
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
      'a config with none of the four tables (an absent table is an empty one)',
      (c) => {
        delete c.supersededArtwork;
        delete c.retiredFigures;
        delete c.keptCopies;
        delete c.artworkPins;
      },
    ],
    // §C140 ㊾ — ALLOWED, as retired + superseded is (BlastFurn, Ques11ans): superseded is about the
    // SOURCE drawing, kept about the translated COPY. sources.py checks kept first, so the run
    // prints `REFUSED — kept` and the chapter autorun's halt on `REFUSED — superseded` stays quiet.
    [
      'a kept figure that is also superseded',
      (c) => {
        c.supersededArtwork.CNX_Kept = R;
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

// ─────────────────────────────────────────────────────────────────────────────────────────
// §C140 ㊾ D5(a) — heldBlockValues: {basename: {blockKey: value}}, [USER]'s wording for labels the
// MT is never sent (design docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-
// design.md, D-g). Its values are OBJECTS, not reason strings, so it stays out of TABLES and the
// generic reason rule (Review Focus 5); it shares only the type, fold and exactly-one-book loops.
// CNX_Other is chem's image in no other table, so baseCfg()/baseCorpus() stay exactly as Part 1
// left them: every case here ADDS the table and its state. Values are ASCII sentinels (QZX, QZQ).
const heldCfg = () => ({
  ...baseCfg(),
  heldBlockValues: { CNX_Other: { No: 'QZX', 'C|H or R': 'C\nQZX R' } },
});
const heldCorpus = () => ({
  ...baseCorpus(),
  heldState: {
    CNX_Other: {
      rows: 1,
      translatedCopies: [`CNX_Other${S}.svg`],
      svgRows: 1,
      sidecarKeys: null,
    },
  },
});
const heldOf = (c) => c.heldBlockValues.CNX_Other;

describe('validateFigureConfig — heldBlockValues (§C140 ㊾ D5(a))', () => {
  it('a valid held table passes — the baseline every failing case below differs from by one change', () => {
    expect(validateFigureConfig(heldCfg(), heldCorpus())).toEqual([]);
  });

  it.each([
    [
      'a heldBlockValues table that is not an object',
      (c) => {
        c.heldBlockValues = [];
      },
      null,
      /heldBlockValues must be an object/,
    ],
    [
      'a heldBlockValues table that is null',
      (c) => {
        c.heldBlockValues = null;
      },
      null,
      /heldBlockValues must be an object/,
    ],
    [
      'two held figures that fold together',
      (c) => {
        c.heldBlockValues['CNX-Other'] = { No: 'QZX' };
      },
      null,
      /heldBlockValues: CNX_Other and CNX-Other fold to the same key/,
    ],
    [
      'a held figure that is no book’s image',
      (c) => {
        c.heldBlockValues.CNX_Typo = { No: 'QZX' };
      },
      null,
      /heldBlockValues\.CNX_Typo names an image in 0 books/,
    ],
    [
      'a held figure two books share',
      () => {},
      (k) => {
        k.basenamesByBook.bio.add('CNX_Other');
      },
      /heldBlockValues\.CNX_Other names an image in 2 books/,
    ],
    [
      'a held entry that is a string, not an object of values',
      (c) => {
        c.heldBlockValues.CNX_Other = 'QZX';
      },
      null,
      'heldBlockValues.CNX_Other must be a non-empty object of {blockKey: value}',
    ],
    [
      'a held entry that is an array',
      (c) => {
        c.heldBlockValues.CNX_Other = ['QZX'];
      },
      null,
      'heldBlockValues.CNX_Other must be a non-empty object of {blockKey: value}',
    ],
    [
      'a held entry with no values',
      (c) => {
        c.heldBlockValues.CNX_Other = {};
      },
      null,
      'heldBlockValues.CNX_Other must be a non-empty object of {blockKey: value}',
    ],
    [
      'an empty block key',
      (c) => {
        heldOf(c)[''] = 'QZX';
      },
      null,
      'heldBlockValues.CNX_Other: a block key must be a non-empty string',
    ],
    [
      'a value that is not a string',
      (c) => {
        heldOf(c).No = 5;
      },
      null,
      'heldBlockValues.CNX_Other[No] must be a non-empty string',
    ],
    [
      'an empty value',
      (c) => {
        heldOf(c).No = '';
      },
      null,
      'heldBlockValues.CNX_Other[No] must be a non-empty string',
    ],
    [
      "a value holding '|', the KEY's line notation",
      (c) => {
        heldOf(c).No = 'QZX|QZQ';
      },
      null,
      "heldBlockValues.CNX_Other[No] contains '|' — a value's lines are separated by a newline; '|' is the KEY's notation",
    ],
    [
      'a value with an empty line',
      (c) => {
        heldOf(c)['C|H or R'] = 'C\n';
      },
      null,
      'heldBlockValues.CNX_Other[C|H or R] has an empty line, or a line with leading or trailing whitespace',
    ],
    [
      'a value line with leading whitespace',
      (c) => {
        heldOf(c).No = ' QZX';
      },
      null,
      'heldBlockValues.CNX_Other[No] has an empty line, or a line with leading or trailing whitespace',
    ],
    [
      'a value line with trailing whitespace',
      (c) => {
        heldOf(c)['C|H or R'] = 'C \nQZX R';
      },
      null,
      'heldBlockValues.CNX_Other[C|H or R] has an empty line, or a line with leading or trailing whitespace',
    ],
    [
      'a value with more lines than its key has source lines',
      (c) => {
        heldOf(c).No = 'QZX\nQZQ';
      },
      null,
      'heldBlockValues.CNX_Other[No] has 2 lines but its key has 1 source lines',
    ],
    [
      'a superscript parenthesis, outside the 24 script characters',
      (c) => {
        heldOf(c).No = 'QZX⁽';
      },
      null,
      'heldBlockValues.CNX_Other[No] uses ⁽ (U+207D), which is not a sub/superscript a held value can draw',
    ],
    [
      'a subscript letter, from the top of the U+2070–U+209F block',
      (c) => {
        heldOf(c).No = 'Qₐ';
      },
      null,
      'heldBlockValues.CNX_Other[No] uses ₐ (U+2090), which is not a sub/superscript a held value can draw',
    ],
    [
      'a value equal to its key, line for line',
      (c) => {
        heldOf(c)['C|H or R'] = 'C\nH or R';
      },
      null,
      'heldBlockValues.CNX_Other[C|H or R] equals its key — it draws nothing new',
    ],
    [
      "a key holding the value sheet's Markdown escape '\\|'",
      (c) => {
        delete heldOf(c)['C|H or R'];
        heldOf(c)['C\\|H or R'] = 'C\nQZX R';
      },
      null,
      "heldBlockValues.CNX_Other: the key C\\|H or R holds '\\|', a Markdown escape — copy the bare '|'",
    ],
    [
      'a held figure that is also superseded',
      (c) => {
        c.supersededArtwork.CNX_Other = R;
      },
      null,
      'heldBlockValues.CNX_Other is also in supersededArtwork (CNX_Other) — that figure is never composed, so its values are never drawn',
    ],
    [
      'a held figure that is also retired',
      (c) => {
        c.retiredFigures.CNX_Other = R;
      },
      null,
      'heldBlockValues.CNX_Other is also in retiredFigures (CNX_Other) — that figure is never composed',
    ],
    [
      'a held figure that is also kept',
      (c) => {
        c.keptCopies.CNX_Other = R;
      },
      null,
      'heldBlockValues.CNX_Other is also in keptCopies (CNX_Other) — that figure is never composed',
    ],
    [
      'a held figure that only FOLDS onto a superseded key',
      (c) => {
        c.supersededArtwork['cnx-other'] = R;
      },
      null,
      'heldBlockValues.CNX_Other is also in supersededArtwork (cnx-other)',
    ],
    [
      'a held figure with no image-mapping row naming an .svg',
      () => {},
      (k) => {
        k.heldState.CNX_Other.svgRows = 0;
      },
      'heldBlockValues.CNX_Other has no image-mapping row naming an .svg — no run recomposes it',
    ],
    [
      'a held figure with no translated copy',
      () => {},
      (k) => {
        k.heldState.CNX_Other.translatedCopies = [];
      },
      "heldBlockValues.CNX_Other has no translated copy at the top of its book's media/",
    ],
    [
      'a held key that is a bought block in the figure’s sidecar',
      () => {},
      (k) => {
        k.heldState.CNX_Other.sidecarKeys = ['k9', 'No'];
      },
      'heldBlockValues.CNX_Other[No] is a bought block in figure-text/CNX_Other.is.json — edit its value there (figure review), not here',
    ],
  ])('refuses %s', (_label, mutateCfg, mutateCorpus, pattern) => {
    const c = heldCfg();
    const k = heldCorpus();
    mutateCfg(c);
    if (mutateCorpus) mutateCorpus(k);
    expect(validateFigureConfig(c, k).join('\n')).toMatch(pattern);
  });

  it.each([
    [
      'an absent heldBlockValues table (an absent table is an empty one)',
      (c) => {
        delete c.heldBlockValues;
      },
      () => {},
    ],
    [
      'an empty heldBlockValues table',
      (c) => {
        c.heldBlockValues = {};
      },
      () => {},
    ],
    // A pinned figure IS composed (the pin chooses its artwork), so its values are drawn.
    [
      'a held figure that is also pinned',
      (c) => {
        c.heldBlockValues = { CNX_Pin: { No: 'QZX' } };
      },
      (k) => {
        k.heldState = { CNX_Pin: k.heldState.CNX_Other };
      },
    ],
    [
      'a 3-line value on a 3-line key',
      (c) => {
        heldOf(c)['4+|To|4-'] = '4+\nQZQ\n4-';
      },
      () => {},
    ],
    // buffer's shape: two FT.lines that are ONE visual line. The CI bound is an upper bound only;
    // compose.py refuses `line-count` against the visual lines it measures.
    [
      'a 1-line value on a 2-line key',
      (c) => {
        heldOf(c)['[CH3CO2H] is 11% of [CH3CO2|-]'] = 'QZX';
      },
      () => {},
    ],
    [
      'a value using all 24 script characters, an en dash and spaces',
      (c) => {
        heldOf(c).No = 'QZX – ₀₁₂₃₄₅₆₇₈₉₊₋⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻';
      },
      () => {},
    ],
    [
      'a sidecar whose bought blocks are other keys',
      () => {},
      (k) => {
        k.heldState.CNX_Other.sidecarKeys = ['k0', 'k1'];
      },
    ],
  ])('CONTROL: %s passes', (_label, mutateCfg, mutateCorpus) => {
    const c = heldCfg();
    const k = heldCorpus();
    mutateCfg(c);
    mutateCorpus(k);
    expect(validateFigureConfig(c, k)).toEqual([]);
  });

  // Part 1's fixtures carry no heldState, and a config with no table must still pass them.
  it('CONTROL: a corpus with no heldState at all, as Part 1 builds it, passes an empty table', () => {
    expect(validateFigureConfig({ ...baseCfg(), heldBlockValues: {} }, baseCorpus())).toEqual([]);
  });

  // 🔴 A SECOND IMPLEMENTATION of experiments/figure-text-translation/heldvalues.py's
  // HELD_SCRIPT_CHARS. Both tests pin the same literal (the normkey / test_sources precedent), and
  // this one pins it code point by code point too, so a look-alike glyph cannot pass.
  it('HELD_SCRIPT_CHARS is the 24-character literal heldvalues.py pins, in its order', () => {
    expect(HELD_SCRIPT_CHARS).toBe('₀₁₂₃₄₅₆₇₈₉₊₋⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻');
    expect([...HELD_SCRIPT_CHARS].map((ch) => ch.codePointAt(0))).toEqual([
      0x2080, 0x2081, 0x2082, 0x2083, 0x2084, 0x2085, 0x2086, 0x2087, 0x2088, 0x2089, 0x208a,
      0x208b, 0x2070, 0x00b9, 0x00b2, 0x00b3, 0x2074, 0x2075, 0x2076, 0x2077, 0x2078, 0x2079,
      0x207a, 0x207b,
    ]);
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

  // §C140 ㊾ — a kept figure is measured exactly as a retired one is, and must come out the other
  // way round: WITH its row and its copy. The tree holds each half alone, both, and neither, plus a
  // key no book names, so a rule that checked only one half, or only one figure, would show.
  it('reports each kept figure’s rows and copies, and the validator names each half-kept one', () => {
    const root = makeRepo({
      b1: {
        images: ['CNX_Kept', 'CNX_NoRow', 'CNX_NoCopy', 'CNX_Neither'],
        media: {
          mapping: [row('CNX_Kept'), row('CNX_NoCopy')],
          files: [`CNX_Kept${S}.svg`, `CNX_NoRow${S}.svg`],
        },
      },
    });
    const keptCfg = {
      keptCopies: Object.fromEntries(
        ['CNX_Kept', 'CNX_NoRow', 'CNX_NoCopy', 'CNX_Neither', 'CNX_Absent'].map((n) => [n, R])
      ),
    };
    const k = buildValidatorCorpus(root, keptCfg);
    expect(k.keptState).toEqual({
      CNX_Kept: { rows: 1, translatedCopies: [`CNX_Kept${S}.svg`] },
      CNX_NoRow: { rows: 0, translatedCopies: [`CNX_NoRow${S}.svg`] },
      CNX_NoCopy: { rows: 1, translatedCopies: [] },
      CNX_Neither: { rows: 0, translatedCopies: [] },
    });
    const named = validateFigureConfig(keptCfg, k).map((p) => p.split(' ').slice(0, 4).join(' '));
    expect(named.sort()).toEqual([
      'keptCopies.CNX_Absent names an image',
      'keptCopies.CNX_Neither has no image-mapping',
      'keptCopies.CNX_Neither has no translated',
      'keptCopies.CNX_NoCopy has no translated',
      'keptCopies.CNX_NoRow has no image-mapping',
    ]);
  });

  // §C140 ㊾ D5(a) — heldState is Part 1's copyState, plus the two facts only a held figure needs:
  // how many of its mapping rows name an `.svg` (what a recompose and the sidecar publish both
  // need; a `.png` copy still counts as a translated copy) and its sidecar's bought keys, read
  // STRICTLY — absent is null, anything unreadable throws, never the lenient readSidecar.
  const heldTree = () => {
    const root = makeRepo({
      b1: {
        images: ['CNX_Svg', 'CNX_Png', 'CNX_Bare'],
        media: {
          mapping: [
            row('CNX_Svg'),
            { originalImage: 'CNX_Png', outputName: `CNX_Png${S}.png`, extension: '.png' },
          ],
          files: [`CNX_Svg${S}.svg`, `CNX_Png${S}.png`],
        },
      },
    });
    fs.mkdirSync(path.join(root, 'books', 'b1', 'figure-text'));
    return root;
  };
  const writeSidecarRaw = (root, basename, text) =>
    fs.writeFileSync(path.join(root, 'books', 'b1', 'figure-text', `${basename}.is.json`), text);
  const heldTreeCfg = {
    heldBlockValues: {
      CNX_Svg: { No: 'QZX', 'C|H or R': 'C\nQZX R' },
      CNX_Png: { No: 'QZX' },
      CNX_Bare: { No: 'QZX' },
      CNX_Absent: { No: 'QZX' },
    },
  };

  it('reports each held figure’s .svg rows and bought keys, and the validator names each gap', () => {
    const root = heldTree();
    writeSidecarRaw(
      root,
      'CNX_Svg',
      JSON.stringify({ version: 1, basename: 'CNX_Svg', blocks: { No: 'IS No', k1: 'IS k1' } })
    );
    const k = buildValidatorCorpus(root, heldTreeCfg);
    expect(k.heldState).toEqual({
      CNX_Svg: {
        rows: 1,
        translatedCopies: [`CNX_Svg${S}.svg`],
        svgRows: 1,
        sidecarKeys: ['No', 'k1'],
      },
      CNX_Png: { rows: 1, translatedCopies: [`CNX_Png${S}.png`], svgRows: 0, sidecarKeys: null },
      CNX_Bare: { rows: 0, translatedCopies: [], svgRows: 0, sidecarKeys: null },
    });
    const named = validateFigureConfig(heldTreeCfg, k).map((p) =>
      p.split(' ').slice(0, 4).join(' ')
    );
    expect(named.sort()).toEqual([
      'heldBlockValues.CNX_Absent names an image',
      'heldBlockValues.CNX_Bare has no image-mapping',
      'heldBlockValues.CNX_Bare has no translated',
      'heldBlockValues.CNX_Png has no image-mapping',
      'heldBlockValues.CNX_Svg[No] is a bought',
    ]);
  });

  it('refuses a held figure’s sidecar it cannot parse instead of reading it as no bought keys', () => {
    const root = heldTree();
    writeSidecarRaw(root, 'CNX_Svg', '{not json');
    expect(() => buildValidatorCorpus(root, heldTreeCfg)).toThrow(
      /CNX_Svg\.is\.json.*not valid JSON/
    );
  });

  // Only ENOENT means "nothing bought". A path that exists and cannot be read is not absent.
  it('refuses a held figure’s sidecar path it cannot read, instead of reading it as absent', () => {
    const root = heldTree();
    fs.mkdirSync(path.join(root, 'books', 'b1', 'figure-text', 'CNX_Svg.is.json'));
    expect(() => buildValidatorCorpus(root, heldTreeCfg)).toThrow(
      /CNX_Svg\.is\.json cannot be read \(EISDIR\)/
    );
  });

  it('refuses a held figure’s sidecar that carries no blocks object', () => {
    const root = heldTree();
    writeSidecarRaw(root, 'CNX_Svg', JSON.stringify({ version: 1, basename: 'CNX_Svg' }));
    expect(() => buildValidatorCorpus(root, heldTreeCfg)).toThrow(/CNX_Svg\.is\.json.*blocks/);
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

  // §C140 ㊾ — the retired test above, the other way round: every kept key was examined on the real
  // tree, and each was found WITH its row and its copy. Vacuous while the table is empty; the
  // commit that records the first kept figure adds `expect(keys.length).toBeGreaterThan(0)` here,
  // as the retired test carries.
  it('every kept key was examined on the real tree, and found with its row and its copy', () => {
    const keys = Object.keys(cfg.keptCopies ?? {}).sort();
    expect(Object.keys(corpus.keptState).sort()).toEqual(keys);
    for (const k of keys) {
      expect(corpus.keptState[k].rows, k).toBeGreaterThan(0);
      expect(corpus.keptState[k].translatedCopies.length, k).toBeGreaterThan(0);
    }
  });

  // §C140 ㊾ D5(a) — every held figure was examined on the real tree, and each was found with an
  // `.svg` row and a translated copy, and none of its keys is a bought block. Vacuous while the
  // table is empty; the commit that records [USER]'s first values (PR-B) adds
  // `expect(keys.length).toBeGreaterThan(0)` here, as the retired test carries.
  it('every held figure was examined on the real tree, with an .svg row, a copy and no bought key', () => {
    const keys = Object.keys(cfg.heldBlockValues ?? {}).sort();
    expect(Object.keys(corpus.heldState).sort()).toEqual(keys);
    for (const k of keys) {
      expect(corpus.heldState[k].svgRows, k).toBeGreaterThan(0);
      expect(corpus.heldState[k].translatedCopies.length, k).toBeGreaterThan(0);
      const bought = new Set(corpus.heldState[k].sidecarKeys ?? []);
      expect(
        Object.keys(cfg.heldBlockValues[k]).filter((b) => bought.has(b)),
        k
      ).toEqual([]);
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
