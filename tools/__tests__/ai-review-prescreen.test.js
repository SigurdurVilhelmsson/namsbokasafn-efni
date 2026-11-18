/**
 * The glossary pre-screen runner (c19): reduce, plan and pilot, offline. A throwaway git
 * repository holds a synthetic census, export and English segments (every control headword and
 * the ten named homograph segments), the real prompt and ruling set; a mock transport answers
 * by content. Nothing touches the network, the real ledger or the real repository's tree.
 * Spec: docs/superpowers/specs/2026-11-17-c19-glossary-prescreen-design.md (§5, §6, §8).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  main,
  CODE_PATHS,
  PRESCREEN_RECORD,
  PILOT_POPULATION_ROWS,
  PILOT_PHYSICS_BIOLOGY_ROWS,
  POPULATION_STOP,
  PILOT_FLAG_STOP,
  COST_MARGIN_USD,
} from '../ai-review/prescreen.js';
import { CONTROLS, pickEvenly, reduceCensus } from '../ai-review/prescreen-population.js';
import { PROMPT_PATH } from '../ai-review/prescreen-request.js';
import { DEFAULT_RULING_SET } from '../ai-review/term-pass.js';
import { loadRulingSet } from '../ai-review/ruling-set.js';
import { makeGit } from '../ai-review/provenance.js';
import { reserve, releaseAll, readLedger, summarizeLedger } from '../ai-review/ledger.js';
import { CAP_USD } from '../ai-review/config.js';
import { REPO, makeTempDir, removeTempDirs, mockTransport } from './helpers/term-pass-fixture.js';

afterAll(removeTempDirs);

const RULING_SET = loadRulingSet(path.join(REPO, DEFAULT_RULING_SET));
const RULED_ENGLISH = RULING_SET.rulings[0].en[0];
const CENSUS_REL = 'experiments/terminology-consistency/results/2026-11-17/census-2026-11-17.json';
const HARNESS = { harnessCommit: () => 'a'.repeat(40), harnessDirty: () => false };
let clock = Date.parse('2026-11-17T10:00:00Z');
const now = () => new Date((clock += 1000));
const pad = (n) => String(n).padStart(3, '0');

const censusRow = (english, icelandic, over = {}) => ({
  english,
  icelandic,
  domain: 'chemistry',
  conceptId: 1,
  isFallback: false,
  isTied: false,
  reason: 'head-form',
  alternatives: ['private-alternative'],
  ifRemoved: { text: 'private-fallback', domain: 'chemistry' },
  chapters: [1],
  matchCount: 1,
  issueCount: 0,
  matches: [],
  ...over,
});

/**
 * A throwaway repository: `population` chemistry rows and `physicsBiology` physics or biology
 * rows, each with one sentence; excluded rows with distinct counts per class (ruled 1, fallback
 * 2, tie 3, decided 4, notInExport 5, noSentence 6, physicsBiologyNoSentence 7); every control.
 */
