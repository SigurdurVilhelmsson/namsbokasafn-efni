// server/__tests__/servedText.test.js
//
// G1.1 (spec §5.3, §5.4, §11; T2's parity half): the one hash of served text, and the books
// for which no served version is ever minted. Reads the committed layer-2 change records under
// books/ and writes nothing.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { buildChangeRecord } from '../../tools/lib/mt-layers.js';

const require = createRequire(import.meta.url);
const { sha256Text, NOT_MINTED_BOOKS, isNotMintedBook } = require('../lib/servedText');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAYER2 = path.join(__dirname, '..', '..', 'books', 'efnafraedi-2e', '02-mt-revised');

function committedChanges() {
  const out = [];
  for (const ch of fs.readdirSync(LAYER2)) {
    for (const f of fs.readdirSync(path.join(LAYER2, ch))) {
      if (!f.endsWith('-changes.jsonl')) continue;
      for (const line of fs.readFileSync(path.join(LAYER2, ch, f), 'utf8').split('\n')) {
        if (line) out.push({ ch, ...JSON.parse(line) });
      }
    }
  }
  return out;
}
const keyOf = (c) => `${c.ch}/${c.module}/${c.segmentId}#${c.occurrence}/${c.opId}`;

describe('sha256Text (spec §5.3)', () => {
  it('is the full lowercase hex sha256 of the UTF-8 string', () => {
    expect(sha256Text('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    // a committed beforeSha256 (ch02/chapter-metadata-changes.jsonl, line 1)
    expect(sha256Text('Frumeindir, sameindir og jónir')).toBe(
      'd50117206503094ecb8ea8b926f9daf663ab1dc91e0e347afff60fbefde80039'
    );
  });
  it('refuses anything that is not a string', () => {
    expect(() => sha256Text(undefined)).toThrow(TypeError);
    expect(() => sha256Text(Buffer.from('a'))).toThrow(TypeError);
  });
});

describe('T2, parity half: sha256Text is the change records’ hash', () => {
  it('equals buildChangeRecord(...).beforeSha256', () => {
    for (const before of ['Frumeindir, sameindir og jónir', 'ð þ æ ö „gæsalappir“', 'á b']) {
      const rec = buildChangeRecord({
        module: 'm68662',
        segmentId: 'm68662:para:pref-p-009',
        occurrence: 0,
        opId: 't.op1',
        source: 'rule',
        ruleId: 'r1',
        category: 'term',
        find: before,
        replace: `${before}!`,
        before,
        after: `${before}!`,
        runId: null,
      });
      expect(sha256Text(before)).toBe(rec.beforeSha256);
    }
  });
  it('equals every committed beforeSha256 in layer 2; a one-character change does not', () => {
    const all = committedChanges();
    expect(all.map(keyOf)).toContain(
      'ch02/chapter-metadata/chapter:title:ch02#0/ch02/chapter-metadata/001.op1'
    );
    expect(all.filter((c) => sha256Text(c.before) !== c.beforeSha256).map(keyOf)).toEqual([]);
    const planted = { ...all[0], before: `${all[0].before} ` };
    expect([planted].filter((c) => sha256Text(c.before) !== c.beforeSha256).map(keyOf)).toEqual([
      keyOf(planted),
    ]);
  });
});

describe('the not-minted books (CLAUDE.md § Organic; spec §5.4)', () => {
  it('lists organic and nothing else, frozen', () => {
    expect([...NOT_MINTED_BOOKS]).toEqual(['lifraen-efnafraedi']);
    expect(Object.isFrozen(NOT_MINTED_BOOKS)).toBe(true);
  });
  it('isNotMintedBook', () => {
    expect([isNotMintedBook('lifraen-efnafraedi'), isNotMintedBook('efnafraedi-2e')]).toEqual([
      true,
      false,
    ]);
  });
});
