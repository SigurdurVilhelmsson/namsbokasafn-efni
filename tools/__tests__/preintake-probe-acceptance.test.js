import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { probeDir } from '../preintake-probe.js';

function probe(slug) {
  const dir = path.join('books', slug, '01-source');
  const cfgPath = path.join('books', slug, 'book-config.json');
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) : null;
  return probeDir(dir, cfg);
}

describe('pre-intake probe reproduces the 5 in-repo books known gaps', () => {
  it('efnafraedi-2e: clean → GO', () => {
    const r = probe('efnafraedi-2e');
    expect(r.checks.osEmbed.status).toBe('ok');
    expect(r.checks.iframe.status).toBe('ok');
    expect(r.checks.glossary.status).toBe('ok');
    expect(r.verdict).toBe('GO');
  });

  it('lifraen-efnafraedi (organic): os-embed BLOCK + glossary WARN → NO-GO', () => {
    const r = probe('lifraen-efnafraedi');
    expect(r.checks.osEmbed.status).toBe('block');
    expect(r.checks.osEmbed.count).toBeGreaterThan(0);
    expect(r.checks.glossary.status).toBe('warn');
    expect(r.verdict).toBe('NO-GO');
  });

  it('edlisfraedi-2e (physics): iframe WARN', () => {
    expect(probe('edlisfraedi-2e').checks.iframe.status).toBe('warn');
  });

  it('liffraedi-2e (biology): iframe WARN, glossary ok', () => {
    const r = probe('liffraedi-2e');
    expect(r.checks.iframe.status).toBe('warn');
    expect(r.checks.glossary.status).toBe('ok');
  });

  it('orverufraedi (microbiology): glossary WARN, no iframe', () => {
    const r = probe('orverufraedi');
    expect(r.checks.glossary.status).toBe('warn');
    expect(r.checks.iframe.status).toBe('ok');
  });
});
