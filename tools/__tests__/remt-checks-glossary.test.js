/**
 * Tier 0 — G1-G5, the glossary gates.
 *
 * 🔴 EVERY PREDICATE HERE IS MEASURED AGAINST THE WIRE BODY, NOT THE FILE, and the tests say
 * so because the two are different populations: `formatGlossary` omits contested headwords and
 * comma-list values, so today's chemistry glossary is 2,021 file terms and 2,017 wire terms.
 * A gate reading the file judges entries the MT will never see.
 *
 * ⚠️ THE G2 FIXTURE IS A GIT-BLOB PIN, NOT A WORKING-TREE PIN. Unlike every `02-for-mt` pin in
 * Tier 1, it does not move at the re-extract; only a history rewrite invalidates it. If the
 * shas ever stop resolving, the spec's own rule applies — re-derive an equivalent pair and
 * record the new shas, do NOT silently drop the fixture, because a G2 with no known-bad
 * fixture cannot be blocking.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCheck, VERDICT, REGISTRY } from '../lib/remt-battery.js';
import {
  G1,
  G2,
  G3,
  G4,
  G5,
  GLOSSARY_CHECKS,
  FUNCTION_WORDS,
  glossaryTerms,
  wireTerms,
  spawnGlossaryPayloadCheck,
} from '../lib/remt-checks-glossary.js';
import { REPO_ROOT as ROOT } from './helpers/remt-corpus.js';

const BEFORE_C73 = '120352b0';
const AFTER_C73 = 'b665c43d';
const GLOSSARY = 'books/efnafraedi-2e/glossary/glossary-unified.json';

/**
 * 🔴 CI CHECKS OUT SHALLOW, SO THE GIT-BLOB FIXTURE IS NOT AVAILABLE THERE — MEASURED, and it
 * turned this file red on PR #416 while `npm test` was green locally. `.github/workflows/test.yml`
 * uses `actions/checkout@v7` with no `fetch-depth`, which defaults to depth 1, so
 * `git show 120352b0:…` cannot resolve. ▶ The fixture is therefore COMMITTED at
 * `fixtures/c73-ium-terms.json`, and the blobs are used — when they resolve — only to prove the
 * committed copy has not drifted from them. **A local green was never evidence about CI**, and a
 * corpus test that reads git history is testing the developer's clone.
 * ⚠️ Deliberately NOT solved by adding `fetch-depth: 0`: `.git` here is 4.2 GB.
 */
