import { describe, it, expect } from 'vitest';
import { resolveEmbeds, classifyKind } from '../lib/embed-resolve.js';

function fakeFetch(map) {
  return async (url) => {
    const entry = map[url];
    if (!entry) throw new Error(`network error: ${url}`);
    return {
      url: entry.finalUrl,
      status: entry.status ?? 200,
      headers: { get: (h) => entry.headers?.[h.toLowerCase()] ?? null },
    };
  };
}

describe('classifyKind', () => {
  it('classifies youtube embed URLs', () => {
    expect(classifyKind('https://www.youtube.com/embed/abc')).toBe('youtube');
  });
  it('classifies phet URLs', () => {
    expect(classifyKind('https://phet.colorado.edu/sims/html/x_en.html')).toBe('phet');
  });
  it('classifies anything else as other', () => {
    expect(classifyKind('https://example.org/thing')).toBe('other');
  });
});

describe('resolveEmbeds', () => {
  it('resolves a /l/ redirect to its final framable URL', async () => {
    const fetchFn = fakeFetch({
      'https://www.openstax.org/l/diet_detective': {
        finalUrl: 'https://www.youtube.com/embed/xyz',
        headers: {},
      },
    });
    const out = await resolveEmbeds(['https://www.openstax.org/l/diet_detective'], fetchFn);
    expect(out['https://www.openstax.org/l/diet_detective']).toEqual({
      resolved: 'https://www.youtube.com/embed/xyz',
      kind: 'youtube',
      status: 'ok',
    });
  });

  it('marks a target that denies framing as blocked', async () => {
    const fetchFn = fakeFetch({
      'https://www.openstax.org/l/locked': {
        finalUrl: 'https://locked.example/page',
        headers: { 'x-frame-options': 'DENY' },
      },
    });
    const out = await resolveEmbeds(['https://www.openstax.org/l/locked'], fetchFn);
    expect(out['https://www.openstax.org/l/locked'].status).toBe('blocked');
  });

  it('marks a network failure as error, not ok', async () => {
    const fetchFn = fakeFetch({});
    const out = await resolveEmbeds(['https://www.openstax.org/l/missing'], fetchFn);
    expect(out['https://www.openstax.org/l/missing'].status).toBe('error');
  });
});
