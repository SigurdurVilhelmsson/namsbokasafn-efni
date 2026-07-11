# Design — F2: guard `01-source/` against silent overwrite (source-provenance safety)

**Date:** 2026-07-02. **Status:** design drafted; awaiting lead review (three forks decided by
recommended default while lead was away — see *Decisions*). **Scope:** provenance safety only — no
content changes, no pipeline behavior changes beyond refusing an overwrite. **Type:** defensive
hardening.

Part of the chemistry clean-slate arc (`docs/plans/2026-07-01-chemistry-clean-slate-design.md`),
re-prioritized to **DO-FIRST** by the Fable-5 fidelity/provenance review
(`docs/audit/2026-07-02-fable5-fidelity-provenance-review.md`, finding 2). F2 is the only
*irreversible* item on that list, so it lands before F1/F3–F8/WS4/WS5 and before biology onboarding.

## Why this exists

`books/*/01-source/` holds the **legally load-bearing** OpenStax CNXML — the copies whose CC BY 4.0
licence is irrevocable *for the bytes obtained on the fetch date* (CLAUDE.md top rule; provenance
record `docs/provenance/openstax-cnxml-licence-provenance.md`). OpenStax has since relicensed
Chemistry/Biology/Microbiology CC BY → CC BY-NC-SA. Replacing a local copy with a fresh upstream pull
silently substitutes today's CC BY-NC-SA bytes for the irrevocable CC BY copy — destroying the
provenance basis, undetectably, and reversible only by git archaeology.

CLAUDE.md forbids this in prose (triple-consent rule) but **nothing in code enforces it**, and there
is **no checksum** by which a swap could be detected after the fact. Two concrete gaps (Fable-5
finding 2, hand-verified):

1. **`POST /api/admin/books/:slug/fetch-source`** re-downloads upstream and `fs.copyFileSync`s over
   `01-source/`. Its only guard (`checkBookDownstreamWork`, `pipelineService.js:598–637`) fires only
   when `totalFaithful > 0 || totalLocalized > 0`. A book with full MT but no faithful/localized
   segments — **every not-yet-reviewed book, including biology** — gets **zero** confirmation;
   otherwise one generic `confirmed:true` suffices.
2. **`node tools/download-source.js`** (the CLI the server spawns via `runFetchSource`) overwrites
   `01-source/` with **no guard at all**.

Neither path is tamper-evident. The fidelity tooling compares translated CNXML against `01-source/`
*as it currently is*, so a swapped source **re-certifies green**.

## Verified current state (2026-07-02, `main` HEAD)

| Fact | Evidence |
|---|---|
| The **single real overwrite path** is `download-source.js main()` → `organizeSourceFiles()` (`download-source.js:402`). Both the CLI and the server (`pipelineService.runFetchSource` spawns the CLI) funnel through it. | `grep organizeSourceFiles` → one caller; `grep download-source` → server spawns the CLI |
| `01-source/` **is git-tracked** → a committed manifest is genuinely tamper-evident | `git ls-files books/efnafraedi-2e/01-source/ch00/` |
| A per-module `sha256(sourceContent)[:16]` **already exists** as `sourceHash` in the *generated* `02-structure/chNN/*-manifest.json` (`cnxml-extract.js:1720`), consumed by `audit-render-output.js`, `validate-chapter.js`, `check-source-updates.js` | file inspection |
| That existing hash is **not** a sufficient baseline: it lives in a *generated* dir (a re-extract after a swap recomputes it to match the new bytes → swap invisible again) and only covers *extracted* chapters (a fresh biology intake has none). | reasoning + dir listing |
| No committed checksum manifest exists anywhere | `find -name '*source-manifest*' -o -name '*.sha256*'` → none |

> **Correction (2026-07-11):** `tools/check-source-updates.js update` was a *second*, unguarded overwrite path missed by this analysis; it was removed (PROV-1). `download-source.js`'s `organizeSourceFiles` is now genuinely the only overwrite path for upstream CNXML in `01-source/`, enforced by `tools/__tests__/source-write-guard.test.js`. (The other sanctioned `01-source` writers — `generate-source-manifest.js`'s provenance manifest and `resolve-os-embed.js`'s downloaded media/exercise JSON — never touch CNXML.)

**Design consequence of the existing `sourceHash`:** F2's committed manifest reuses the **same
algorithm** (`sha256` of the raw CNXML bytes) so the two cross-check rather than diverging. The
existing `02-structure` value is the 16-char prefix of F2's full-length hash.

## Threat model (what F2 defends, and what it does not)

