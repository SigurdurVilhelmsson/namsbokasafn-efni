// ⚠️ The HYBRID shape every server/__tests__ file uses: `import` for vitest and
// node builtins (Vitest cannot be require()d at all), `createRequire` for the
// server's own CommonJS modules. Matches importConcepts.test.js:9-14.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
  loadBinEntries,
  chooseEntry,
  inflectionsFor,
  formatInflectionsJson,
} = require('../lib/binInflections');

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

// ⚠️ EVERY ROW BELOW IS INVENTED. `zafl` is not an Icelandic word and the ids
// (9001/9002) and tags (X/Y) are not BÍN's. This matters: the repo is PUBLIC and
// BÍN is CC BY-SA 4.0, so committing real BÍN lines — even two — breaks §C41's
// "no BÍN bytes, test fixtures included". An earlier version of this file used
// two verbatim SHsnid.csv rows; caught by the whole-branch hygiene review.
describe('loadBinEntries', () => {
  // SHsnid layout: lemma;binId;wordClass;register;form;tag
  const ROWS = [
    'zafl;9001;kk;alm;zafl;NFET',
    'zafl;9001;kk;alm;zafli;THGFET',
    'zafl;9002;hk;alm;zafls;EFET',
    'zhverfa;9101;kvk;alm;zhverfa;NFET',
    'zhverfa;9101;kvk;alm;zhverfu;THGFET',
    'zhverfa;9102;so;alm;zhorfinn;LHTHT',
    'zsolo;9201;kvk;alm;zsolo;NFET',
    'zsolo;9201;kvk;alm;zsolu;THGFET',
  ];
  const csv = (name, rows = ROWS) => write(name, rows.join('\n') + '\n');

  it('groups forms per BIN ENTRY, not per lemma', async () => {
    const byLemma = await loadBinEntries(csv('g1.csv'), new Set(['zafl']));
    expect(
      byLemma
        .get('zafl')
        .map((e) => e.binId)
        .sort()
    ).toEqual(['9001', '9002']);
  });

  it("keeps each entry's word class", async () => {
    const byLemma = await loadBinEntries(csv('g2.csv'), new Set(['zafl']));
    expect(
      byLemma
        .get('zafl')
        .map((e) => e.wordClass)
        .sort()
    ).toEqual(['hk', 'kk']);
  });

  // ⚠️ THE DEFECT THIS REPLACES. The old loader unioned every lemma sharing a
  // spelling, so `hverfa` (a kvk noun, "isomer") carried two complete
  // conjugations of the unrelated verb *hverfa*, "to disappear". Spec §2.2.1.
  it('does NOT union two entries’ forms', async () => {
    const byLemma = await loadBinEntries(csv('g3.csv'), new Set(['zafl']));
    const kk = byLemma.get('zafl').find((e) => e.wordClass === 'kk');
    expect([...kk.forms].sort()).toEqual(['zafl', 'zafli']);
    expect([...kk.forms]).not.toContain('zafls');
  });

  it('retains ONLY candidate lemmas', async () => {
    const byLemma = await loadBinEntries(csv('g4.csv'), new Set(['zsolo']));
    expect([...byLemma.keys()]).toEqual(['zsolo']);
  });

  it('keys on the lowercased lemma', async () => {
    const p = csv('g5.csv', ['zAfl;9001;kk;alm;zAfli;NFET']);
    const byLemma = await loadBinEntries(p, new Set(['zafl']));
    expect(byLemma.has('zafl')).toBe(true);
  });

  it('trims whitespace around lemma and form', async () => {
    const p = csv('g6.csv', ['  zafl  ;9001;kk;alm;  zafli  ;NFET']);
    const byLemma = await loadBinEntries(p, new Set(['zafl']));
    expect([...byLemma.get('zafl')[0].forms]).toEqual(['zafli']);
  });

  it('deduplicates identical forms within one entry', async () => {
    const p = csv('g7.csv', ['zafl;9001;kk;alm;zafli;NFET', 'zafl;9001;kk;alm;zafli;EFET']);
    const byLemma = await loadBinEntries(p, new Set(['zafl']));
    expect([...byLemma.get('zafl')[0].forms]).toEqual(['zafli']);
  });

  it('tolerates a missing trailing newline', async () => {
    const p = write('g8.csv', 'zafl;9001;kk;alm;zafli;NFET');
    const byLemma = await loadBinEntries(p, new Set(['zafl']));
    expect(byLemma.get('zafl')).toHaveLength(1);
  });

  it('skips a blank line without refusing the file', async () => {
    const p = write('g9.csv', 'zafl;9001;kk;alm;zafli;NFET\n\n');
    const byLemma = await loadBinEntries(p, new Set(['zafl']));
    expect(byLemma.get('zafl')).toHaveLength(1);
  });

  // Python: `if lemma and form`. Kept.
  it('drops a row with an empty lemma or an empty form', async () => {
    const p = csv('g10.csv', [';9001;kk;alm;zafli;NFET', 'zafl;9001;kk;alm;;NFET']);
    const byLemma = await loadBinEntries(p, new Set(['zafl', '']));
    expect(byLemma.get('zafl')).toBeUndefined();
  });

  // ⚠️ B0's rule: a zero-yield run is refused, not printed. An empty candidate
  // set loads nothing and reports a clean run indistinguishable from "BIN lacks
  // these words".
  it('REFUSES an empty candidate set', async () => {
    await expect(loadBinEntries(csv('g11.csv'), new Set())).rejects.toThrow(/candidate/i);
  });

  // ─── D7's input guard. POSITIVE IDENTIFICATION, both halves. ───────────────
  // ⚠️ Measured 2026-08-10 over the whole 7,425,931-line SHsnid.csv: ZERO rows
  // fail either half, so the guard is provably inert on the supported input.
  // That is what separates a guard from a behaviour change.
  it('REFUSES a 15-field KRISTINsnid row, naming the file confusion', async () => {
    const p = csv('g12.csv', ['zafl;9001;kvk;alm;1;;;;V;zafl;NFET;1;;;']);
    await expect(loadBinEntries(p, new Set(['zafl']))).rejects.toThrow(/15 field|KRISTINsnid/i);
  });

  it('REFUSES a row whose field 2 is not a known word class', async () => {
    const p = csv('g13.csv', ['zafl;9001;xx;alm;zafli;NFET']);
    await expect(loadBinEntries(p, new Set(['zafl']))).rejects.toThrow(/word class/i);
  });

  // ⚠️ REFUSE, NEVER SKIP. The ported loader inherited Python's `len(row) < 5:
  // continue`, which silently drops a malformed row. A wrong file must report as
  // a wrong file — and a lower-bound check would ACCEPT KRISTINsnid and read its
  // field 4, a numeric code, as forms. Corrupt yield reads as data.
  it('refuses a short row rather than skipping it', async () => {
    const p = csv('g14.csv', ['zafl;9001;kk;alm;zafli;NFET', 'zafl;9001;kk']);
    await expect(loadBinEntries(p, new Set(['zafl']))).rejects.toThrow(/3 fields|expected 6/i);
  });

  it('names the offending line number', async () => {
    const p = csv('g15.csv', ['zafl;9001;kk;alm;zafli;NFET', 'zafl;9001;kk']);
    await expect(loadBinEntries(p, new Set(['zafl']))).rejects.toThrow(/:2\b/);
  });
});

