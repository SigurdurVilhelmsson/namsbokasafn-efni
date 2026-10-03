import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

/**
 * Chemistry faithful retirement, Decision 1 (ruled YES 2026-10-03) — a
 * full-chapter render of a track whose `03-translated/<track>/chNN/` holds ZERO
 * modules of its own is REFUSED.
 *
 * 🔴 WHY. `git rm -r` leaves a directory on disk while it still holds a
 * gitignored file (a `*.cnxml.backup.*`). `findChapterModules` THROWS when the
 * directory is absent but returns `[]` when it exists and holds no `.cnxml`, and
 * `main()` then went on: the sweep emptied `05-publication/<track>/chapters/NN/`
 * and, for faithful, the rollups were rebuilt ENTIRELY from mt-preview CNXML
 * (the union at `allModuleSet`) and `rollups-complete` was rewritten — which
 * switches vefur's faithful overlay back on for a retired track.
 *
 * ▶ SCOPE: only a full-chapter render (no `--module`). *Vista + Birta* injects
 * ONE module and renders it with `--module`, building the rollups from the union
 * of that module and the mt-preview fallback; the chapter publish injects the
 * whole chapter first. Both have >= 1 own module, so both are CONTROLS here.
 *
 * Fixture idiom from `pipeline-integration.test.js`: the CLI runs with its cwd
 * in a temp root so its cwd-relative `books/<book>` resolves into the copy. The
 * slug must be a real book (`requireBook` checks the repo), and the libraries
 * that resolve against the repo root only READ. The own module is copied from
 * mt-preview, never from the real faithful tree, which the retirement deletes.
 */

const REAL_ROOT = join(import.meta.dirname, '..', '..');
const RENDER = join(REAL_ROOT, 'tools', 'cnxml-render.js');
const BOOK = 'efnafraedi-2e';
const MT_CH01 = join(REAL_ROOT, 'books', BOOK, '03-translated', 'mt-preview', 'ch01');
const OWN_MODULE = 'm68663'; // ch01's introduction — a 1-0 page

const roots = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/**
 * Build a temp root. `faithful` is one of:
 *   'absent'  — no 03-translated/faithful/ch01/ at all
 *   'residue' — the directory exists and holds only an ignored-style backup
 *   'one'     — the directory holds one own module (plus the same residue)
 * The published chapter directory is pre-seeded with a sentinel page and a
 * backup artifact, which a full-chapter sweep would delete.
 */
function buildFixture(faithful) {
  const root = mkdtempSync(join(tmpdir(), 'efni-zero-own-'));
  roots.push(root);
  const book = join(root, 'books', BOOK);
  const mt = join(book, '03-translated', 'mt-preview', 'ch01');
  mkdirSync(mt, { recursive: true });
  for (const f of readdirSync(MT_CH01).filter((n) => n.endsWith('.cnxml'))) {
    copyFileSync(join(MT_CH01, f), join(mt, f));
  }
  if (faithful !== 'absent') {
    const fa = join(book, '03-translated', 'faithful', 'ch01');
    mkdirSync(fa, { recursive: true });
    writeFileSync(join(fa, 'm68664.cnxml.backup.2026-10-03T00-00-00'), '<document/>');
    if (faithful === 'one') {
      copyFileSync(join(MT_CH01, `${OWN_MODULE}.cnxml`), join(fa, `${OWN_MODULE}.cnxml`));
    }
  }
  const pub = join(book, '05-publication', 'faithful', 'chapters', '01');
  mkdirSync(pub, { recursive: true });
  writeFileSync(join(pub, '1-0-sentinel.html'), '<!DOCTYPE html><p>sentinel</p>');
  writeFileSync(join(pub, '1-0-sentinel.html.backup.2026-06-12T23-45-57'), 'old');
  return { root, book, pubTrack: join(book, '05-publication', 'faithful') };
}

/** Run the render CLI in `root`; never throws. */
function render(root, extraArgs, track = 'faithful') {
  try {
    const stdout = execFileSync(
      'node',
      [RENDER, '--book', BOOK, '--chapter', '1', '--track', track, ...extraArgs],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 }
    );
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      status: err.status,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || ''),
    };
  }
}

/** Every file under `dir`, path → sha256, so a write OR a delete shows. */
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(dir, p)] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

