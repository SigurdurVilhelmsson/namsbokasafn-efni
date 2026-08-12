import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  unwrapInventedMarkers,
  KNOWN_BRACKET_TYPES,
  BRACKET_MARKER_TYPES,
  translateChunk,
} from '../api-translate.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Fixtures ────────────────────────────────────────────────────────────────
// Every string below is copied byte-for-byte out of the committed corpus file
// books/lifraen-efnafraedi/02-mt-output/ch03/m00033-segments.is.md (register
// §C67 class 3). Retyping marker fixtures is how the C16 re-attach plan ended
// up with ten silently-non-parsing SEG markers — so these are not retyped.

/** Both halves of the invented marker are Icelandic: type name = the glossary
 *  targetWord (`molecule → sameind`), payload = the inflected translation. */
const TYPED_LINE =
  '[[b:Nokkrar framsetningar á bútani, C[[sub:4]]H[[sub:10]].]] [[sameind|Sameindin]] er sú sama óháð því hvernig hún er teiknuð.';

/** Bare shape — same mechanism, no payload. `bond → efnatengi`, `nitrogen → nitur`. */
const BARE_LINE =
  'Við vitum að kolefni myndar fjögur [[efnatengi]], [[nitur]] myndar þrjú og vetni myndar eitt.';

/** An invented marker and a REAL `[[i:]]` in one segment — the case a flat
 *  `[^\]]*` pattern breaks on. */
const MIXED_LINE =
  'Viðskeytinu -[[i:an]] er bætt við enda hvers nafns til að gefa til kynna að [[sameind|sameindin]] sem um ræðir sé alkani. Þannig er [[i:pent]]an fimm kolefnisatoma alkani, [[i:hex]]an er sex kolefnisatoma alkani og svo framvegis. Við munum brátt sjá að þessi alkanaheiti mynda grunninn að nafngiftum allra annarra [[lífrænn|lífrænna]] [[efnasamband|efnasambanda]], svo það ætti að leggja að minnsta kosti þau tíu fyrstu á minnið.';

describe('unwrapInventedMarkers — the typed shape [[<glossary-target>|<inflected>]]', () => {
  it('replaces the marker with its payload and leaves the surrounding prose intact', () => {
    const { text } = unwrapInventedMarkers(TYPED_LINE);
    expect(text).toContain('Sameindin er sú sama');
    expect(text).not.toContain('[[sameind|');
  });

  it('reports what it unwrapped so the count is never silent', () => {
    const { unwrapped } = unwrapInventedMarkers(TYPED_LINE);
    expect(unwrapped).toEqual([{ type: 'sameind', inner: 'Sameindin' }]);
  });

  it('leaves a real nested [[b:…[[sub:…]]…]] marker byte-identical', () => {
    const { text } = unwrapInventedMarkers(TYPED_LINE);
    expect(text).toContain('[[b:Nokkrar framsetningar á bútani, C[[sub:4]]H[[sub:10]].]]');
  });

  it('unwraps every invented marker in a segment that also carries real ones', () => {
    const { text, unwrapped } = unwrapInventedMarkers(MIXED_LINE);
    expect(unwrapped.map((u) => u.type)).toEqual(['sameind', 'lífrænn', 'efnasamband']);
    expect(text).toContain('að sameindin sem um ræðir sé alkani');
    expect(text).toContain('annarra lífrænna efnasambanda');
    // the three real [[i:]] markers survive untouched
    expect(text).toContain('-[[i:an]]');
    expect(text).toContain('[[i:pent]]an');
    expect(text).toContain('[[i:hex]]an');
  });
});

describe('unwrapInventedMarkers — the bare shape [[<glossary-target>]]', () => {
  it('replaces a bare invented token with the word itself', () => {
    const { text } = unwrapInventedMarkers(BARE_LINE);
    expect(text).toBe(
      'Við vitum að kolefni myndar fjögur efnatengi, nitur myndar þrjú og vetni myndar eitt.'
    );
  });

  it('reports a bare unwrap with inner equal to the type', () => {
    const { unwrapped } = unwrapInventedMarkers(BARE_LINE);
    expect(unwrapped).toEqual([
      { type: 'efnatengi', inner: 'efnatengi' },
      { type: 'nitur', inner: 'nitur' },
    ]);
  });
});

