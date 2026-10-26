/**
 * harness.js — the generic AI-call harness: prebuilt request bodies in, records out.
 *
 * Design: docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, Unit D.
 *
 * GENERIC by design: a request is `{ key, body }`, where `key` is the string the request
 * stands for (a segment key, to the runner that will call this) and `body` is a complete
 * Messages API request. The harness knows nothing about segments beyond that string.
 *
 * Two modes, one record shape (records.js):
 *   - `runInteractive`: per request — count tokens, reserve the worst case, record the
 *     request, send, record the response, settle. An API error releases the reservation
 *     and is recorded; a refusal (`stop_reason: 'refusal'`) is recorded as an outcome and
 *     never retried, on this model or any other. The run STOPS at the first request the
 *     cap refuses.
 *   - `runBatch`: count tokens (or take a supplied estimate), reserve the whole batch's
 *     worst case at the Batch API's half price, record the requests, record a
 *     `submitting` marker, submit, record the batch id BEFORE the first poll, poll, record
 *     each result keyed by custom_id, settle the actual total and release the rest. A run
 *     directory that records an unfinished batch is RESUMED, never resubmitted.
 *
 * Everything that can be checked without spending is checked before the first call and
 * before anything is written: the run's parameters, every request body (against an
 * allowlist of SAFE shapes — never a list of dangerous ones), the price table, the cap and
 * the API key.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CAP_USD, DEFAULT_POLL_INTERVAL_MS, resolveApiKey } from './config.js';
import { PRICING, ratesFor, worstCasePico, costPico, picoToUsd, usdToPico } from './pricing.js';
import {
  reserve,
  settleAndRelease,
  releaseAll,
  reservationState,
  CapExceededError,
} from './ledger.js';
import {
  RECORD_FILES,
  mintRunId,
  mintCustomId,
  createRunDir,
  openRunDir,
  runDirFor,
  createRecordWriter,
  harnessCommit as gitHarnessCommit,
  harnessDirty as gitHarnessDirty,
} from './records.js';
import { createAnthropicTransport, describeApiError } from './transport-anthropic.js';

export const EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
export const BATCH_MAX_REQUESTS = 100_000;
export const BATCH_MAX_BYTES = 256 * 1024 * 1024;
export const DEFAULT_MAX_CONSECUTIVE_ERRORS = 5;

/** Top-level request fields the harness lets through. Anything else refuses. */
const BODY_KEYS = new Set([
  'model',
  'max_tokens',
  'messages',
  'system',
  'output_config',
  'thinking',
  'stop_sequences',
  'metadata',
  'cache_control',
]);
const REQUEST_KEYS = new Set(['key', 'body', 'inputTokensEstimate']);
const OUTPUT_CONFIG_KEYS = new Set(['effort', 'format']);
const FORMAT_KEYS = new Set(['type', 'schema']);
const THINKING_KEYS = new Set(['type', 'display']);
const THINKING_TYPES = new Set(['adaptive', 'disabled']);
/** Statuses after which no further request in the run can succeed. */
const STOP_STATUSES = new Set([401, 403]);
const USE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const MIN_SECRET_LENGTH = 8;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Problems with one request body against the run it belongs to (empty = valid).
 * @param {unknown} body
 * @param {{ model: string, effort: string, maxTokens: number }} run
 * @returns {string[]}
 */