function makeFixture({ population = 30, physicsBiology = 16 } = {}) {
  const root = makeTempDir('ps-repo-');
  const book = path.join(root, 'books', 'efnafraedi-2e');
  const write = (rel, text) => {
    const f = path.join(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  };
  const rows = [];
  const exported = [];
  const segs = { ch01: [], ch02: [], ch03: [] };
  const add = (row, { inExport = true, segment = null, chapter = 'ch01' } = {}) => {
    if (segment) {
      segs[chapter].push(segment);
      row.matches = [{ chapter: Number(chapter.slice(2)), moduleId: 'm9', segmentId: segment.id }];
    }
    rows.push(row);
    if (inExport) exported.push(row);
    return row;
  };
  const popRows = [];
  for (let i = 1; i <= population; i += 1) {
    const english = `qterm${pad(i)}`;
    popRows.push(
      add(censusRow(english, `qorð${pad(i)}`, { matchCount: 1 + (i % 9) }), {
        segment: { id: `m90001:para:pop-${pad(i)}`, text: `We measure the ${english} value.` },
      })
    );
  }
  const pbRows = [];
  for (let j = 1; j <= physicsBiology; j += 1) {
    const english = `pterm${pad(j)}`;
    const domain = j % 2 ? 'physics' : 'biology';
    pbRows.push(
      add(censusRow(english, `porð${pad(j)}`, { domain, matchCount: 1 + (j % 5) }), {
        segment: { id: `m90002:para:pb-${pad(j)}`, text: `In physics the ${english} matters.` },
        chapter: 'ch02',
      })
    );
  }
  const gone = (k) => [{ chapter: 1, moduleId: 'm9', segmentId: `m90001:para:gone-${k}` }];
  add(censusRow(RULED_ENGLISH, 'úrskurðað'));
  for (let k = 1; k <= 2; k += 1) add(censusRow(`fterm${k}`, `f${k}`, { isFallback: true }));
  for (let k = 1; k <= 3; k += 1)
    add(censusRow(`tterm${k}`, null, { isTied: true, domain: null }), { inExport: false });
  for (let k = 1; k <= 4; k += 1)
    add(censusRow(`dterm${k}`, `d${k}`, { reason: 'book-preference' }));
  for (let k = 1; k <= 5; k += 1) add(censusRow(`xterm${k}`, `x${k}`), { inExport: false });
  for (let k = 1; k <= 6; k += 1) add(censusRow(`nterm${k}`, `n${k}`, { matches: gone(k) }));
  for (let k = 1; k <= 7; k += 1)
    add(censusRow(`npterm${k}`, `np${k}`, { domain: 'physics', matches: gone(`p${k}`) }));
  // The controls' sentences: every positive and negative headword, and the ten named
  // homograph segments ("addition of" for the adding half, "addition reaction" for the other).
  [...CONTROLS.positives, ...CONTROLS.negatives].forEach((c, i) =>
    segs.ch03.push({ id: `m90003:para:ctl-${pad(i)}`, text: `The text says ${c.english} here.` })
  );
  const [adding, reaction] = CONTROLS.homograph;
  for (const id of adding.segmentIds)
    segs.ch03.push({ id, text: 'The addition of heat warms the sample.' });
  for (const id of reaction.segmentIds)
    segs.ch03.push({ id, text: 'An addition reaction joins two molecules.' });
  for (const [ch, list] of Object.entries(segs)) {
    write(
      `books/efnafraedi-2e/02-for-mt/${ch}/m9000${ch.slice(3)}-segments.en.md`,
      list.map((s) => `<!-- SEG:${s.id} -->\n${s.text}\n\n`).join('')
    );
  }
  const full = {
    schema: 'c19-census/1',
    book: 'efnafraedi-2e',
    head: 'f'.repeat(40),
    readAt: '2026-11-17T09:00:00.000Z',
    dbPath: '/srv/private/sessions.db',
    rows,
  };
  const exportTerms = exported.map(({ english, icelandic, domain }) => ({
    english,
    icelandic,
    status: 'approved',
    domain,
  }));
  write(
    'books/efnafraedi-2e/glossary/glossary-unified.json',
    JSON.stringify({ producer: 'export-terminology-resolved', terms: exportTerms })
  );
  write(CENSUS_REL, `${JSON.stringify(reduceCensus(full, exportTerms, RULING_SET), null, 1)}\n`);
  write(PROMPT_PATH, fs.readFileSync(path.join(REPO, PROMPT_PATH)));
  write(DEFAULT_RULING_SET, fs.readFileSync(path.join(REPO, DEFAULT_RULING_SET)));
  const sh = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  sh(['init', '-q']);
  sh(['config', 'user.email', 't@example.invalid']);
  sh(['config', 'user.name', 't']);
  sh(['add', '.']);
  sh(['commit', '-q', '-m', 'fixture']);
  const fullPath = path.join(makeTempDir('ps-private-'), 'census-full.json');
  fs.writeFileSync(fullPath, JSON.stringify(full));
  return { root, book, full, fullPath, popRows, pbRows, sh };
}

const POSITIVE_IS = new Set(CONTROLS.positives.map((c) => c.icelandic));

/**
 * A model's answers, decided by content (never by id: ids follow the seed). Positives are
 * flagged unless named in `fine`; the homograph row is flagged unless its sentences are the
 * addition-reaction ones; any other row is flagged when its English is in `flag`; rows whose
 * English is in `omit` get no answer.
 */
function answerer({ flag = new Set(), fine = new Set(), omit = new Set() } = {}) {
  return (body) => {
    const doc = JSON.parse(body.messages[0].content);
    return {
      rows: doc.rows
        .filter((r) => !omit.has(r.en))
        .map((r) => {
          let flagged = flag.has(r.en);
          if (POSITIVE_IS.has(r.is)) flagged = !fine.has(r.en);
          if (r.en === 'addition')
            flagged = !r.sentences.some((s) => s.includes('addition reaction'));
          return flagged
            ? {
                id: r.id,
                verdict: 'flag',
                kind: 'wrong-sense',
                reason: `${r.en} names another sense here.`,
                proposed: ['annað'],
                rightSenses: null,
              }
            : {
                id: r.id,
                verdict: 'fine',
                kind: null,
                reason: 'Right sense.',
                proposed: [],
                rightSenses: null,
              };
        }),
    };
  };
}

function harnessDeps(fx, extra = {}) {
  const lines = [];
  const errs = [];
  const transport = extra.transport ?? mockTransport({ answer: answerer() });
  const deps = {
    repoRoot: fx.root,
    bookDir: fx.book,
    recordsDir: makeTempDir('ps-rec-'),
    git: makeGit({ cwd: fx.root }),
    codePaths: ['tools/ai-review/prompts'],
    out: (s) => lines.push(s),
    err: (s) => errs.push(s),
    now,
    ...HARNESS,
    ...extra,
    transport,
  };
  return { deps, transport, text: () => lines.join(''), errText: () => errs.join('') };
}

const readJsonl = (file) =>
  fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

describe('constants', () => {
  it('pins the pilot sizes and the stop lines', () => {
    expect([
      PRESCREEN_RECORD,
      PILOT_POPULATION_ROWS,
      PILOT_PHYSICS_BIOLOGY_ROWS,
      POPULATION_STOP,
      PILOT_FLAG_STOP,
    ]).toEqual(['prescreen.json', 24, 15, 450, 0.25]);
  });

  it('keeps USD 5 of the cap free before any full run or resend (spec §6)', () => {
    expect(COST_MARGIN_USD).toBe(5);
  });

  it('covers the whole import closure of the CLI with CODE_PATHS', () => {
    const seen = new Set();
    const visit = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const re = file.endsWith('.cjs')
        ? /require\(\s*['"](\.[^'"]+)['"]\s*\)/g
        : /^\s*(?:import|export)\b[^;]*?\bfrom\s*['"](\.[^'"]+)['"]|^\s*import\s*['"](\.[^'"]+)['"]/gm;
      for (const m of src.matchAll(re)) {
        const target = path.resolve(path.dirname(file), m[1] ?? m[2]);
        const found = [target, `${target}.js`, `${target}.cjs`].find((f) => fs.existsSync(f));
        if (!found) throw new Error(`${file} imports ${m[1] ?? m[2]}, which does not resolve`);
        visit(found);
      }
    };
    visit(path.join(REPO, 'tools/ai-review/prescreen.js'));
    const rel = [...seen].map((f) => path.relative(REPO, f).split(path.sep).join('/'));
    const uncovered = rel.filter((f) => !CODE_PATHS.some((p) => f === p || f.startsWith(`${p}/`)));
    expect(uncovered).toEqual([]);
  });
});

describe('flags', () => {
  let fx;
  beforeAll(() => {
    fx = makeFixture();
  });

  it('refuses an unknown flag with exit 1', async () => {
    const { deps } = harnessDeps(fx);
    expect(await main(['plan', '--census', CENSUS_REL, '--book', 'x'], deps)).toMatchObject({
      exitCode: 1,
      refusal: 'bad-flag',
    });
  });

  it('refuses a flag that does not apply to the command', async () => {
    const { deps } = harnessDeps(fx);
    expect(await main(['plan', '--census', CENSUS_REL, '--yes'], deps)).toMatchObject({
      exitCode: 1,
      refusal: 'bad-flag',
    });
  });
});