const E = (binId, wordClass, forms) => ({ binId, lemma: 'x', wordClass, forms: new Set(forms) });

describe('chooseEntry — D4 and D4.2', () => {
  it('a single entry is unambiguous and is chosen', () => {
    const e = E('1', 'kvk', ['a']);
    expect(chooseEntry([e])).toEqual({ entry: e, outcome: 'unambiguous', discarded: [] });
  });

  // ⚠️ D4's ANCHOR, and the `afl` case: kk + hk, both nouns. The rule is REFUSE
  // ON >1 ENTRY, not on >1 word class — two same-class entries sharing a lemma
  // are still two different words, and picking between them is still guessing.
  it('REFUSES two noun entries — never unions, never picks', () => {
    const r = chooseEntry([E('1', 'kk', ['a']), E('2', 'hk', ['b'])]);
    expect(r.outcome).toBe('refused-ambiguous');
    expect(r.entry).toBeNull();
  });

  it('refuses two entries of the IDENTICAL word class too', () => {
    expect(chooseEntry([E('1', 'kk', ['a']), E('2', 'kk', ['b'])]).outcome).toBe(
      'refused-ambiguous'
    );
  });

  // ⚠️ D4.2's ANCHOR, and the `hverfa` case: kvk + so + so.
  it('RESCUES the sole noun among several entries', () => {
    const noun = E('1', 'kvk', ['a']);
    const r = chooseEntry([noun, E('2', 'so', ['b']), E('3', 'so', ['c'])]);
    expect(r.outcome).toBe('rescued-nominal');
    expect(r.entry).toBe(noun);
  });

  // ⚠️ THE PRICE OF THE D4.2 EXCEPTION. It picks where D4 forbids picking, and
  // is defensible only because a wrong pick stays discoverable after the fact.
  it('names every entry the rescue discarded', () => {
    const r = chooseEntry([E('1', 'kvk', ['a']), E('2', 'so', ['b']), E('3', 'so', ['c'])]);
    expect(r.discarded.map((e) => e.binId).sort()).toEqual(['2', '3']);
  });

  // D4.2 must NOT fire on a genuine adjective headword (spec's `afturkræfur`).
  it('refuses when no entry is a noun', () => {
    const r = chooseEntry([E('1', 'lo', ['a']), E('2', 'ao', ['b'])]);
    expect(r.outcome).toBe('refused-no-noun');
    expect(r.entry).toBeNull();
  });

  // ⚠️ A CONSEQUENCE D4.2 DOES NOT STATE: its noun test fires only on ambiguity,
  // so an UNAMBIGUOUS adjective or verb is written, not refused. Measured on the
  // real corpus: 1,401 of 13,896 unambiguous strings resolve to `lo`, 335 to
  // `so`. That is D4 behaving as written — one entry is not a guess — and it
  // must not be mistaken for the §2.2 contamination during review.
  it('accepts an UNAMBIGUOUS non-noun', () => {
    const r = chooseEntry([E('1', 'lo', ['a'])]);
    expect(r.outcome).toBe('unambiguous');
    expect(r.entry.wordClass).toBe('lo');
  });

  it('treats all three noun genders as nouns', () => {
    for (const g of ['kk', 'kvk', 'hk']) {
      expect(chooseEntry([E('1', g, ['a']), E('2', 'so', ['b'])]).outcome).toBe('rescued-nominal');
    }
  });

  it('refuses when two of the three genders are present', () => {
    const r = chooseEntry([E('1', 'kk', ['a']), E('2', 'kvk', ['b']), E('3', 'so', ['c'])]);
    expect(r.outcome).toBe('refused-ambiguous');
  });
});

