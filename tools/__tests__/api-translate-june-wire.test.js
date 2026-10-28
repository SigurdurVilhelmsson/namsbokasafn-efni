/**
 * D11's June-wire mode (`--june-wire`): send the March glossary by the rules the old MT was sent
 * with, so the paid test measures what June's MT actually received.
 *
 * 🔴 WHY A SEPARATE MODE. The VALUES are the March file either way; the SENDING RULES changed
 * after June, twice: C18 (`a9e334ed3`) omits both values of a contested headword, and §C116
 * (`462a00a4a`) matches a headword of ≤ 3 characters case-sensitively as a whole word. So the March
 * file sent through today's code is not June's wire (register, 2026-10-23). The two June functions
 * here are verbatim copies from `7658de896` (`formatGlossary` in `tools/lib/malstadur-api.js`,
 * `filterGlossaryForText` in `tools/api-translate.js`), renamed. The behaviour tests below pin them;
 * no test reads `git show`, because CI clones at depth 1.
 *
 * Spec: `experiments/d11-glossary-test/DESIGN.md` §3 and §6–§8, and
 * `docs/decisions/2026-10-25-d11-three-arms-junes-wire-primary.md`.
 *
 * The March glossary fixture is `books/efnafraedi-2e/glossary/glossary-unified.json` at
 * `5db701c92`, byte for byte (sha256 pinned below). It is byte-identical at all three March buy
 * commits (`c43026f46`, `7658de896`, `de601457d`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  formatGlossaryJune,
  filterGlossaryForTextJune,
  filterGlossaryForText,
  translateModule,
} from '../api-translate.js';
import { formatGlossary } from '../lib/malstadur-api.js';
import { readProvenance } from '../lib/provenance.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MARCH_DIR = path.join(HERE, 'fixtures', 'd11-march-glossary-5db701c92');
const MARCH_PATH = path.join(MARCH_DIR, 'glossary-unified.json');
const MARCH_SHA256 = '72442b487af6e1950501c00910fcca818f3566a74bad6833db78fad0024c9d0d';
const readMarch = () => JSON.parse(fs.readFileSync(MARCH_PATH, 'utf8'));
const pair = (t) => `${t.sourceWord} → ${t.targetWord}`;

describe('the March glossary fixture', () => {
  it('is the file at 5db701c92, byte for byte', () => {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(MARCH_PATH)).digest('hex');
    expect(sha).toBe(MARCH_SHA256);
  });
});

describe("June's formatter sends every approved row (test 1)", () => {
  const ROWS = [
    { english: 'atom', icelandic: 'atóm', status: 'approved' },
    { english: 'atom', icelandic: 'frumeind', status: 'approved' },
    { english: 'bond', icelandic: 'efnatengi', status: 'approved' },
    { english: 'mole', icelandic: 'mól', status: 'proposed' },
  ];

  it('sends both values of a contested headword', () => {
    const g = formatGlossaryJune(ROWS, { domain: 'chemistry', approvedOnly: true });
    expect(g.terms.map(pair)).toEqual(['atom → atóm', 'atom → frumeind', 'bond → efnatengi']);
  });

  it("today's formatter omits both values (control)", () => {
    const g = formatGlossary(ROWS, { domain: 'chemistry', approvedOnly: true });
    expect(g.terms.map(pair)).toEqual(['bond → efnatengi']);
  });

  it('sends all 617 approved rows of the March file; today sends 590', () => {
    const terms = readMarch().terms;
    const june = formatGlossaryJune(terms, { domain: 'chemistry', approvedOnly: true });
    const today = formatGlossary(terms, { domain: 'chemistry', approvedOnly: true });
    expect(terms.filter((t) => t.status === 'approved')).toHaveLength(617);
    expect(june.terms).toHaveLength(617);
    expect(today.terms).toHaveLength(590);
  });

  it('has no blank side in the March file, so sending it verbatim cannot 400 a paid chunk', () => {
    // June's formatter neither trims nor drops a blank side, and Málstaður refuses a glossary
    // holding a blank word with a 400 that fails the whole request (see today's formatGlossary).
    const june = formatGlossaryJune(readMarch().terms, { approvedOnly: true });
    const blank = june.terms.filter(
      (t) =>
        typeof t.sourceWord !== 'string' ||
        typeof t.targetWord !== 'string' ||
        !t.sourceWord.trim() ||
        !t.targetWord.trim()
    );
    expect(blank).toEqual([]);
  });
});

describe("June's filter matches short headwords as case-insensitive substrings (test 2)", () => {
  const G = {
    domain: 'chemistry',
    sourceLanguage: 'en',
    targetLanguage: 'is',
    terms: [
      { sourceWord: 'ion', targetWord: 'jón' },
      { sourceWord: 'pH', targetWord: 'pH' },
    ],
  };
  // Neither headword occurs as a word here: only inside "solution" and "phase".
  const TEXT = 'The solution changes phase.';
  const sent = (g) => (g ? g.terms.map((t) => t.sourceWord) : []);

  it('sends ion for "solution" and pH for "phase"', () => {
    expect(sent(filterGlossaryForTextJune(G, TEXT))).toEqual(['ion', 'pH']);
  });

  it("today's filter sends neither (control)", () => {
    expect(sent(filterGlossaryForText(G, TEXT))).toEqual([]);
  });

  it('returns null when no headword occurs at all', () => {
    expect(filterGlossaryForTextJune(G, 'Water boils.')).toBeNull();
  });
});

describe('translateModule sends and records the wire (test 4)', () => {
  // The label and the behaviour are tested TOGETHER: a sidecar that says "june" while
  // today's filter ran is the failure this mode exists to rule out.
  const SEGMENTS = [
    '<!-- SEG:m90001:para:p1 -->',
    'The solution changes phase.',
    '',
    '<!-- SEG:m90001:para:p2 -->',
    'A bond holds the atoms together.',
    '',
  ].join('\n');
  const G = {
    domain: 'chemistry',
    sourceLanguage: 'en',
    targetLanguage: 'is',
    terms: [
      { sourceWord: 'ion', targetWord: 'jón' },
      { sourceWord: 'bond', targetWord: 'efnatengi' },
    ],
  };

  /** An echo client that records each request's glossary headwords. */
  function recordingClient() {
    const sent = [];
    return {
      sent,
      translateAuto: async (text, opts) => {
        sent.push((opts.glossaries?.[0]?.terms ?? []).map((t) => t.sourceWord));
        return { text, usage: { units: text.length, cost: 0 } };
      },
    };
  }

  async function runModule(glossary, opts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd11-wire-'));
    try {
      const inputPath = path.join(dir, 'm90001-segments.en.md');
      const outputPath = path.join(dir, 'm90001-segments.is.md');
      fs.writeFileSync(inputPath, SEGMENTS);
      const client = recordingClient();
      await translateModule(client, inputPath, outputPath, glossary, false, undefined, opts);
      return { sent: client.sent, glossary: readProvenance(dir, 'm90001').run.glossary };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it("sends June's substring match when the wire is june", async () => {
    const r = await runModule(G, { glossaryArm: 'glossary', glossaryWire: 'june' });
    expect(r.sent).toEqual([['ion', 'bond']]);
  });

  it("records wire 'june' in the sidecar", async () => {
    const r = await runModule(G, { glossaryArm: 'glossary', glossaryWire: 'june' });
    expect(r.glossary.wire).toBe('june');
  });

  it("uses today's filter and records 'today' when no wire is given (control)", async () => {
    const r = await runModule(G, { glossaryArm: 'glossary' });
    expect(r.sent).toEqual([['bond']]);
    expect(r.glossary.wire).toBe('today');
  });

  it('records wire null when no glossary was sent', async () => {
    const r = await runModule(null, {});
    expect(r.glossary.wire).toBeNull();
  });
});

