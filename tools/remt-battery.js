#!/usr/bin/env node
/**
 * remt-battery.js — the §C82 re-MT check battery CLI.
 *
 * Runs one tier of the battery over one book/chapter/module and reports every
 * check's verdict, version and examined count, as text or JSON.
 *
 * ⚠️ THIS TOOL JUDGES; IT NEVER MUTATES AND NEVER SEQUENCES. Plan C's driver
 * sequences. Keeping them apart is what lets the battery be validated against the
 * EXISTING corpus before any ISK is spent (design §3).
 *
 * Exit: 0 all blocking checks passed · 1 a blocking check failed or was SKIPPED
 *       · 2 usage or environment error.
 *
 * ── THE ctx CONTRACT, AND WHY IT IS DOCUMENTED HERE BUT NOT YET BUILT ──────────
 * Global Constraint 5: gates are pure — "a gate takes already-read strings/objects
 * and returns a verdict. File reading happens in the CLI or in Plan C's driver."
 * So the loader belongs on this side. It is deliberately NOT written yet, because
 * no gate exists to consume it (Tasks 3-12) and a loader guessing at keys would be
 * fiction. What IS fixed here is the shape every gate may rely on:
 *
 *   @typedef {object} CheckContext
 *   @property {string}  book          slug, e.g. 'efnafraedi-2e'          (scope)
 *   @property {string} [chapter]      '1' | '01' | 1 | '0' | 'appendices'  (scope)
 *                                     🔴 THIS LINE READ `'ch01' | '0' | 'appendices'` UNTIL
 *                                     TASK 12, AND THE FIRST SPELLING IT DOCUMENTED IS ONE
 *                                     THAT SILENTLY READS NOTHING. Measured against
 *                                     `readChapterFromDisk`, the producer of Tier 4's
 *                                     `chapterInputs`:
 *                                       4 · '4' · '04' · 0 · '0' · 'appendices'  → content
 *                                       'ch04' · 'ch4' · 'ch00' · -1             → {cnxml:[], html:[]}
 *                                     An empty read makes every Tier-4 content check SKIP,
 *                                     and K2/K5 are BLOCKING — so a driver built to the old
 *                                     wording halts on every chapter while looking like a
 *                                     tier that simply found nothing to judge.
 *                                     ⚠️ **`-1` IS THE TRAP A CAREFUL READER IS MOST LIKELY
 *                                     TO HIT, BECAUSE CLAUDE.md SENDS THEM THERE**: its
 *                                     Directory-Structure section prescribes `-1` as the
 *                                     appendix sentinel, and that is right for
 *                                     `chapterLabel.chapterDir()` and wrong here — both of
 *                                     the render-fidelity tool's path builders compare
 *                                     `chapter === 'appendices'` as a STRING, so `-1`
 *                                     builds `ch-1` and `chapters/-1`. **Pass the string.**
 *                                     ▶ The `ch`-prefixed forms are the source-tree
 *                                     convention; Tier 4 reads publication-track output,
 *                                     whose dirs are BARE. Two conventions, and this key
 *                                     takes the bare one.
 *   @property {string} [module]       'm68663'                    (scope · Task 10: A5)
 *                                     ⚠️ NO LONGER SCOPE-ONLY. A5 keys the residue
 *                                     allowlist on it and SKIPS without it. It is
 *                                     deliberately the existing key rather than a new
 *                                     `moduleId`: two near-identical names is how a
 *                                     loader sets one and leaves a check permanently
 *                                     SKIPPED, which on an ADVISORY check reads as
 *                                     ignorable rather than as broken.
 *   @property {string} [cnxml]        read-only source CNXML text    (Task 3: E2/E4)
 *   @property {string} [segText]      02-for-mt EN segments  (Task 3: E2/E4 · Task 8: A1/A2b)
 *                                     🔴 A2b REQUIRES it — its cross-side leg is the only
 *                                     detector for damage that DESTROYS a `SEG:` token, and
 *                                     a loader that omits it gets SKIPPED (exit 1), never a
 *                                     silent single-leg PASS. Same shape as `payloadVerdict`
 *                                     below: a key a check consumes but this typedef does not
 *                                     list is a detector a loader built to the doc leaves unrun.
 *   @property {string} [isText]       02-mt-output IS segments  (Task 8: A2/A6 · Task 10: A3/A5/A7)
 *   @property {object} [residueAllowlist]  the PARSED books/<slug>/residue-allowlist.json
 *                                     (Task 10: A5 only)
 *                                     🔴 A5 REQUIRES it and SKIPS without it, because
 *                                     `classifyResidue` does `(allowlist.entries || [])`:
 *                                     an absent allowlist tolerates NOTHING, so every
 *                                     human-triaged residue would report as a finding —
 *                                     `m68662` alone contributes 76 that look real.
 *                                     🔴 THE LOADER MUST USE `loadResidueAllowlistOrNull`,
 *                                     NOT `loadResidueAllowlist`. The latter returns
 *                                     `{entries: []}` for a MISSING FILE and for a real
 *                                     empty allowlist — identical values — so A5's guard
 *                                     accepts the very state it exists to refuse. The
 *                                     `OrNull` variant returns `null` when the file is
 *                                     absent, which the guard rejects. Gates are pure, so
 *                                     no check can tell the two apart on its own.
 *   @property {object} [provenance]   the parsed sidecar        (Task 9: A2a/A4/A8)
 *                                     ⚠️ ALL THREE, not the two this line named until
 *                                     2026-08-26 — A2a reads `run.markersNormalized` and
 *                                     was missing here, the same G5/L41 shape: a key a
 *                                     check consumes that the contract does not list is a
 *                                     detector a loader built to the doc leaves unrun.
 *                                     🔴 The loader must pass the PARSED SIDECAR, not the
 *                                     run record — all three reach through `.run`, and
 *                                     they report SKIPPED (never a clean zero) when it is
 *                                     absent, which is the state of all 200 committed
 *                                     sidecars today.
 *   @property {object} [glossary]     parsed glossary-unified.json   (Task 7: G1-G3)
 *   @property {object} [glossariesByBook] {slug: parsedGlossary}     (Task 7: G4)
 *   @property {object} [payloadVerdict]   spawnGlossaryPayloadCheck() result (Task 7: G5)
 *                                     🔴 G5's producer leg is a FINDING when this is absent,
 *                                     not a pass. It was missing from this typedef, so a
 *                                     loader built to the documented shape left the only
 *                                     detector for a wholesale producer swap unrun.
 *   @property {string} [payloadText]  raw glossary bytes             (Task 7: G5)
 *   @property {boolean}  [locked]      from isMtLocked() — NOT fs.existsSync (Task 6: E9)
 *   @property {string[]} [handEdits]   hand-edit commits under 02-mt-output    (Task 6: E9)
 *   @property {object[]} [inputs]      [{path, exists, bytes}]                 (Task 6: E9)
 *   @property {boolean}  [force]       --force was passed                      (Task 6: E9)
 *   @property {object}   [costEstimate] {isk, withForce} from --force --dry-run (Task 6: E9)
 *   @property {object}   [costBand]    optional {minIsk, maxIsk}               (Task 6: E9)
 *                                     ⚠️ E9 takes VALUES, not a path: leg 5's estimate
 *                                     comes from `api-translate --force --dry-run`, which
 *                                     costs money and which no test may reach — so the
 *                                     driver must produce it and the gate stays pure.
 *   @property {string} [track]       'mt-preview' | 'faithful'          (Task 11: TIER 3)
 *                                     🔴 TIER 3 IS THE FIRST TIER WHOSE INPUTS ARE
 *                                     TRACK-SCOPED, which is why this key did not exist
 *                                     until now: the read-only source tree and both
 *                                     `02-*` trees are not split by track, while
 *                                     `03-translated/<track>/` and
 *                                     `05-publication/<track>/` are. Measured: the four
 *                                     chemistry modules present in BOTH tracks DIFFER in
 *                                     all four (m68663 3098v3129, m68664 25895v26223,
 *                                     m68699 1895v1897, m68700 78247v78200 bytes), so a
 *                                     Tier-3 gate handed "the translated CNXML" without a
 *                                     track judges AN artifact, not THE artifact.
 *                                     ⚠️ VALIDATE IT IN THE LOADER, NOT IN A GATE — it
 *                                     reaches a directory path from a CLI flag, the same
 *                                     reason `slugMapFilename(track)` validates. Gates are
 *                                     pure (rule 5), so they cannot.
 *   @property {string} [translatedCnxml] `03-translated/<track>/<ch>/<m>.cnxml` text
 *                                     (Task 11: R1/R5)
 *   @property {object} [fidelityAllowlist] the PARSED books/<slug>/fidelity-allowlist.json,
 *                                     or `null` when the file is absent (Task 11: R1)
 *                                     🔴 THE LOADER MUST BE `loadAllowlistOrNull`, NOT
 *                                     `loadAllowlist` — the third instance of §C21/§C82
 *                                     L57 and the worst of them, because it has THREE
 *                                     representations of "nothing": a missing file,
 *                                     `{"entries": []}` and `{"entries": null}` all return
 *                                     byte-identical `{entries: []}`. Measured: of the six
 *                                     books with a source tree exactly ONE has a
 *                                     fidelity-allowlist; `lifraen-efnafraedi`, a live run
 *                                     target, has NONE — so R1 over organic would load
 *                                     "nothing is pre-explained" and be unable to tell
 *                                     that from a deliberately-empty allowlist.
 *   @property {object} [injectReport] the object `buildCnxml()` returns (Task 11: R2)
 *                                     ⚠️ `cnxml-inject.js` has NO `--json` and needs none:
 *                                     `buildCnxml` is exported at :5154 and is I/O-free
 *                                     (verified by call-site census). The DRIVER calls it;
 *                                     the gate stays pure.
 *   @property {object} [inlineAttrs] `extractSegments`' inlineAttrs map     (Task 11: R2)
 *                                     ⚠️ OPTIONAL AND REPORTING-ONLY — R2's verdict does
 *                                     not depend on it. It exists so the message can state
 *                                     the JUDGEABLE population beside `examined`: every
 *                                     R2 leg requires `inlineAttrs[segmentId]` truthy, and
 *                                     only 666 of 23,154 segments (2.88%) carry an entry,
 *                                     with 39 of 166 modules (23.5%) carrying none. Keying
 *                                     `examined` to that count would SKIP 23.5% of modules
 *                                     on a BLOCKING check — E4's measured ~70% false-halt
 *                                     trap (L17) in a new place — so the sub-count is
 *                                     REPORTED rather than gated on.
 *   @property {object} [schemaVerdict] spawnSchemaCheck() result            (Task 11: R3)
 *                                     🔴 IT MUST CARRY `targets` — the array of paths the
 *                                     validator actually looked at — WHENEVER `module` is
 *                                     set, or R3 SKIPs (and R3 is blocking, so that halts).
 *                                     `spawnSchemaCheck` echoes it; a verdict read from a
 *                                     cache or produced by any other route must too. On a
 *                                     CLEAN verdict the payload names no file at all
 *                                     (`errors[]` is the only place a filename appears, and
 *                                     it is empty exactly then), so without `targets` there
 *                                     is nothing to bind a PASS to.
 *                                     ⚠️ SPAWN WITH PER-FILE TARGETS, NOT A DIRECTORY, when
 *                                     you intend per-module verdicts: a directory target
 *                                     names no module and is refused. ONE spawn per chapter
 *                                     listing its files works and is cheap — the cost is
 *                                     JVM startup per INVOCATION, not per file — and R3
 *                                     then scopes `findings`/`examined` to `ctx.module`
 *                                     itself. A single-file spawn is ~732 ms if you prefer
 *                                     it.
 *                                     🔴 Same shape as `payloadVerdict` above: a key a
 *                                     check consumes that the contract does not list is a
 *                                     detector a loader built to the doc leaves unrun. R3
 *                                     is BLOCKING, so its absence HALTS rather than
 *                                     passing — an unvalidated module is not a certified
 *                                     one.
 *   @property {object[]} [auditResults] the array `audit-render-output.js --json` emits,
 *                                     one entry per module ATTEMPTED       (Task 11: R4)
 *                                     ⚠️ Entries carrying `error` were attempted and NOT
 *                                     audited. R4 counts them as findings and excludes
 *                                     them from `examined`; treating the array length as
 *                                     the examined count is the §C60 defect this check was
 *                                     built around.
 *   @property {object} [chapterInputs] readChapterFromDisk()'s `{cnxml, html}` for ONE
 *                                     chapter x track                (Task 12: K1/K2/K4/K5)
 *                                     🔴 TIER 4 IS PER CHAPTER, NOT PER MODULE — the
 *                                     chapter is the closed reconciliation unit, because
 *                                     rollup pages re-present content from several modules
 *                                     and a per-module count of anything in the published
 *                                     tree is wrong by construction.
 *                                     ⚠️ BOTH ARRAYS MUST BE NON-EMPTY or every check that
 *                                     reads it SKIPs. A chapter rendered on one side only
 *                                     cannot be judged; §C82 L78② measured a one-sided
 *                                     guard reporting PASS over an empty document.
 *   @property {number} [knownIntentionalImageDrops] images deliberately omitted **from THIS
 *                                     CHAPTER**                            (Task 12: K2)
 *                                     🔴 REQUIRED, NEVER DEFAULTED TO 0, AND K2 IS
 *                                     BLOCKING. `computeIntentionalImageDrops` is
 *                                     module-local in the render-fidelity tool, so a gate
 *                                     that calls `checkChapter` without this option reports
 *                                     chemistry appendices as an image drop (m68859, the
 *                                     periodic table) — taking the tier's measured rate
 *                                     from 3.8% to 7.7%, across the ~5% blocking bar.
 *                                     ⚠️ A wrapper tested only against organic passes
 *                                     without it: organic's specialModules is `{}`.
 *                                     🔴 PER CHAPTER, NOT PER BOOK — THIS LINE SAID "this
 *                                     book" AND POINTED AT THE BOOK-LEVEL `specialModules`
 *                                     UNTIL A REVIEW MEASURED IT. `checkChapter` subtracts
 *                                     the value from THAT CHAPTER's `<image>` count, so a
 *                                     driver following the old wording would hand
 *                                     chemistry's book total to all 23 chapters and MASK a
 *                                     real one-image drop as PASS — L88's false positive
 *                                     inverted into a false negative, on a blocking check.
 *                                     Count only the special modules IN the chapter judged.
 *                                     ⚠️ K1 AND K5 ARE NOT CONSUMERS — this said
 *                                     "K1/K2/K5". Both filter finding types the option
 *                                     cannot move, and K5's demand for it was a pure
 *                                     false-halt surface on a blocking check (§C82 L96②).
 *   @property {object|null} [renderBaseline] the PARSED per-CHAPTER bucket histogram from
 *                                     `render-fidelity-baseline.json`, or `null` when this
 *                                     chapter has none                      (Task 12: K1)
 *                                     🔴 TRI-STATE, AND THE FOURTH INSTANCE OF §C21/§C82
 *                                     L57 — the worst yet, with SEVEN representations of
 *                                     "nothing" against `fidelityAllowlist`'s three: a
 *                                     missing file · a file with no `chapters` key · this
 *                                     chapter absent (84 of 112 cells) · the entry present
 *                                     but `{}` · malformed JSON · the four bytes `null` ·
 *                                     `chapters` not an object. **`{}` is TRUTHY and
 *                                     manufactures 16 false findings, every one
 *                                     `expected: 0`; malformed JSON throws UNCAUGHT and
 *                                     kills the whole run rather than one chapter.**
 *                                     `undefined` means the loader never set the key and is
 *                                     refused separately from `null`.
 *                                     ⚠️ ITS KEYS ARE A THIRD CHAPTER CONVENTION —
 *                                     UNPADDED (`"3"`), while the publication directory is
 *                                     `"03"`. The loader owns that mapping; a gate handed
 *                                     the wrong key reads "no baseline" and SKIPs, which
 *                                     looks exactly like the expected inert state.
 *   @property {Map<string,string>} [publishedBefore] snapshotModuleIds() filename ->
 *                                     moduleId, taken BEFORE the render     (Task 12: K3)
 *                                     🔴 THE ONLY ctx KEY WHOSE CORRECTNESS IS A PROPERTY
 *                                     OF *WHEN* IT WAS TAKEN, AND NO PURE GATE CAN CHECK
 *                                     IT. The slug map is not regenerable. Measured: a
 *                                     snapshot taken AFTER the render is the inverse of
 *                                     `renderedModules`, so the rename set is empty and K3
 *                                     reports a clean "zero unaccounted" on exactly the
 *                                     runs that destroyed the information — and
 *                                     `snapshotSize` is identical in both arms, so the
 *                                     `PASS + examined 0 -> SKIPPED` backstop is silent.
 *                                     Nothing on disk witnesses vintage: the map payload
 *                                     carries no run id, sha or timestamp, and the write is
 *                                     skipped entirely when nothing was pruned, so absence
 *                                     of the file is also absence of evidence.
 *                                     ▶ THIS IS A SEQUENCING OBLIGATION ON THE DRIVER.
 *                                     A `Map` is required rather than a serialisable
 *                                     object precisely because it cannot be reconstructed
 *                                     from a file written at an unknown time.
 *   @property {Map<string,string>} [publishedAfter] the same, after the render (Task 12: K3)
 *   @property {object|null} [slugMap] the PARSED track-qualified
 *                                     `slug-map.<track>.json`, or null      (Task 12: K3)
 *                                     ⚠️ TRACK-QUALIFIED IS LOAD-BEARING — vefur flattens
 *                                     both tracks into one directory, so a shared
 *                                     `slug-map.json` means a `faithful` map overwrites
 *                                     `mt-preview`'s. K3 refuses a map whose own `track`
 *                                     disagrees with `ctx.track`.
 *                                     🔴 THAT REFUSAL CANNOT FIRE IF YOU LOAD WITH
 *                                     `readSlugMap`, AND THE LOADER MUST KNOW IT.
 *                                     `readSlugMap(mapPath, {book, track})` RE-STAMPS
 *                                     `track` from the CALLER's argument and discards the
 *                                     value on disk — by design, since it also fabricates
 *                                     an empty map for a missing file — so `map.track`
 *                                     always equals whatever the loader just passed, and a
 *                                     cross-track comparison against it is a tautology.
 *                                     ▶ **To make the guard real, the loader must read the
 *                                     FILE's own `track` field** (parse the JSON directly,
 *                                     or compare `readSlugMap`'s output against the raw
 *                                     bytes) and hand K3 the on-disk value. Same shape as
 *                                     `loadAllowlistOrNull` above: a gate is pure, so it
 *                                     cannot tell a re-stamped field from a read one, and
 *                                     the contract is the only place the distinction can
 *                                     be stated. K3's guard still catches an absent
 *                                     `ctx.track` and a map assembled by any other route.
 *   @property {string[]} [emittedFiles] filenames the extract emitted (Task 5: E6)
 *                                     ⚠️ A LISTING, NOT A PATH — gates are pure, so the
 *                                     loader walks the directory. It must scope the list
 *                                     to THIS RUN's output: the two kept books' generated
 *                                     trees already hold 14,634 historical backup files
 *                                     (2026-03-08 → 2026-08-12), and E6 is blocking.
 *
 * ⚠️ THE PROSE ABOVE DELIBERATELY AVOIDS THE LITERAL STRING `01-` + `source`, AND THAT
 * IS NOT FUSSINESS. `tools/__tests__/source-write-guard.test.js` nets any top-level
 * `tools/*.js` whose TEXT matches the read-only source directory's name and requires a
 * reviewer to classify it. (That name is deliberately not spelled here either — quoting
 * the guard's own pattern in a comment re-trips it, which is how this note started.)
 * This file performs NO I/O AT ALL — it imports no `fs`, and the one `fs.` above is
 * itself prose — so it is not a toucher and must not be added to that ALLOW set: doing so
 * would dilute the tripwire for the one moment it exists to catch. Task 11 tripped this
 * red by naming the source tree in a COMMENT, which is exactly the review the guard is
 * for; the classification came back "not a toucher", so the prose changed rather than the
 * allow-list. ▶ If you add a real loader here, that answer flips — see the note below.
 * ▶ Until the loader lands, this CLI passes only the SCOPE keys, so every other key
 * reads as plain `undefined`. 🔴 THAT IS NOT STRUCTURALLY LOUD, AND AN EARLIER
 * VERSION OF THIS COMMENT CLAIMED IT WAS. Reading `ctx.cnxml` does not throw — it
 * yields `undefined` — and what happens next is PER-GATE. Measured over the real
 * instruments, called with `undefined`:
 *     THREW (loud)   checkBracketBodies · analyzeModule · isMtLocked
 *     RETURNED EMPTY checkAltCoverage · detectResidue · findGlossaryCollisions
 * Three of six. For the quiet half the only backstop is `runCheck`'s
 * `PASS + examined 0 → SKIPPED` rule, and that fires ONLY if the gate keyed
 * `examined` to content it actually read.
 * ▶ SO, GATE AUTHORS OF TASKS 3-12: KEY `examined` TO CONTENT, NEVER TO A FIXED LEG
 * COUNT. A gate reporting a constant — Plan B's own E9 test asserts
 * `expect(r.examined).toBe(5)`, its five legs — reports PASS with examined 5 over a
 * ctx carrying nothing, and the CLI exits 0. → active register §C82 L6.
 *
 * 🔴 WHOEVER BUILDS THAT LOADER: IT WILL READ THE READ-ONLY OPENSTAX SOURCE TREE,
 * AND THAT MAKES THIS TOOL A PROV-1 TOUCHER. `tools/__tests__/source-write-guard.test.js`
 * keeps an ALLOW set of top-level `tools/*.js` naming that directory, each entry
 * classified read-only or writer; a new name goes red until a reviewer classifies
 * it. **Expect that red, and treat it as the review prompt it is — do not silence
 * it by adding the filename before the classification is true.** This file is
 * deliberately NOT in the set today: it performs no I/O at all (no `fs` import),
 * and listing a non-toucher would dilute the tripwire for the one moment it exists
 * to catch. ⚠️ Note the guard's own SCOPE comment: it nets top-level `tools/*.js`
 * ONLY, so the tier modules under `tools/lib/` are invisible to it.
 * → active register **§C82 L10** — cite it qualified, always: an unrelated `L10`
 * already exists in that file under the embed backlog (physics `m42074`), because
 * the L-numbers are item-scoped rather than global.
 */
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/parseArgs.js';
import { REGISTRY, runCheck, VERDICT } from './lib/remt-battery.js';

