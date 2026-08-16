import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { roundTripAltCount } from '../lib/inject-roundtrip.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

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

/** Round-trip every source module in a book; return the ones that lost or gained alt. */
function sweep(book) {
  const loss = [];
  const gain = [];
  const files = sourceModules(book);
  for (const f of files) {
    const r = roundTripAltCount(fs.readFileSync(f, 'utf8'));
    const module = path.basename(f, '.cnxml');
    if (r.outAlt < r.rawAlt) loss.push({ module, ...r });
    else if (r.outAlt > r.rawAlt) gain.push({ module, ...r });
  }
  return { files: files.length, loss, gain };
}

describe('alt survives the round trip', () => {
  // ⚠️ BOTH DIRECTIONS. An earlier draft checked only `outAlt < rawAlt`, and that is
  // exactly how the duplication class below stayed invisible in the first sweep I ran.
  // A one-sided invariant is half a check.

  it('chemistry: 149 modules, no alt lost and none gained', () => {
    // Measured 2026-08-16: perfectly clean. This is the negative control that makes
    // organic's findings mean something.
    const r = sweep('efnafraedi-2e');
    expect(r.files).toBe(149);
    expect(r.loss).toEqual([]);
    expect(r.gain).toEqual([]);
  }, 300_000);

  it('regression fixtures: the five modules §C81 broke are clean at HEAD', () => {
    // 🔴 THIS IS THE DISCRIMINATING TEST — the synthetic in the unit file is not.
    // These are the real corpus modules the §C81 whole-branch reviewer measured as
    // losing alt under that branch's first Part 2. Verified 2026-08-16 by checking out
    // tools/cnxml-extract.js at 07167ac7 and re-running:
    //
    //   module   HEAD (fixed)   07167ac7 (broken)   C81 reviewer reported
    //   m42714   11 -> 11  ok    11 -> 7             11->7   ✓
    //   m42359   19 -> 19  ok    19 -> 18            19->18  ✓
    //   m42493    8 ->  8  ok     8 -> 6              8->6   ✓
    //   m66590    8 ->  8  ok     8 -> 5              8->5   ✓
    //   m42296   24 -> 23  ⚠️     24 -> 19            23->19  ✓
    //
    // Four go clean -> lossy, so this case goes red against the broken vintage. The
    // numbers reproduce the reviewer's independently, which is what makes them evidence.
    //
    // ⚠️ m42296 STILL LOSES ONE ALT AT HEAD (24 -> 23). That is a residual defect, not a
    // test artefact — physics is out of §C80's scope so it is pinned, not fixed, and it
    // is logged to the register. Pinning it is what makes a CHANGE in it visible.
    //
    // The books here (edlisfraedi-2e, liffraedi-2e) are outside §C80's re-MT scope. That
    // is fine and deliberate: a regression fixture is chosen for the defect it
    // reproduces, not for whether its book is being bought.
    const at = (book, m) => {
      const f = sourceModules(book).find((p) => path.basename(p, '.cnxml') === m);
      expect(f, `${m} must exist — it is a §C81 regression fixture`).toBeTruthy();
      return roundTripAltCount(fs.readFileSync(f, 'utf8'));
    };

    expect(at('edlisfraedi-2e', 'm42714')).toMatchObject({ rawAlt: 11, outAlt: 11 });
    expect(at('edlisfraedi-2e', 'm42359')).toMatchObject({ rawAlt: 19, outAlt: 19 });
    expect(at('edlisfraedi-2e', 'm42493')).toMatchObject({ rawAlt: 8, outAlt: 8 });
    expect(at('liffraedi-2e', 'm66590')).toMatchObject({ rawAlt: 8, outAlt: 8 });
    // Residual, pinned deliberately — see the note above.
    expect(at('edlisfraedi-2e', 'm42296')).toMatchObject({ rawAlt: 24, outAlt: 23 });
  }, 120_000);

  it('organic: pins the four known round-trip defects so any change is visible', () => {
    // 🔴 These are REAL, reader-visible defects found by this check, not test noise:
    // the whole <media> element moves, image and all, so a reader sees a MISSING or
    // DOUBLED image. Measured 2026-08-16 and logged to the active register.
    //
    //   m00032  36 media/image/alt -> 35   image DROPPED   (IN §C80 scope: organic preview)
    //   m00046   4 media/image/alt ->  5   image DUPLICATED
    //   m00023  11 alt -> 12               duplicated
    //   m00069   6 alt ->  9               duplicated x3
    //
    // ⚠️ §C81's own verification could not see these: it compared the injected alt
    // count at the BASE vintage against the NEW vintage and concluded "zero modules
    // gained". That asks "did my change alter the count?", not "does the output carry
    // what the source had" — a vintage-diff is structurally blind to a defect present
    // at both vintages.
    const r = sweep('lifraen-efnafraedi');
    expect(r.files).toBe(342);
    expect(r.loss.map((x) => x.module)).toEqual(['m00032']);
    expect(r.gain.map((x) => x.module).sort()).toEqual(['m00023', 'm00046', 'm00069']);
  }, 600_000);
});
