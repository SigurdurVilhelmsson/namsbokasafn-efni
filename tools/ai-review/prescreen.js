#!/usr/bin/env node
/**
 * prescreen.js — the c19 glossary pre-screen's runner (CLI): census → items → requests →
 * harness → records, and records → verdicts.
 *
 * Design: docs/superpowers/specs/2026-11-17-c19-glossary-prescreen-design.md (§6 pilot and gate,
 * §8 census, population and the public/private split).
 *
 *   reduce  0 ISK. The private full census (an absolute path OUTSIDE the repository) → the
 *           committed reduced census under experiments/terminology-consistency/results/: only
 *           rows whose (English, Icelandic) pair the committed export already publishes, with
 *           no `alternatives`, `ifRemoved` or `dbPath`; every other row is a count.
 *   plan    0 ISK. The population, each exclusion count, the control count, and the requests and
 *           worst-case USD of a full run (with and without the physics and biology rows) on every
 *           model. A population over POPULATION_STOP prints a stop-and-ask line and exits 2.
 *   pilot   PAID with --yes. Every control, PILOT_POPULATION_ROWS chemistry rows and
 *           PILOT_PHYSICS_BIOLOGY_ROWS physics or biology rows (each set by pickEvenly), one
 *           interactive run. Preflight first (nothing is spent or written if it fails); without
 *           --yes it stops after the preflight and the plan. Then it judges the run FROM ITS
 *           RECORDS: the control table, the chemistry and the physics-and-biology flag rates, and
 *           the cost per row.
 *
 * Every command that builds items seeds them with the reduced census's sha256, so a re-plan gives
 * the same items, ids and requests.
 *
 * Exit codes: 0 done; 1 refused (the message says why); 2 stop and ask: plan's population is over
 * the stop line, or the pilot's gate failed, its chemistry flag rate is over PILOT_FLAG_STOP, its
 * run did not end complete, or a chemistry row is unjudged (a row is never counted as fine because
 * its answer is missing, spec §2).
 *
 * Preflight (pilot):
 *   - the repository is the MAIN checkout (the ledger, and so the cap, lives there);
 *   - the prompt, the ruling set, the census, the export, the English segments and every file of
 *     the code (CODE_PATHS) are tracked and clean, so the commit a record names describes what
 *     ran.
 *
 * Flags are parsed strictly (node:util parseArgs): an unknown flag is an error, never a silent
 * no-op. Imports nothing from server/ (the MIT to AGPL boundary).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, CAP_USD, LEDGER_FILE, assertBookSlug } from './config.js';
import { loadRulingSet } from './ruling-set.js';
import { runInteractive } from './harness.js';
import { summarizeLedger, readLedger } from './ledger.js';
import { mintRunId, openRunDir, createRecordWriter, RECORD_FILES } from './records.js';
import { makeGit, cleanTrackedProblems, assertMainCheckout } from './provenance.js';
import {
  BOOK,
  DEFAULT_RULING_SET,
  CODE_PATHS as TERM_PASS_CODE_PATHS,
  estimateRequests,
} from './term-pass.js';
import { loadPrompt } from './term-pass-request.js';
import {
  CENSUS_SCHEMA,
  reduceCensus,
  loadUnits,
  buildPopulation,
  buildControls,
  pickEvenly,
  assembleItems,
} from './prescreen-population.js';
import {
  USE,
  PROMPT_PATH,
  ROWS_PER_REQUEST,
  DEFAULT_EFFORT,
  DEFAULT_MAX_TOKENS,
  MODELS,
  buildRequests,
} from './prescreen-request.js';
import { parsePrescreenResponse, judgeControls } from './prescreen-response.js';

export const PRESCREEN_RECORD = 'prescreen.json';
export const PRESCREEN_SCHEMA = 'c19-prescreen/1';
export const PILOT_POPULATION_ROWS = 24;
export const PILOT_PHYSICS_BIOLOGY_ROWS = 15;
/** Spec §6: stop and ask before the full run above this many population rows. */
export const POPULATION_STOP = 450;
/** Spec §6: stop and ask if the model flags more than this share of the pilot's chemistry rows. */
export const PILOT_FLAG_STOP = 0.25;
/** Where the reduced census (and later the verdicts) are committed. */
export const RESULTS_DIR = 'experiments/terminology-consistency/results';
/**
 * Every repo path whose code decides what a run sends. The term pass's set: this CLI's import
 * closure (pinned by a test) reaches tools/lib (mt-layers, via the population) and
 * tools/api-translate.js (via config.js) as well as tools/ai-review.
 */
