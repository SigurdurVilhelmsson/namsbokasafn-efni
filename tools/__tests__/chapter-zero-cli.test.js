import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Run a tool and capture stdout+stderr regardless of exit code. */
function run(tool, args) {
  try {
    return execFileSync('node', [path.join('tools', tool), ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    return `${err.stdout || ''}${err.stderr || ''}`;
  }
}

const TOOLS = ['cnxml-linguistic-check.js', 'cnxml-fidelity-check.js'];

describe('chapter 0 is accepted with --module (§C82 prerequisite 5)', () => {
  for (const tool of TOOLS) {
    it(`${tool} does not reject --chapter 0 --module`, () => {
      const out = run(tool, ['--book', 'efnafraedi-2e', '--chapter', '0', '--module', 'm68662']);
      expect(out).not.toContain('--module requires --chapter');
    });

    it(`${tool} still rejects --module with no --chapter`, () => {
      const out = run(tool, ['--book', 'efnafraedi-2e', '--module', 'm68662']);
      expect(out).toContain('--module requires --chapter');
    });

    it(`${tool} scopes to ch00 rather than the whole book`, () => {
      // The whole-book run names chapters other than ch00; the scoped run must not.
      const out = run(tool, ['--book', 'efnafraedi-2e', '--chapter', '0']);
      expect(out).not.toMatch(/\bch(0[1-9]|1\d|2\d)\b/);
    });
  }
});

describe('the two tools with a different shape (pre-flight amendment)', () => {
  it('cnxml-render-fidelity-check --chapter 0 scopes to one chapter, not the whole book', () => {
    // MEASURED BEFORE THE FIX: printed "ch0: … ch1: … ch2: … ch3: …" — the ternary
    // at :411 treated 0 as "no chapter given" and fell through to discoverChapters.
    const out = run('cnxml-render-fidelity-check.js', [
      '--book',
      'efnafraedi-2e',
      '--chapter',
      '0',
    ]);
    expect(out).toMatch(/\bch0\b/);
    expect(out).not.toMatch(/\bch[1-9]\b/);
  });

  it('cnxml-render-fidelity-check --chapter 1 still works (control)', () => {
    const out = run('cnxml-render-fidelity-check.js', [
      '--book',
      'efnafraedi-2e',
      '--chapter',
      '1',
    ]);
    expect(out).toMatch(/\bch1\b/);
    expect(out).not.toMatch(/\bch0\b/);
  });

  it('validate-chapter accepts chapter 0', () => {
    // MEASURED BEFORE THE FIX: "Error: Please provide book and chapter".
    const out = run('validate-chapter.js', ['efnafraedi-2e', '0']);
    expect(out).not.toContain('Please provide book and chapter');
  });

  it('validate-chapter still rejects a missing chapter (control)', () => {
    expect(run('validate-chapter.js', ['efnafraedi-2e'])).toContain(
      'Please provide book and chapter'
    );
  });

  it('validate-chapter still rejects an unparseable chapter (normalizeChapter -> null)', () => {
    expect(run('validate-chapter.js', ['efnafraedi-2e', 'banana'])).toContain(
      'Please provide book and chapter'
    );
  });

  it('validate-chapter still accepts appendices (normalizeChapter -> -1, control)', () => {
    expect(run('validate-chapter.js', ['efnafraedi-2e', 'appendices'])).not.toContain(
      'Please provide book and chapter'
    );
  });
});