/* ── THE REGISTRY WIRING POINT ────────────────────────────────────────────────
 * 🔴 IMPORT EACH TIER MODULE HERE AS IT IS BUILT. Nothing else does.
 *
 *   import './lib/remt-checks-glossary.js';   // Task 7  — G1-G5
 *   import './lib/remt-checks-extract.js';    // Tasks 3-6 — E1-E7, E9
 *   import './lib/remt-checks-mt.js';         // Tasks 8-10 — A1-A8
 *   import './lib/remt-checks-output.js';     // Task 11 — R1-R5
 *   import './lib/remt-checks-chapter.js';    // Task 12 — K1-K3
 *
 * Each module calls `registerChecks()` at import time; importing it here is the
 * ONLY thing that puts its checks in the REGISTRY. Measured (register §C82 L3):
 * no task in either plan ever calls `registerChecks()` — Plan B's two occurrences
 * of `registerChecks(` are its doc comment and its definition, and the third
 * mention is an import BINDING, which a keyword grep cannot tell from a call.
 *
 * ⚠️ DO NOT instead import the tier modules from `lib/remt-battery.js`. Measured:
 * import hoisting evaluates the tier module BEFORE this module's own top-level
 * bindings exist, so the first binding it touches dies in the temporal dead zone:
 * `ReferenceError: Cannot access '<binding>' before initialization`. WHICH binding
 * depends on the tier module's shape — with Task 3's (a top-level `defineCheck`
 * call) it is `MIN_TIER`; a top-level `VERDICT` read names `VERDICT`. State the
 * class, not one identifier. The CLI is the right place precisely because it is
 * downstream of the contract.
 *
 * ⚠️ EACH IMPORT BELOW CHANGES WHAT `--tier N` SELECTS, AND THIS FILE'S OWN PROCESS
 * TESTS SPAWN WITH `--tier 1`. Measured when Tier 1 was wired: THREE went red — the
 * empty-registry test (the registry is no longer empty at tier 1) and the two
 * positive controls that expect exit 0, because E2/E4 now run beside the probe's
 * check over a scope-only ctx and read SKIPPED, which for a blocking check is a
 * blocking failure.
 * 🔴 AND TWO MORE WENT QUIETLY WRONG RATHER THAN RED, which is the half worth
 * remembering: the tests expecting exit 1 kept passing — E2/E4 now supply that 1 no
 * matter what the probe returns, so they had stopped discriminating. A red count is
 * not the measure of this change; every probe test needed its synthetic check to be
 * the SOLE determinant again.
 * ▶ Register §C82 L11 predicted this class for Tasks 11/12 and named the wrong task:
 * it fires at the FIRST tier wired. Its prescribed fix — save/clear/restore of
 * `REGISTRY` around the tests — works only for the in-process half, because a spawned
 * CLI has its own module instance the parent cannot reach into. The preload clears on
 * the child's own side; see the `probe` helper's comment for why the clear must
 * follow an import rather than precede it.
 * ─────────────────────────────────────────────────────────────────────────── */
