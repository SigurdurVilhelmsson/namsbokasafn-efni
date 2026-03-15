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

  return refs;
}

describe('UI string key validation', () => {
  const definedKeys = getDefinedKeys();

  it('ui-strings.js defines at least 50 keys', () => {
    expect(definedKeys.size).toBeGreaterThan(50);
  });

  for (const file of ['segment-editor.js', 'localization-editor.js']) {
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