export function validateRequestBody(body, { model, effort, maxTokens }) {
  if (!isPlainObject(body)) return ['body is not an object'];
  const problems = [];
  for (const k of Object.keys(body)) {
    if (!BODY_KEYS.has(k)) problems.push(`field "${k}" is not in the harness's request shape`);
  }
  if (body.model !== model)
    problems.push(`model ${JSON.stringify(body.model)} is not the run's ${model}`);
  if (body.max_tokens !== maxTokens) {
    problems.push(`max_tokens ${JSON.stringify(body.max_tokens)} is not the run's ${maxTokens}`);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    problems.push('messages must be a non-empty array');
  }
  const oc = body.output_config;
  if (!isPlainObject(oc)) {
    problems.push('output_config.effort must be set explicitly');
  } else {
    for (const k of Object.keys(oc)) {
      if (!OUTPUT_CONFIG_KEYS.has(k)) problems.push(`output_config.${k} is not allowed`);
    }
    if (oc.effort !== effort) {
      problems.push(`output_config.effort ${JSON.stringify(oc.effort)} is not the run's ${effort}`);
    }
    if (oc.format !== undefined) {
      const f = oc.format;
      const ok =
        isPlainObject(f) &&
        Object.keys(f).every((k) => FORMAT_KEYS.has(k)) &&
        f.type === 'json_schema' &&
        isPlainObject(f.schema);
      if (!ok) problems.push('output_config.format must be { type: "json_schema", schema: {…} }');
    }
  }
  if (body.thinking !== undefined) {
    const t = body.thinking;
    const ok =
      isPlainObject(t) &&
      Object.keys(t).every((k) => THINKING_KEYS.has(k)) &&
      THINKING_TYPES.has(t.type);
    if (!ok) problems.push('thinking must be { type: "adaptive" | "disabled" } with no budget');
  }
  if (
    body.stop_sequences !== undefined &&
    !(Array.isArray(body.stop_sequences) && body.stop_sequences.every((s) => typeof s === 'string'))
  ) {
    problems.push('stop_sequences must be an array of strings');
  }
  if (body.metadata !== undefined && !isPlainObject(body.metadata)) {
    problems.push('metadata must be an object');
  }
  return problems;
}

/** Whether a body can write the prompt cache (a `cache_control` anywhere in it). */
function canWriteCache(value) {
  if (Array.isArray(value)) return value.some(canWriteCache);
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(
    ([k, v]) => (k === 'cache_control' && v !== null && v !== undefined) || canWriteCache(v)
  );
}

function assertFileRef(ref, what) {
  if (!isPlainObject(ref) || typeof ref.path !== 'string' || ref.path === '') {
    throw new Error(`harness: ${what} must be { path, sha256 }`);
  }
  if (path.isAbsolute(ref.path)) {
    throw new Error(
      `harness: ${what}.path must be repo-relative (records are committed and must not carry ` +
        `a local absolute path): ${ref.path}`
    );
  }
  if (typeof ref.sha256 !== 'string' || !SHA256_RE.test(ref.sha256)) {
    throw new Error(`harness: ${what}.sha256 must be 64 lowercase hex characters`);
  }
  return { path: ref.path, sha256: ref.sha256 };
}

/** Validate the run's own parameters (no I/O). */
function validateRun(opts) {
  if (typeof opts.recordsDir !== 'string' || opts.recordsDir === '') {
    throw new Error('harness: recordsDir is required');
  }
  if (typeof opts.use !== 'string' || !USE_RE.test(opts.use)) {
    throw new Error(`harness: use must be a kebab-case name, got ${JSON.stringify(opts.use)}`);
  }
  ratesFor(opts.model); // an unknown model refuses here, before anything is spent or written
  if (!EFFORTS.includes(opts.effort)) {
    throw new Error(`harness: effort must be one of ${EFFORTS.join(', ')}`);
  }
  if (!Number.isSafeInteger(opts.maxTokens) || opts.maxTokens < 1) {
    throw new Error('harness: maxTokens must be a positive integer');
  }
  if (!Array.isArray(opts.prompts) || opts.prompts.length === 0) {
    throw new Error('harness: prompts must list at least one { path, sha256 }');
  }
  const prompts = opts.prompts.map((p, i) => assertFileRef(p, `prompts[${i}]`));
  if (opts.rulingSet === undefined) {
    throw new Error('harness: rulingSet must be given ({ path, sha256 } or null)');
  }
  const rulingSet = opts.rulingSet === null ? null : assertFileRef(opts.rulingSet, 'rulingSet');
  const cap = opts.cap ?? CAP_USD;
  if (typeof cap !== 'number' || !Number.isFinite(cap) || cap <= 0 || cap > CAP_USD) {
    throw new Error(`harness: cap must be a positive number no greater than CAP_USD (${CAP_USD})`);
  }
  return { prompts, rulingSet, cap };
}

