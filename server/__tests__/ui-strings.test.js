/**
 * UI String Key Validation
 *
 * Ensures every UI.x.y reference in the editor JS files has a matching
 * key defined in ui-strings.js. A missing key = silent `undefined` at runtime.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicJs = join(__dirname, '..', 'public', 'js');

/**
 * Parse ui-strings.js to extract all defined keys as dot-paths.
 * Evaluates the file in a sandboxed scope to get the actual UI object.
 */
function getDefinedKeys() {
  const source = readFileSync(join(publicJs, 'ui-strings.js'), 'utf-8');

  // Execute in a Function scope to capture the UI object
  const fn = new Function(`${source}; return UI;`);
  const UI = fn();

  const keys = new Set();

  function walk(obj, prefix) {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        walk(value, path);
      } else {
        keys.add(path);
      }
    }
  }

  walk(UI, '');
  return keys;
}

/**
 * Extract all UI.x.y (and UI.x.y.z for nested like pairNames) references from a JS file.
 */
function getReferencedKeys(filename) {
  const source = readFileSync(join(publicJs, filename), 'utf-8');
  const refs = new Set();

  // Match UI.word.word and UI.word.word.word patterns
  const pattern = /UI\.(\w+\.\w+(?:\.\w+)?)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    refs.add(match[1]);
  }

  // A section alias, `const T = UI.bookGlossary;`: each `T.key` is the key `bookGlossary.key`.
  // book-glossary.js reads every string this way, so without this its keys go unchecked.
  for (const [, alias, section] of source.matchAll(
    /\b(?:const|let|var)\s+(\w+)\s*=\s*UI\.(\w+);/g
  )) {
    for (const [, key] of source.matchAll(new RegExp(`(?<![\\w.$])${alias}\\.(\\w+)`, 'g'))) {
      refs.add(`${section}.${key}`);
    }
  }

  return refs;
}

describe('UI string key validation', () => {
  const definedKeys = getDefinedKeys();

  it('ui-strings.js defines at least 50 keys', () => {
    expect(definedKeys.size).toBeGreaterThan(50);
  });

  for (const file of ['segment-editor.js', 'localization-editor.js', 'book-glossary.js']) {
    it(`all UI.* references in ${file} have matching definitions`, () => {
      const refs = getReferencedKeys(file);
      const missing = [];

      for (const ref of refs) {
        if (!definedKeys.has(ref)) {
          missing.push(`UI.${ref}`);
        }
      }

      expect(missing).toEqual([]);
    });

    it(`${file} references at least 30 UI keys`, () => {
      const refs = getReferencedKeys(file);
      expect(refs.size).toBeGreaterThan(30);
    });
  }
});

