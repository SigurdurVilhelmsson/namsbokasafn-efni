/**
 * The §C119 check must actually be CALLED by /api/health.
 *
 * A GATE NEVER CALLED IS A GATE THAT DOESN'T EXIST. The library and the
 * migration are both pinned elsewhere; without this, deleting the call site in
 * server/index.js leaves every one of those tests green while the alarm reaches
 * nobody — which is the exact shape of the failure it exists to catch.
 *
 * server/index.js calls app.listen() at module load, so it cannot be imported
 * here. Its text is the instrument, as it is for the sibling checks.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
/** Lines that are not commented out. */
const live = src.split('\n').filter((l) => !l.trim().startsWith('//'));

describe('/api/health wires the domain-priority check', () => {
  it('requires the health lib', () => {
    expect(live.some((l) => /require\('\.\/lib\/domainPriorityHealth'\)/.test(l))).toBe(true);
  });

  // BIND THE KEY TO THE CALL, and both halves of this were learned by mutation.
  // (1) `\b` after `priority`: without it, a mutant renaming the key to
  //     `checks.domain_priority_DISABLED` still matched — a prefix is not a match.
  // (2) `= readDomainPriorityHealth(`: the key appears TWICE in index.js, once
  //     for the real call and once in the catch-block fallback. Matching the key
  //     alone was satisfied by the ERROR HANDLER, so deleting the actual call
  //     left this green. Bind what distinguishes.
  it('assigns the checks.domain_priority key FROM the health call, not just anywhere', () => {
    expect(live.some((l) => /checks\.domain_priority\b\s*=\s*readDomainPriorityHealth\(/.test(l))).toBe(true);
  });

  it('passes an intrinsic projectRoot, never process.cwd() (the server runs with cwd=server/)', () => {
    const block = src.slice(src.indexOf('checks.domain_priority'));
    expect(block.slice(0, 400)).not.toMatch(/process\.cwd\(\)/);
  });

  it('the referenced lib exists on disk', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'lib', 'domainPriorityHealth.js'))).toBe(true);
  });
});
