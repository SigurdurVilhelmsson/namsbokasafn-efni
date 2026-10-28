/**
 * How express-rate-limit counts clients, through ip-address: the path a bump of either changes.
 *
 * index.js builds its limiters with no keyGenerator and no ipv6Subnet, so production uses the
 * library's default key: an IPv6 client is counted by its /56 subnet, and an IPv4-mapped address
 * (::ffff:a.b.c.d) as the IPv4 address it carries. ip-address does both, and no other test
 * asserts either. The e2e suite requests http://localhost:3456: on the dev box localhost is
 * 127.0.0.1, which takes neither path; how a CI runner resolves it was not checked, and were it
 * ::1, e2e would pass through the /56 path without checking what it produced.
 *
 * A real socket, behind `trust proxy` 1 as in index.js, so the client address comes from
 * X-Forwarded-For as nginx sets it. The limit is 2 per window, so a shared count shows as a 429
 * on a client's third request. The control: three IPv4 clients are counted apart, so a limiter
 * that lumped every client together could not pass.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let server;
let base;

beforeAll(async () => {
  const express = require('express');
  const { rateLimit } = require('express-rate-limit');
  const app = express();
  app.set('trust proxy', 1);
  // A fresh limiter per test file, with index.js's defaults for keying: no keyGenerator.
  app.use(rateLimit({ windowMs: 60_000, limit: 2, standardHeaders: true, legacyHeaders: false }));
  app.get('/', (req, res) => res.json({ ip: req.ip }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

/** The statuses of one request from each address, in order. */
async function statuses(...addresses) {
  const out = [];
  for (const a of addresses) {
    out.push((await fetch(base, { headers: { 'X-Forwarded-For': a } })).status);
  }
  return out;
}

describe('express-rate-limit with its default key, as index.js uses it', () => {
  it("index.js passes neither keyGenerator nor ipv6Subnet, so these cases are production's", () => {
    const source = readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    expect([/keyGenerator/.test(source), /ipv6Subnet/.test(source)]).toEqual([false, false]);
  });

  it('counts three IPv4 clients apart (the control)', async () => {
    expect(await statuses('192.0.2.1', '192.0.2.1', '192.0.2.2', '192.0.2.3')).toEqual([
      200, 200, 200, 200,
    ]);
  });

  it('counts IPv6 clients in one /56 together, and the next /56 apart', async () => {
    // 2001:db8:aa:bb00::/56 holds the first three; 2001:db8:aa:cc00:: is outside it.
    expect(
      await statuses(
        '2001:db8:aa:bb00::1',
        '2001:db8:aa:bbff:1234::9',
        '2001:db8:aa:bb12::7',
        '2001:db8:aa:cc00::1'
      )
    ).toEqual([200, 200, 429, 200]);
  });

  it('counts an IPv4-mapped IPv6 address as the IPv4 address it carries', async () => {
    expect(await statuses('198.51.100.7', '::ffff:198.51.100.7', '198.51.100.7')).toEqual([
      200, 200, 429,
    ]);
  });
});