export const CODE_PATHS = TERM_PASS_CODE_PATHS;

/** How the items were drawn (spec §7: prescreen.json holds the sampling rule). */
const SAMPLING = Object.freeze({
  seed: 'the reduced census file sha256 (census.sha256)',
  sentences:
    'up to 5 per row from the matching segments of 02-for-mt, one chapter at a time in chapter ' +
    'order, each chapter ordered by sha256(seed NUL segmentId) (prescreen-population.js sampleSentences)',
  itemOrder:
    'sha256(seed NUL english NUL icelandic NUL control name); the two homograph rows kept at ' +
    'least 8 apart (prescreen-population.js assembleItems)',
});
const PILOT_PICK = Object.freeze({
  population: PILOT_POPULATION_ROWS,
  physicsBiology: PILOT_PHYSICS_BIOLOGY_ROWS,
  rule: 'pickEvenly: spread evenly over the rows sorted by match count, then English',
});

const refusal = (code, message) => Object.assign(new Error(`[${code}] ${message}`), { code });
const isRefusal = (err) =>
  typeof err?.code === 'string' && String(err.message).startsWith(`[${err.code}]`);

/** Run `fn`; a plain library error becomes a refusal with `code` (a refusal passes through). */
function guarded(code, fn) {
  try {
    return fn();
  } catch (err) {
    if (isRefusal(err)) throw err;
    throw refusal(code, err.message);
  }
}

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const repoRel = (repoRoot, abs) => path.relative(repoRoot, abs).split(path.sep).join('/');
const isInside = (p, root) => {
  const rel = path.relative(root, p);
  return !(rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel));
};
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;

function usage() {
  return [
    'usage: node tools/ai-review/prescreen.js <reduce|plan|pilot> [flags]',
    '  reduce  --census-full <abs path outside the repo> --out <repo path under ' +
      `${RESULTS_DIR}/>`,
    '  plan    --census <repo path of the reduced census>',
    `  pilot   --census <repo path> --model <${MODELS.join('|')}> [--yes]`,
    `The book is ${BOOK}. pilot spends only with --yes, from the main checkout.`,
  ].join('\n');
}

const OPTIONS = {
  'census-full': { type: 'string' },
  out: { type: 'string' },
  census: { type: 'string' },
  model: { type: 'string' },
  yes: { type: 'boolean' },
  help: { type: 'boolean' },
};

function contextFrom(deps) {
  const repoRoot = deps.repoRoot ?? REPO_ROOT;
  const bookDir = deps.bookDir ?? path.join(repoRoot, 'books', BOOK);
  if (path.basename(bookDir) !== BOOK)
    throw refusal('wrong-book', `this runner processes ${BOOK} only`);
  assertBookSlug(BOOK);
  return {
    repoRoot,
    bookDir,
    recordsDir: deps.recordsDir ?? path.join(bookDir, 'ai-review'),
    git: deps.git ?? makeGit({ cwd: repoRoot }),
    now: deps.now ?? (() => new Date()),
    out: deps.out ?? ((s) => process.stdout.write(s)),
    codePaths: deps.codePaths ?? CODE_PATHS,
  };
}

// ── inputs ──────────────────────────────────────────────────────────────────────────────────

function checkCensusShape(doc, where) {
  if (!isPlainObject(doc)) throw refusal('bad-census', `${where} is not a JSON object`);
  if (doc.schema !== CENSUS_SCHEMA)
    throw refusal(
      'bad-census',
      `${where}: schema is ${JSON.stringify(doc.schema)}, not ${CENSUS_SCHEMA}`
    );
  if (doc.book !== BOOK)
    throw refusal('bad-census', `${where}: book is ${JSON.stringify(doc.book)}, not ${BOOK}`);
  if (!Array.isArray(doc.rows) || doc.rows.length === 0)
    throw refusal('bad-census', `${where} has no rows`);
}

