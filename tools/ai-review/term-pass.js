#!/usr/bin/env node
/**
 * term-pass.js — the AI-reviewed layer's runner (CLI): work list → requests → harness →
 * records, and records → gate → layer 2.
 *
 * Design: docs/superpowers/specs/2026-10-27-ai-layer-runner-design.md.
 *
 *   plan    0 ISK. Work list, requests, per-chapter counts, a token estimate and the
 *           worst-case reservation each chapter's batch would need.
 *   run     PAID. Preflight first (nothing is spent or written if it fails); without --yes it
 *           stops after the preflight and the plan. One harness run per chapter, one at a
 *           time, so only one reservation is ever open (a whole-book batch would exceed the
 *           cap on its reservation alone). Stops at the first chapter that does not end
 *           complete, or whose answers are not all usable (truncated, refused, errored or
 *           missing); each chapter's line prints those counts.
 *   resume  Resume a batch run whose polling stopped (`pending`). It collects against the
 *           recorded requests; apply, not resume, refuses results whose inputs changed.
 *
 * Exit codes: 0 done; 1 refused or failed (the message says why); 2 run/resume ended
 * without every chapter complete and fully usable (the printed remedy says what next).
 *   apply   0 ISK. Recorded responses → gate (with the group rule) → change records → a
 *           complete layer-2 chapter. Dry unless --write; --report writes a reviewer's
 *           markdown outside the repository.
 *
 * Preflight (the register's owed items 1, 2 and 4):
 *   - the repository is the MAIN checkout, never a linked git worktree: the ledger lives in
 *     the checkout, so the USD 100 cap (config.js CAP_USD) is enforced per main checkout,
 *     and a linked worktree would bring a ledger, and a cap, of its own;
 *   - the book is the constant BOOK (efnafraedi-2e); there is no flag to change it;
 *   - the prompt, the ruling set and every file of the code (CODE_PATHS) are tracked and
 *     clean, so the commit a record names describes what ran;
 *   - `--layer1-commit` (default HEAD) is a commit; each chapter's input files there (layer
 *     1, overlays, English, structure: INPUT_SHAPES) are the same SET as in the working tree,
 *     both ways (an input deleted from or added to the tree refuses), and each is
 *     byte-identical to its blob there;
 *   - an interactive `--max-tokens` above SDK_NONSTREAMING_MAX_TOKENS needs `--timeout-ms`
 *     (the SDK refuses such a non-streaming call locally otherwise).
 *
 * Flags are parsed strictly (node:util parseArgs): an unknown flag is an error, never a
 * silent no-op (CLAUDE.md: tools/lib/parseArgs.js drops unknown flags).
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, assertBookSlug, CAP_USD } from './config.js';
import { loadRulingSet } from './ruling-set.js';
import { runInteractive, runBatch, EFFORTS } from './harness.js';
import { worstCaseUsd } from './pricing.js';
import { summarizeLedger, readLedger } from './ledger.js';
import { mintRunId, runDirFor, createRecordWriter, RECORD_FILES } from './records.js';
import { buildWorkList } from './worklist.js';
import {
  USE,
  USER_FORMAT,
  PROMPT_PATH,
  DEFAULT_SEGMENTS_PER_REQUEST,
  DEFAULT_CHAR_BUDGET,
  loadPrompt,
  buildRequests,
} from './term-pass-request.js';
import {
  TERM_PASS_RECORD,
  TERM_PASS_SCHEMA,
  readChapterInputs,
  unitFingerprints,
  loadRunRecords,
  applyChapter,
  writeApplied,
  renderReport,
  coverageLine,
} from './term-pass-apply.js';
import {
  makeGit,
  resolveCommit,
  cleanTrackedProblems,
  filesAtCommitProblems,
  listingAtCommitProblems,
} from './provenance.js';
import { LAYER_DIRS, CHAPTER_DIR_RE } from '../lib/mt-layers.js';

/** The one book this runner processes (the register's owed item 1). */
export const BOOK = 'efnafraedi-2e';
export const DEFAULT_RULING_SET =
  'experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json';
export const DEFAULT_MODEL = 'claude-opus-5-5';
export const DEFAULT_EFFORT = 'high';
export const DEFAULT_MAX_TOKENS = 16000;
/**
 * The SDK refuses a non-streaming call whose max_tokens implies more than 10 minutes at its
 * assumed 128,000 tokens an hour (600 × 128000 / 3600 = 21,333.3), unless a timeout is set.
 */
