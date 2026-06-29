import { describe, it, expect } from 'vitest';
import { resolveEmbeds, classifyKind, canonicalizeYouTube } from '../lib/embed-resolve.js';

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

describe('canonicalizeYouTube', () => {
  it('converts watch?v= to /embed/', () => {
    expect(canonicalizeYouTube('https://www.youtube.com/watch?v=ABC')).toBe(
      'https://www.youtube.com/embed/ABC'
    );
  });

  it('preserves list= param and drops tracking params (si=)', () => {
    expect(canonicalizeYouTube('https://www.youtube.com/watch?v=ABC&list=PL1&si=xyz')).toBe(
      'https://www.youtube.com/embed/ABC?list=PL1'
    );
  });

  it('converts youtu.be short URL to /embed/', () => {
    expect(canonicalizeYouTube('https://youtu.be/ABC')).toBe('https://www.youtube.com/embed/ABC');
  });

  it('returns already-embed URL without query params unchanged', () => {
    const url = 'https://www.youtube.com/embed/ABC';
    expect(canonicalizeYouTube(url)).toBe(url);
  });

  it('strips tracking params (si=) from already-embed URLs', () => {
    expect(canonicalizeYouTube('https://www.youtube.com/embed/ABC?si=xyz')).toBe(
      'https://www.youtube.com/embed/ABC'
    );
  });

  it('preserves list= but strips si= from already-embed URLs', () => {
    expect(canonicalizeYouTube('https://www.youtube.com/embed/ABC?list=PL1&si=xyz')).toBe(
      'https://www.youtube.com/embed/ABC?list=PL1'
    );
  });

  it('returns non-YouTube URLs unchanged', () => {
    const url = 'https://phet.colorado.edu/sims/html/x_en.html';
    expect(canonicalizeYouTube(url)).toBe(url);
  });
});

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

  it('marks a target that sends SAMEORIGIN as blocked', async () => {
    const fetchFn = fakeFetch({
      'https://www.openstax.org/l/sameorigin': {
        finalUrl: 'https://sameorigin.example/page',
        headers: { 'x-frame-options': 'SAMEORIGIN' },
      },
    });
    const out = await resolveEmbeds(['https://www.openstax.org/l/sameorigin'], fetchFn);
    expect(out['https://www.openstax.org/l/sameorigin'].status).toBe('blocked');
  });

  it('marks a 404 response as error, not blocked', async () => {
    const fetchFn = fakeFetch({
      'https://www.openstax.org/l/notfound': {
        finalUrl: 'https://notfound.example/page',
        status: 404,
        headers: {},
      },
    });
    const out = await resolveEmbeds(['https://www.openstax.org/l/notfound'], fetchFn);
    expect(out['https://www.openstax.org/l/notfound'].status).toBe('error');
  });

  it('marks a network failure as error, not ok', async () => {
    const fetchFn = fakeFetch({});
    const out = await resolveEmbeds(['https://www.openstax.org/l/missing'], fetchFn);
    expect(out['https://www.openstax.org/l/missing'].status).toBe('error');
  });

  it('canonicalizes watch?v= to embed URL and re-checks framability', async () => {
    // /l/foo resolves to a watch page that denies framing; embed URL is framable.
    const fetchFn = fakeFetch({
      'https://www.openstax.org/l/foo': {
        finalUrl: 'https://www.youtube.com/watch?v=ABC',
        headers: { 'x-frame-options': 'SAMEORIGIN' },
      },
      'https://www.youtube.com/embed/ABC': {
        finalUrl: 'https://www.youtube.com/embed/ABC',
        headers: {},
      },
    });
    const out = await resolveEmbeds(['https://www.openstax.org/l/foo'], fetchFn);
    expect(out['https://www.openstax.org/l/foo']).toEqual({
      resolved: 'https://www.youtube.com/embed/ABC',
      kind: 'youtube',
      status: 'ok',
    });
  });

  // Minor 1: tracking params stripped on early-return (direct /embed/ redirect target)
  it('strips ?si= tracking param when /l/ redirects directly to /embed/?si=', async () => {
    const fetchFn = fakeFetch({
      'https://www.openstax.org/l/foo': {
        finalUrl: 'https://www.youtube.com/embed/ABC?si=xyz',
        headers: {},
      },
    });
    const out = await resolveEmbeds(['https://www.openstax.org/l/foo'], fetchFn);
    expect(out['https://www.openstax.org/l/foo'].resolved).toBe(
      'https://www.youtube.com/embed/ABC'
    );
    expect(out['https://www.openstax.org/l/foo'].status).toBe('ok');
  });

  // Minor 2: error path preserves the best URL we computed, not ''
  it('preserves canonical embed URL in resolved when the embed re-fetch throws', async () => {
    // Initial fetch succeeds (resolves watch URL); re-fetch of /embed/ throws.
    const fetchFn = fakeFetch({
      'https://www.openstax.org/l/foo': {
        finalUrl: 'https://www.youtube.com/watch?v=ABC',
        headers: {},
      },
      // 'https://www.youtube.com/embed/ABC' missing → fakeFetch throws
    });
    const out = await resolveEmbeds(['https://www.openstax.org/l/foo'], fetchFn);
    expect(out['https://www.openstax.org/l/foo'].resolved).toBe(
      'https://www.youtube.com/embed/ABC'
    );
    expect(out['https://www.openstax.org/l/foo'].status).toBe('error');
  });

  it('preserves original src in resolved when the initial fetch throws', async () => {
    const fetchFn = fakeFetch({});
    const out = await resolveEmbeds(['https://www.openstax.org/l/missing'], fetchFn);
    expect(out['https://www.openstax.org/l/missing'].resolved).toBe(
      'https://www.openstax.org/l/missing'
    );
    expect(out['https://www.openstax.org/l/missing'].status).toBe('error');
  });
});
