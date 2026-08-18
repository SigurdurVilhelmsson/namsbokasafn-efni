import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseModuleDoc, altReachability } from '../lib/extraction-coverage.js';
import { extractSegments } from '../cnxml-extract.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Every .cnxml under a book's 01-source, recursively. */
function sourceModules(book) {
  const root = path.join(REPO_ROOT, 'books', book, '01-source');
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.cnxml')) out.push(p);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

function census(files) {
  const total = { reachable: 0, unreachable: 0, unreachableByReason: {} };
  for (const f of files) {
    const { content } = parseModuleDoc(fs.readFileSync(f, 'utf8'));
    const r = altReachability(content);
    total.reachable += r.reachable;
    total.unreachable += r.unreachable;
    for (const [k, n] of Object.entries(r.unreachableByReason)) {
      total.unreachableByReason[k] = (total.unreachableByReason[k] || 0) + n;
    }
  }
  return total;
}

describe('§C81 alt shortfall is pinned, so a change in it is visible', () => {
  it('chemistry: 149 modules is the control', () => {
    expect(sourceModules('efnafraedi-2e').length).toBe(149);
  });

  it('chemistry: 1,149 reachable, 0 unreachable — all five positions reachable (§C88), 1149 total', () => {
    const t = census(sourceModules('efnafraedi-2e'));
    expect(t.reachable).toBe(1149);
    expect(t.unreachable).toBe(0);
    expect(t.reachable + t.unreachable).toBe(1149);
  });

  it('chemistry: no unreachable positions remain — the §C88 emitters closed all five (measured 2026-08-18)', () => {
    expect(census(sourceModules('efnafraedi-2e')).unreachableByReason).toEqual({});
  });
});

describe('E5 fires on a real defect and on nothing else (live extractor)', () => {
  // ⚠️ This block runs the REAL extractor in memory, NOT the committed 02-for-mt
  // files. The tree is pre-re-extract and holds zero alt segments corpus-wide, so
  // reading the committed files would make E5 fire on all 149 modules — a true
  // statement about a stale tree, and useless as a discrimination test. What we
  // want to know is whether the check separates a defect from a clean module,
  // and only the live extractor can answer that today.
  //
  // Measured 2026-08-18 (post-§C88, all five positions now reachable):
  // reachable 1149, extractor emits 1148, and the single shortfall is still
  // m68727 (6 reachable, 5 emitted) — the known regex-truncation defect in
  // processFigure's non-global media regex, unrelated to the §C88 blind
  // positions. 148 clean controls.
  const emittedAltCount = (cnxml) =>
    extractSegments(cnxml).segments.filter((s) => s.type === 'alt').length;

  it('exactly one chemistry module is short, and it is m68727', () => {
    const short = [];
    let reachableTotal = 0;
    let emittedTotal = 0;

    for (const f of sourceModules('efnafraedi-2e')) {
      const src = fs.readFileSync(f, 'utf8');
      const { reachable } = altReachability(parseModuleDoc(src).content);
      const emitted = emittedAltCount(src);
      reachableTotal += reachable;
      emittedTotal += emitted;
      if (emitted !== reachable) {
        short.push({ module: path.basename(f, '.cnxml'), reachable, emitted });
      }
    }

    expect(reachableTotal).toBe(1149);
    expect(emittedTotal).toBe(1148);
    expect(short).toEqual([{ module: 'm68727', reachable: 6, emitted: 5 }]);
  }, 120_000);
});
