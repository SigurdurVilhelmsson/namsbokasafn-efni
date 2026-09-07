/**
 * The figure MT leg's glossary wiring — gate 1, INVERTED.
 *
 * 🔴 THE GATE USED TO MEAN "send the glossary, or refuse". Since [USER]
 * 2026-09-06 (on §C133) it means the opposite: this leg loads no glossary at
 * all, and `main` asserts as a pre-flight invariant that no block's options
 * carry `glossaries` before the first paid request. The suite is arranged
 * around that — the wire payload and the two durable run records are the
 * assertions; `glossarySteeredBlocks` is pinned separately because the refusal
 * branch it guards is unreachable while `main` passes a null glossary.
 *
 * ⚠️ THIS FILE LIVES IN `tools/__tests__/` ON PURPOSE, though the module under
 * test is in `experiments/`. Root `vitest.config.js` declares no `include`, so
 * it would in fact discover `experiments/**` today — but only because
 * `vitest.workspace.js` cannot load (CLAUDE.md § Notes for Code Reviewers). The
 * moment that file is repaired, `experiments/` belongs to no project and a test
 * placed there silently stops running. `tools/__tests__/**` is covered by BOTH
 * configs, so this test cannot become a gate that does not exist.
 *
 * ⚠️ NO NETWORK, EVER. The client is a stub and the assertions are about what
 * would ride the wire. `resolveGlossaryOrRefuse` still has its own tests here
 * even though `main` no longer calls it: they are now the ONLY thing keeping
 * its three refusal codes alive, which the function's own banner says.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseFigureArgs,
  resolveGlossaryOrRefuse,
  translateOptsFor,
  glossarySteeredBlocks,
  figureNameFrom,
  main,
} from '../../experiments/figure-text-translation/translate-blocks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The directory every figure USED to share — the thing `--out` exists to stop. */
const SHARED_OUT = path.resolve(HERE, '../../experiments/figure-text-translation/out');

/**
 * Recursive inventory of a directory: one `relpath|size|mtimeMs` row per file,
 * sorted.
 *
 * ⚠️ `null` means the directory does not EXIST, and that is deliberately
 * distinct from `[]` (exists, empty). In CI `out/` is absent — it is gitignored
 * — so an assertion shaped "the file was not created" passes there vacuously.
 * The absent case must still assert something, namely that the run did not
 * bring the shared directory into being.
 *
 * ⚠️ Recursive because the shared tree on a developer box is nested several
 * levels deep (`out/out/out/…`), each level holding a DIFFERENT figure. A
 * `readdirSync` of the top level cannot see a leak into `out/out/`.
 */
function inventory(dir) {
  if (!fs.existsSync(dir)) return null;
  const rows = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const st = fs.statSync(full);
        rows.push(`${path.relative(dir, full)}|${st.size}|${st.mtimeMs}`);
      }
    }
  };
  walk(dir);
  return rows.sort();
}

/**
 * A per-figure `--out` directory holding exactly what the paid stage reads.
 *
 * The figure stem is a SENTINEL (`FIXTURE_ONLY_FIGURE`): a token that cannot
 * have come from the shared `out/`, so `api-run.json`'s `figure` field proves
 * which `meta.json` was actually read rather than merely that a name appeared.
 */
function fixtureOut() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figout-'));
  fs.writeFileSync(
    path.join(dir, 'blocks.json'),
    JSON.stringify([
      {
        key: 'Boiling|point',
        english: 'Boiling point',
        lines: ['Boiling', 'point'],
        arc: false,
        send: true,
      },
      { key: 'Not|sent', english: 'Not sent', lines: ['Not sent'], arc: false, send: false },
    ])
  );
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify({ source: '/nowhere/FIXTURE_ONLY_FIGURE.pdf' })
  );
  return dir;
}

/** A books/ tree holding one book with the given glossary payload. */
function bookTreeWith(payload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figmt-'));
  const glossaryDir = path.join(dir, 'efnafraedi-2e', 'glossary');
  fs.mkdirSync(glossaryDir, { recursive: true });
  if (payload !== null) {
    fs.writeFileSync(path.join(glossaryDir, 'glossary-unified.json'), JSON.stringify(payload));
  }
  return dir;
}