- **In model:** a *silent* substitution of `01-source/` CNXML — accidental (`git pull`/rebase/merge,
  rsync, manual copy, an unthinking re-fetch) or careless — that changes the provenance-bearing bytes
  without a deliberate, recorded human decision. Goal: make it **impossible from prod (the server)**
  and **loudly detectable everywhere else** (fail `npm test`).
- **Out of model:** a determined insider with repo write access who edits the CNXML *and* regenerates
  the committed manifest *and* commits both. F2 raises that to a deliberate, reviewable, git-recorded
  act — which is the point; it is not cryptographic anti-tamper. The 16→64-char hash is for
  drift/accident detection, not an adversary.

## The two defenses (and why both are needed)

Refuse-overwrite closes **only** the `download-source.js` vector. CLAUDE.md names others — rsync,
manual copy, extract, a bad merge. The committed manifest + test is the backstop that catches those.
The two are complementary, not redundant.

---

### Defense 1 — Refuse-overwrite (closes the fetch-source vector)

**Core guard — in the single shared function.** `organizeSourceFiles()` gains an
`allowOverwrite = false` parameter. Before copying anything, it checks whether the target `sourceDir`
already contains any `*.cnxml`. If it does and `allowOverwrite` is false, it **throws loud**:

> `Refusing to overwrite populated 01-source/ for '<book>' (<n> CNXML files present). These are the
> irrevocable CC BY provenance copies. To intentionally replace them, follow the CLAUDE.md
> double-consent rule, delete 01-source/ by hand, then re-run with --allow-overwrite-source.`

Placing the guard *inside* `organizeSourceFiles` (not just in `main()`) defends the function against
any future caller, not only today's CLI entry point.

**CLI escape hatch (human path only).** `download-source.js` `parseArgs` gains
`--allow-overwrite-source` → `args.allowOverwrite = true`, threaded into `organizeSourceFiles`. This
is the deliberate, documented path for the rare intentional re-fetch, gated by CLAUDE.md's
double-consent as a **human process** (F2 does not automate consent).

**The escape hatch cannot reach prod.** `pipelineService.runFetchSource` builds the CLI argv and
**never** includes `--allow-overwrite-source`. A regression test asserts the spawned args can never
contain that flag — per `feedback-robustness-over-expedience` ("escape hatches can't reach prod").

**Endpoint pre-check (clean UX + defense in depth).** `POST …/fetch-source` gains an early check:
if `01-source/` for the slug already contains CNXML, it returns **409** with a message telling the
operator to delete `01-source/` by hand for a deliberate re-fetch (mirroring the guard text). This
replaces the current fail-open guard. Fetching into an **empty** `01-source/` — fresh intake, e.g.
biology onboarding — still works normally.

**Partial-fetch recovery** (a fetch that died mid-copy leaves a partly-populated dir): resolved as
"operator deletes `01-source/` by hand, then re-fetches into the empty dir." We deliberately do **not**
try to auto-distinguish a partial from a complete source — simpler and safer than a heuristic.

**Untouched:** `checkBookDownstreamWork` / the `confirmed` flow stay as an *additional* warning about
losing downstream `02-*`/`03-*` work; they are no longer the provenance guard (the populated-source
409 is). We leave that behavior in place rather than widen this PR.

### Defense 2 — Committed checksum manifest + test backstop (catches every other vector)

**Manifest file** (committed, one per book): `books/<book>/01-source/.source-manifest.json`

```json
{
  "version": 1,
  "book": "efnafraedi-2e",
  "algorithm": "sha256",
  "generatedAt": "2026-07-02T00:00:00.000Z",
  "note": "Tamper-evidence baseline for the CC BY 01-source CNXML. Regenerating this to match an upstream swap destroys the provenance basis — see CLAUDE.md source-overwrite rule.",
  "files": {
    "appendices/m68914.cnxml": "<64-char sha256 hex>",
    "ch00/m68662.cnxml": "<64-char sha256 hex>",
    "ch01/m68674.cnxml": "<64-char sha256 hex>"
  }
}
```

- **Scope: `*.cnxml` only** (Q2). The legally load-bearing text. `media/`, `docx/`,
  `collection-order.json`, `.source-info.json` are excluded (media churns; `.source-info.json` is
  legitimately rewritten on fetch).
- Keys: posix-relative-to-`01-source/` paths, sorted, for **every** `.cnxml` found recursively.
- Values: full 64-char `sha256` hex — the extract manifest's `sourceHash` is the first 16 chars of the
  same value (cross-checkable).

**Pure lib** `tools/lib/source-manifest.js` (no I/O beyond reads; unit-testable):
- `computeSourceManifest(sourceDir, { book }) → { version, book, algorithm, generatedAt, files }`
- `verifySourceManifest(sourceDir) → { ok, manifestMissing, changed[], missing[], added[] }`
  — reads the committed `.source-manifest.json`, recomputes, and diffs. `manifestMissing` and any
  non-empty `changed/missing/added` ⇒ `ok:false`.

