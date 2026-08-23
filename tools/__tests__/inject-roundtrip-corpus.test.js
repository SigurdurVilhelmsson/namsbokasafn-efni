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
    // ⚠️⚠️ CORRECTED 2026-08-16 — THIS COMMENT SAID m42296's 24 -> 23 WAS "a residual
    // defect, not a test artefact". THAT WAS BACKWARDS. It IS an artefact: `countAlt`
    // regexes raw text, so it counts `alt=` inside XML COMMENTS. m42296 holds 24 alt
    // attributes of which 2 are commented out; its LIVE markup round-trips 22 -> 22
    // CLEAN, and the 24 -> 23 delta is one commented-out alt. Confirmed independently
    // with an XML DOM parse, which is structurally incapable of seeing inside a comment.
    //
    // ▶ WHY countAlt IS NOT BEING CHANGED: censused 2026-08-16 across all six books —
    // only edlisfraedi-2e has commented-out alt at all (4 modules: m42296 ×2, m42456 ×2,
    // m42493 ×1, m42531 ×1). efnafraedi-2e 0/149 and lifraen-efnafraedi 0/342 — i.e.
    // ZERO in both books inside §C80's re-MT scope. The imprecision cannot reach the
    // §C82 loop, and stripping comments would move all five fixture pins and both
    // discrimination vintages for no in-scope gain.
    //
    // The 24/23 pin therefore stays as a BEHAVIOUR pin — it records what this counter
    // reports today so a change is visible. It is NOT evidence of a reader-visible
    // defect, and must not be cited as one.
    //
    // The books here (edlisfraedi-2e, liffraedi-2e) are outside §C80's re-MT scope. That
    // is fine and deliberate: a regression fixture is chosen for the defect it
    // reproduces, not for whether its book is being bought.
    const at = (book, m) => {
      const f = sourceModules(book).find((p) => path.basename(p, '.cnxml') === m);
      expect(f, `${m} must exist — it is a §C81 regression fixture`).toBeTruthy();
      return roundTripAltCount(fs.readFileSync(f, 'utf8'));
    };

    // ⚠️ `ok` IS ASSERTED IN BOTH DIRECTIONS, DELIBERATELY. Added 2026-08-16: the first
    // cut never asserted `ok === false` anywhere, so a mutation returning a hardcoded
    // `ok: true` — or relaxing `rawAlt === outAlt` to `<=`, which would call organic's
    // DUPLICATED media clean — passed every assertion in this file. `ok` is what the
    // §C82 loop gates on, so an unpinned `ok` is an unpinned gate.
    expect(at('edlisfraedi-2e', 'm42714')).toMatchObject({ rawAlt: 11, outAlt: 11, ok: true });
    expect(at('edlisfraedi-2e', 'm42359')).toMatchObject({ rawAlt: 19, outAlt: 19, ok: true });
    expect(at('edlisfraedi-2e', 'm42493')).toMatchObject({ rawAlt: 8, outAlt: 8, ok: true });
    expect(at('liffraedi-2e', 'm66590')).toMatchObject({ rawAlt: 8, outAlt: 8, ok: true });
    // Behaviour pin, and the only `ok: false` in the file — see the note above.
    expect(at('edlisfraedi-2e', 'm42296')).toMatchObject({ rawAlt: 24, outAlt: 23, ok: false });
  }, 120_000);

  it('organic: 342 modules, no alt lost and none gained', () => {
    // 🔴 These are REAL, reader-visible defects found by this check, not test noise:
    // the whole <media> element moves, image and all, so a reader sees a MISSING or
    // DOUBLED image. Measured 2026-08-16 and logged to the active register.
    //
    //   m00032  36 media/image/alt -> 36   ✅ RESOLVED BY §C85-drop, 2026-08-23 (was -> 35, DROPPED)
    //   m00046   4 media/image/alt ->  5   image DUPLICATED
    //   m00023  11 alt -> 11   ✅ RESOLVED BY §C85-B, 2026-08-23 (was 11 -> 12, duplicated)
    //   m00069   6 alt ->  6   ✅ RESOLVED BY §C89, 2026-08-16 (was 6 -> 9, tripled)
    //
    // ✅ §C89 FIXED m00069 AS A SIDE EFFECT, and this pin is what noticed. §C89 made
    // the container builders write translated alt into figures they keep in place,
    // which also marks those figures handled — so a figure that had been emitted
    // BOTH standalone and inside its container is now emitted once. Re-measured on
    // merged main: m00069 is 6/6/6 -> 6/6/6, media and image counts included.
    // The other three are UNCHANGED and remain open under §C85.
    //
    // ⚠️ THE PIN GOING RED IS THE POINT — it is a defect CHARACTERISATION, so an
    // improvement trips it exactly as a regression would. Read the direction before
    // assuming which one you have; here the count moved toward the source, not away.
    //
    // ⚠️ §C81's own verification could not see these: it compared the injected alt
    // count at the BASE vintage against the NEW vintage and concluded "zero modules
    // gained". That asks "did my change alter the count?", not "does the output carry
    // what the source had" — a vintage-diff is structurally blind to a defect present
    // at both vintages.
    // ✅ ALL FOUR ORGANIC DEFECTS ARE NOW FIXED (2026-08-23). This case has
    // therefore CHANGED CHARACTER: it was a defect CHARACTERISATION pin, and it is
    // now a CLEAN pin, the same shape as chemistry's above.
    //
    //   m00069  §C89       (was 6 -> 9, tripled)
    //   m00023  §C85-B     (was 11 -> 12, inline media treated as a block child)
    //   m00032  §C85-drop  (was 36 -> 35, media destroyed by the flat-entry branch)
    //   m00046  §C85-A     (was 4 -> 5, table-kept figure also emitted standalone)
    //
    // Each direction was read BEFORE the pin was updated, never after: loss went
    // ['m00032'] -> [] and gain went ['m00023','m00046'] -> [], i.e. toward the
    // source in both cases.
    const r = sweep('lifraen-efnafraedi');
    expect(r.files).toBe(342);
    expect(r.loss).toEqual([]);
    expect(r.gain).toEqual([]);

    // 🔴 THE `ok === false` ASSERTION THAT USED TO LIVE HERE IS REMOVED
    // DELIBERATELY, NOT BLANKED — which is what its own guard demanded.
    // It read `[...r.loss, ...r.gain].every((x) => x.ok === false)`, and
    // `[].every()` is TRUE, so with both arrays now empty it would have passed
    // VACUOUSLY: green, meaningless, and impossible to notice. A guard added with
    // §C85-B made that state go red instead, which is why this is being handled
    // rather than silently inherited.
    //
    // WHERE THAT COVERAGE LIVES NOW, so it is not simply lost:
    //   - `ok === false` is still pinned on a real measurement by the m42296
    //     behaviour pin in the case above, which catches a mutation hardcoding
    //     `ok: true`.
    //   - The four defects themselves are now covered by DEDICATED tests that
    //     assert VALUES rather than counts — which is strictly stronger than this
    //     pin ever was, since a count cannot see a substitution:
    //       tools/__tests__/figure-image-comment-masking.test.js   (§C90)
    //       tools/__tests__/inline-media-not-block.test.js          (§C85-B)
    //       tools/__tests__/table-entry-media-preserved.test.js     (§C85-drop)
    //       tools/__tests__/table-kept-figure-alt.test.js           (§C85-A)
    // ⚠️ This case is now a REGRESSION guard, not a characterisation: if it goes
    // red, a defect has been REINTRODUCED. Read the direction before assuming.
  }, 600_000);
});