const CELSIUS = {
  terms: [{ english: 'Celsius', icelandic: 'Celsíus', status: 'approved' }],
};

/**
 * What this tool calls: `client.translate(text, opts)` + `client.getUsage()`.
 *
 * `seen` records the OPTS as well as the text, because the wire payload — not
 * stdout — is what gate 1 is about.
 */
function stubClient(seen) {
  return {
    translate: async (text, opts) => {
      seen.push({ text, opts });
      return { text: `IS:${text}` };
    },
    getUsage: () => ({ chars: 13, requests: 1 }),
  };
}

describe('parseFigureArgs', () => {
  it('rejects an unknown flag rather than ignoring it', () => {
    // The CLAUDE.md parseArgs trap one level down: a hand-rolled
    // `argv.includes` drops `--bok` silently and the run sends bare.
    const r = parseFigureArgs(['--bok', 'efnafraedi-2e']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('--bok');
  });

  it('reads the book slug from --book', () => {
    expect(parseFigureArgs(['--book', 'efnafraedi-2e'])).toMatchObject({
      ok: true,
      book: 'efnafraedi-2e',
    });
  });

  it('carries --dry-run and --no-glossary through as flags', () => {
    expect(parseFigureArgs(['--book', 'x', '--dry-run', '--no-glossary'])).toMatchObject({
      ok: true,
      dryRun: true,
      noGlossary: true,
    });
  });
});

describe('resolveGlossaryOrRefuse', () => {
  it('refuses when no book was named', () => {
    // The gate: a bulk run that forgets --book must not reach the paid wire.
    const r = resolveGlossaryOrRefuse({ book: null, booksDir: bookTreeWith(CELSIUS) });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('no-book');
  });

  it('refuses when the named book has no glossary file', () => {
    const r = resolveGlossaryOrRefuse({ book: 'efnafraedi-2e', booksDir: bookTreeWith(null) });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('no-glossary-file');
  });

  it('refuses with a DIFFERENT code when the file loads to zero usable terms', () => {
    // loadGlossary returns null for both, and its own comment says the caller
    // renders them identically. A setup error and a data defect are not the
    // same finding.
    const r = resolveGlossaryOrRefuse({
      book: 'efnafraedi-2e',
      booksDir: bookTreeWith({
        terms: [{ english: 'Celsius', icelandic: '', status: 'approved' }],
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('glossary-unusable');
  });

  it('returns the loaded glossary and its term count for a healthy book', () => {
    const r = resolveGlossaryOrRefuse({ book: 'efnafraedi-2e', booksDir: bookTreeWith(CELSIUS) });
    expect(r).toMatchObject({ ok: true, termCount: 1 });
    expect(r.glossary.terms[0]).toMatchObject({ sourceWord: 'Celsius', targetWord: 'Celsíus' });
  });

  it('allows a deliberate bare run under --no-glossary, the §C73 control path', () => {
    const r = resolveGlossaryOrRefuse({ book: null, noGlossary: true, booksDir: '/nonexistent' });
    expect(r).toMatchObject({ ok: true, glossary: null, termCount: 0 });
  });
});

describe('translateOptsFor', () => {
  const glossary = {
    domain: 'chemistry',
    terms: [{ sourceWord: 'Celsius', targetWord: 'Celsíus' }],
  };

  it('CAN still build a glossaries field — what makes the main() invariant real', () => {
    // Retitled, not deleted, when gate 1 inverted. `main` never hands this
    // function a glossary any more, so its ability to produce the field is the
    // only remaining proof that "no request carried one" is a measurement
    // rather than a property of a function that cannot express it.
    const opts = translateOptsFor(glossary, '100 Celsius degrees');
    expect(opts.glossaries[0].terms).toEqual([{ sourceWord: 'Celsius', targetWord: 'Celsíus' }]);
  });

  it('omits the glossaries field entirely for a block that contains no headword', () => {
    // The negative control. Málstaður is per-request; an empty glossaries array
    // is not the same as no field, and api-translate omits it.
    const opts = translateOptsFor(glossary, 'Freezing point of water');
    expect(opts).not.toHaveProperty('glossaries');
  });

  it('omits the glossaries field when running bare', () => {
    expect(translateOptsFor(null, '100 Celsius degrees')).not.toHaveProperty('glossaries');
  });

  it('always asks for Icelandic', () => {
    expect(translateOptsFor(null, 'x').targetLanguage).toBe('is');
  });
});

describe('parseFigureArgs — a valued flag whose value is missing', () => {
  it('refuses --book whose "value" is the next FLAG, instead of swallowing it', () => {
    // Measured on the unfixed tool: `--book --dry-run` returned
    // {ok: true, book: '--dry-run', dryRun: FALSE}. The operator asked for a
    // dry run and would have got a PAID one — the safety flag was eaten by the
    // slug. This is worse than a bad slug.
    const r = parseFigureArgs(['--book', '--dry-run']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('--book');
  });

  it('refuses --out with no value at all', () => {
    const r = parseFigureArgs(['--book', 'efnafraedi-2e', '--out']);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('--out');
  });

  it('still accepts a valued flag that HAS a value (the control)', () => {
    // Without this, the two refusals above are satisfied by a parser that
    // rejects everything.
    expect(parseFigureArgs(['--book', 'efnafraedi-2e', '--out', '/tmp/fig-1'])).toMatchObject({
      ok: true,
      book: 'efnafraedi-2e',
      out: '/tmp/fig-1',
    });
  });
});

describe('the shared-out inventory instrument', () => {
  it('sees a file added in a NESTED directory, and sees an mtime move', () => {
    // The control for the isolation test's null. "The shared out/ did not
    // change" and "my instrument cannot see a change" are the same reading.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'figinv-'));
    expect(inventory(dir)).toEqual([]);
    expect(inventory(path.join(dir, 'absent'))).toBeNull(); // absent !== empty

    fs.mkdirSync(path.join(dir, 'nested'));
    fs.writeFileSync(path.join(dir, 'nested', 'x.json'), '1');
    const after = inventory(dir);
    expect(after).toHaveLength(1);
    expect(after[0]).toContain(path.sep); // it DESCENDED; it did not flatten

    // mtime is a live part of the row, so a same-size overwrite is visible.
    fs.utimesSync(path.join(dir, 'nested', 'x.json'), new Date(0), new Date(0));
    expect(inventory(dir)).not.toEqual(after);
  });
});

describe('main — --out isolates the only stage that costs money', () => {
  let savedExitCode;
  beforeEach(() => {
    savedExitCode = process.exitCode;
    process.exitCode = undefined; // a stale value must not mask a missing set
  });
  afterEach(() => {
    process.exitCode = savedExitCode;
  });

  it('writes both records into --out and leaves the shared out/ untouched', async () => {
    const fixture = fixtureOut();
    const before = inventory(SHARED_OUT);
    const seen = [];

    await main(['--book', 'efnafraedi-2e', '--out', fixture], {
      createClient: () => stubClient(seen),
      estimateIsk: () => 0,
      envPath: path.join(fixture, 'absent.env'),
    });

    // Assert the VERDICT before reading any output: a refusal returns early,
    // and then "the file is missing" is the symptom of the wrong thing.
    expect(process.exitCode).toBeUndefined();

    const apiRun = JSON.parse(fs.readFileSync(path.join(fixture, 'api-run.json'), 'utf-8'));
    expect(apiRun.figure).toBe('FIXTURE_ONLY_FIGURE'); // read the FIXTURE's meta.json
    expect(apiRun.blocks.map((b) => b.key)).toEqual(['Boiling|point']); // send:false skipped
    expect(apiRun.usage).toEqual({ chars: 13, requests: 1 });
    // Was `toMatchObject({ book: 'efnafraedi-2e' })` until gate 1 inverted:
    // the record's `glossary` is now null on every run and the slug has its own
    // field. Worth naming — this test no longer reads the real
    // `books/efnafraedi-2e/glossary/` at all, so it no longer depends on a tree
    // the 2-hourly export cron rewrites.
    expect({ glossary: apiRun.glossary, book: apiRun.book }).toEqual({
      glossary: null,
      book: 'efnafraedi-2e',
    });

    const trans = JSON.parse(fs.readFileSync(path.join(fixture, 'translations-api.json'), 'utf-8'));
    expect(trans.blocks).toEqual({ 'Boiling|point': ['IS:Boiling point'] });

    // The stub really drove the run — otherwise the two files above could have
    // been written by anything.
    expect(seen.map((s) => s.text)).toEqual(['Boiling point']);

    const after = inventory(SHARED_OUT);
    if (before === null) {
      expect(after, 'the run must not CREATE the shared out/').toBeNull();
    } else {
      expect(before.length).toBeGreaterThan(0); // the instrument had something to see
      expect(after).toEqual(before);
    }
  });

  it('--dry-run reaches the plan, mints no client, and needs no .env', async () => {
    const fixture = fixtureOut();
    let clientsMade = 0;

    await main(['--book', 'efnafraedi-2e', '--out', fixture, '--dry-run'], {
      createClient: () => {
        clientsMade++;
        throw new Error('createClient must not be reached under --dry-run');
      },
      estimateIsk: (chars) => chars / 1000,
      envPath: path.join(fixture, 'absent.env'),
    });

    expect(process.exitCode).toBeUndefined();
    expect(clientsMade).toBe(0);
    expect(fs.existsSync(path.join(fixture, 'api-run.json'))).toBe(false);
    expect(fs.existsSync(path.join(fixture, 'translations-api.json'))).toBe(false);
  });

  it('DOES read the .env it is handed — quotes stripped, any key accepted', async () => {
    // The positive control for the test above: "a missing .env is fine" and
    // "nothing reads .env at all" look identical. Both assertions here also
    // fail under the hand-rolled `^([A-Z_]+)=` loop this replaces — it kept the
    // quotes, and it never matched a key containing a digit.
    const fixture = fixtureOut();
    const envFile = path.join(fixture, 'fake.env');
    fs.writeFileSync(envFile, '# a comment\nFIGTEST_QUOTED="quoted-value"\nFIGTEST_DIGIT9=plain\n');
    delete process.env.FIGTEST_QUOTED;
    delete process.env.FIGTEST_DIGIT9;

    try {
      await main(['--book', 'efnafraedi-2e', '--out', fixture, '--dry-run'], {
        createClient: () => {
          throw new Error('not reached');
        },
        estimateIsk: () => 0,
        envPath: envFile,
      });
      // One assertion, not two: a red FIRST assertion makes its neighbour
      // vacuous, and the digit key is the half that pins the charset widening.
      expect({
        quoted: process.env.FIGTEST_QUOTED,
        digit: process.env.FIGTEST_DIGIT9,
      }).toEqual({ quoted: 'quoted-value', digit: 'plain' });
    } finally {
      delete process.env.FIGTEST_QUOTED;
      delete process.env.FIGTEST_DIGIT9;
    }
  });

  it('refuses a HALF-stubbed dependency pair instead of loading the real, paid client', async () => {
    // Injecting only `estimateIsk` would silently fall back to the real module
    // for `createClient` — i.e. a test that believes it is stubbed spends money.
    await expect(
      main(['--book', 'efnafraedi-2e', '--out', '/nonexistent'], { estimateIsk: () => 0 })
    ).rejects.toThrow(/inject both/i);
  });
});

describe('main — gate 1 INVERTED: nothing carries a glossary onto the figure wire', () => {
  // 🔴 [USER] 2026-09-06, on §C133: take the glossary off the MT wire. These
  // tests assert the WIRE PAYLOAD and the DURABLE RUN RECORD, never stdout
  // wording — except for the one status-line test below, which exists because
  // that line is a third provenance site and was keying on the operator's
  // INTENT rather than on what actually rode the wire.
  //
  // ⚠️ RED-FIRST NOTE, so a later reader can tell a real red from a
  // manufactured one: at the commit that introduced these, `main` loaded
  // `books/efnafraedi-2e/glossary/glossary-unified.json` and the fixture's one
  // sent block, "Boiling point", matched TWO live headwords (`boiling → suða`,
  // `boiling point → suðumark`). So the wire and provenance assertions below
  // failed against real behaviour, not against a missing export. After the
  // inversion no glossary file is read at all, which is why these are stable.
  let savedExitCode;
  let logged;
  let errored;
  let realLog;
  let realError;

  beforeEach(() => {
    savedExitCode = process.exitCode;
    process.exitCode = undefined; // a stale value must not mask a missing set
    logged = [];
    errored = [];
    realLog = console.log;
    realError = console.error;
    console.log = (...a) => logged.push(a.map(String).join(' '));
    console.error = (...a) => errored.push(a.map(String).join(' '));
  });
  afterEach(() => {
    console.log = realLog;
    console.error = realError;
    process.exitCode = savedExitCode;
  });

  it('sends NO glossary on any request, whatever --book says', async () => {
    const fixture = fixtureOut();
    const seen = [];

    await main(['--book', 'efnafraedi-2e', '--out', fixture], {
      createClient: () => stubClient(seen),
      estimateIsk: () => 0,
      envPath: path.join(fixture, 'absent.env'),
    });

    // Verdict before payload: a refusal returns early, and then "no request
    // carried a glossary" is true for the wrong reason.
    expect(process.exitCode).toBeUndefined();
    // NON-VACUITY. Without this, a client that is never called passes — which
    // is precisely how "found 0" and "my instrument saw nothing" read alike.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.map((s) => s.text)).toEqual(['Boiling point']);
    // The unit of the question is the REQUEST, so report every offender, not a
    // boolean: a per-request list names which block leaked if this ever fires.
    expect(seen.filter((s) => 'glossaries' in s.opts).map((s) => s.text)).toEqual([]);
    // …and the requests really did carry options, so the filter above had a
    // populated field to look at.
    expect(seen.every((s) => s.opts.targetLanguage === 'is')).toBe(true);
  });

  it('stamps BARE provenance in both durable records on a default --book run', async () => {
    // The three provenance sites keyed on `args.noGlossary` — the operator's
    // INTENT — so a default `--book efnafraedi-2e` run stamped a glossary
    // provenance on a run that (after the inversion) sends nothing. A run
    // record that lies about its own provenance is worse than none.
    const fixture = fixtureOut();
    const seen = [];

    await main(['--book', 'efnafraedi-2e', '--out', fixture], {
      createClient: () => stubClient(seen),
      estimateIsk: () => 0,
      envPath: path.join(fixture, 'absent.env'),
    });

    expect(process.exitCode).toBeUndefined();

    const apiRun = JSON.parse(fs.readFileSync(path.join(fixture, 'api-run.json'), 'utf-8'));
    const trans = JSON.parse(fs.readFileSync(path.join(fixture, 'translations-api.json'), 'utf-8'));

    // One assertion over an object, not three in a row: a red FIRST assertion
    // makes its neighbours vacuous from outside.
    expect({
      glossary: apiRun.glossary,
      book: apiRun.book,
      source: trans._source,
      steered: apiRun.blocks.map((b) => b.glossarySent),
    }).toEqual({
      glossary: null,
      book: 'efnafraedi-2e', // the slug survives as its own field, not inside `glossary`
      source: 'Málstaður /v1/translate, no glossary',
      steered: [false],
    });
  });

  it('says BARE on the status line too, and never "N approved … terms"', async () => {
    // The third site. `glossaryStatusLine(null, …)` prints "Glossary: none
    // available (continuing without)", which describes an accident; and the
    // pre-inversion default printed a live term count, which describes a
    // glossary that no longer rides anything.
    const fixture = fixtureOut();

    await main(['--book', 'efnafraedi-2e', '--out', fixture, '--dry-run'], {
      createClient: () => {
        throw new Error('not reached under --dry-run');
      },
      estimateIsk: () => 0,
      envPath: path.join(fixture, 'absent.env'),
    });

    expect(process.exitCode).toBeUndefined();
    const out = logged.join('\n');
    // Positive: the instrument captured the run's plan at all.
    expect(out).toMatch(/blocks,/);
    expect(out).toMatch(/glossary: NONE/);
    expect(out).not.toMatch(/approved/); // the false term-count provenance
    expect(out).not.toMatch(/none available/); // the misleading accident wording
  });

  it('accepts --no-glossary as a no-op and says so, rather than rejecting it', async () => {
    // Retiring the flag would make it an UNKNOWN flag (exit 2), breaking every
    // caller that still passes it. The reject-unknown rule exists for typos,
    // not for retired flags.
    const fixture = fixtureOut();
    const seen = [];

    await main(['--book', 'efnafraedi-2e', '--out', fixture, '--no-glossary'], {
      createClient: () => stubClient(seen),
      estimateIsk: () => 0,
      envPath: path.join(fixture, 'absent.env'),
    });

    expect(process.exitCode).toBeUndefined();
    expect(seen.length).toBeGreaterThan(0); // it RAN; it was not refused early
    expect(logged.join('\n')).toMatch(/--no-glossary: accepted/);
    const trans = JSON.parse(fs.readFileSync(path.join(fixture, 'translations-api.json'), 'utf-8'));
    // Identical outcome to the default run — that IS the no-op.
    expect(trans._source).toBe('Málstaður /v1/translate, no glossary');
  });

  it('still REFUSES a run with no --book, even though no glossary is loaded', async () => {
    // Not a red-first: this passed before the inversion too, via
    // resolveGlossaryOrRefuse's `no-book` code. It is here because the
    // inversion removes that call, and dropping the requirement silently would
    // hand Task 6b a flag it can forget.
    const fixture = fixtureOut();
    await main(['--out', fixture], {
      createClient: () => {
        throw new Error('a bookless run must not reach a client');
      },
      estimateIsk: () => 0,
      envPath: path.join(fixture, 'absent.env'),
    });

    expect(process.exitCode).toBe(2);
    expect(errored.join('\n')).toMatch(/no-book/);
    expect(fs.existsSync(path.join(fixture, 'api-run.json'))).toBe(false);
  });
});

describe('glossarySteeredBlocks — the pre-flight predicate', () => {
  // `main` builds its plan from a null glossary, so its refusal branch is
  // UNREACHABLE at HEAD. A gate that cannot fire is a gate that does not exist,
  // so the predicate is pinned here against a plan that DOES carry a glossary.
  const glossary = {
    domain: 'chemistry',
    terms: [{ sourceWord: 'Celsius', targetWord: 'Celsíus' }],
  };
  const plan = (glos, texts) =>
    texts.map((t, i) => ({ block: { key: `k${i}` }, opts: translateOptsFor(glos, t) }));

  it('names the steered blocks, and only those, in a MIXED plan', () => {
    // Mixed on purpose: a predicate that returned every key, or none, would
    // satisfy an all-steered or all-bare plan without discriminating. Built
    // through the real translateOptsFor, so the opts are the shape main sends.
    const keys = glossarySteeredBlocks(
      plan(glossary, ['100 Celsius degrees', 'Freezing point of water', 'Celsius scale'])
    );
    expect(keys).toEqual(['k0', 'k2']);
  });

  it('reports duplicates as duplicates — the unit is the REQUEST, not the block text', () => {
    // Two blocks can legitimately carry the same text (a label repeated in a
    // figure). A set-valued answer would lose the twin, and the operator would
    // under-count what leaked. This is a multiset question.
    const keys = glossarySteeredBlocks(plan(glossary, ['Celsius', 'Celsius']));
    expect(keys).toEqual(['k0', 'k1']);
  });

  it('is empty for a bare plan — the case main actually produces', () => {
    expect(glossarySteeredBlocks(plan(null, ['100 Celsius degrees', 'Anything']))).toEqual([]);
  });

  it('is empty for an empty plan, without throwing', () => {
    expect(glossarySteeredBlocks([])).toEqual([]);
  });
});

describe('figureNameFrom', () => {
  it('names the figure from the meta.json it is GIVEN', () => {
    const fixture = fixtureOut();
    expect(figureNameFrom(path.join(fixture, 'meta.json'))).toBe('FIXTURE_ONLY_FIGURE');
  });
});
