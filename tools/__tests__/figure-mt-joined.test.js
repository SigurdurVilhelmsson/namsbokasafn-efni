/**
 * §C140 ㉔ — the joined figure-label arm ([USER] ruling 2026-09-15, spec
 * docs/superpowers/specs/2026-09-18-c140-c24-joined-label-mt-design.md).
 *
 * ⚠️ NO NETWORK, EVER — `main` takes its API pair as a parameter and every test injects a stub.
 * ⚠️ Lives in `tools/__tests__/` though the module is in `experiments/`, for the reason
 * `figure-mt-glossary.test.js` states.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  formulaGuard,
  splitJoined,
  selectWording,
  joinable,
  wireChars,
  main,
} from '../../experiments/figure-text-translation/translate-blocks.mjs';

describe('formulaGuard — measured 0/501 on the 2026-09-15 answers', () => {
  it('passes the decimal comma: separators are ignored, digits are not', () => {
    expect(
      formulaGuard('formed by the reaction of 12.85 g of', 'myndað við hvarf 12,85 g af')
    ).toEqual([]);
  });
  it('passes the ruled mol → mól localisation (not a formula token)', () => {
    expect(
      formulaGuard("Multiply by Avogadro's number (mol–1)", 'Margfaldið með tölu Avogadros (mól–1)')
    ).toEqual([]);
  });
  it('passes a formula kept verbatim', () => {
    expect(formulaGuard('required to react with H2O', 'sem þarf til að hvarfast við H2O')).toEqual(
      []
    );
  });
  it('fires on a transposed digit', () => {
    expect(formulaGuard('12.85 g', '12,58 g')).toContain('digits');
  });
  it('fires on a dropped digit', () => {
    expect(formulaGuard('9.55 g of', '9,5 g af')).toContain('digits');
  });
  it('fires on a new subscript — the alt-probe damage — and a subscript is NOT the digit 2', () => {
    const why = formulaGuard('H2O', 'H₂O');
    expect(why).toContain('subsup');
    expect(why).toContain('digits'); // `\d` is ASCII-only in JS: ₂ does not count as 2
    expect(why).toContain('formula:H2O');
  });
  it('fires on a formula token that did not survive verbatim', () => {
    expect(formulaGuard('NaCl solution', 'Natríumklóríðlausn')).toContain('formula:NaCl');
  });
  it('does not treat an ordinary capitalised word as a formula', () => {
    expect(formulaGuard('Element', 'Frumefni')).toEqual([]);
  });
  it('allows a sub/superscript the English already carried', () => {
    expect(formulaGuard('cm³', 'cm³')).toEqual([]);
  });
});

describe('splitJoined', () => {
  it('splits into exactly n trimmed lines', () => {
    expect(splitJoined('Frumefni\n Fjöldi \n', 2)).toEqual({
      ok: true,
      lines: ['Frumefni', 'Fjöldi'],
    });
  });
  it('tolerates CRLF', () => {
    expect(splitJoined('A\r\nB', 2)).toEqual({ ok: true, lines: ['A', 'B'] });
  });
  it('refuses one line too few', () => {
    expect(splitJoined('A B', 2)).toEqual({ ok: false, got: 1 });
  });
  it('refuses one line too many', () => {
    expect(splitJoined('A\nB\nC', 2)).toEqual({ ok: false, got: 3 });
  });
  it('refuses an empty reply without throwing', () => {
    expect(splitJoined('', 2)).toEqual({ ok: false, got: 1 });
    expect(splitJoined(undefined, 2)).toEqual({ ok: false, got: 1 });
  });
});

describe('selectWording', () => {
  it('agreement: keeps the wording, records nothing', () => {
    expect(selectWording('Quantity', 'Fjöldi', 'Fjöldi')).toEqual({ text: 'Fjöldi', alt: null });
  });
  it('disagreement: keeps JOINED and offers per-label', () => {
    expect(selectWording('Element', 'Þáttur', 'Frumefni')).toEqual({
      text: 'Frumefni',
      alt: { kept: 'joined', other: 'Þáttur', reason: 'disagree' },
    });
  });
  it('formula damage: keeps PER-LABEL, offers nothing, records the rejected text', () => {
    const r = selectWording('H2O', 'H2O', 'H₂O');
    expect(r.text).toBe('H2O');
    expect(r.alt).toEqual({ kept: 'per-label', reason: 'formula' });
    expect(r.alt.other).toBeUndefined();
    expect(r.rejected.text).toBe('H₂O');
  });
  it('empty joined line: falls back to per-label with reason empty', () => {
    expect(selectWording('Element', 'Þáttur', '')).toEqual({
      text: 'Þáttur',
      alt: { kept: 'per-label', reason: 'empty' },
    });
  });
  it('empty per-label: keeps joined and never offers an empty suggestion', () => {
    expect(selectWording('Element', '', 'Frumefni')).toEqual({ text: 'Frumefni', alt: null });
  });
  it('both empty: empty text, no alternative (the dropped path handles it)', () => {
    expect(selectWording('Element', '', '')).toEqual({ text: '', alt: null });
  });
});

describe('joinable and wireChars — the one owner of what a figure is billed for', () => {
  const b = (english) => ({ key: english, english });
  it('a single label is not joinable and buys no joined request', () => {
    expect(joinable([b('Water')])).toBe(false);
    expect(wireChars([b('Water')])).toEqual({ perLabel: 5, joined: 0, total: 5 });
  });
  it('two labels: joined = both + one newline', () => {
    expect(joinable([b('Oxygen gas'), b('Water')])).toBe(true);
    expect(wireChars([b('Oxygen gas'), b('Water')])).toEqual({
      perLabel: 15,
      joined: 16,
      total: 31,
    });
  });
  it('a label containing a newline makes the figure unjoinable — nothing billed for it', () => {
    const send = [b('A\nB'), b('C')];
    expect(joinable(send)).toBe(false);
    expect(wireChars(send).joined).toBe(0);
  });
  it('an empty plan is zero, without throwing', () => {
    expect(wireChars([])).toEqual({ perLabel: 0, joined: 0, total: 0 });
  });
});

const block = (key, english, extra = {}) => ({
  key,
  english,
  lines: english.split(' '),
  arc: false,
  send: true,
  ...extra,
});

function fixtureOut(blocks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figjoin-'));
  fs.writeFileSync(path.join(dir, 'blocks.json'), JSON.stringify(blocks));
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify({ source: '/nowhere/JOIN_FIG.pdf' })
  );
  return dir;
}

/**
 * A stub whose per-label and joined answers are scripted separately, keyed on the EXACT text
 * sent. An unscripted text throws: a test must never pass because the stub invented an answer.
 */
