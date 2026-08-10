// ⚠️ The HYBRID shape every server/__tests__ file uses: `import` for vitest and
// node builtins (Vitest cannot be require()d at all), `createRequire` for the
// server's own CommonJS modules. Matches importConcepts.test.js:9-14.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { loadBinData, getInflections, formatInflectionsJson } = require('../lib/binInflections');

let dir;
const write = (name, body) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, body, 'utf-8');
  return p;
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bin-inf-'));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('loadBinData', () => {
  it('groups forms by lowercased lemma', async () => {
    const p = write('a.csv', 'Zafl;9001;kk;alm;zafli;X\nzafl;9002;hk;alm;zaflið;Y\n');
    const map = await loadBinData(p);
    expect([...map.get('afl')].sort()).toEqual(['afli', 'aflið']);
  });

  // GUARD — unexercised by the real file (0 such rows measured 2026-08-10),
  // so the golden cannot cover it. Python: `if len(row) < 5: continue`.
  it('skips rows with fewer than 5 fields', async () => {
    const p = write('b.csv', 'zafl;9001;kk;alm\nzafl;9001;kk;alm;zafli;X\n');
    const map = await loadBinData(p);
    expect([...map.get('afl')]).toEqual(['afli']);
  });

  // GUARD — Python: `if lemma and form`.
  it('skips rows whose lemma or form is empty', async () => {
    const p = write('c.csv', ';9001;kk;alm;zafli;X\nzafl;9001;kk;alm;;X\nzafl;9001;kk;alm;zafls;X\n');
    const map = await loadBinData(p);
    expect([...map.get('afl')]).toEqual(['afls']);
  });

  // GUARD — Python: `.strip()` on both.
  it('trims whitespace around lemma and form', async () => {
    const p = write('d.csv', '  zafl  ;9001;kk;alm;  zafli  ;X\n');
    const map = await loadBinData(p);
    expect([...map.get('afl')]).toEqual(['afli']);
  });

  // Python stores a SET, so duplicates collapse.
  it('deduplicates identical forms', async () => {
    const p = write('e.csv', 'zafl;9001;kk;alm;zafli;X\nzafl;9002;hk;alm;zafli;Y\n');
    const map = await loadBinData(p);
    expect([...map.get('afl')]).toEqual(['afli']);
  });

  it('tolerates a missing trailing newline', async () => {
    const p = write('f.csv', 'zafl;9001;kk;alm;zafli;X');
    const map = await loadBinData(p);
    expect([...map.get('afl')]).toEqual(['afli']);
  });
});

describe('getInflections', () => {
  const map = new Map([
    ['afl', new Set(['afl', 'afli', 'afls', 'öfl', 'Afl'])],
    ['bara', new Set(['bara'])],
  ]);

  it('returns the forms with the base form removed', () => {
    expect(getInflections(map, 'afl')).toEqual(['afli', 'afls', 'öfl']);
  });

  it('matches case-insensitively on the lookup key', () => {
    expect(getInflections(map, 'AFL')).toEqual(['afli', 'afls', 'öfl']);
  });

  it('removes every case variant of the base form, not just the exact one', () => {
    // Python: `f.lower() != key` — so 'Afl' is dropped alongside 'afl'.
    expect(getInflections(map, 'afl')).not.toContain('Afl');
  });

  // ⚠️ null, NOT []. Both callers branch on it.
  it('returns null for a word BÍN does not have', () => {
    expect(getInflections(map, 'kjarnsækir')).toBeNull();
  });

  it('returns null when the only form IS the base form', () => {
    expect(getInflections(map, 'bara')).toBeNull();
  });

  it('trims the incoming word', () => {
    expect(getInflections(map, '  afl  ')).toEqual(['afli', 'afls', 'öfl']);
  });

  // ⚠️ CODE-POINT ORDER, matching Python's sorted(). localeCompare would put
  // 'öfl' before 'z' under Icelandic collation; code-point order does not.
  it('sorts by code point, NOT by locale', () => {
    const m = new Map([['x', new Set(['zzz', 'öfl', 'afli'])]]);
    expect(getInflections(m, 'x')).toEqual(['afli', 'zzz', 'öfl']);
  });
});

describe('formatInflectionsJson', () => {
  // ⚠️ THE WHOLE POINT: json.dumps separates with ", " and JSON.stringify with ",".
  // Production rows confirm the spaced form, e.g. ["afla", "aflana", ...].
  it('separates items with a comma AND a space, like json.dumps', () => {
    expect(formatInflectionsJson(['a', 'b'])).toBe('["a", "b"]');
  });

  it('does NOT produce JSON.stringify output', () => {
    expect(formatInflectionsJson(['a', 'b'])).not.toBe(JSON.stringify(['a', 'b']));
  });

  // ensure_ascii=False -> raw characters, not \uXXXX escapes.
  it('emits non-ASCII raw', () => {
    expect(formatInflectionsJson(['öfl', 'aflið'])).toBe('["öfl", "aflið"]');
  });

  it('escapes quotes and backslashes as JSON requires', () => {
    expect(formatInflectionsJson(['a"b', 'c\\d'])).toBe('["a\\"b", "c\\\\d"]');
  });

  it('round-trips through JSON.parse', () => {
    const forms = ['öfl', 'a"b'];
    expect(JSON.parse(formatInflectionsJson(forms))).toEqual(forms);
  });

  it('renders a single item without a separator', () => {
    expect(formatInflectionsJson(['a'])).toBe('["a"]');
  });
});
