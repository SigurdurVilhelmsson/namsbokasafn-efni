/**
 * Tier 1 — E1 (legacy marker dialects), E3 (raw XML residue), E6 (unexpected files).
 *
 * 🔴 EVERY SHOULD-TRIP HERE IS PLANTED, AND THAT IS §C82 L27 APPLIED RATHER THAN QUOTED.
 * All three of these checks draw their natural fixtures from trees the loop itself rewrites:
 * E1's and E3's from `02-for-mt`, E6's from the generated `02-*` trees. The re-extract
 * repairs every one of them BY DESIGN — emitting bracket markers is the whole point — so a
 * corpus-only must-trip would go green at exactly the moment the check stops being exercised.
 * ▶ So each check has a planted control that no re-extract can reach, and the corpus numbers
 * below are labelled PREMISE PINS: when they move that is the corpus changing, not a
 * regression, and they are updated in the commit that observes it (§C82 L20).
 *
 * ⚠️ THE MUST-NOT-TRIP CONTROLS ARE LOAD-BEARING, NOT DECORATION. E3's base rate is 0 over
 * every population measured — 166 modules carrying both sides, and separately all 440
 * committed EN+IS segment files across the two kept books — which is exactly what a wholly
 * broken detector returns. The planted control is what separates the two readings.
 */
import { describe, it, expect } from 'vitest';
import { runCheck, VERDICT, REGISTRY } from '../lib/remt-battery.js';
import {
  E1,
  E3,
  E6,
  EXTRACT_CHECKS,
  XML_RESIDUE_TAGS,
  classifyEmittedFile,
  countUnderlineElements,
} from '../lib/remt-checks-extract.js';
import { modulesWithSegments, srcText, segTextOf, modCtx } from './helpers/remt-corpus.js';

/**
 * A minimal well-formed module, built so a planted segment string can reach E1's judgement.
 * `skipIfCtxUnusable` asserts identity and source non-emptiness, so a planted ctx has to
 * satisfy both — a bare `{segText}` would read SKIPPED and prove nothing about the gate.
 */
const synthCnxml = (id, inner) =>
  `<document xmlns="http://cnx.rice.edu/cnxml">` +
  `<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>${id}</md:content-id></metadata>` +
  `<content>${inner}</content></document>`;

const synthSeg = (id, body) => `<!-- SEG:${id}:para:p1 -->\n${body}\n`;

