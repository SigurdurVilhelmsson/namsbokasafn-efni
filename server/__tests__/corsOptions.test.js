// server/__tests__/corsOptions.test.js
//
// Skerfur plan G1.19: drop credentialed CORS for the reader's origins. The reader
// (namsbokasafn.is) is same-site with Ritstjóri (ritstjorn.namsbokasafn.is), so the Lax session
// cookie travels with a reader page's credentialed request, and `credentials: true` let that
// page read the reply: any script on a reader page could act as a signed-in editor.
//
// Driven through the real `cors` middleware, so a header the library would add is seen.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cors = require('cors');
const { corsOptions, allowedOrigins } = require('../lib/corsOptions');

function headersFor(origin, { method = 'GET', env = 'production' } = {}) {
  const headers = {};
  const req = {
    method,
    headers: {
      ...(origin ? { origin } : {}),
      ...(method === 'OPTIONS' ? { 'access-control-request-method': 'POST' } : {}),
    },
  };
  const res = {
    statusCode: 200,
    setHeader: (k, v) => {
      headers[k.toLowerCase()] = v;
    },
    getHeader: (k) => headers[k.toLowerCase()],
    end: () => {},
  };
  cors(corsOptions({ env, extra: '' }))(req, res, () => {});
  return headers;
}

describe('CORS for Ritstjóri', () => {
  it('does not let the reader make credentialed requests', () => {
    expect(
      headersFor('https://namsbokasafn.is')['access-control-allow-credentials']
    ).toBeUndefined();
  });

  it('does not let a reader subdomain make credentialed requests', () => {
    expect(
      headersFor('https://www.namsbokasafn.is')['access-control-allow-credentials']
    ).toBeUndefined();
  });

  it('answers a preflight without allowing credentials', () => {
    const h = headersFor('https://namsbokasafn.is', { method: 'OPTIONS' });
    expect(h['access-control-allow-credentials']).toBeUndefined();
  });

  it('still names the reader as an allowed origin', () => {
    expect(headersFor('https://namsbokasafn.is')['access-control-allow-origin']).toBe(
      'https://namsbokasafn.is'
    );
  });

  it('refuses an origin outside the reader', () => {
    expect(headersFor('https://example.org')['access-control-allow-origin']).toBeUndefined();
  });

  it('adds the local dev servers only outside production', () => {
    expect(allowedOrigins({ env: 'production', extra: '' })).not.toContain('http://localhost:5173');
  });

  it('adds the origins CORS_ORIGIN names', () => {
    expect(
      allowedOrigins({ env: 'production', extra: 'https://a.example, https://b.example' })
    ).toEqual(expect.arrayContaining(['https://a.example', 'https://b.example']));
  });
});