describe('reduce', () => {
  let fx;
  const OUT = 'experiments/terminology-consistency/results/2026-11-18/census.json';
  beforeAll(() => {
    fx = makeFixture();
  });
  const reduce = async (full, out = OUT) => {
    const h = harnessDeps(fx);
    const r = await main(['reduce', '--census-full', full, '--out', out], h.deps);
    return { r, ...h };
  };
  const privateFile = (text) => {
    const f = path.join(makeTempDir('ps-private-'), 'census.json');
    fs.writeFileSync(f, text);
    return f;
  };

  it('refuses a truncated file with exit 1 and writes nothing', async () => {
    const { r } = await reduce(privateFile(JSON.stringify(fx.full).slice(0, 200)));
    expect([r.exitCode, r.refusal, fs.existsSync(path.join(fx.root, OUT))]).toEqual([
      1,
      'bad-census',
      false,
    ]);
  });

  it('refuses a file with the wrong schema', async () => {
    const { r } = await reduce(privateFile(JSON.stringify({ ...fx.full, schema: 'other/1' })));
    expect([r.exitCode, r.refusal]).toEqual([1, 'bad-census']);
  });

  it('refuses a file with no rows', async () => {
    const { r } = await reduce(privateFile(JSON.stringify({ ...fx.full, rows: [] })));
    expect([r.exitCode, r.refusal]).toEqual([1, 'bad-census']);
  });

  it('refuses a full census inside the repository (it is private)', async () => {
    const inside = path.join(fx.root, 'census-full.json');
    fs.writeFileSync(inside, JSON.stringify(fx.full));
    const { r } = await reduce(inside);
    fs.rmSync(inside);
    expect([r.exitCode, r.refusal]).toEqual([1, 'bad-flag']);
  });

  it('refuses an --out outside the results directory', async () => {
    const { r } = await reduce(fx.fullPath, 'books/efnafraedi-2e/census.json');
    expect([r.exitCode, r.refusal]).toEqual([1, 'bad-flag']);
  });

  it('refuses a modified export with exit 1 and writes nothing (spec §8)', async () => {
    const real = makeGit({ cwd: fx.root });
    const git = (args) =>
      args[0] === 'status' ? ' M books/efnafraedi-2e/glossary/glossary-unified.json\0' : real(args);
    const h = harnessDeps(fx, { git });
    const out = 'experiments/terminology-consistency/results/2026-11-19/census.json';
    const r = await main(['reduce', '--census-full', fx.fullPath, '--out', out], h.deps);
    expect([r.exitCode, r.refusal, fs.existsSync(path.join(fx.root, out))]).toEqual([
      1,
      'preflight',
      false,
    ]);
  });

  it('records the sha256 of the export and the ruling set it reduced against', async () => {
    await reduce(fx.fullPath);
    const written = JSON.parse(fs.readFileSync(path.join(fx.root, OUT), 'utf8'));
    const sha = (rel) =>
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(fx.root, rel)))
        .digest('hex');
    const exportRel = 'books/efnafraedi-2e/glossary/glossary-unified.json';
    expect([written.exportSource, written.rulingSetSource]).toEqual([
      { path: exportRel, sha256: sha(exportRel) },
      { path: DEFAULT_RULING_SET, sha256: RULING_SET.sha256 },
    ]);
  });

  it('writes the reduced census: published rows only, private fields and dbPath gone', async () => {
    const { r } = await reduce(fx.fullPath);
    const written = JSON.parse(fs.readFileSync(path.join(fx.root, OUT), 'utf8'));
    expect({
      exitCode: r.exitCode,
      reduced: written.reduced,
      dbPath: 'dbPath' in written,
      privateFields: written.rows.filter((x) => 'alternatives' in x || 'ifRemoved' in x).length,
      rows: written.rows.length,
      withheld: written.withheld,
    }).toEqual({
      exitCode: 0,
      reduced: true,
      dbPath: false,
      privateFields: 0,
      rows: fx.full.rows.length - 8,
      withheld: { ruled: 0, fallback: 0, tie: 3, decided: 0, physicsBiology: 0, notInExport: 5 },
    });
  });
});

describe('plan', () => {
  let fx;
  let res;
  beforeAll(async () => {
    fx = makeFixture();
    const h = harnessDeps(fx);
    res = { r: await main(['plan', '--census', CENSUS_REL], h.deps), text: h.text() };
  });

  it('exits 0 under the population stop line', () => {
    expect(res.r.exitCode).toBe(0);
  });

  it('prints the population count', () => {
    expect(res.text).toMatch(/^population: 30 chemistry rows$/m);
  });

  it('prints each exclusion count', () => {
    const counts = Object.fromEntries(
      [...res.text.matchAll(/^excluded (\w+): (\d+)$/gm)].map((m) => [m[1], Number(m[2])])
    );
    expect(counts).toEqual({
      ruled: 1,
      fallback: 2,
      tie: 3,
      decided: 4,
      physicsBiology: 16,
      notInExport: 5,
      noSentence: 6,
      physicsBiologyNoSentence: 7,
    });
  });

  it('prints the control count', () => {
    expect(res.text).toMatch(/^controls: 16$/m);
  });

  it('prints a request count and both worst cases for every model', () => {
    expect(
      res.text.match(
        /^ {2}claude-(fable-5-2|opus-5-5): \d+ requests, worst case USD [\d.]+ interactive \/ [\d.]+ batch/gm
      )
    ).toHaveLength(4);
  });

  it('refuses a census that is not reduced', async () => {
    fs.writeFileSync(path.join(fx.root, 'full.json'), JSON.stringify(fx.full));
    const h = harnessDeps(fx);
    expect(await main(['plan', '--census', 'full.json'], h.deps)).toMatchObject({
      exitCode: 1,
      refusal: 'bad-census',
    });
  });

  it('a census over 450 population rows exits 2 and asks', async () => {
    const big = makeFixture({ population: POPULATION_STOP + 1 });
    const h = harnessDeps(big);
    const r = await main(['plan', '--census', CENSUS_REL], h.deps);
    expect([r.exitCode, /^stop and ask: .*451.*450/m.test(h.text())]).toEqual([2, true]);
  });
});