describe('E1 — legacy inline-marker dialects on the EN side', () => {
  it('FAILS on a PLANTED {{…}} marker — the control that outlives the re-extract', async () => {
    const ctx = {
      cnxml: synthCnxml('m00001', '<para id="p1">x</para>'),
      segText: synthSeg('m00001', 'a {{i}}word{{/i}} here'),
    };
    const r = await runCheck(E1, ctx);
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.find((f) => f.dialect === '{{}}')?.occurrences).toBe(2);
  });

  it('detects every mustache tag the dialect defines, not just {{i}}', async () => {
    for (const tag of ['i', 'b', 'term', 'fn']) {
      const ctx = {
        cnxml: synthCnxml('m00001', '<para id="p1">x</para>'),
        segText: synthSeg('m00001', `a {{${tag}}}word{{/${tag}}} here`),
      };
      const r = await runCheck(E1, ctx);
      expect(r.verdict, `dialect {{${tag}}}`).toBe(VERDICT.FAIL);
    }
  });

  it('PASSES a clean planted segment — the positive control for the FAILs above', async () => {
    const ctx = {
      cnxml: synthCnxml('m00001', '<para id="p1">x</para>'),
      segText: synthSeg('m00001', 'a [[i:word]] here'),
    };
    const r = await runCheck(E1, ctx);
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(1);
  });

  it('anchors the ++ count to the SOURCE element count, never to the regex', async () => {
    // PREMISE PIN over `02-for-mt` — expected to move at the re-extract (§C82 L20).
    // 27 regex hits vs 19 `<emphasis effect="underline">`; the +8 is `++` inside 8 DUPLICATED
    // seg-id blocks, not greedy adjacency as the spec states.
    const r = await runCheck(E1, modCtx('efnafraedi-2e', 'ch07', 'm68742'));
    const f = r.findings.find((x) => x.dialect === '++');
    expect(f.sourceElements).toBe(19);
    expect(f.regexHits).toBe(27);
    expect(f.sourceElements).toBeLessThan(f.regexHits);
  });

  it('countUnderlineElements parses rather than regexes — and agrees on the six carriers', () => {
    // 01-source derived, so STABLE: the read-only tree cannot drift by project rule.
    const mods = [
      ['ch01', 'm68664', 8],
      ['ch01', 'm68670', 6],
      ['ch04', 'm68710', 2],
      ['ch06', 'm68734', 2],
      ['ch07', 'm68742', 19],
      ['ch08', 'm68745', 2],
    ];
    let total = 0;
    for (const [ch, m, n] of mods) {
      const got = countUnderlineElements(srcText('efnafraedi-2e', ch, m));
      expect(got, `${ch}/${m}`).toBe(n);
      total += got;
    }
    expect(total).toBe(39);
  });

  it('counts 0 underline elements in a module that has none — the counter itself is falsifiable', () => {
    expect(countUnderlineElements(synthCnxml('m1', '<para id="p1">plain</para>'))).toBe(0);
    expect(
      countUnderlineElements(
        synthCnxml('m1', '<para id="p1"><emphasis effect="italics">i</emphasis></para>')
      )
    ).toBe(0);
  });

  it('SHOULD-TRIP over the committed chemistry corpus — a PREMISE PIN, red after the re-extract', async () => {
    const mods = modulesWithSegments('efnafraedi-2e');
    // ⚠️ POPULATION: modules carrying BOTH an `01-source` cnxml and a segment file — 149,
    // not the 170 EN segment FILES chemistry holds (the extra 21 are `chapter-metadata`
    // units with no source counterpart). The mustache carriers happen to number 104 under
    // EITHER denominator, which is exactly the coincidence that reads as corroboration.
    expect(mods.length).toBe(149); // control: an empty walk must not pass
    let tripped = 0;
    for (const { ch, m } of mods) {
      const r = await runCheck(E1, modCtx('efnafraedi-2e', ch, m));
      if (r.verdict === VERDICT.FAIL) tripped++;
    }
    expect(tripped).toBe(104);
  });

  it('MUST-NOT-TRIP over organic — 0 of 17, the control that the 104 above means something', async () => {
    const mods = modulesWithSegments('lifraen-efnafraedi');
    expect(mods.length).toBe(17); // 17 of organic's 342 carry a segment file today
    for (const { ch, m } of mods) {
      const r = await runCheck(E1, modCtx('lifraen-efnafraedi', ch, m));
      expect(r.verdict, `${ch}/${m}`).toBe(VERDICT.PASS);
    }
  });

  it('SKIPS rather than passes when the ctx carries nothing — a blocking gate must halt', async () => {
    const r = await runCheck(E1, {});
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.examined).toBe(0);
  });
});