/** Validate the request list (no I/O). */
function validateRequests(requests, run, { batch }) {
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new Error('harness: requests must be a non-empty array');
  }
  if (batch && requests.length > BATCH_MAX_REQUESTS) {
    throw new Error(`harness: a batch holds at most ${BATCH_MAX_REQUESTS} requests`);
  }
  const seen = new Set();
  let bytes = 0;
  const out = requests.map((r, i) => {
    if (!isPlainObject(r) || Object.keys(r).some((k) => !REQUEST_KEYS.has(k))) {
      throw new Error(`harness: requests[${i}] must be { key, body, inputTokensEstimate? }`);
    }
    if (typeof r.key !== 'string' || r.key === '') {
      throw new Error(`harness: requests[${i}].key must be a non-empty string`);
    }
    if (seen.has(r.key)) throw new Error(`harness: duplicate request key ${JSON.stringify(r.key)}`);
    seen.add(r.key);
    const problems = validateRequestBody(r.body, run);
    if (problems.length) {
      throw new Error(`harness: request ${JSON.stringify(r.key)}: ${problems.join('; ')}`);
    }
    if (
      r.inputTokensEstimate !== undefined &&
      !(Number.isSafeInteger(r.inputTokensEstimate) && r.inputTokensEstimate >= 0)
    ) {
      throw new Error(`harness: request ${JSON.stringify(r.key)}: bad inputTokensEstimate`);
    }
    bytes += Buffer.byteLength(JSON.stringify(r.body));
    return { key: r.key, body: r.body, inputTokensEstimate: r.inputTokensEstimate };
  });
  if (batch && bytes > BATCH_MAX_BYTES) {
    throw new Error(`harness: a batch holds at most ${BATCH_MAX_BYTES} bytes of requests`);
  }
  return out;
}

/** Transport and the secrets the records must never contain — resolved before any write. */
function resolveTransport(opts) {
  const secrets = [...(opts.secrets ?? [])];
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (typeof envKey === 'string' && envKey.trim().length >= MIN_SECRET_LENGTH) {
    secrets.push(envKey.trim());
  }
  if (opts.transport) return { transport: opts.transport, secrets };
  const apiKey = resolveApiKey(opts.keyOptions);
  if (apiKey.length >= MIN_SECRET_LENGTH) secrets.push(apiKey);
  return {
    transport: createAnthropicTransport({ apiKey, timeout: opts.timeout }),
    secrets,
  };
}