import './lib/remt-checks-glossary.js'; // Task 7 — G1-G5 (tier 0)
import './lib/remt-checks-extract.js'; // Tasks 3-6 — E1-E7, E9 (tier 1)
import './lib/remt-checks-mt.js'; // Task 8 — A1, A6, A2b, A2c (tier 2); Task 9 adds A2a/A4/A8
import './lib/remt-checks-output.js'; // Task 11 — R1-R5 (tier 3)
import './lib/remt-checks-chapter.js'; // Task 12 — K1-K5 (tier 4)

/** Tiers the battery defines: 0 glossary · 1 extract · 2 MT · 3 output · 4 chapter. */
export const TIER_MIN = 0;
export const TIER_MAX = 4;

/**
 * Validate a `--tier` value from its RAW STRING form.
 *
 * 🔴 THE RAW STRING IS THE ONLY PLACE THE ERROR IS STILL VISIBLE, which is why
 * `--tier` is declared `type: 'string'` below instead of `type: 'number'`.
 * `parseArgs` coerces numbers with `parseInt(raw, 10)` — at parseArgs.js:179 (the
 * spaced `--tier 1` form) and :165 (the inline `--tier=1` form), with a third in
 * CHAPTER_OPTION at :65. (This cited one site, ":178", which is the `else if`
 * ABOVE the call rather than the call.) And
 * `parseInt` TRUNCATES: `parseInt('1.5')` is 1 and `parseInt('1abc')` is 1. By the
 * time a numeric guard runs, both look like a legitimate tier 1. `parseInt('abc')`
 * is NaN, and the plan's guard `if (args.tier == null)` misses it because
 * `NaN == null` is false — after which `c.tier === NaN` selects nothing and the run
 * exits 0. → active register §C82 L4.
 *
 * @param {unknown} raw
 * @returns {number|null} the tier, or null if absent or not a bare 0-4
 */