export const SDK_NONSTREAMING_MAX_TOKENS = 21333;
/** Characters per token assumed by `plan`'s estimate (conservative for Icelandic). */
export const PLAN_CHARS_PER_TOKEN = 3;
/**
 * Every repo path whose code decides what a run sends or what apply writes. A paid run and a
 * layer-2 write refuse while any of them is untracked or modified. Pinned against the real
 * import closure of this file by a test.
 */
export const CODE_PATHS = Object.freeze(['tools/ai-review', 'tools/api-translate.js', 'tools/lib']);

const MODES = ['interactive', 'batch'];

const refusal = (code, message) => Object.assign(new Error(`[${code}] ${message}`), { code });

function usage() {
  return [
    'usage: node tools/ai-review/term-pass.js <plan|run|resume|apply> [flags]',
    '  plan    (--chapter chNN ... | --all) [--segments-per-request N] [--char-budget N] [--max-tokens N] [--out FILE]',
    '  run     (--chapter chNN ... | --all) --mode interactive|batch [--effort E] [--max-tokens N]',
    '          [--timeout-ms N] [--layer1-commit REF] [--limit N] [--ruling-set PATH] [--yes]',
    '  resume  --run RUNID [--max-polls N]',
    '  apply   --chapter chNN --run RUNID [--run RUNID ...] [--report FILE] [--write] [--overwrite]',
    `The book is ${BOOK}. FILE paths must be absolute, and land (symlinks resolved) outside the repository and outside any books/ directory.`,
  ].join('\n');
}

const OPTIONS = {
  chapter: { type: 'string', multiple: true },
  all: { type: 'boolean' },
  mode: { type: 'string' },
  effort: { type: 'string' },
  model: { type: 'string' },
  'max-tokens': { type: 'string' },
  'timeout-ms': { type: 'string' },
  'layer1-commit': { type: 'string' },
  limit: { type: 'string' },
  'ruling-set': { type: 'string' },
  'segments-per-request': { type: 'string' },
  'char-budget': { type: 'string' },
  'max-polls': { type: 'string' },
  run: { type: 'string', multiple: true },
  out: { type: 'string' },
  report: { type: 'string' },
  write: { type: 'boolean' },
  overwrite: { type: 'boolean' },
  yes: { type: 'boolean' },
  help: { type: 'boolean' },
};
/** Which flags each subcommand admits; any other refuses (a flag must never be a silent no-op). */
const ALLOWED = {
  plan: [
    'chapter',
    'all',
    'segments-per-request',
    'char-budget',
    'max-tokens',
    'model',
    'effort',
    'ruling-set',
    'out',
  ],
  run: [
    'chapter',
    'all',
    'mode',
    'effort',
    'model',
    'max-tokens',
    'timeout-ms',
    'layer1-commit',
    'limit',
    'ruling-set',
    'segments-per-request',
    'char-budget',
    'yes',
    'max-polls',
  ],
  resume: ['run', 'max-polls'],
  apply: ['chapter', 'run', 'report', 'write', 'overwrite', 'ruling-set'],
};

function positiveInt(v, name) {
  if (v === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(v))
    throw refusal('bad-flag', `--${name} must be a positive integer, got ${v}`);
  return Number(v);
}

const isInside = (p, root) => {
  const rel = path.relative(root, p);
  return !(rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel));
};

/**
 * Where a write to the absolute path `abs` would land: its deepest EXISTING ancestor resolved
 * through every symlink (fs.realpathSync), with the rest of the path rebuilt below it. A
 * component that exists but resolves to nothing (a dangling or looping symlink) refuses,
 * because a write through a dangling link creates the link's target, wherever that is.
 */