/** Shared per-run context: records, ledger, clock, version capture. */
function openContext(
  opts,
  { mode, runId, runDir, transport, secrets, prompts, rulingSet, cap, requestCount, existingRun }
) {
  const now = opts.now ?? (() => new Date());
  const ledgerPath = opts.ledgerPath ?? path.join(opts.recordsDir, 'ledger.jsonl');
  const writer = createRecordWriter({ dir: runDir, secrets });
  const stamp = () => now().toISOString();
  let run = existingRun;
  if (!run) {
    run = {
      schema: 'ai-review-run/1',
      runId,
      use: opts.use,
      mode,
      model: opts.model,
      effort: opts.effort,
      max_tokens: opts.maxTokens,
      prompts,
      rulingSet,
      sdk: transport.sdk ? transport.sdk() : null,
      anthropicVersion: transport.anthropicVersion ? transport.anthropicVersion() : null,
      harnessCommit: (opts.harnessCommit ?? gitHarnessCommit)(),
      harnessDirty: (opts.harnessDirty ?? gitHarnessDirty)(),
      cap: { usd: cap, ledger: path.relative(opts.recordsDir, ledgerPath) },
      pricing: { source: PRICING.source, cachedOn: PRICING.cachedOn },
      startedAt: stamp(),
      requestCount,
    };
    writer.writeJson(RECORD_FILES.run, run);
  }
  const noteVersion = () => {
    const v = transport.anthropicVersion ? transport.anthropicVersion() : null;
    if (v && run.anthropicVersion === null) {
      run = { ...run, anthropicVersion: v };
      writer.writeJson(RECORD_FILES.run, run);
    }
  };
  const recordError = (customId, key, stage, error) =>
    writer.appendJsonl(RECORD_FILES.errors, {
      custom_id: customId,
      key,
      stage,
      error,
      recordedAt: stamp(),
    });
  const recordRequest = (customId, key, inputTokens, inputTokensSource, worstP, body) =>
    writer.appendJsonl(RECORD_FILES.requests, {
      custom_id: customId,
      key,
      inputTokens,
      inputTokensSource,
      worstCaseUsd: picoToUsd(worstP),
      recordedAt: stamp(),
      body,
    });
  /** Record one message response; returns its cost in pico-USD, or null when unpriceable. */
  const recordResponse = (customId, key, message, { batch }) => {
    let pico = null;
    try {
      if (isPlainObject(message?.usage)) {
        pico = costPico({ model: message.model, usage: message.usage, batch });
      }
    } catch {
      pico = null; // unknown model or malformed usage: the caller settles the worst case
    }
    const outcome = message?.stop_reason === 'refusal' ? 'refusal' : 'succeeded';
    writer.appendJsonl(RECORD_FILES.responses, {
      custom_id: customId,
      key,
      outcome,
      stop_reason: message?.stop_reason ?? null,
      model: message?.model ?? null,
      usage: message?.usage ?? null,
      costUsd: pico === null ? null : picoToUsd(pico),
      batch,
      recordedAt: stamp(),
      response: message,
    });
    return { pico, outcome };
  };
  const writeRunEnd = (status, counts, totalPico, batchId) =>
    writer.writeJson(RECORD_FILES.runEnd, {
      schema: 'ai-review-run-end/1',
      runId,
      mode,
      status,
      endedAt: stamp(),
      counts,
      totalUsd: picoToUsd(totalPico),
      batchId,
    });
  return {
    now,
    ledgerPath,
    writer,
    run: () => run,
    noteVersion,
    recordError,
    recordRequest,
    recordResponse,
    writeRunEnd,
  };
}

function capError(err) {
  return {
    name: err.name,
    status: null,
    type: 'cap_exceeded',
    message: err.message,
    requestId: null,
  };
}

function emptyCounts(planned) {
  return { planned, sent: 0, succeeded: 0, refusal: 0, errored: 0, notSent: planned };
}

/**
 * Run requests one at a time.
 * @param {object} opts see the module docstring; `requests: [{ key, body, inputTokensEstimate? }]`,
 *   `recordsDir`, `use`, `model`, `effort`, `maxTokens`, `prompts`, `rulingSet`, and optionally
 *   `transport`, `keyOptions`, `secrets`, `cap`, `ledgerPath`, `runId`, `now`,
 *   `maxConsecutiveErrors`, `harnessCommit`, `harnessDirty`, `timeout`.
 * @returns {Promise<{ runId: string, runDir: string, status: string, counts: object, totalUsd: number }>}
 */
