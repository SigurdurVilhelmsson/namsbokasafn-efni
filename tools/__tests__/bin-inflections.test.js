import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { loadBinData } = require('../lib/bin-inflections.cjs');

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
