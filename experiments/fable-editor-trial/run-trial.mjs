#!/usr/bin/env node
/**
 * run-trial.mjs — send one chapter's machine translation to Claude Fable 5.2 as an editor.
 *
 * Plan: docs/plans/2026-11-14-fable-editor-trial-plan.md. Every API call goes through the shared
 * harness (tools/ai-review/harness.js): token count, a worst-case reservation against this
 * trial's OWN ledger and cap, a record of every request and response, refusals and truncation
 * recorded and never retried, no fallback model.
 *
 *   (no --yes)  0 ISK. Checks the inputs, builds the requests, prints the plan and a rough
 *               worst case. Sends nothing; needs no API key.
 *   --yes       PAID. Runs the requests (interactive by default, --mode batch for the Batch API).
 *   --resume    Resume a batch run whose polling stopped (same flags, plus --resume <runId>).
 *
 * Guard rails (plan §3): the records directory must be OUTSIDE the repository; nothing is
 * written under books/ (checked before and after); the prompt, the ruling set and this code
 * must be tracked and clean so the commit a record names is what ran.
 *
 * Exit codes: 0 done (or dry run); 1 refused or failed; 2 the run ended without every
 * request answered.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadRulingSet } from '../../tools/ai-review/ruling-set.js';
import { runInteractive, runBatch, EFFORTS } from '../../tools/ai-review/harness.js';
import { worstCaseUsd } from '../../tools/ai-review/pricing.js';
import { CAP_USD } from '../../tools/ai-review/config.js';
import { makeGit, cleanTrackedProblems } from '../../tools/ai-review/provenance.js';
import { readJsonl } from './records-io.mjs';
import {
  REPO_ROOT,
  TRIAL_DIR,
  BOOK,
  MODEL,
  USE,
  USER_FORMAT,
  PROMPT_PATH,
  RULING_SET_PATH,
  TRIAL_RECORD,
  TRIAL_SCHEMA,
  DEFAULT_EFFORT,
  DEFAULT_MAX_TOKENS,
  DEFAULT_CHAR_BUDGET,
  DEFAULT_CAP_USD,
  fileSha256,
  readPinnedInputs,
  buildRequests,
  estimateInputTokens,
  parseAnswer,
} from './lib.mjs';

/** The SDK refuses a non-streaming call above this max_tokens unless a timeout is given. */
const SDK_NONSTREAMING_MAX_TOKENS = 21333;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const CODE_PATHS = [
  `${TRIAL_DIR}/run-trial.mjs`,
  `${TRIAL_DIR}/lib.mjs`,
  `${TRIAL_DIR}/records-io.mjs`,
  'tools/ai-review/harness.js',
  'tools/ai-review/pricing.js',
  'tools/ai-review/transport-anthropic.js',
];

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      chapter: { type: 'string', default: 'ch10' },
      module: { type: 'string', multiple: true },
      records: { type: 'string' },
      mode: { type: 'string', default: 'interactive' },
      effort: { type: 'string', default: DEFAULT_EFFORT },
      'max-tokens': { type: 'string', default: String(DEFAULT_MAX_TOKENS) },
      'timeout-ms': { type: 'string' },
      'cap-usd': { type: 'string', default: String(DEFAULT_CAP_USD) },
      'char-budget': { type: 'string', default: String(DEFAULT_CHAR_BUDGET) },
      'show-request': { type: 'string' },
      resume: { type: 'string' },
      yes: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  const int = (name) => {
    const n = Number(values[name]);
    if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`--${name} must be a positive integer`);
    return n;
  };
  if (!['interactive', 'batch'].includes(values.mode)) {
    throw new Error('--mode must be interactive or batch');
  }
  if (!EFFORTS.includes(values.effort)) throw new Error(`--effort must be one of ${EFFORTS}`);
  const cap = Number(values['cap-usd']);
  if (!Number.isFinite(cap) || cap <= 0 || cap > CAP_USD) {
    throw new Error(`--cap-usd must be above 0 and at most ${CAP_USD}`);
  }
  if (values.resume && values.mode !== 'batch') throw new Error('--resume needs --mode batch');
  return {
    help: values.help,
    chapter: values.chapter,
    modules: values.module ?? null,
    records: values.records ?? null,
    mode: values.mode,
    effort: values.effort,
    maxTokens: int('max-tokens'),
    timeoutMs: values['timeout-ms'] ? int('timeout-ms') : null,
    cap,
    charBudget: int('char-budget'),
    showRequest: values['show-request'] ?? null,
    resume: values.resume ?? null,
    yes: values.yes,
  };
}

/** The records directory, absolute and outside the repository (plan §5.1). */
export function assertOutsideRepo(dir) {
  if (!dir || !path.isAbsolute(dir)) throw new Error('--records must be an absolute path');
  const rel = path.relative(REPO_ROOT, path.resolve(dir));
  if (!(rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))) {
    throw new Error(
      `--records must be outside the repository (got ${dir}); promote.mjs copies a finished run in`
    );
  }
  return path.resolve(dir);
}

function booksStatus(git) {
  return git(['status', '--porcelain', '--untracked-files=all', '--', 'books/']).trim();
}

const HELP = `usage: node ${TRIAL_DIR}/run-trial.mjs [--chapter ch10] [--module mNNNNN ...]
  [--records <absolute dir outside the repo>] [--mode interactive|batch] [--effort high]
  [--max-tokens 64000] [--timeout-ms N] [--cap-usd 40] [--char-budget 30000]
  [--show-request <file>] [--resume <runId>] [--yes]
Without --yes nothing is sent. See docs/plans/2026-11-14-fable-editor-trial-plan.md §5.4.`;

