/**
 * Shared structural-marker rules (SR-OOS-2, design D1/D2).
 * Table-driven: one violating and one passing case per hard block,
 * warning cases, and the identity case. These rules are the single
 * source of truth for both client panes AND the server backstop.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { validateStructure } = require('../public/js/segment-validation');

function codes(result) {
  return (result.blocked || []).map((v) => v.code);
}

describe('hard blocks', () => {
  const HARD_CASES = [
    {
      name: 'math-missing: [[MATH:N]] in EN must appear in edited IS',
      en: 'Energy [[MATH:1]] equals',
      orig: 'Orka [[MATH:1]] jafngildir',
      bad: 'Orka jafngildir',
      good: 'Orka jafngildir [[MATH:1]]',
      code: 'math-missing',
    },
    {
      name: 'br-removed: [[BR]] count must not decrease vs original IS',
      en: 'Line one',
      orig: 'Lína eitt[[BR]]lína tvö',
      bad: 'Lína eitt lína tvö',
      good: 'Lína eitt[[BR]]lína tvö breytt',
      code: 'br-removed',
    },
    {
      name: 'xref-missing: [#CNX_...] in EN must appear in edited IS',
      en: 'See [#CNX_Chem_05_02]',
      orig: 'Sjá [#CNX_Chem_05_02]',
      bad: 'Sjá myndina',
      good: 'Sjá [#CNX_Chem_05_02] hér',
      code: 'xref-missing',
    },
    {
      name: 'link-removed: [text](url) in original IS must be kept',
      en: 'plain',
      orig: 'Sjá [hlekkinn](#anchor) hér',
      bad: 'Sjá hlekkinn hér',
      good: 'Hér er [hlekkinn](#anchor)',
      code: 'link-removed',
    },
    {
      name: 'docref-missing: [doc#target] in EN must appear in edited IS',
      en: 'See [m68674#fs-id123]',
      orig: 'Sjá [m68674#fs-id123]',
      bad: 'Sjá tilvísunina',
      good: 'Tilvísun: [m68674#fs-id123]',
      code: 'docref-missing',
    },
    {
      name: 'media-missing: [[MEDIA:N]] in EN must appear in edited IS',
      en: 'Figure [[MEDIA:2]]',
      orig: 'Mynd [[MEDIA:2]]',
      bad: 'Mynd',
      good: '[[MEDIA:2]] Mynd',
      code: 'media-missing',
    },
    {
      name: 'space-removed: [[SPACE]] count must not decrease vs original IS',
      en: 'a b',
      orig: 'a[[SPACE]]b',
      bad: 'a b',
      good: 'a[[SPACE]]b og c',
      code: 'space-removed',
    },
  ];

  for (const c of HARD_CASES) {
    it(`${c.name} — violating edit is blocked`, () => {
      const result = validateStructure(c.en, c.orig, c.bad);
      expect(codes(result)).toContain(c.code);
    });
    it(`${c.name} — conforming edit passes`, () => {
      const result = validateStructure(c.en, c.orig, c.good);
      expect(codes(result)).not.toContain(c.code);
    });
  }

  it('identity edit passes every original-IS rule', () => {
    const orig = 'a[[SPACE]]b[[BR]][hlekkur](#x)';
    const result = validateStructure('a b', orig, orig);
    expect(result.blocked).toBeNull();
  });

  it('params carry the offending marker (math)', () => {
    const result = validateStructure('x [[MATH:7]]', 'y', 'y');
    const v = result.blocked.find((b) => b.code === 'math-missing');
    expect(v.params.marker).toBe('[[MATH:7]]');
  });

  it('br-removed params carry from/to counts', () => {
    const result = validateStructure('', 'a[[BR]]b[[BR]]c', 'a[[BR]]bc');
    const v = result.blocked.find((b) => b.code === 'br-removed');
    expect(v.params).toEqual({ from: 2, to: 1 });
  });
});

describe('seg-marker-injected: literal SEG marker in edited content (8th hard block)', () => {
  // Content containing a literal segment marker passes every other guard
  // today and corrupts segment boundaries on apply (parseSegments splits on
  // this exact token; an injected marker can even shadow a different
  // segment via last-wins duplicate handling). Checks both marker dialects'
  // openings: the canonical `<!-- SEG:` (tools/lib/seg-markers.cjs
  // SEG_MARKER) and the legacy `{{SEG:` mustache form
  // (segmentParser.parseSegments normalizes it before parsing).
  it('violating: HTML comment form (<!-- SEG:) is blocked', () => {
    const result = validateStructure('en', 'orig', 'texti <!-- SEG:m1:para:x --> meira');
    expect(codes(result)).toContain('seg-marker-injected');
  });

  it('violating: legacy mustache form ({{SEG:) is blocked', () => {
    const result = validateStructure('en', 'orig', 'texti {{SEG:m1:para:x}} meira');
    expect(codes(result)).toContain('seg-marker-injected');
  });

  // Whitespace tolerance (final-review N1): both parsers accept
  // `<!--\s*SEG:` (tools/lib/seg-markers.cjs:13, segmentParser.js:25), so
  // zero- and multi-space variants corrupt boundaries on apply just the same.
  it('violating: zero-space HTML form (<!--SEG:) is blocked', () => {
    const result = validateStructure('en', 'orig', 'texti <!--SEG:m1:para:x--> meira');
    expect(codes(result)).toContain('seg-marker-injected');
  });

  it('violating: two-space HTML form (<!--  SEG:) is blocked', () => {
    const result = validateStructure('en', 'orig', 'texti <!--  SEG:m1:para:x --> meira');
    expect(codes(result)).toContain('seg-marker-injected');
  });

  it('passing: content free of both marker forms is not blocked', () => {
    const result = validateStructure('en', 'orig', 'venjulegur texti án merkja');
    expect(codes(result)).not.toContain('seg-marker-injected');
  });

  it('passing: identity edit where the baseline is clean passes', () => {
    const orig = 'hreinn texti án merkja';
    const result = validateStructure('en', orig, orig);
    expect(result.blocked).toBeNull();
  });
});

describe('warnings (advisory — never enforced server-side)', () => {
  it('odd ** count → unmatched-pair (bold)', () => {
    const result = validateStructure('', 'a', 'feitletrað ** stakt');
    const w = (result.warnings || []).find((x) => x.code === 'unmatched-pair');
    expect(w).toBeTruthy();
    expect(w.params.marker).toBe('**');
  });

  it('{= without =} → unmatched-emphasis', () => {
    const result = validateStructure('', 'a', '{= áhersla');
    expect((result.warnings || []).map((w) => w.code)).toContain('unmatched-emphasis');
  });

  it('odd tilde → unmatched-subscript; ~~ ignored', () => {
    const odd = validateStructure('', 'a', 'H~2O');
    expect((odd.warnings || []).map((w) => w.code)).toContain('unmatched-subscript');
    const strike = validateStructure('', 'a', 'texti ~~yfirstrikað~~ texti');
    expect((strike.warnings || []).map((w) => w.code)).not.toContain('unmatched-subscript');
  });

  it('odd caret → unmatched-superscript', () => {
    const result = validateStructure('', 'a', 'Ca^2+');
    expect((result.warnings || []).map((w) => w.code)).toContain('unmatched-superscript');
  });

  it('cleared segment → segment-cleared', () => {
    const result = validateStructure('', 'innihald', '   ');
    expect((result.warnings || []).map((w) => w.code)).toContain('segment-cleared');
  });

  it('clean edit → both null', () => {
    const result = validateStructure('plain', 'hreint', 'hreint breytt');
    expect(result.blocked).toBeNull();
    expect(result.warnings).toBeNull();
  });
});

// G1.11 (spec docs/superpowers/specs/2026-11-21-c248-g111-toolbar-dialect-and-marker-gate-design.md §4.3):
// the bracket-marker rules reach every consumer through validateStructure.
describe('the bracket-marker rules ride on validateStructure', () => {
  it('a dropped [[sub:]] is blocked as marker-dropped', () => {
    expect(validateStructure('H[[sub:2]]O', 'H[[sub:2]]O', 'H2O').blocked).toContainEqual({
      code: 'marker-dropped',
      params: { type: 'sub', from: 1, to: 0 },
    });
  });

  it('an added empty marker is blocked as marker-empty', () => {
    expect(codes(validateStructure('x', 'x', 'x [[term:]]'))).toContain('marker-empty');
  });

  it('with { localization: true } a dropped [[sup:]] only warns ([USER] 2026-11-22, §C248)', () => {
    const res = validateStructure('14.7 lb/in[[sup:2]]', '14,7 lb/in[[sup:2]]', '101 kPa', {
      localization: true,
    });
    expect(res.blocked).toBeNull();
    expect(res.warnings).toContainEqual({
      code: 'formatting-dropped',
      params: { type: 'sup', from: 1, to: 0 },
    });
  });

  // Review Focus 2: no real segment, saved unchanged, gains a block from the new rules.
  it('an unchanged save of every chemistry segment gains no bracket-marker block', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
    const NEW_BLOCKS = ['marker-spaced', 'marker-unbalanced', 'marker-empty', 'marker-dropped'];
    const segs = (file) => {
      const m = new Map();
      if (!fs.existsSync(file)) return m;
      const text = fs.readFileSync(file, 'utf8');
      const re = /<!--\s*SEG:([^\s>]+)\s*-->([\s\S]*?)(?=<!--\s*SEG:|$)/g;
      let x;
      while ((x = re.exec(text)) !== null) m.set(x[1], x[2].trim());
      return m;
    };
    const book = path.join(repo, 'books', 'efnafraedi-2e');
    let pairs = 0;
    const hits = [];
    for (const ch of fs
      .readdirSync(path.join(book, '02-mt-output'))
      .filter((d) => /^(ch\d\d|appendices)$/.test(d))) {
      for (const f of fs
        .readdirSync(path.join(book, '02-mt-output', ch))
        .filter((x) => x.endsWith('-segments.is.md'))) {
        const is = segs(path.join(book, '02-mt-output', ch, f));
        const en = segs(path.join(book, '02-for-mt', ch, f.replace('.is.md', '.en.md')));
        for (const [id, isText] of is) {
          if (!en.has(id)) continue;
          pairs++;
          const blocked = validateStructure(en.get(id), isText, isText).blocked || [];
          for (const v of blocked) if (NEW_BLOCKS.includes(v.code)) hits.push(`${id} ${v.code}`);
        }
      }
    }
    expect(pairs).toBeGreaterThan(20000);
    expect(hits).toEqual([]);
  });
});
