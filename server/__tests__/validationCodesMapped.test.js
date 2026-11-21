/**
 * Every violation code validateStructure can emit has wording in BOTH editor panes. A pane looks a code up in
 * its own map and calls the entry, so a code with no entry throws in the pane instead of showing a message
 * (G1.11; spec docs/superpowers/specs/2026-11-21-c248-g111-toolbar-dialect-and-marker-gate-design.md §4.3).
 *
 * The codes are read from the two rule modules' source; the maps from each pane's validate function. The
 * control is that the scan finds an existing code (`math-missing`) on both sides.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const JS = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'js');
const read = (f) => fs.readFileSync(path.join(JS, f), 'utf8');

function emitted() {
  const src = read('segment-validation.js') + read('marker-integrity.js');
  return [...new Set([...src.matchAll(/code: '([a-z-]+)'/g)].map((m) => m[1]))].sort();
}

function mapped(file, startMarker, endMarker) {
  const src = read(file);
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start + 1);
  const body = src.slice(start, end);
  return new Set([...body.matchAll(/'([a-z-]+)':/g)].map((m) => m[1]));
}

const PANES = {
  'segment editor': mapped(
    'segment-editor.js',
    'function validateSegmentEdit(',
    'async function saveEdit('
  ),
  'localization editor': mapped(
    'localization-editor.js',
    'function edValidateSegmentEdit(',
    '\n  function '
  ),
};

describe('every emitted validation code is mapped in both panes', () => {
  const codes = emitted();

  it('control: the scan finds math-missing emitted and mapped', () => {
    expect([
      codes.includes('math-missing'),
      ...Object.values(PANES).map((m) => m.has('math-missing')),
    ]).toEqual([true, true, true]);
  });

  for (const [pane, keys] of Object.entries(PANES)) {
    it(`the ${pane} maps every code`, () => {
      expect(codes.filter((c) => !keys.has(c))).toEqual([]);
    });
  }
});