function landingPath(abs, name) {
  const tail = [];
  let cur = abs;
  for (;;) {
    let st;
    try {
      st = fs.lstatSync(cur);
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw err;
    }
    if (st) {
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

/**
 * Admit a --out/--report FILE only where the write would land outside the repository and
 * outside any books/ directory, judged by the real path (landingPath), not the path string:
 * a symlink outside the repository can point into it, and another checkout's book tree is
 * "outside" this repository yet as READ-ONLY as ours (config.js assertRecordsDir guards the
 * same shape for records). Returns the landing path, so the write goes exactly where it was
 * checked.
 */
function outsideRepo(file, repoRoot, name) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) {
    throw refusal('bad-flag', `--${name} must be an absolute path`);
  }
  const resolved = path.resolve(file);
  const landing = landingPath(resolved, name);
  if (isInside(resolved, repoRoot) || isInside(landing, fs.realpathSync(repoRoot))) {
    throw refusal(
      'bad-flag',
      `--${name} must be outside the repository (records and layers are tool-written)`
    );
  }
  if ([resolved, landing].some((p) => p.split(path.sep).includes('books'))) {
    throw refusal(
      'bad-flag',
      `--${name} must not lie in a books/ directory (another checkout's book tree is ` +
        `READ-ONLY too): ${landing}`
    );
  }
  return landing;
}

function repoRelativeInput(p, repoRoot, name) {
  if (
    typeof p !== 'string' ||
    p === '' ||
    path.isAbsolute(p) ||
    path.normalize(p).startsWith('..')
  ) {
    throw refusal('bad-flag', `--${name} must be a repo-relative path`);
  }
  if (!fs.existsSync(path.join(repoRoot, p)))
    throw refusal('bad-flag', `--${name}: ${p} does not exist`);
  return p.split(path.sep).join('/');
}

/** The chapters a command names: --all, or --chapter values that exist in 02-structure. */
export function resolveChapters({ bookDir, chapter, all }) {
  const structure = path.join(bookDir, '02-structure');
  const existing = fs
    .readdirSync(structure)
    .filter((d) => CHAPTER_DIR_RE.test(d) && fs.statSync(path.join(structure, d)).isDirectory())
    .sort();
  if (all && chapter?.length) throw refusal('bad-flag', 'give --all or --chapter, not both');
  if (all) return existing;
  if (!chapter?.length) throw refusal('bad-flag', 'name chapters with --chapter chNN (or --all)');
  for (const c of chapter) {
    if (!existing.includes(c))
      throw refusal('bad-flag', `--chapter ${c}: no such chapter in ${BOOK}`);
  }
  if (new Set(chapter).size !== chapter.length)
    throw refusal('bad-flag', 'a --chapter is given twice');
  return chapter;
}

/** Work list and requests for one chapter. */
export function planChapter({
  bookDir,
  chapterDir,
  rulings,
  rulingsById,
  prompt,
  model,
  effort,
  maxTokens,
  segmentsPerRequest,
  charBudget,
}) {
  const inputs = readChapterInputs({ bookDir, chapterDir });
  const workList = buildWorkList({
    chapterDir,
    units: inputs.map((u) => ({ stem: u.stem, en: u.en, is: u.base.parsed })),
    rulings,
  });
  const requests = buildRequests({
    workList,
    rulingsById,
    prompt,
    model,
    effort,
    maxTokens,
    segmentsPerRequest,
    charBudget,
  });
  return { inputs, workList, requests };
}

/** A rough token and cost picture for a chapter's requests (an estimate; invoices decide). */
export function estimateRequests(requests, { model, maxTokens }) {
  let inputTokens = 0;
  let worstInteractive = 0;
  let worstBatch = 0;
  for (const r of requests) {
    const chars = r.body.system[0].text.length + r.body.messages[0].content.length;
    const tokens = Math.ceil(chars / PLAN_CHARS_PER_TOKEN);
    inputTokens += tokens;
    worstInteractive += worstCaseUsd({ model, inputTokens: tokens, maxTokens, cacheWrite: true });
    worstBatch += worstCaseUsd({
      model,
      inputTokens: tokens,
      maxTokens,
      cacheWrite: true,
      batch: true,
    });
  }
  return {
    requests: requests.length,
    inputTokensEstimate: inputTokens,
    worstCaseUsd: { interactive: round2(worstInteractive), batch: round2(worstBatch) },
  };
}

const round2 = (x) => Math.round(x * 100) / 100;

const repoRel = (repoRoot, abs) => path.relative(repoRoot, abs).split(path.sep).join('/');

/**
 * The shapes of the input files a chapter's run reads, by directory: what decides the unit
 * set (listChapterUnits: every `*-structure.json`, plus chapter-metadata when its layer-1
 * file exists) and what each unit reads (readBase: layer 1 and its overlay; the English).
 * Preflight compares the chapter's listing of these at the layer-1 commit with the working
 * tree's, both ways, so the commit a record names holds the same unit set the run read.
 */
const INPUT_SHAPES = Object.freeze([
  { layer: LAYER_DIRS.pure, shape: /^(m\d+|chapter-metadata)-segments\.is\.md$/ },
  { layer: LAYER_DIRS.selected, shape: /^(m\d+|chapter-metadata)-selected\.json$/ },
  { layer: '02-for-mt', shape: /^(m\d+|chapter-metadata)-segments\.en\.md$/ },
  { layer: '02-structure', shape: /-structure\.json$/ },
]);

/** The repo-relative files a chapter's run reads, for the layer-1 commit check. */
function chapterInputFiles({ bookDir, repoRoot, chapterDir, inputs }) {
  const rel = (abs) => repoRel(repoRoot, abs);
  const files = [];
  for (const u of inputs) {
    files.push(rel(path.join(bookDir, LAYER_DIRS.pure, chapterDir, `${u.stem}-segments.is.md`)));
    files.push(rel(path.join(bookDir, '02-for-mt', chapterDir, `${u.stem}-segments.en.md`)));
    if (u.stem !== 'chapter-metadata') {
      files.push(rel(path.join(bookDir, '02-structure', chapterDir, `${u.stem}-structure.json`)));
    }
    const overlay = path.join(bookDir, LAYER_DIRS.selected, chapterDir, `${u.stem}-selected.json`);
    if (fs.existsSync(overlay)) files.push(rel(overlay));
  }
  return files;
}

function contextFrom(deps) {
  const repoRoot = deps.repoRoot ?? REPO_ROOT;
  const bookDir = deps.bookDir ?? path.join(repoRoot, 'books', BOOK);
  if (path.basename(bookDir) !== BOOK)
    throw refusal('wrong-book', `this runner processes ${BOOK} only`);
  assertBookSlug(BOOK);
  return {
    repoRoot,
    bookDir,
    // Records live with the book they describe (for the real book, config.js defaultRecordsDir).
    recordsDir: deps.recordsDir ?? path.join(bookDir, 'ai-review'),
    git: deps.git ?? makeGit({ cwd: repoRoot }),
    now: deps.now ?? (() => new Date()),
    out: deps.stdout ?? ((s) => process.stdout.write(s)),
    codePaths: deps.codePaths ?? CODE_PATHS,
  };
}

function loadInputs(ctx, values) {
  const rulingSetPath = repoRelativeInput(
    values['ruling-set'] ?? DEFAULT_RULING_SET,
    ctx.repoRoot,
    'ruling-set'
  );
  const rs = loadRulingSet(path.join(ctx.repoRoot, rulingSetPath));
  const prompt = loadPrompt(path.join(ctx.repoRoot, PROMPT_PATH));
  return {
    rulingSet: { path: rulingSetPath, sha256: rs.sha256, byId: rs.byId, rulings: rs.rulings },
    prompt: { path: PROMPT_PATH, sha256: prompt.sha256, text: prompt.text, schema: prompt.schema },
  };
}

function runParams(values) {
  const model = values.model ?? DEFAULT_MODEL;
  const effort = values.effort ?? DEFAULT_EFFORT;
  if (!EFFORTS.includes(effort))
    throw refusal('bad-flag', `--effort must be one of ${EFFORTS.join(', ')}`);
  return {
    model,
    effort,
    maxTokens: positiveInt(values['max-tokens'], 'max-tokens') ?? DEFAULT_MAX_TOKENS,
    segmentsPerRequest:
      positiveInt(values['segments-per-request'], 'segments-per-request') ??
      DEFAULT_SEGMENTS_PER_REQUEST,
    charBudget: positiveInt(values['char-budget'], 'char-budget') ?? DEFAULT_CHAR_BUDGET,
  };
}

function printPlan(ctx, rows, totals) {
  ctx.out(
    'chapter      units items occ   pairs requests input~tok  worst$ int  worst$ batch  skipped(identical/empty/no-en/no-is)\n'
  );
  for (const r of rows) {
    const s = r.counts.skipped;
    ctx.out(
      `${r.chapterDir.padEnd(12)} ${String(r.counts.units).padStart(5)} ${String(r.counts.items).padStart(5)} ${String(r.counts.candidateOccurrences).padStart(5)} ${String(r.counts.pairs).padStart(5)} ${String(r.estimate.requests).padStart(8)} ${String(r.estimate.inputTokensEstimate).padStart(10)} ${String(r.estimate.worstCaseUsd.interactive).padStart(10)} ${String(r.estimate.worstCaseUsd.batch).padStart(12)}  ${s['identical-to-en']}/${s['empty-is']}/${s['no-en']}/${s['no-is']}\n`
    );
  }
  ctx.out(
    `TOTAL        requests ${totals.requests}, input ~${totals.inputTokensEstimate} tokens, worst case USD ${round2(totals.worstInteractive)} interactive / ${round2(totals.worstBatch)} batch (the cap is USD ${CAP_USD}; a batch reserves its whole worst case, so batches run one chapter at a time)\n`
  );
}

function planAll(ctx, values) {
  const { rulingSet, prompt } = loadInputs(ctx, values);
  const params = runParams(values);
  const chapters = resolveChapters({
    bookDir: ctx.bookDir,
    chapter: values.chapter,
    all: values.all,
  });
  const rows = [];
  for (const chapterDir of chapters) {
    const p = planChapter({
      bookDir: ctx.bookDir,
      chapterDir,
      rulings: rulingSet.rulings,
      rulingsById: rulingSet.byId,
      prompt,
      ...params,
    });
    rows.push({
      chapterDir,
      ...p,
      counts: p.workList.counts,
      estimate: estimateRequests(p.requests, params),
    });
  }
  const totals = rows.reduce(
    (t, r) => ({
      requests: t.requests + r.estimate.requests,
      inputTokensEstimate: t.inputTokensEstimate + r.estimate.inputTokensEstimate,
      worstInteractive: t.worstInteractive + r.estimate.worstCaseUsd.interactive,
      worstBatch: t.worstBatch + r.estimate.worstCaseUsd.batch,
    }),
    { requests: 0, inputTokensEstimate: 0, worstInteractive: 0, worstBatch: 0 }
  );
  return { rulingSet, prompt, params, rows, totals };
}

async function cmdPlan(ctx, values) {
  const out = values.out ? outsideRepo(values.out, ctx.repoRoot, 'out') : null;
  const { rulingSet, prompt, params, rows, totals } = planAll(ctx, values);
  printPlan(ctx, rows, totals);
  if (out) {
    fs.writeFileSync(
      out,
      `${JSON.stringify(
        {
          book: BOOK,
          rulingSet: { path: rulingSet.path, sha256: rulingSet.sha256 },
          prompt: { path: prompt.path, sha256: prompt.sha256 },
          params,
          chapters: rows.map((r) => ({
            chapterDir: r.chapterDir,
            counts: r.counts,
            estimate: r.estimate,
            workList: r.workList,
            requests: r.requests,
          })),
          totals,
        },
        null,
        1
      )}\n`
    );
    ctx.out(`wrote ${out}\n`);
  }
  return { rows, totals };
}

/**
 * Refuse a paid run from a LINKED git worktree. The ledger the cap is enforced against lives
 * in the checkout (`<repoRoot>/books/<slug>/ai-review/ledger.jsonl`), so a linked worktree
 * holds a ledger of its own and with it a USD 100 of its own (the runner review, 2026-10-27).
 * The cap is therefore enforced per MAIN checkout: a repository whose git dir differs from
 * its common git dir is a linked worktree, and `run` refuses there. `plan` and `apply` spend
 * nothing and are not checked.
 */
function assertMainCheckout(git) {
  const [common, own] = git([
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
    '--absolute-git-dir',
  ])
    .split('\n')
    .map((s) => s.trim());
  if (!common || !own || fs.realpathSync(common) !== fs.realpathSync(own)) {
    throw refusal(
      'linked-worktree',
      `this checkout is a linked git worktree (git dir ${own}, common git dir ${common}); ` +
        'it keeps a ledger of its own, so the spending cap would not hold. Run paid passes ' +
        'from the main checkout.'
    );
  }
}

function preflight(
  ctx,
  { rulingSet, prompt, layer1Ref, chapters, plans, mode, maxTokens, timeoutMs }
) {
  assertMainCheckout(ctx.git);
  const problems = [];
  if (mode === 'interactive' && maxTokens > SDK_NONSTREAMING_MAX_TOKENS && !timeoutMs) {
    problems.push(
      `--max-tokens ${maxTokens} is above ${SDK_NONSTREAMING_MAX_TOKENS}: the SDK refuses such a non-streaming call unless --timeout-ms is given`
    );
  }
  problems.push(...cleanTrackedProblems(ctx.git, [prompt.path, rulingSet.path, ...ctx.codePaths]));
  const commit = resolveCommit(ctx.git, layer1Ref);
  for (const chapterDir of chapters) {
    // The SET first, both ways (a list built from the tree cannot name a deleted input),
    // then the bytes of every input file on both sides.
    const listing = listingAtCommitProblems({
      git: ctx.git,
      repoRoot: ctx.repoRoot,
      commit,
      dirs: INPUT_SHAPES.map(({ layer, shape }) => ({
        dir: repoRel(ctx.repoRoot, path.join(ctx.bookDir, layer, chapterDir)),
        shape,
      })),
    });
    problems.push(...listing.problems);
    const read = chapterInputFiles({
      bookDir: ctx.bookDir,
      repoRoot: ctx.repoRoot,
      chapterDir,
      inputs: plans.get(chapterDir).inputs,
    });
    for (const f of read) {
      if (!listing.tree.has(f))
        problems.push(`${f} is read by the run but no input shape covers it`);
    }
    problems.push(
      ...filesAtCommitProblems({
        git: ctx.git,
        repoRoot: ctx.repoRoot,
        commit,
        files: listing.common,
      })
    );
  }
  if (problems.length)
    throw refusal(
      'preflight',
      `refusing before spending anything:\n  - ${problems.join('\n  - ')}`
    );
  return commit;
}

/**
 * The run's term-pass.json. Everything in it is known before the first call, so the harness
 * writes it right after run.json (its `extraRecords` option): a process killed mid-run, even
 * while polling a paid batch, still leaves the record that resume and apply need.
 */
function termPassPayload({
  runId,
  chapterDir,
  layer1Commit,
  inputs,
  params,
  rulingSet,
  prompt,
  requests,
  plannedRequests,
  workList,
  limit,
}) {
  return {
    schema: TERM_PASS_SCHEMA,
    runId,
    book: BOOK,
    chapterDir,
    layer1Commit,
    units: unitFingerprints(inputs),
    params: {
      segmentsPerRequest: params.segmentsPerRequest,
      charBudget: params.charBudget,
      userFormat: USER_FORMAT,
      promptPath: prompt.path,
      rulingSetPath: rulingSet.path,
      limit: limit ?? null,
    },
    requestKeys: requests.map((r) => r.key),
    // The chapter's WHOLE plan, before --limit: apply measures coverage against it.
    plannedRequestKeys: plannedRequests.map((r) => r.key),
    workListCounts: workList.counts,
  };
}

async function cmdRun(ctx, values, deps) {
  const mode = values.mode;
  if (!MODES.includes(mode)) throw refusal('bad-flag', `--mode must be ${MODES.join(' or ')}`);
  const timeoutMs = positiveInt(values['timeout-ms'], 'timeout-ms');
  const limit = positiveInt(values.limit, 'limit');
  const { rulingSet, prompt, params, rows, totals } = planAll(ctx, values);
  const plans = new Map(rows.map((r) => [r.chapterDir, r]));
  const chapters = rows.map((r) => r.chapterDir);
  printPlan(ctx, rows, totals);
  const layer1Commit = preflight(ctx, {
    rulingSet,
    prompt,
    layer1Ref: values['layer1-commit'] ?? 'HEAD',
    chapters,
    plans,
    mode,
    maxTokens: params.maxTokens,
    timeoutMs,
  });
  ctx.out(
    `preflight passed: layer 1 at ${layer1Commit}; prompt ${prompt.sha256}; ruling set ${rulingSet.sha256}\n`
  );
  if (!values.yes) {
    ctx.out('not sending: add --yes to spend.\n');
    return { sent: false, layer1Commit };
  }
  let budget = limit ?? Infinity;
  const results = [];
  let stopped = false;
  for (const chapterDir of chapters) {
    if (budget <= 0) break;
    const plan = plans.get(chapterDir);
    const requests = plan.requests.slice(0, budget);
    if (requests.length === 0) continue;
    budget -= requests.length;
    const runId = mintRunId(ctx.now());
    const opts = {
      requests: requests.map((r) => ({ key: r.key, body: r.body })),
      recordsDir: ctx.recordsDir,
      use: USE,
      model: params.model,
      effort: params.effort,
      maxTokens: params.maxTokens,
      prompts: [{ path: prompt.path, sha256: prompt.sha256 }],
      rulingSet: { path: rulingSet.path, sha256: rulingSet.sha256 },
      runId,
      now: ctx.now,
      ...(deps.transport ? { transport: deps.transport } : {}),
      ...(deps.keyOptions ? { keyOptions: deps.keyOptions } : {}),
      ...(deps.harnessCommit ? { harnessCommit: deps.harnessCommit } : {}),
      ...(deps.harnessDirty ? { harnessDirty: deps.harnessDirty } : {}),
      ...(deps.sleep ? { sleep: deps.sleep } : {}),
      ...(deps.pollIntervalMs !== undefined ? { pollIntervalMs: deps.pollIntervalMs } : {}),
      ...(values['max-polls'] ? { maxPolls: positiveInt(values['max-polls'], 'max-polls') } : {}),
      ...(timeoutMs ? { timeout: timeoutMs } : {}),
      extraRecords: [
        {
          name: TERM_PASS_RECORD,
          payload: termPassPayload({
            runId,
            chapterDir,
            layer1Commit,
            inputs: plan.inputs,
            params,
            rulingSet,
            prompt,
            requests,
            plannedRequests: plan.requests,
            workList: plan.workList,
            limit,
          }),
        },
      ],
    };
    const result = mode === 'batch' ? await runBatch(opts) : await runInteractive(opts);
    results.push({ chapterDir, ...result });
    if (!judgeRun(ctx, chapterDir, result)) {
      ctx.out('  stopping: later chapters are not sent.\n');
      stopped = true;
      break;
    }
  }
  const ledger = summarizeLedger(readLedger(path.join(ctx.recordsDir, 'ledger.jsonl')));
  ctx.out(`ledger: ${JSON.stringify(ledger)}\n`);
  return { sent: true, layer1Commit, results, exitCode: stopped ? 2 : 0 };
}

/** What to do next after a run that did not end complete, by its status. */
const REMEDY = Object.freeze({
  pending: (r) => `resume with: node tools/ai-review/term-pass.js resume --run ${r.runId}`,
  'submit-unknown': () =>
    'the batch may exist: check the Anthropic Console before anything else; its ' +
    'reservation stays open in the ledger (batch.json names it)',
  'submit-failed': () => 'the API refused the batch; its reservation was released',
  'stopped-at-cap': () => 'the spending cap refused the next reservation (see the ledger line)',
  'stopped-on-errors': () => "too many API errors (see the run's errors.jsonl)",
  'stopped-on-truncation': () => 'answers were cut off at max_tokens: raise --max-tokens first',
  'stopped-over-reservation': () =>
    'a response cost more than its reserved worst case: the price assumptions did not hold',
  'complete-over-reservation': () =>
    'the results are in, but a response cost more than its reserved worst case',
});

/**
 * Print one chapter run's line with its response counts, and judge it. A run is good only
 * when it ended 'complete' AND every request it sent came back usable: a truncated,
 * refused, errored or missing answer reviews nothing, so the chapters after it are not sent
 * and the command exits 2 (the runner review, 2026-10-27: such chapters used to read
 * 'complete' and let a too-small max_tokens spend through the whole book).
 * @returns {boolean} whether the run is good
 */
function judgeRun(ctx, chapterDir, result) {
  const c = result.counts;
  const usd = result.totalUsd !== undefined ? `, USD ${result.totalUsd}` : '';
  const tally = c
    ? ` (usable ${c.succeeded} of ${c.sent} sent; truncated ${c.truncated ?? 0}, ` +
      `refusal ${c.refusal}, errored ${c.errored}, not sent ${c.notSent})`
    : '';
  ctx.out(`${chapterDir}: run ${result.runId} ${result.status}${usd}${tally}\n`);
  if (result.status !== 'complete') {
    const remedy = REMEDY[result.status];
    if (remedy) ctx.out(`  ${remedy(result)}\n`);
    return false;
  }
  if (c && c.succeeded < c.sent) {
    ctx.out(
      `  ${c.sent - c.succeeded} of ${c.sent} answers in ${chapterDir} are not usable; ` +
        "read the run's records first (and raise --max-tokens if any were truncated)\n"
    );
    return false;
  }
  return true;
}

async function cmdResume(ctx, values, deps) {
  const ids = values.run ?? [];
  if (ids.length !== 1) throw refusal('bad-flag', 'resume takes exactly one --run');
  const runId = ids[0];
  const dir = runDirFor(ctx.recordsDir, runId);
  if (!fs.existsSync(dir)) throw refusal('bad-flag', `no run ${runId}`);
  const r = createRecordWriter({ dir });
  if (!r.exists(RECORD_FILES.run)) throw refusal('bad-flag', `run ${runId} has no run.json`);
  const run = r.readJson(RECORD_FILES.run);
  if (run.use !== USE || run.mode !== 'batch')
    throw refusal('bad-flag', `run ${runId} is not a ${USE} batch run`);
  if (!r.exists(TERM_PASS_RECORD)) {
    throw refusal(
      'bad-flag',
      `run ${runId} has no ${TERM_PASS_RECORD}; apply could not use its results`
    );
  }
  const tp = r.readJson(TERM_PASS_RECORD);
  // No re-plan: the harness collects against the recorded requests.jsonl. A tree changed
  // since the buy (a HAND REPAIR, a prompt fix) must not strand a batch already paid for;
  // apply is the staleness gate, and it refuses results whose inputs moved.
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
    ...(deps.transport ? { transport: deps.transport } : {}),
    ...(deps.keyOptions ? { keyOptions: deps.keyOptions } : {}),
    ...(deps.harnessCommit ? { harnessCommit: deps.harnessCommit } : {}),
    ...(deps.harnessDirty ? { harnessDirty: deps.harnessDirty } : {}),
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
    ...(deps.pollIntervalMs !== undefined ? { pollIntervalMs: deps.pollIntervalMs } : {}),
    ...(values['max-polls'] ? { maxPolls: positiveInt(values['max-polls'], 'max-polls') } : {}),
  });
  const good = judgeRun(ctx, tp.chapterDir, { ...result, runId });
  return { ...result, exitCode: good ? 0 : 2 };
}

