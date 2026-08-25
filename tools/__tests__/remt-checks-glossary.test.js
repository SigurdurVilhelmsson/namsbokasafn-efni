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

const atSha = (sha) =>
  JSON.parse(
    execFileSync('git', ['show', `${sha}:${GLOSSARY}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 256e6,
    })
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

  it('the wire is SMALLER than the file — a file-reading gate judges the wrong population', () => {
    const raw = live('efnafraedi-2e');
    const file = glossaryTerms(raw).length;
    const wire = wireTerms(raw).length;
    expect(file).toBeGreaterThan(0); // control: an empty read must not pass
    expect(wire).toBeLessThan(file);
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
    const before = await runCheck(G2, { glossary: atSha(BEFORE_C73) });
    const after = await runCheck(G2, { glossary: atSha(AFTER_C73) });
    expect(before.verdict).toBe(VERDICT.FAIL);
    expect(before.findings).toHaveLength(44);
    expect(after.verdict).toBe(VERDICT.PASS);
    expect(after.findings).toHaveLength(0);
    // Both arms examined a real population — a broken loader would give 0 findings twice.
    expect(after.examined).toBeGreaterThan(1000);
  });

  it('names the offending pair, so the finding is actionable without re-running', async () => {
    const before = await runCheck(G2, { glossary: atSha(BEFORE_C73) });
    expect(before.findings).toContainEqual({
      kind: 'element-suffix',
      english: 'barium',
      icelandic: 'barín',
    });
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

  it('🔴 FIRES ON BOTH LIVE BOOKS TODAY — a natural known-bad fixture, which is what lets it block', async () => {
    // ⚠️ PREMISE PIN over live glossary DATA: this goes green when the entries are fixed,
    // which is the point of Tier 0. Update it in the commit that fixes them.
    const chem = await runCheck(G3, { glossary: live('efnafraedi-2e') });
    const org = await runCheck(G3, { glossary: live('lifraen-efnafraedi') });
    expect(chem.verdict).toBe(VERDICT.FAIL);
    expect(org.verdict).toBe(VERDICT.FAIL);
    expect(chem.findings.map((f) => f.english).sort()).toEqual(['AM', 'As', 'in', 'is', 'no']);
    expect(org.findings.map((f) => f.english).sort()).toEqual(['As', 'OR', 'in', 'is', 'no']);
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

  it('PASSES a well-formed payload — the positive control', async () => {
    const r = await runCheck(G5, { payloadText: JSON.stringify({ terms: [] }) });
    expect(r.verdict).toBe(VERDICT.PASS);
    expect(r.examined).toBe(1);
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

  it('does NOT import server/ — the MIT→AGPL edge is avoided by spawning', () => {
    const src = fs.readFileSync(path.join(ROOT, 'tools/lib/remt-checks-glossary.js'), 'utf8');
    // Both shapes root LICENSE's enumeration cares about: a literal '../server/…' and a
    // path.join(..., 'server', ...) require, which a '../server/' grep cannot see.
    expect(src).not.toMatch(/from\s+['"][^'"]*\/server\//);
    expect(src).not.toMatch(/require\(\s*['"][^'"]*\/server\//);
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
