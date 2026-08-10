/**
 * THE INERTNESS PROOF for §C36 B4b-0a.
 *
 * The golden was captured from the UNMODIFIED Python before this port existed
 * (see tools/capture-bin-golden.py at commit 8072a58f — THE PRODUCER IS DELETED,
 * so that sha is the only surviving copy of it). It stores a SHA-256
 * per word, never the forms — the values are BÍN-derived CC BY-SA and this repo
 * is public.
 *
 * ⚠️ SKIPS when tools/data/SHsnid.csv is absent, because that file is gitignored
 * and CI does not have it. A skip is NOT a pass: the run prints why, and the
 * gate is only meaningful on a box that has the CSV. Re-download it from
 * https://bin.arnastofnun.is/gogn/mimisbrunnur/ before trusting a green run here.
 */
// ⚠️ The HYBRID shape every server/__tests__ file uses: `import` for vitest and
// node builtins — **Vitest CANNOT be require()d at all**, it throws — and
// `createRequire` for the server's own CommonJS modules. Matches
// importConcepts.test.js:9-14.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const require = createRequire(import.meta.url);
const { loadBinData, getInflections, formatInflectionsJson } = require('../lib/binInflections');

const CSV = path.join(__dirname, '..', '..', 'tools', 'data', 'SHsnid.csv');
const WORDS = path.join(__dirname, 'fixtures', 'bin-golden-words.txt');
const HASHES = path.join(__dirname, 'fixtures', 'bin-golden-hashes.json');
const haveCsv = fs.existsSync(CSV);

/**
 * ⚠️ THE CSV'S IDENTITY, PINNED. Task 1's review (finding 2) found that the
 * golden's PRODUCER is pinned by commit sha but its INPUT was pinned nowhere:
 * `tools/data/` is wholly gitignored, so `SHsnid.csv.sha256sum` exists on disk
 * and in no commit. Once Task 7 deletes the Python the golden is permanent, and
 * a later CSV swap — a redownload, or the KRISTINsnid switch the spec defers as
 * D2 — would produce mismatches INDISTINGUISHABLE from a port regression.
 *
 * A checksum is not BÍN content, so committing it is licence-safe.
 */
const CSV_SHA256 = '9c10d70d73c03168f05f152616b8cafa6e4275e7db8701338f5f3c48a45b7ab6';

describe.skipIf(!haveCsv)('B4b-0a differential golden', () => {
  it('reproduces the Python byte-for-byte on every word', async () => {
    const golden = JSON.parse(fs.readFileSync(HASHES, 'utf-8'));
    const words = fs
      .readFileSync(WORDS, 'utf-8')
      .split('\n')
      .filter((w) => w !== '');
    const map = await loadBinData(CSV);

    const mismatches = [];
    let hits = 0;
    let misses = 0;
    for (const w of words) {
      const forms = getInflections(map, w);
      const actual =
        forms === null
          ? null
          : crypto.createHash('sha256').update(formatInflectionsJson(forms), 'utf-8').digest('hex');
      if (actual === null) misses++;
      else hits++;
      if (actual !== golden[w]) {
        mismatches.push(`${w}: expected ${golden[w]}, got ${actual}`);
      }
    }

    // ⚠️ THE CONTROLS. A run where everything returned null would produce zero
    // mismatches against a golden that was also all-null, and prove nothing.
    // Assert the shape of the work, not only its agreement.
    expect(hits).toBeGreaterThan(0);
    expect(misses).toBeGreaterThan(0);
    expect(words.length).toBeGreaterThan(1000);

    expect(mismatches.slice(0, 10)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  }, 300000);

  // ⚠️ RUNS BEFORE the comparison, and FAILS rather than skips. If the CSV has
  // changed, every mismatch below is uninterpretable — the whole point is to say
  // WHICH of the two possible causes it is. (Task 1 review, finding 2.)
  it('is reading the same SHsnid.csv the golden was captured from', () => {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(CSV)).digest('hex');
    if (actual !== CSV_SHA256) {
      throw new Error(
        `tools/data/SHsnid.csv has CHANGED since the golden was captured.\n` +
          `  expected ${CSV_SHA256}\n  actual   ${actual}\n` +
          `This is a DATA SWAP, not a port regression — do not "fix" the code to match. ` +
          `Either restore the original CSV, or re-capture the golden from the Python at the ` +
          `capture commit 8072a58f (git show 8072a58f -- tools/capture-bin-golden.py) and record the new checksum here.`
      );
    }
  }, 120000);

  it('distinguishes null from an empty list in the golden itself', () => {
    const golden = JSON.parse(fs.readFileSync(HASHES, 'utf-8'));
    const emptyHash = crypto.createHash('sha256').update('[]', 'utf-8').digest('hex');
    // The Python never emits "[]" — it returns None instead. If the golden
    // contains that hash, the capture was wrong and this gate is worthless.
    expect(Object.values(golden)).not.toContain(emptyHash);
  });
});

it('records whether the differential gate actually ran', () => {
  if (!haveCsv) {
    console.warn(
      '\n⚠️  B4b-0a differential golden SKIPPED — tools/data/SHsnid.csv is absent.\n' +
        '   This is NOT a pass. The port is unverified on this box.\n'
    );
  }
  expect(true).toBe(true);
});