describe('the --june-wire flag reaches the run (test 3)', () => {
  // 🔴 tools/lib/parseArgs.js SILENTLY DROPS AN UNDECLARED FLAG. Without a declaration,
  // `--june-wire` would be a no-op: the run would send today's wire, exit 0, and an operator
  // would file it under the June label. So the flag is tested through the real CLI.
  //
  // The scratch tree mirrors how D11 runs: api-translate resolves `books/<book>` against its
  // working directory, so a run from a scratch folder reads that folder's glossary and English.
  // ⚠️ Every case is a DRY RUN: the scratch tree has no 02-mt-output, so a live run would buy.
  const TOOL = path.resolve(HERE, '../api-translate.js');
  const REPO = path.resolve(HERE, '../..');
  const MODULE = 'ch11/m68781-segments.en.md';
  const SCOPE = ['--book', 'efnafraedi-2e', '--chapter', '11', '--module', 'm68781', '--dry-run'];
  let scratch;

  beforeAll(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'd11-cli-'));
    const book = path.join(scratch, 'books', 'efnafraedi-2e');
    fs.mkdirSync(path.join(book, 'glossary'), { recursive: true });
    fs.copyFileSync(MARCH_PATH, path.join(book, 'glossary', 'glossary-unified.json'));
    fs.mkdirSync(path.join(book, '02-for-mt', 'ch11'), { recursive: true });
    fs.copyFileSync(
      path.join(REPO, 'books', 'efnafraedi-2e', '02-for-mt', MODULE),
      path.join(book, '02-for-mt', MODULE)
    );
  });
  afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

  function run(extra) {
    const r = spawnSync(process.execPath, [TOOL, ...SCOPE, ...extra], {
      cwd: scratch,
      encoding: 'utf8',
      env: { ...process.env, MALSTADUR_API_KEY: 'test-bogus-key-never-sent' },
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  }

  it('loads 617 terms and says wire june with --june-wire', () => {
    const r = run(['--full-glossary', '--june-wire']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Glossary: 617 approved chemistry terms/);
    expect(r.out).toMatch(/Glossary wire: june/);
  });

  it('loads 590 terms and says wire today without it (control)', () => {
    const r = run(['--full-glossary']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Glossary: 590 approved chemistry terms/);
    expect(r.out).toMatch(/Glossary wire: today/);
  });

  it('writes nothing in the scratch tree on a dry run', () => {
    run(['--full-glossary', '--june-wire']);
    expect(fs.existsSync(path.join(scratch, 'books', 'efnafraedi-2e', '02-mt-output'))).toBe(false);
  });

  // June's wire changes how the WHOLE glossary is sent, so it only means something with
  // --full-glossary. Anything else would record a wire that did not run.
  it.each([
    ['--no-glossary', ['--no-glossary', '--june-wire']],
    ['--glossary-only', ['--glossary-only', 'atom', '--june-wire']],
    ['no arm', ['--june-wire']],
    ['--top-up', ['--full-glossary', '--june-wire', '--top-up']],
  ])('refuses --june-wire with %s', (_label, extra) => {
    const r = run(extra);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/--june-wire/);
    expect(r.out).not.toMatch(/Estimated characters/);
  });
});

