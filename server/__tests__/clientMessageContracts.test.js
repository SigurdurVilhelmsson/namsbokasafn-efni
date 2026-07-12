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
  it('reads data.message before data.error', () => {
    const src = read('../public/js/saveRetry.js');
    expect(src).toMatch(/data\.message\s*\|\|\s*data\.error/);
    expect(src).not.toMatch(/new Error\(data\.error \|\|/);
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
