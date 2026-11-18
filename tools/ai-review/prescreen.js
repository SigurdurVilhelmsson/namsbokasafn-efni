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
 *   run     PAID with --yes. Every population row (plus the physics and biology rows with
 *           --include-physics-biology) and every control, through the Batch API, as --split
 *           sequential batches (one run each; every part's prescreen.json records EVERY item and
 *           its own requests). Refuses unless the named pilot, RE-JUDGED FROM ITS RECORDS, ran
 *           the same model and prompt, ended complete, its controls pass and its chemistry flag
 *           rate is not over PILOT_FLAG_STOP (--accept-pilot-flag-rate records the answer to
 *           that one stop); refuses a pilot that already has a full run (a second would buy
 *           every row again); refuses a population over POPULATION_STOP without
 *           --accept-large-population; refuses when the largest batch's worst case would leave
 *           less than COST_MARGIN_USD of the cap free, and passes the cap less that margin to
 *           the harness so it binds on the real reservation too. Stops at the first batch that
 *           does not end complete or leaves one of its population rows unjudged.
 *   resume  PAID (it settles what was already bought). A full run's batch whose polling stopped:
 *           the harness resumes it and never resubmits; then the run is judged on its own
 *           population rows and on the controls ITS OWN requests presented. An interactive run
 *           (a pilot or a resend) killed before it ended: with --yes, closed as interrupted, its
 *           open reservations settled at their worst case, so collect can take it.
 *   collect 0 ISK, or PAID with --resend --yes. Merges the named full (and resend) runs by item
 *           id into one verdict per population row (an id answered in two runs refuses), writes
 *           prescreen-verdicts.json and prescreen-report.md under RESULTS_DIR. With --resend the
 *           population rows still unjudged go once more, one per interactive request; it
 *           refuses first if the records directory holds a resend run of these rows that is not
 *           named (re-sent once means once over every run, not only the named ones). Each
 *           --pilot adds that pilot's cost to the report, never a verdict.
 *
 * Every command that builds items seeds them with the reduced census's sha256, so a re-plan gives
 * the same items, ids and requests.
 *
 * Exit codes: 0 done; 1 refused (the message says why); 2 stop and ask: plan's population is over
 * the stop line, or the pilot's gate failed, its chemistry flag rate is over PILOT_FLAG_STOP, its
 * run did not end complete, or a chemistry row is unjudged (a row is never counted as fine because
 * its answer is missing, spec §2); for run, resume and collect, a run did not end complete, a
 * population row is unjudged, or a control was missed (for resume, a control its own requests
 * presented).
 *
 * Preflight (pilot, run, collect --resend):
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
import { runInteractive, runBatch, closeInterruptedRun } from './harness.js';
import { summarizeLedger, readLedger } from './ledger.js';
import { usdToPico } from './pricing.js';
import { mintRunId, openRunDir, runDirFor, createRecordWriter, RECORD_FILES } from './records.js';
import { makeGit, cleanTrackedProblems, assertMainCheckout } from './provenance.js';
import {
  BOOK,
  DEFAULT_RULING_SET,
  CODE_PATHS as TERM_PASS_CODE_PATHS,
  estimateRequests,
  refusal,
  isInside,
  landingPath,
  repoRel,
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
import {
  POPULATION_KINDS,
  VERDICTS_FILE,
  REPORT_FILE,
  same,
  itemSig,
  checkRuns,
  mergeVerdicts,
  resendIds,
  buildVerdicts,
  assertPublishable,
  stopReasons,
  renderReport,
} from './prescreen-collect.js';

export const PRESCREEN_RECORD = 'prescreen.json';
export const PRESCREEN_SCHEMA = 'c19-prescreen/1';
export const PILOT_POPULATION_ROWS = 24;
export const PILOT_PHYSICS_BIOLOGY_ROWS = 15;
/** Spec §6: stop and ask before the full run above this many population rows. */
export const POPULATION_STOP = 450;
/** Spec §6: stop and ask if the model flags more than this share of the pilot's chemistry rows. */
export const PILOT_FLAG_STOP = 0.25;
/**
 * Spec §6: a full run (each of its batches) or a resend starts only if its worst case leaves at
 * least this much of the cap free.
 */
export const COST_MARGIN_USD = 5;
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
  population:
    "up to 5 sentences per row from the row's census matches in 02-for-mt: round-robin across " +
    'chapters in chapter order (one sentence per chapter per round), each chapter ordered by ' +
    'sha256(seed NUL segmentId) (prescreen-population.js sampleSentences)',
  controls:
    'positive and negative controls: up to 5 sentences from a whole-word search of the headword ' +
    'over the English of 02-for-mt, sampled the same way as population rows (sentencesFor)',
  homographs:
    'the two addition halves: not sampled; the sentence of each of the five named segment ids ' +
    'per half (spec §5; prescreen-population.js CONTROLS.homograph)',
  itemOrder:
    'sha256(seed NUL english NUL icelandic NUL control name); the two homograph rows kept at ' +
    'least 8 apart (prescreen-population.js assembleItems)',
});
const PILOT_PICK = Object.freeze({
  population: PILOT_POPULATION_ROWS,
  physicsBiology: PILOT_PHYSICS_BIOLOGY_ROWS,
  rule: 'pickEvenly: spread evenly over the rows sorted by match count, then English',
});

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
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;

function usage() {
  return [
    'usage: node tools/ai-review/prescreen.js <reduce|plan|pilot|run|resume|collect> [flags]',
    '  reduce  --census-full <abs path outside the repo> --out <repo path under ' +
      `${RESULTS_DIR}/>`,
    '  plan    --census <repo path of the reduced census>',
    `  pilot   --census <repo path> --model <${MODELS.join('|')}> [--yes]`,
    '  run     --census <repo path> --model <m> --pilot <runId> [--include-physics-biology]',
    '          [--split <n>] [--max-tokens <n>] [--accept-large-population]',
    '          [--accept-pilot-flag-rate] [--allow-second-run] [--yes]',
    '  resume  --run <runId> [--yes: close an interrupted pilot or resend]',
    `  collect --run <runId> [--run …] --out <repo dir under ${RESULTS_DIR}/>`,
    '          --isk-rate <ISK per USD> --isk-rate-source <text> [--pilot <runId> …]',
    '          [--resend [--yes]]',
    `The book is ${BOOK}. pilot, run and collect --resend spend only with --yes, from the main ` +
      'checkout.',
  ].join('\n');
}

