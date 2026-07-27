/**
 * loadGlossary must surface how many glossary entries it dropped, and a
 * dropped entry must never reach filterGlossaryForText (register C14).
 *
 * The second half is the one that rots: filterGlossaryForText calls
 * t.sourceWord.toLowerCase() (api-translate.js:759), which TypeErrors on a
 * null English side rather than 400ing. Task 1's guard fixes that
 * transitively — "transitively" is exactly the kind of claim that stops
 * being true when someone adds a second path, so it is asserted here
 * directly instead of assumed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadGlossary, filterGlossaryForText, glossaryStatusLine } from '../api-translate.js';
import { formatGlossary } from '../lib/malstadur-api.js';

let dir;

function writeGlossary(terms) {
  const g = path.join(dir, 'glossary');
  mkdirSync(g, { recursive: true });
  writeFileSync(path.join(g, 'glossary-unified.json'), JSON.stringify({ terms }));
  return g;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'c14-glossary-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('loadGlossary skip reporting', () => {
  it('reports the dropped entries through onSkipped', () => {
    const g = writeGlossary([
      { english: 'water', icelandic: 'vatn', status: 'approved' },
      { english: 'ether', icelandic: '', status: 'approved' },
    ]);
    let dropped = null;
    const glossary = loadGlossary(g, 'chemistry', { onSkipped: (d) => (dropped = d) });
    expect(glossary.terms).toHaveLength(1);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].english).toBe('ether');
  });

  it('does not call onSkipped when every term is well-formed', () => {
    const g = writeGlossary([{ english: 'water', icelandic: 'vatn', status: 'approved' }]);
    let called = false;
    loadGlossary(g, 'chemistry', { onSkipped: () => (called = true) });
    expect(called).toBe(false);
  });

  it('still works when called with the old two-argument signature', () => {
    // b1-glossary-probe.mjs and test-glossary-comparison.js call it this way.
    const g = writeGlossary([{ english: 'water', icelandic: 'vatn', status: 'approved' }]);
    const glossary = loadGlossary(g, 'chemistry');
    expect(glossary.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('returns null when every approved term was dropped as blank', () => {
    const g = writeGlossary([{ english: 'ether', icelandic: '   ', status: 'approved' }]);
    expect(loadGlossary(g, 'chemistry')).toBeNull();
  });

  it('PRESERVATION PIN: still reports the drops when EVERY approved term was malformed', () => {
    // Passes before the fix too — formatGlossary fires onSkipped internally
    // before loadGlossary reaches its empty-check. It is here so the
    // restructure that moved the caller's onSkipped outside the try cannot
    // silently lose the total-drop report while relocating that call site.
    const g = writeGlossary([
      { english: 'water', icelandic: '', status: 'approved' },
      { english: 'ether', icelandic: '   ', status: 'approved' },
    ]);
    let dropped = null;
    const glossary = loadGlossary(g, 'chemistry', { onSkipped: (d) => (dropped = d) });
    expect(glossary).toBeNull();
    expect(dropped).toHaveLength(2);
  });

  it('does not swallow a throwing onSkipped into a null glossary', () => {
    // onSkipped is caller-supplied and must not run inside the catch-all that
    // turns corrupt JSON into null, or the two failures become
    // indistinguishable.
    const g = writeGlossary([
      { english: 'water', icelandic: 'vatn', status: 'approved' },
      { english: 'ether', icelandic: '', status: 'approved' },
    ]);
    expect(() =>
      loadGlossary(g, 'chemistry', {
        onSkipped: () => {
          throw new Error('callback blew up');
        },
      })
    ).toThrow('callback blew up');
  });
});

describe('transitive safety: filterGlossaryForText never sees a blank side', () => {
  it('does not throw on a glossary built from a null-English term', () => {
    // Before the Task 1 guard this threw TypeError: Cannot read properties
    // of null (reading 'toLowerCase') at api-translate.js:759.
    const g = formatGlossary(
      [
        { english: null, icelandic: 'vatn', status: 'approved' },
        { english: 'water', icelandic: 'vatn', status: 'approved' },
      ],
      { approvedOnly: true }
    );
    expect(() => filterGlossaryForText(g, 'water is wet')).not.toThrow();
    expect(filterGlossaryForText(g, 'water is wet').terms).toHaveLength(1);
  });
});

describe('glossaryStatusLine', () => {
  it('names the drop count even when the glossary loaded as null (total-drop case)', () => {
    // The defect this fix exists for: an operator whose entire glossary is
    // corrupt must not see the same line as one who simply has no glossary.
    expect(glossaryStatusLine(null, 2)).toBe(
      'Glossary: none available (2 malformed skipped) (continuing without)'
    );
  });

  it('says nothing about drops when there were none', () => {
    expect(glossaryStatusLine(null, 0)).toBe('Glossary: none available (continuing without)');
  });

  it('reports count alongside the term total when the glossary loaded', () => {
    const g = { terms: [{ sourceWord: 'water', targetWord: 'vatn' }], domain: 'chemistry' };
    expect(glossaryStatusLine(g, 3)).toBe(
      'Glossary: 1 approved chemistry terms (3 malformed skipped)'
    );
  });

  it('omits the note entirely when a loaded glossary dropped nothing', () => {
    const g = { terms: [{ sourceWord: 'water', targetWord: 'vatn' }], domain: 'chemistry' };
    expect(glossaryStatusLine(g, 0)).toBe('Glossary: 1 approved chemistry terms');
  });
});