describe('pilot', () => {
  let fx;
  let picked;
  let pbPicked;
  beforeAll(() => {
    fx = makeFixture();
    picked = pickEvenly(fx.popRows, PILOT_POPULATION_ROWS).map((r) => r.english);
    pbPicked = pickEvenly(fx.pbRows, PILOT_PHYSICS_BIOLOGY_ROWS).map((r) => r.english);
  });
  const pilot = async (answer, extraArgs = ['--yes'], extra = {}) => {
    const transport = extra.transport ?? mockTransport({ answer });
    const h = harnessDeps(fx, { ...extra, transport });
    const argv = ['pilot', '--census', CENSUS_REL, '--model', 'claude-opus-5-5', ...extraArgs];
    return { r: await main(argv, h.deps), ...h };
  };
  const passing = () =>
    answerer({ flag: new Set([...picked.slice(0, 2), ...pbPicked.slice(0, 6)]) });

  it('refuses a model outside MODELS before anything else runs', async () => {
    const transport = mockTransport({ answer: answerer() });
    const h = harnessDeps(fx, { transport });
    const r = await main(['pilot', '--census', 'missing.json', '--model', 'claude-x'], h.deps);
    expect([r.exitCode, r.refusal, transport.calls.countTokens]).toEqual([1, 'bad-model', 0]);
  });

  it('without --yes prints the plan and makes zero transport calls', async () => {
    const { r, transport, deps, text } = await pilot(answerer(), []);
    expect({
      exitCode: r.exitCode,
      calls: transport.calls.countTokens + transport.calls.send,
      runs: fs.existsSync(path.join(deps.recordsDir, 'runs')),
      notSending: /not sending/.test(text()),
    }).toEqual({ exitCode: 0, calls: 0, runs: false, notSending: true });
  });

  it('refuses from a linked worktree (git stub) before any transport call', async () => {
    const real = makeGit({ cwd: fx.root });
    const [common, own] = [makeTempDir('ps-common-'), makeTempDir('ps-own-')];
    const git = (args) =>
      args[0] === 'rev-parse' && args.includes('--git-common-dir')
        ? `${common}\n${own}\n`
        : real(args);
    const { r, transport } = await pilot(passing(), ['--yes'], { git });
    expect([r.exitCode, r.refusal, transport.calls.countTokens + transport.calls.send]).toEqual([
      1,
      'linked-worktree',
      0,
    ]);
  });

  it('the paid preflight refuses a dirty input with zero transport calls', async () => {
    const real = makeGit({ cwd: fx.root });
    const git = (args) => (args[0] === 'status' ? ` M ${CENSUS_REL}\0` : real(args));
    const { r, transport } = await pilot(passing(), ['--yes'], { git });
    expect([r.exitCode, r.refusal, transport.calls.countTokens + transport.calls.send]).toEqual([
      1,
      'preflight',
      0,
    ]);
  });

  describe('--yes with every control answered as expected', () => {
    let res;
    let record;
    beforeAll(async () => {
      res = await pilot(passing());
      const dir = path.join(res.deps.recordsDir, 'runs', res.r.runId);
      record = {
        prescreen: JSON.parse(fs.readFileSync(path.join(dir, PRESCREEN_RECORD), 'utf8')),
        requests: readJsonl(path.join(dir, 'requests.jsonl')),
      };
    });

    it('exits 0', () => {
      expect(res.r.exitCode).toBe(0);
    });

    it('writes prescreen.json with every control, 24 chemistry and 15 physics or biology rows', () => {
      const kinds = {};
      for (const it of record.prescreen.items) kinds[it.kind] = (kinds[it.kind] ?? 0) + 1;
      expect({
        schema: record.prescreen.schema,
        phase: record.prescreen.phase,
        model: record.prescreen.model,
        kinds,
      }).toEqual({
        schema: 'c19-prescreen/1',
        phase: 'pilot',
        model: 'claude-opus-5-5',
        kinds: { control: 16, population: 24, physicsBiology: 15 },
      });
    });

    it('records maxTokens and the population exclusion counts for resume and collect', () => {
      expect([record.prescreen.maxTokens, record.prescreen.excluded]).toEqual([
        16000,
        {
          ruled: 1,
          fallback: 2,
          tie: 3,
          decided: 4,
          physicsBiology: 16,
          notInExport: 5,
          noSentence: 6,
          physicsBiologyNoSentence: 7,
        },
      ]);
    });

    it('records the sampling rule for all three sentence paths', () => {
      expect(Object.keys(record.prescreen.sampling).sort()).toEqual(
        ['controls', 'homographs', 'itemOrder', 'pick', 'population', 'seed'].sort()
      );
    });

    it('takes the pilot rows by pickEvenly', () => {
      const pop = record.prescreen.items.filter((i) => i.kind === 'population');
      expect(pop.map((i) => i.english).sort()).toEqual([...picked].sort());
    });

    it('records the ids each request presented, as the bodies sent them', () => {
      const sent = record.requests.map((q) => ({
        key: q.key,
        ids: JSON.parse(q.body.messages[0].content).rows.map((x) => x.id),
      }));
      expect(record.prescreen.requests).toEqual(sent);
    });

    it("pre-registers the adding half's flag kinds in the record (ruling P8)", () => {
      const adding = record.prescreen.items.find((i) => i.name === 'addition-adding');
      expect(adding.flagKinds).toEqual(['wrong-sense', 'some-senses-only']);
    });

    it('prints the chemistry flag rate on its own line', () => {
      expect(res.text()).toMatch(/^chemistry rows: flagged 2 of 24 \(8\.3%\)/m);
    });

    it('prints the physics and biology flag rate on its own line', () => {
      expect(res.text()).toMatch(/^physics and biology rows: flagged 6 of 15 \(40\.0%\)/m);
    });

    it('prints the cost per row from run-end.json', () => {
      expect(res.text()).toMatch(/^cost: USD [\d.]+ for 55 rows sent = USD [\d.]+ per row/m);
    });

    it('prints no failing control', () => {
      expect(res.text()).not.toMatch(/^\s*FAIL /m);
    });
  });

  it('a transport answering balanced as fine exits 2 and prints the balanced row', async () => {
    const answer = answerer({
      flag: new Set([...picked.slice(0, 2), ...pbPicked.slice(0, 6)]),
      fine: new Set(['balanced']),
    });
    const { r, text } = await pilot(answer);
    expect([
      r.exitCode,
      /^\s*FAIL\s+r\d+\s+balanced\s+expected flag\s+got fine/m.test(text()),
    ]).toEqual([2, true]);
  });

  it('a chemistry flag rate over 25% exits 2', async () => {
    const { r } = await pilot(answerer({ flag: new Set(picked.slice(0, 7)) }));
    expect(r.exitCode).toBe(2);
  });

  it('a chemistry flag rate of exactly 25% exits 0', async () => {
    const { r } = await pilot(answerer({ flag: new Set(picked.slice(0, 6)) }));
    expect(r.exitCode).toBe(0);
  });

  it('a run that does not end complete exits 2 even with every row answered', async () => {
    // The last response costs more than its reservation: the harness records it (so every row
    // has a verdict and the gate passes) and ends the run stopped-over-reservation.
    const base = mockTransport({ answer: passing() });
    const transport = {
      ...base,
      async send(body) {
        const m = await base.send(body);
        if (base.calls.send === 7) m.usage = { ...m.usage, output_tokens: 10_000_000 };
        return m;
      },
    };
    const { r, text } = await pilot(null, ['--yes'], { transport });
    expect([
      r.exitCode,
      /^gate: PASS/m.test(text()),
      /^stop and ask: the run ended stopped-over-reservation/m.test(text()),
    ]).toEqual([2, true, true]);
  });

  it('an unjudged chemistry row exits 2 and is counted', async () => {
    const { r, text } = await pilot(answerer({ omit: new Set([picked[0]]) }));
    expect([
      r.exitCode,
      /^chemistry rows: flagged 0 of 23 \(0\.0%\) judged rows, 1 of 24 unjudged/m.test(text()),
    ]).toEqual([2, true]);
  });

  it('the physics and biology rate is over judged rows, and an unjudged one does not stop', async () => {
    const answer = answerer({ flag: new Set(pbPicked.slice(1, 7)), omit: new Set([pbPicked[0]]) });
    const { r, text } = await pilot(answer);
    expect([
      r.exitCode,
      /^physics and biology rows: flagged 6 of 14 \(42\.9%\) judged rows, 1 of 15 unjudged/m.test(
        text()
      ),
    ]).toEqual([0, true]);
  });

  it('seeds by the census: both models get the same items and requests (spec §6)', async () => {
    const record = async (model) => {
      const h = harnessDeps(fx, { transport: mockTransport({ answer: passing() }) });
      const r = await main(['pilot', '--census', CENSUS_REL, '--model', model, '--yes'], h.deps);
      const file = path.join(h.deps.recordsDir, 'runs', r.runId, PRESCREEN_RECORD);
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    };
    const [fable, opus] = [await record('claude-fable-5-2'), await record('claude-opus-5-5')];
    const committed = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(fx.root, CENSUS_REL)))
      .digest('hex');
    expect({
      models: [fable.model, opus.model],
      sameItems: JSON.stringify(fable.items) === JSON.stringify(opus.items),
      sameRequests: JSON.stringify(fable.requests) === JSON.stringify(opus.requests),
      census: [fable.census.sha256, opus.census.sha256],
    }).toEqual({
      models: ['claude-fable-5-2', 'claude-opus-5-5'],
      sameItems: true,
      sameRequests: true,
      census: [committed, committed],
    });
  });
});

