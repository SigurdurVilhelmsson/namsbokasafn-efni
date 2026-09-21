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
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  computeSubset,
  countWordBoundary,
  icelandicStem,
  stemPattern,
  stripMarkerVocabulary,
  controlQuality,
  STANDING_TERMS,
  MIN_OCCURRENCES,
  ALREADY_HANDLED_COVERAGE,
  STEM_NOISE_CEILING,
} from '../compute-glossary-subset.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BOOK = 'efnafraedi-2e';

const approved = () =>
  (
    JSON.parse(
      fs.readFileSync(path.join(ROOT, 'books', BOOK, 'glossary', 'glossary-unified.json'), 'utf8')
    ).terms || []
  ).filter((t) => t.status === 'approved');

/**
 * 🔴 THE CONTROL IS PINNED TO A GIT REVISION, AND IT HAS TO BE.
 *
 * These nine cases were measured on the corpus as it stood BEFORE the tier-A
 * terminology re-buy — which is the repair they motivated. Reading the working
 * tree instead makes five of them fail for the RIGHT reason: ch10/ch12/ch14 now
 * contain grindareining, hvötun, samoka and stuðpúði, so rule 3 correctly reports
 * "already handled" and the control evaporates.
 *
 * ▶ A control that its own fix destroys is not a control. `PRE_REBUY` is the last
 * commit before `57b726f3f` (the tier-A re-buy), so the evidence stays fixed while
 * the corpus moves on. Same lesson as the MT-arm gate, whose 3-of-6 partial state
 * was destroyed by the buy that repaired it.
 */
const PRE_REBUY = '212df4acb';

/**
 * 🔴 CI CHECKS OUT SHALLOW, SO THIS PIN CANNOT RESOLVE THERE — MEASURED, and it
 * turned this file red on the 2026-09-21 push while `npm test` was green locally
 * (CI 11 failed files / 37 tests, local 10 / 27; the extra file was this one).
 * `.github/workflows/test.yml` uses `actions/checkout@v7` with no `fetch-depth`,
 * which defaults to depth 1, so `git show 212df4acb:…` cannot resolve.
 *
 * ▶ WORSE THAN A PLAIN FAILURE, AND THAT IS THE POINT: `atRev`/`readDirAtRev`
 * caught the error and returned `''`, which turned "I cannot measure this" into
 * "I measured an empty corpus". Every case then came back `ABSENT` — a verdict
 * shaped exactly like a real one. An absence is not an answer.
 *
 * ⚠️ `tools/__tests__/remt-checks-glossary.test.js` had already hit this and
 * documented the remedy in this same directory: COMMIT the fixture and use the
 * blobs only to prove the committed copy has not drifted. That is the full fix
 * here too, and it is NOT done — the equivalent fixture is ~1.5 MB across 123
 * files (ch10 558 KB, ch12 501 KB, ch14 425 KB). Until it is, the control
 * SKIPS where it cannot run rather than reporting a manufactured verdict.
 * ⚠️ Deliberately NOT solved with `fetch-depth: 0` — that file measured `.git`
 * at 4.2 GB and rejected it for the same reason.
 */
