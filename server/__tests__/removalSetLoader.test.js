/**
 * The removal-set loader — how a frozen, reviewed evidence file becomes an applied fix.
 *
 * 🔴 WHY IT MATTERS. §C119 reviewed 543 headwords, adversarially re-judged them, and froze
 * 127 as harmful in a committed TSV. Nothing could apply that file: the removal script
 * carried a different, hand-maintained list. **A reviewed set with no applier is evidence
 * that never becomes a fix** — and 85 of those 127 were still in chemistry's glossary when
 * the loop was about to spend money translating chemistry against it.
 *
 * ⚠️ NO DATABASE HERE, deliberately. The concept model lives on production; this box has no
 * `concept_term` table at all. What is testable without one is the DECISION — which rows the
 * file names — and that is what this pins.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { loadRemovalSet } = require('../scripts/remove-wrong-sense-headwords.js');

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

function tsv(body) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rmset-')), 'set.tsv');
  fs.writeFileSync(p, body);
  return p;
}

describe('loadRemovalSet', () => {
  it('reads english and domain from a tab-separated set', () => {
    const p = tsv('english\ticelandic\tdomain\tharm_class\nSI\teiningakerfi\tphysics\tsymbol\n');
    expect(loadRemovalSet(p)).toEqual([{ english: 'SI', domain: 'physics' }]);
  });

  it('refuses a file with no domain column', () => {
    // A headword is only ever wrong IN A DOMAIN — `molar` is wrong from biology and right
    // in chemistry — so a set without the column would delete the correct row somewhere.
    const p = tsv('english\ticelandic\nSI\teiningakerfi\n');
    expect(() => loadRemovalSet(p)).toThrow(/domain/);
  });

  it('refuses a blank cell rather than matching the empty string', () => {
    // '' selects nothing in the DB and reads as "already absent" — a silent no-op that
    // looks like an idempotent re-run.
    const p = tsv('english\tdomain\nSI\t\n');
    expect(() => loadRemovalSet(p)).toThrow(/blank/);
  });

  it('refuses an empty set rather than running vacuously', () => {
    expect(() => loadRemovalSet(tsv('english\tdomain\n'))).toThrow(/no rows/);
  });
});

describe('the committed removal sets', () => {
  it('loads §C119’s frozen organic set', () => {
    const set = loadRemovalSet(
      path.join(repoRoot, 'test-results', 'c119-organic-glossary-removal-set-2026-09-04.tsv')
    );
    expect(set).toHaveLength(127);
    expect(set.every((r) => r.english && r.domain)).toBe(true);
  });

  it('loads the chemistry set, and it carries the ruled symbol pair', () => {
    // [USER] 2026-09-05: a chemical symbol keeps its symbol. `SI` (the unit system) came
    // through §C119's review; `Si` (silicon) is its case-partner and was never listed.
    const set = loadRemovalSet(
      path.join(repoRoot, 'test-results', 'c120-chemistry-glossary-removal-set-2026-09-05.tsv')
    );
    expect(set).toHaveLength(86);
    const words = set.map((r) => r.english);
    expect(words).toContain('SI');
    expect(words).toContain('Si');
    // CONTROL: plus/minus are deliberately NOT in this set — the removal script's own
    // header records a prior decision to keep them, and that conflict is the user's to
    // settle, not this file's. If they are ever added, this assertion is the reminder
    // that a documented decision was reversed.
    expect(words).not.toContain('plus');
    expect(words).not.toContain('minus');
  });
});