// ── run, resume, collect ─────────────────────────────────────────────────────────────────────

const NO_SLEEP = { sleep: async () => {} };
const transportCalls = (t) =>
  t.calls.countTokens + t.calls.send + t.calls.submitBatch + t.calls.getBatch;
const runsIn = (recordsDir) =>
  fs.existsSync(path.join(recordsDir, 'runs'))
    ? fs.readdirSync(path.join(recordsDir, 'runs')).sort()
    : [];
const recordOf = (recordsDir, runId, name) =>
  JSON.parse(fs.readFileSync(path.join(recordsDir, 'runs', runId, name), 'utf8'));
const ledgerOf = (recordsDir) => path.join(recordsDir, 'ledger.jsonl');
/** Reserve all but `leftUsd` of the headroom (cap less committed less the margin). */
const crowdLedger = (recordsDir, leftUsd) =>
  reserve({
    ledgerPath: ledgerOf(recordsDir),
    runId: 'crowd',
    use: 'other-use',
    usd: CAP_USD - COST_MARGIN_USD - leftUsd,
    cap: CAP_USD,
  });

/** A pilot run in `recordsDir`; by default every control is answered as expected. */
async function pilotIn(fx, recordsDir, { answer = answerer(), model = 'claude-opus-5-5' } = {}) {
  const h = harnessDeps(fx, { recordsDir, transport: mockTransport({ answer }) });
  const r = await main(['pilot', '--census', CENSUS_REL, '--model', model, '--yes'], h.deps);
  return r.runId;
}

/** A batch transport that answers with a refusal every request whose rows `refuse` picks. */
function refusingTransport({ answer = answerer(), refuse }) {
  const base = mockTransport({ answer });
  let submitted = [];
  return {
    ...base,
    async submitBatch(requests) {
      submitted = requests;
      return base.submitBatch(requests);
    },
    async *batchResults(id) {
      for await (const r of base.batchResults(id)) {
        const req = submitted.find((s) => s.custom_id === r.custom_id);
        if (!refuse(JSON.parse(req.params.messages[0].content).rows)) yield r;
        else {
          const message = { ...r.result.message, stop_reason: 'refusal', content: [] };
          yield { ...r, result: { type: 'succeeded', message } };
        }
      }
    },
  };
}

async function fullRun(fx, recordsDir, pilotId, { args = ['--yes'], transport, extra = {} } = {}) {
  const t = transport ?? mockTransport({ answer: answerer() });
  const h = harnessDeps(fx, { recordsDir, transport: t, ...NO_SLEEP, ...extra });
  const argv = ['run', '--census', CENSUS_REL, '--model', 'claude-opus-5-5'];
  const r = await main([...argv, '--pilot', pilotId, ...args], h.deps);
  return { r, ...h };
}

const RESULTS = 'experiments/terminology-consistency/results';
let outN = 0;
async function collect(fx, recordsDir, runIds, { args = [], transport, extra = {} } = {}) {
  const t = transport ?? mockTransport({ answer: answerer() });
  const h = harnessDeps(fx, { recordsDir, transport: t, ...extra });
  const out = `${RESULTS}/2026-11-20-t${(outN += 1)}`;
  const argv = ['collect', ...runIds.flatMap((id) => ['--run', id]), '--out', out];
  const iskArgs = ['--isk-rate', '140', '--isk-rate-source', 'test rate, 2026-11-18'];
  const r = await main([...argv, ...iskArgs, ...args], h.deps);
  const file = (name) => path.join(fx.root, out, name);
  const verdicts = fs.existsSync(file('prescreen-verdicts.json'))
    ? JSON.parse(fs.readFileSync(file('prescreen-verdicts.json'), 'utf8'))
    : null;
  const report = fs.existsSync(file('prescreen-report.md'))
    ? fs.readFileSync(file('prescreen-report.md'), 'utf8')
    : null;
  return { r, verdicts, report, out, ...h };
}