const revResolvable = (() => {
  try {
    execSync(`git cat-file -e ${PRE_REBUY}^{commit}`, { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const atRev = (rel) => {
  try {
    return execSync(`git show ${PRE_REBUY}:${rel}`, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return '';
  }
};

const readDirAtRev = (kind, chd, ext) => {
  let names = [];
  try {
    names = execSync(`git ls-tree --name-only ${PRE_REBUY} books/${BOOK}/${kind}/${chd}/`, {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((n) => n.endsWith(ext));
  } catch {
    return '';
  }
  return names.map((n) => atRev(n)).join('\n');
};

const run = (chd) =>
  computeSubset(approved(), readDirAtRev('02-for-mt', chd, '.en.md'), {
    mtText: readDirAtRev('02-mt-output', chd, '.is.md'),
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
    // `.skip` rather than a silent pass: a control that cannot reach its corpus
    // must say so. The reason is in the revResolvable docstring above.
    const t = revResolvable ? it : it.skip;
    t(`${chd}: ${term} -> ${want} (${why})`, () => {
      // POSITIVE CONTROL ON THE FIXTURE ITSELF. Without this, any future change
      // that empties the corpus reproduces the exact defect this guard was added
      // for — every term ABSENT, read as a verdict.
      const r = run(chd);
      expect(r.subset.length + r.excluded.length).toBeGreaterThan(0);
      expect(verdict(r, term)).toBe(want);
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

  it('stems match THROUGH Icelandic sound alternations', () => {
    // Each of these was measured as a miss by the 2026-09-21 audit.
    const m = (is, form) => stemPattern(icelandicStem(is)).test(form);
    expect(m('orka', 'orku')).toBe(true);
    expect(m('jákvæður', 'jákvætt')).toBe(true); // ð -> t
    expect(m('oxunartala', 'oxunartölu')).toBe(true); // u-umlaut at the tail
    expect(m('efnablanda', 'efnablöndu')).toBe(true); // u-umlaut INSIDE the stem
    expect(m('stuðpúði', 'stuðpúðalausninni')).toBe(true);
  });

  it('🔴 the stem floor stops `vermi` matching `verður` — it deleted a ruled term', () => {
    const m = (is, form) => stemPattern(icelandicStem(is)).test(form);
    expect(m('vermi', 'vermi')).toBe(true);
    expect(m('vermi', 'verður')).toBe(false);
    expect(m('vermi', 'veruleg')).toBe(false);
  });

  it('the thresholds are exported values, not prose', () => {
    expect(MIN_OCCURRENCES).toBeGreaterThan(0);
    expect(ALREADY_HANDLED_COVERAGE).toBeGreaterThan(0);
    expect(ALREADY_HANDLED_COVERAGE).toBeLessThanOrEqual(1);
  });
});

describe('non-vacuity — the walk must actually reach the corpus', () => {
  // 🔴 SPLIT BY WHAT EACH HALF DEPENDS ON. "cannot reach the corpus" and
  // "reached the corpus and found nothing" are DIFFERENT FACTS, and only the
  // second is a defect. The first half reads the WORKING TREE and therefore
  // runs everywhere, including CI's shallow clone; the second reads the pinned
  // revision and cannot. Skipping both would throw away a check CI can make.
  it('the approved list is non-empty — needs no git, so it runs in CI too', () => {
    expect(approved().length).toBeGreaterThan(500);
  });

  (revResolvable ? it : it.skip)('ch16 yields a non-empty subset, and rules fired', () => {
    const r = run('ch16');
    expect(r.subset.length).toBeGreaterThan(0);
    expect(r.excluded.length).toBeGreaterThan(0); // rules fired
  });
});

describe('the 2026-09-21 audit defects, each pinned by the measurement that found it', () => {
  it('🔴 [[BR]] no longer counts as the element Br — and CASE is what does the work', () => {
    // Measured: `Br` scored 22 in ch16 (20 were the line-break marker), 65 in
    // ch20, and 10 in ch21 — a chapter with NO bromine at all.
    // ⚠️ WRITING THIS TEST CORRECTED ITS OWN PREMISE. `[[BR]]` is UPPERCASE, so
    // the case-sensitivity fix alone stops it matching `Br`; the old count was an
    // artefact of counting case-INsensitively, not of the marker surviving.
    const text = 'a[[BR]]b[[BR]]c Br is bromine';
    expect(countWordBoundary(text, 'Br')).toBe(1); // case-sensitivity already excludes BR
    expect(countWordBoundary(text.toLowerCase(), 'br')).toBeGreaterThan(1); // the old defect
  });

  it('marker stripping is what protects a LONG headword like `link`', () => {
    // `link -> tengja` reached the appendices candidate list off 8 hits that were
    // all `{{LINK:n}}` tokens in a stray legacy-format file. A long headword is
    // matched case-INsensitively, so case cannot save it — only stripping can.
    const text = 'see [[link:video|http://x]] and [[link:site|http://y]] here';
    expect(countWordBoundary(text, 'link')).toBe(2); // the defect
    expect(countWordBoundary(stripMarkerVocabulary(text), 'link')).toBe(0);
  });

  it('🔴 a short headword is counted CASE-SENSITIVELY, mirroring headwordAppearsIn', () => {
    // `Po` scored 13 in the appendices and all 13 were `PO`, the phosphate group;
    // `cd` scored 6 and all were `Cd`, cadmium.
    expect(countWordBoundary('the PO group and PO again', 'Po')).toBe(0);
    expect(countWordBoundary('Po is polonium', 'Po')).toBe(1);
    // Above the short threshold the real matcher IS case-insensitive.
    expect(countWordBoundary('Buffer and buffer', 'buffer')).toBe(2);
  });

  it('🔴 a stem matching far more than its term is NOISE, not evidence — it is kept and flagged', () => {
    // `vermi` -> `ver` matched verður/verið 190x = 704% coverage, and deleted a
    // RULED standing term from all seven subsets.
    const approvedRows = [{ english: 'widget', icelandic: 'orka', status: 'approved' }];
    const en = 'widget '.repeat(10);
    const mt = 'orku '.repeat(60); // 600% coverage
    const r = computeSubset(approvedRows, en, { mtText: mt });
    expect(r.subset.some((x) => x.term === 'widget')).toBe(true);
    expect(r.flags.some((f) => f.flag === 'stem-noise')).toBe(true);
    expect(STEM_NOISE_CEILING).toBeGreaterThan(1);
  });

  it('🔴 the ruled standing arm survives every rule', () => {
    // docs/decisions/2026-09-19-glossary-subset-standard-per-chapter.md (Accepted).
    // The first cut dropped it from all seven subsets.
    expect(STANDING_TERMS['efnafraedi-2e']).toEqual(['enthalpy', 'enthalpy change']);
    const rows = [
      { english: 'enthalpy', icelandic: 'vermi', status: 'approved' },
      { english: 'enthalpy change', icelandic: 'vermibreyting', status: 'approved' },
    ];
    // An MT saturated with the approved form would normally exclude it as handled.
    const r = computeSubset(rows, 'enthalpy '.repeat(30), {
      mtText: 'vermi '.repeat(30),
      standing: STANDING_TERMS['efnafraedi-2e'],
    });
    expect(r.subset.map((x) => x.term).sort()).toEqual(['enthalpy', 'enthalpy change']);
    expect(r.standingAdded.length).toBeGreaterThan(0);
  });

  it('🔴 a schemaVersion-1 sidecar is FULL-GLOSSARY, so rule 3 is stamped unreliable', () => {
    expect(controlQuality([{ schemaVersion: 1 }]).kind).toBe('full-glossary');
    expect(
      controlQuality([{ schemaVersion: 2, run: { glossary: { arm: 'glossary-only' } } }]).kind
    ).toBe('restricted');
    expect(controlQuality([]).kind).toBe('none');
  });

  it('shadowing is TOKEN-wise, so `galvanic cell` cannot shadow `Al`', () => {
    // A bare substring test shadowed `Al` via g-AL-vanic and `Br` via salt BRidge.
    const rows = [
      { english: 'Al', icelandic: 'ál', status: 'approved' },
      { english: 'galvanic cell', icelandic: 'rafhlaða', status: 'approved' },
    ];
    const r = computeSubset(rows, 'Al Al Al Al Al Al ' + 'galvanic cell '.repeat(10), {});
    expect(r.excluded.some((x) => x.term === 'Al' && x.why === 'shadowed')).toBe(false);
  });

  it('shadowing scans MEASURED, so a rule-3 exclusion can still shadow', () => {
    // ch17's `fuel` survived although `fuel cell` (21 of its 26 hits) was excluded
    // at 90% already-handled, because rule 2 only saw the survivors.
    const rows = [
      { english: 'fuel', icelandic: 'eldsneyti', status: 'approved' },
      { english: 'fuel cell', icelandic: 'efnarafal', status: 'approved' },
    ];
    const en = 'fuel '.repeat(5) + 'fuel cell '.repeat(20);
    const r = computeSubset(rows, en, { mtText: 'efnarafal '.repeat(20) });
    expect(r.excluded.some((x) => x.term === 'fuel' && x.why === 'shadowed')).toBe(true);
  });
});

describe('the KNOWN LIMIT, pinned so it stays visible rather than becoming folklore', () => {
  it('an IDENTITY map is exempt from rule 3 — its evidence is circular', () => {
    const rows = [{ english: 'Lewis', icelandic: 'Lewis', status: 'approved' }];
    const r = computeSubset(rows, 'Lewis '.repeat(10), { mtText: 'Lewis '.repeat(10) });
    expect(r.subset.some((x) => x.term === 'Lewis')).toBe(true);
    expect(r.flags.some((f) => f.flag === 'identity-map')).toBe(true);
  });

  it('a LISTED alternative that outscores the approved form is caught', () => {
    const rows = [
      { english: 'laser', icelandic: 'ljósleysir', status: 'approved', alternatives: ['leysir'] },
    ];
    const r = computeSubset(rows, 'laser '.repeat(10), { mtText: 'leysir '.repeat(20) });
    expect(r.flags.some((f) => f.flag === 'competing-form')).toBe(true);
  });

  it('🔴 an INVENTED competing form is NOT caught — this is the documented limit', () => {
    // ch16: `spontaneous -> sjálfgengur` scores >76% while sjálfsprott- 38 and
    // sjálfkrafa 21 also run, and the title came back as *Sjálfsprotti*. Nothing
    // in the data names the rival, so no rule here can see it.
    // ▶ This test asserts the LIMIT, not a bug. It is what makes the human audit
    // non-optional, and if it ever starts failing the tool has got BETTER.
    const rows = [{ english: 'spontaneous', icelandic: 'sjálfgengur', status: 'approved' }];
    const r = computeSubset(rows, 'spontaneous '.repeat(10), {
      mtText: 'sjálfgeng '.repeat(8) + 'sjálfsprottinn '.repeat(30),
    });
    expect(r.excluded.some((x) => x.term === 'spontaneous' && x.why === 'already-handled')).toBe(
      true
    );
  });
});