function parseJson(text, where) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw refusal('bad-census', `${where} does not parse as JSON (${err.message})`);
  }
}

/**
 * The reduced census at a repo path: its doc, its repo-relative path and the sha256 of its bytes
 * (the items' seed). A census that is not reduced refuses: the full one is private (spec §8).
 */
function loadCensus(ctx, p) {
  if (typeof p !== 'string' || p === '' || path.isAbsolute(p) || path.normalize(p).startsWith('..'))
    throw refusal('bad-flag', '--census must be a repo-relative path');
  const rel = path.normalize(p).split(path.sep).join('/');
  const abs = path.join(ctx.repoRoot, rel);
  if (!fs.existsSync(abs)) throw refusal('bad-flag', `--census: ${rel} does not exist`);
  const bytes = fs.readFileSync(abs);
  const doc = parseJson(bytes.toString('utf8'), rel);
  checkCensusShape(doc, rel);
  if (doc.reduced !== true) {
    throw refusal(
      'bad-census',
      `${rel} is not a reduced census; the full census is private and stays outside the ` +
        'repository (run reduce first)'
    );
  }
  return { path: rel, sha256: sha256(bytes), doc };
}

function loadExport(ctx) {
  const abs = path.join(ctx.bookDir, 'glossary', 'glossary-unified.json');
  const terms = guarded('bad-input', () => JSON.parse(fs.readFileSync(abs, 'utf8')).terms);
  if (!Array.isArray(terms)) throw refusal('bad-input', `${abs} has no terms array`);
  return { path: repoRel(ctx.repoRoot, abs), terms };
}

function loadDefaultRulingSet(ctx) {
  const rs = guarded('bad-input', () => loadRulingSet(path.join(ctx.repoRoot, DEFAULT_RULING_SET)));
  return { path: DEFAULT_RULING_SET, sha256: rs.sha256, rulings: rs.rulings };
}

/** Everything a command that builds items reads. */
function loadInputs(ctx, censusFlag) {
  if (censusFlag === undefined) throw refusal('bad-flag', '--census <repo path> is required');
  const census = loadCensus(ctx, censusFlag);
  const prompt = guarded('bad-input', () => loadPrompt(path.join(ctx.repoRoot, PROMPT_PATH)));
  return {
    census,
    export: loadExport(ctx),
    rulingSet: loadDefaultRulingSet(ctx),
    prompt: { path: PROMPT_PATH, sha256: prompt.sha256, text: prompt.text, schema: prompt.schema },
    units: guarded('bad-input', () => loadUnits(ctx.bookDir)),
    unitsPath: repoRel(ctx.repoRoot, path.join(ctx.bookDir, '02-for-mt')),
  };
}

/** The population (with its exclusion counts) and the controls, seeded by the census. */
function populationOf(inputs) {
  const seed = inputs.census.sha256;
  const population = guarded('bad-items', () =>
    buildPopulation({
      census: inputs.census.doc,
      rulingSet: inputs.rulingSet,
      exportTerms: inputs.export.terms,
      units: inputs.units,
      seed,
    })
  );
  const controls = guarded('bad-items', () => buildControls({ units: inputs.units, seed }));
  return { seed, population, controls };
}

// ── items, requests, records ────────────────────────────────────────────────────────────────

/**
 * Items, their key and the requests of one run.
 * @returns {{ items: object[], key: Record<string, object>, requests: Array<{key, body, presented}> }}
 */
export function buildRun({
  inputs,
  seed,
  model,
  rows,
  physicsBiology = [],
  controls,
  effort = DEFAULT_EFFORT,
  maxTokens = DEFAULT_MAX_TOKENS,
}) {
  const { items, key } = guarded('bad-items', () =>
    assembleItems({ population: { rows, physicsBiology }, controls, seed })
  );
  const requests = guarded('bad-items', () =>
    buildRequests({
      items,
      prompt: inputs.prompt,
      model,
      effort,
      maxTokens,
      rowsPerRequest: ROWS_PER_REQUEST,
    })
  );
  return { items, key, requests };
}

