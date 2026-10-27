/**
 * ai-review-pricing.test.js — the price table the cap is enforced against (Unit D,
 * docs/superpowers/specs/2026-10-26-ai-layer-scaffolding-design.md).
 *
 * The rates are an ENFORCEABLE VALUE: this file pins them. Invoices decide what is
 * owed; this table decides when the run stops.
 */
import { describe, it, expect } from 'vitest';
import {
  PRICING,
  ratesFor,
  costUsd,
  worstCaseUsd,
  INPUT_ESTIMATE_MARGIN,
  usdToPico,
  picoToUsd,
} from '../ai-review/pricing.js';

const MODEL = 'claude-opus-5-5';
const M = 1_000_000;

describe('PRICING table', () => {
  it('names its source and the date it was cached', () => {
    expect(PRICING.source).toMatch(/claude-api/);
    expect(PRICING.cachedOn).toBe('2026-10-06');
  });

  it('pins claude-opus-5-5 at USD 4 / 20 per MTok, cache read USD 0.20', () => {
    expect(PRICING.models[MODEL]).toEqual({
      inputUsdPerMTok: 4,
      outputUsdPerMTok: 20,
      cacheReadUsdPerMTok: 0.2,
    });
  });

  it('pins the cache-write multipliers and the batch discount', () => {
    expect(PRICING.cacheWriteMultiplier).toEqual({ '5m': 1.25, '1h': 2 });
    expect(PRICING.batchMultiplier).toBe(0.5);
  });
});

describe('ratesFor', () => {
  it('refuses an unknown model (control: the known model resolves)', () => {
    expect(() => ratesFor(MODEL)).not.toThrow();
    expect(() => ratesFor('claude-sonnet-9-9')).toThrow(/unknown model/i);
  });
});

describe('costUsd', () => {
  it('prices input and output tokens', () => {
    expect(costUsd({ model: MODEL, usage: { input_tokens: M, output_tokens: M } })).toBe(24);
  });

  it('prices cache reads at USD 0.20 / MTok', () => {
    expect(
      costUsd({
        model: MODEL,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: M },
      })
    ).toBe(0.2);
  });

  it('prices 5-minute cache writes at 1.25 × input', () => {
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: M,
      cache_creation: { ephemeral_5m_input_tokens: M, ephemeral_1h_input_tokens: 0 },
    };
    expect(costUsd({ model: MODEL, usage })).toBe(5);
  });

  it('prices 1-hour cache writes at 2 × input', () => {
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: M,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: M },
    };
    expect(costUsd({ model: MODEL, usage })).toBe(8);
  });

  it('prices a cache-write total with no TTL breakdown at the dearer 1-hour rate', () => {
    const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: M };
    expect(costUsd({ model: MODEL, usage })).toBe(8);
  });

  it('bills thinking as output exactly once (output_tokens already includes it)', () => {
    const usage = {
      input_tokens: 0,
      output_tokens: 1000,
      output_tokens_details: { thinking_tokens: 800 },
    };
    expect(costUsd({ model: MODEL, usage })).toBe(0.02);
  });

  it('halves every rate under the Batch API', () => {
    const usage = {
      input_tokens: M,
      output_tokens: M,
      cache_read_input_tokens: M,
      cache_creation_input_tokens: 2 * M,
      cache_creation: { ephemeral_5m_input_tokens: M, ephemeral_1h_input_tokens: M },
    };
    const full = costUsd({ model: MODEL, usage });
    expect(full).toBe(4 + 20 + 0.2 + 5 + 8);
    expect(costUsd({ model: MODEL, usage, batch: true })).toBe(full / 2);
  });

  it('treats null usage fields as zero', () => {
    const usage = {
      input_tokens: 10,
      output_tokens: 0,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
      cache_creation: null,
    };
    expect(costUsd({ model: MODEL, usage })).toBe(0.00004);
  });

  it('refuses a negative or non-numeric token count', () => {
    expect(() =>
      costUsd({ model: MODEL, usage: { input_tokens: -1, output_tokens: 0 } })
    ).toThrow();
    expect(() =>
      costUsd({ model: MODEL, usage: { input_tokens: 'ten', output_tokens: 0 } })
    ).toThrow();
  });

  it('refuses an unknown model', () => {
    expect(() => costUsd({ model: 'gpt-x', usage: { input_tokens: 1, output_tokens: 1 } })).toThrow(
      /unknown model/i
    );
  });
});

describe('worstCaseUsd', () => {
  it('is (input × margin) at the input rate plus max_tokens at the output rate', () => {
    expect(INPUT_ESTIMATE_MARGIN).toBe(1.1);
    // ceil(1000 × 1.1) = 1100 input tokens × 4e-6 + 2000 × 20e-6
    expect(worstCaseUsd({ model: MODEL, inputTokens: 1000, maxTokens: 2000 })).toBeCloseTo(
      0.0444,
      12
    );
  });

  it('prices input at the 1-hour cache-write rate when the body can write the cache', () => {
    expect(
      worstCaseUsd({ model: MODEL, inputTokens: 1000, maxTokens: 2000, cacheWrite: true })
    ).toBeCloseTo(1100 * 8e-6 + 2000 * 20e-6, 12);
  });

  it('halves under the Batch API', () => {
    const full = worstCaseUsd({ model: MODEL, inputTokens: 1000, maxTokens: 2000 });
    expect(worstCaseUsd({ model: MODEL, inputTokens: 1000, maxTokens: 2000, batch: true })).toBe(
      full / 2
    );
  });

  it('refuses a missing token count', () => {
    expect(() => worstCaseUsd({ model: MODEL, maxTokens: 10 })).toThrow();
    expect(() => worstCaseUsd({ model: MODEL, inputTokens: 10 })).toThrow();
  });
});

describe('pico-USD conversion', () => {
  it('round-trips and sums without float drift', () => {
    let pico = 0;
    for (let i = 0; i < 1000; i++) pico += usdToPico(0.0001);
    expect(picoToUsd(pico)).toBe(0.1);
  });
});
