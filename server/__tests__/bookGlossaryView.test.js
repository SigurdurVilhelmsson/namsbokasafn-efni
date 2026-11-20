/**
 * The book glossary page's pure read model and the labels the page and the server share
 * (design §5.3; plan rulings Q8, Q13).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const view = require('../public/js/book-glossary-view');
const { RESULTS } = require('../services/bookGlossaryInflections');

describe('inflection labels', () => {
  it("the labels cover exactly the lookup's results", () => {
    expect(Object.keys(view.INFLECTION_RESULT_LABELS).sort()).toEqual([...RESULTS].sort());
  });

  it('inflectionLabel counts the stored forms', () => {
    expect(view.inflectionLabel({ state: 'forms', count: 3 })).toBe('3 beygingarmyndir');
  });

  it('inflectionLabel says a lookup is pending', () => {
    expect(view.inflectionLabel({ state: 'pending' })).toBe('sæki…');
  });

  it('inflectionLabel with no recorded lookup says so', () => {
    expect(view.inflectionLabel({ state: 'exact-only', reason: null })).toBe(
      'aðeins rithátturinn — engin leit skráð (t.d. eftir endurræsingu)'
    );
  });

  it.each(RESULTS.filter((r) => r !== 'forms'))('inflectionLabel gives %s its label', (reason) => {
    expect(view.inflectionLabel({ state: 'exact-only', reason })).toBe(
      `aðeins rithátturinn — ${view.INFLECTION_RESULT_LABELS[reason]}`
    );
  });
});

describe('editorOnlyForms', () => {
  it('keeps only forms of three or more words', () => {
    expect(view.editorOnlyForms(['salt bridge', 'standard cell potential'])).toEqual([
      'standard cell potential',
    ]);
  });
});

describe('actionLabel', () => {
  it('names each action', () => {
    expect(
      ['exclude', 'unexclude', 'entry-add', 'entry-change', 'entry-remove'].map(view.actionLabel)
    ).toEqual([
      'Útilokað',
      'Útilokun afturkölluð',
      'Færsla bætt við',
      'Færslu breytt',
      'Færsla fjarlægð',
    ]);
  });
});

describe('excerptParts', () => {
  it('splits at the match and marks both cuts', () => {
    expect(
      view.excerptParts({ text: 'abcXYZdef', start: 3, length: 3, cutBefore: true, cutAfter: true })
    ).toEqual({ before: '…abc', match: 'XYZ', after: 'def…' });
  });

  it('marks nothing where nothing was cut', () => {
    expect(
      view.excerptParts({
        text: 'abcXYZdef',
        start: 3,
        length: 3,
        cutBefore: false,
        cutAfter: false,
      })
    ).toEqual({ before: 'abc', match: 'XYZ', after: 'def' });
  });
});

describe('worklistSummary', () => {
  it('gives each empty state its own sentence', () => {
    const kindNull = (reason) => ({ kind: null, reason, units: 5, total: 0 });
    const sentences = [
      view.worklistSummary(kindNull('not-applicable')),
      view.worklistSummary(kindNull('add-alongside')),
      view.worklistSummary(kindNull('no-new-word')),
      view.worklistSummary(kindNull('exclusion-undone')),
      view.worklistSummary(kindNull('nothing-to-search')),
      view.worklistSummary({ kind: 'change', reason: null, units: 0, total: 0 }),
      view.worklistSummary({ kind: 'change', reason: null, units: 5, total: 0 }),
    ];
    expect(new Set(sentences).size).toBe(7);
  });

  it('counts the segments still using the old word', () => {
    expect(view.worklistSummary({ kind: 'change', reason: null, units: 5, total: 4 })).toBe(
      '4 bútar nota enn gamla orðið.'
    );
  });
});

describe('unreadableNote', () => {
  it('is null when every unit was read', () => {
    expect(view.unreadableNote({ unreadable: [] })).toBeNull();
  });

  it('names the units that could not be read', () => {
    expect(view.unreadableNote({ unreadable: ['m1', 'm2'] })).toBe(
      'Ekki tókst að lesa 2 einingar (m1, m2); þær voru ekki skoðaðar.'
    );
  });
});