/**
 * The run's prescreen.json. Written by the harness right after run.json (its `extraRecords`),
 * before anything is spent, so a run killed mid-way still records what it was asked. Beyond the
 * brief's fields each item carries its `sentences` (what the model saw; OpenStax English, public)
 * and a control its `flagKinds` (ruling P8: the stricter answer is pre-registered here), so the
 * run can be judged, and its unjudged rows re-sent, from the records alone.
 */
export function prescreenPayload({
  runId,
  phase,
  model,
  effort = DEFAULT_EFFORT,
  inputs,
  items,
  key,
  requests,
  pick = null,
}) {
  return {
    schema: PRESCREEN_SCHEMA,
    runId,
    phase,
    model,
    effort,
    census: { path: inputs.census.path, sha256: inputs.census.sha256 },
    rulingSet: { path: inputs.rulingSet.path, sha256: inputs.rulingSet.sha256 },
    prompt: { path: inputs.prompt.path, sha256: inputs.prompt.sha256 },
    sampling: { ...SAMPLING, pick },
    items: items.map((it) => ({
      id: it.id,
      english: it.english,
      icelandic: it.icelandic,
      ...key[it.id],
      sentences: it.sentences,
    })),
    rowsPerRequest: ROWS_PER_REQUEST,
    requests: requests.map((r) => ({ key: r.key, ids: r.presented })),
  };
}

/** The harness options every paid command shares. */
function harnessOptions(ctx, deps, { inputs, model, effort, maxTokens, runId }) {
  return {
    recordsDir: ctx.recordsDir,
    use: USE,
    model,
    effort,
    maxTokens,
    prompts: [{ path: inputs.prompt.path, sha256: inputs.prompt.sha256 }],
    rulingSet: { path: inputs.rulingSet.path, sha256: inputs.rulingSet.sha256 },
    runId,
    now: ctx.now,
    ...(deps.transport ? { transport: deps.transport } : {}),
    ...(deps.keyOptions ? { keyOptions: deps.keyOptions } : {}),
    ...(deps.harnessCommit ? { harnessCommit: deps.harnessCommit } : {}),
    ...(deps.harnessDirty ? { harnessDirty: deps.harnessDirty } : {}),
  };
}

/**
 * One run, read from its records only: prescreen.json, the requests sent, every response parsed
 * against the presented ids, run-end.json.
 * @returns {{ prescreen: object, key: Record<string, object>, verdicts: Map<string, object>,
 *   problems: Record<string, number>, dropped: object[], responses: number, rowsSent: number,
 *   runEnd: object|null }}
 */
export function readRun({ recordsDir, runId, schema }) {
  const r = createRecordWriter({ dir: openRunDir(recordsDir, runId) });
  if (!r.exists(PRESCREEN_RECORD))
    throw refusal('bad-run', `run ${runId} has no ${PRESCREEN_RECORD}`);
  const prescreen = r.readJson(PRESCREEN_RECORD);
  if (prescreen.schema !== PRESCREEN_SCHEMA || prescreen.runId !== runId)
    throw refusal(
      'bad-run',
      `run ${runId}: ${PRESCREEN_RECORD} is not a ${PRESCREEN_SCHEMA} record of it`
    );
  const idsByKey = new Map(prescreen.requests.map((q) => [q.key, q.ids]));
  // The judging key is each item minus what the model saw: kind, name, expected, flagKinds.
  const seen = new Set(['id', 'english', 'icelandic', 'sentences']);
  const key = {};
  for (const item of prescreen.items)
    key[item.id] = Object.fromEntries(Object.entries(item).filter(([k]) => !seen.has(k)));
  const rowsSent = r
    .readJsonl(RECORD_FILES.requests)
    .reduce((n, q) => n + (idsByKey.get(q.key)?.length ?? 0), 0);
  const verdicts = new Map();
  const problems = {};
  const dropped = [];
  const lines = r.readJsonl(RECORD_FILES.responses);
  for (const line of lines) {
    const ids = idsByKey.get(line.key);
    if (!ids) throw refusal('bad-run', `run ${runId}: a response for unknown request ${line.key}`);
    const parsed = parsePrescreenResponse({ message: line.response, presentedIds: ids, schema });
    if (parsed.problem) problems[parsed.problem] = (problems[parsed.problem] ?? 0) + 1;
    for (const [id, v] of parsed.verdicts) verdicts.set(id, v);
    dropped.push(...parsed.dropped);
  }
  const runEnd = r.exists(RECORD_FILES.runEnd) ? r.readJson(RECORD_FILES.runEnd) : null;
  return { prescreen, key, verdicts, problems, dropped, responses: lines.length, rowsSent, runEnd };
}