describe('unwrapInventedMarkers — the known-type set is the whole safety argument', () => {
  // These are the markers a wrong set would EAT. Each is a real type produced
  // by our own pipeline; destroying one is silent data loss.
  const REAL_MARKERS = [
    '[[i:vatn]]',
    '[[b:feitletrað]]',
    '[[sub:2]]',
    '[[sup:2+]]',
    '[[u:undir]]',
    '[[em:áhersla]]',
    '[[link:lotukerfið|https://example.com/pt]]',
    '[[xref:table-00002]]',
    '[[docref:m68674#fs-id123]]',
    '[[term:efnatengi|term-00001]]',
    '[[fn:neðanmálsgrein|fn-00001]]',
    '[[MEDIA:1]]',
    '[[lb:x]]',
    '[[rb:y]]',
    '[[MATH:1]]',
    '[[TABLE:fs-idm84550336]]',
    '[[SPACE:2]]',
    '[[SPACE]]',
    '[[BR]]',
    '[[term]]',
    '[[/term]]',
    '[[fn]]',
    '[[/fn]]',
  ];

  it.each(REAL_MARKERS)('leaves the real marker %s untouched', (marker) => {
    const text = `Fyrir ${marker} eftir.`;
    const { text: out, unwrapped } = unwrapInventedMarkers(text);
    expect(out).toBe(text);
    expect(unwrapped).toEqual([]);
  });

  it('protects [[TABLE:…]], which BRACKET_MARKER_TYPES does not contain', () => {
    // Guards the exact defect this function was nearly shipped with: the
    // register's prescribed set was BRACKET_MARKER_TYPES ∪ {MATH, BR, SPACE},
    // which omits TABLE — 13 real TABLE markers live in efnafraedi-2e.
    expect(BRACKET_MARKER_TYPES).not.toContain('TABLE');
    expect(KNOWN_BRACKET_TYPES.has('TABLE')).toBe(true);
  });

  it('covers every type BRACKET_MARKER_TYPES declares', () => {
    for (const t of BRACKET_MARKER_TYPES) expect(KNOWN_BRACKET_TYPES.has(t)).toBe(true);
  });

  // Drift guard: MATH/TABLE/SPACE/BR are owned by the editor client, not by
  // this module. If a type is added there, this fails rather than silently
  // letting the unwrap eat it. Read in Node, never grep — committed files in
  // this repo hold raw NUL bytes (grep goes silent) and raw U+0001 (grep's
  // output lies).
  it('knows every atomic marker type the editor client enumerates', () => {
    const src = fs.readFileSync(path.join(REPO, 'server/public/js/marker-highlight.js'), 'utf8');
    const declared = new Set(
      [...src.matchAll(/\\\[\\\[([A-Za-z][A-Za-z0-9_]*)/g)].map((m) => m[1])
    );
    expect(declared.size).toBeGreaterThan(0); // control: the scan must find some
    for (const t of declared) expect(KNOWN_BRACKET_TYPES.has(t)).toBe(true);
  });
});

describe('unwrapInventedMarkers — a literal "[" abutting a real marker', () => {
  // Both strings are copied byte-for-byte out of the committed corpus file
  // books/efnafraedi-2e/02-for-mt/ch06/m68733-segments.en.md. Square brackets
  // are ordinary chemistry notation (units, qualifiers), so `[` + `[[i:v]]`
  // yields a literal `[[[i:` run. A scanner that anchors on the FIRST `[[`
  // reads the type as `[i`, calls it unknown, and destroys a real marker.
  // Found by running the shipped function over the corpus — every unit test
  // above was green, and all of them used input the author invented.
  it('leaves "[[[i:v]], m/s]" byte-identical', () => {
    const real = 'this equation involves velocity [[[i:v]], m/s], not frequency [[[i:ν]], Hz].';
    expect(unwrapInventedMarkers(real)).toEqual({ text: real, unwrapped: [] });
  });

  it('leaves "[[[i:s]] orbitals]" byte-identical', () => {
    const real = 'but some quantum orbitals [[[i:s]] orbitals] can have zero angular momentum).';
    expect(unwrapInventedMarkers(real)).toEqual({ text: real, unwrapped: [] });
  });

  it('still unwraps an invented marker that a literal "[" abuts', () => {
    const { text, unwrapped } = unwrapInventedMarkers('mælt [[[sameind|Sameindin]], g] hér');
    expect(text).toBe('mælt [Sameindin, g] hér');
    expect(unwrapped).toEqual([{ type: 'sameind', inner: 'Sameindin' }]);
  });
});

describe('unwrapInventedMarkers — nesting and payload integrity', () => {
  it('does not truncate a payload that itself contains a real marker', () => {
    const { text, unwrapped } = unwrapInventedMarkers('A [[sameind|C[[sub:4]]H[[sub:10]]]] B');
    expect(text).toBe('A C[[sub:4]]H[[sub:10]] B');
    expect(unwrapped).toEqual([{ type: 'sameind', inner: 'C[[sub:4]]H[[sub:10]]' }]);
  });

  it('keeps a payload tail containing a second separator verbatim', () => {
    // Split at the FIRST separator only; the rest of the payload is opaque.
    const { unwrapped } = unwrapInventedMarkers('X [[sameind|a|b]] Y');
    expect(unwrapped).toEqual([{ type: 'sameind', inner: 'a|b' }]);
  });

  it('is a no-op on text with no markers at all', () => {
    const clean = 'Venjulegur texti án nokkurra merkja.';
    expect(unwrapInventedMarkers(clean)).toEqual({ text: clean, unwrapped: [] });
  });

  it('leaves an unterminated opener alone rather than eating the rest of the text', () => {
    const broken = 'A [[sameind|Sameindin er sú sama';
    expect(unwrapInventedMarkers(broken)).toEqual({ text: broken, unwrapped: [] });
  });

  it('ignores a bracket run whose "type" contains whitespace — that is prose, not a marker', () => {
    const prose = 'Sjá [[tafla 3 og 4|bls. 12]] í bókinni.';
    expect(unwrapInventedMarkers(prose)).toEqual({ text: prose, unwrapped: [] });
  });

  it('leaves an unknown CLOSING-shaped token alone', () => {
    // `[[/x]]` is the wire dialect's closing shape. Unwrapping one would emit a
    // stray `/x`; there is no evidence the MT invents these, so stay conservative.
    const t = 'A [[/óþekkt]] B';
    expect(unwrapInventedMarkers(t)).toEqual({ text: t, unwrapped: [] });
  });
});

// ── Wiring ──────────────────────────────────────────────────────────────────

const SEG = (id, body) => `<!-- SEG:${id} -->\n${body}\n`;

/** Minimal fake Málstaður client: returns whatever the script tells it to. */
function fakeClient(responses) {
  let i = 0;
  return {
    translateAuto: async () => ({ text: responses[Math.min(i++, responses.length - 1)], usage: 1 }),
  };
}

describe('translateChunk unwraps invented markers on BOTH API paths', () => {
  const input = SEG('m1:para:a', 'Carbon forms four bonds.');

  it('unwraps on the main path', async () => {
    const out = await translateChunk(
      fakeClient([SEG('m1:para:a', 'Kolefni myndar fjögur [[efnatengi]].')]),
      input,
      null,
      false,
      'chunk-1'
    );
    expect(out.text).toContain('fjögur efnatengi.');
    expect(out.text).not.toContain('[[efnatengi]]');
  });

  it('unwraps on the retry-without-glossary path', async () => {
    // First response drops the SEG marker → validateMarkers fails → retry.
    const glossary = { name: 'g', terms: [{ sourceWord: 'bond', targetWord: 'efnatengi' }] };
    const out = await translateChunk(
      fakeClient([
        'Kolefni myndar fjögur [[efnatengi]].', // no SEG marker → triggers retry
        SEG('m1:para:a', 'Kolefni myndar fjögur [[efnatengi]] alls.'),
      ]),
      input,
      glossary,
      false,
      'chunk-2'
    );
    expect(out.text).toContain('fjögur efnatengi alls.');
    expect(out.text).not.toContain('[[efnatengi]]');
  });

  it('reports what it unwrapped so a run summary can surface it', async () => {
    const out = await translateChunk(
      fakeClient([SEG('m1:para:a', 'Kolefni myndar fjögur [[efnatengi]] og [[nitur|nitri]].')]),
      input,
      null,
      false,
      'chunk-4'
    );
    expect(out.unwrapped).toEqual([
      { type: 'efnatengi', inner: 'efnatengi' },
      { type: 'nitur', inner: 'nitri' },
    ]);
  });

  it('aggregates the unwrap count to the module level and writes clean output', async () => {
    const { translateModule } = await import('../api-translate.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c67-'));
    const inPath = path.join(dir, 'm9-segments.en.md');
    const outPath = path.join(dir, 'm9-segments.is.md');
    fs.writeFileSync(inPath, '<!-- SEG:m9:para:a -->\nCarbon forms four bonds.\n');
    const client = {
      async translateAuto() {
        return {
          text: '<!-- SEG:m9:para:a -->\nKolefni myndar fjögur [[efnatengi]].\n',
          usage: 1,
        };
      },
    };
    const res = await translateModule(client, inPath, outPath, null, false);
    expect(res.unwrapped).toHaveLength(1);
    expect(fs.readFileSync(outPath, 'utf8')).toContain('fjögur efnatengi.');
  });

  // Regression guard, not a feature test — this passed before the unwrap existed
  // and must keep passing.
  it('does not disturb the term/fn round-trip it runs alongside', async () => {
    const withTerm = SEG('m1:para:b', 'A [[term:bond|term-00001]] here.');
    const out = await translateChunk(
      fakeClient([SEG('m1:para:b', 'Eitt [[term]]efnatengi[[/term]] hér.')]),
      withTerm,
      null,
      false,
      'chunk-3'
    );
    expect(out.text).toContain('[[term:efnatengi|term-00001]]');
    expect(out.mismatches).toEqual([]);
  });
});
