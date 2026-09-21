/**
 * §C170b — the `--glossary-only` subset is COMPUTED, not curated.
 *
 * The hand-curated subsets dropped approved terms their chapters needed, and the
 * curation rested on a premise that measurement refuted (the handoff excluded
 * `cell` from ch10 saying "already grindareining"; ch10's MT contains **zero**
 * `grindareining` and two invented competing terms instead).
 *
 * 🔴 EVERY CASE BELOW WAS ESTABLISHED BY MEASUREMENT BEFORE THE TOOL EXISTED, so
 * this is a control, not a restatement of what the code happens to do. Three of
 * them failed on the first two cuts and each failure changed the design:
 *   - `buffer`/`catalysis` were EXCLUDED when rule 3 asked "does the approved
 *     Icelandic appear at all?" (stuðpúði x5) — while the competing `jafnalausn`
 *     ran 53x. Presence is not dominance; rule 3 became a COVERAGE ratio.
 *   - `energy` was INCLUDED because the stem `orka` misses the inflected `orku`.
 *     The stem floor dropped to 3.
 *   - `polyprotic acid` was ABSENT because §14.5's title is "Polyprotic AcidS"
 *     and the boundary match had no plural. The chapter about polyprotic acids
 *     was dropping the term for polyprotic acid.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeSubset,
  countWordBoundary,
  icelandicStem,
  MIN_OCCURRENCES,
  ALREADY_HANDLED_COVERAGE,
} from '../compute-glossary-subset.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BOOK = 'efnafraedi-2e';

const approved = () =>
  (
    JSON.parse(
      fs.readFileSync(path.join(ROOT, 'books', BOOK, 'glossary', 'glossary-unified.json'), 'utf8')
    ).terms || []
  ).filter((t) => t.status === 'approved');

const readDir = (kind, chd, ext) => {
  const d = path.join(ROOT, 'books', BOOK, kind, chd);
  if (!fs.existsSync(d)) return '';
  let out = '';
  for (const f of fs.readdirSync(d))
    if (f.endsWith(ext)) out += fs.readFileSync(path.join(d, f), 'utf8');
  return out;
};
const run = (chd) =>
  computeSubset(approved(), readDir('02-for-mt', chd, '.en.md'), {
    mtText: readDir('02-mt-output', chd, '.is.md'),
  });

const verdict = (r, term) => {
  if (r.subset.some((x) => x.term.toLowerCase() === term.toLowerCase())) return 'INCLUDED';
  const e = r.excluded.find((x) => x.term.toLowerCase() === term.toLowerCase());
  return e ? `EXCLUDED:${e.why}` : 'ABSENT';
};

describe('the control set — each case measured before the tool existed', () => {
  const CASES = [
    ['ch10', 'unit cell', 'INCLUDED', 'approved, and ch10 invented two terms without it'],
    ['ch10', 'cell', 'EXCLUDED:shadowed', '"cell -> ker" is wrong inside "unit cell"'],
    ['ch14', 'buffer', 'INCLUDED', 'MT said jafnalausn 53x against stuðpúði 5x'],
    ['ch12', 'catalysis', 'INCLUDED', 'MT said hvörf, which means reactions'],
    ['ch14', 'conjugate acid', 'INCLUDED', 'MT said samtengd, never samoka'],
    ['ch14', 'polyprotic acid', 'INCLUDED', 'the plural in the section title nearly hid it'],
    ['ch16', 'energy', 'EXCLUDED:already-handled', 'the model says orku unprompted'],
    ['ch11', 'solution', 'EXCLUDED:already-handled', 'the model says lausn unprompted'],
    ['ch13', 'equilibrium', 'EXCLUDED:already-handled', 'the model says jafnvægi unprompted'],
  ];
  for (const [chd, term, want, why] of CASES) {
    it(`${chd}: ${term} -> ${want} (${why})`, () => {
      expect(verdict(run(chd), term)).toBe(want);
    });
  }
});

describe('the units the rules depend on', () => {
  it('counts an English plural — the case that hid polyprotic acid', () => {
    expect(countWordBoundary('Polyprotic Acids are acids.', 'polyprotic acid')).toBe(1);
    expect(countWordBoundary('one buffer, two buffers', 'buffer')).toBe(2);
  });

  it('does NOT count a headword inside a longer word', () => {
    // The hazard the curation existed to dodge: `ether` inside `together`.
    expect(countWordBoundary('together, whether, neither', 'ether')).toBe(0);
  });

  it('stems Icelandic short enough to survive inflection', () => {
    expect('orku'.startsWith(icelandicStem('orka'))).toBe(true);
    expect('stuðpúðalausnar'.startsWith(icelandicStem('stuðpúði'))).toBe(true);
    expect('hvötunar'.startsWith(icelandicStem('hvötun'))).toBe(true);
  });

  it('the thresholds are exported values, not prose', () => {
    expect(MIN_OCCURRENCES).toBeGreaterThan(0);
    expect(ALREADY_HANDLED_COVERAGE).toBeGreaterThan(0);
    expect(ALREADY_HANDLED_COVERAGE).toBeLessThanOrEqual(1);
  });
});

describe('non-vacuity — the walk must actually reach the corpus', () => {
  it('ch16 yields a non-empty subset from a non-empty approved list', () => {
    expect(approved().length).toBeGreaterThan(500);
    const r = run('ch16');
    expect(r.subset.length).toBeGreaterThan(0);
    expect(r.excluded.length).toBeGreaterThan(0); // rules fired
  });
});