/** Rows of one kind in a run: how many, how many answered, how many flagged. */
function tally({ prescreen, verdicts }, kind) {
  const ids = prescreen.items.filter((i) => i.kind === kind).map((i) => i.id);
  const judged = ids.filter((id) => verdicts.has(id));
  const flagged = judged.filter((id) => verdicts.get(id).verdict === 'flag').length;
  return {
    total: ids.length,
    judged: judged.length,
    flagged,
    unjudged: ids.length - judged.length,
  };
}

function printLedger(ctx) {
  const s = summarizeLedger(readLedger(path.join(ctx.recordsDir, LEDGER_FILE)));
  ctx.out(
    `ledger: settled USD ${s.settledUsd}, open USD ${s.openUsd}, committed USD ` +
      `${s.committedUsd} of the USD ${CAP_USD} cap\n`
  );
}

// ── reduce ──────────────────────────────────────────────────────────────────────────────────

/**
 * Where a write to `abs` would land: its deepest existing ancestor through every symlink, the
 * rest rebuilt below it. A component that exists but resolves to nothing refuses.
 */
function landingPath(abs, name) {
  const tail = [];
  let cur = abs;
  for (;;) {
    if (fs.existsSync(cur) || isLink(cur)) {
      let real;
      try {
        real = fs.realpathSync(cur);
      } catch {
        throw refusal(
          'bad-flag',
          `--${name} passes through a link that resolves to nothing: ${cur}`
        );
      }
      return path.join(real, ...tail);
    }
    const parent = path.dirname(cur);
    if (parent === cur) return abs;
    tail.unshift(path.basename(cur));
    cur = parent;
  }
}

function isLink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/** The private full census: an absolute path whose file lies outside the repository. */
function privateCensusPath(file, repoRoot) {
  if (typeof file !== 'string' || !path.isAbsolute(file))
    throw refusal('bad-flag', '--census-full must be an absolute path');
  if (!fs.existsSync(file)) throw refusal('bad-flag', `--census-full: ${file} does not exist`);
  const real = fs.realpathSync(file);
  if (isInside(path.resolve(file), repoRoot) || isInside(real, fs.realpathSync(repoRoot))) {
    throw refusal(
      'bad-flag',
      '--census-full must lie outside the repository: the full census is private (spec §8)'
    );
  }
  return real;
}

/** The reduced census's destination: a repo path under RESULTS_DIR, judged where it lands. */
function resultsOutput(p, repoRoot) {
  const what = `--out must be a repo-relative .json path under ${RESULTS_DIR}/`;
  if (typeof p !== 'string' || p === '' || path.isAbsolute(p)) throw refusal('bad-flag', what);
  const rel = path.posix.normalize(p.split(path.sep).join('/'));
  if (!rel.startsWith(`${RESULTS_DIR}/`) || !rel.endsWith('.json')) throw refusal('bad-flag', what);
  const landing = landingPath(path.join(repoRoot, rel), 'out');
  if (!isInside(landing, path.join(fs.realpathSync(repoRoot), RESULTS_DIR)))
    throw refusal('bad-flag', `--out lands outside ${RESULTS_DIR}/: ${landing}`);
  return { rel, abs: landing };
}