const blobsResolvable = (() => {
  try {
    execFileSync('git', ['cat-file', '-e', `${BEFORE_C73}:${GLOSSARY}`], { cwd: ROOT });
    execFileSync('git', ['cat-file', '-e', `${AFTER_C73}:${GLOSSARY}`], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
})();

const atSha = (sha) =>
  JSON.parse(
    execFileSync('git', ['show', `${sha}:${GLOSSARY}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 256e6,
    })
  );

/** The committed slice: only `-ium` headwords, verified to yield the same finding count. */
const IUM_FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tools/__tests__/fixtures/c73-ium-terms.json'), 'utf8')
);
const live = (book) =>
  JSON.parse(
    fs.readFileSync(path.join(ROOT, 'books', book, 'glossary', 'glossary-unified.json'), 'utf8')
  );

const term = (english, icelandic, status = 'approved') => ({ english, icelandic, status });

describe('the wire body is the population every Tier-0 predicate reads', () => {
  it('glossaryTerms accepts both committed shapes and REFUSES an unusable one', () => {
    expect(glossaryTerms([term('a', 'b')])).toHaveLength(1);
    expect(glossaryTerms({ terms: [term('a', 'b')] })).toHaveLength(1);
    // null, not [] — an empty array would flow on and read as "a glossary with no defects".
    expect(glossaryTerms(null)).toBeNull();
    expect(glossaryTerms({ producer: 'x' })).toBeNull();
    expect(glossaryTerms('a string')).toBeNull();
  });

  it('the wire is SMALLER than the file whenever anything is omitted — the MECHANISM', () => {
    // 🔴 PINNED ON A SYNTHETIC FIXTURE, NOT ON THE LIVE CORPUS. This used to read the
    // committed chemistry glossary and assert `wire < file`, which held only because that
    // file contained term competitions. The 2026-08-30 glossary cleanup removed them
    // (§C82 L151), so on the live corpus the two are now EQUAL and the old form failed —
    // correctly, but for a reason that says nothing about the mechanism it names.
    // A planted competition exercises the omission path directly and cannot evaporate.
    const raw = {
      producer: 'test',
      terms: [term('atom', 'frumeind'), term('atom', 'atóm'), term('bond', 'tengi')],
    };
    const file = glossaryTerms(raw).length;
    const wire = wireTerms(raw).length;
    expect(file).toBe(3); // control: the fixture really carries three rows
    expect(wire).toBe(1); // both `atom` candidates omitted; only `bond` survives
    expect(wire).toBeLessThan(file);
  });

  it('📌 PREMISE — the live books now omit NOTHING, so file === wire on both', () => {
    // The other half of the statement above, over real data. This is a PREMISE PIN on
    // glossary DATA: it goes red if a competition or comma-list is reintroduced, which is
    // the state G1 exists to block. If it fails, read G1's verdict before touching this.
    for (const slug of ['efnafraedi-2e', 'lifraen-efnafraedi']) {
      const raw = live(slug);
      const file = glossaryTerms(raw).length;
      expect(file, `${slug}: empty read`).toBeGreaterThan(0); // control
      expect(wireTerms(raw).length, `${slug}: something is being omitted again`).toBe(file);
    }
  });
});

describe('G1 — competitions and comma lists', () => {
  it('FAILS a planted competition', async () => {
    const r = await runCheck(G1, {
      glossary: [term('atom', 'frumeind'), term('atom', 'atóm'), term('bond', 'tengi')],
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.examined).toBe(3);
  });

  it('PASSES a clean glossary — the positive control', async () => {
    const r = await runCheck(G1, { glossary: [term('atom', 'frumeind'), term('bond', 'tengi')] });
    expect(r.verdict).toBe(VERDICT.PASS);
  });

  it('DECLARES its blind spot in the message, not only in a comment', async () => {
    // G1 detects competitions; a single-valued WRONG entry is not a competition, so the whole
    // §C73/§C77 class is invisible to it. A reader must not take this PASS as "glossary sound".
    const r = await runCheck(G1, { glossary: [term('magnesium', 'magnesín')] });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.message).toMatch(/BLIND/);
  });

  it('SKIPS an unusable glossary rather than reporting a clean empty', async () => {
    const r = await runCheck(G1, { glossary: null });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
  });
});

describe('G2 — the §C73 element-suffix rule', () => {
  it('fires 44 times on the pre-§C73 chemistry glossary and 0 after it', async () => {
    // Runs EVERYWHERE, from the committed slice — this is the known-bad fixture that lets G2
    // be blocking, so it must not depend on clone depth.
    const before = await runCheck(G2, { glossary: IUM_FIXTURE.before });
    const after = await runCheck(G2, { glossary: IUM_FIXTURE.after });
    expect(before.verdict).toBe(VERDICT.FAIL);
    expect(before.findings).toHaveLength(44);
    expect(after.verdict).toBe(VERDICT.PASS);
    expect(after.findings).toHaveLength(0);
    // Control: both arms examined a real population, so a broken loader cannot read as "clean".
    expect(before.examined).toBeGreaterThan(40);
    expect(after.examined).toBeGreaterThan(15);
  });

  it('names the offending pair, so the finding is actionable without re-running', async () => {
    const before = await runCheck(G2, { glossary: IUM_FIXTURE.before });
    expect(before.findings).toContainEqual({
      kind: 'element-suffix',
      english: 'barium',
      icelandic: 'barín',
    });
  });

  it('the committed fixture still matches the real git blobs (skipped on a shallow clone)', async () => {
    // 🔴 THE DRIFT CHECK, and it is what keeps the slice honest. It runs on a full clone and is
    // SKIPPED — loudly, never silently — where history is absent. `blobsResolvable` is computed
    // from `git cat-file -e`, so this cannot quietly stop running on a machine that HAS the
    // history: a shallow clone is the only thing that suppresses it.
    if (!blobsResolvable) {
      expect(blobsResolvable).toBe(false); // records WHY this assertion did not run
      return;
    }
    for (const [key, sha] of [
      ['before', BEFORE_C73],
      ['after', AFTER_C73],
    ]) {
      const full = await runCheck(G2, { glossary: atSha(sha) });
      const slice = await runCheck(G2, { glossary: IUM_FIXTURE[key] });
      expect(full.findings.length, `${key}: slice must reproduce the full blob`).toBe(
        slice.findings.length
      );
      expect(full.examined).toBeGreaterThan(1000); // the full blob is a real population
    }
  });

  it('accepts the CORRECT -íum ending — asserted by a TEST, since no branch can express it', async () => {
    // 🔴 An earlier draft carried a `!/íum$/i` exclusion beside a comment claiming it was not
    // redundant. It was dead code: the -ín test requires a final `n` and `íum` ends in `m`, so
    // nothing can match both. Deleting it left every test green — mutation testing found it.
    // This assertion is what actually pins the correct form passing.
    const ok = await runCheck(G2, { glossary: [term('magnesium', 'magnesíum')] });
    expect(ok.verdict).toBe(VERDICT.PASS);
    const bad = await runCheck(G2, { glossary: [term('magnesium', 'magnesín')] });
    expect(bad.verdict).toBe(VERDICT.FAIL);
  });

  it('catches the UNACCENTED -in too — a planted control, since all 44 real ones use -ín', async () => {
    // Narrowing /[ií]n$/ to /ín$/ left the suite green until this fixture existed: the corpus
    // exercises only the accented spelling, so the breadth was untested rather than verified.
    const r = await runCheck(G2, { glossary: [term('helium', 'helin')] });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings[0]).toMatchObject({ english: 'helium', icelandic: 'helin' });
  });

  it('is clean on both live glossaries today', async () => {
    for (const b of ['efnafraedi-2e', 'lifraen-efnafraedi']) {
      expect((await runCheck(G2, { glossary: live(b) })).verdict, b).toBe(VERDICT.PASS);
    }
  });
});

describe('G3 — function-word headwords (§C77)', () => {
  it('catches all four of §C77s named instances — the DERIVATION covers them', () => {
    // 🔴 These are a VALIDATION of the closed-class derivation, not its source. The plan
    // forbids hand-copying §C77's table into the stoplist, because a list fitted to known
    // instances finds no future homograph.
    for (const w of ['is', 'no', 'in', 'at']) expect(FUNCTION_WORDS.has(w), w).toBe(true);
  });

  it('does NOT fire on element symbols or unit abbreviations — the false-halt control', async () => {
    // MEASURED: 118 chemistry and 57 organic headwords are <=3 chars and are almost all
    // legitimate. A min-length rule would halt both books on a blocking gate.
    const r = await runCheck(G3, {
      glossary: [
        term('Fe', 'járn'),
        term('Ag', 'silfur'),
        term('Hz', 'herts'),
        term('ATP', 'adenosínþrífosfat'),
        term('Zn', 'sink'),
      ],
    });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(5);
  });

  it('matches case-INSENSITIVELY, because filterGlossaryForText does', async () => {
    // `As→arsen` is arsenic, and also a homograph of the conjunction "as" under a
    // case-insensitive substring match — which is what actually primes the MT.
    const r = await runCheck(G3, { glossary: [term('As', 'arsen')] });
    expect(r.verdict).toBe(VERDICT.FAIL);
  });

  it('✅ PASSES ON BOTH LIVE BOOKS SINCE 2026-08-30 — the entries it fired on were removed', async () => {
    // 🔴 THIS PIN WAS INVERTED ON 2026-08-30, EXACTLY AS ITS PREVIOUS FORM INSTRUCTED.
    // It used to assert FAIL on both books and carried the note: "PREMISE PIN over live
    // glossary DATA: this goes green when the entries are fixed, which is the point of
    // Tier 0. Update it in the commit that fixes them." The entries were fixed — the
    // glossary cleanup (§C82 L151) dropped the foreign-domain fall-through that supplied
    // `is → lófalægur`, `in → tomma`, `no → blóð-` and the rest — so this now pins the
    // CLEAN state and reddens if any of them returns.
    // ⚠️ The mechanism is pinned above on synthetic fixtures (`As → arsen` etc.), so G3's
    // detector is NOT resting on live data; only this regression guard is.
    const chem = await runCheck(G3, { glossary: live('efnafraedi-2e') });
    const org = await runCheck(G3, { glossary: live('lifraen-efnafraedi') });
    expect(chem.examined, 'examined 0 would make PASS meaningless').toBeGreaterThan(0); // control
    expect(chem.verdict).toBe(VERDICT.PASS);
    expect(org.verdict).toBe(VERDICT.PASS);
    // ⚠️ THIS LIST USED TO CARRY SEVEN ENTRIES PER BOOK and is now EMPTY, which is the
    // whole point of the change that emptied it. For the record of what G3 was firing on
    // before 2026-08-30 — chemistry `AM As in is minus no plus`, organic `As OR in is
    // minus no plus`, of which `plus→plús` and `minus→mínus` were BENIGN (same-sense, and
    // reported only because G3 knows homography and not sense) — see §C82 L142/L151. The
    // five real ones went with the foreign-domain fall-through.
    // 🔴 ASSERTED AS EMPTY RATHER THAN DELETED: an absent assertion would let any of them
    // return unnoticed, and the message names what a non-empty result means.
    expect(
      chem.findings.map((f) => f.english).sort(),
      'a function-word headword is back in chemistry'
    ).toEqual([]);
    expect(
      org.findings.map((f) => f.english).sort(),
      'a function-word headword is back in organic'
    ).toEqual([]);
  });
});

describe('G4 — cross-book disagreement, ADVISORY', () => {
  it('is advisory, so a WARN cannot halt a paid run', () => {
    expect(G4.blocking).toBe(false);
  });

  it('SKIPS on fewer than two books rather than reporting agreement it never tested', async () => {
    const r = await runCheck(G4, { glossariesByBook: { a: [term('x', 'y')] } });
    expect(r.verdict).toBe(VERDICT.SKIPPED);
    expect(r.examined).toBe(0);
  });

  it('WARNs when one headword resolves differently across books', async () => {
    const r = await runCheck(G4, {
      glossariesByBook: {
        a: [term('cell', 'fruma')],
        b: [term('cell', 'sella')],
      },
    });
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.findings[0].english).toBe('cell');
  });

  it('PASSES when the books agree — the control for the WARN above', async () => {
    const r = await runCheck(G4, {
      glossariesByBook: { a: [term('cell', 'fruma')], b: [term('cell', 'fruma')] },
    });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(1);
  });

  it('declares that it is blind to anything UNIFORMLY wrong', async () => {
    const r = await runCheck(G4, {
      glossariesByBook: { a: [term('magnesium', 'magnesín')], b: [term('magnesium', 'magnesín')] },
    });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.message).toMatch(/BLIND to anything uniformly wrong/);
  });
});