export async function main(argv, deps = {}) {
  const out = deps.stdout ?? process.stdout;
  const opts = parseCli(argv);
  if (opts.help) {
    out.write(`${HELP}\n`);
    return 0;
  }
  const git = deps.git ?? makeGit({ cwd: REPO_ROOT });

  const { inputs, tp, fingerprints, enDrift } = readPinnedInputs(opts.chapter, deps.inputOptions);
  const rulingSet = loadRulingSet(RULING_SET_PATH);
  const prompt = fs.readFileSync(path.join(REPO_ROOT, PROMPT_PATH), 'utf8');
  const requests = buildRequests({
    chapterDir: opts.chapter,
    inputs,
    rulingSet,
    prompt,
    effort: opts.effort,
    maxTokens: opts.maxTokens,
    charBudget: opts.charBudget,
    modules: opts.modules,
  });
  const batch = opts.mode === 'batch';

  out.write(
    `fable-trial plan: ${BOOK} ${opts.chapter}, model ${MODEL}, effort ${opts.effort}, ` +
      `max_tokens ${opts.maxTokens}, mode ${opts.mode}\n` +
      `inputs match term-pass run ${tp.runId} (layer 1 at ${tp.record.layer1Commit})` +
      (enDrift.length
        ? `; English re-extracted since (G1.12) for ${enDrift.map((d) => d.stem).join(', ')}`
        : '') +
      '\n'
  );
  let worst = 0;
  for (const r of requests) {
    const est = estimateInputTokens(r.body);
    const w = worstCaseUsd({ model: MODEL, inputTokens: est, maxTokens: opts.maxTokens, batch });
    worst += w;
    out.write(
      `  ${r.key}  ${String(r.keys.length).padStart(4)} segments  ${String(r.isChars).padStart(6)} chars  ~${est} input tokens\n`
    );
  }
  const segs = requests.reduce((n, r) => n + r.keys.length, 0);
  out.write(
    `${requests.length} requests, ${segs} segments. Worst case if every answer used all of ` +
      `max_tokens: ~$${worst.toFixed(2)} (the cap is $${opts.cap}; the harness counts real tokens first).\n`
  );
  if (opts.showRequest) {
    fs.writeFileSync(opts.showRequest, JSON.stringify(requests[0].body, null, 2));
    out.write(`first request body written to ${opts.showRequest}\n`);
  }
  if (!opts.yes) {
    out.write('dry run: nothing sent. Add --yes (and --records) to run.\n');
    return 0;
  }

  const recordsDir = assertOutsideRepo(opts.records);
  const dirty = cleanTrackedProblems(git, [PROMPT_PATH, RULING_SET_PATH, ...CODE_PATHS]);
  if (dirty.length) throw new Error(`fable-trial: commit these first:\n  ${dirty.join('\n  ')}`);
  const before = booksStatus(git);
  if (before) throw new Error(`fable-trial: books/ has uncommitted changes; refusing:\n${before}`);

  const timeoutMs =
    opts.timeoutMs ??
    (!batch && opts.maxTokens > SDK_NONSTREAMING_MAX_TOKENS ? DEFAULT_TIMEOUT_MS : null);
  const common = {
    recordsDir,
    use: USE,
    model: MODEL,
    effort: opts.effort,
    maxTokens: opts.maxTokens,
    prompts: [{ path: PROMPT_PATH, sha256: fileSha256(PROMPT_PATH) }],
    rulingSet: { path: RULING_SET_PATH, sha256: rulingSet.sha256 },
    cap: opts.cap,
    ...(timeoutMs ? { timeout: timeoutMs } : {}),
    ...(deps.transport ? { transport: deps.transport } : {}),
    ...(deps.harness ?? {}),
  };
  const trialRecord = {
    schema: TRIAL_SCHEMA,
    book: BOOK,
    chapterDir: opts.chapter,
    termPassRun: tp.runId,
    layer1Commit: tp.record.layer1Commit,
    units: fingerprints,
    enDrift,
    userFormat: USER_FORMAT,
    charBudget: opts.charBudget,
    modules: opts.modules,
    requests: requests.map((r) => ({ key: r.key, stem: r.stem, keys: r.keys })),
  };

  let result;
  if (opts.resume) {
    result = await runBatch({
      ...common,
      runId: opts.resume,
      requests: requests.map(({ key, body }) => ({ key, body })),
    });
  } else {
    const reqs = requests.map(({ key, body }) => ({ key, body }));
    const extraRecords = [{ name: TRIAL_RECORD, payload: trialRecord }];
    result = batch
      ? await runBatch({ ...common, requests: reqs, extraRecords })
      : await runInteractive({ ...common, requests: reqs, extraRecords });
  }

  const after = booksStatus(git);
  if (after !== before) out.write(`⚠️ books/ changed during the run — investigate:\n${after}\n`);

  const runDir = result.runDir;
  const responses = fs.existsSync(path.join(runDir, 'responses.jsonl'))
    ? readJsonl(path.join(runDir, 'responses.jsonl'))
    : [];
  const byKey = new Map(responses.map((r) => [r.key, r]));
  let usable = 0;
  let edits = 0;
  for (const r of requests) {
    const a = parseAnswer(byKey.get(r.key), r.keys);
    if (a.usable) {
      usable++;
      edits += a.edits.length;
    }
  }
  out.write(
    `run ${result.runId}: ${result.status}; ${usable} of ${requests.length} answers usable, ` +
      `${edits} segments edited; cost $${(result.totalUsd ?? 0).toFixed(4)}\n` +
      `records: ${runDir}\n` +
      `next: node ${TRIAL_DIR}/promote.mjs --run ${result.runId} --records ${recordsDir}\n`
  );
  return result.status === 'complete' && usable === requests.length ? 0 : 2;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  process.exitCode = 1;
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`${err.message}\n`);
      process.exitCode = 1;
    }
  );
}
