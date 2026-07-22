# C1d — Appendix write-path publish enablement (design)

**Date:** 2026-07-22 · **Campaign item:** C1 (Appendices support batch), **PR-4** · **Register:** the C1a-logged write-path fail-closed mechanism
**Baseline:** main `2a990e67` (C1b PR-2 #324 merged) · **Plan:** `docs/plans/2026-07-21-post-item17-followup-campaign.md`
**Predecessors:** C1a read-path (#323), C1b registration (#324), C1c read-path stragglers (sibling PR-3) — the last is independent of this one.

## Problem

Appendix **publish** is fail-closed. C1a made the shared `validateChapterParams` accept `-1`, so a POST to `/api/publication/:book/:chapter/mt-preview` with `chapter=appendices` now *reaches* `publishChapter` — but it cannot succeed:

1. **`server/services/publicationService.js` `validateBeforePublish` (`:124`)** spawns `tools/validate-chapter.js` passing the chapter as **`String(chapterNum)`** (`:129`) → `"-1"` on argv.
2. **`tools/validate-chapter.js` `parseArgs` (`:983`, `!arg.startsWith('-')`)** treats `"-1"` as a **flag**, not the chapter positional → `args.chapter` stays null → `main()` exits "Please provide book and chapter" (empty stdout) → `validateBeforePublish` rejects on empty JSON → the route catch-all 500s (verified in C1a). `runPipeline` is never reached, so it fails **closed** (no write) — but appendix publish is impossible.
3. Even past `parseArgs`, `validate-chapter.js` builds every source/structure dir as `` `ch${String(chapter).padStart(2,'0')}` `` (`:703/:762/:816/:854/:898` + `:900/:901/:935`) → `ch-1`, which would not exist.

The publish *output*-dir path in `publicationService` (`:312`) already handles appendices (`chapterNum === -1 ? 'appendices' : padStart`), so the ONLY gaps are the validate step's argv + `validate-chapter.js`'s arg-parse and dir-builds.

**This is forward-looking:** no faithful appendix content exists to publish today (C1b registration just landed; no appendix segments reviewed). This PR removes the last structural block so the first appendix *can* be published once its content is ready. mt-preview is publishable immediately (it needs only `02-mt-output/appendices`, which exists); faithful/localized remain gated by `checkTrackReadiness` (empty dirs) until content exists — that gate is correct and unchanged.

## Canonical form (unchanged)

Convert through `server/lib/chapterLabel.js`: `cliChapterArg(-1)→'appendices'` (the CLI-argv form), `normalizeChapter('appendices'|'-1')→-1`, `chapterDir(-1)→'appendices'`.

## Approach

### B1. `publicationService.validateBeforePublish` (`:129`)
Pass **`chapterLabel.cliChapterArg(chapterNum)`** instead of `String(chapterNum)` → sends `'appendices'` on argv for the appendix chapter (numeric chapters unchanged: `cliChapterArg(5)='5'`). `cliChapterArg` exists exactly for this `-1`-over-argv hazard.

### B2. `tools/validate-chapter.js` `parseArgs` (`:983`) — robust chapter positional
Recognize the chapter positional even when it is `'appendices'` or a bare `-1`. `'appendices'` already passes `!arg.startsWith('-')`; a raw `-1` (human CLI) currently does not. Fix `parseArgs` so an arg that `normalizeChapter(arg) !== null` (i.e. `'appendices'`, `'-1'`, or a plain integer) is captured as the chapter positional before the generic flag branch. Store the raw arg; normalize once in `main()`.

### B3. `tools/validate-chapter.js` dir-builders — respect BOTH conventions
Once `parseArgs`/`main` normalizes the chapter to an integer (`-1` for appendices), fix the dir-builders. **`validate-chapter.js` has the same two-convention split as the rest of the repo (C1a durable rule):**
- **`ch`-prefixed source/structure dirs** (`:900` `02-structure/ch${chapterStr}`, `:901` `01-source/ch${chapterStr}`, `:935`) → `chapterLabel.chapterDir(chapter)` (gives `ch05` / `appendices`).
- **bare pub-output dirs** (`:706/:765/:819/:857`, all `trackConfig.pubDir/chapters/${chapterStr}`) → a bare, appendix-aware form `chapter === -1 ? 'appendices' : String(chapter).padStart(2,'0')` (**NOT** `chapterDir`, which would wrongly give `ch05` for the bare pub dir). Introduce one small local helper (e.g. `pubChapterDirName(chapter)`) to keep the 4 pub sites DRY.
Numeric chapters byte-identical in both conventions. **`validate-chapter.js` is ESM** (root `type:module`; it already uses `import fs from 'fs'` etc. + `import.meta.url`), while `server/lib/chapterLabel.js` is CJS (`module.exports`) — bring it in via `createRequire(import.meta.url)` (the C1b backfill pattern) or a default `import chapterLabel from '../../server/lib/chapterLabel.js'` (Node ESM↔CJS default-interop); the plan picks the exact form.

### B4. End-to-end publish path
With B1–B3, a POST `…/appendices/mt-preview` (mt-preview readiness true — `02-mt-output/appendices` exists) reaches `validateBeforePublish` → spawns `validate-chapter.js efnafraedi-2e appendices --track mt-preview` → the tool resolves `appendices` dirs → returns valid JSON → `publishChapter` → `runPipeline` writes to the already-appendix-aware output dir (`:312`). faithful/localized stay `checkTrackReadiness`-gated (empty dirs) — unchanged, correct.

## Testing

Root `npm test` (Vitest) is the authoritative gate.
- **`validate-chapter.js parseArgs` (B2):** unit-test that `parseArgs(['book','appendices'])` and `parseArgs(['book','-1'])` both capture the chapter (not dropped as a flag); a plain `parseArgs(['book','5'])` unchanged; a real flag (`--track`) still parsed as a flag.
- **`validate-chapter.js` dir resolution (B3):** the tool resolves `01-source/appendices` / `02-structure/appendices` (not `ch-1`/`chappendices`) for the appendix chapter; a numeric chapter still resolves `chNN` (byte-identical) — assert against real `books/efnafraedi-2e/…/appendices` fixtures.
- **`validateBeforePublish` (B1):** the spawned argv contains `appendices` (not `-1`) for the appendix chapter, `5` for chapter 5. If practical, an integration test that `validateBeforePublish(book, -1, 'mt-preview')` returns parseable (non-empty) JSON instead of the empty-stdout 500.
- **Publish route (B4):** POST `…/appendices/mt-preview` no longer 500s at the validate step (reaches readiness/publish); faithful/localized still fail-closed with the readiness error (empty dirs) — assert the failure *reason* changed from "validate 500" to "readiness" for faithful, and to success/publish for mt-preview.

## Out of scope
- **C1c read-path stragglers + U3a** — sibling sub-project (`2026-07-22-c1c-…`), independent.
- **U3b** `server/data/*.json` inconsistency — backlog.
- Producing/reviewing appendix content, re-render, vefur delivery. **Actually publishing an appendix on prod is a separate editorial action**, not this PR.

## Risks / constraints
- **No behavior change for numeric chapters** — `cliChapterArg(N)=String(N)`, `chapterDir(N)=chNN`, `parseArgs` unchanged for integer/flag args; every numeric path byte-identical. Guard with a numeric-chapter regression assertion (the C1b lesson: pin byte-identity, don't just reason).
- **Fails-safe preserved** — until content exists, faithful/localized still fail closed on readiness; this PR must not open a write path that bypasses readiness. mt-preview publish for appendices is the one newly-enabled write, and only when `02-mt-output/appendices` exists.
- **`validate-chapter.js` is widely used** (all publish validation) — the dir-builder change touches numeric publishing too; the full suite + a numeric-chapter pin are the gate against regression.
- **Prod:** no data-op; the first actual appendix publish is a later editorial action once appendix content is reviewed. Deploy still gated by A4.
