/**
 * pricing.js — the price table the AI layer's cap is enforced against.
 *
 * Design: docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md, Unit D.
 *
 * An ENFORCEABLE VALUE with its source and date: the rates below are the claude-api
 * reference model table as cached on 2026-10-06. Pinned by
 * `tools/__tests__/ai-review-pricing.test.js`. **Invoices decide what is owed; this
 * table decides when a run stops.** An unknown model refuses rather than guessing.
 *
 * All arithmetic is done in integer pico-USD (1e-12 USD) per token, so per-call costs
 * and ledger sums never drift through float addition: every rate here, including the
 * cache multipliers and the batch half, is a whole number of pico-USD per token.
 */

export const PRICING = Object.freeze({
  source: 'claude-api skill reference, model table (USD per million tokens)',
  cachedOn: '2026-10-06',
  models: Object.freeze({
    'claude-opus-5-5': Object.freeze({
      inputUsdPerMTok: 4,
      outputUsdPerMTok: 20,
      cacheReadUsdPerMTok: 0.2,
    }),
  }),
  /** Cache writes bill at a multiple of the input rate, by TTL. */
  cacheWriteMultiplier: Object.freeze({ '5m': 1.25, '1h': 2 }),
  /** The Message Batches API halves every rate. */
  batchMultiplier: 0.5,
});

/**
 * Margin applied to an input-token count or estimate in a worst case: count_tokens is
 * documented as an estimate, so the reservation assumes up to 10% more. Applied as the
 * exact rational 11/10 so `ceil(100 × 1.1)` is 110, not 111.
 */
export const INPUT_ESTIMATE_MARGIN = 1.1;
const MARGIN_NUM = 11;
const MARGIN_DEN = 10;

const PICO_PER_USD = 1e12;
/** 1 USD per MTok = 1e12 pico-USD / 1e6 tokens = 1e6 pico-USD per token. */
const PICO_PER_TOKEN_PER_USD_PER_MTOK = 1e6;

/** @param {number} usd @returns {number} integer pico-USD */
export function usdToPico(usd) {
  if (typeof usd !== 'number' || !Number.isFinite(usd)) {
    throw new Error(`pricing: not a finite USD amount: ${String(usd)}`);
  }
  return Math.round(usd * PICO_PER_USD);
}

/** @param {number} pico integer pico-USD @returns {number} USD */
export function picoToUsd(pico) {
  return pico / PICO_PER_USD;
}

function toPicoRate(usdPerMTok, multiplier) {
  const rate = Math.round(usdPerMTok * multiplier * PICO_PER_TOKEN_PER_USD_PER_MTOK);
  if (!Number.isSafeInteger(rate) || rate < 0) {
    throw new Error(`pricing: rate not representable in pico-USD: ${usdPerMTok} × ${multiplier}`);
  }
  return rate;
}

/**
 * Per-token rates in integer pico-USD for a model.
 * @param {string} model
 * @param {{ batch?: boolean }} [opts]
 * @returns {{ input: number, output: number, cacheRead: number, cacheWrite5m: number, cacheWrite1h: number }}
 * @throws {Error} for a model the table does not price
 */
export function ratesFor(model, { batch = false } = {}) {
  const row = Object.hasOwn(PRICING.models, model) ? PRICING.models[model] : null;
  if (!row) {
    throw new Error(
      `pricing: unknown model ${JSON.stringify(model)} — add it to PRICING (with its source) first`
    );
  }
  const m = batch ? PRICING.batchMultiplier : 1;
  return {
    input: toPicoRate(row.inputUsdPerMTok, m),
    output: toPicoRate(row.outputUsdPerMTok, m),
    cacheRead: toPicoRate(row.cacheReadUsdPerMTok, m),
    cacheWrite5m: toPicoRate(row.inputUsdPerMTok, m * PRICING.cacheWriteMultiplier['5m']),
    cacheWrite1h: toPicoRate(row.inputUsdPerMTok, m * PRICING.cacheWriteMultiplier['1h']),
  };
}

/** A token count from an API usage object: null/undefined is 0, anything else must be a count. */
function tokenCount(value, field) {
  if (value === null || value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`pricing: usage.${field} is not a token count: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Cost of one response in integer pico-USD.
 *
 * `output_tokens` already includes thinking tokens, so `output_tokens_details` is never
 * added on top. Cache writes are split by TTL from `usage.cache_creation` when present;
 * any part of `cache_creation_input_tokens` the breakdown does not explain is priced at
 * the dearer 1-hour rate, so an unexplained total can only over-count.
 *
 * @param {{ model: string, usage: object, batch?: boolean }} args
 * @returns {number} integer pico-USD
 */
export function costPico({ model, usage, batch = false }) {
  const r = ratesFor(model, { batch });
  const u = usage ?? {};
  const input = tokenCount(u.input_tokens, 'input_tokens');
  const output = tokenCount(u.output_tokens, 'output_tokens');
  const cacheRead = tokenCount(u.cache_read_input_tokens, 'cache_read_input_tokens');
  const cacheTotal = tokenCount(u.cache_creation_input_tokens, 'cache_creation_input_tokens');
  const cc = u.cache_creation ?? {};
  const w5 = tokenCount(cc.ephemeral_5m_input_tokens, 'cache_creation.ephemeral_5m_input_tokens');
  const w1 = tokenCount(cc.ephemeral_1h_input_tokens, 'cache_creation.ephemeral_1h_input_tokens');
  const unexplained = Math.max(0, cacheTotal - w5 - w1);
  return (
    input * r.input +
    output * r.output +
    cacheRead * r.cacheRead +
    w5 * r.cacheWrite5m +
    (w1 + unexplained) * r.cacheWrite1h
  );
}

/**
 * Cost of one response in USD (see `costPico`).
 * @param {{ model: string, usage: object, batch?: boolean }} args
 * @returns {number}
 */
export function costUsd(args) {
  return picoToUsd(costPico(args));
}

/**
 * Worst-case cost of one request in integer pico-USD: the input (with the estimate
 * margin) at the input rate — or at the 1-hour cache-write rate when the body can write
 * the cache — plus `max_tokens` at the output rate (max_tokens bounds thinking too).
 *
 * @param {{ model: string, inputTokens: number, maxTokens: number, cacheWrite?: boolean, batch?: boolean }} args
 * @returns {number} integer pico-USD
 */
export function worstCasePico({
  model,
  inputTokens,
  maxTokens,
  cacheWrite = false,
  batch = false,
}) {
  for (const [name, v] of [
    ['inputTokens', inputTokens],
    ['maxTokens', maxTokens],
  ]) {
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
      throw new Error(`pricing: ${name} must be a non-negative integer, got ${JSON.stringify(v)}`);
    }
  }
  const r = ratesFor(model, { batch });
  const inputWithMargin = Math.ceil((inputTokens * MARGIN_NUM) / MARGIN_DEN);
  return inputWithMargin * (cacheWrite ? r.cacheWrite1h : r.input) + maxTokens * r.output;
}

/**
 * Worst-case cost of one request in USD (see `worstCasePico`).
 * @param {{ model: string, inputTokens: number, maxTokens: number, cacheWrite?: boolean, batch?: boolean }} args
 * @returns {number}
 */
export function worstCaseUsd(args) {
  return picoToUsd(worstCasePico(args));
}