async function cmdReduce(ctx, values) {
  if (values['census-full'] === undefined || values.out === undefined)
    throw refusal('bad-flag', 'reduce needs --census-full and --out');
  const src = privateCensusPath(values['census-full'], ctx.repoRoot);
  const out = resultsOutput(values.out, ctx.repoRoot);
  const full = parseJson(fs.readFileSync(src, 'utf8'), '--census-full');
  checkCensusShape(full, '--census-full');
  if (full.reduced === true) throw refusal('bad-census', '--census-full is already reduced');
  const reduced = guarded('bad-census', () =>
    reduceCensus(full, loadExport(ctx).terms, loadDefaultRulingSet(ctx))
  );
  const text = `${JSON.stringify(reduced, null, 1)}\n`;
  fs.mkdirSync(path.dirname(out.abs), { recursive: true });
  const tmp = `${out.abs}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, out.abs);
  ctx.out(
    `kept ${reduced.rows.length} of ${full.rows.length} rows (pairs the export publishes); ` +
      `withheld ${JSON.stringify(reduced.withheld)}\n` +
      `wrote ${out.rel} (sha256 ${sha256(text)}, the items' seed)\n`
  );
  return { exitCode: 0, path: out.rel };
}

// ── plan ────────────────────────────────────────────────────────────────────────────────────

function printEstimates(ctx, label, { inputs, seed, rows, physicsBiology, controls }) {
  let count = null;
  for (const model of MODELS) {
    const { items, requests } = buildRun({ inputs, seed, model, rows, physicsBiology, controls });
    if (count === null) {
      ctx.out(
        `${label}: ${items.length} rows in ${requests.length} requests of ${ROWS_PER_REQUEST}\n`
      );
      count = items.length;
    }
    const e = estimateRequests(requests, { model, maxTokens: DEFAULT_MAX_TOKENS });
    ctx.out(
      `  ${model}: ${e.requests} requests, worst case USD ${e.worstCaseUsd.interactive} ` +
        `interactive / ${e.worstCaseUsd.batch} batch (input ~${e.inputTokensEstimate} tokens, ` +
        `max_tokens ${DEFAULT_MAX_TOKENS})\n`
    );
  }
}

async function cmdPlan(ctx, values) {
  const inputs = loadInputs(ctx, values.census);
  const { seed, population, controls } = populationOf(inputs);
  ctx.out(`census ${inputs.census.path} (sha256 ${inputs.census.sha256}, the items' seed)\n`);
  ctx.out(`population: ${population.rows.length} chemistry rows\n`);
  for (const [cls, n] of Object.entries(population.excluded)) ctx.out(`excluded ${cls}: ${n}\n`);
  ctx.out(`controls: ${controls.length}\n`);
  const base = { inputs, seed, rows: population.rows, controls };
  printEstimates(ctx, 'full run (population + controls)', { ...base, physicsBiology: [] });
  printEstimates(ctx, 'with the physics and biology rows', {
    ...base,
    physicsBiology: population.physicsBiology,
  });
  ctx.out(`(the cap is USD ${CAP_USD}; plan sends nothing)\n`);
  if (population.rows.length > POPULATION_STOP) {
    ctx.out(
      `stop and ask: the population is ${population.rows.length} rows, over the ` +
        `${POPULATION_STOP}-row stop line (spec §6); ask before any full run\n`
    );
    return { exitCode: 2, population: population.rows.length };
  }
  return { exitCode: 0, population: population.rows.length };
}

// ── pilot ───────────────────────────────────────────────────────────────────────────────────

function preflight(ctx, inputs) {
  assertMainCheckout(ctx.git);
  const problems = cleanTrackedProblems(ctx.git, [
    inputs.prompt.path,
    inputs.rulingSet.path,
    inputs.census.path,
    inputs.export.path,
    inputs.unitsPath,
    ...ctx.codePaths,
  ]);
  if (problems.length) {
    throw refusal(
      'preflight',
      `refusing before spending anything:\n  - ${problems.join('\n  - ')}`
    );
  }
}

/**
 * Print a pilot's verdict from its records and decide it (spec §6): the control table with the
 * model's own reasons, both flag rates on separate lines, the cost per row.
 * @returns {string[]} the reasons to stop and ask (empty = passed)
 */
