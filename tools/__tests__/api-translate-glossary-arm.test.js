/**
 * A PAID api-translate run must name its glossary arm (2026-09-26 ruling, §C183 guards).
 *
 * 🔴 WHY. With no glossary flag the tool silently sent the WHOLE approved glossary
 * (filtered per chunk). That default contradicts two standing rulings — "glossary off
 * the MT wire" (2026-09-06) and "never hand-curate a subset; compute it, then audit it"
 * (2026-09-21) — and the arm is the one choice §C73 measured as able to make output
 * WORSE: a wrong row is obeyed on some occurrences and propagates into every compound.
 * A default that nobody chose is how a buy ships under an arm nobody decided on.
 * ▶ So a live run now refuses unless exactly one of `--no-glossary`,
 * `--glossary-only <list>` or `--full-glossary` is given. `--full-glossary` is the old
 * default, spelled out; it records the same `arm: 'glossary'` in provenance, so no
 * reader of the run record changes.
 *
 * ⚠️ A dry run is how a buy is sized (and the paid-MT hook deliberately stays silent on
 * it), so it does NOT refuse — but it must SAY that the live run would, or the rehearsal
 * passes and the real command fails, which is the opposite of what a rehearsal is for.
 *
 * ⚠️ SAFETY OF THE LIVE-RUN CASES. They run WITHOUT --dry-run. Each targets a module
 * whose committed MT already exists and passes no --force, so the work list is all
 * `skip` and nothing reaches the API even before the guard existed (the RED run). The
 * key is a non-empty bogus value: an EMPTY one is falsy, which makes the tool load the
 * real key from `.env`.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../api-translate.js');
const SCOPE = ['--book', 'efnafraedi-2e', '--chapter', 'appendices', '--module', 'm68865'];

function run(extra) {
  const r = spawnSync(process.execPath, [TOOL, ...SCOPE, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, MALSTADUR_API_KEY: 'test-bogus-key-never-sent' },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('a live run with no glossary arm is refused before any spend', () => {
  it('refuses when no arm flag is given', () => {
    const r = run([]);
    expect(r.code).toBe(2);
  });

  it('names the three arms in the refusal', () => {
    const r = run([]);
    expect(r.out).toMatch(/--no-glossary/);
    expect(r.out).toMatch(/--glossary-only/);
    expect(r.out).toMatch(/--full-glossary/);
  });

  it('never gets as far as the translate loop when refused', () => {
    expect(run([]).out).not.toMatch(/Translating \d+ module/);
  });

  it('proceeds with --no-glossary (positive control)', () => {
    const r = run(['--no-glossary']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Translating 0 module\(s\), skipping 1/);
  });

  it('proceeds with --full-glossary, the old default spelled out', () => {
    const r = run(['--full-glossary']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Translating 0 module\(s\), skipping 1/);
  });
});

describe('two arms at once are a contradiction', () => {
  it('refuses --no-glossary with --full-glossary', () => {
    const r = run(['--dry-run', '--no-glossary', '--full-glossary']);
    expect(r.code).toBe(1);
  });

  it('refuses --glossary-only with --full-glossary', () => {
    const r = run(['--dry-run', '--glossary-only', 'enthalpy', '--full-glossary']);
    expect(r.code).toBe(1);
  });
});

describe('--full-glossary fails CLOSED when there is no glossary to send', () => {
  // Adversarial review 2026-09-28: with no loadable glossary the run printed
  // "Glossary arm: glossary" and sent nothing, while provenance recorded "no-glossary".
  // --glossary-only already refuses a headword the glossary lacks; the full arm must not
  // be the one arm that silently degrades. orverufraedi has no glossary-unified.json.
  const noGlossaryBook = ['--book', 'orverufraedi', '--chapter', '1', '--dry-run'];
  const runBook = (extra) => {
    const r = spawnSync(process.execPath, [TOOL, ...noGlossaryBook, ...extra], {
      encoding: 'utf8',
      env: { ...process.env, MALSTADUR_API_KEY: 'test-bogus-key-never-sent' },
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };

  it('refuses --full-glossary on a book with no approved glossary', () => {
    const r = runBook(['--full-glossary']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/--full-glossary/);
  });

  it('still accepts --no-glossary on that book (control)', () => {
    expect(runBook(['--no-glossary']).code).toBe(0);
  });

  it('still accepts --full-glossary where a glossary exists (control)', () => {
    expect(run(['--dry-run', '--full-glossary']).code).toBe(0);
  });
});

describe('a dry run rehearses the arm decision', () => {
  it('does not refuse a dry run with no arm — a buy is sized this way', () => {
    expect(run(['--dry-run']).code).toBe(0);
  });

  it('says the live run would be refused when no arm is given', () => {
    expect(run(['--dry-run']).out).toMatch(/no glossary arm.*REFUSED/is);
  });

  it('prints the arm it would use when one is given', () => {
    expect(run(['--dry-run', '--no-glossary']).out).toMatch(/Glossary arm: no-glossary/);
  });
});