export function parseTier(raw) {
  if (typeof raw !== 'string' || !/^[0-4]$/.test(raw)) return null;
  return Number(raw);
}

/**
 * Run every check in a tier over one scope.
 *
 * 🔴 AN EMPTY SELECTED SET THROWS. It is the tier-level twin of the contract's
 * `examined 0` rule: a run that judged nothing must not report clean. It throws
 * rather than returning a flag because Plan C's driver decides from
 * `blockingFailures`, and a `selected: 0` field is one a consumer can simply not
 * read — an exception is not. The CLI maps it to exit 2, so `exitCodeFor` keeps its
 * documented 0/1 contract.
 *
 * @param {number} tier
 * @param {object} ctx     see the CheckContext typedef above
 * @param {Array}  [checks] explicit set, for tests; otherwise selected from REGISTRY
 */
export async function runTier(tier, ctx, checks) {
  const set = checks || [...REGISTRY.values()].filter((c) => c.tier === tier);
  if (set.length === 0) {
    throw new Error(
      `tier ${tier}: no checks selected (registry holds ${REGISTRY.size}) — refusing to report a clean run over an empty set`
    );
  }
  const results = [];
  for (const c of set) results.push(await runCheck(c, ctx));
  // 🔴 A SKIPPED BLOCKING CHECK COUNTS AS A FAILURE. It examined nothing, so it
  // supplied no evidence — and a gate that supplied no evidence must not let a
  // paid module through. This is the amendment's "treat 'examined 0 units' as a
  // failure in its own right, not infer a pass from exit 0."
  //
  // ⚠️ `examined === 0` IS ITS OWN CLAUSE, NOT A RESTATEMENT OF `SKIPPED`. The rule
  // above is general; the verdicts are not symmetrical under it. PASS+0 is downgraded
  // to SKIPPED upstream in `runCheck`, and FAIL+0 is caught by the FAIL clause — but
  // **WARN+0 was the one green cell**, measured: `WARN W0 v1 (examined 0)` … exit 0,
  // a blocking gate that looked at nothing letting a paid module through.
  // ▶ Two other repairs were considered and are WRONG. Downgrading WARN→SKIPPED in
  // `runCheck` ERASES the check's findings and message. And `defineCheck` cannot
  // decide at construction whether a check may return WARN — the spec has R3 blocking
  // *and* WARN-returning at once. Widening this filter is the only repair that keeps
  // the evidence intact; a WARN that DID examine still exits 0.
  const blockingFailures = results.filter(
    (r) =>
      r.blocking &&
      (r.verdict === VERDICT.FAIL || r.verdict === VERDICT.SKIPPED || r.examined === 0)
  );
  return { tier, results, blockingFailures };
}

