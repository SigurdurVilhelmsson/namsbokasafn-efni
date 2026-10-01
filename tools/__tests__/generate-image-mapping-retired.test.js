/**
 * §C140 ㊵ — the generator's FILE-READING half honours retiredFigures. The config reader is
 * mocked so the test can name a retired figure without editing the committed config; the
 * explicit-set and control cases show the mock is what decides.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('../lib/figure-text-config.js', () => ({ loadRetiredFigures: vi.fn(() => new Set()) }));

import { loadRetiredFigures } from '../lib/figure-text-config.js';
import {
  generateImageMapping,
  _setTestBooksDir,
  DEFAULT_SUFFIX,
} from '../generate-image-mapping.js';

const S = DEFAULT_SUFFIX;

// Each fixture tree is removed after its test, so a run leaves nothing behind in tmp.
const made = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A book where a row-only retire has happened: CNX_A's row is gone, its translated copy is not. */
function rowOnlyRetire() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genmap-retired-'));
  made.push(root);
  const book = path.join(root, 'books', 'b');
  fs.mkdirSync(path.join(book, '01-source', 'ch01'), { recursive: true });
  fs.mkdirSync(path.join(book, 'media'), { recursive: true });
  fs.writeFileSync(
    path.join(book, '01-source', 'ch01', 'm1.cnxml'),
    '<document><figure id="f1"><media><image src="../../media/CNX_A.jpg"/></media></figure>' +
      '<figure id="f2"><media><image src="../../media/CNX_B.jpg"/></media></figure></document>'
  );
  for (const n of ['CNX_A', 'CNX_B']) {
    fs.writeFileSync(path.join(book, 'media', `${n}${S}.svg`), '<svg/>');
  }
  fs.writeFileSync(
    path.join(book, 'media', 'image-mapping.json'),
    JSON.stringify(
      [{ originalImage: 'CNX_B', outputName: `CNX_B${S}.svg`, extension: '.svg' }],
      null,
      2
    ) + '\n'
  );
  _setTestBooksDir(path.join(root, 'books'));
  return book;
}

describe('generateImageMapping honours retiredFigures (§C140 ㊵)', () => {
  beforeEach(() => loadRetiredFigures.mockReset());

  it('reads the retired set from the figure config, and skips it', () => {
    rowOnlyRetire();
    loadRetiredFigures.mockReturnValue(new Set(['CNX_A']));
    const r = generateImageMapping({ book: 'b', dryRun: true });
    expect(loadRetiredFigures).toHaveBeenCalledTimes(1);
    expect(r.merged.map((e) => e.originalImage)).toEqual(['CNX_B']);
    expect(r.skippedRetired).toEqual([`CNX_A${S}.svg`]);
  });

  it('CONTROL: with nothing retired, the row a row-only retire removed comes back', () => {
    rowOnlyRetire();
    loadRetiredFigures.mockReturnValue(new Set());
    expect(
      generateImageMapping({ book: 'b', dryRun: true }).merged.map((e) => e.originalImage)
    ).toEqual(['CNX_B', 'CNX_A']);
  });

  it('an explicit retired set is used instead of the config', () => {
    rowOnlyRetire();
    const r = generateImageMapping({ book: 'b', dryRun: true, retired: new Set(['CNX_A']) });
    expect(loadRetiredFigures).not.toHaveBeenCalled();
    expect(r.skippedRetired).toEqual([`CNX_A${S}.svg`]);
  });

  it('a dry run writes nothing', () => {
    const book = rowOnlyRetire();
    const file = path.join(book, 'media', 'image-mapping.json');
    const before = fs.readFileSync(file);
    loadRetiredFigures.mockReturnValue(new Set());
    generateImageMapping({ book: 'b', dryRun: true });
    expect(fs.readFileSync(file)).toEqual(before);
  });
});
