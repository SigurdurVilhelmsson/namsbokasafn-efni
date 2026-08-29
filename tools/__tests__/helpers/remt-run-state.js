/**
 * remt-run-state.js — the test stand-in for `tools/remt-loop.js`'s run state.
 *
 * ⚠️ IT LIVES HERE, NOT IN ONE TEST FILE, BECAUSE TASK N2's INVARIANT TESTS NEED THE SAME
 * SHAPE. The task brief said "a small factory in the test file"; duplicating it would let
 * the two copies drift, and a probe built from a drifted runState excludes checks from
 * `judgeableIds` that the run would have judged. Same convention as `remt-corpus.js`.
 *
 * 🔴 `runState` IS THE DRIVER'S, NOT THE LOADER'S, AND THAT SPLIT IS WHAT KEEPS THE GATES
 * PURE. `costEstimate` comes from `api-translate --force --dry-run`, which costs money on a
 * non-dry path and which NO TEST MAY REACH. The driver produces it; the loader passes it
 * through. This factory therefore returns the VALUES a mid-run driver would hold, never a
 * route to the tool that produces them.
 *
 * 🔴 WHY THE VALUES ARE WHAT THEY ARE — four of E9's five legs and ALL of E6's input come
 * from here (`force`, `costEstimate`, `emittedFiles`; plus E7's two snapshots). A factory
 * that omitted any of them would make E9 and E6 SKIP during `judgeableIds`' probe, silently
 * excluding the two blocking checks with the most loader obligations from EVERY unit kind —
 * and the probe and the invariant would then agree with each other and disagree with the run.
 */
// 🔴 IMPORTED, NOT RE-IMPLEMENTED. This file used to keep a private `chapterDirOf` (without the
// loader's null/'' guard) and its own `REPO_ROOT` — duplication the header above argues against
// two paragraphs up. The failure it invites: change the loader's padding (a third book with
// 3-digit chapters is the realistic trigger) and `emittedFilesForUnit` keeps listing from
// `chNN` while the loader reads `chNNN`. E6 is then probed AND run against a directory
// belonging to a different chapter — and because E6 classifies FILENAMES it returns a plausible
// verdict rather than an error, so the suite stays green over a fixture describing another unit.
// ▶ 2026-08-29: the whole LISTING now comes from the loader for that same reason, so the
// `fs`/`path`/`chapterDirOf` imports this file used to need are gone with the private copy.
import { committedEmittedFilesFor, REPO_ROOT } from '../../remt-ctx.js';

export { REPO_ROOT };

/**
 * The files a re-extract of `unit` would emit, approximated by the ones that exist for it
 * today in the two generated trees.
 *
 * ⚠️ AN APPROXIMATION, AND SAYING SO IS THE POINT. The real driver lists what the extract
 * just wrote. Listing the committed tree scoped to THIS unit is the closest available
 * stand-in built from real data rather than invented names — which matters because E6
 * classifies filenames, so a fixture of made-up names exercises the classifier against
 * shapes the tree does not contain. It deliberately includes the unit's own dated backups:
 * `safeWrite` mints one per rewritten output, and E6's backup ACCOUNTING (an orphan is a
 * finding, an accompanied backup is not) is only exercised when they are present.
 *
 * 🔴 DELEGATES to the loader's `committedEmittedFilesFor` (2026-08-29) — SAME BEHAVIOUR, ONE
 * CONSTRUCTION POINT. Verified before the move: byte-identical output for all **220 units**
 * (15,605 entries, 0 empty listings). The loader needs this same listing for its subset probe,
 * and the header above already argues that a second copy is the hazard — this is that argument
 * applied to itself. ⚠️ THE SEMANTICS ARE UNCHANGED AND SO IS EVERY PIN THAT DEPENDS ON THEM;
 * what the listing MEANS is now stated once, in `loadTier1Ctx`'s `emittedFiles` note.
 */
export function emittedFilesForUnit(unit) {
  return committedEmittedFilesFor(unit);
}

/**
 * A shape-correct extraction snapshot: `{segIds:Set, segText:Map, equations:Map,
 * inlineAttrs:string}` — the shape `compareModule` reads (`remt-checks-extract.js:571-580`).
 *
 * ⚠️ SYNTHETIC, AND BOUNDED ON PURPOSE. The real producers (`segMap`, `eqMap`,
 * `loadCommitted`, `loadDisk`) are module-local and unexported in
 * `tools/verify-reextract-equivalence.js`, so there is no real producer to call — and the
 * LOADER's whole contract for these two keys is *guard the shape, then pass through*: it
 * never reads their contents. So a shape fixture exercises exactly what the loader does,
 * and establishes nothing about E7's comparison, which is not this task's subject.
 * 🔴 A hand-built `{segIds, byId}` instead makes ALL FIVE of E7's arms SKIP with the same
 * message — an absence manufactured by the fixture rather than found in the data.
 */
export function snapshotFixture(seed = 'seg-1') {
  return {
    segIds: new Set([seed]),
    segText: new Map([[seed, 'text']]),
    equations: new Map([[`${seed}-eq`, '<m:math/>']]),
    inlineAttrs: '{}',
  };
}

/**
 * The run state a driver holds mid-run. Every field may be overridden so a test can plant
 * exactly one defect without hand-building the other five.
 *
 * @param {object} [overrides]
 * @returns {{force:boolean, costEstimateFor:Function, emittedFilesFor:Function,
 *            committedExtractFor:Function, freshExtractFor:Function, extractRunStartedAt:string}}
 */
export function runState(overrides = {}) {
  return {
    // The loop always re-translates over existing output, so --force is mandatory (E9 leg 4).
    force: true,
    // `withForce: true` is E9 leg 5's provenance assertion: a bare --dry-run reports ~0 ISK
    // once output exists, and `isk > 0` is refused as unusable.
    costEstimateFor: () => ({ isk: 1200, withForce: true }),
    emittedFilesFor: emittedFilesForUnit,
    committedExtractFor: () => snapshotFixture(),
    freshExtractFor: () => snapshotFixture(),
    // 🔴 IT MUST PRECEDE THE COMMITTED CORPUS, AND THAT IS A STATEMENT ABOUT THE RUN, NOT A
    // CONVENIENCE. `assertSameUnit` now enforces I4's vintage half: every extraction-derived
    // source must have `mtime >= extractRunStartedAt`. The re-MT loop's extract has NOT run,
    // so what is on disk is the COMMITTED vintage — measured 2026-08-28, the oldest of the 220
    // `02-for-mt` EN segment files is 2026-07-07T09:12:25.604Z (efnafraedi-2e/appendices/
    // m68859). A fixture claiming a later start would trip the vintage clause CORRECTLY, and
    // "fixing" that by loosening the clause is how the invariant gets deleted. The clause is
    // proved live by the negative control in `remt-ctx.test.js`, which stamps a run start of
    // `now` and asserts the throw.
    extractRunStartedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}
