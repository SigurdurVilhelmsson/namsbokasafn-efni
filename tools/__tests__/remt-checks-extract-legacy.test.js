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
 * every population measured — 491 modules carrying both sides (149 chemistry + 342 organic;
 * 166 before §C82's re-extract) and, separately, all 794 committed live EN+IS segment files
 * across the two kept books (440 before), re-RUN 2026-09-02 at {PASS 794, FAIL 0, SKIPPED 0}
 * over 69,381 segments with a spiked real file FAILing in the same command — which is exactly
 * what a wholly broken detector returns. The planted control separates the two readings.
 *
 * 🔴 AND AS OF 2026-09-02 E1 HAS NO NATURAL MUST-TRIP LEFT IN EITHER BOOK: chemistry's 104
 * mustache carriers went to 0 at §C82's re-extract and organic was always 0, so the
 * discriminating corpus PAIR this file was built on no longer exists. Every remaining
 * fire-evidence for E1 is PLANTED — 'FAILS on a PLANTED {{…}} marker', 'detects every
 * mustache tag the dialect defines', 'anchors the ++ count to the SOURCE element count' and
 * the in-test spike below. They are load-bearing alone now and must not be trimmed.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runCheck, VERDICT, REGISTRY } from '../lib/remt-battery.js';
import {
  E1,
  E3,
  E6,
  EXTRACT_CHECKS,
  XML_RESIDUE_TAGS,
  classifyEmittedFile,
  backupSourceOf,
  countUnderlineElements,
} from '../lib/remt-checks-extract.js';
import {
  modulesWithSegments,
  srcText,
  segTextOf,
  modCtx,
  REPO_ROOT as ROOT,
} from './helpers/remt-corpus.js';

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
    // 🔴 RE-PLANTED 2026-09-02, NOT RE-BASELINED. This pinned m68742's corpus figures
    // {sourceElements: 19, regexHits: 27} until the §C82 re-extract rewrote all 27 `++X++`
    // as `[[u:X]]` (cnxml-extract.js:373) — substituted value for value, 20 C / 6 O / 1 CC
    // on both sides. 0 `++` hits remain in any of the 574 live `-segments.en.md` files across
    // both books, so E1's `if (plusHits.length > 0)` branch is unreachable FROM DATA.
    // ▶ The two `sourceElements` assertions below are the ONLY ones in the repo — the other
    // two grep hits, remt-checks-mt.test.js:267/272, assert the field's ABSENCE — so bumping
    // the numbers to `undefined` or deleting the test would leave `countUnderlineElements`
    // and the whole {sourceElements, regexHits} anchoring contract with ZERO coverage.
    const cnxml = synthCnxml(
      'm00001',
      '<para id="p1">x <emphasis effect="underline">C</emphasis></para>'
    );
    const dup = synthSeg('m00001', 'x ++C++'); // one source element, two seg-blocks
    const r = await runCheck(E1, { cnxml, segText: dup + dup });
    const f = r.findings.find((x) => x.dialect === '++');
    expect(f.sourceElements).toBe(1);
    expect(f.regexHits).toBe(2);
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

  it('MUST-NOT-TRIP over the committed chemistry corpus — the 104 carriers were repaired by the re-extract', async () => {
    const mods = modulesWithSegments('efnafraedi-2e');
    // ⚠️ POPULATION: modules carrying BOTH an `01-source` cnxml and a segment file — 149,
    // not the 170 EN segment FILES chemistry holds (the extra 21 are `chapter-metadata`
    // units with no source counterpart). Chemistry is unmoved at 149 across the re-extract.
    // 🔴 RE-BASELINED 2026-09-02. This asserted `tripped === 104` — 1,644 mustache
    // occurrences across 104 of these modules — until §C82's re-extract emitted bracket
    // markers for all of them. Re-verified by replaying the UNCHANGED E1 over the
    // pre-re-extract bytes (`git show 5895a25b:…-segments.en.md`) against this same 149-module
    // population and the same unchanged `01-source`: {PASS 45, FAIL 104, SKIPPED 0}, mustache
    // 1,644 in 104 files, `++` 49 hits in 6. The instrument did not move; the corpus did.
    // ⚠️ `passed` IS LOAD-BEARING: `tripped` counts only FAIL, so `tripped === 0` is equally
    // satisfied by 149 SKIPPEDs — i.e. by a ctx-guard or loader regression. Pinning the PASS
    // count is what stops this going green on a battery that inspected nothing.
    expect(mods.length).toBe(149); // control: an empty walk must not pass
    let tripped = 0;
    let passed = 0;
    for (const { ch, m } of mods) {
      const r = await runCheck(E1, modCtx('efnafraedi-2e', ch, m));
      if (r.verdict === VERDICT.FAIL) tripped++;
      if (r.verdict === VERDICT.PASS) passed++;
    }
    expect(tripped).toBe(0);
    expect(passed).toBe(149);

    // ⚠️ AND THE PAIRED POSITIVE CONTROL, ON THIS SAME CORPUS DATA rather than in another
    // `it()`: 149 PASSes mean nothing unless E1 can still FAIL on these exact bytes.
    const { ch, m } = mods[0];
    const spiked = segTextOf('efnafraedi-2e', ch, m).replace(/\n/, '\na {{i}}leak{{/i}} here\n');
    const control = await runCheck(E1, { cnxml: srcText('efnafraedi-2e', ch, m), segText: spiked });
    expect(control.verdict).toBe(VERDICT.FAIL);
    expect(control.findings[0]).toMatchObject({ dialect: '{{}}', occurrences: 2 });
  });

  it('MUST-NOT-TRIP over organic — 0 of 342, the whole book since §C82 re-extracted it', async () => {
    const mods = modulesWithSegments('lifraen-efnafraedi');
    // 🔴 RE-BASELINED 2026-09-02, 17 → 342. §C82's re-extract was organic's FIRST full run,
    // so every one of its 342 `01-source` modules now carries a segment file and this
    // MUST-NOT-TRIP covers the whole book. Derived, not copied: 342 is organic's `01-source`
    // .cnxml count, and its `-segments.en.md` count equals it exactly.
    // ⚠️ THE OLD TITLE'S ", the control that the 104 above means something" CLAUSE IS GONE ON
    // PURPOSE: chemistry's mustache carriers went to 0 in the same re-extract, so the two
    // books no longer form a discriminating pair. ALL of E1's fire-evidence is now the
    // PLANTED controls above (:62, :72, :93) — do not trim one.
    expect(mods.length).toBe(342); // organic's full 01-source module count
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
    // ⚠️ WIDENED 2026-08-25 from the spec's original seven, after measuring the cost: the
    // seven and this set both find 0 occurrences across all 440 committed EN+IS segment
    // files, so the widening is free on a blocking gate. The pin moved in the commit that
    // widened it, which is the whole point of pinning it.
    expect([...XML_RESIDUE_TAGS]).toEqual([
      'emphasis',
      'term',
      'link',
      'note',
      'para',
      'entry',
      'row',
      'media',
      'image',
      'list',
      'item',
      'title',
      'caption',
      'table',
      'tgroup',
      'code',
      'footnote',
      'quote',
      'figure',
      'section',
      'exercise',
      'problem',
      'solution',
      'definition',
      'newline',
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
    expect(files).toBe(491); // control: 149 chemistry + 342 organic modules with both sides
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

  it('PASSES a backup ACCOMPANIED by its own rewritten file — safeWrite doing its job', async () => {
    // 🔴 THE FIX FOR THE WORST FALSE-HALT IN TIER 1. `safeWrite` copies the existing file to
    // `${path}.backup.${ISO}` unconditionally and `cnxml-extract.js` calls it five times per
    // module, so a listing scoped exactly as E6 demands — what THIS run emitted — always
    // contains fresh backups for any module that already had output. Flagging them made E6
    // unable to pass ANY re-extract, and "loops until clean" could never converge. This test
    // asserted FAIL until 2026-08-25.
    const r = await runCheck(E6, {
      emittedFiles: ['m1-segments.en.md', 'm1-segments.en.md.backup.2026-08-12T13-43-10'],
    });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(2);
    expect(r.message).toContain('1 backups accounted for');
  });

  it('FAILS an ORPHAN backup — one whose base file this run did not write', async () => {
    const r = await runCheck(E6, {
      emittedFiles: ['m1-segments.en.md', 'm2-structure.json.backup.2026-08-12T13-43-10'],
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings[0].kind).toBe('unexpected-file:orphan-backup');
  });

  it('accounts for a backup listed BEFORE its base file — safeWrite writes the backup first', async () => {
    const r = await runCheck(E6, {
      emittedFiles: ['m1-segments.en.md.backup.2026-08-12T13-43-10', 'm1-segments.en.md'],
    });
    expect(r.verdict).toBe(VERDICT.PASS);
  });

  it('accounts for all five outputs of a real re-extract', async () => {
    const stem = [
      'segments.en.md',
      'structure.json',
      'equations.json',
      'inline-attrs.json',
      'manifest.json',
    ];
    const emitted = stem.flatMap((x) => [`m68663-${x}`, `m68663-${x}.backup.2026-08-25T06-36-58`]);
    const r = await runCheck(E6, { emittedFiles: emitted });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(10);
  });

  it('FAILS a Dirent-shaped entry it cannot read, rather than passing over it', async () => {
    // 🔴 `String(dirent)` is "[object Object]", which matches neither pattern — so the most
    // idiomatic loader (`readdirSync(dir, {withFileTypes: true})`) made a directory full of
    // backups classify as CLEAN at the correct examined count. Dirents are now READ; anything
    // else is a finding.
    const dirents = [
      { name: 'm1-segments.en.md' },
      { name: 'm2-old.json.backup.2026-01-01T00-00-00' },
    ];
    const ok = await runCheck(E6, { emittedFiles: dirents });
    expect(ok.verdict).toBe(VERDICT.FAIL); // the orphan backup is seen through the Dirent
    expect(ok.findings[0].kind).toBe('unexpected-file:orphan-backup');

    const junk = await runCheck(E6, { emittedFiles: [42, null, { size: 10 }] });
    expect(junk.verdict).toBe(VERDICT.FAIL);
    // 🔴 THE LENGTH ASSERTION IS LOAD-BEARING — `[].every(...)` IS VACUOUSLY TRUE. A mutation
    // removing the `name === null` guard makes `name.split('/')` throw; runCheck converts that
    // to FAIL with `findings: []`, and an `every()` check alone passed over the empty array.
    // Measured as a mutation ESCAPE before this line was added. The verdict is right for the
    // wrong reason there — a thrown TypeError, not a classified entry — which is exactly the
    // difference the count catches.
    expect(junk.findings).toHaveLength(3);
    expect(junk.findings.every((f) => f.kind === 'unexpected-file:unreadable-entry')).toBe(true);
    expect(junk.examined).toBe(3);
  });

  it('PASSES the real generated trees — the tree-scope false halt is discharged, not merely scoped away', async () => {
    // 🔴 THIS PINS §C82 L29's DISCHARGE. The first draft of E6 (and of L29) asserted that a
    // tree-scoped listing "hands E6 thousands of orphans". It does not — a tree listing
    // contains the base files too, so every backup resolves. Corpus-wide: 14,634 backups,
    // 0 orphans. If a future change reintroduces the false halt, this goes red.
    // ⚠️ PREMISE PIN over generated trees (§C82 L20) — these counts move at the re-extract.
    const walk = (d, out = []) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        e.isDirectory() ? walk(p, out) : out.push(e.name);
      }
      return out;
    };
    const listing = (b, tree) => walk(path.join(ROOT, 'books', b, tree));

    // 🔴 THE BACKUP FILES ARE GITIGNORED, SO CI AND A DEV BOX ARE DIFFERENT POPULATIONS —
    // MEASURED, and it turned this test red on PR #416 while `npm test` was green locally.
    // `.gitignore:18-20` hides all three backup shapes, so a fresh checkout holds 535 tracked
    // files under chemistry's `02-structure` where this machine has 12,035. ▶ The INVARIANT is
    // asserted unconditionally; the MAGNITUDE only where backups actually exist — and the branch
    // keys on the gate's own reported count, so it cannot silently degrade into asserting nothing.
    const structure = await runCheck(E6, {
      emittedFiles: listing('efnafraedi-2e', '02-structure'),
    });
    expect(structure.examined).toBeGreaterThan(500); // control: an empty walk must not pass
    expect(structure.verdict).toBe(VERDICT.PASS);

    const accounted = Number(structure.message.match(/(\d+) backups accounted for/)?.[1] ?? 0);
    if (accounted > 0) {
      // A tree that has actually run the extractor: every backup is accounted for by a file the
      // same listing contains, which is precisely the §C82 L32 repair.
      expect(structure.examined).toBeGreaterThan(10000);
      expect(structure.findings).toHaveLength(0);
    }

    for (const b of ['lifraen-efnafraedi']) {
      for (const tree of ['02-for-mt', '02-structure']) {
        const r = await runCheck(E6, { emittedFiles: listing(b, tree) });
        expect(r.verdict, `${b}/${tree}`).toBe(VERDICT.PASS);
      }
    }

    // Chemistry's 02-for-mt is the one FAIL, and ONLY on the 49 duplicates — 0 orphan backups.
    const forMt = await runCheck(E6, { emittedFiles: listing('efnafraedi-2e', '02-for-mt') });
    expect(forMt.verdict).toBe(VERDICT.FAIL);
    const kinds = {};
    for (const f of forMt.findings) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
    expect(kinds).toEqual({ 'unexpected-file:duplicate': 49 });
  });

  it('backupSourceOf recognises every backup spelling, and nothing else', () => {
    expect(backupSourceOf('x.en.md.backup.2026-08-12T13-43-10')).toBe('x.en.md');
    expect(backupSourceOf('x.en.md.backup')).toBe('x.en.md');
    expect(backupSourceOf('x.en.md.2026-08-12-1802.bak')).toBe('x.en.md');
    expect(backupSourceOf('x.en.md.bak')).toBe('x.en.md');
    expect(backupSourceOf('x.en.md')).toBeNull();
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
    expect(EXTRACT_CHECKS.map((c) => c.id)).toEqual([
      'E1',
      'E2',
      'E3',
      'E4',
      'E5',
      'E6',
      'E7',
      'E9',
    ]);
    for (const id of ['E1', 'E3', 'E6']) expect(REGISTRY.get(id)?.id).toBe(id);
  });

  it('E1, E3 and E6 are blocking Tier-1 gates', () => {
    for (const c of [E1, E3, E6]) {
      expect(c.tier).toBe(1);
      expect(c.blocking).toBe(true);
    }
  });
});

describe('findings from the blind adversarial review', () => {
  it('E3 catches a CLOSING tag — it watched only half the syntax', async () => {
    // Measured PASS/examined 1 before the fix. A dangling closer is exactly as much
    // angle-bracket noise to the paid MT as an opener.
    for (const frag of ['leaked close</emphasis> here', 'x</para>', 'y</entry>']) {
      const r = await runCheck(E3, { segText: `<!-- SEG:m1:para:p1 -->\n${frag}\n` });
      expect(r.verdict, frag).toBe(VERDICT.FAIL);
    }
  });

  it('E3 still reports the tag NAME for a closing match, not "/emphasis"', async () => {
    const r = await runCheck(E3, { segText: '<!-- SEG:m1:para:p1 -->\nx</emphasis>\n' });
    expect(r.findings[0].tag).toBe('emphasis');
  });

  it('E6 catches a NUMERIC parenthesised duplicate, not only a lettered one', () => {
    expect(classifyEmittedFile('m1-segments(1).en.md')).toBe('duplicate');
    expect(classifyEmittedFile('m1-segments(12).en.md')).toBe('duplicate');
    expect(classifyEmittedFile('m1-segments(b).en.md')).toBe('duplicate');
  });

  it('E6 leaves a CHEMICAL FORMULA alone — the `)\\.` anchor is what makes widening safe', () => {
    // 🔴 MEASURED over 9,537 `01-source` filenames: 5 contain a parenthesis. Four are `(N)`
    // download duplicates byte-identical to an existing original; one is a formula. Widening
    // the character class WITHOUT the `)\.` anchor would false-halt on chemistry filenames.
    expect(classifyEmittedFile('CNX_Chem_11_02_Fe(NO3)3_img.jpg')).toBeNull();
    expect(classifyEmittedFile('CNX_APPhysics_22_M2_arrows(d2)_img.jpg')).toBeNull();
    expect(classifyEmittedFile('Figure_20_05_06(b)a.jpg')).toBeNull();
  });
});