function judgePilot(ctx, read) {
  const gate = judgeControls({ verdicts: read.verdicts, key: read.key });
  ctx.out(
    'controls (every positive flagged, the homograph pair as expected, no negative flagged):\n'
  );
  for (const c of gate.results) {
    const v = read.verdicts.get(c.id);
    const why = v ? `${v.kind ? ` (${v.kind})` : ''}: ${v.reason}` : '';
    ctx.out(
      `  ${c.ok ? 'ok  ' : 'FAIL'} ${c.id} ${String(c.name).padEnd(18)} expected ${c.expected} ` +
        `got ${c.got}${why}\n`
    );
  }
  const passed = gate.results.filter((c) => c.ok).length;
  ctx.out(
    `gate: ${gate.pass ? 'PASS' : 'FAIL'} (${passed} of ${gate.results.length} controls as expected)\n`
  );
  // A rate is over the rows that have a verdict: an unjudged row is neither fine nor flagged.
  const rate = (t) =>
    t.judged
      ? `flagged ${t.flagged} of ${t.judged} (${pct(t.flagged, t.judged)}) judged rows`
      : 'no judged rows';
  const chem = tally(read, 'population');
  const pb = tally(read, 'physicsBiology');
  ctx.out(
    `chemistry rows: ${rate(chem)}, ${chem.unjudged} of ${chem.total} unjudged; stop line ` +
      `${PILOT_FLAG_STOP * 100}%\n`
  );
  ctx.out(
    `physics and biology rows: ${rate(pb)}, ${pb.unjudged} of ${pb.total} unjudged; for the ` +
      'scope decision (spec §2), not gated\n'
  );
  if (read.dropped.length || Object.keys(read.problems).length) {
    ctx.out(
      `answers: ${read.responses} responses; problems ${JSON.stringify(read.problems)}; ` +
        `${read.dropped.length} entries dropped ${JSON.stringify(read.dropped)}\n`
    );
  }
  if (read.runEnd && read.rowsSent > 0) {
    const perRow = Math.round((read.runEnd.totalUsd / read.rowsSent) * 1e6) / 1e6;
    ctx.out(
      `cost: USD ${read.runEnd.totalUsd} for ${read.rowsSent} rows sent = USD ${perRow} per row ` +
        '(run-end.json)\n'
    );
  } else {
    ctx.out(`cost: no per-row cost (${read.runEnd ? 'no rows sent' : 'no run-end.json'})\n`);
  }
  const stops = [];
  const status = read.runEnd?.status ?? 'without a run-end.json';
  if (status !== 'complete') stops.push(`the run ended ${status}, not complete`);
  if (!gate.pass) stops.push('the control gate failed (FAIL rows above, with the model’s reasons)');
  if (chem.unjudged > 0) stops.push(`${chem.unjudged} chemistry rows have no verdict`);
  if (chem.total === 0) stops.push('the pilot holds no chemistry rows');
  else if (chem.judged > 0 && chem.flagged / chem.judged > PILOT_FLAG_STOP)
    stops.push(
      `the chemistry flag rate ${pct(chem.flagged, chem.judged)} is over ${PILOT_FLAG_STOP * 100}%`
    );
  return stops;
}

