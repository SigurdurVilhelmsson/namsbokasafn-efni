/**
 * Test-only preload (`node --import <this file>`): replaces the global `fetch` with an ECHO of the
 * Málstaður API, so a LIVE `api-translate` run can be driven end to end with no network and no
 * spend. Each translate request returns its own text, and each request's glossary is appended to
 * `$ECHO_FETCH_LOG` as one JSON line, so a test can read what the run put on the wire.
 *
 * FAILS CLOSED: a request to any other origin, or any endpoint not handled below, throws. A run
 * that reaches the network anyway still carries the tests' bogus API key.
 *
 * Shapes are the ones `tools/lib/malstadur-api.js` reads: `/v1/translate` → `{text, usage}`;
 * `/v1/translate/tasks` → `{taskId}`; a task poll → `{status, result: {text}, usage}`.
 */
import fs from 'node:fs';

const LOG = process.env.ECHO_FETCH_LOG;
if (!LOG) throw new Error('echo-malstadur-fetch: ECHO_FETCH_LOG is required');

const tasks = new Map();
let nextTask = 0;
const json = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

globalThis.fetch = async (url, options = {}) => {
  const u = new URL(String(url));
  if (u.origin !== 'https://api.malstadur.is') {
    throw new Error(`echo-malstadur-fetch: refused ${u.origin}`);
  }
  const method = options.method || 'GET';

  if (method === 'POST' && ['/v1/translate', '/v1/translate/tasks'].includes(u.pathname)) {
    const body = JSON.parse(options.body);
    const terms = body.glossaries?.[0]?.terms ?? [];
    fs.appendFileSync(LOG, JSON.stringify({ path: u.pathname, terms }) + '\n');
    const usage = { units: body.text.length, cost: 0 };
    if (u.pathname === '/v1/translate') return json({ text: body.text, usage });
    const taskId = `echo-${nextTask++}`;
    tasks.set(taskId, { text: body.text, usage });
    return json({ taskId });
  }

  const poll = method === 'GET' && u.pathname.match(/^\/v1\/translate\/tasks\/([^/]+)$/);
  if (poll && tasks.has(poll[1])) {
    const t = tasks.get(poll[1]);
    return json({ status: 'completed', result: { text: t.text }, usage: t.usage });
  }

  throw new Error(`echo-malstadur-fetch: unexpected ${method} ${u.pathname}`);
};