describe('G5 — the committed payload', () => {
  it('REFUSES the 4-byte null payload — the §C21 type collision', async () => {
    const r = await runCheck(G5, { payloadText: 'null' });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings[0].reason).toContain('null');
  });

  it('refuses every other non-object representation of "nothing"', async () => {
    for (const text of ['[]', '42', '"a string"', '', '   ', '{oops']) {
      const r = await runCheck(G5, { payloadText: text });
      expect(r.verdict, JSON.stringify(text)).toBe(VERDICT.FAIL);
    }
  });

  it('PASSES a well-formed payload WITH a producer verdict — the positive control', async () => {
    const r = await runCheck(G5, {
      payloadText: JSON.stringify({ terms: [] }),
      payloadVerdict: { kind: 'ok', producer: 'export-terminology-resolved' },
    });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(1);
  });

  it('🔴 does NOT pass when the producer leg was never run — a not-run leg is a FINDING', async () => {
    // The §C14 ②/§C21 wholesale-producer-swap class: a merge-glossary-shaped payload has a
    // perfectly well-formed wire, so G1/G2/G3 all PASS. G5's producer check is the ONLY detector,
    // and it read PASS with the caveat in `message` — but `exitCodeFor` reads verdicts, not
    // messages. This is the same defect E9 was fixed for three commits earlier.
    const mergeShaped = {
      terms: [{ english: 'atom', icelandic: 'frumeind', status: 'approved' }],
      category: 'x',
    };
    const r = await runCheck(G5, { payloadText: JSON.stringify(mergeShaped) });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings.find((f) => f.kind === 'leg-not-checked')?.leg).toBe('producer');
    // and the rest of the battery really is green over it, which is why G5 must not be
    for (const c of [G1, G2, G3]) {
      expect((await runCheck(c, { glossary: mergeShaped })).verdict, c.id).toBe(VERDICT.PASS);
    }
  });

  it('FAILS an unrecognised producer when the loader supplied a spawned verdict', async () => {
    const r = await runCheck(G5, {
      payloadText: JSON.stringify({ terms: [] }),
      payloadVerdict: { kind: 'ok', producer: 'unknown' },
    });
    expect(r.verdict).toBe(VERDICT.FAIL);
  });

  it('says in its message that the SHRINK guard was not evaluated', async () => {
    // Emitting PASS for a comparison that never happened is §C60 with extra steps.
    const r = await runCheck(G5, { payloadText: JSON.stringify({ terms: [] }) });
    expect(r.message).toMatch(/SHRINK guard is NOT evaluated/);
  });

  it('SKIPS when no payload bytes were supplied', async () => {
    expect((await runCheck(G5, {})).verdict).toBe(VERDICT.SKIPPED);
  });
});