describe('faithful retirement R1 — a full-chapter render with zero own modules is refused', () => {
  const RED = buildFixture('residue');
  const before = snapshot(RED.pubTrack);
  const r = render(RED.root, []);

  it('exits non-zero', () => {
    expect(r.status).not.toBe(0);
  });

  it('names the track and the chapter', () => {
    expect(r.stderr).toMatch(/track faithful, chapter 1\b/);
  });

  it('writes and deletes nothing under 05-publication/faithful/', () => {
    expect(snapshot(RED.pubTrack)).toEqual(before);
  });

  it('in particular: no rollups-complete marker, no rollup rebuilt from mt-preview', () => {
    expect(existsSync(join(RED.pubTrack, 'rollups-complete'))).toBe(false);
    expect(existsSync(join(RED.pubTrack, 'chapters', '01', '1-summary.html'))).toBe(false);
  });

  it('CONTROL: the snapshot is not empty (the sentinel was there to be deleted)', () => {
    expect(Object.keys(before)).toContain(join('chapters', '01', '1-0-sentinel.html'));
  });
});

describe('faithful retirement R1 — the absent-directory arm still refuses', () => {
  const ABS = buildFixture('absent');
  const before = snapshot(ABS.pubTrack);
  const r = render(ABS.root, []);

  it('exits non-zero with the existing message', () => {
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('Translated directory not found');
  });

  it('writes and deletes nothing under 05-publication/faithful/', () => {
    expect(snapshot(ABS.pubTrack)).toEqual(before);
  });
});

describe('faithful retirement R1 — the guard holds for any track (mt-preview, no fallback)', () => {
  const root = mkdtempSync(join(tmpdir(), 'efni-zero-own-'));
  roots.push(root);
  const book = join(root, 'books', BOOK);
  const mt = join(book, '03-translated', 'mt-preview', 'ch01');
  mkdirSync(mt, { recursive: true });
  writeFileSync(join(mt, 'm68664.cnxml.backup.2026-10-03T00-00-00'), '<document/>');
  const pubTrack = join(book, '05-publication', 'mt-preview');
  mkdirSync(join(pubTrack, 'chapters', '01'), { recursive: true });
  writeFileSync(join(pubTrack, 'chapters', '01', '1-0-sentinel.html'), '<p>sentinel</p>');
  const before = snapshot(pubTrack);
  const r = render(root, [], 'mt-preview');

  it('exits non-zero, naming the track and the chapter', () => {
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/track mt-preview, chapter 1\b/);
  });

  it('writes and deletes nothing under 05-publication/mt-preview/', () => {
    expect(snapshot(pubTrack)).toEqual(before);
  });
});

describe('CONTROL (2) — a full-chapter render with ONE own module still renders', () => {
  const FULL = buildFixture('one');
  const r = render(FULL.root, []);
  const chDir = join(FULL.pubTrack, 'chapters', '01');

  it('exits 0', () => {
    expect(r.stderr).not.toMatch(/^Error:/m);
    expect(r.status).toBe(0);
  });

  it('renders the own module’s section page and the rollups from the union', () => {
    expect(existsSync(join(chDir, '1-0-introduction.html'))).toBe(true);
    expect(existsSync(join(chDir, '1-summary.html'))).toBe(true);
    expect(existsSync(join(FULL.pubTrack, 'rollups-complete'))).toBe(true);
  });

  it('a full-chapter render still sweeps (the sentinel is gone)', () => {
    expect(existsSync(join(chDir, '1-0-sentinel.html'))).toBe(false);
  });
});

describe('CONTROL (1) — the Vista + Birta shape: one own module, rendered with --module', () => {
  const VB = buildFixture('one');
  const r = render(VB.root, ['--module', OWN_MODULE]);
  const chDir = join(VB.pubTrack, 'chapters', '01');

  it('exits 0', () => {
    expect(r.stderr).not.toMatch(/^Error:/m);
    expect(r.status).toBe(0);
  });

  it('renders the section page and the rollups from the union with mt-preview', () => {
    expect(existsSync(join(chDir, '1-0-introduction.html'))).toBe(true);
    expect(existsSync(join(chDir, '1-summary.html'))).toBe(true);
  });

  it('a --module render does not sweep (the sentinel survives)', () => {
    expect(existsSync(join(chDir, '1-0-sentinel.html'))).toBe(true);
  });
});

describe('R1 — the guard sits BEFORE the §C145 pre-flight and the sweep, pinned structurally', () => {
  // With zero modules the pre-flight is a no-op, so its ordering against the
  // guard is not observable from the CLI; only the source can pin it.
  const SRC = readFileSync(RENDER, 'utf8');

  it('guard < pre-flight call < sweep', () => {
    const guard = SRC.indexOf('if (!args.module && modules.length === 0)');
    const preflight = SRC.indexOf('assertNoMarkerResidueInInputs(modules, args.track');
    const sweep = SRC.indexOf('Clean stale HTML files before rendering');
    expect(guard).toBeGreaterThan(-1);
    expect(preflight).toBeGreaterThan(-1);
    expect(sweep).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(preflight);
    expect(preflight).toBeLessThan(sweep);
  });
});