const OPTIONS = {
  'census-full': { type: 'string' },
  out: { type: 'string' },
  census: { type: 'string' },
  model: { type: 'string' },
  // Repeatable for collect's cost lines; run takes exactly one.
  pilot: { type: 'string', multiple: true },
  'include-physics-biology': { type: 'boolean' },
  split: { type: 'string' },
  'max-tokens': { type: 'string' },
  'accept-large-population': { type: 'boolean' },
  'accept-pilot-flag-rate': { type: 'boolean' },
  'allow-second-run': { type: 'boolean' },
  run: { type: 'string', multiple: true },
  'isk-rate': { type: 'string' },
  'isk-rate-source': { type: 'string' },
  resend: { type: 'boolean' },
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
  const bytes = guarded('bad-input', () => fs.readFileSync(abs));
  const terms = guarded('bad-input', () => JSON.parse(bytes.toString('utf8')).terms);
  if (!Array.isArray(terms)) throw refusal('bad-input', `${abs} has no terms array`);
  return { path: repoRel(ctx.repoRoot, abs), terms, sha256: sha256(bytes) };
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
  maxTokens = DEFAULT_MAX_TOKENS,
  inputs,
  items,
  key,
  requests,
  excluded = {},
  pick = null,
  rowsPerRequest = ROWS_PER_REQUEST,
  extra = {},
}) {
  return {
    schema: PRESCREEN_SCHEMA,
    runId,
    phase,
    model,
    effort,
    maxTokens,
    excluded,
    ...extra,
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
    rowsPerRequest,
    requests: requests.map((r) => ({ key: r.key, ids: r.presented })),
  };
}

/** The transport and code-version seams every harness call takes from `deps`. */
const transportOptions = (deps) => ({
  ...(deps.transport ? { transport: deps.transport } : {}),
  ...(deps.keyOptions ? { keyOptions: deps.keyOptions } : {}),
  ...(deps.harnessCommit ? { harnessCommit: deps.harnessCommit } : {}),
  ...(deps.harnessDirty ? { harnessDirty: deps.harnessDirty } : {}),
});

/** A batch's polling seams (tests inject them; the real CLI polls every minute until it ends). */
const pollOptions = (deps) => ({
  ...(deps.sleep ? { sleep: deps.sleep } : {}),
  ...(deps.pollIntervalMs !== undefined ? { pollIntervalMs: deps.pollIntervalMs } : {}),
  ...(deps.maxPolls !== undefined ? { maxPolls: deps.maxPolls } : {}),
});

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
    ...transportOptions(deps),
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

/**
 * Spec §6's flag-rate stop, over the rows that have a verdict (an unjudged row is neither fine nor
 * flagged). pilot and run share it, so they agree at exactly PILOT_FLAG_STOP.
 */
const overFlagStop = (t) => t.judged > 0 && t.flagged / t.judged > PILOT_FLAG_STOP;
const rateOf = (t) =>
  t.judged
    ? `flagged ${t.flagged} of ${t.judged} (${pct(t.flagged, t.judged)}) judged rows`
    : 'no judged rows';

function printLedger(ctx) {
  const s = summarizeLedger(readLedger(path.join(ctx.recordsDir, LEDGER_FILE)));
  ctx.out(
    `ledger: settled USD ${s.settledUsd}, open USD ${s.openUsd}, committed USD ` +
      `${s.committedUsd} of the USD ${CAP_USD} cap\n`
  );
}

/**
 * What the cap leaves free after the ledger's committed USD and the COST_MARGIN_USD margin, in
 * integer pico-USD (may be negative), and a sentence saying how it was computed.
 */
function headroom(ctx) {
  const { committedUsd } = summarizeLedger(readLedger(path.join(ctx.recordsDir, LEDGER_FILE)));
  const freeP = usdToPico(CAP_USD) - usdToPico(committedUsd) - usdToPico(COST_MARGIN_USD);
  const freeUsd = Math.round(freeP / 1e6) / 1e6;
  return {
    freeP,
    says:
      `USD ${CAP_USD} cap − USD ${committedUsd} committed − USD ${COST_MARGIN_USD} margin = ` +
      `USD ${freeUsd} free (spec §6)`,
  };
}

/** Does a worst case of `usd` fit what the cap leaves free? */
const fits = (usd, room) => usdToPico(usd) <= room.freeP;

function positiveInt(v, name) {
  if (v === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(v)) throw refusal('bad-flag', `--${name} must be a positive integer`);
  return Number(v);
}

/** The population ids a run presented that have no verdict in it. */
function unjudgedPresented(read) {
  return read.prescreen.requests
    .flatMap((q) => q.ids)
    .filter((id) => POPULATION_KINDS.includes(read.key[id]?.kind) && !read.verdicts.has(id));
}

/**
 * The controls a run's OWN requests presented, judged on its verdicts. A split part records every
 * item but presents only its own requests, so judging every control would read the other parts'
 * controls as missed. Not a gate: an empty list (a part that presented no control) is no miss.
 */
function presentedControls(read) {
  const presented = new Set(read.prescreen.requests.flatMap((q) => q.ids));
  const key = Object.fromEntries(Object.entries(read.key).filter(([id]) => presented.has(id)));
  return judgeControls({ verdicts: read.verdicts, key }).results;
}

/**
 * Every pre-screen run in the records directory (a run directory holding a prescreen.json; the
 * directory is shared with other uses, whose runs are skipped), with whether it ended. A
 * prescreen.json that does not parse refuses: what that run sent cannot be told.
 * @returns {Array<{ runId: string, prescreen: object, ended: boolean }>}
 */
function scanPrescreenRuns(ctx, code) {
  const root = path.join(ctx.recordsDir, 'runs');
  if (!fs.existsSync(root)) return [];
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const file = path.join(dir, PRESCREEN_RECORD);
    if (!fs.existsSync(file)) continue;
    let prescreen;
    try {
      prescreen = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw refusal(
        code,
        `run ${entry.name}: ${PRESCREEN_RECORD} does not parse (${err.message}); what it sent ` +
          'cannot be told'
      );
    }
    if (!isPlainObject(prescreen)) {
      throw refusal(code, `run ${entry.name}: ${PRESCREEN_RECORD} is not a JSON object`);
    }
    found.push({
      runId: entry.name,
      prescreen,
      ended: fs.existsSync(path.join(dir, RECORD_FILES.runEnd)),
    });
  }
  return found.sort((a, b) => (a.runId < b.runId ? -1 : 1));
}

/** How to bring a run that has not ended to an end, by its mode (run.json). */
function remedyForUnended(r, runId) {
  let mode = null;
  try {
    mode = r.readJson(RECORD_FILES.run).mode;
  } catch {
    // No readable run.json: the batch remedy, whose own refusal will say what is wrong.
  }
  return mode === 'interactive'
    ? `close it first: prescreen.js resume --run ${runId} --yes (make sure no process is still ` +
        'running it)'
    : `resume it first: prescreen.js resume --run ${runId}`;
}

