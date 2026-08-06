/**
 * Builds the C24 golden-oracle fixture. Run: node server/scripts/build-c24-fixture.js
 *
 * WHICH PROPERTIES ARE LOAD-BEARING (do not "simplify" these away):
 *  - FALLBACK-HEAVY subject skew. Production gives a chemistry book ~709 in-scope
 *    translations against ~28,194 fallback (spec §4.10). A balanced fixture would leave
 *    the busiest branch — fallback's "surfaces but never issues" rule — untested.
 *  - WITHIN-SUBJECT collisions. 95.9% of real multi-translation headwords collide inside
 *    one subject (§4.11), where the tier partition cannot separate them, isPrimary ties,
 *    and the ranking comparator returns 0 — so SQL row order decides. This is why the
 *    ORDER BY carries `t.id ASC`.
 *  - A 72-form inflection list. Production's measured maximum; the 4.16 mean hides it.
 *  - SHORT ABBREVIATION headwords (W, pH, os, Hb, eV). Real collisions skew to 1-3 char
 *    abbreviations and prefixes, which also generate the most automaton hits per segment
 *    and sort LAST under LENGTH(english) DESC.
 *  - PROPOSED rows. Production has zero, so approved-beats-proposed is otherwise dead.
 *
 * Source: committed books/efnafraedi-2e/glossary/glossary-unified.json ONLY.
 * NEVER production data — this repo is public.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, '..', '__tests__', 'fixtures');
const SUBJECTS = ['biology', 'mathematics', 'physics', 'chemistry'];

const corpus = JSON.parse(
  fs.readFileSync(
    path.join(REPO, 'books', 'efnafraedi-2e', 'glossary', 'glossary-unified.json'),
    'utf-8'
  )
);
const rows = (Array.isArray(corpus) ? corpus : corpus.terms || []).filter(
  (t) => t.english && t.icelandic
);

// Deterministic PRNG — the fixture must be byte-reproducible across runs.
let seed = 24;
const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const headwords = [];

// 1. Bulk: 300 single-translation terms, fallback-heavy (only ~10% chemistry).
for (const r of rows.slice(0, 300)) {
  const subject = rand() < 0.1 ? 'chemistry' : SUBJECTS[Math.floor(rand() * 3)];
  headwords.push({
    english: r.english,
    pos: null,
    translations: [
      {
        icelandic: r.icelandic,
        inflections: null,
        status: 'approved',
        subjects: [subject],
      },
    ],
  });
}

// 2. Within-subject collisions (95.9% of the real shape) — abbreviation-flavoured.
// Two short (<=2 char) headwords (Hb, eV) added on top of W/pH/os so the "short
// abbreviation headwords" assertion has margin above its >=3 threshold instead of
// sitting at exactly 3. Kept off 'chemistry' deliberately — the fallback-heavy ratio
// assertion (chem/allTr < 0.15) already sits close to its threshold, and adding more
// chemistry-subject translations would push it the wrong way.
const withinSubject = [
  ['W', 'biology', ['vatt', 'vött']],
  ['pH', 'biology', ['sýrustig', 'pH']],
  ['os', 'biology', ['bein', 'munnur']],
  ['Hb', 'biology', ['blóðrauði', 'Hb']],
  ['eV', 'physics', ['rafeindarvolt', 'eV']],
  ['ATP', 'biology', ['adenosínþrífosfat', 'þríyrki']],
  ['catalyst', 'chemistry', ['hvati', 'efnahvati']],
  ['bond', 'chemistry', ['tengi', 'efnatengi']],
];
for (const [english, subject, ices] of withinSubject) {
  headwords.push({
    english,
    pos: null,
    translations: ices.map((icelandic) => ({
      icelandic,
      inflections: null,
      status: 'approved',
      subjects: [subject],
    })),
  });
}

// 3. Cross-subject collision (the 4.1% the tier partition resolves cleanly).
headwords.push({
  english: 'cell',
  pos: null,
  translations: [
    { icelandic: 'fruma', inflections: null, status: 'approved', subjects: ['biology'] },
    { icelandic: 'rafhlaða', inflections: null, status: 'approved', subjects: ['chemistry'] },
  ],
});

// 4. The audit counterexample: a longest-alternative-fails backtrack case.
headwords.push({
  english: 'mole',
  pos: null,
  translations: [
    {
      icelandic: 'mól',
      inflections: ['mól (m)'],
      status: 'approved',
      subjects: ['chemistry'],
    },
  ],
});

// 5. The 72-form tail.
headwords.push({
  english: 'inflection tail term',
  pos: null,
  translations: [
    {
      icelandic: 'beygingarhali',
      inflections: Array.from({ length: 72 }, (_, i) => `beygingarhali${i}`),
      status: 'approved',
      subjects: ['chemistry'],
    },
  ],
});

// 6. Proposed rows — production has none, so this tiebreak is otherwise dead code.
headwords.push({
  english: 'tentative term',
  pos: null,
  translations: [
    { icelandic: 'bráðabirgðaorð', inflections: null, status: 'proposed', subjects: ['chemistry'] },
    { icelandic: 'staðfest orð', inflections: null, status: 'approved', subjects: ['chemistry'] },
  ],
});

// 7. Overlap/precedence shapes the swap must preserve exactly.
headwords.push(
  {
    english: 'melting point',
    pos: null,
    translations: [
      { icelandic: 'bræðslumark', inflections: null, status: 'approved', subjects: ['chemistry'] },
    ],
  },
  {
    english: 'melting',
    pos: null,
    translations: [
      { icelandic: 'bráðnun', inflections: null, status: 'approved', subjects: ['chemistry'] },
    ],
  },
  {
    english: 'mass',
    pos: null,
    translations: [
      { icelandic: 'massi', inflections: null, status: 'approved', subjects: ['chemistry'] },
    ],
  },
  {
    english: 'atomic mass',
    pos: null,
    translations: [
      { icelandic: 'atómmassi', inflections: null, status: 'approved', subjects: ['chemistry'] },
    ],
  }
);

// --- Segments: EN must actually contain the headwords, or the oracle compares empties. ---
const segments = [
  {
    segmentId: 'm001:para:fs-id0001',
    enContent: 'The atomic mass unit is defined so that mass can be compared.',
    isContent: 'Atómmassaeiningin er skilgreind þannig að massa megi bera saman.',
  },
  {
    segmentId: 'm001:para:fs-id0002',
    enContent: 'Melting occurs at the melting point of the substance.',
    isContent: 'Bráðnun verður við bræðslumark efnisins.',
  },
  {
    segmentId: 'm001:para:fs-id0003',
    enContent: 'mass spectrometry uses bitmasses and mass units',
    isContent: 'Massagreining notar bitmassa og massaeiningar.',
  },
  {
    segmentId: 'm001:para:fs-id0004',
    enContent: 'A catalyst lowers the activation energy of the reaction.',
    isContent: 'Efnahvati lækkar virkjunarorku efnahvarfsins.',
  },
  {
    segmentId: 'm001:para:fs-id0005',
    enContent: 'The cell membrane regulates transport.',
    isContent: 'Frumuhimnan stýrir flutningi.',
  },
  {
    segmentId: 'm001:para:fs-id0006',
    enContent: 'Measure the pH and record W for each sample.',
    isContent: 'Mældu sýrustig og skráðu vatt fyrir hvert sýni.',
  },
  {
    segmentId: 'm001:para:fs-id0007',
    enContent: 'One mole of gas occupies a fixed volume.',
    isContent: 'Eitt mól af gasi tekur fast rúmmál.',
  },
  {
    segmentId: 'm001:para:fs-id0008',
    enContent: 'ATP powers the reaction inside the cell.',
    isContent: 'ATP knýr efnahvarfið innan frumunnar.',
  },
  { segmentId: 'm001:para:fs-id0009', enContent: '', isContent: '' },
  {
    segmentId: 'm001:para:fs-id0010',
    enContent: 'No glossary term appears in this sentence at all.',
    isContent: 'Ekkert hugtak birtist í þessari setningu.',
  },
];
// Pad to >=20 segments using real corpus sentences so the multi-segment path is real.
for (let i = 0; i < 14; i++) {
  const r = rows[i * 7];
  segments.push({
    segmentId: `m002:para:fs-id${String(i).padStart(4, '0')}`,
    enContent: `A ${r.english} is described here, and the bond matters.`,
    isContent: `Hér er ${r.icelandic} lýst, og efnatengi skiptir máli.`,
  });
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'c24-terms.json'), JSON.stringify({ headwords }, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'c24-segments.json'), JSON.stringify(segments, null, 1) + '\n');
console.log(
  `wrote ${headwords.length} headwords, ` +
    `${headwords.reduce((n, h) => n + h.translations.length, 0)} translations, ` +
    `${segments.length} segments`
);