describe('run', () => {
  let fx;
  let recordsDir;
  let pilotId;
  beforeAll(async () => {
    fx = makeFixture();
    recordsDir = makeTempDir('ps-rec-');
    pilotId = await pilotIn(fx, recordsDir);
  });

  it('refuses without a passing pilot, re-judged from its records, with zero calls', async () => {
    const failed = await pilotIn(fx, recordsDir, {
      answer: answerer({ fine: new Set(['vessel']) }),
    });
    const before = runsIn(recordsDir);
    const { r, transport } = await fullRun(fx, recordsDir, failed);
    expect([r.exitCode, r.refusal, transportCalls(transport), runsIn(recordsDir)]).toEqual([
      1,
      'pilot',
      0,
      before,
    ]);
  });

  it('refuses a pilot that ran on another model', async () => {
    const h = harnessDeps(fx, { recordsDir, ...NO_SLEEP });
    const argv = ['run', '--census', CENSUS_REL, '--model', 'claude-fable-5-2', '--pilot', pilotId];
    expect(await main([...argv, '--yes'], h.deps)).toMatchObject({
      exitCode: 1,
      refusal: 'pilot',
    });
  });

  it('refuses when the ledger leaves less than the worst case plus USD 5, naming --split', async () => {
    const own = makeTempDir('ps-rec-');
    const pid = await pilotIn(fx, own);
    crowdLedger(own, 0.5);
    const { r, transport, errText } = await fullRun(fx, own, pid);
    expect({
      exit: [r.exitCode, r.refusal],
      calls: transportCalls(transport),
      remedies: [/--split/.test(errText()), /--max-tokens/.test(errText())],
    }).toEqual({ exit: [1, 'cost'], calls: 0, remedies: [true, true] });
  });

  it('refuses a population over the stop line unless --accept-large-population', async () => {
    const big = makeFixture({ population: POPULATION_STOP + 1 });
    const own = makeTempDir('ps-rec-');
    const stop = await fullRun(big, own, 'no-pilot');
    const accepted = await fullRun(big, own, 'no-pilot', {
      args: ['--accept-large-population', '--yes'],
    });
    expect([stop.r.refusal, accepted.r.refusal]).toEqual(['population-stop', 'pilot']);
  });

  it('refuses a --max-tokens under twice the largest output the pilot measured', async () => {
    // The mock answers with 400 output tokens, so the floor is 800.
    const { r, transport, errText } = await fullRun(fx, recordsDir, pilotId, {
      args: ['--max-tokens', '799', '--yes'],
    });
    expect([
      r.exitCode,
      r.refusal,
      transportCalls(transport),
      /twice.*400/.test(errText()),
    ]).toEqual([1, 'bad-flag', 0, true]);
  });

  it('refuses a --max-tokens above the default (it only lowers)', async () => {
    const { r } = await fullRun(fx, recordsDir, pilotId, { args: ['--max-tokens', '16001'] });
    expect([r.exitCode, r.refusal]).toEqual([1, 'bad-flag']);
  });

  it('without --yes runs every check, prints the plan and sends nothing', async () => {
    const before = runsIn(recordsDir);
    const { r, transport, text } = await fullRun(fx, recordsDir, pilotId, {
      args: ['--max-tokens', '800'],
    });
    expect({
      exitCode: r.exitCode,
      calls: transportCalls(transport),
      runs: runsIn(recordsDir),
      notSending: /not sending/.test(text()),
    }).toEqual({ exitCode: 0, calls: 0, runs: before, notSending: true });
  });

  describe('--yes', () => {
    let res;
    let prescreen;
    beforeAll(async () => {
      res = await fullRun(fx, recordsDir, pilotId);
      prescreen = recordOf(recordsDir, res.r.runIds[0], PRESCREEN_RECORD);
    });

    it('sends one batch and exits 0', () => {
      expect([res.r.exitCode, res.r.runIds.length, res.transport.calls.submitBatch]).toEqual([
        0, 1, 1,
      ]);
    });

    it('records a full run of every population row and every control', () => {
      const kinds = {};
      for (const it of prescreen.items) kinds[it.kind] = (kinds[it.kind] ?? 0) + 1;
      expect([prescreen.phase, prescreen.pilot, prescreen.includePhysicsBiology, kinds]).toEqual([
        'full',
        pilotId,
        false,
        { control: 16, population: 30 },
      ]);
    });

    it('presents every item in exactly one request', () => {
      const ids = prescreen.requests.flatMap((q) => q.ids).sort();
      expect(ids).toEqual(prescreen.items.map((i) => i.id).sort());
    });
  });

  it('--include-physics-biology adds those rows and records the answer', async () => {
    const own = makeTempDir('ps-rec-');
    const pid = await pilotIn(fx, own);
    const { r } = await fullRun(fx, own, pid, { args: ['--include-physics-biology', '--yes'] });
    const ps = recordOf(own, r.runIds[0], PRESCREEN_RECORD);
    const pb = ps.items.filter((i) => i.kind === 'physicsBiology').length;
    expect([r.exitCode, ps.includePhysicsBiology, pb, ps.excluded.physicsBiology]).toEqual([
      0,
      true,
      16,
      0,
    ]);
  });

  it('--split 2 sends two batches, each recording every item and its own requests', async () => {
    const own = makeTempDir('ps-rec-');
    const pid = await pilotIn(fx, own);
    const { r, transport } = await fullRun(fx, own, pid, { args: ['--split', '2', '--yes'] });
    const [a, b] = r.runIds.map((id) => recordOf(own, id, PRESCREEN_RECORD));
    const idsOf = (ps) => ps.requests.flatMap((q) => q.ids);
    expect({
      exitCode: r.exitCode,
      batches: transport.calls.submitBatch,
      split: [a.split, b.split],
      sameItems: JSON.stringify(a.items) === JSON.stringify(b.items),
      covered: [...idsOf(a), ...idsOf(b)].sort(),
    }).toEqual({
      exitCode: 0,
      batches: 2,
      split: [
        { part: 1, of: 2 },
        { part: 2, of: 2 },
      ],
      sameItems: true,
      covered: a.items.map((i) => i.id).sort(),
    });
  });

  it('the paid preflight refuses a dirty input with zero calls', async () => {
    const real = makeGit({ cwd: fx.root });
    const git = (args) => (args[0] === 'status' ? ` M ${CENSUS_REL}\0` : real(args));
    const { r, transport } = await fullRun(fx, recordsDir, pilotId, { extra: { git } });
    expect([r.exitCode, r.refusal, transportCalls(transport)]).toEqual([1, 'preflight', 0]);
  });

  it('re-checks the cap before each later batch and stops when it no longer fits', async () => {
    const own = makeTempDir('ps-rec-');
    const pid = await pilotIn(fx, own);
    const dry = await fullRun(fx, own, pid, { args: ['--split', '2'] });
    const worst = [
      ...dry.text().matchAll(/^ {2}batch \d of 2: \d+ requests, worst case USD ([\d.]+)$/gm),
    ].map((m) => Number(m[1]));
    const { committedUsd } = summarizeLedger(readLedger(ledgerOf(own)));
    // Batch 1 fits with USD 0.1 to spare; its 3 answers cost about USD 0.3, so batch 2 does not.
    crowdLedger(own, Math.max(...worst) + committedUsd + 0.1);
    const base = mockTransport({ answer: answerer() });
    const transport = {
      ...base,
      async *batchResults(id) {
        for await (const r of base.batchResults(id)) {
          r.result.message.usage = { ...r.result.message.usage, output_tokens: 10_000 };
          yield r;
        }
      },
    };
    const { r, text } = await fullRun(fx, own, pid, { args: ['--split', '2', '--yes'], transport });
    expect([
      worst.length,
      r.exitCode,
      base.calls.submitBatch,
      /^stop and ask: batch 2's worst case USD [\d.]+ no longer fits/m.test(text()),
    ]).toEqual([2, 2, 1, true]);
  });

  it('stops at the first batch that does not end complete', async () => {
    const own = makeTempDir('ps-rec-');
    const pid = await pilotIn(fx, own);
    const transport = mockTransport({ answer: answerer(), batchStates: ['in_progress'] });
    const { r, text } = await fullRun(fx, own, pid, {
      args: ['--split', '2', '--yes'],
      transport,
      extra: { maxPolls: 1 },
    });
    expect([r.exitCode, transport.calls.submitBatch, /resume --run /.test(text())]).toEqual([
      2,
      1,
      true,
    ]);
  });

  it('stops at the first batch that leaves one of its population rows unjudged', async () => {
    const own = makeTempDir('ps-rec-');
    const pid = await pilotIn(fx, own);
    let seen = 0;
    const transport = refusingTransport({ refuse: () => (seen += 1) === 1 });
    const { r, text } = await fullRun(fx, own, pid, {
      args: ['--split', '2', '--yes'],
      transport,
    });
    expect([
      r.exitCode,
      transport.calls.submitBatch,
      /^stop and ask: run \S+ left \d+ of its population rows unjudged.*batches 2 to 2 were not sent/m.test(
        text()
      ),
    ]).toEqual([2, 1, true]);
  });
});