async function cmdPilot(ctx, values, deps) {
  if (values.model === undefined)
    throw refusal('bad-flag', `pilot needs --model (${MODELS.join(' or ')})`);
  const model = values.model;
  const inputs = loadInputs(ctx, values.census);
  const { seed, population, controls } = populationOf(inputs);
  const rows = pickEvenly(population.rows, PILOT_POPULATION_ROWS);
  const physicsBiology = pickEvenly(population.physicsBiology, PILOT_PHYSICS_BIOLOGY_ROWS);
  const built = buildRun({ inputs, seed, model, rows, physicsBiology, controls });
  const est = estimateRequests(built.requests, { model, maxTokens: DEFAULT_MAX_TOKENS });
  ctx.out(
    `pilot on ${model}, effort ${DEFAULT_EFFORT}, max_tokens ${DEFAULT_MAX_TOKENS}: ` +
      `${controls.length} controls + ${rows.length} of ${population.rows.length} chemistry rows + ` +
      `${physicsBiology.length} of ${population.physicsBiology.length} physics and biology rows = ` +
      `${built.items.length} rows in ${built.requests.length} requests\n` +
      `worst case USD ${est.worstCaseUsd.interactive} interactive (input ~${est.inputTokensEstimate} ` +
      `tokens; the cap is USD ${CAP_USD})\n`
  );
  preflight(ctx, inputs);
  ctx.out(
    `preflight passed: census ${inputs.census.sha256}; prompt ${inputs.prompt.sha256}; ruling set ` +
      `${inputs.rulingSet.sha256}\n`
  );
  if (!values.yes) {
    ctx.out('not sending: add --yes to spend.\n');
    return { exitCode: 0, sent: false };
  }
  const runId = mintRunId(ctx.now());
  const payload = prescreenPayload({
    runId,
    phase: 'pilot',
    model,
    inputs,
    items: built.items,
    key: built.key,
    requests: built.requests,
    pick: PILOT_PICK,
  });
  const result = await runInteractive({
    ...harnessOptions(ctx, deps, {
      inputs,
      model,
      effort: DEFAULT_EFFORT,
      maxTokens: DEFAULT_MAX_TOKENS,
      runId,
    }),
    requests: built.requests.map(({ key, body }) => ({ key, body })),
    extraRecords: [{ name: PRESCREEN_RECORD, payload }],
  });
  ctx.out(`run ${runId} ${result.status}: ${JSON.stringify(result.counts)}\n`);
  const read = readRun({ recordsDir: ctx.recordsDir, runId, schema: inputs.prompt.schema });
  const stops = judgePilot(ctx, read);
  printLedger(ctx);
  for (const s of stops) ctx.out(`stop and ask: ${s}\n`);
  if (stops.length === 0) ctx.out(`pilot passed on ${model}\n`);
  return { exitCode: stops.length ? 2 : 0, sent: true, runId, status: result.status };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────

/** Each subcommand: the flags it admits (any other refuses) and its handler. */
const COMMANDS = {
  reduce: { flags: ['census-full', 'out'], run: cmdReduce },
  plan: { flags: ['census'], run: cmdPlan },
  pilot: { flags: ['census', 'model', 'yes'], run: cmdPilot },
};

async function dispatch(argv, deps) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, strict: true, allowPositionals: true });
  } catch (err) {
    throw refusal('bad-flag', err.message);
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (values.help) {
    (deps.out ?? ((s) => process.stdout.write(s)))(`${usage()}\n`);
    return { exitCode: 0 };
  }
  if (!command) throw refusal('bad-flag', `name a command\n${usage()}`);
  if (rest.length) throw refusal('bad-flag', `unexpected argument ${rest[0]}`);
  if (!Object.hasOwn(COMMANDS, command))
    throw refusal('bad-flag', `unknown command ${command}\n${usage()}`);
  for (const k of Object.keys(values)) {
    if (!COMMANDS[command].flags.includes(k))
      throw refusal('bad-flag', `--${k} does not apply to ${command}`);
  }
  if (values.model !== undefined && !MODELS.includes(values.model))
    throw refusal('bad-model', `--model must be one of ${MODELS.join(', ')}, got ${values.model}`);
  return COMMANDS[command].run(contextFrom(deps), values, deps);
}

/**
 * Run the CLI. A refusal prints its message (to `deps.err`, default stderr) and returns exit 1;
 * any other error rejects.
 * @param {string[]} argv arguments after the script name
 * @param {object} [deps] injectable: repoRoot, bookDir, recordsDir, git, now, out, err, codePaths,
 *   transport, keyOptions, harnessCommit, harnessDirty
 * @returns {Promise<{ exitCode: number }>} 0 done, 1 refused, 2 stop and ask
 */
export async function main(argv, deps = {}) {
  try {
    return await dispatch(argv, deps);
  } catch (err) {
    if (!isRefusal(err)) throw err;
    (deps.err ?? ((s) => process.stderr.write(s)))(`prescreen: ${err.message}\n`);
    return { exitCode: 1, refusal: err.code };
  }
}

const isEntry = (() => {
  try {
    return (
      process.argv[1] !== undefined &&
      fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
})();

if (isEntry) {
  process.exitCode = 1;
  main(process.argv.slice(2)).then(
    (r) => {
      process.exitCode = Number.isInteger(r?.exitCode) ? r.exitCode : 1;
    },
    (err) => {
      process.stderr.write(`prescreen: ${err.stack ?? err.message}\n`);
      process.exitCode = 1;
    }
  );
}