**CLI tools** (run from repo root; resolve paths via `import.meta.url`, never `process.cwd()`):
- `tools/generate-source-manifest.js [--book <slug> | --all]` → writes/overwrites the manifest.
  **Deliberately separate from fetch** — generating the manifest is an *intentional provenance act*.
  It is **never** auto-run by `download-source.js`; if it were, a swap-then-refetch-into-empty would
  mint a fresh manifest matching the swapped bytes and defeat the guard.
- `tools/verify-source-manifest.js [--book <slug> | --all]` → recompute + compare; **exit nonzero and
  print a loud per-file report** on any drift or missing manifest.

**The real "CI verifies" — a Vitest test.** Given no branch protection (memory:
`npm test` from repo root is authoritative), the test *is* the CI gate.
`tools/__tests__/source-manifest.test.js`:
- **Real-tree guard:** for each book with a populated `01-source/`, `verifySourceManifest` returns
  `ok:true`. A drifted, missing-file, added-file, or missing-manifest book fails `npm test`.
- **Fixture unit tests** (temp dir): detects a changed byte, a deleted file, an added file, and a
  missing manifest (each fail-loud), and a clean tree passes.

**Baseline generation (Q3): all books with populated `01-source/`** — efnafraedi-2e, liffraedi-2e,
orverufraedi, edlisfraedi-2e, lifraen-efnafraedi. Run `generate-source-manifest.js --all`, eyeball,
commit the `.source-manifest.json` files. This is the provenance snapshot; from here `verify` guards
it. (Missing-manifest is fail-loud, so every populated book must have one after this PR — no silent
skip.)

## What this design deliberately does NOT do (YAGNI)

- No cryptographic signing / no bespoke GitHub Action — the Vitest test is the gate.
- No auto-regeneration of the manifest on fetch (would defeat tamper-evidence).
- No change to `checkBookDownstreamWork` semantics beyond it no longer being the provenance guard.
- No touching `01-source/` bytes (F2 only *reads* them to hash — no consent trigger; a guard + hashing
  overwrite nothing).

## Components & isolation

| Unit | Purpose | Depends on |
|---|---|---|
| `organizeSourceFiles(allowOverwrite)` guard | refuse populated-source overwrite | fs |
| `download-source.js --allow-overwrite-source` | human force path | organizeSourceFiles |
| `runFetchSource` (unchanged argv) + endpoint 409 | prod can never overwrite | pipelineService |
| `tools/lib/source-manifest.js` | compute/verify (pure) | fs, crypto |
| `generate-source-manifest.js` / `verify-source-manifest.js` | write / check | source-manifest lib |
| `source-manifest.test.js` | the CI gate | source-manifest lib, real tree |

## Testing

- Defense 1: `organizeSourceFiles` throws on populated target w/o flag; proceeds with flag (temp-dir
  fixtures). `runFetchSource` spawn argv never contains `--allow-overwrite-source`. Endpoint returns
  409 on populated source (unit on an `isSourcePopulated(slug)` helper, or route integration test).
- Defense 2: the fixture + real-tree tests above.
- Full `npm test` + `npm run validate` green from repo root; no regressions in the existing
  `source-downloader.test.js`.

## Definition of done

- Server cannot overwrite a populated `01-source/` (409); CLI can only via the explicitly-named flag;
  a test proves the flag can't reach the server argv.
- Every book with a populated `01-source/` has a committed `.source-manifest.json`; `npm test` fails
  on any drift or missing manifest.
- No `01-source/` bytes changed by this PR; `npm test` + `npm run validate` green from repo root.

## Decisions

Three forks were put to the lead (2026-07-02); lead was away, so each took its **recommended default**
(also advisor-endorsed). Revisit at spec review if desired:

1. **Refuse policy** → *Server refuses; CLI force only.* No overwrite path reachable from prod; a
   deliberate re-fetch is a human CLI act under double-consent.
2. **Manifest scope** → *CNXML only.* The legally load-bearing surface.
3. **Baseline coverage** → *All books with populated `01-source/`.* Protects all three CC BY titles
   (Chemistry, Biology, Microbiology), not just the two in the current path.

## Out-of-scope finds to log (register: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`)

- None new yet; F1/F3–F8 remain tracked in the clean-slate re-prioritization. If baseline generation
  surfaces a book whose `01-source/` disagrees with its `02-structure` `sourceHash` prefix, that is a
  pre-existing drift to log, not a F2 regression.
