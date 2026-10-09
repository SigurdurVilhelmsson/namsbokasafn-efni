/**
 * §C191 ① — the "(e. …)" English gloss must keep the source's case.
 *
 * The injector lowercased the WHOLE gloss, so readers saw "(e. aufbau
 * principle)", "(e. hund’s rule)", "(e. ph)" and Δ/Π folded to δ/π. Measured
 * 2026-10-09 over chemistry's EN segments, by site:
 *
 *   site B (glossary terms)            106 carry a capital — EVERY one is right
 *                                          as written (Aufbau, pH, VSEPR, Δoct)
 *   site A (inline terms), mid-sentence 169 — all genuine (Bohr, IUPAC, Kw)
 *   site A, sentence-initial            75 — the only place a capital can be an
 *                                          accident of position ("Matter is…")
 *
 * So the case is kept everywhere except a sentence-initial inline term, which
 * takes its module glossary twin's casing (28 have one) or, failing that, has
 * its FIRST CHARACTER lowercased only when the module itself uses that word in
 * lowercase. Module-level evidence was measured against book-level over the 47
 * twinless cases: module 37 right / 0 proper names lowercased / 1 capital kept
 * (`Oxyanions`); book 38 / 1 proper name lowercased (`Lewis`). Keeping a capital
 * echoes the source; lowercasing a name destroys it — so module wins.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sentenceInitialGlossCase, isSentenceInitial } from '../lib/gloss-case.js';
import { annotateInlineTerms, buildCnxml, parseSegments } from '../cnxml-inject.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('isSentenceInitial — is a capital here an accident of position?', () => {
  it('nothing before the term', () => expect(isSentenceInitial('')).toBe(true));
  it('only whitespace before it', () => expect(isSentenceInitial('   ')).toBe(true));
  it('after a full stop', () => expect(isSentenceInitial('It reacts. ')).toBe(true));
  it('after a question mark', () => expect(isSentenceInitial('Why? ')).toBe(true));
  it('after a colon', () => expect(isSentenceInitial('Two kinds: ')).toBe(true));
  it('after a closing quote that ends a sentence', () => {
    expect(isSentenceInitial('He said “stop.” ')).toBe(true);
  });
  it('mid-sentence — the control', () => expect(isSentenceInitial('the so-called ')).toBe(false));
  it('after a comma — the control', () => expect(isSentenceInitial('In 1913, ')).toBe(false));
});

describe('sentenceInitialGlossCase — the one position where the source case is unreliable', () => {
  it('takes the module glossary twin’s casing when one exists', () => {
    expect(sentenceInitialGlossCase('Matter', { twin: 'matter', moduleText: '' })).toBe('matter');
  });

  it('a twin can also KEEP a capital — Charles’s law', () => {
    expect(
      sentenceInitialGlossCase('Charles’s law', { twin: 'Charles’s law', moduleText: '' })
    ).toBe('Charles’s law');
  });

  it('lowercases the first character when the module uses the word in lowercase', () => {
    const moduleText = 'Primary alcohols are oxidised; alcohols also …';
    expect(sentenceInitialGlossCase('Alcohols', { twin: null, moduleText })).toBe('alcohols');
  });

  it('lowercases ONLY the first character — a symbol later in the term survives', () => {
    const moduleText = 'the standard entropies of …';
    expect(sentenceInitialGlossCase('Standard entropies (S°)', { twin: null, moduleText })).toBe(
      'standard entropies (S°)'
    );
  });

  it('keeps a proper name the module never writes in lowercase — Millikan', () => {
    const moduleText = 'Millikan measured the charge. Millikan’s oil drops …';
    expect(sentenceInitialGlossCase('Millikan', { twin: null, moduleText })).toBe('Millikan');
  });

  it('matches the lowercase evidence as a WHOLE word — "hall" inside "hallway" is not evidence', () => {
    expect(sentenceInitialGlossCase('Hall', { twin: null, moduleText: 'a hallway' })).toBe('Hall');
  });

  it('keeps an acronym-led term — a second capital means it is not a sentence-case accident', () => {
    expect(sentenceInitialGlossCase('IUPAC names', { twin: null, moduleText: 'iupac' })).toBe(
      'IUPAC names'
    );
  });

  it('keeps a term that already starts lowercase', () => {
    expect(sentenceInitialGlossCase('pH', { twin: null, moduleText: 'ph' })).toBe('pH');
  });
});

describe('annotateInlineTerms — case is kept, except a sentence-initial accident', () => {
  const run = (enText, isText, extra = []) => {
    const en = new Map([['m1:para:p1', enText], ...extra]);
    const is = new Map([['m1:para:p1', isText]]);
    return annotateInlineTerms(is, en).segments.get('m1:para:p1');
  };

  it('🔴 keeps a mid-sentence proper name — the live "(e. aufbau principle)" defect', () => {
    expect(
      run(
        'Electrons fill by the [[term:Aufbau principle|t1]].',
        'Eftir [[term:uppbyggingarreglunni|t1]].'
      )
    ).toContain('(e. Aufbau principle)');
  });

  it('🔴 keeps a Greek capital — Δ is not δ', () => {
    expect(
      run('The splitting [[term:Δoct|t1]] is large.', 'Klofnunin [[term:Δoct klofnun|t1]] er stór.')
    ).toContain('(e. Δoct)');
  });

  it('keeps a mid-sentence LOWERCASE source even when its glossary twin is capitalised — dalton (Da)', () => {
    const twin = ['m1:glossary-term:g1', 'Dalton (Da)'];
    expect(
      run('one [[term:dalton (Da)|t1]] is', 'eitt [[term:dalton (Da) eining|t1]] er', [twin])
    ).toContain('(e. dalton (Da))');
  });

  it('lowercases a sentence-initial term through its module glossary twin', () => {
    const twin = ['m1:glossary-term:g1', 'matter'];
    expect(run('[[term:Matter|t1]] has mass.', '[[term:Efni|t1]] hefur massa.', [twin])).toContain(
      '(e. matter)'
    );
  });

  it('keeps a sentence-initial proper name with no twin and no lowercase use', () => {
    expect(
      run('[[term:Millikan|t1]] measured it.', '[[term:Millikan-tilraunin|t1]] mældi það.')
    ).toContain('(e. Millikan)');
  });

  it('a twin from ANOTHER module in the same map does not re-case this module’s term', () => {
    const otherModuleTwin = ['m2:glossary-term:g9', 'millikan'];
    expect(
      run('[[term:Millikan|t1]] measured it.', '[[term:Millikan-tilraunin|t1]] mældi það.', [
        otherModuleTwin,
      ])
    ).toContain('(e. Millikan)');
  });

  it('still skips the gloss when the IS term equals the EN term, ignoring case', () => {
    expect(run('the [[term:Aufbau|t1]] rule', 'reglan [[term:aufbau|t1]]')).not.toContain('(e. ');
  });
});

describe('site B — a glossary term keeps its source case', () => {
  const glossaryRun = (enTerm, isTerm) => {
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml"><content><para id="p1">x</para></content>
<glossary><definition id="g1"><term>${enTerm}</term><meaning id="g1-m">every orbital…</meaning></definition></glossary></document>`;
    const structure = {
      moduleId: 'm1',
      title: { text: 'T', segmentId: null },
      content: [],
      glossary: {
        items: [
          {
            id: 'g1',
            termSegmentId: 'm1:glossary-term:g1',
            definitionSegmentId: 'm1:glossary-def:g1',
          },
        ],
      },
    };
    const segs = new Map([
      ['m1:glossary-term:g1', isTerm],
      ['m1:glossary-def:g1', 'hvert svigrúm…'],
    ]);
    const enSegments = new Map([
      ['m1:glossary-term:g1', enTerm],
      ['m1:glossary-def:g1', 'every orbital…'],
    ]);
    return buildCnxml(structure, segs, {}, originalCnxml, { enSegments, annotateEn: true }).cnxml;
  };

  it('🔴 "(e. Hund’s rule)", not "(e. hund’s rule)"', () => {
    expect(glossaryRun('Hund’s rule', 'regla Hunds')).toContain('(e. Hund’s rule)');
  });

  it('adds no gloss when the IS term equals the EN term — compared without case on BOTH sides', () => {
    expect(glossaryRun('pH', 'pH')).not.toContain('(e. ');
  });
});

describe('REACH — chemistry’s real segments: no gloss loses a capital its source had mid-sentence', () => {
  // Over every chemistry module with committed MT: run the real annotator on the
  // real IS and EN, and check each emitted gloss. A mid-sentence gloss must equal
  // its EN source exactly; a capital may vanish only at a sentence start. The
  // positive control is the count of capitalised mid-sentence glosses emitted —
  // if it were 0, the walk would prove nothing.
  it('every mid-sentence capital survives, and many are exercised', () => {
    const book = path.join(ROOT, 'books', 'efnafraedi-2e');
    let capitalisedEmitted = 0;
    const lost = [];
    for (const ch of fs.readdirSync(path.join(book, '02-mt-output'))) {
      const dir = path.join(book, '02-mt-output', ch);
      for (const f of fs.readdirSync(dir)) {
        if (!/^m\d+-segments\.is\.md$/.test(f)) continue;
        const enPath = path.join(book, '02-for-mt', ch, f.replace('.is.md', '.en.md'));
        if (!fs.existsSync(enPath)) continue;
        const en = parseSegments(fs.readFileSync(enPath, 'utf8'));
        const is = parseSegments(fs.readFileSync(path.join(dir, f), 'utf8'));
        const { segments } = annotateInlineTerms(new Map(is), en);
        for (const text of segments.values()) {
          for (const m of text.matchAll(/\(e\. ([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
            if (m[1] !== m[1].toLowerCase()) capitalisedEmitted++;
          }
        }
        for (const [id, enText] of en) {
          if (id.includes(':glossary-')) continue;
          for (const m of enText.matchAll(/\[\[term:([^\]|[]+)(?:\|[^\]]*)?\]\]/g)) {
            const term = m[1].trim();
            if (term === term.toLowerCase()) continue;
            const before = enText.slice(0, m.index).replace(/\[\[[^\]]*\]\]/g, '');
            if (isSentenceInitial(before)) continue;
            const out = segments.get(id) || '';
            if (
              out.includes('(e. ') &&
              !out.includes(`(e. ${term}`) &&
              out.toLowerCase().includes(`(e. ${term.toLowerCase()}`)
            ) {
              lost.push(`${id} ${term}`);
            }
          }
        }
      }
    }
    expect(capitalisedEmitted).toBeGreaterThan(100);
    expect(lost).toEqual([]);
  }, 60000);
});