export async function runInteractive(opts) {
  const { prompts, rulingSet, cap } = validateRun(opts);
  const run = { model: opts.model, effort: opts.effort, maxTokens: opts.maxTokens };
  const requests = validateRequests(opts.requests, run, { batch: false });
  const maxConsecutive = opts.maxConsecutiveErrors ?? DEFAULT_MAX_CONSECUTIVE_ERRORS;
  const { transport, secrets } = resolveTransport(opts);

  const now = opts.now ?? (() => new Date());
  const runId = opts.runId ?? mintRunId(now());
  const runDir = createRunDir(opts.recordsDir, runId);
  const ctx = openContext(
    { ...opts, now },
    {
      mode: 'interactive',
      runId,
      runDir,
      transport,
      secrets,
      prompts,
      rulingSet,
      cap,
      requestCount: requests.length,
    }
  );

  const counts = emptyCounts(requests.length);
  let totalPico = 0;
  let status = 'complete';
  let consecutive = 0;
  const failed = (err) => {
    counts.errored++;
    consecutive++;
    return STOP_STATUSES.has(err?.status) || consecutive >= maxConsecutive;
  };

  for (let i = 0; i < requests.length; i++) {
    const { key, body, inputTokensEstimate } = requests[i];
    const customId = mintCustomId(i);

    let inputTokens = inputTokensEstimate;
    let inputTokensSource = 'estimate';
    if (inputTokens === undefined) {
      try {
        inputTokens = (await transport.countTokens(body)).input_tokens;
        inputTokensSource = 'count_tokens';
        if (!Number.isSafeInteger(inputTokens) || inputTokens < 0) {
          throw new Error(`count_tokens returned ${JSON.stringify(inputTokens)}`);
        }
      } catch (err) {
        ctx.noteVersion();
        ctx.recordError(customId, key, 'count_tokens', describeApiError(err));
        if (failed(err)) {
          status = 'stopped-on-errors';
          break;
        }
        continue;
      }
      ctx.noteVersion();
    }

    const worstP = worstCasePico({
      model: opts.model,
      inputTokens,
      maxTokens: opts.maxTokens,
      cacheWrite: canWriteCache(body),
    });
    let reservation;
    try {
      reservation = reserve({
        ledgerPath: ctx.ledgerPath,
        runId,
        use: opts.use,
        usd: picoToUsd(worstP),
        cap,
        now,
      });
    } catch (err) {
      if (!(err instanceof CapExceededError)) throw err;
      ctx.recordError(customId, key, 'reserve', capError(err));
      status = 'stopped-at-cap';
      break;
    }

    ctx.recordRequest(customId, key, inputTokens, inputTokensSource, worstP, body);
    counts.sent++;
    counts.notSent--;
    let message;
    try {
      message = await transport.send(body);
    } catch (err) {
      ctx.noteVersion();
      if (typeof err?.status === 'number') {
        // The API answered with an error status: the call was not billed.
        releaseAll({ ledgerPath: ctx.ledgerPath, id: reservation.id, now });
      } else {
        // No status (connection reset, timeout): the request may have run and been billed,
        // so the cap assumes the worst case was spent.
        settleAndRelease({
          ledgerPath: ctx.ledgerPath,
          id: reservation.id,
          actualUsd: picoToUsd(worstP),
          now,
        });
        totalPico += worstP;
      }
      ctx.recordError(customId, key, 'send', describeApiError(err));
      if (failed(err)) {
        status = 'stopped-on-errors';
        break;
      }
      continue;
    }
    ctx.noteVersion();
    consecutive = 0;
    const { pico, outcome } = ctx.recordResponse(customId, key, message, { batch: false });
    const spentP = pico ?? worstP;
    settleAndRelease({
      ledgerPath: ctx.ledgerPath,
      id: reservation.id,
      actualUsd: picoToUsd(spentP),
      now,
    });
    totalPico += spentP;
    counts[outcome]++;
  }

  ctx.writeRunEnd(status, counts, totalPico, null);
  return { runId, runDir, status, counts, totalUsd: picoToUsd(totalPico) };
}

/**
 * Run requests as one Message Batch, or resume the unfinished batch a run directory records.
 * @param {object} opts as `runInteractive`, plus `sleep`, `pollIntervalMs`, `maxPolls`; on
 *   resume (`runId` naming an existing run directory) `requests` may be omitted, and if given
 *   must equal the recorded ones.
 * @returns {Promise<{ runId: string, runDir: string, status: string, counts?: object,
 *   totalUsd?: number, batchId?: string }>}
 */