describe('E3 — raw XML residue in segments', () => {
  it('FAILS on a PLANTED control — its natural base rate is 0, so nothing else can falsify it', async () => {
    const r = await runCheck(E3, {
      segText: '<!-- SEG:m1:para:p1 -->\nA <emphasis effect="bold">leak</emphasis> here\n',
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings[0]).toMatchObject({ kind: 'xml-residue', tag: 'emphasis' });
  });

  it('PINS the watched-tag list — a loop over the constant cannot see the constant SHRINK', () => {
    // 🔴 MEASURED MUTATION ESCAPE, and the reason this pin exists. Truncating
    // XML_RESIDUE_TAGS to a single tag left the whole suite GREEN: the loop below iterates
    // the very constant it is meant to guard, so it faithfully tested the one tag that
    // survived. A test derived from the thing under test cannot detect that thing shrinking.
    // ⚠️ INTENTIONAL PIN: the spec says this list "has been widened once already; assume a
    // next tag". A widening SHOULD turn this red — update it in the commit that widens.
    expect([...XML_RESIDUE_TAGS]).toEqual([
      'emphasis',
      'term',
      'link',
      'note',
      'para',
      'entry',
      'row',
    ]);
  });

  it('fires on EVERY tag in XML_RESIDUE_TAGS — the constant and the regex cannot drift apart', async () => {
    expect(XML_RESIDUE_TAGS.length).toBeGreaterThan(0);
    for (const tag of XML_RESIDUE_TAGS) {
      const r = await runCheck(E3, { segText: `<!-- SEG:m1:para:p1 -->\nx <${tag} id="q">y\n` });
      expect(r.verdict, `tag <${tag}>`).toBe(VERDICT.FAIL);
    }
  });

  it('does not fire on a bracket marker that merely NAMES a watched tag', async () => {
    const r = await runCheck(E3, {
      segText: '<!-- SEG:m1:para:p1 -->\nsee [[link:kafli]] and [[term:atom]]\n',
    });
    expect(r.verdict).toBe(VERDICT.PASS);
  });

  it('MUST-NOT-TRIP across the whole committed EN corpus, both books', async () => {
    let files = 0;
    for (const book of ['efnafraedi-2e', 'lifraen-efnafraedi']) {
      for (const { ch, m } of modulesWithSegments(book)) {
        const r = await runCheck(E3, { segText: segTextOf(book, ch, m) });
        expect(r.verdict, `${book}/${ch}/${m}`).toBe(VERDICT.PASS);
        files++;
      }
    }
    expect(files).toBe(166); // control: 149 chemistry + 17 organic modules with both sides
  });

  it('SKIPS on a missing segText and names the cause', async () => {
    const r = await runCheck(E3, {});
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('segText');
  });
});

describe('E6 — unexpected files emitted by the extract', () => {
  it('flags ALL THREE gitignored backup shapes, not just the *.backup.* the spec names', () => {
    expect(classifyEmittedFile('m1-segments.en.md.bak')).toBe('backup');
    expect(classifyEmittedFile('m1-segments.en.md.backup')).toBe('backup');
    expect(classifyEmittedFile('m1-segments.en.md.backup.2026-08-12T13-43-10')).toBe('backup');
    // CLAUDE.md § File Permissions prescribes this fourth spelling; it lands under *.bak
    expect(classifyEmittedFile('m1-segments.2026-08-12-1802.bak')).toBe('backup');
  });

  it('flags the parenthesised duplicates — TRACKED, so git status cannot see them either', () => {
    expect(classifyEmittedFile('m68709-segments(b).en.md')).toBe('duplicate');
    expect(classifyEmittedFile('m68710-segments(d).en.md')).toBe('duplicate');
  });

  it('leaves an ordinary emitted file alone — the positive control for the two above', () => {
    expect(classifyEmittedFile('m68663-segments.en.md')).toBeNull();
    expect(classifyEmittedFile('m68663-manifest.json')).toBeNull();
    expect(classifyEmittedFile('books/x/02-for-mt/ch01/m68663-segments.en.md')).toBeNull();
  });

  it('FAILS a listing carrying a backup, and reports what it examined', async () => {
    const r = await runCheck(E6, {
      emittedFiles: ['m1-segments.en.md', 'm1-segments.en.md.backup.2026-08-12T13-43-10'],
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.examined).toBe(2);
    expect(r.findings).toHaveLength(1);
  });

  it('PASSES a clean listing', async () => {
    const r = await runCheck(E6, { emittedFiles: ['m1-segments.en.md', 'm1-manifest.json'] });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(2);
  });

  it('SKIPS on an EMPTY listing — a sweep of nothing is not a clean sweep', async () => {
    const r = await runCheck(E6, { emittedFiles: [] });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.examined).toBe(0);
  });

  it('SKIPS on a PATH instead of a listing — the gate is pure and takes no directory', async () => {
    const r = await runCheck(E6, { scanDir: '/tmp/whatever' });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.message).toContain('emittedFiles');
  });
});

describe('registration', () => {
  it('registers E1, E3 and E6 alongside the Task 3/4 checks', () => {
    expect(EXTRACT_CHECKS.map((c) => c.id)).toEqual(['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7']);
    for (const id of ['E1', 'E3', 'E6']) expect(REGISTRY.get(id)?.id).toBe(id);
  });

  it('E1, E3 and E6 are blocking Tier-1 gates', () => {
    for (const c of [E1, E3, E6]) {
      expect(c.tier).toBe(1);
      expect(c.blocking).toBe(true);
    }
  });
});