describe('resume', () => {
  let fx;
  let recordsDir;
  let transport;
  let started;
  beforeAll(async () => {
    fx = makeFixture();
    recordsDir = makeTempDir('ps-rec-');
    const pid = await pilotIn(fx, recordsDir);
    transport = mockTransport({ answer: answerer(), batchStates: ['in_progress', 'ended'] });
    started = await fullRun(fx, recordsDir, pid, { transport, extra: { maxPolls: 1 } });
  });

  it('a batch whose polling stopped leaves run exiting 2 with the resume line', () => {
    expect([started.r.exitCode, /resume --run /.test(started.text())]).toEqual([2, true]);
  });

  it('collect refuses a run that has not ended (it would buy its rows twice)', async () => {
    const { r, verdicts } = await collect(fx, recordsDir, started.r.runIds);
    expect([r.exitCode, r.refusal, verdicts]).toEqual([1, 'bad-run', null]);
  });

  it('refuses from a linked worktree (git stub) before polling', async () => {
    const real = makeGit({ cwd: fx.root });
    const [common, own] = [makeTempDir('ps-common-'), makeTempDir('ps-own-')];
    const git = (args) =>
      args[0] === 'rev-parse' && args.includes('--git-common-dir')
        ? `${common}\n${own}\n`
        : real(args);
    const polls = transport.calls.getBatch;
    const h = harnessDeps(fx, { recordsDir, transport, git, ...NO_SLEEP, maxPolls: 1 });
    const r = await main(['resume', '--run', started.r.runIds[0]], h.deps);
    expect([r.exitCode, r.refusal, transport.calls.getBatch]).toEqual([
      1,
      'linked-worktree',
      polls,
    ]);
  });

  describe('resume --run', () => {
    let res;
    beforeAll(async () => {
      const h = harnessDeps(fx, { recordsDir, transport, ...NO_SLEEP, maxPolls: 1 });
      res = { r: await main(['resume', '--run', started.r.runIds[0]], h.deps), ...h };
    });

    it('collects the batch without resubmitting it and exits 0', () => {
      expect([res.r.exitCode, transport.calls.submitBatch]).toEqual([0, 1]);
    });

    it('ends the run complete and records the resume', () => {
      const id = started.r.runIds[0];
      expect([
        recordOf(recordsDir, id, 'run-end.json').status,
        recordOf(recordsDir, id, 'run.json').resumes.length,
      ]).toEqual(['complete', 1]);
    });

    it('refuses a run that already ended', async () => {
      const h = harnessDeps(fx, { recordsDir, transport, ...NO_SLEEP });
      expect(await main(['resume', '--run', started.r.runIds[0]], h.deps)).toMatchObject({
        exitCode: 1,
        refusal: 'bad-run',
      });
    });
  });
});