export async function runBatch(opts) {
  const { prompts, rulingSet, cap } = validateRun(opts);
  const run = { model: opts.model, effort: opts.effort, maxTokens: opts.maxTokens };
  const resuming =
    opts.runId !== undefined && fs.existsSync(runDirFor(opts.recordsDir, opts.runId));
  const requests =
    !resuming || opts.requests !== undefined
      ? validateRequests(opts.requests, run, { batch: true })
      : null;
  const { transport, secrets } = resolveTransport(opts);
  const now = opts.now ?? (() => new Date());
  const base = { ...opts, now };

  if (resuming) return resumeBatch(base, { transport, secrets, prompts, rulingSet, cap, requests });

  const runId = opts.runId ?? mintRunId(now());
  const runDir = createRunDir(opts.recordsDir, runId);
  const ctx = openContext(base, {
    mode: 'batch',
    runId,
    runDir,
    transport,
    secrets,
    prompts,
    rulingSet,
    cap,
    requestCount: requests.length,
  });

  const plan = [];
  for (let i = 0; i < requests.length; i++) {
    const { key, body, inputTokensEstimate } = requests[i];
    const customId = mintCustomId(i);
    let inputTokens = inputTokensEstimate;
    let inputTokensSource = 'estimate';
    if (inputTokens === undefined) {
      try {
        inputTokens = (await transport.countTokens(body)).input_tokens;
        inputTokensSource = 'count_tokens';
        if (!Number.isSafeInteger(inputTokens) || inputTokens < 0) {
          throw new Error(`count_tokens returned ${JSON.stringify(inputTokens)}`);
        }
      } catch (err) {
        ctx.noteVersion();
        ctx.recordError(customId, key, 'count_tokens', describeApiError(err));
        const counts = emptyCounts(requests.length);
        counts.errored = 1;
        ctx.writeRunEnd('stopped-on-errors', counts, 0, null);
        return { runId, runDir, status: 'stopped-on-errors', counts, totalUsd: 0 };
      }
      ctx.noteVersion();
    }
    const worstP = worstCasePico({
      model: opts.model,
      inputTokens,
      maxTokens: opts.maxTokens,
      cacheWrite: canWriteCache(body),
      batch: true,
    });
    plan.push({ customId, key, body, inputTokens, inputTokensSource, worstP });
  }

  const worstTotalP = plan.reduce((s, p) => s + p.worstP, 0);
  let reservation;
  try {
    reservation = reserve({
      ledgerPath: ctx.ledgerPath,
      runId,
      use: opts.use,
      usd: picoToUsd(worstTotalP),
      cap,
      now,
    });
  } catch (err) {
    if (!(err instanceof CapExceededError)) throw err;
    ctx.recordError(null, null, 'reserve', capError(err));
    const counts = emptyCounts(requests.length);
    ctx.writeRunEnd('stopped-at-cap', counts, 0, null);
    return { runId, runDir, status: 'stopped-at-cap', counts, totalUsd: 0 };
  }

  for (const p of plan) {
    ctx.recordRequest(p.customId, p.key, p.inputTokens, p.inputTokensSource, p.worstP, p.body);
  }
  const batchRecord = {
    schema: 'ai-review-batch/1',
    state: 'submitting',
    reservationId: reservation.id,
    reservedUsd: picoToUsd(worstTotalP),
    batchId: null,
    submittedAt: null,
  };
  // Written BEFORE the submit: a crash between submit and the next write is the one state
  // in which resubmitting could double-spend, and resume refuses it on this marker.
  ctx.writer.writeJson(RECORD_FILES.batch, batchRecord);

  let created;
  try {
    created = await transport.submitBatch(
      plan.map((p) => ({ custom_id: p.customId, params: p.body }))
    );
  } catch (err) {
    ctx.noteVersion();
    ctx.recordError(null, null, 'submit', describeApiError(err));
    const status = err?.status;
    const definitive =
      typeof status === 'number' && status >= 400 && status < 500 && status !== 408;
    if (!definitive) {
      // Ambiguous (connection reset, timeout, 5xx): the batch may exist. Keep the
      // reservation open and the marker in place; resume refuses until a human checks.
      return { runId, runDir, status: 'submit-unknown' };
    }
    releaseAll({ ledgerPath: ctx.ledgerPath, id: reservation.id, now });
    ctx.writer.writeJson(RECORD_FILES.batch, { ...batchRecord, state: 'rejected' });
    const counts = emptyCounts(requests.length);
    ctx.writeRunEnd('submit-failed', counts, 0, null);
    return { runId, runDir, status: 'submit-failed', counts, totalUsd: 0 };
  }
  ctx.noteVersion();
  if (typeof created?.id !== 'string' || created.id === '') {
    throw new Error('harness: the batch submit returned no batch id; the reservation stays open');
  }
  ctx.writer.writeJson(RECORD_FILES.batch, {
    ...batchRecord,
    state: 'submitted',
    batchId: created.id,
    submittedAt: now().toISOString(),
    submitted: created,
  });
  return pollAndCollect(base, ctx, {
    runId,
    runDir,
    transport,
    batchId: created.id,
    reservationId: reservation.id,
  });
}