/** What to do after a run that did not end complete, by its status. */
function remedyFor(status, runId) {
  const remedies = {
    pending: `resume with: node tools/ai-review/prescreen.js resume --run ${runId}`,
    'submit-unknown':
      'the batch may exist: check the Anthropic Console before anything else; its reservation ' +
      'stays open in the ledger (batch.json names it)',
    'submit-failed': 'the API refused the batch; its reservation was released',
    'stopped-at-cap': 'the spending cap refused the reservation (see the ledger line)',
    'stopped-on-errors': "API errors stopped it (see the run's errors.jsonl)",
    'stopped-on-truncation': 'answers were cut off at max_tokens',
    'stopped-over-reservation':
      'a response cost more than its reserved worst case: the price assumptions did not hold',
    'complete-over-reservation':
      'the results are in, but a response cost more than its reserved worst case',
  };
  return remedies[status] ?? "read the run's records";
}

// ── reduce ──────────────────────────────────────────────────────────────────────────────────

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

/** collect's destination: a repo directory strictly under RESULTS_DIR, judged where it lands. */
function resultsDirOutput(p, repoRoot) {
  const what = `--out must be a repo-relative directory under ${RESULTS_DIR}/`;
  if (typeof p !== 'string' || p === '' || path.isAbsolute(p)) throw refusal('bad-flag', what);
  const rel = path.posix.normalize(p.split(path.sep).join('/')).replace(/\/+$/, '');
  if (!rel.startsWith(`${RESULTS_DIR}/`)) throw refusal('bad-flag', what);
  const root = path.join(fs.realpathSync(repoRoot), RESULTS_DIR);
  const landing = landingPath(path.join(repoRoot, rel), 'out');
  if (!isInside(landing, root) || path.relative(root, landing) === '')
    throw refusal('bad-flag', `--out lands outside ${RESULTS_DIR}/: ${landing}`);
  return { rel, abs: landing };
}

/** Write `text` to `dir/name` atomically (tmp + rename). */
function writeAtomic(dir, name, text) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