describe('the G5 spawn helper — the licence boundary in practice', () => {
  it('runs the AGPL CLI in a SEPARATE PROCESS and parses its verdict', async () => {
    const v = await spawnGlossaryPayloadCheck(path.join(ROOT, GLOSSARY));
    expect(v.kind).toBe('ok');
    expect(typeof v.producer).toBe('string');
    expect(v.producer).not.toBe('unknown');
  });

  it('classifies the null payload through the spawn, matching G5s own classification', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g5-'));
    try {
      const p = path.join(dir, 'glossary-unified.json');
      fs.writeFileSync(p, 'null');
      const v = await spawnGlossaryPayloadCheck(p);
      expect(v.kind).toBe('corrupt');
      expect(v.producer).toBe('unknown');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports an absent file as absent, not as a clean pass', async () => {
    const v = await spawnGlossaryPayloadCheck('/nonexistent/glossary-unified.json');
    expect(v.kind).toBe('absent');
  });

  it('REJECTS when the child produces no parseable JSON, rather than resolving something', async () => {
    // 🔴 THE FAILURE PATH IS THE ONE THAT MATTERS. A helper that resolved a default on a
    // broken child would hand G5 a verdict nobody computed; a driver that swallows the
    // rejection instead turns a BLOCKING check into a silent SKIP. Two ways the child can
    // fail, both asserted, both with stderr attached so the cause is not lost.
    await expect(
      spawnGlossaryPayloadCheck('/x.json', { repoRoot: os.tmpdir() }) // CLI not there at all
    ).rejects.toThrow(/no parseable JSON/);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g5-fail-'));
    try {
      fs.mkdirSync(path.join(dir, 'server', 'scripts'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'server', 'scripts', 'check-glossary-payload.js'),
        'process.stdout.write("not json at all"); process.stderr.write("boom");'
      );
      await expect(spawnGlossaryPayloadCheck('/x.json', { repoRoot: dir })).rejects.toThrow(/boom/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does NOT import server/ — and the guard covers the shape a `/server/` grep cannot see', () => {
    // 🔴 THE THIRD REGEX IS THE POINT, AND ITS ABSENCE WAS A COMMENT GENERALISING PAST ITS CODE
    // — the same shape as §C82 L39, in this same file, written in the commit that fixed L39's
    // other instance. The old comment claimed to check "a path.join(..., 'server', ...) require,
    // which a '../server/' grep cannot see"; MEASURED, neither of the two regexes matched
    // `require(path.join(root, 'server', 'lib', 'glossaryProducer'))`, because both demand a
    // literal `/server/` INSIDE a quoted string — which the path.join shape by construction
    // never has. root LICENSE's own gap-E-2 note names both shapes for exactly this reason.
    const src = fs.readFileSync(path.join(ROOT, 'tools/lib/remt-checks-glossary.js'), 'utf8');
    const literalImport = /from\s+['"][^'"]*\/server\//;
    const literalRequire = /require\(\s*['"][^'"]*\/server\//;
    const joinedRequire = /(?:require|import)\([^)]*\bpath\.join\([^)]*['"]server['"]/;

    expect(src).not.toMatch(literalImport);
    expect(src).not.toMatch(literalRequire);
    expect(src).not.toMatch(joinedRequire);

    // POSITIVE CONTROLS — a guard that matches nothing is indistinguishable from one that works.
    expect("import x from '../server/lib/glossaryProducer.js';").toMatch(literalImport);
    expect("const x = require('../../server/lib/glossaryProducer');").toMatch(literalRequire);
    expect("const m = require(path.join(root, 'server', 'lib', 'glossaryProducer'));").toMatch(
      joinedRequire
    );
  });
});

describe('findings from the blind Tier-0 review', () => {
  it('G3 covers whole paradigms, not a sample of them', () => {
    // The holes were in the DERIVATION: up/out/over/under present but `down` absent;
    // within/without but not inside/outside; few/many/more/most but not less/least; each but
    // not every. A paradigm with one member missing falsifies "this IS the closed classes".
    for (const w of [
      'down',
      'inside',
      'outside',
      'less',
      'least',
      'every',
      'one',
      'since',
      'until',
    ]) {
      expect(FUNCTION_WORDS.has(w), w).toBe(true);
    }
  });

  it('G2/G3 judge the union of BOTH wire populations — a paid caller sends approvedOnly:false', async () => {
    // `translate-chapter-titles.js` passes approvedOnly:false to the same paid API. A `pending`
    // row carrying CLAUDE.md's own worked §C73 example took the whole battery green before this.
    const g = [
      { english: 'atom', icelandic: 'frumeind', status: 'approved' },
      { english: 'magnesium', icelandic: 'magnesín', status: 'pending' },
    ];
    const r = await runCheck(G2, { glossary: g });
    expect(r.verdict).toBe(VERDICT.FAIL);
    expect(r.findings[0]).toMatchObject({ english: 'magnesium', icelandic: 'magnesín' });
  });

  it('G1 counts the rows it JUDGED, so an all-unapproved glossary SKIPs like its siblings', async () => {
    const pending = [
      { english: 'atom', icelandic: 'frumeind', status: 'pending' },
      { english: 'atom', icelandic: 'atóm', status: 'pending' },
    ];
    const r = await runCheck(G1, { glossary: pending });
    expect(r.verdict).toBe(VERDICT.SKIPPED); // was PASS at examined 2, having judged 0
    expect(r.examined).toBe(0);
  });

  it('G4 reports a book it could not read instead of silently comparing fewer', async () => {
    const r = await runCheck(G4, {
      glossariesByBook: {
        a: [{ english: 'cell', icelandic: 'fruma', status: 'approved' }],
        b: { producer: 'x' },
      },
    });
    expect(r.verdict).toBe(VERDICT.WARN);
    expect(r.findings.find((f) => f.kind === 'unreadable-book')?.book).toBe('b');
  });

  it('a malformed row SKIPs every gate identically, instead of splitting them', async () => {
    // G1 used to PASS (its instrument has a `t &&` guard) while G2 FAILed with a bare
    // "Cannot read properties of null" — one glossary, two verdicts, and a cause-free message.
    const g = [{ english: 'atom', icelandic: 'frumeind', status: 'approved' }, null];
    for (const c of [G1, G2, G3]) {
      const r = await runCheck(c, { glossary: g });
      expect(r.verdict, c.id).toBe(VERDICT.SKIPPED);
    }
  });
});

describe('registration', () => {
  it('registers all five at tier 0 with the spec blocking split', () => {
    expect(GLOSSARY_CHECKS.map((c) => c.id)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5']);
    for (const c of GLOSSARY_CHECKS) expect(c.tier).toBe(0);
    expect(Object.fromEntries(GLOSSARY_CHECKS.map((c) => [c.id, c.blocking]))).toEqual({
      G1: true,
      G2: true,
      G3: true,
      G4: false, // the only advisory Tier-0 gate — catches 3 of §C73's 44
      G5: true,
    });
    for (const id of ['G1', 'G2', 'G3', 'G4', 'G5']) expect(REGISTRY.get(id)?.id).toBe(id);
  });
});