async function resumeBatch(opts, { transport, secrets, prompts, rulingSet, cap, requests }) {
  const runId = opts.runId;
  const runDir = openRunDir(opts.recordsDir, runId);
  const probe = createRecordWriter({ dir: runDir, secrets });
  if (probe.exists(RECORD_FILES.runEnd)) {
    throw new Error(`harness: run ${runId} is finished (run-end.json exists); nothing to resume`);
  }
  if (!probe.exists(RECORD_FILES.batch)) {
    throw new Error(`harness: run ${runId} records no batch; nothing to resume`);
  }
  const batch = probe.readJson(RECORD_FILES.batch);
  if (batch.state === 'submitting') {
    throw new Error(
      `harness: run ${runId}: a batch may have been submitted but no batch id was recorded. ` +
        'Check the Anthropic Console before anything else. Its reservation ' +
        `${batch.reservationId} stays open in the ledger until settled or released by hand.`
    );
  }
  if (batch.state !== 'submitted' || typeof batch.batchId !== 'string') {
    throw new Error(`harness: run ${runId}: batch.json is not a submitted batch; refusing`);
  }
  const recorded = probe.readJson(RECORD_FILES.run);
  const same =
    recorded.mode === 'batch' &&
    recorded.use === opts.use &&
    recorded.model === opts.model &&
    recorded.effort === opts.effort &&
    recorded.max_tokens === opts.maxTokens &&
    JSON.stringify(recorded.prompts) === JSON.stringify(prompts) &&
    JSON.stringify(recorded.rulingSet) === JSON.stringify(rulingSet);
  if (!same) {
    throw new Error(`harness: run ${runId}: the resume parameters differ from run.json; refusing`);
  }
  if (requests) {
    const lines = probe.readJsonl(RECORD_FILES.requests);
    const differ =
      lines.length !== requests.length ||
      lines.some(
        (l, i) =>
          l.key !== requests[i].key || JSON.stringify(l.body) !== JSON.stringify(requests[i].body)
      );
    if (differ) {
      throw new Error(
        `harness: run ${runId}: the requests differ from the recorded ones; refusing`
      );
    }
  }
  const ctx = openContext(opts, {
    mode: 'batch',
    runId,
    runDir,
    transport,
    secrets,
    prompts,
    rulingSet,
    cap,
    requestCount: recorded.requestCount,
    existingRun: recorded,
  });
  return pollAndCollect(opts, ctx, {
    runId,
    runDir,
    transport,
    batchId: batch.batchId,
    reservationId: batch.reservationId,
  });
}