describe('inflectionsFor', () => {
  it('excludes the base form', () => {
    expect(inflectionsFor(E('1', 'kk', ['zafl', 'zafli']), 'zafl')).toEqual(['zafli']);
  });

  // Python: `f.lower() != key` — so 'Zafl' goes too.
  it('excludes every case variant of the base form', () => {
    expect(inflectionsFor(E('1', 'kk', ['Zafl', 'zafl', 'zafli']), 'zafl')).toEqual(['zafli']);
  });

  // ⚠️ null, NEVER []. "[]" is a value the Python never emitted and it reads as
  // a word that provably does not inflect, rather than as an absence.
  it('returns null, not [], when only the base form remains', () => {
    expect(inflectionsFor(E('1', 'kk', ['zafl']), 'zafl')).toBeNull();
  });

  it('returns null for an entry with no forms', () => {
    expect(inflectionsFor(E('1', 'kk', []), 'zafl')).toBeNull();
  });

  // ⚠️ CODE-POINT ORDER, matching Python's sorted(). Under Icelandic collation
  // localeCompare puts 'ö' after 'z', which would reorder every accented
  // paradigm and break the differential golden.
  it('sorts by code point, NOT by locale', () => {
    expect(inflectionsFor(E('1', 'kk', ['zafl', 'öfl', 'zzz', 'afli']), 'zafl')).toEqual([
      'afli',
      'zzz',
      'öfl',
    ]);
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
