// server/__tests__/findTermsSymbolCase.test.js
/**
 * SYMBOL-SHAPED ENTRIES MUST MATCH CASE-EXACTLY — measured in production
 * 2026-08-11, hours after the §C36 B4b-1 cut-over deployed.
 *
 * The automaton folds case (foldString), which is correct for ordinary
 * vocabulary: a sentence-initial "Atom" must still match the entry "atom". But
 * the concept corpus carries Árnastofnun's element symbols and acronyms as
 * English terms — `As` arsenic, `At` astatine, `Be` beryllium, `In` indium,
 * `No` nobelium, `A` ampere, `OR` odds ratio, `ALL` acute lymphoblastic
 * leukaemia — and folded, every one of those matches an ordinary English word.
 *
 * MEASURED ON PRODUCTION DATA, one ordinary sentence containing no chemistry:
 *   "It is at no point clear that we can be as sure of this as of that, so in
 *    practice one has to ask if the same holds for all of them."
 *   → 11 matches and SEVEN issues, six of them element symbols.
 * An editor would see those on essentially every segment, burying real
 * terminology feedback.
 *
 * ⚠️ IT IS A REGRESSION, NOT A PRE-EXISTING CONDITION — measured against the
 * OLD tables on the same production box: `as`/`at`/`be`/`in`/`no`/`a`/`is`/`all`
 * are ABSENT from terminology_headwords and PRESENT in concept_term. Distinct EN
 * strings of ≤3 chars went 132 → 668 at the cut-over.
 *
 * ⚠️ WHY NO EXISTING CHECK CAUGHT IT: 4,457 unit tests, 8 corpus gates with a
 * self-test, 177 E2E tests and two adversarial reviewers all passed, because
 * every one of them tests a PROPERTY OF THE CODE. None asked what an editor sees
 * when they open a normal segment — the gates use curated probe strings and the
 * golden uses a chemistry fixture. This file is the first test in the suite whose
 * input is ordinary English prose.
 *
 * The rule follows this project's existing principle, learned from BÍN's
 * capitalised proper nouns: PREFER AN EXACT-CASE MATCH WHEREVER A TERM'S OWN
 * SPELLING IS KNOWN. Narrow on purpose — it applies only to short entries that
 * carry an uppercase letter, so no ordinary word is affected.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const terminologyService = require('../services/terminologyService');

const BOOK = 'lifraen-efnafraedi'; // chemistry > biology > physics

let db;

function addPair(domain, english, icelandic) {
  const id = Number(
    db.prepare('INSERT INTO concept (domain) VALUES (?)').run(domain).lastInsertRowid
  );
  const ins = db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,1,'test')"
  );
  ins.run(id, 'en', english);
  ins.run(id, 'is', icelandic);
  return id;
}
const run = (en, is = '') =>
  terminologyService.findTermsInSegments([{ segmentId: 's', enContent: en, isContent: is }], BOOK);
const englishes = (res) => res.s.matches.map((m) => m.english);

beforeAll(() => {
  ({ db } = freshMigratedDb());
  terminologyService._setTestDb(db);
});

afterAll(() => {
  terminologyService._setTestDb(null);
  db.close();
});

beforeEach(() => {
  db.exec('DELETE FROM concept_term');
  db.exec('DELETE FROM concept');
});

describe('a short entry carrying an uppercase letter is a SYMBOL and matches case-exactly', () => {
  it('🔴 does NOT match the English word "as" against the entry "As" (arsenic)', () => {
    addPair('chemistry', 'As', 'arsen');
    // CONTROL in the same segment: an ordinary term must still match, so an
    // empty result cannot be mistaken for a working rule.
    addPair('chemistry', 'zzqx control', 'zzqxstyring');

    const res = run('It is as clear as zzqx control can be.');
    expect(englishes(res)).toContain('zzqx control'); // control
    expect(englishes(res)).not.toContain('As');
  });

  it('DOES match "As" when the text writes it as a symbol', () => {
    addPair('chemistry', 'As', 'arsen');
    expect(englishes(run('The sample contains As and other elements.'))).toContain('As');
  });

  it('raises no QA issue for the word "as" — the issue is what actually reached editors', () => {
    addPair('chemistry', 'As', 'arsen');
    const res = run('It is as clear as that.', 'Það er jafn ljóst og það.');
    expect(res.s.issues).toEqual([]);
  });

  it('the same holds for the other measured offenders', () => {
    for (const [en, is] of [
      ['At', 'astat'],
      ['Be', 'beryllín'],
      ['In', 'indín'],
      ['No', 'nóbelín'],
      ['A', 'amper'],
      ['OR', 'gagnlíkindahlutfall'],
      ['ALL', 'brátt eitilfrumuhvítblæði'],
    ]) {
      db.exec('DELETE FROM concept_term');
      db.exec('DELETE FROM concept');
      addPair('chemistry', en, is);
      const res = run('it is at no point a thing we can be in or all of.');
      expect(englishes(res), `entry ${en} matched a lowercase word`).toEqual([]);
    }
  });
});

describe('an English function word is never terminology, however the corpus spells it', () => {
  it('🔴 does NOT match the word "in" against the LOWERCASE entry "in" (inch)', () => {
    // The symbol rule cannot cover this: the entry carries no capital. Measured
    // on production — after the symbol fix alone, `in` → tomma survived.
    addPair('physics', 'in', 'tomma');
    addPair('chemistry', 'zzqx control', 'zzqxstyring');

    const res = run('The zzqx control sits in the box.');
    expect(englishes(res)).toContain('zzqx control'); // control
    expect(englishes(res)).not.toContain('in');
  });

  it('DOES match "NO" in full caps — nitric oxide must survive the rule', () => {
    // The rule keys on the SURFACE, not the entry, precisely for this.
    addPair('chemistry', 'NO', 'köfnunarefnisoxíð');
    expect(englishes(run('The reaction releases NO into the air.'))).toContain('NO');
  });

  it('does NOT match a sentence-initial "No" — capitalised is still the word', () => {
    addPair('chemistry', 'NO', 'köfnunarefnisoxíð');
    expect(englishes(run('No further reaction occurs.'))).toEqual([]);
  });

  it('🔴 does NOT match a SENTENCE-INITIAL "As" — position is the tie-break', () => {
    // The other arm of the conflict: mid-sentence "As" IS arsenic (pinned
    // above), sentence-initial "As" is the conjunction. Both arms are asserted,
    // because a rule that only ever refuses is indistinguishable from deleting
    // the entry.
    addPair('chemistry', 'As', 'arsen');
    expect(englishes(run('As we saw earlier, this holds.'))).toEqual([]);
    expect(englishes(run('The residue. As we saw, this holds.'))).toEqual([]);
  });

  it('does NOT match a standalone "A" — the article beats the ampere in prose', () => {
    addPair('physics', 'A', 'amper');
    expect(englishes(run('A molecule was observed.'))).toEqual([]);
  });

  it('CONTROL: a CONTENT word is untouched — the list is closed-class only', () => {
    // 'practice' is noisy in real text and is deliberately NOT on the list:
    // whether it is useful terminology is an editorial judgement, not the
    // matcher's. If this ever fails, the list has grown past its remit.
    addPair('biology', 'practice', 'umsjárhópur');
    expect(englishes(run('In practice this holds.'))).toContain('practice');
  });
});

describe('a symbol is language-invariant — the QA check must not demand a translation', () => {
  // §C50 re-measurement, 2026-08-11: after §C52 the top offenders in chemistry
  // were `H` (48 issues), `C` (36), `O` (31), then Cl Na Al Ca Cu Au. Those are
  // matched CORRECTLY — the exact-case rule working — and then produce a FALSE
  // `missing`, because the check asks whether the Icelandic contains „súrefni“
  // when the Icelandic correctly writes „O“. A chemical symbol is not translated.
  it('🔴 raises no issue when the Icelandic keeps the SYMBOL rather than the name', () => {
    addPair('chemistry', 'O', 'súrefni');
    const res = run('The O atom bonds here.', 'Frumeindin O tengist hér.');
    expect(res.s.issues).toEqual([]);
  });

  it('still raises a missing issue when the Icelandic has NEITHER symbol nor name', () => {
    // The exemption must not become a blanket amnesty for symbols.
    addPair('chemistry', 'O', 'súrefni');
    const res = run('The O atom bonds here.', 'Þessi tenging verður hér.');
    expect(res.s.issues).toHaveLength(1);
    expect(res.s.issues[0].type).toBe('missing');
  });

  it('CONTROL: the Icelandic NAME still satisfies the check on its own', () => {
    addPair('chemistry', 'O', 'súrefni');
    expect(run('The O atom bonds here.', 'Súrefni tengist hér.').s.issues).toEqual([]);
  });

  it('🔴 CONTROL: a NON-symbol term gets no exemption — untranslated English must still fail', () => {
    // The whole risk of this fix: if the exemption leaked past symbols, an
    // editor who left an English word untranslated would pass QA silently.
    addPair('chemistry', 'atom', 'frumeind');
    const res = run('The atom bonds here.', 'Þessi atom tengist hér.');
    expect(res.s.issues).toHaveLength(1);
    expect(res.s.issues[0].type).toBe('missing');
  });

  it('CONTROL: the symbol must appear as a WHOLE WORD in the Icelandic', () => {
    // "Oxford" contains an O; it is not the symbol.
    addPair('chemistry', 'O', 'súrefni');
    const res = run('The O atom bonds here.', 'Oxford-aðferðin er notuð hér.');
    expect(res.s.issues).toHaveLength(1);
  });
});

describe('ordinary vocabulary is untouched — the rule is narrow by construction', () => {
  it('a sentence-initial "Atom" still matches the entry "atom"', () => {
    addPair('chemistry', 'atom', 'frumeind');
    expect(englishes(run('Atom is the word here.'))).toContain('atom');
  });

  it('an all-lowercase short entry still folds — the rule keys on the UPPERCASE letter', () => {
    // 'ion' is 3 chars but carries no capital, so it is ordinary vocabulary.
    addPair('chemistry', 'ion', 'jón');
    expect(englishes(run('An Ion appears here.'))).toContain('ion');
  });

  it('an entry LONGER than three characters still folds, uppercase or not', () => {
    // The boundary is deliberate: 'ELISA' folded is not a common English word,
    // so long acronyms keep the convenience of case-insensitive matching.
    addPair('biology', 'ELISA', 'ónæmisþáttamæling');
    expect(englishes(run('The elisa test was run.'))).toContain('ELISA');
  });

  it('a mixed-case symbol like "pH" still matches its own spelling', () => {
    addPair('chemistry', 'pH', 'sýrustig');
    expect(englishes(run('The pH was measured.'))).toContain('pH');
  });
});
