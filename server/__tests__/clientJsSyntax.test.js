/**
 * Every browser script under public/js must PARSE.
 *
 * segment-editor.js is the most-edited hand-written file in the server and
 * NOTHING else in the suite parses it: the pin suites readFileSync it as text,
 * and it cannot be require()d (it touches window/document at load). So a
 * dropped backtick in one of its nested template literals ships with
 * `npm test` green — the project's authoritative gate — and then throws on
 * page load, leaving every segment row unrendered for editors.
 *
 * Campaign lesson, made enforceable: "node --check hand-edited client JS".
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const jsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'js');
const files = readdirSync(jsDir).filter((f) => f.endsWith('.js'));

describe('client JS syntax', () => {
  it('actually found the client scripts (guards against a vacuous loop)', () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files).toContain('segment-editor.js');
    expect(files).toContain('accept-eligibility.js');
  });

  for (const file of files) {
    it(`${file} parses`, () => {
      let error = null;
      try {
        execFileSync(process.execPath, ['--check', join(jsDir, file)], { stdio: 'pipe' });
      } catch (err) {
        error = String(err.stderr || err.message);
      }
      expect(error, `node --check failed:\n${error}`).toBe(null);
    });
  }
});