async function cmdApply(ctx, values) {
  const chapters = values.chapter ?? [];
  if (chapters.length !== 1) throw refusal('bad-flag', 'apply takes exactly one --chapter');
  const [chapterDir] = resolveChapters({ bookDir: ctx.bookDir, chapter: chapters, all: false });
  const runIds = values.run ?? [];
  if (runIds.length === 0) throw refusal('bad-flag', 'apply needs at least one --run');
  if (values.overwrite && !values.write)
    throw refusal('bad-flag', '--overwrite only goes with --write');
  const report = values.report ? outsideRepo(values.report, ctx.repoRoot, 'report') : null;
  const { rulingSet, prompt } = loadInputs(ctx, values);
  if (values.write) {
    const problems = cleanTrackedProblems(ctx.git, [prompt.path, rulingSet.path, ...ctx.codePaths]);
    if (problems.length)
      throw refusal('preflight', `refusing to write layer 2:\n  - ${problems.join('\n  - ')}`);
  }
  const applyCommit = resolveCommit(ctx.git, 'HEAD');
  const runs = runIds.map((runId) => loadRunRecords({ recordsDir: ctx.recordsDir, runId }));
  const result = applyChapter({
    bookDir: ctx.bookDir,
    chapterDir,
    rulingSet,
    prompt,
    runs,
    applyCommit,
  });
  ctx.out(`${chapterDir}: ${JSON.stringify(result.counts)}\n`);
  ctx.out(`${coverageLine(result.coverage)}\n`);
  if (report) {
    fs.writeFileSync(report, renderReport(result));
    ctx.out(`wrote ${report}\n`);
  }
  if (values.write) {
    // A layer-2 chapter must not pass an unreviewed segment off as a reviewed one. (A
    // recorded --partial would need revision.json to say so; mt-revised/1 has no field for it.)
    if (!result.coverage.complete) {
      throw refusal(
        'partial-coverage',
        `refusing to write layer 2: ${result.coverage.requestsMissing.length} of ` +
          `${result.coverage.requestsPlanned} planned requests have no usable answer ` +
          `(first: ${result.coverage.requestsMissing.slice(0, 3).join(', ')}). ` +
          'Run the chapter again and apply the runs together.'
      );
    }
    const written = writeApplied({
      bookDir: ctx.bookDir,
      chapterDir,
      result,
      overwrite: Boolean(values.overwrite),
    });
    ctx.out(
      `wrote ${written.layer2.length} layer-2 files and ${written.applied.length} applied records\n`
    );
    return { result, written };
  }
  ctx.out('dry run: nothing written (add --write after the prompt is frozen).\n');
  return { result };
}