describe('a LIVE --june-wire run, end to end against an echo API (test 3, the CLI-to-module link)', () => {
  // The dry runs above stop before main() hands the wire to translateModule, and tests 4–5 call
  // translateModule directly, so neither sees that hand-off. Here the real CLI runs LIVE from a
  // scratch tree with `fetch` replaced by helpers/echo-malstadur-fetch.js: nothing leaves the
  // machine, nothing is spent, and the run writes its MT file and sidecar into the scratch tree.
  const TOOL = path.resolve(HERE, '../api-translate.js');
  const STUB = pathToFileURL(path.join(HERE, 'helpers', 'echo-malstadur-fetch.js')).href;
  const REPO = path.resolve(HERE, '../..');
  const MODULE = 'ch11/m68781-segments.en.md';
  const SCOPE = ['--book', 'efnafraedi-2e', '--chapter', '11', '--module', 'm68781'];

  /** A fresh scratch tree, one live run, and what it sent and recorded. */
  function liveRun(extra) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'd11-live-'));
    try {
      const book = path.join(scratch, 'books', 'efnafraedi-2e');
      fs.mkdirSync(path.join(book, 'glossary'), { recursive: true });
      fs.copyFileSync(MARCH_PATH, path.join(book, 'glossary', 'glossary-unified.json'));
      fs.mkdirSync(path.join(book, '02-for-mt', 'ch11'), { recursive: true });
      fs.copyFileSync(
        path.join(REPO, 'books', 'efnafraedi-2e', '02-for-mt', MODULE),
        path.join(book, '02-for-mt', MODULE)
      );
      const log = path.join(scratch, 'wire.jsonl');
      const r = spawnSync(
        process.execPath,
        ['--import', STUB, TOOL, ...SCOPE, '--rate-delay', '0', ...extra],
        {
          cwd: scratch,
          encoding: 'utf8',
          env: {
            ...process.env,
            MALSTADUR_API_KEY: 'test-bogus-key-never-sent',
            ECHO_FETCH_LOG: log,
          },
        }
      );
      const sidecar = path.join(book, '02-mt-output', 'ch11', 'm68781-provenance.json');
      return {
        code: r.status,
        out: `${r.stdout}${r.stderr}`,
        requests: fs.existsSync(log)
          ? fs
              .readFileSync(log, 'utf8')
              .trim()
              .split('\n')
              .map((l) => JSON.parse(l))
          : [],
        glossary: fs.existsSync(sidecar)
          ? JSON.parse(fs.readFileSync(sidecar, 'utf8')).run.glossary
          : null,
      };
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }

  let june;
  let today;
  beforeAll(() => {
    june = liveRun(['--full-glossary', '--june-wire']);
    today = liveRun(['--full-glossary']);
  });

  it('completes the June run', () => {
    expect(june.code, june.out).toBe(0);
  });

  it("puts June's wire on the request: 56 pairs, both values of atom", () => {
    expect(june.requests).toHaveLength(1);
    const pairs = new Set(june.requests[0].terms.map(pair));
    expect(pairs.size).toBe(56);
    expect(pairs).toContain('atom → atóm');
    expect(pairs).toContain('atom → frumeind');
  });

  it("records wire 'june' and the 617-row glossary in the sidecar", () => {
    expect(june.glossary).toMatchObject({
      arm: 'glossary',
      wire: 'june',
      termCount: 617,
      chunksWithGlossary: 1,
      chunksTotal: 1,
    });
  });

  it("sends today's 49 pairs and records wire 'today' without the flag (control)", () => {
    expect(today.code, today.out).toBe(0);
    expect(new Set(today.requests[0].terms.map(pair)).size).toBe(49);
    expect(today.glossary).toMatchObject({ wire: 'today', termCount: 590 });
  });
});