describe('collect', () => {
  let fx;
  let recordsDir;
  let fullId;
  let refusedPopulation;
  beforeAll(async () => {
    fx = makeFixture();
    recordsDir = makeTempDir('ps-rec-');
    const pid = await pilotIn(fx, recordsDir);
    const transport = refusingTransport({
      refuse: (rows) => rows.some((x) => x.en === 'qterm001'),
    });
    const { r } = await fullRun(fx, recordsDir, pid, { transport });
    fullId = r.runIds[0];
    const ps = recordOf(recordsDir, fullId, PRESCREEN_RECORD);
    const kind = new Map(ps.items.map((i) => [i.id, i.kind]));
    const target = ps.items.find((i) => i.english === 'qterm001').id;
    refusedPopulation = ps.requests
      .find((q) => q.ids.includes(target))
      .ids.filter((id) => kind.get(id) === 'population')
      .sort();
  });

  it("lists a refused request's population rows as unjudged and exits 2", async () => {
    const { r, verdicts } = await collect(fx, recordsDir, [fullId]);
    const unjudged = verdicts.population.filter((x) => x.verdict === 'unjudged').map((x) => x.id);
    expect([
      r.exitCode,
      refusedPopulation.length > 0,
      unjudged.sort(),
      verdicts.population.length,
    ]).toEqual([2, true, refusedPopulation, 30]);
  });

  it('refuses when the census the runs name has changed (the pairs cannot be checked)', async () => {
    const file = path.join(fx.root, CENSUS_REL);
    const golden = fs.readFileSync(file);
    fs.writeFileSync(file, Buffer.concat([golden, Buffer.from('\n')]));
    const res = await collect(fx, recordsDir, [fullId]);
    fs.writeFileSync(file, golden);
    expect([res.r.exitCode, res.r.refusal, res.verdicts]).toEqual([1, 'private-data', null]);
  });

  it('--resend refuses a dirty input before any call (the paid preflight)', async () => {
    const real = makeGit({ cwd: fx.root });
    const git = (args) => (args[0] === 'status' ? ` M ${CENSUS_REL}\0` : real(args));
    const transport = mockTransport({ answer: answerer() });
    const res = await collect(fx, recordsDir, [fullId], {
      args: ['--resend', '--yes'],
      transport,
      extra: { git },
    });
    expect([res.r.exitCode, res.r.refusal, transportCalls(transport)]).toEqual([1, 'preflight', 0]);
  });

  it('refuses --yes without --resend', async () => {
    const { r } = await collect(fx, recordsDir, [fullId], { args: ['--yes'] });
    expect([r.exitCode, r.refusal]).toEqual([1, 'bad-flag']);
  });

  it('refuses an --out outside the results directory', async () => {
    const h = harnessDeps(fx, { recordsDir });
    const argv = ['collect', '--run', fullId, '--out', 'books/efnafraedi-2e/out'];
    const r = await main([...argv, '--isk-rate', '140', '--isk-rate-source', 'x'], h.deps);
    expect([r.exitCode, r.refusal]).toEqual([1, 'bad-flag']);
  });

  it('--resend refuses with a ledger too close to the cap and sends nothing', async () => {
    const crowd = crowdLedger(recordsDir, 0.05);
    const transport = mockTransport({ answer: answerer() });
    const res = await collect(fx, recordsDir, [fullId], {
      args: ['--resend', '--yes'],
      transport,
    });
    releaseAll({ ledgerPath: ledgerOf(recordsDir), id: crowd.id });
    expect([res.r.exitCode, res.r.refusal, transportCalls(transport), res.verdicts]).toEqual([
      1,
      'cost',
      0,
      null,
    ]);
  });

  describe('--resend --yes', () => {
    let res;
    beforeAll(async () => {
      const transport = mockTransport({ answer: answerer() });
      res = await collect(fx, recordsDir, [fullId], { args: ['--resend', '--yes'], transport });
    });

    it('sends only the unjudged population ids, one per request', () => {
      const ids = readJsonl(
        path.join(recordsDir, 'runs', res.verdicts.runs[1], 'requests.jsonl')
      ).map((q) => JSON.parse(q.body.messages[0].content).rows.map((x) => x.id));
      expect([
        res.transport.calls.send,
        ids.every((x) => x.length === 1),
        ids.flat().sort(),
      ]).toEqual([refusedPopulation.length, true, refusedPopulation]);
    });

    it('records the resend run as phase resend and adds it to the verdicts', () => {
      const ps = recordOf(recordsDir, res.verdicts.runs[1], PRESCREEN_RECORD);
      expect([ps.phase, ps.resendOf, res.verdicts.runs]).toEqual([
        'resend',
        [fullId],
        [fullId, ps.runId],
      ]);
    });

    it('leaves no population row unjudged', () => {
      expect(res.verdicts.population.filter((x) => x.verdict === 'unjudged')).toEqual([]);
    });
  });
});

describe('collect over complete runs', () => {
  let fx;
  let recordsDir;
  let ids;
  beforeAll(async () => {
    fx = makeFixture();
    recordsDir = makeTempDir('ps-rec-');
    const pid = await pilotIn(fx, recordsDir);
    const a = await fullRun(fx, recordsDir, pid);
    const b = await fullRun(fx, recordsDir, pid);
    ids = [a.r.runIds[0], b.r.runIds[0]];
  });

  it('refuses the same id answered in two runs, the first not unjudged, writing nothing', async () => {
    const { r, verdicts } = await collect(fx, recordsDir, ids);
    expect([r.exitCode, r.refusal, verdicts]).toEqual([1, 'bad-run', null]);
  });

  describe('one run', () => {
    let res;
    beforeAll(async () => {
      res = await collect(fx, recordsDir, [ids[0]]);
    });

    it('exits 0 with every row judged and every control as expected', () => {
      expect(res.r.exitCode).toBe(0);
    });

    it('writes the verdicts file with one row per population id', () => {
      expect([res.verdicts.schema, res.verdicts.population.length, res.verdicts.runs]).toEqual([
        'c19-prescreen-verdicts/1',
        30,
        [ids[0]],
      ]);
    });

    it('writes only census pairs and no private field', () => {
      const keys = new Set(res.verdicts.population.flatMap((x) => Object.keys(x)));
      expect([...keys].sort()).toEqual(
        [
          'english',
          'group',
          'icelandic',
          'id',
          'kind',
          'proposed',
          'reason',
          'rightSenses',
          'sentences',
          'verdict',
        ].sort()
      );
    });

    it('the report holds the control table', () => {
      expect(
        res.report.match(/^\| r\d{3} \| [\w -]+ \| (flag|fine) \| (flag|fine) \| ok \|/gm)
      ).toHaveLength(16);
    });

    it('the report holds a cost line in USD and ISK with the rate source', () => {
      expect([
        new RegExp(
          `^- \`${ids[0]}\` \\(full\\): claude-opus-5-5, effort high, ended complete: USD [\\d.]+ = ISK \\d+$`,
          'm'
        ).test(res.report),
        /140 ISK per USD; source: test rate, 2026-11-18/.test(res.report),
      ]).toEqual([true, true]);
    });
  });

  // Last: it edits run B's records.
  it('refuses to write a pair the reduced census does not hold (an edited record)', async () => {
    const file = path.join(recordsDir, 'runs', ids[1], PRESCREEN_RECORD);
    const ps = JSON.parse(fs.readFileSync(file, 'utf8'));
    const victim = ps.items.find((i) => i.kind === 'population');
    victim.icelandic = 'óbirt-orð';
    fs.writeFileSync(file, JSON.stringify(ps));
    const res = await collect(fx, recordsDir, [ids[1]]);
    expect([res.r.exitCode, res.r.refusal, res.verdicts]).toEqual([1, 'private-data', null]);
  });
});