describe('propagateResult (SR-OOS-2 FIX6c)', () => {
  const source = readFileSync(join(publicJs, 'ui-strings.js'), 'utf-8');
  const UI = new Function(`${source}; return UI;`)();

  it('no skips: just the created count, no parenthetical', () => {
    expect(UI.segmentEditor.propagateResult(3, 0, 0)).toBe('Fjölgað á 3 stað/staði');
  });

  it('structure_blocked skips get an explicit label, not the generic bucket', () => {
    const msg = UI.segmentEditor.propagateResult(1, 2, 2);
    expect(msg).toContain('byggingarmerki hindra');
    expect(msg).not.toContain('þegar breytt');
  });

  it('mixed skip reasons: both labels appear, generic bucket only for the non-structural remainder', () => {
    const msg = UI.segmentEditor.propagateResult(1, 3, 1);
    expect(msg).toContain('1 vegna þess að byggingarmerki hindra');
    expect(msg).toContain('2 þegar breytt');
  });

  it('all-non-structural skips: only the generic bucket appears', () => {
    const msg = UI.segmentEditor.propagateResult(1, 2, 0);
    expect(msg).toContain('2 þegar breytt');
    expect(msg).not.toContain('byggingarmerki hindra');
  });

  it('G1.13: not-your-chapter skips are named, not counted as already changed', () => {
    const msg = UI.segmentEditor.propagateResult(1, 2, 0, 2, 0);
    expect(msg).toContain('2 í köflum sem þú ritstýrir ekki');
    expect(msg).not.toContain('þegar breytt');
  });

  it('G1.13: chapter-not-editable skips get their own phrase', () => {
    const msg = UI.segmentEditor.propagateResult(1, 1, 0, 0, 1);
    expect(msg).toContain('1 í kafla sem ekki er hægt að ritstýra');
    expect(msg).not.toContain('þegar breytt');
  });

  it('G1.13: scope skips mixed with other reasons leave only the remainder as already changed', () => {
    const msg = UI.segmentEditor.propagateResult(1, 5, 1, 2, 1);
    expect(msg).toContain('1 þegar breytt');
  });

  it('G1.13: with no eligible target, the scoped none-message does not say the text occurs nowhere', () => {
    const msg = UI.segmentEditor.propagateNoneScoped(3, 0);
    expect(msg).toContain('3 í köflum sem þú ritstýrir ekki');
    expect(msg).not.toContain('hvergi');
  });

  it('G1.13: a count of 1 not-your-chapter skip reads "í kafla", 2 reads "í köflum"', () => {
    expect(UI.segmentEditor.propagateResult(1, 1, 0, 1, 0)).toContain(
      '1 í kafla sem þú ritstýrir ekki'
    );
    expect(UI.segmentEditor.propagateResult(1, 2, 0, 2, 0)).toContain(
      '2 í köflum sem þú ritstýrir ekki'
    );
  });

  it('G1.13: a count of 1 chapter-not-editable skip reads "í kafla", 2 reads "í köflum"', () => {
    expect(UI.segmentEditor.propagateResult(1, 1, 0, 0, 1)).toContain(
      '1 í kafla sem ekki er hægt að ritstýra'
    );
    expect(UI.segmentEditor.propagateResult(1, 2, 0, 0, 2)).toContain(
      '2 í köflum sem ekki er hægt að ritstýra'
    );
  });

  it('G1.13: the scoped none-message is singular for 1 and plural for 2, for both phrases', () => {
    expect(UI.segmentEditor.propagateNoneScoped(1, 0)).toContain('1 í kafla sem þú ritstýrir ekki');
    expect(UI.segmentEditor.propagateNoneScoped(2, 0)).toContain(
      '2 í köflum sem þú ritstýrir ekki'
    );
    expect(UI.segmentEditor.propagateNoneScoped(0, 1)).toContain(
      '1 í kafla sem ekki er hægt að ritstýra'
    );
    expect(UI.segmentEditor.propagateNoneScoped(0, 2)).toContain(
      '2 í köflum sem ekki er hægt að ritstýra'
    );
  });

  it('G1.13: the editor routes scope skips into both messages', () => {
    const js = readFileSync(join(publicJs, 'segment-editor.js'), 'utf-8');
    expect(js).toMatch(/propagateNoneScoped\(scope\.notYours, scope\.notEditable\)/);
    expect(js).toMatch(/structureBlockedCount,\s*applyScope\.notYours,\s*applyScope\.notEditable/);
  });
});

describe('refused-save strings (G1.1 §5.18; index decisions 12–13)', () => {
  const source = readFileSync(join(publicJs, 'ui-strings.js'), 'utf-8');
  const UI = new Function(`${source}; return UI;`)();

  it('BASE_MISSING tells the editor to reload the page with F5', () => {
    expect(UI.refusal.baseMissing).toContain('F5');
  });

  it('every notice and the kept-text line are non-empty Icelandic strings', () => {
    for (const v of [UI.refusal.textKept, UI.refusal.generic, ...Object.values(UI.draftNotice)]) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(10);
    }
  });
});

describe('OPENING_UNRECORDED string (G1.1 + G1.2 PR2; PR2 plan decision 28)', () => {
  const source = readFileSync(join(publicJs, 'ui-strings.js'), 'utf-8');
  const UI = new Function(`${source}; return UI;`)();

  it('carries the Icelandic text [USER] approved on 2026-11-04, byte for byte', () => {
    // The E2E reads this key, so it compares the string with itself; this is the one place the
    // approved literal is pinned (PR2 review U38). A change to it goes back to [USER] first.
    expect(UI.segmentEditor.openingUnrecorded).toBe(
      'Ekki tókst að skrá opnun einingarinnar og því var hún ekki opnuð. Veljið hana aftur úr listanum.'
    );
    expect(UI.segmentEditor.openingUnrecorded.normalize('NFC')).toBe(
      UI.segmentEditor.openingUnrecorded
    );
  });
});

describe('the book glossary public notice (G1.15(b) spec §4.5; final review, Important 2)', () => {
  const source = readFileSync(join(publicJs, 'ui-strings.js'), 'utf-8');
  const T = new Function(`${source}; return UI;`)().bookGlossary;

  // The committed record writes every decision as aðalritstjóri (recordLabelFor), so the notice on the form where
  // a head editor decides must not say their name is published. The reason and source still are, so it keeps
  // saying so.
  it('says the record shows aðalritstjóri, not the editor’s name', () => {
    expect(T.publicNotice).toContain('„aðalritstjóri“ en ekki nafn þitt');
  });

  it('still says the reason and the source are public', () => {
    expect(T.publicNotice).toMatch(/^Ástæðan og heimildin birtast í opinberri skrá/);
  });
});