/**
 * Run the CLI.
 * @param {string[]} argv arguments after the script name
 * @param {object} [deps] injectable: repoRoot, bookDir, recordsDir, git, now, stdout, codePaths,
 *   transport, keyOptions, harnessCommit, harnessDirty, sleep, pollIntervalMs
 */
export async function main(argv, deps = {}) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: OPTIONS,
    strict: true,
    allowPositionals: true,
  });
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    (deps.stdout ?? ((s) => process.stdout.write(s)))(`${usage()}\n`);
    return null;
  }
  if (rest.length) throw refusal('bad-flag', `unexpected argument ${rest[0]}`);
  if (!Object.hasOwn(ALLOWED, command))
    throw refusal('bad-flag', `unknown command ${command}\n${usage()}`);
  for (const k of Object.keys(values)) {
    if (!ALLOWED[command].includes(k))
      throw refusal('bad-flag', `--${k} does not apply to ${command}`);
  }
  const ctx = contextFrom(deps);
  if (command === 'plan') return cmdPlan(ctx, values);
  if (command === 'run') return cmdRun(ctx, values, deps);
  if (command === 'resume') return cmdResume(ctx, values, deps);
  return cmdApply(ctx, values);
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
      // 2: run/resume ended without a complete, fully usable chapter (judgeRun says why).
      process.exitCode = Number.isInteger(r?.exitCode) ? r.exitCode : 0;
    },
    (err) => {
      process.stderr.write(`term-pass: ${err.message}\n`);
      process.exitCode = 1;
    }
  );
}
