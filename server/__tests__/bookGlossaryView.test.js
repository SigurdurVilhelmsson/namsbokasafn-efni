/**
 * The book glossary page's pure read model and the labels the page and the server share
 * (design §5.3; plan rulings Q8, Q13).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const view = require('../public/js/book-glossary-view');
const { RESULTS } = require('../services/bookGlossaryInflections');
const { DOMAINS } = require('../lib/domains');

describe('inflection labels', () => {
  it("the labels cover exactly the lookup's results", () => {
    expect(Object.keys(view.INFLECTION_RESULT_LABELS).sort()).toEqual([...RESULTS].sort());
  });

  it('inflectionLabel counts the stored forms', () => {
    expect(view.inflectionLabel({ state: 'forms', count: 3 })).toBe('3 beygingarmyndir');
  });

  // Icelandic agreement: singular for 1, 21, 31 … but not 11.
  it.each([
    [1, '1 beygingarmynd'],
    [2, '2 beygingarmyndir'],
    [11, '11 beygingarmyndir'],
    [21, '21 beygingarmynd'],
  ])('inflectionLabel agrees with %i', (count, expected) => {
    expect(view.inflectionLabel({ state: 'forms', count })).toBe(expected);
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

  // §C244 T4c: words are counted across any run of whitespace, and edge whitespace adds none.
  it('counts words across irregular whitespace', () => {
    expect(
      view.editorOnlyForms(['salt  bridge', 'standard\tcell\tpotential', ' salt bridge '])
    ).toEqual(['standard\tcell\tpotential']);
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

describe('historyDetail', () => {
  const row = (action, before, after) => ({ action, before, after });
  const added = { english: ['salt bridge'], icelandic: 'saltbrú', replaces: [] };
  const was = { english: ['cell'], icelandic: 'ker', inflections: ['kerið', 'kersins'] };

  it('an added entry shows its Icelandic', () => {
    expect(view.historyDetail(row('entry-add', null, added))).toBe('Þýðing: saltbrú');
  });

  it('a change of Icelandic shows the old word and the new', () => {
    const now = { english: ['cell'], icelandic: 'rafhlaða' };
    expect(view.historyDetail(row('entry-change', was, now))).toBe('Þýðing: ker → rafhlaða');
  });

  it('a change of forms alone shows the forms', () => {
    const now = { english: ['cell', 'cells'], icelandic: 'ker' };
    expect(view.historyDetail(row('entry-change', was, now))).toBe(
      'Orðmyndir: cell → cell · cells'
    );
  });

  it('a change of both shows both', () => {
    const now = { english: ['cell', 'cells'], icelandic: 'rafhlaða' };
    expect(view.historyDetail(row('entry-change', was, now))).toBe(
      'Þýðing: ker → rafhlaða; orðmyndir: cell → cell · cells'
    );
  });

  it('reordered forms are not shown as a change', () => {
    const before = { english: ['salt bridge', 'bridge'], icelandic: 'saltbrú' };
    const after = { english: ['bridge', 'salt bridge'], icelandic: 'jónabrú' };
    expect(view.historyDetail(row('entry-change', before, after))).toBe(
      'Þýðing: saltbrú → jónabrú'
    );
  });

  it('a removal shows the removed Icelandic and no inflections', () => {
    expect(view.historyDetail(row('entry-remove', was, { removed: true }))).toBe('Þýðing: ker');
  });

  it('shows nothing where the row holds no Icelandic', () => {
    expect([
      // The record omits an excluded row's Icelandic (design §5.4).
      view.historyDetail(row('exclude', null, { english: 'cell', conceptId: 5 })),
      view.historyDetail(row('unexclude', { english: 'cell' }, { english: 'cell' })),
      view.historyDetail(row('entry-remove', { english: ['cell'], icelandic: null }, {})),
      view.historyDetail(row('entry-add', null, null)),
      view.historyDetail(row('entry-change', 'not json', added)),
      view.historyDetail(row('entry-change', was, { ...was, inflections: [] })),
    ]).toEqual([null, null, null, null, null, null]);
  });
});

describe('isSitePath', () => {
  it('accepts a path on this site', () => {
    expect(view.isSitePath('/editor?book=efnafraedi-2e&chapter=17&module=m1')).toBe(true);
  });

  it.each([
    ['protocol-relative', '//host'],
    ['backslash', '/\\host'],
    ['absolute', 'https://host/'],
    ['tab', '/\t/host'],
    ['newline', '/\n/host'],
    ['carriage-return', '/\r/host'],
    ['non-string', null],
  ])('refuses a %s link', (_, link) => {
    expect(view.isSitePath(link)).toBe(false);
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

  // §C244 T4c: each side's ellipsis follows its own cut flag.
  it.each([
    [true, false, { before: '…abc', match: 'XYZ', after: 'def' }],
    [false, true, { before: 'abc', match: 'XYZ', after: 'def…' }],
  ])('marks only the side that was cut (before %s, after %s)', (cutBefore, cutAfter, parts) => {
    expect(
      view.excerptParts({ text: 'abcXYZdef', start: 3, length: 3, cutBefore, cutAfter })
    ).toEqual(parts);
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

  it.each([
    [1, '1 bútur notar enn gamla orðið.'],
    [2, '2 bútar nota enn gamla orðið.'],
    [11, '11 bútar nota enn gamla orðið.'],
    [21, '21 bútur notar enn gamla orðið.'],
  ])('worklistSummary agrees with %i', (total, expected) => {
    expect(view.worklistSummary({ kind: 'change', reason: null, units: 5, total })).toBe(expected);
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

  const units = (n) => Array.from({ length: n }, (_, i) => 'm' + (i + 1));
  it.each([
    [1, 'Ekki tókst að lesa 1 einingu (m1); hún var ekki skoðuð.'],
    [2, 'Ekki tókst að lesa 2 einingar (m1, m2); þær voru ekki skoðaðar.'],
    [11, `Ekki tókst að lesa 11 einingar (${units(11).join(', ')}); þær voru ekki skoðaðar.`],
    [21, `Ekki tókst að lesa 21 einingu (${units(21).join(', ')}); hún var ekki skoðuð.`],
  ])('unreadableNote agrees with %i', (n, expected) => {
    expect(view.unreadableNote({ unreadable: units(n) })).toBe(expected);
  });
});

describe('formsFromText', () => {
  it('formsFromText drops blanks and duplicates and keeps order', () => {
    expect(view.formsFromText('  salt bridge \n\nbridge\nsalt bridge\n Salt bridge\n')).toEqual([
      'salt bridge',
      'bridge',
      'Salt bridge',
    ]);
  });
});

describe('changeBody', () => {
  const entry = { english: ['salt bridge', 'bridge'], icelandic: 'saltbrú' };

  it('changeBody sends only what changed: the Icelandic', () => {
    expect(
      view.changeBody(entry, { icelandic: 'jónabrú', forms: ['salt bridge', 'bridge'] })
    ).toEqual({ icelandic: 'jónabrú' });
  });

  it('changeBody sends only what changed: the forms', () => {
    expect(view.changeBody(entry, { icelandic: 'saltbrú', forms: ['salt bridge'] })).toEqual({
      forms: ['salt bridge'],
    });
  });

  it('changeBody treats reordered forms as no change', () => {
    expect(
      view.changeBody(entry, { icelandic: 'saltbrú', forms: ['bridge', 'salt bridge'] })
    ).toBeNull();
  });

  it('changeBody is null when nothing differs', () => {
    expect(
      view.changeBody(entry, { icelandic: 'saltbrú', forms: ['salt bridge', 'bridge'] })
    ).toBeNull();
  });
});

describe('replaceCandidates', () => {
  const resolution = (over) => ({
    winner: { conceptId: 1, termId: 11, text: 'saltbrú', domain: 'chemistry', position: 1 },
    reason: 'position',
    tied: [{ conceptId: 2, text: 'brú', domain: 'physics' }],
    alsoInScope: [
      { conceptId: 2, termId: 12, text: 'brú', domain: 'physics', position: 2 },
      { conceptId: 3, termId: 13, text: 'jónabrú', domain: 'biology', position: 3 },
    ],
    outOfScope: [{ conceptId: 4, text: 'utan', domain: 'astronomy' }],
    ...over,
  });

  it('replaceCandidates checks the winner and offers nothing for the book own entry', () => {
    expect({
      ordinary: view.replaceCandidates(resolution()),
      bookEntry: view.replaceCandidates(resolution({ reason: 'book-entry' })),
    }).toEqual({
      ordinary: [
        { conceptId: 1, text: 'saltbrú', domain: 'chemistry', checked: true },
        { conceptId: 2, text: 'brú', domain: 'physics', checked: false },
        { conceptId: 3, text: 'jónabrú', domain: 'biology', checked: false },
      ],
      bookEntry: [],
    });
  });
});

// §C244 T4b: a code the label maps do not know (a new lookup result, action or empty-list reason
// that reached the server before the page) shows as itself, never as the word "undefined".
describe('a code with no label', () => {
  it('inflectionLabel shows an unknown lookup result as its code', () => {
    expect(view.inflectionLabel({ state: 'none', reason: 'nytt-svar' })).toBe(
      'aðeins rithátturinn — nytt-svar'
    );
  });

  it('actionLabel shows an unknown action as its code', () => {
    expect(view.actionLabel('ny-adgerd')).toBe('ny-adgerd');
  });

  it('worklistSummary shows an unknown empty-list reason as its code', () => {
    expect(view.worklistSummary({ kind: null, reason: 'ny-astaeda', units: 0, total: 0 })).toBe(
      'ny-astaeda'
    );
  });
});

// §C244 M13: subject areas by their Icelandic names ([USER] ruling 2026-11-26: all seven).
describe('domainLabel', () => {
  it("the names cover exactly the concept model's domains", () => {
    expect(Object.keys(view.DOMAIN_LABELS).sort()).toEqual([...DOMAINS].sort());
  });

  it.each([
    ['chemistry', 'Efnafræði'],
    ['physics', 'Eðlisfræði'],
    ['biology', 'Líffræði'],
    ['mathematics', 'Stærðfræði'],
    ['astronomy', 'Stjörnufræði'],
    ['anatomy-physiology', 'Líffæra- og lífeðlisfræði'],
    ['earth-science', 'Jarðvísindi'],
  ])('names %s', (code, name) => {
    expect(view.domainLabel(code)).toBe(name);
  });

  it('shows a code it has no name for as itself', () => {
    expect(view.domainLabel('not-a-domain')).toBe('not-a-domain');
  });
});