async function pollAndCollect(opts, ctx, { runId, runDir, transport, batchId, reservationId }) {
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const interval = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxPolls = opts.maxPolls ?? Infinity;
  let polls = 0;
  for (;;) {
    const b = await transport.getBatch(batchId);
    ctx.noteVersion();
    polls++;
    if (b?.processing_status === 'ended') break;
    if (polls >= maxPolls) return { runId, runDir, status: 'pending', batchId };
    await sleep(interval);
  }

  const requestLines = ctx.writer.readJsonl(RECORD_FILES.requests);
  const byId = new Map(requestLines.map((l) => [l.custom_id, l]));
  // Results can be re-read; each is recorded once (a resumed run skips what is on disk).
  const done = new Set([
    ...ctx.writer.readJsonl(RECORD_FILES.responses).map((l) => l.custom_id),
    ...ctx.writer
      .readJsonl(RECORD_FILES.errors)
      .filter((l) => ['batch_result', 'unknown_custom_id', 'missing_result'].includes(l.stage))
      .map((l) => l.custom_id),
  ]);
  for await (const r of transport.batchResults(batchId)) {
    const customId = typeof r?.custom_id === 'string' ? r.custom_id : null;
    if (done.has(customId)) continue;
    done.add(customId);
    const line = byId.get(customId);
    if (!line) {
      ctx.recordError(customId, null, 'unknown_custom_id', {
        name: 'BatchResult',
        status: null,
        type: r?.result?.type ?? null,
        message: 'a result for a custom_id this run never sent',
        requestId: null,
      });
      continue;
    }
    if (r?.result?.type === 'succeeded') {
      ctx.recordResponse(customId, line.key, r.result.message, { batch: true });
    } else {
      const inner = r?.result?.error?.error ?? r?.result?.error ?? null;
      ctx.recordError(customId, line.key, 'batch_result', {
        name: 'BatchResult',
        status: null,
        type: r?.result?.type ?? null,
        message:
          [inner?.type, inner?.message].filter((x) => typeof x === 'string').join(': ') || null,
        requestId: null,
      });
    }
  }
  for (const l of requestLines) {
    if (!done.has(l.custom_id)) {
      ctx.recordError(l.custom_id, l.key, 'missing_result', {
        name: 'BatchResult',
        status: null,
        type: null,
        message: 'the ended batch returned no result for this custom_id',
        requestId: null,
      });
    }
  }

  const responses = ctx.writer.readJsonl(RECORD_FILES.responses);
  const errors = ctx.writer.readJsonl(RECORD_FILES.errors);
  let actualP = 0;
  for (const resp of responses) {
    actualP +=
      resp.costUsd === null
        ? usdToPico(byId.get(resp.custom_id).worstCaseUsd)
        : usdToPico(resp.costUsd);
  }
  const state = reservationState(ctx.ledgerPath, reservationId);
  if (!state) {
    throw new Error(
      `harness: reservation ${reservationId} is not in the ledger; refusing to settle`
    );
  }
  if (!state.settled) {
    settleAndRelease({
      ledgerPath: ctx.ledgerPath,
      id: reservationId,
      actualUsd: picoToUsd(actualP),
      now: ctx.now,
    });
  }
  const counts = {
    planned: requestLines.length,
    sent: requestLines.length,
    succeeded: responses.filter((l) => l.outcome === 'succeeded').length,
    refusal: responses.filter((l) => l.outcome === 'refusal').length,
    errored: errors.filter((l) => l.stage === 'batch_result' || l.stage === 'missing_result')
      .length,
    notSent: 0,
  };
  ctx.writeRunEnd('complete', counts, actualP, batchId);
  return { runId, runDir, status: 'complete', counts, totalUsd: picoToUsd(actualP), batchId };
}
