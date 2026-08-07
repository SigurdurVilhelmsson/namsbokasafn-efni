import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'idordabanki-raw-sample.json'), 'utf-8')
);

describe('idordabanki raw fetch shape', () => {
  it('names the collection it came from', () => {
    expect(raw.collection).toBe('GEIMVISINDI');
  });

  it('carries entries', () => {
    expect(raw.entries.length).toBeGreaterThan(0);
  });

  it('keeps every language the API returned, not just EN and IS', () => {
    const langs = new Set();
    for (const e of raw.entries) for (const w of e.words || []) langs.add(w.fklanguage);
    expect(langs.has('IS')).toBe(true);
    expect(langs.size).toBeGreaterThan(1);
  });

  it('keeps the per-word fields the transform depends on', () => {
    const w = raw.entries.flatMap((e) => e.words || [])[0];
    expect(w).toHaveProperty('fklanguage');
    expect(w).toHaveProperty('word');
  });

  it('keeps the entry id, which is the concept identity', () => {
    expect(raw.entries.every((e) => e.id !== undefined)).toBe(true);
  });

  it('contains at least one entry with NO English side — the case this task exists for', () => {
    // The brief's own `entries[:20]` recipe yields ZERO of these (GEIMVISINDI is
    // alphabetical), and all five other tests pass green on such a fixture — the
    // vacuous version was measured doing exactly that. This is the assertion that
    // makes a silent regeneration fail instead of passing.
    expect(raw.entries.some((e) => !(e.words || []).some((w) => w.fklanguage === 'EN'))).toBe(true);
  });
});