async function cmdReduce(ctx, values) {
  if (values['census-full'] === undefined || values.out === undefined)
    throw refusal('bad-flag', 'reduce needs --census-full and --out');
  const src = privateCensusPath(values['census-full'], ctx.repoRoot);
  const out = resultsOutput(values.out, ctx.repoRoot);
  // Only the COMMITTED export and ruling set may decide what is published (spec §8).
  const exportRel = repoRel(
    ctx.repoRoot,
    path.join(ctx.bookDir, 'glossary', 'glossary-unified.json')
  );
  const problems = cleanTrackedProblems(ctx.git, [exportRel, DEFAULT_RULING_SET]);
  if (problems.length)
    throw refusal(
      'preflight',
      `refusing to reduce against an uncommitted export or ruling set:\n  - ${problems.join('\n  - ')}`
    );
  const full = parseJson(fs.readFileSync(src, 'utf8'), '--census-full');
  checkCensusShape(full, '--census-full');
  if (full.reduced === true) throw refusal('bad-census', '--census-full is already reduced');
  const exported = loadExport(ctx);
  const rulingSet = loadDefaultRulingSet(ctx);
  const reduced = {
    ...guarded('bad-census', () => reduceCensus(full, exported.terms, rulingSet)),
    exportSource: { path: exported.path, sha256: exported.sha256 },
    rulingSetSource: { path: rulingSet.path, sha256: rulingSet.sha256 },
  };
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
  const chem = tally(read, 'population');
  const pb = tally(read, 'physicsBiology');
  ctx.out(
    `chemistry rows: ${rateOf(chem)}, ${chem.unjudged} of ${chem.total} unjudged; stop line ` +
      `${PILOT_FLAG_STOP * 100}%\n`
  );
  ctx.out(
    `physics and biology rows: ${rateOf(pb)}, ${pb.unjudged} of ${pb.total} unjudged; for the ` +
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
  else if (overFlagStop(chem))
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
    excluded: population.excluded,
    maxTokens: DEFAULT_MAX_TOKENS,
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

// ── run ─────────────────────────────────────────────────────────────────────────────────────

/** A run directory's records, refused with `code` when it or its prescreen.json is missing. */
function openPrescreenRun(ctx, runId, code) {
  const dir = guarded('bad-flag', () => runDirFor(ctx.recordsDir, runId));
  if (!fs.existsSync(dir)) throw refusal(code, `no run ${runId} in ${ctx.recordsDir}`);
  const r = createRecordWriter({ dir });
  if (!r.exists(PRESCREEN_RECORD))
    throw refusal(code, `run ${runId} has no ${PRESCREEN_RECORD}; it is not a pre-screen run`);
  const prescreen = guarded(code, () => r.readJson(PRESCREEN_RECORD));
  if (prescreen.schema !== PRESCREEN_SCHEMA || prescreen.runId !== runId)
    throw refusal(
      code,
      `run ${runId}: ${PRESCREEN_RECORD} is not a ${PRESCREEN_SCHEMA} record of it`
    );
  return { r, prescreen };
}

/**
 * Decide that the named pilot passed by RE-JUDGING it from its records (its prescreen.json,
 * responses.jsonl and run-end.json), never from anything printed: phase pilot, the same model
 * and prompt sha256 as this run, ended complete (always: an incomplete pilot measured less than it
 * was asked), every control as expected, and its chemistry flag rate not over PILOT_FLAG_STOP
 * unless `acceptFlagRate` (the --accept-pilot-flag-rate answer). A pilot with no judged chemistry
 * row has no rate to accept, so it always refuses.
 * @returns {{ runId: string, passed: number, maxOutputTokens: number|null,
 *   chemistry: { total: number, judged: number, flagged: number, unjudged: number } }}
 */
function judgePilotRecord(ctx, runId, { model, prompt, acceptFlagRate = false }) {
  const { r, prescreen } = openPrescreenRun(ctx, runId, 'pilot');
  if (prescreen.phase !== 'pilot')
    throw refusal('pilot', `run ${runId} is a ${prescreen.phase} run, not a pilot`);
  if (prescreen.model !== model) {
    throw refusal(
      'pilot',
      `pilot ${runId} ran on ${prescreen.model}, not ${model}: a full run uses the model whose ` +
        'pilot passed (spec §6: never switch silently)'
    );
  }
  if (prescreen.prompt?.sha256 !== prompt.sha256) {
    throw refusal(
      'pilot',
      `pilot ${runId} ran the prompt with sha256 ${prescreen.prompt?.sha256}; it is now ` +
        `${prompt.sha256}. A revised prompt needs a new pilot (spec §6)`
    );
  }
  const read = guarded('pilot', () =>
    readRun({ recordsDir: ctx.recordsDir, runId, schema: prompt.schema })
  );
  const status = read.runEnd?.status ?? 'without a run-end.json';
  if (status !== 'complete') {
    throw refusal(
      'pilot',
      `pilot ${runId} ended ${status}, not complete: a full run needs a pilot that ran to the end ` +
        '(spec §6); run a new pilot'
    );
  }
  const gate = judgeControls({ verdicts: read.verdicts, key: read.key });
  if (!gate.pass) {
    const misses = gate.results
      .filter((c) => !c.ok)
      .map((c) => `${c.name} expected ${c.expected} got ${c.got}`);
    throw refusal(
      'pilot',
      `pilot ${runId}'s controls do not pass, re-judged from its records: ` +
        `${misses.join('; ') || 'it holds no controls'}`
    );
  }
  const chemistry = tally(read, 'population');
  if (chemistry.judged === 0) {
    throw refusal(
      'pilot',
      `pilot ${runId} judged no chemistry row (${chemistry.total} in it): it measured no flag rate`
    );
  }
  if (overFlagStop(chemistry) && !acceptFlagRate) {
    throw refusal(
      'pilot',
      `pilot ${runId}'s chemistry rows: ${rateOf(chemistry)}, over ${PILOT_FLAG_STOP * 100}% ` +
        '(spec §6): ask first; --accept-pilot-flag-rate records the answer'
    );
  }
  const outputs = guarded('pilot', () => r.readJsonl(RECORD_FILES.responses))
    .map((l) => l.usage?.output_tokens)
    .filter(Number.isSafeInteger);
  return {
    runId,
    passed: gate.results.length,
    maxOutputTokens: outputs.length ? Math.max(...outputs) : null,
    chemistry,
  };
}

/** `list` in `n` consecutive parts whose sizes differ by at most one. */
const splitEvenly = (list, n) =>
  Array.from({ length: n }, (_, k) =>
    list.slice(Math.floor((k * list.length) / n), Math.floor(((k + 1) * list.length) / n))
  );

/** Print the outcome over every run read so far, and return its reasons to stop and ask. */
function judgeFullRun(ctx, { items, key, reads }) {
  const merged = guarded('bad-run', () => mergeVerdicts(reads));
  const population = items.filter((it) => POPULATION_KINDS.includes(key[it.id].kind));
  const unjudged = population.filter((it) => !merged.has(it.id)).length;
  const gate = judgeControls({ verdicts: merged, key });
  ctx.out(
    `population rows: ${population.length - unjudged} of ${population.length} judged, ` +
      `${unjudged} unjudged; controls ${gate.pass ? 'PASS' : 'FAIL'} ` +
      `(${gate.results.filter((c) => c.ok).length} of ${gate.results.length} as expected)\n`
  );
  const stops = [];
  for (const c of gate.results.filter((x) => !x.ok)) {
    const v = merged.get(c.id);
    ctx.out(
      `  FAIL ${c.id} ${String(c.name).padEnd(18)} expected ${c.expected} got ${c.got}` +
        `${v ? `: ${v.reason}` : ''}\n`
    );
  }
  if (unjudged) stops.push(`${unjudged} population rows have no verdict (never counted as fine)`);
  if (!gate.pass) stops.push('a control was missed in the full run (FAIL rows above)');
  return stops;
}

async function cmdRun(ctx, values, deps) {
  if (values.model === undefined)
    throw refusal('bad-flag', `run needs --model (${MODELS.join(' or ')})`);
  const pilotIds = values.pilot ?? [];
  if (pilotIds.length !== 1)
    throw refusal(
      'bad-flag',
      'run needs exactly one --pilot <runId>: the pilot that passed on this model'
    );
  const model = values.model;
  const acceptFlagRate = values['accept-pilot-flag-rate'] === true;
  const split = positiveInt(values.split, 'split') ?? 1;
  const lowered = positiveInt(values['max-tokens'], 'max-tokens');
  if (lowered !== undefined && lowered > DEFAULT_MAX_TOKENS) {
    throw refusal(
      'bad-flag',
      `--max-tokens only lowers max_tokens (the default is ${DEFAULT_MAX_TOKENS})`
    );
  }
  const maxTokens = lowered ?? DEFAULT_MAX_TOKENS;
  const accepted = values['accept-large-population'] === true;
  const includePB = values['include-physics-biology'] === true;
  const inputs = loadInputs(ctx, values.census);
  const { seed, population, controls } = populationOf(inputs);
  const physicsBiology = includePB ? population.physicsBiology : [];
  const size = population.rows.length + physicsBiology.length;
  if (population.rows.length === 0)
    throw refusal('bad-census', 'the population holds no chemistry rows: nothing to run');
  if (size > POPULATION_STOP && !accepted) {
    throw refusal(
      'population-stop',
      `the population is ${size} rows, over the ${POPULATION_STOP}-row stop line (spec §6): ` +
        'ask first; --accept-large-population records the answer'
    );
  }
  const pilot = judgePilotRecord(ctx, pilotIds[0], {
    model,
    prompt: inputs.prompt,
    acceptFlagRate,
  });
  ctx.out(
    `pilot ${pilot.runId} re-judged from its records: ${model}, prompt ${inputs.prompt.sha256}, ` +
      `ended complete, controls PASS (${pilot.passed} of ${pilot.passed}), chemistry rows ` +
      `${rateOf(pilot.chemistry)}` +
      `${overFlagStop(pilot.chemistry) ? ` (over ${PILOT_FLAG_STOP * 100}%; accepted with --accept-pilot-flag-rate)` : ''}\n`
  );
  // Spec §8 buys each row once: a second full run over the same census, prompt and model would
  // buy every row again, whichever pilot it came from. Only a run that submitted a batch counts
  // (one that stopped before submit bought nothing). --allow-second-run records [USER]'s answer.
  const allowSecond = values['allow-second-run'] === true;
  const earlier = scanPrescreenRuns(ctx, 'second-run')
    .filter(
      (x) =>
        x.prescreen.phase === 'full' &&
        x.prescreen.census?.sha256 === inputs.census.sha256 &&
        x.prescreen.prompt?.sha256 === inputs.prompt.sha256 &&
        x.prescreen.model === model &&
        fs.existsSync(path.join(ctx.recordsDir, 'runs', x.runId, RECORD_FILES.batch))
    )
    .map((x) => x.runId);
  if (earlier.length && !allowSecond) {
    throw refusal(
      'second-run',
      `a full run over this census, prompt and model already submitted a batch ` +
        `(${earlier.join(', ')}); running it again would buy every row again. Collect those ` +
        'runs (collect --resend sends their unjudged rows once); --allow-second-run records ' +
        'the answer that a second full run is wanted'
    );
  }
  if (lowered !== undefined) {
    if (pilot.maxOutputTokens === null)
      throw refusal(
        'bad-flag',
        '--max-tokens: the pilot recorded no output usage to check against'
      );
    if (lowered < 2 * pilot.maxOutputTokens) {
      throw refusal(
        'bad-flag',
        `--max-tokens ${lowered} is under twice the largest output the pilot measured ` +
          `(${pilot.maxOutputTokens} tokens, spec §6)`
      );
    }
  }
  // Rows now in the population are no longer excluded (spec §8: each group counted once).
  const excluded = includePB
    ? {
        ...population.excluded,
        physicsBiology: population.excluded.physicsBiology - physicsBiology.length,
      }
    : population.excluded;
  const built = buildRun({
    inputs,
    seed,
    model,
    rows: population.rows,
    physicsBiology,
    controls,
    maxTokens,
  });
  if (split > built.requests.length)
    throw refusal(
      'bad-flag',
      `--split ${split} is more than the ${built.requests.length} requests`
    );
  const parts = splitEvenly(built.requests, split);
  const worst = parts.map((p) => estimateRequests(p, { model, maxTokens }).worstCaseUsd.batch);
  ctx.out(
    `full run on ${model}, effort ${DEFAULT_EFFORT}, max_tokens ${maxTokens}: ` +
      `${population.rows.length} chemistry rows + ${physicsBiology.length} physics and biology ` +
      `rows + ${controls.length} controls = ${built.items.length} rows in ` +
      `${built.requests.length} requests, ${parts.length} batch(es)\n`
  );
  parts.forEach((p, k) =>
    ctx.out(
      `  batch ${k + 1} of ${parts.length}: ${p.length} requests, worst case USD ${worst[k]}\n`
    )
  );
  const room = headroom(ctx);
  ctx.out(`ledger: ${room.says}\n`);
  const largest = Math.max(...worst);
  if (!fits(largest, room)) {
    const lower =
      pilot.maxOutputTokens === null
        ? '--max-tokens cannot be lowered: the pilot recorded no output usage to set its floor'
        : 'or lower --max-tokens (to no less than twice the pilot’s largest output, ' +
          `${2 * pilot.maxOutputTokens} tokens)`;
    throw refusal(
      'cost',
      `the largest batch's worst case USD ${largest} does not fit: ${room.says}. Split the run ` +
        `into sequential batches with --split <n>; ${lower}`
    );
  }
  preflight(ctx, inputs);
  ctx.out(
    `preflight passed: census ${inputs.census.sha256}; prompt ${inputs.prompt.sha256}; ruling set ` +
      `${inputs.rulingSet.sha256}\n`
  );
  if (!values.yes) {
    ctx.out('not sending: add --yes to spend.\n');
    return { exitCode: 0, sent: false };
  }
  const runIds = [];
  const statuses = [];
  const reads = [];
  const stops = [];
  for (let k = 0; k < parts.length; k += 1) {
    const unsent =
      k + 1 < parts.length ? `; batches ${k + 2} to ${parts.length} were not sent` : '';
    if (k > 0 && !fits(worst[k], headroom(ctx))) {
      stops.push(
        `batch ${k + 1}'s worst case USD ${worst[k]} no longer fits: ${headroom(ctx).says}; ` +
          `batches ${k + 1} to ${parts.length} were not sent`
      );
      break;
    }
    const runId = mintRunId(ctx.now());
    const payload = prescreenPayload({
      runId,
      phase: 'full',
      model,
      maxTokens,
      inputs,
      items: built.items,
      key: built.key,
      requests: parts[k],
      excluded,
      extra: {
        pilot: pilot.runId,
        includePhysicsBiology: includePB,
        acceptLargePopulation: accepted,
        acceptPilotFlagRate: acceptFlagRate,
        allowSecondRun: allowSecond,
        split: { part: k + 1, of: parts.length },
      },
    });
    const result = await runBatch({
      ...harnessOptions(ctx, deps, { inputs, model, effort: DEFAULT_EFFORT, maxTokens, runId }),
      ...pollOptions(deps),
      // Spec §6: the margin binds on the harness's real reservation, not only on the estimate.
      cap: CAP_USD - COST_MARGIN_USD,
      requests: parts[k].map(({ key, body }) => ({ key, body })),
      extraRecords: [{ name: PRESCREEN_RECORD, payload }],
    });
    runIds.push(runId);
    statuses.push(result.status);
    const usd = result.totalUsd !== undefined ? `, USD ${result.totalUsd}` : '';
    ctx.out(
      `batch ${k + 1} of ${parts.length}: run ${runId} ${result.status}${usd}` +
        `${result.counts ? ` ${JSON.stringify(result.counts)}` : ''}\n`
    );
    const ended = createRecordWriter({ dir: runDirFor(ctx.recordsDir, runId) }).exists(
      RECORD_FILES.runEnd
    );
    const read = ended
      ? readRun({ recordsDir: ctx.recordsDir, runId, schema: inputs.prompt.schema })
      : null;
    if (read) reads.push(read);
    if (result.status !== 'complete') {
      stops.push(
        `run ${runId} ended ${result.status}, not complete: ${remedyFor(result.status, runId)}` +
          unsent
      );
      break;
    }
    const open = unjudgedPresented(read);
    if (open.length) {
      stops.push(
        `run ${runId} left ${open.length} of its population rows unjudged (refused, truncated or ` +
          `unparsed answers: read its records)${unsent}`
      );
      break;
    }
  }
  stops.push(...judgeFullRun(ctx, { items: built.items, key: built.key, reads }));
  printLedger(ctx);
  for (const s of stops) ctx.out(`stop and ask: ${s}\n`);
  ctx.out(
    `next: node tools/ai-review/prescreen.js collect ${runIds.map((id) => `--run ${id}`).join(' ')} ` +
      `--out ${RESULTS_DIR}/<date> --isk-rate <ISK per USD> --isk-rate-source <source, date>\n`
  );
  return { exitCode: stops.length ? 2 : 0, sent: true, runIds, statuses };
}

// ── resume ──────────────────────────────────────────────────────────────────────────────────

/**
 * Close an interactive run (a pilot or a resend) that was killed before it ended, so collect can
 * take it and its open reservations stop lowering the cap: the harness settles them at their
 * worst case and writes run-end.json `interrupted` (closeInterruptedRun). Asks for --yes, because
 * closing a run that a live process is still running would settle its reservations under it.
 * The main checkout is required (the ledger lives there); a clean tree is not.
 */
function closeInteractive(ctx, values, { r, prescreen, runId }) {
  if (prescreen.phase !== 'pilot' && prescreen.phase !== 'resend') {
    throw refusal(
      'bad-run',
      `run ${runId} is an interactive ${prescreen.phase} run; only a pilot or a resend runs ` +
        'interactively'
    );
  }
  if (r.exists(RECORD_FILES.runEnd))
    throw refusal('bad-run', `run ${runId} already ended (run-end.json): nothing to close`);
  if (!values.yes) {
    throw refusal(
      'bad-flag',
      `run ${runId} is an interactive ${prescreen.phase} run that did not end. resume --run ` +
        `${runId} --yes closes it as interrupted, settling its open reservations at their worst ` +
        'case. Make sure no process is still running it first.'
    );
  }
  assertMainCheckout(ctx.git);
  const result = guarded('bad-run', () =>
    closeInterruptedRun({ recordsDir: ctx.recordsDir, runId, now: ctx.now })
  );
  ctx.out(
    `run ${runId} (${prescreen.phase}) closed as ${result.status}: USD ${result.settledOpenUsd} ` +
      `still open settled at its worst case; USD ${result.totalUsd} in all; ` +
      `${JSON.stringify(result.counts)}\n`
  );
  printLedger(ctx);
  ctx.out(
    prescreen.phase === 'resend'
      ? `next: name it in collect (--run ${runId}) with the runs it re-sent; the rows it sent ` +
          'stay re-sent once, the rows it never sent can go in a later --resend\n'
      : `next: a pilot that did not end complete cannot pass run's check; run a new pilot\n`
  );
  ctx.out(`stop and ask: run ${runId} ended ${result.status}, not complete\n`);
  return { exitCode: 2, runId, status: result.status };
}

/**
 * Collect a full run's batch whose polling stopped, or (--yes) close an interrupted interactive
 * run (closeInteractive). For a batch, the options come from the run's own records (run.json,
 * checked against prescreen.json), so the harness's parameter match holds and it resumes, never
 * resubmits; the run is then judged on its own population rows and on the controls ITS OWN
 * requests presented. The main checkout is required (the ledger lives there), but NOT a clean
 * tree: a tree changed since the buy must not strand a batch already paid for.
 */
async function cmdResume(ctx, values, deps) {
  const ids = values.run ?? [];
  if (ids.length !== 1) throw refusal('bad-flag', 'resume takes exactly one --run');
  const runId = ids[0];
  const { r, prescreen } = openPrescreenRun(ctx, runId, 'bad-run');
  if (!r.exists(RECORD_FILES.run)) throw refusal('bad-run', `run ${runId} has no run.json`);
  const run = guarded('bad-run', () => r.readJson(RECORD_FILES.run));
  if (run.use === USE && run.mode === 'interactive')
    return closeInteractive(ctx, values, { r, prescreen, runId });
  if (values.yes) {
    throw refusal(
      'bad-flag',
      '--yes applies only to closing an interrupted interactive run (a pilot or a resend); a ' +
        'batch resume collects what was already bought'
    );
  }
  if (run.use !== USE || run.mode !== 'batch' || prescreen.phase !== 'full') {
    throw refusal(
      'bad-run',
      `run ${runId} is not a ${USE} full batch run (use ${run.use}, mode ${run.mode}, phase ` +
        `${prescreen.phase}); resume collects a full run's batch`
    );
  }
  if (r.exists(RECORD_FILES.runEnd))
    throw refusal('bad-run', `run ${runId} already ended (run-end.json): nothing to resume`);
  const agree =
    prescreen.model === run.model &&
    prescreen.effort === run.effort &&
    prescreen.maxTokens === run.max_tokens &&
    same([prescreen.prompt], run.prompts) &&
    same(prescreen.rulingSet, run.rulingSet);
  if (!agree)
    throw refusal('bad-run', `run ${runId}: run.json and ${PRESCREEN_RECORD} disagree; refusing`);
  assertMainCheckout(ctx.git);
  const result = await runBatch({
    recordsDir: ctx.recordsDir,
    use: USE,
    model: run.model,
    effort: run.effort,
    maxTokens: run.max_tokens,
    prompts: run.prompts,
    rulingSet: run.rulingSet,
    runId,
    now: ctx.now,
    ...transportOptions(deps),
    ...pollOptions(deps),
  });
  const usd = result.totalUsd !== undefined ? `, USD ${result.totalUsd}` : '';
  ctx.out(
    `run ${runId} ${result.status}${usd}${result.counts ? ` ${JSON.stringify(result.counts)}` : ''}\n`
  );
  const stops = [];
  if (result.status !== 'complete')
    stops.push(`run ${runId} ended ${result.status}: ${remedyFor(result.status, runId)}`);
  if (r.exists(RECORD_FILES.runEnd)) {
    const prompt = guarded('bad-input', () =>
      loadPrompt(path.join(ctx.repoRoot, prescreen.prompt.path))
    );
    if (prompt.sha256 !== prescreen.prompt.sha256) {
      stops.push(
        `the prompt ${prescreen.prompt.path} changed since the run, so its answers cannot be ` +
          'parsed with the schema it ran: restore it, then collect'
      );
    } else {
      const read = readRun({ recordsDir: ctx.recordsDir, runId, schema: prompt.schema });
      const open = unjudgedPresented(read);
      const controls = presentedControls(read);
      const misses = controls.filter((c) => !c.ok);
      ctx.out(
        `its population rows: ${open.length} unjudged; the controls it presented: ` +
          `${controls.length - misses.length} of ${controls.length} as expected\n`
      );
      for (const c of misses) {
        const v = read.verdicts.get(c.id);
        ctx.out(
          `  FAIL ${c.id} ${String(c.name).padEnd(18)} expected ${c.expected} got ${c.got}` +
            `${v ? `: ${v.reason}` : ''}\n`
        );
      }
      if (open.length) stops.push(`run ${runId} left ${open.length} population rows unjudged`);
      if (misses.length) {
        stops.push(
          `run ${runId} missed ${misses.length} of the ${controls.length} controls it presented ` +
            '(FAIL rows above)'
        );
      }
    }
  }
  printLedger(ctx);
  for (const s of stops) ctx.out(`stop and ask: ${s}\n`);
  return { exitCode: stops.length ? 2 : 0, runId, status: result.status };
}

// ── collect ─────────────────────────────────────────────────────────────────────────────────

/**
 * A run collect may merge: its records, ended (run-end.json). A run still polling would read as
 * every row unjudged, and --resend would then buy its rows twice.
 */
function loadEndedRun(ctx, runId) {
  const { r, prescreen } = openPrescreenRun(ctx, runId, 'bad-run');
  if (!r.exists(RECORD_FILES.runEnd)) {
    throw refusal(
      'bad-run',
      `run ${runId} has not ended (no run-end.json): ${remedyForUnended(r, runId)}; collected ` +
        'now, its rows would read as unjudged and --resend would buy them twice'
    );
  }
  const runEnd = guarded('bad-run', () => r.readJson(RECORD_FILES.runEnd));
  // What it actually sent: resend's "once" rule must not count a request a stop left unsent.
  const sentKeys = guarded('bad-run', () => r.readJsonl(RECORD_FILES.requests)).map((l) => l.key);
  return { runId, prescreen, runEnd, sentKeys };
}

/**
 * A pilot named for its cost only (collect --pilot): phase pilot and ended. It never contributes
 * a verdict (its item ids are numbered within its own items), and it may have run on either
 * model, since each model has its own pilot.
 */
function loadPilotCost(ctx, runId) {
  const { r, prescreen } = openPrescreenRun(ctx, runId, 'bad-run');
  if (prescreen.phase !== 'pilot')
    throw refusal('bad-run', `--pilot ${runId} is a ${prescreen.phase} run, not a pilot`);
  if (!r.exists(RECORD_FILES.runEnd)) {
    throw refusal(
      'bad-run',
      `pilot ${runId} has not ended (no run-end.json), so its cost is not settled: ` +
        remedyForUnended(r, runId)
    );
  }
  const runEnd = guarded('bad-run', () => r.readJson(RECORD_FILES.runEnd));
  return runInfo({ runId, prescreen, runEnd });
}

/**
 * Refuse a resend while the records directory holds a resend run of these rows that is not
 * named (spec §8: a row is re-sent ONCE, over every run, not only the named ones; without this,
 * repeating the same collect --resend --yes buys the rows the first one answered again). A
 * resend run counts when it is over the same census and could merge with these runs (the same
 * model, effort, max_tokens and prompt; naming any other one would be refused by checkRuns), and
 * it re-sent one of the named full runs (`resendOf`) or holds one of their items. Named runs have
 * already been checked to have ended; an unnamed one that has not ended refuses too, with how to
 * close it.
 */
function assertResendsNamed(ctx, base, runs) {
  const named = new Set(runs.map((r) => r.runId));
  const fullIds = new Set(runs.filter((r) => r.prescreen.phase === 'full').map((r) => r.runId));
  const mergeable = (ps) =>
    ['model', 'effort', 'maxTokens', 'prompt'].every((f) => same(ps[f], base[f]));
  const ofThese = (ps) =>
    (Array.isArray(ps.resendOf) && ps.resendOf.some((id) => fullIds.has(id))) ||
    (Array.isArray(ps.items) &&
      ps.items.some(
        (it) => base.byId.has(it?.id) && itemSig(base.byId.get(it.id)) === itemSig(it)
      ));
  const unnamed = scanPrescreenRuns(ctx, 'unnamed-run').filter(
    ({ runId, prescreen: ps }) =>
      !named.has(runId) &&
      (ps.phase === 'resend' || ps.phase === 'full') &&
      ps.census?.sha256 === base.census.sha256 &&
      mergeable(ps) &&
      ofThese(ps)
  );
  if (unnamed.length === 0) return;
  const open = unnamed
    .filter((x) => !x.ended && x.prescreen.phase === 'resend')
    .map((x) => x.runId);
  throw refusal(
    'unnamed-run',
    `full or resend runs already hold rows of these runs and are not named: ` +
      `${unnamed.map((x) => x.runId).join(', ')}. A row is re-sent once (spec §8): name each ` +
      'with --run' +
      (open.length
        ? `; ${open.join(', ')} did not end: close each first with ` +
          `${open.map((id) => `prescreen.js resume --run ${id} --yes`).join(', ')} (make sure ` +
          'no process is still running it)'
        : '')
  );
}

/**
 * The reduced census the runs name, read only if its bytes still have the recorded sha256: its
 * rows are the pairs the verdicts may publish (the census holds only export-published pairs).
 */
function recordedCensusRows(ctx, ref) {
  const abs = path.join(ctx.repoRoot, ref.path);
  if (!fs.existsSync(abs))
    throw refusal(
      'private-data',
      `the runs' census ${ref.path} is missing; cannot check the pairs`
    );
  const bytes = fs.readFileSync(abs);
  if (sha256(bytes) !== ref.sha256) {
    throw refusal(
      'private-data',
      `the census ${ref.path} changed since the runs (sha256 ${sha256(bytes)}, recorded ` +
        `${ref.sha256}); cannot check which pairs the verdicts may publish`
    );
  }
  const doc = parseJson(bytes.toString('utf8'), ref.path);
  if (doc.reduced !== true || !Array.isArray(doc.rows))
    throw refusal('private-data', `${ref.path} is not a reduced census`);
  return doc.rows;
}

function runInfo({ runId, prescreen, runEnd }) {
  return {
    runId,
    phase: prescreen.phase,
    split: prescreen.split?.of > 1 ? prescreen.split : null,
    model: prescreen.model,
    effort: prescreen.effort,
    status: runEnd.status,
    totalUsd: runEnd.totalUsd,
  };
}

function iskRateOf(v) {
  if (v === undefined || !/^\d+(\.\d+)?$/.test(v) || !(Number(v) > 0))
    throw refusal('bad-flag', '--isk-rate must be a positive number of ISK per USD');
  return Number(v);
}

/**
 * Re-send the unjudged population rows once, one per interactive request (spec §8), after every
 * free check. Returns the resend run's records, or null when nothing was sent.
 */
async function resend(ctx, values, deps, { base, merged, runs, prompt }) {
  const { send, resentBefore } = resendIds({ base, merged, runs });
  ctx.out(
    `resend: ${send.length} unjudged population rows, one per request` +
      `${resentBefore.length ? `; ${resentBefore.length} were re-sent once already and stay unjudged` : ''}\n`
  );
  if (send.length === 0) return null;
  const items = send.map((id) => base.byId.get(id));
  const requests = guarded('bad-items', () =>
    buildRequests({
      items,
      prompt,
      model: base.model,
      effort: base.effort,
      maxTokens: base.maxTokens,
      rowsPerRequest: 1,
    })
  ).map((q) => ({ ...q, key: q.presented[0] }));
  const est = estimateRequests(requests, { model: base.model, maxTokens: base.maxTokens });
  const room = headroom(ctx);
  ctx.out(`resend worst case USD ${est.worstCaseUsd.interactive} interactive; ${room.says}\n`);
  if (!fits(est.worstCaseUsd.interactive, room)) {
    throw refusal(
      'cost',
      `the resend's worst case USD ${est.worstCaseUsd.interactive} does not fit: ${room.says}`
    );
  }
  const inputs = {
    prompt: { path: base.prompt.path, sha256: prompt.sha256 },
    rulingSet: base.rulingSet,
    census: base.census,
    export: {
      path: repoRel(ctx.repoRoot, path.join(ctx.bookDir, 'glossary', 'glossary-unified.json')),
    },
    unitsPath: repoRel(ctx.repoRoot, path.join(ctx.bookDir, '02-for-mt')),
  };
  preflight(ctx, inputs);
  if (!values.yes) {
    ctx.out('not sending: add --yes to spend; nothing written.\n');
    return 'dry';
  }
  const runId = mintRunId(ctx.now());
  const payload = prescreenPayload({
    runId,
    phase: 'resend',
    model: base.model,
    effort: base.effort,
    maxTokens: base.maxTokens,
    inputs,
    items,
    key: base.key,
    requests,
    excluded: base.excluded,
    rowsPerRequest: 1,
    extra: {
      includePhysicsBiology: base.includePhysicsBiology,
      resendOf: runs.map((r) => r.runId),
    },
  });
  const result = await runInteractive({
    ...harnessOptions(ctx, deps, {
      inputs,
      model: base.model,
      effort: base.effort,
      maxTokens: base.maxTokens,
      runId,
    }),
    requests: requests.map(({ key, body }) => ({ key, body })),
    extraRecords: [{ name: PRESCREEN_RECORD, payload }],
    // Spec §6: the margin binds on the harness's real reservation, not only on the estimate.
    cap: CAP_USD - COST_MARGIN_USD,
  });
  ctx.out(`resend: run ${runId} ${result.status}: ${JSON.stringify(result.counts)}\n`);
  return loadEndedRun(ctx, runId);
}

async function cmdCollect(ctx, values, deps) {
  const runIds = values.run ?? [];
  if (runIds.length === 0) throw refusal('bad-flag', 'collect needs --run <runId> (one or more)');
  if (new Set(runIds).size !== runIds.length) throw refusal('bad-flag', '--run names a run twice');
  if (values.out === undefined)
    throw refusal('bad-flag', `collect needs --out <repo directory under ${RESULTS_DIR}/>`);
  const out = resultsDirOutput(values.out, ctx.repoRoot);
  const iskRate = iskRateOf(values['isk-rate']);
  const iskRateSource = (values['isk-rate-source'] ?? '').trim();
  if (iskRateSource === '')
    throw refusal('bad-flag', '--isk-rate-source must name the rate’s source and date');
  if (values.yes && !values.resend)
    throw refusal('bad-flag', '--yes applies only with --resend (collect spends only to re-send)');
  const pilotIds = values.pilot ?? [];
  if (new Set(pilotIds).size !== pilotIds.length)
    throw refusal('bad-flag', '--pilot names a run twice');
  const runs = runIds.map((id) => loadEndedRun(ctx, id));
  const pilots = pilotIds.map((id) => loadPilotCost(ctx, id));
  const base = guarded('bad-run', () => checkRuns(runs));
  if (values.resend) assertResendsNamed(ctx, base, runs);
  const prompt = guarded('bad-input', () => loadPrompt(path.join(ctx.repoRoot, base.prompt.path)));
  if (prompt.sha256 !== base.prompt.sha256) {
    throw refusal(
      'bad-run',
      `the prompt ${base.prompt.path} changed since the runs (sha256 ${prompt.sha256}, recorded ` +
        `${base.prompt.sha256}): their answers are parsed with its schema; restore it`
    );
  }
  const censusRows = recordedCensusRows(ctx, base.census);
  const reads = runs.map(({ runId }) =>
    guarded('bad-run', () => readRun({ recordsDir: ctx.recordsDir, runId, schema: prompt.schema }))
  );
  let merged = guarded('bad-run', () => mergeVerdicts(reads));
  const verdictsOf = (ids) => {
    const doc = buildVerdicts({ base, merged, runIds: ids });
    guarded('private-data', () => assertPublishable(doc, censusRows));
    return doc;
  };
  verdictsOf(runIds); // refuse before any spend, not after
  if (values.resend) {
    const sent = await resend(ctx, values, deps, { base, merged, runs, prompt });
    if (sent === 'dry') return { exitCode: 0, sent: false };
    if (sent) {
      runs.push(sent);
      reads.push(readRun({ recordsDir: ctx.recordsDir, runId: sent.runId, schema: prompt.schema }));
      merged = guarded('bad-run', () => mergeVerdicts(reads));
    }
  }
  const allIds = runs.map((r) => r.runId);
  const doc = verdictsOf(allIds);
  const infos = runs.map(runInfo);
  const report = renderReport({ doc, merged, runs: infos, pilots, iskRate, iskRateSource });
  writeAtomic(out.abs, VERDICTS_FILE, `${JSON.stringify(doc, null, 1)}\n`);
  writeAtomic(out.abs, REPORT_FILE, report);
  const n = { fine: 0, flag: 0, unjudged: 0 };
  for (const row of doc.population) n[row.verdict] += 1;
  ctx.out(
    `population: ${doc.population.length} rows: ${n.flag} flag, ${n.fine} fine, ${n.unjudged} ` +
      `unjudged; controls ${doc.controls.pass ? 'PASS' : 'FAIL'}\n` +
      `wrote ${out.rel}/${VERDICTS_FILE} and ${out.rel}/${REPORT_FILE}\n`
  );
  const stops = stopReasons(doc, infos);
  for (const s of stops) ctx.out(`stop and ask: ${s}\n`);
  return { exitCode: stops.length ? 2 : 0, runIds: allIds, out: out.rel };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────

/** Each subcommand: the flags it admits (any other refuses) and its handler. */
const COMMANDS = {
  reduce: { flags: ['census-full', 'out'], run: cmdReduce },
  plan: { flags: ['census'], run: cmdPlan },
  pilot: { flags: ['census', 'model', 'yes'], run: cmdPilot },
  run: {
    flags: [
      'census',
      'model',
      'pilot',
      'include-physics-biology',
      'split',
      'max-tokens',
      'accept-large-population',
      'accept-pilot-flag-rate',
      'allow-second-run',
      'yes',
    ],
    run: cmdRun,
  },
  resume: { flags: ['run', 'yes'], run: cmdResume },
  collect: {
    flags: ['run', 'out', 'isk-rate', 'isk-rate-source', 'pilot', 'resend', 'yes'],
    run: cmdCollect,
  },
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
 *   transport, keyOptions, harnessCommit, harnessDirty, and a batch's sleep, pollIntervalMs and
 *   maxPolls
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
