/**
 * Static source contracts for the client message-surfacing fixes (batch 2).
 *
 * There is no jsdom unit infra for the public/js IIFEs, so these pin the
 * source-level contracts the fixes introduced — the same mechanism as the
 * notifications.create( guard in crossBookAuthz.test.js. Behavior rides the
 * Playwright suite.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(require.resolve(p), 'utf8');

describe('saveRetry conflict message order (finding 24)', () => {
  const src = read('../public/js/saveRetry.js');

  it('reads data.message before data.error', () => {
    expect(src).toMatch(/data\.message\s*\|\|\s*data\.error/);
    expect(src).not.toMatch(/new Error\(data\.error \|\|/);
  });

  // Final-review wave (item 1a): a single-argument .then(onFulfilled)
  // chained into .catch(...) lets the .catch() intercept the *deliberate*
  // rejection crafted inside onFulfilled — a promise returned/thrown from a
  // .then() callback propagates to the next handler in the chain, which used
  // to be that .catch(), silently replacing the Icelandic conflict text
  // (data.message/data.error) with a generic 'Villa <status>'. The
  // two-argument form .then(onFulfilled, onRejected) fixes this: onRejected
  // only fires when response.json() itself fails to parse, never on a
  // rejection manufactured by onFulfilled. There's no JS parser available
  // here, so this pins the narrower but still-meaningful structural fact —
  // isolate the non-retryable block (from its comment marker to the next
  // top-level .catch, which is the *outer* catch of the surrounding
  // attempt() chain and therefore always present) and assert it calls
  // response.json().then( with two function arguments and contains no
  // .catch( of its own. Behavior itself rides manual QA/Playwright.
  it('non-retryable branch uses the two-argument .then() form, not .then().catch()', () => {
    const markerIdx = src.indexOf('// Non-retryable');
    expect(markerIdx).toBeGreaterThan(-1);
    const rest = src.slice(markerIdx);
    const outerCatchIdx = rest.indexOf('.catch(function (err) {');
    expect(outerCatchIdx).toBeGreaterThan(-1);
    const block = rest.slice(0, outerCatchIdx);

    // Two function arguments to response.json().then(...).
    expect(block).toMatch(/response\.json\(\)\.then\(\s*function[\s\S]*?,\s*function/);
    // No .catch( anywhere in the isolated block — the old buggy chain form.
    expect(block).not.toMatch(/\.catch\(/);
  });
});

describe('fetchJson exposes status + parsed body on thrown errors', () => {
  it('attaches err.status and err.data', () => {
    const src = read('../public/js/htmlUtils.js');
    expect(src).toMatch(/err\.status\s*=\s*res\.status/);
    expect(src).toMatch(/err\.data\s*=/);
  });
});

describe('pipeline confirmation handshake (finding 14)', () => {
  it('server: every requiresConfirmation 409 also carries error + message', () => {
    const src = read('../routes/pipeline.js');
    const blocks = src.split('requiresConfirmation: true').slice(1);
    expect(blocks.length).toBe(3);
    for (const b of blocks) {
      const head = b.slice(0, 400);
      expect(head).toMatch(/error:/);
      expect(head).toMatch(/message:/);
    }
  });

  it('client: runPipelineAction implements confirm-and-resend', () => {
    const src = read('../public/js/segment-editor.js');
    expect(src).toMatch(/requiresConfirmation/);
    expect(src).toMatch(/confirmed:\s*true/);
  });
});
