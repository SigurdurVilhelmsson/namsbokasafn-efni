/**
 * Tests for greynirEngine — the Node client for the GreynirCorrect sidecar.
 * The Python sidecar itself isn't exercised here; we test the adapter against a
 * mocked transport so mapping + graceful-degradation are covered.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const greynir = require('../services/greynirEngine');
const qa = require('../services/qaCheckService');

const sampleCorrection = {
  start: 3,
  end: 4,
  original: 'sþrúturu',
  suggestions: ['sterkur'],
  code: 'S001',
  message: 'Stafsetning',
};

describe('greynirEngine.toFinding', () => {
  it('maps a spelling code (S*) to a spelling finding', () => {
    const f = greynir.toFinding(sampleCorrection);
    expect(f.type).toBe('spelling');
    expect(f.word).toBe('sþrúturu');
    expect(f.suggestions).toEqual(['sterkur']);
    expect(f.span).toEqual([3, 4]);
  });

  it('defaults non-spelling codes to grammar and synthesizes a message', () => {
    const f = greynir.toFinding({ original: 'orð', suggestions: ['orðið'], code: 'P_NT' });
    expect(f.type).toBe('grammar');
    expect(f.message).toContain('orðið');
  });
});

describe('greynirEngine.isEnabled', () => {
  it('is enabled with a url, disabled without one', () => {
    expect(greynir.isEnabled({ url: 'http://x' })).toBe(true);
    expect(greynir.isEnabled({ url: '' })).toBe(false);
  });
});

describe('greynirEngine.check', () => {
  it('returns [] when disabled (no url and no transport)', async () => {
    await expect(greynir.check('einhver texti', { url: undefined })).resolves.toEqual([]);
  });

  it('maps sidecar corrections via an injected transport', async () => {
    const transport = async () => [sampleCorrection];
    const findings = await greynir.check('texti', { transport });
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('spelling');
  });

  it('never throws — a transport error degrades to []', async () => {
    const transport = async () => {
      throw new Error('sidecar down');
    };
    await expect(greynir.check('texti', { transport })).resolves.toEqual([]);
  });

  it('returns [] for empty text', async () => {
    const transport = async () => [sampleCorrection];
    await expect(greynir.check('', { transport })).resolves.toEqual([]);
  });
});

describe('qaCheckService.runChecksAsync with an async engine', () => {
  it('awaits the spell engine and merges its findings with engine-free checks', async () => {
    const spellEngine = async () => [{ type: 'grammar', word: 'x', suggestions: ['y'] }];
    const findings = await qa.runChecksAsync('The value 5.', 'Gildið 5 this is the value', {
      spellEngine,
    });
    const types = findings.map((f) => f.type);
    expect(types).toContain('grammar'); // from the engine
    expect(types).toContain('en-residue'); // engine-free, still runs
  });

  it('degrades to engine-free findings when the async engine throws', async () => {
    const spellEngine = async () => {
      throw new Error('boom');
    };
    const findings = await qa.runChecksAsync('5 and 7', 'bara 5', { spellEngine });
    // number-mismatch (7 missing) still reported; no throw
    expect(findings.some((f) => f.type === 'number-mismatch')).toBe(true);
  });
});