function scriptedStub(seen, answers) {
  return {
    translate: async (text, opts) => {
      seen.push({ text, opts });
      if (!(text in answers)) throw new Error(`unscripted request: ${JSON.stringify(text)}`);
      return { text: answers[text] };
    },
    getUsage: () => ({ requests: seen.length }),
  };
}

const runWith = (dir, seen, answers, extraArgs = []) =>
  main(['--book', 'efnafraedi-2e', '--out', dir, ...extraArgs], {
    createClient: () => scriptedStub(seen, answers),
    estimateIsk: (c) => c / 100,
    envPath: path.join(dir, 'absent.env'),
  });

const readTrans = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'translations-api.json'), 'utf-8'));

describe('main — the joined arm', () => {
  let realLog;
  let savedExitCode;
  beforeEach(() => {
    realLog = console.log;
    console.log = () => {};
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
  });
  afterEach(() => {
    console.log = realLog;
    process.exitCode = savedExitCode;
  });

  it('keeps the joined wording and records the per-label one as the alternative', async () => {
    const dir = fixtureOut([block('Element', 'Element'), block('Quantity', 'Quantity')]);
    const seen = [];
    await runWith(dir, seen, {
      Element: 'Þáttur',
      Quantity: 'Fjöldi',
      'Element\nQuantity': 'Frumefni\nFjöldi',
    });
    expect(process.exitCode).toBeUndefined();
    expect(seen.map((s) => s.text)).toEqual(['Element', 'Quantity', 'Element\nQuantity']);
    const t = readTrans(dir);
    expect(t.blocks).toEqual({ Element: ['Frumefni'], Quantity: ['Fjöldi'] });
    expect(t.alternatives).toEqual({
      Element: { kept: 'joined', other: 'Þáttur', reason: 'disagree' },
    });
    expect(t.mtJoined).toEqual({ status: 'ok', labels: 2 });
  });

  it('agreement on every label writes no alternatives (the control)', async () => {
    const dir = fixtureOut([block('A', 'A'), block('B', 'B')]);
    const seen = [];
    await runWith(dir, seen, { A: 'a', B: 'b', 'A\nB': 'a\nb' });
    const t = readTrans(dir);
    expect(t.blocks).toEqual({ A: ['a'], B: ['b'] });
    expect(t.alternatives).toEqual({});
  });

  it('a reply that does not split back keeps EVERY per-label answer and says why', async () => {
    const dir = fixtureOut([block('A', 'A'), block('B', 'B')]);
    const seen = [];
    await runWith(dir, seen, { A: 'a', B: 'b', 'A\nB': 'a og b' });
    const t = readTrans(dir);
    expect(t.blocks).toEqual({ A: ['a'], B: ['b'] });
    expect(t.alternatives).toEqual({});
    expect(t.mtJoined).toEqual({ status: 'split-failed', labels: 2, lines: 1 });
  });

  it('a formula-damaged joined line keeps that label per-label, and only that label', async () => {
    const dir = fixtureOut([block('H2O', 'H2O'), block('Element', 'Element')]);
    const seen = [];
    await runWith(dir, seen, {
      H2O: 'H2O',
      Element: 'Þáttur',
      'H2O\nElement': 'H₂O\nFrumefni',
    });
    const t = readTrans(dir);
    expect(t.blocks).toEqual({ H2O: ['H2O'], Element: ['Frumefni'] });
    expect(t.alternatives.H2O).toEqual({ kept: 'per-label', reason: 'formula' });
    expect(t.alternatives.Element).toEqual({ kept: 'joined', other: 'Þáttur', reason: 'disagree' });
  });

  it('a single-label figure makes exactly ONE request', async () => {
    const dir = fixtureOut([block('Water', 'Water')]);
    const seen = [];
    await runWith(dir, seen, { Water: 'Vatn' });
    expect(seen.map((s) => s.text)).toEqual(['Water']);
    expect(readTrans(dir).mtJoined).toEqual({ status: 'single-label', labels: 1 });
  });

  it('a label containing a newline: the joined request is NEVER SENT', async () => {
    const dir = fixtureOut([block('A', 'A\nB'), block('C', 'C')]);
    const seen = [];
    await runWith(dir, seen, { 'A\nB': 'a b', C: 'c' });
    expect(seen.map((s) => s.text)).toEqual(['A\nB', 'C']); // no third, joined request
    expect(readTrans(dir).mtJoined).toEqual({ status: 'skipped-newline', labels: 2 });
  });

  it('keeps the arc shape: an arc block is a bare string, as before', async () => {
    const dir = fixtureOut([block('NaCl', 'NaCl', { arc: true }), block('Salt', 'Salt')]);
    const seen = [];
    await runWith(dir, seen, { NaCl: 'NaCl', Salt: 'Salt', 'NaCl\nSalt': 'NaCl\nSalt' });
    expect(readTrans(dir).blocks).toEqual({ NaCl: 'NaCl', Salt: ['Salt'] });
  });

  it('sends no glossary on the joined request either', async () => {
    const dir = fixtureOut([block('A', 'A'), block('B', 'B')]);
    const seen = [];
    await runWith(dir, seen, { A: 'a', B: 'b', 'A\nB': 'a\nb' });
    expect(seen.filter((s) => 'glossaries' in s.opts)).toEqual([]);
    expect(seen.every((s) => s.opts.targetLanguage === 'is')).toBe(true);
  });

  it('--dry-run prices both arms, first line parseable as before', async () => {
    const dir = fixtureOut([block('Oxygen gas', 'Oxygen gas'), block('Water', 'Water')]);
    const logs = [];
    console.log = (m) => logs.push(String(m));
    await main(['--book', 'efnafraedi-2e', '--out', dir, '--dry-run'], {
      createClient: () => {
        throw new Error('no client under --dry-run');
      },
      estimateIsk: (c) => c / 100,
      envPath: path.join(dir, 'absent.env'),
    });
    expect(logs.some((l) => /^\s+2 blocks, 31 chars, est 0\.31 ISK/.test(l))).toBe(true);
    expect(logs.some((l) => /per-label 15 \+ joined 16 chars/.test(l))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'translations-api.json'))).toBe(false);
  });

  it('the plan line counts REQUESTS, including the joined one, in its denominator', async () => {
    // R5: `steered` can include the synthetic `(joined)` entry, so the denominator must be
    // the number of PLANNED REQUESTS (2 per-label + 1 joined = 3), not `wire.length` (2).
    const dir = fixtureOut([block('Oxygen gas', 'Oxygen gas'), block('Water', 'Water')]);
    const logs = [];
    console.log = (m) => logs.push(String(m));
    await main(['--book', 'efnafraedi-2e', '--out', dir, '--dry-run'], {
      createClient: () => {
        throw new Error('no client under --dry-run');
      },
      estimateIsk: (c) => c / 100,
      envPath: path.join(dir, 'absent.env'),
    });
    expect(logs.some((l) => /0 of 3 requests steered/.test(l))).toBe(true);
  });

  it('records both arms in api-run.json', async () => {
    const dir = fixtureOut([block('Element', 'Element'), block('Quantity', 'Quantity')]);
    const seen = [];
    await runWith(dir, seen, {
      Element: 'Þáttur',
      Quantity: 'Fjöldi',
      'Element\nQuantity': 'Frumefni\nFjöldi',
    });
    const run = JSON.parse(fs.readFileSync(path.join(dir, 'api-run.json'), 'utf-8'));
    expect(run.joined).toMatchObject({
      text: 'Element\nQuantity',
      reply: 'Frumefni\nFjöldi',
      status: 'ok',
    });
    expect(run.blocks.find((b) => b.key === 'Element')).toMatchObject({
      is: 'Þáttur',
      joined: 'Frumefni',
      kept: 'Frumefni',
    });
  });
});