/** 0 all blocking checks passed · 1 a blocking check failed or was SKIPPED. */
export function exitCodeFor(run) {
  return run.blockingFailures.length > 0 ? 1 : 0;
}

// CLI entry — only when invoked directly. This is the repo's dominant idiom
// (18 sites); the `file://${process.argv[1]}` spelling breaks on any path needing
// URL escaping, and would silently turn the CLI into a no-op import.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(2);
  });
}

/** Usage or environment error. Always exit 2 — never 1, which means "a gate failed". */
function usage(message) {
  console.error(`Error: ${message}`);
  process.exit(2);
}

async function selfTest() {
  // Defined in Task 13. Stubbed loudly so the CLI never silently no-ops: a
  // --self-test that prints nothing and exits 0 is indistinguishable from one that
  // planted a defect and found it.
  usage('--self-test is not implemented yet (Plan B Task 13)');
}

async function main() {
  // 🔴 FAILURE DEFAULT. A run that never reaches a verdict must not exit 0, and the
  // way it gets there is not a hang: a check returning `new Promise(() => {})` holds
  // NO handle, so Node's event loop empties and the process exits NORMALLY with 0,
  // having produced no output, run no later checks, and never computed
  // `blockingFailures`. Measured under `timeout 8` — it returned 0, not 124. Standing
  // at 2 until a verdict overwrites it is what makes that shape visible.
  process.exitCode = 2;

  const args = parseArgs(process.argv.slice(2), [
    { name: 'book', flags: ['--book'], type: 'string' },
    // `--chapter` is a STRING on purpose: chapter 0 is falsy as a number (the
    // truthiness bug Plan A fixed in four tools and audit-render-output still has),
    // and `appendices` is a legitimate value that is not a number at all.
    { name: 'chapter', flags: ['--chapter'], type: 'string' },
    { name: 'module', flags: ['--module'], type: 'string' },
    { name: 'tier', flags: ['--tier'], type: 'string' },
    { name: 'json', flags: ['--json'], type: 'boolean', default: false },
    { name: 'selfTest', flags: ['--self-test'], type: 'boolean', default: false },
  ]);

  if (args.selfTest) return selfTest(args);
  if (!args.book) usage('--book is required (e.g. --book efnafraedi-2e)');
  if (args.tier == null) usage(`--tier is required (${TIER_MIN}-${TIER_MAX})`);

  const tier = parseTier(args.tier);
  if (tier === null) {
    usage(
      `--tier must be a bare integer ${TIER_MIN}-${TIER_MAX}, got ${JSON.stringify(args.tier)}`
    );
  }

  const run = await runTier(tier, {
    book: args.book,
    chapter: args.chapter,
    module: args.module,
  });

  if (args.json) {
    console.log(JSON.stringify(run, null, 2));
  } else {
    for (const r of run.results) {
      console.log(
        `${r.verdict.padEnd(7)} ${r.id} v${r.version} (examined ${r.examined}) ${r.message}`
      );
    }
  }
  // 🔴 `process.exitCode`, NEVER `process.exit()`, WITH OUTPUT IN FLIGHT. Node writes
  // stdout to a PIPE asynchronously, so `process.exit()` discards whatever is still
  // queued: measured at exactly 65,536 bytes (the pipe buffer), 3 runs of 3, against
  // 150,342 valid bytes through a `>` redirect — with the exit code correct in both.
  // `--json` exists to be piped and the standing rule is "read --json, apply the
  // battery's threshold", so a consumer doing exactly the right thing received a
  // truncated document. A `>` redirect is synchronous and stays clean, which is why a
  // hand check misses this entirely.
  // ⚠️ DO NOT extend this to `usage()` or the `main().catch` — measured: `usage()`
  // then falls through to the rest of main and the run exits 0. Those two keep
  // `process.exit(2)`.
  // ⚠️ TRADE-OFF, stated rather than discovered later: `process.exitCode` waits for
  // the event loop to drain, so a future ctx loader leaving a handle open would make
  // this hang instead of exiting. A hang is louder than a wrong 0 — that is the trade
  // being accepted here.
  process.exitCode = exitCodeFor(run);
}
