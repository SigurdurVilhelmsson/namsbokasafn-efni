// server/__tests__/refuseCompressedBodies.test.js
//
// §C200: a compressed request body is refused before anything inflates it
// (Node2Shell, CVE-2026-111497, reached Node's Brotli decoder through Express
// 5's body parsers). Each case sends REAL compressed bytes over a real socket.
// The first test is the control: the same bytes through a default parser are
// decoded and read, so a 415 below is the guard's doing and not a payload
// that could never have parsed.
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { brotliCompressSync, deflateSync, gzipSync, zstdCompressSync } from 'node:zlib';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const express = require('express');
const { refuseCompressedBodies } = require('../middleware/refuseCompressedBodies');

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

// The guarded shape index.js uses, or a bare default parser for the control.
function makeApp({ guarded, guard = guarded }) {
  const app = express();
  const reached = { count: 0 };
  if (guard) app.use(refuseCompressedBodies);
  const inflate = guarded ? false : undefined;
  app.use(express.json(inflate === undefined ? {} : { inflate }));
  app.use(
    express.urlencoded(inflate === undefined ? { extended: true } : { extended: true, inflate })
  );
  app.post('/echo', (req, res) => {
    reached.count += 1;
    res.json({ body: req.body });
  });
  // body-parser's own refusal (inflate: false) arrives as an error with a status.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.type }));
  return { app, reached };
}

async function post(app, body, headers) {
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/echo',
        method: 'POST',
        headers: { ...headers, 'Content-Length': String(body.length) },
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(text) }));
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

const JSON_BODY = Buffer.from(JSON.stringify({ a: 1 }));
const JSON_TYPE = { 'Content-Type': 'application/json' };

describe('refuseCompressedBodies', () => {
  it('control: an unguarded default parser decodes the same Brotli bytes and reads them', async () => {
    const { app, reached } = makeApp({ guarded: false });
    const res = await post(app, brotliCompressSync(JSON_BODY), {
      ...JSON_TYPE,
      'Content-Encoding': 'br',
    });
    expect(res.status).toBe(200);
    expect(res.json.body).toEqual({ a: 1 });
    expect(reached.count).toBe(1);
  });

  // body-parser 2.4.0 (taken for two high advisories, PR #557) added zstd decoding, a new
  // decoder reachable from every request. This control shows the default parser now decodes it,
  // so the zstd refusals below are the guard's doing and not a coding the parser never knew.
  it('control: since body-parser 2.4.0 an unguarded default parser decodes zstd too', async () => {
    const { app, reached } = makeApp({ guarded: false });
    const res = await post(app, zstdCompressSync(JSON_BODY), {
      ...JSON_TYPE,
      'Content-Encoding': 'zstd',
    });
    expect([res.status, res.json.body, reached.count]).toEqual([200, { a: 1 }, 1]);
  });

  const compressed = [
    ['br', brotliCompressSync(JSON_BODY)],
    ['BR', brotliCompressSync(JSON_BODY)],
    ['gzip', gzipSync(JSON_BODY)],
    ['deflate', deflateSync(JSON_BODY)],
    ['zstd', zstdCompressSync(JSON_BODY)],
    ['gzip, br', brotliCompressSync(gzipSync(JSON_BODY))],
  ];
  for (const [encoding, body] of compressed) {
    it(`refuses Content-Encoding: ${encoding} with 415, and the route never runs`, async () => {
      const { app, reached } = makeApp({ guarded: true });
      const res = await post(app, body, { ...JSON_TYPE, 'Content-Encoding': encoding });
      expect(res.status).toBe(415);
      expect(res.json.message).toBe('Compressed request bodies are not accepted');
      expect(reached.count).toBe(0);
    });
  }

  it('refuses a compressed urlencoded body, and one for a route with its own parser', async () => {
    const { app, reached } = makeApp({ guarded: true });
    const form = await post(app, brotliCompressSync(Buffer.from('a=1')), {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Encoding': 'br',
    });
    // multer routes (books, terminology) parse multipart themselves; the guard
    // runs before every route, so it covers them too.
    const multipart = await post(app, brotliCompressSync(Buffer.from('--x--')), {
      'Content-Type': 'multipart/form-data; boundary=x',
      'Content-Encoding': 'br',
    });
    expect([form.status, multipart.status]).toEqual([415, 415]);
    expect(reached.count).toBe(0);
  });

  it('still reads an uncompressed body: no header, identity in any case, or an empty value', async () => {
    for (const encoding of [undefined, 'identity', 'Identity', '']) {
      const { app, reached } = makeApp({ guarded: true });
      const headers =
        encoding === undefined ? JSON_TYPE : { ...JSON_TYPE, 'Content-Encoding': encoding };
      const res = await post(app, JSON_BODY, headers);
      expect(res.status, `Content-Encoding: ${JSON.stringify(encoding)}`).toBe(200);
      expect(res.json.body).toEqual({ a: 1 });
      expect(reached.count).toBe(1);
    }
  });

  it('second layer: with the guard moved away, inflate: false still refuses without decoding', async () => {
    const { app, reached } = makeApp({ guarded: true, guard: false });
    const res = await post(app, brotliCompressSync(JSON_BODY), {
      ...JSON_TYPE,
      'Content-Encoding': 'br',
    });
    expect(res.status).toBe(415);
    expect(res.json.error).toBe('encoding.unsupported');
    expect(reached.count).toBe(0);
  });

  it('second layer: inflate: false refuses zstd too, without decoding', async () => {
    const { app, reached } = makeApp({ guarded: true, guard: false });
    const res = await post(app, zstdCompressSync(JSON_BODY), {
      ...JSON_TYPE,
      'Content-Encoding': 'zstd',
    });
    expect([res.status, res.json.error, reached.count]).toEqual([415, 'encoding.unsupported', 0]);
  });
});
