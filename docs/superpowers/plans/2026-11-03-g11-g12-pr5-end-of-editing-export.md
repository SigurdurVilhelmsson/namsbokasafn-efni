# G1.1 + G1.2, PR5 — the end-of-editing export and the research exports — Implementation Plan

> **For agentic workers:** execute this plan task by task, in order, test first. Steps use checkbox (`- [ ]`) syntax.
> No plan-execution skill is installed in this repository, so follow the steps as written. **The tree wins:** where a
> measurement disagrees with this plan, stop, say so, and re-derive; never force the plan's expectation. Read
> [the index](2026-11-03-g11-g12-served-versions-and-event-log.md) first, then the PR1, PR2, PR3 and PR4 plans'
> "Interfaces produced for later PRs" and "Handoff" sections: the index's decisions, its test placement and its Global
> Constraints, and those handoffs, bind this plan.

**Goal:** after editing ends, one admin script writes, for every segment occurrence of a book, the served version its
final text was made on (as a content key), that text's hash and its state (spec §5.19 (b), A2); a second writes a
per-module yes/no, *opened after the first switch-on*, with no time (§5.22); a third copies the research file's events
for analysis with every served-version id replaced by its content key (§5.19's last bullet). None runs inside the
server, none writes under `books/`, and none carries an editor key into the end-of-editing export or a time into the
eligibility file.

**Architecture:** no migration, no route, no client file. The end-of-editing tag enters as a git ref (`--ref`), read
from git objects, never from the working tree (`server/scripts/lib/endOfEditingTree.js`). Modules are paired by the
loader's own pairing, which Task 1 lifts out of `segmentParser.loadModuleForEditing` into a pure function
(`pairForEditing`) without changing the loader's output, so every hash in the export is over the string the editor was
served. `server/lib/servedVersionKey.js` derives the content key from a stored `served_text_versions` row.
`server/scripts/export-served-versions.js` decides each occurrence's state by value against the tag and writes three
flat files to PR4's `researchFilesFor(researchPath).servedVersionExportsDir` (`pipeline-output/served-version-exports/`
on production). `server/lib/openingEligibility.js` holds the one eligibility rule (for this PR and for G1.23), and
`server/scripts/opening-eligibility.js` writes one flat file to PR4's `exportsDir` (`pipeline-output/research-exports/`
on production). `server/scripts/research-export.js` reads `research.db` only through PR4's admin reader
(`server/scripts/lib/researchAdmin.js`) and writes three flat files to the same directory, which PR4's deletion empties.
Every directory is derived when a script runs, from PR4's `researchFilesFor`, never a second time here.

**Tech Stack:** Node 22, CommonJS under `server/`, better-sqlite3 13 (only in `server/node_modules`), git (`git
rev-parse`, `git ls-tree`, `git cat-file`) through `child_process.execFileSync`, Vitest from the repository root.

**Spec, and the read order:**
1. [The index](2026-11-03-g11-g12-served-versions-and-event-log.md): decisions 1–17 (for this PR 6, 9, 15, 17), the
   PR5 row of "The five PRs", the test placement table (T17's PR5 part, T22) and the Global Constraints.
2. [The PR1 plan](2026-11-03-g11-g12-pr1-served-versions-core.md): "Interfaces produced for later PRs"
   (`servedText.js`, `researchScope.js`, `servedVersions.js`, `researchBoundary.test.js`) and its decisions 2, 10 and 12
   (the columns this PR reads, and that a re-save and an accept store them).
3. [The PR2 plan](2026-11-03-g11-g12-pr2-opening-record.md): "Interfaces produced" (`module_openings`) and its helper
   `filesNaming` in `researchBoundary.test.js`.
4. [The PR3 plan](2026-11-03-g11-g12-pr3-event-log.md): "Interfaces produced" (`researchSchema.js`, `bookSwitches.js`,
   `researchDbPath.js`, `researchBoundary.test.js`'s `FORBIDDEN_TABLES` and `forbiddenTableUses`) and its "Handoff to
   PR4", whose last paragraph is addressed to this PR.
5. [The PR4 plan](2026-11-03-g11-g12-pr4-deletion-and-backups.md): its "Interfaces produced" and "Handoff to PR5"
   (binding), its admin reader `server/scripts/lib/researchAdmin.js` (`openResearch`, `iterateEvents`,
   `itemsForEvent`, Task 4), `researchFilesFor` (`server/lib/researchFiles.js`, Task 2), `nonScriptFilesNaming` in
   `researchBoundary.test.js` (Task 4), and the deletion that empties `exportsDir`.
6. [The spec](../specs/2026-11-03-served-version-and-event-log-design.md), whole; for this PR §4 (R1's note, R5, A1, A2),
   §5.2, §5.3, §5.5, §5.13, §5.15 step 4, §5.16, §5.19, §5.22, §10 (T17, T22) and §11. Frozen and approved as written,
   with one dated `✏️ AMENDED` block (`researchScope.js` in PR1); this plan does not reopen §14.
7. [The decision record](../../decisions/2026-11-03-research-capture-consent-and-retention-rulings.md): R1, R5, A1, A2.
8. [G1.23's spec](../specs/2026-11-02-suggestion-view-design.md) §6.2 (eligibility per unit) and §8.
9. [The handoff](../../plans/2026-11-03-g11-g12-implementation-plan-handoff.md) §4 PR5 (frozen; pinned to `d24681b8`,
   whose `server/` equals `ed10180c`'s).

## State of this plan (read first)

- **Written 2026-11-03 for [USER]'s approval, as one of the five PR plans the index lists. No code before [USER]
  approves it.** Status lives in the register, never here.
- **Pinned to `main` = `ed10180c` (code byte-identical at `b6212d99`, where it was read), with PR1–PR4 assumed
  merged.** Every `path:line` below was opened at that tree. Where PR1–PR4 change a file, the text says "as PR*n* leaves
  it" and the edit is matched on the named construct. Once an earlier task here has shifted a file, do the same.
- **PR4's plan was written after this one's first draft, and this revision consumes it as named there.** PR4 fixes
  the admin reader (`server/scripts/lib/researchAdmin.js`: `openResearch({ researchPath })`, `iterateEvents(db)`,
  `itemsForEvent(db, eventId)`) and every research-side directory (`researchFilesFor(researchPath)` in
  `server/lib/researchFiles.js`), and its "Handoff to PR5" binds this plan to write "both from this function (never a
  second derivation…)". So Tasks 5–8 depend on PR4's `researchFiles.js`, Task 8 also on its admin reader, and Task 9 on
  its `nonScriptFilesNaming`. Tasks 1–4 do not depend on PR4. Task 8's Step 0 confirms the names in the tree before any
  code; where they differ, stop (the tree wins).
- **Revised after review on 2026-11-04.** Decision 9's premise was false (an active acceptance and an approved,
  unapplied edit on one segment are reachable through ordinary review routes), the export directories were derived a
  second time, and Task 8 wrote against a placeholder. Each fix names the code it was checked against.
- **Every `Expected:` line is a prediction.** Most tests here need PR1–PR4 code, which is not in the tree. Measured while
  drafting, by read-only probes in a scratch directory on 2026-11-03 at `b6212d99`:
  - pairing the English and MT blobs read with `git cat-file` at `HEAD` with the loader's own normalisers gives exactly
    `loadModuleForEditing`'s `{ segmentId, en, is }` and `isSource` for every chemistry module (the working tree was
    clean). The run took about three seconds with one `git` process per blob;
  - Task 1's `pairForEditing`, rebuilt in the scratch directory on the exported normalisers, reproduces
    `loadModuleForEditing`'s `isSource` and `segments` (keys in order, `mtFinding` included) for every module of every
    book with a `02-for-mt` tree except organic, which was not read;
  - a better-sqlite3 handle opened `{ readonly: true }` runs `db.transaction(fn)()`, and a row another connection
    commits in the middle is not visible inside it (one snapshot); a read-only open of a missing file throws
    `SQLITE_CANTOPEN`;
  - `git ls-tree -r -z --name-only <commit> -- <missing path>` prints nothing and exits 0;
    `git cat-file blob <commit>:<missing path>` exits non-zero;
  - building a one-segment file with `assembleSegments` and pairing it trims surrounding whitespace, joins a single
    newline, unescapes `\[\[`, repairs `**term**` to `__term__` when the English has `__term__`, and keeps a
    `\n\n` paragraph break in the English byte for byte;
  - chemistry's `03-faithful-translation` at `HEAD` holds only `README.md`, and its `02-for-mt` holds the legacy
    `*-segments(b).en.md` files §5.19 names.
  - Task 3's `endOfEditingTree` code as written below, run with Task 1's lifts as scratch stand-ins, lists exactly
    `listChapters` × `listChapterModules` for chemistry at `HEAD`, pairs every module as the loader does, orders
    appendices last, and refuses `-c`, `--help`, `a b` and an unknown ref with `BAD_REF`;
  - Task 2's and Task 4's code, as first drafted, run the same way with a local `sha256Text`, gave T22's `m90001`
    lines `a`…`i` (state, key and final hash, Task 5's table) and passed T22's positive control. **Not re-measured
    end to end since the revision:** segments `j` and `k`, Task 8's column locator check and the call-time
    directories are new. Task 4's revised `deciderFor`, run alone on the real `editRecency` (scratch, 2026-11-04), gave
    the edit for the reachable pair, the acceptance for the restore edge and for an older unapplied edit behind a
    newer applied one, `DECIDER_CONFLICT` for two acceptances, and the occurrence matching Task 4 names;
  - Task 1's `oracle`, as written there, equals `loadModuleForEditing` minus `mtFinding` on every module of every
    book directory with a `02-for-mt` tree except organic, `__e2e-fixture__` included (a read-only scratch run on the
    unrefactored tree, 2026-11-04), so the loader-versus-oracle cases pass on their red arm as predicted;
  - better-sqlite3 13 serves a read on the same connection while an `iterate()` is open (a scratch probe on
    2026-11-04), so Task 8 could interleave `itemsForEvent` with `iterateEvents`; it materialises the events first
    anyway;
  - porcelain `git diff --quiet <commit> -- <path>` rewrote `.git/index` after a same-bytes touch even under
    `--no-optional-locks` (git 2.43), and plumbing `git diff-index --quiet` without a refresh reported that touched,
    unchanged file as changed. Task 3's `faithfulMatchesCheckout` as written there (ls-tree blob ids against
    `hash-object`) gave `true` for clean, touched-unchanged, a gitignored `*.tmp`, a change outside the layer and a
    missing book, `false` for dirty, untracked, deleted and a later commit, and left the index unwritten (a scratch
    repository, 2026-11-04);
  - `DROP TABLE` of a parent with a referencing child row and no `ON DELETE` action throws
    `SQLITE_CONSTRAINT_FOREIGNKEY` under this build's foreign keys; after `pragma('foreign_keys = OFF')` it succeeds,
    and with an `ON DELETE CASCADE` child it succeeds with foreign keys on (a scratch probe, 2026-11-04).
  Run each red arm before implementing; where it fails for another reason, stop and re-derive.
- **Commit lines below carry no trailer.** The executing session ends each commit message with its attribution trailer
  lines after a blank line (index § Global Constraints).

## Decisions taken in this plan

Each is a §13 item, a seam the spec, the index or an earlier plan leaves open, or a reading of the tree. **Decision 7
changes what the frozen spec says and needs [USER]'s yes** before it is built as written. Its fallback is stated. The
questions that change nothing unless [USER] asks are under "Questions for [USER]".

**How the end of editing enters**

1. **The end-of-editing tag is a git ref argument, `--ref <tag-or-commit>`, required, resolved once to a 40-hex commit
   and read from git objects. The working tree is never read.** Reasons:
   - **The code and the data stay independent.** The index lets PR5 merge "any time before G3.2"
     (§13a), so the tag may predate this script, or predate a later fix to it. Checking the tag out would run the tag's
     code, which may not hold the script. Reading objects runs today's script over the tag's text.
   - **It runs in any clone without touching its checkout.** On production the working tree is the server's
     own: the editor reads it, and the content cron commits from it every two hours (CLAUDE.md § Content delivery).
     Checking a tag out there is not possible. A `git worktree` at the tag has no `server/node_modules`, which is
     gitignored, so better-sqlite3 would not resolve (CLAUDE.md § Tech Stack). Objects need neither.
   - **It is reproducible.** The same commit and the same database give the same bytes (T22), and a dirty file, a
     later commit or an untracked file cannot leak in. Task 5 plants all three and shows none reaches the output.
   - Refs beginning with `-`, or holding whitespace or a NUL, are refused before git runs (option injection). An
     annotated tag peels to its commit (`<ref>^{commit}`).
   - **The checkout is compared with the tag, never read into the export.** Faithful files reach git only through the
     two-hourly backup cron (`scripts/git-backup.sh:162-163`), and a dev push strands the cron's next commit until a
     deploy (CLAUDE.md § Content delivery). A tag cut from GitHub's `main` while production holds unpushed faithful
     writes would make every such applied segment read `reviewed-but-unapplied`, with exit 0. So each report carries
     `faithfulMatchesCheckout`: whether the clone's working tree equals the commit for
     `books/<book>/03-faithful-translation/` (same non-ignored paths, same blob ids; Task 3, writing nothing). It is
     reported, not refused: in a development clone (decision 6) the checkout is not production's and may differ
     legitimately. On the production host it must read `true` before `--write` (the header's usage and the Handoff).
     It goes into the printed report only, never into the three files, so the files stay byte-identical across hosts.
2. **The export pairs each module with the loader's own pairing, lifted into a pure function, not with a copy.**
   `segmentParser.loadModuleForEditing` (`server/services/segmentParser.js:102-190`) reads files, picks the layer
   (`:112-121`), unescapes the Icelandic (`:130-136`) and pairs it (`:156-170`). Task 1 moves the layer choice,
   the unescape and the pairing into `pairForEditing({ enContent, faithfulContent, mtContent }) → { isSource, segments }`
   and makes the loader call it. The response does not change, keys and their order included (measured, "State of this
   plan"). The export calls the same function on blobs. So `seg.is` at the tag is, by construction, the string §5.3
   hashes: one mechanism, not two (§5.3; G1.23 §6.3). When G1.12 (b) makes the pairing occurrence-aware, the export
   follows without a change. Not adopted: reimplementing the chain beside the loader. A fourth copy would join
   `acceptanceService.editorViewOf` (`server/services/acceptanceService.js:64-67`, no trim) and
   `tools/export-corpus.js`'s `computePostEdited` view (`:84-90`). Also not adopted: materialising the tag into a
   temp directory and pointing the loader at it with `segmentParser._setTestBooksDir` (`:475`), a test seam used from
   production code.
3. **Module enumeration uses `listChapters`' and `listChapterModules`' own rules, lifted into two pure predicates.**
   `chapterOfForMtDir(name)` is `listChapters`' rule (`/^ch\d+$/` at `:398` → the number; `appendices` → `-1`,
   `:402-404`). `moduleIdOfEnFile(name)` is `listChapterModules`' rule (`:421`: ends `-segments.en.md` and is not
   `exercises-segments.en.md`; `:431` strips the suffix). It skips the legacy `*-segments(b).en.md` files (§5.19). Both
   list functions call the predicates (Task 1), and the export applies them to the commit's tree listing (Task 3).
   `chapter-metadata`, `ch00` and appendices are enumerated like any other module (decision 12).
4. **Which books: the study allowlist by default (`researchScope.STUDY_BOOKS`, PR1 Task 2), or one `--book <slug>`.**
   Organic (`servedText.isNotMintedBook`, PR1 Task 1) is refused before git runs or the database opens (CLAUDE.md
   § Organic). Any other book is allowed, because served versions are minted for every book but organic (§5.4) and
   G3.2 may release more than chemistry.
5. **`sessions.db` is `resolveDbPath()` (`server/lib/dbPath.js:10-15`), opened `{ readonly: true, fileMustExist: true
   }`, with every read inside one transaction (a consistent snapshot even while the server runs). There is no `--db`
   flag.** To export from a copy, set `SESSIONS_DB_PATH`: it moves `research.db` with it (§5.1's single redirect), so
   the raw research export can never pair one database's research file with another's served versions. It moves the
   output directories too, because they are PR4's `researchFilesFor(researchPath)`, beside the research file (decision
   13), so PR4's deletion always empties the directory these scripts wrote into.
6. **Where the scripts run, and what "never the running server" means here.** §5.19's "never the running server" is
   read as "never inside the server process and never through a route". Task 9 pins that no file outside
   `server/scripts/` and `server/__tests__/` (PR4's `nonScriptFilesNaming` walk: `server/index.js`, `lib/`,
   `middleware/`, `routes/`, `services/` and the rest) requires any of the three scripts or their helpers. The raw
   research export
   runs **only on the production host**, where `research.db` lives. A copy of `research.db` anywhere else is outside
   the deletion promise (§5.15, §5.19's last bullet), and so are files under a `research-exports/` that PR4's deletion
   never empties. The end-of-editing export and the eligibility file may run on the production host (read-only, after
   fetching the tag) or in a development clone with a copy of `sessions.db`. Their outputs hold no research data. The
   scripts' headers document the production-host route. A question for [USER] asks whether that reading is right.

**What a line of the end-of-editing export says**

7. **Every hash is over a served view. For an approved text the tag does not hold, the hash is over that text as the
   loader would serve it once apply wrote it. Needs [USER]'s yes.** §5.19 says `final_sha256` is "`sha256Text` of the
   final text: … the approved text for a `reviewed-but-unapplied` one". `edited_content` is stored as typed. The save
   route trims nothing (`server/routes/segment-editor.js:345-361`). Apply writes it verbatim
   (`segmentEditorService.js:1011`, then `segmentParser.saveModuleSegments` at `:1087`), and the loader trims and normalises what
   it reads back. Hashing the raw text would give one approved text two hashes, one before apply and one after, wherever a
   textarea left surrounding whitespace or a hard wrap. The view is computed by the loader's own pairing on a one-segment
   file built with `assembleSegments`, the function apply writes with (`servedViewOfText`, Task 4). So "complete"
   (decision 8) and `final_sha256` use one string. A later apply moves a line from `reviewed-but-unapplied` to
   `complete` without changing its hash. *Fallback if [USER] says no:* `final_sha256` of a `reviewed-but-unapplied`
   edit is `sha256Text(edited_content)` as stored. Decision 8 still compares views, since "is in the text at the tag"
   cannot be a raw comparison. If the answer is yes, a dated `✏️ AMENDED` block in the spec records it before Task 4
   (the procedure in PR3's "Questions for [USER]").
8. **`complete` is decided by value against the tag, never by `applied_at`.** A segment is `complete` when its decider's
   served view equals `seg.is` at the tag **and the module's layer at the tag is `faithful`**. With no faithful file at
   the tag, nothing in that module is complete: R1 reads the final text "from `03-faithful-translation`". Reasons:
   - §5.19's own words: "its approved edit or accepted MT is in the text at the tag".
   - `applied_at` is wrong in known cases. The self-heal resets it while the file is missing (`segmentEditorService.js:891-926`). Apply stamps
     every approved winner of the module id (`:1059-1071`) while writing only the chapter's segments (`:1006-1013`). That
     stamps a winner whose segment has left the extraction (`server/scripts/read-apply-exposure.js:24`, "apply skips
     it but still stamps it"), and for `chapter-metadata`, one module id across 21 chapters, every other chapter's
     winner (recorded under "Where … disagree", item 1).
9. **The decider for one occurrence is the one apply would publish.** Let `latest` be the newest matching approved
   edit by `editRecency.pickLatest` (`server/lib/editRecency.js:33-39`, the apply path's own winner rule,
   `segmentEditorService.js:976`):
   - `latest` exists and `applied_at IS NULL` → the edit decides, even over an active acceptance;
   - else a matching active acceptance → the acceptance decides (it outranks an applied edit: the restore edge,
     Review Focus 3, as the review-status sidecar orders them, `acceptanceService.js:388-396`);
   - else `latest` (applied) → the edit decides; else nothing.
   Rejected, pending, discussed and superseded rows never decide (the query selects `status = 'approved'` and
   `status = 'active'` only). §5.19's "an older applied one does not make the segment complete" follows from
   `pickLatest`. Reasons:
   - **The pair is reachable, so it cannot be refused.** `acceptSegment`'s `EDIT_EXISTS` blocks an accept only while an
     edit is `pending` or approved-and-unapplied (`acceptanceService.js:97-110`); a rejected edit does not block it,
     and only `discuss` blocks too (`:117-128`). `returnEditToPending` turns a rejected edit back to pending
     (`segmentEditorService.js:543-580`) and `approveEdit` approves it (`:401-441`); neither reads
     `segment_acceptances`, and their routes add no check (`server/routes/segment-editor.js:1091-1119`, `:1218-1239`).
     `supersedeForEdit` runs only on a save (`segmentEditorService.js:135`, `:172`; `propagationService.js:135`). So
     *reject E → accept the MT → return E to pending → approve E* leaves an active acceptance beside an approved edit
     with `applied_at NULL`. No PR1–PR4 plan adds an acceptance check to either function (PR3 wraps them in a
     transaction and an event only). A second writer: apply's self-heal resets `applied_at` on every approved edit and
     every active acceptance of the module outside any transaction (`segmentEditorService.js:903-917`, the comment at
     `:839-840`), so on a restore-edge segment a failed recursive apply leaves the same pair (PR3 Review Focus 28).
   - **Apply resolves the pair for the edit.** Its winner is `pickLatest` over every approved row (`:976`); it
     overlays a winner whose `applied_at` is `NULL` (`:1006-1013`), then `lapseDrifted` (`:1083`;
     `acceptanceService.js:298-321`) supersedes the acceptance, whose bytes no longer match. So the edit's text is what
     the next apply writes, and the export names it: "complete" and "reviewed-but-unapplied" stay one rule with the
     tool's own. (When `edited_content` equals `accepted_content` byte for byte, apply keeps the acceptance active
     too; the export still names the edit, the text is the same, and only `version_key` differs.)
   - **It reads §5.19's "the newest approved edit or active acceptance decides" as the newest decision.** On the
     reachable path the approval is the newest act, though the edit's `created_at` is older than the acceptance. The
     plan compares no timestamps across the two tables (one-second `CURRENT_TIMESTAMP` text in each).
   - **Two active acceptances on one occurrence** cannot exist while `idx_segment_acceptances_one_active` stands
     (`server/migrations/043-segment-acceptances.js:36-37`; no PR changes it). If the export meets them anyway (a
     database without the index), it refuses (`DECIDER_CONFLICT`, exit 1) and names the segment: a corruption, not a
     review state. A question for [USER] asks whether this reading is the one wanted.
10. **Occurrence matching:** an edit or acceptance row whose `occurrence` is an integer decides only that occurrence's
    line. A row with `NULL` (made before G1.1, §5.8) decides every occurrence of its id. Apply writes one winner into
    every copy (`:1006-1013` maps `data.segments`), and PR2's snapshot reads `-1` the same way.
11. **Rows are matched on (book, `module_id`, `segment_id`), not on `chapter`.** This is how apply (`:958-963`) and the
    module route (`segmentEditorService.js:239-253`) match. `chapter-metadata`'s segment ids carry their chapter
    (`chapter:title:ch02`, read from `books/efnafraedi-2e/02-for-mt/ch02/chapter-metadata-segments.en.md:1`), so a
    ch02 edit never decides ch05's line (Task 5).
12. **`version_key` comes from the decider's stored `served_text_versions` row**, never from text the export re-derives:
    `sha256Text` of `book|chapter|module_id|segment_id|occurrence|en_sha256|is_sha256|layer` (§5.19; PR1's
    "Interfaces produced" fixes the same string). It is `null` for an acceptance (MT accepted), for no decider, and for
    an edit whose `served_version_id` is `NULL`. A field holding `|` is refused, because the preimage would be
    ambiguous. The row's `en_sha256` and `is_sha256` must equal `sha256Text` of its texts, else `VERSION_CORRUPT`. The
    row must name the line's book, module and segment, else `VERSION_MISMATCH` (a corrupt reference). A different
    **chapter or occurrence** is kept, because the key names the version the text was made on (a renumbering is source
    drift, which G3.2 can see by value). The lines cover every occurrence of every enumerated module, `ch00`,
    appendices and `chapter-metadata` included. Which units are the contract's 134 is G1.5's and G3.2's filter, not the
    export's (§8 G1.5: "whether `chapter-metadata` is in the population").

**Format**

13. **Three flat files per (book, commit) in PR4's `servedVersionExportsDir` (`pipeline-output/served-version-exports/`
    on production):** `<book>.<commit>.segments.jsonl`, `<book>.<commit>.versions.jsonl` and
    `<book>.<commit>.manifest.json`.
    - A line's keys, in this order: `book`, `chapter`, `module_id`, `segment_id`, `occurrence`, `version_key`,
      `final_sha256`, `state`.
    - Lines are sorted by book, then `chapterLabel.compareChapters` (`server/lib/chapterLabel.js:75-79`: numeric,
      appendices last), then `module_id`, then `segment_id`, both in code-unit order (never `localeCompare`, whose
      order depends on the machine's locale), then `occurrence`. Ordering the chapter by `compareChapters` rather than
      by its integer (which puts appendices, `-1`, first) is a reading of §5.19's sort tuple ("Where … disagree", item 6).
    - One `JSON.stringify` per line, LF after each.
    - The manifest is `{ format: 1, book, commit, files: { <name>: sha256 of its bytes } }`. It is written last, so a
      torn write shows as a hash mismatch.
    - Each file is written to a temp name and renamed.
    - **The directory is beside the research file:** `researchFilesFor(resolveResearchDbPath().researchPath)
      .servedVersionExportsDir` (PR4 Task 2), computed when `main` runs, never when a module loads, so
      `SESSIONS_DB_PATH` moves it with the database (decision 5). PR4's handoff binds this ("both from this function,
      never a second derivation"). No flag moves it, and a directory under `<repo>/books/` is refused
      (`OUT_UNDER_BOOKS`): the cron pushes `books/` to the public repository (`scripts/git-backup.sh:162-178`).
    - `pipeline-output/` is gitignored (`.gitignore:59`), and Task 5 pins it with `git check-ignore`. A run against a
      copy writes beside the copy, outside this repository ("Where … disagree", item 7).
14. **The versions file lists only the versions some line's `version_key` names, keyed by `version_key`, with
    `book`, `chapter`, `module_id`, `segment_id`, `occurrence`, `layer`, `en_sha256`, `is_sha256`, `en_text`,
    `is_text`, and no `id`.** §5.19 names "texts, hashes and layer". The locator is added so G3.2 can recompute every
    key from the record alone.
15. **Every script is a dry run unless `--write`** (index § Global Constraints). A dry run prints its summary and creates
    no directory. Exit codes: `0` done (or a clean dry run), `1` refused or failed, `2` usage.
    - **`main` returns its code, and only the `require.main === module` wrapper sets `process.exitCode`**: a failure
      default first, then the verdict (`server/scripts/read-apply-exposure.js:165-169`). So a test calls `main` and
      never leaves an exit code on its worker.
    - Output goes through `process.stdout.write` / the injected stream. No `process.exit()` (CLAUDE.md § Commands).
    - Unknown arguments are refused, not dropped (`server/scripts/close-pending-edits.js:236-250`).

**Opening eligibility (§5.22)**

16. **The rule: `opened_after_first_switch_on` is true iff a first switch-on exists and is strictly earlier than the
    module's `opened_at_ms`.** The first switch-on is PR3's `bookSwitches.firstSwitchOnMs(conn, book, 'suggestion-view')`:
    the lowest-id row with value 1 (§5.13), so a later row with an earlier time cannot move it, and switching off later
    changes nothing. Equal milliseconds → `false`: G1.23 §6.2 asks for the switch-on "**before** the module was opened",
    and equality cannot show order. A unit wrongly counted eligible would contaminate the suggestion arm. **The rule lives
    in one function, `server/lib/openingEligibility.js`'s `openedAfterFirstSwitchOn`**, so G1.23's §6.2 check at serve
    time uses the same comparison (Handoff).
17. **A module never opened is `false`.** G1.23 §6.2 makes eligibility a property of the opening: "a module gets
    suggestions only if the view was switched on for its book before the module was opened". A module with no opening
    was never served to an assigned editor, so nobody worked on it under either condition, and no figure may put it in
    the suggestion arm. §5.22 fixes the output as a yes/no, so no third value is added. The cost: research cannot tell
    "opened before the switch-on" from "never opened", which G1.5 must know (Handoff). A module that opens after a run is
    reported by the next run.
18. **One flat file, `opening-eligibility.<book>.jsonl`, in PR4's `exportsDir` (`pipeline-output/research-exports/`
    on production).**
    - It is written where §5.22 says, in the directory PR4's deletion empties: `researchFilesFor(resolveResearchDbPath()
      .researchPath).exportsDir`, computed when `main` runs (decision 13's reason).
    - Directory mode `0700` and file mode `0600`, like every research file (§5.17's local copies). The file holds no
      personal data, but it shares the directory with the raw export.
    - Lines: `{ book, chapter, module_id, opened_after_first_switch_on }`, sorted as in decision 13, so their order
      carries no time.
    - Modules: those at `--ref` (Task 3's enumeration, so the file lines up with the end-of-editing export), plus any
      module that holds an opening row and is absent at the ref.
    - The script is not `research-` named. It must name `module_openings` and `book_switch_events`, which §5.22 lets
      only it read.

**The raw research export (§5.19's last bullet; index decision 6)**

19. **`server/scripts/research-export.js`.** The `research-` name puts it under PR3's scan, which fails when a
    `server/scripts/research-*` file names a table §5.22 forbids (PR3 Task 31). So its code and comments spell none of
    them. It reads `research.db` only through PR4's admin reader (`openResearch`, `iterateEvents`, `itemsForEvent`),
    passing it the path PR3's `resolveResearchDbPath()` gives; it never calls `keyForInterval` or `allKeys` (PR4's
    handoff). It reads `served_text_versions`, which §5.22 allows by value, from `sessions.db` (read-only).
20. **It exports the events and their items, plus the served versions they reference. It never reads `editor_keys`.**
    - No interval id: the key map is never joined by an export (§5.16).
    - No stratum: G1.5 defines the strata, SD6 decides participation, and the column is `NULL` until then. When G1.5
      defines them, adding a stratum to this export is G1.5's decision.
    - Each event keeps its own `editor_key`, the pseudonym the analysis groups by. `editing_id` stays as stored: R1's
      reference to the edit, §6 item 13. G1.5 must not order or compare it, for §5.22's reason (Handoff).
21. **Every served-version id is replaced by its content key.** Most are in the column; the rest are nested.
    - **The column** becomes `version_key` plus `version_join`:
      - `none`: the id is `NULL`;
      - `missing`: no such row;
      - `mismatch`: the row's `is_sha256` differs from the event's `base_is_sha256`, **or** the row names another
        locator than the event (`book`, `chapter`, `module_id`, and `segment_id` and `occurrence` where the event
        carries them). §5.9's restore check catches a `sessions.db` restored under the research file this way. The
        hash alone cannot: identical Icelandic is common (a read-only probe on 2026-11-04 over `listChapters` ×
        `listChapterModules` × `loadModuleForEditing` for chemistry found 5,424 of 22,876 non-empty translated segments
        sharing their served text with another), so a restore that reuses an id for another segment with equal text
        would otherwise read `ok` and carry that segment's key;
      - `ok`: the row exists, the hashes agree and the locator matches.
      - The event's chapter and occurrence are compared, unlike decision 12's lines, because an event and its version
        come from one act: the review events take `chapter`, `occurrence` and `served_version_id` from the same edit row
        (PR3 Task 23's `placeOf`), and a re-save moves `occurrence` and `served_version_id` together (§5.8).
    - **Nested** (`served_version_id` in before-image rows, kept as state, PR3 decision 10's table;
      `servedVersionIds[].servedVersionId` in `module-opened`'s detail, PR2 decision 11):
      - each becomes `version_key` / `versionKey`;
      - a key whose row is missing, or names another book, module or segment than its containing object (or than the
        event, where that object carries none), becomes `null`.
    - §5.19 names only "each event's `served_version_id`". The nested ones carry the same ids. §5.22 says research never
      orders or compares them, and an analysis given them could. This is the plan's reading: it removes ids and adds
      nothing.
    - The versions file lists every version some event names (column or nested), in decision 14's shape.
22. **Format:**
    - `research-events.jsonl`, `research-event-items.jsonl` and `research-served-versions.jsonl`, flat in
      `research-exports/`, fixed names overwritten (one copy at a time, so PR4's deletion has one set to remove), `0600`
      in a `0700` directory.
    - Event `id` and item `event_id` are decimal strings. They are random 63-bit integers (PR3 Task 2), above 2⁵³, which
      a JSON number cannot hold. Every other integer is checked safe and written as a number.
    - The four `*_json` columns are parsed and written without the suffix (`content`, `before`, `detail`,
      `flag_snapshot`).
    - Events are sorted by (`editor_key`, `key_seq`), each editor's own order. Items follow their event's order, then
      `ordinal`.
    - A missing `research.db` exits 1 and writes nothing (§5.1: research scripts open it with `fileMustExist`).

**Scope and gates**

23. **No migration, no route, no file under `server/public/js/`, no dependency.**
    - `check-docs` does not run: its `pull_request.paths` are `tools/**`, `server/routes/**` and `scripts/**`
      (`.github/workflows/docs-check.yml:4-8`), and nothing here touches them. `server/scripts/**` is not `scripts/**`,
      since the filter is anchored at the repository root.
    - The E2E job runs on every pull request anyway (`.github/workflows/test.yml`'s `e2e` job has no path filter).
      Task 1 changes the code every module serve runs, so the gate includes it.
    - Root `LICENSE` is unchanged. The new scripts are AGPL code requiring AGPL and MIT code. A server test importing
      the MIT helper `tools/__tests__/helpers/git-fixture.js` is the same direction. Neither is the MIT→AGPL edge (E-2)
      that file enumerates.
24. **Task order:** the pure lifts (1), the key (2), the tree reader (3), the per-occurrence rules (4), the export and T22
    (5), its command line (6), eligibility (7), the raw export (8), T17's PR5 part (9, after every script exists).
    Tasks 5–8 need PR4's `researchFiles.js`, Task 8 also its admin reader, and Task 9 its `nonScriptFilesNaming`.

### Where the tree, the spec, the index and the earlier plans disagree (recorded; the tree wins)

Each was checked at `b6212d99`. None changes what the frozen spec says. Each names how this plan handles it.

1. **The apply path keys on (book, `module_id`) only, so for `chapter-metadata` it acts on all 21 chapters at once.**
   `applyApprovedEdits` selects every approved row of the module id (`segmentEditorService.js:958-963`). It writes only
   this chapter's segments (`:1006-1013`) but stamps every chapter's winner applied (`:1059-1071`).
   `acceptanceService.lapseDrifted` (`:298-321`), called at `segmentEditorService.js:1083`, lapses every active
   acceptance of the module id whose segment is not in the written set ("A segment missing from the written set counts
   as drifted"), i.e. every other chapter's chapter-metadata acceptance: it is lapsed as `content-drift`, so it is gone
   from the active record. `stampApplied` (`:328-335`) runs after it and stamps only this chapter's surviving active
   acceptances. The index's cross-PR Review Focus 2 (PR1's Review Focus 7: "the chapter is in every new key") is true of
   PR1's keys, not of this path, which no PR here touches. Under the hold it cannot fire for chemistry (`applyHold.assertFaithfulWritable`, `:841`). Once the hold
   lifts it can. **This plan:** edits are decided by value (decision 8), so the export is immune for edits. A wrongly
   lapsed acceptance is gone from the record, and no export can recover it. **The fix and its status belong in the
   register** (CLAUDE.md § One source of truth: open work has one owner), not in this PR.
2. **The index's T17 row lists only "the eligibility output" for PR5.** Task 9 adds two pins in the same file: no file
   outside `server/scripts/` and `server/__tests__/` requires PR5's scripts (§5.19's "never the running server",
   decision 6), and the end-of-editing export names no research table or reader. It also widens PR4's version of PR3's
   visited-file check to `research-export.js`. These are additive.
3. **Resolved by PR4's plan: the admin reader and the directories.** The index places the admin reader (decision 6);
   PR4's plan names it `server/scripts/lib/researchAdmin.js` (`openResearch`, `iterateEvents`, `itemsForEvent`) and the
   directories `researchFilesFor(researchPath)`. This plan consumes them as named there; Task 8's Step 0 confirms them in
   the tree.
4. **The handoff gives PR5's gate as "after PR3" (§3 item 7). The index adds PR4 for the raw export.** The index governs.
   Tasks 1–4 merge-depend on PR3 only. Tasks 5–7 need PR4's `researchFiles.js` (PR4's handoff binds the directories to
   it), Task 8 also its admin reader, and Task 9 its `nonScriptFilesNaming`.
5. **§5.19 says the versions are listed with "their texts, hashes and layer".** The plan adds the locator (decision 14).
6. **§5.19 sorts lines "by (book, chapter, module_id, segment_id, occurrence)", and `chapter` is an integer whose
   appendices value is `-1`.** A numeric sort would put appendices first. The plan orders the chapter by
   `chapterLabel.compareChapters` (`server/lib/chapterLabel.js:75-79`, appendices after every non-negative chapter),
   the repository's chapter order. This is a reading of the tuple, not a change of its fields. G3.2 is bound to it
   (Handoff).
7. **§5.19 names `pipeline-output/served-version-exports/` and `pipeline-output/research-exports/`.** PR4 derives both
   from the research file's directory, so they are those paths on production (where `research.db` is beside
   `pipeline-output/sessions.db`) and beside the copy when `SESSIONS_DB_PATH` names one. The plan follows PR4 (decision
   13), so PR4's deletion always empties the directory the scripts wrote into (§5.15 step 4).

## Global Constraints (PR5)

- **Branch:** cut from `main` after PR4 merged, or beside PR4's branch, merging after it (index decision 17). The
  executing session's harness may assign the name.
- **Test first, one commit per task.** Each task runs its red arm before implementing. An `Expected:` line is a
  prediction at `ed10180c` plus PR1–PR4.
- **The gate is what CI runs** (CLAUDE.md § CI):
  - `npm test` from the repository root, diffing the failing set by name against `main`'s, never the count;
  - `npm run lint` **and** `npm run format:check` (`server/**/*.js` is in both);
  - `cd server && CI=1 npm run test:e2e` (decision 23);
  - `npm run docs:check` is not required (decision 23), and running it must leave `docs/_generated/` clean;
  - no dependency is added, so `npm audit` is not part of the gate;
  - `git status --porcelain` empty at the end.
- **Module systems:** `server/` is CommonJS. Test files `import` vitest and node builtins and reach server modules
  through `createRequire(import.meta.url)` (`server/__tests__/importConcepts.test.js:9-11`). A server test may `import`
  the ESM test helper `tools/__tests__/helpers/git-fixture.js`: it sets git identity per repository and strips inherited
  `GIT_*` variables (its `:19-25`, `:45-55`).
- **better-sqlite3 resolves only from `server/node_modules`,** so every new script is under `server/`. Never
  `node:sqlite`, never a cwd-relative require.
- **Paths from `__dirname` or `resolveDbPath()`, never `process.cwd()`.** The repository root is
  `path.resolve(__dirname, …)` from each file.
- **git:** every call is `execFileSync('git', ['-C', repoRoot, …])` with `GIT_*` variables removed from the environment.
  An inherited `GIT_DIR` or `GIT_INDEX_FILE` retargets git; Task 3 measures it. Each call sets an explicit `maxBuffer`.
  No call writes: only `rev-parse`, `ls-tree`, `cat-file`, `ls-files` (under `--no-optional-locks`) and
  `hash-object` without `-w` (Task 3's checkout comparison), plus, in tests, the fixture's own commits. Never porcelain
  `git diff` or `git status`: they refresh and rewrite the index (measured, "State of this plan").
- **Organic never** (CLAUDE.md § Organic): every script refuses `lifraen-efnafraedi` before it reads anything.
- **Nothing under `books/` is written by any task or test.** Fixtures live in `os.tmpdir()`. Tests that read the real
  `books/` read it only.
- **`process.exitCode` only in the `require.main` wrapper** (decision 15). Never `process.exit()` after output.
- **Grep with `-a`** (`server/scripts/verify-b4b0-gates.js` and `server/services/termMiningService.js` hold NULs).
- **A mutation check restores from a golden `cp`, never `git checkout`; run `git status --porcelain` the moment any
  agent that mutates files goes quiet** (CLAUDE.md § Commands).
- **No count, test total or CI verdict in prose** in any document this PR touches, and **nothing committed names a
  grant or fund**.
- **Commit messages:** the `git commit` lines below carry no trailer. The executing session appends its own.

## Review Focus

Input cases the spec implies but its tests do not name, each ending with the task that must cover it.

1. An approved text that differs from the tag's text only by normalisation (surrounding whitespace, a hard wrap, an
   MT escape, a `**term**` repair) is `complete`, and its hash is the served view's. → Task 4
2. `applied_at` is set but the text is not in the tag: the module has no faithful file at the tag, the segment left the
   extraction, or another chapter's `chapter-metadata` apply stamped it. The state is `reviewed-but-unapplied`. → Task 4,
   Task 5
3. The restore edge: an older applied edit and a newer active acceptance on one segment. The acceptance decides. → Task 4
4. An active acceptance plus a newer-approved, unapplied edit on one occurrence (reachable: reject → accept the MT →
   return to pending → approve) → the edit decides: `reviewed-but-unapplied`, the edit's key, its served view's hash.
   Two active acceptances on one occurrence (only without migration 043's index) → `DECIDER_CONFLICT`, exit 1,
   nothing written. → Task 4, Task 5, Task 6
5. A `NULL`-occurrence row on a duplicated id decides both lines; an occurrence-1 row decides only line 1. → Task 4
6. `chapter-metadata` in ch02 and ch05 shares one module id: a ch02 edit decides only ch02's line. `ch00` and appendices
   have lines, and appendices sort after ch10, which sorts after ch02. → Task 5
7. A decider whose version names another segment → `VERSION_MISMATCH`. A version on another chapter or occurrence, or
   with English that has since changed, keeps the decider's key. → Task 4, Task 5
8. A later commit, a dirty working-tree file and an untracked file never reach the export. → Task 3, Task 5
9. An inherited `GIT_DIR` does not retarget the reader. A ref beginning with `-` is refused before git runs. An
   annotated tag, a branch and a short sha each resolve to one 40-hex commit. → Task 3
10. Two databases whose served-version ids were assigned in different orders give byte-identical files. The sort never
    calls `localeCompare`. → Task 5
11. `--book lifraen-efnafraedi` is refused with no git call and no database open. → Task 6, Task 7
12. A dry run creates no directory. → Task 6, Task 7, Task 8
13. An injected output directory under `<repo>/books/` → `OUT_UNDER_BOOKS`. → Task 5
14. The opening and the first switch-on in the same millisecond → `false`. A later switch row with an earlier time does not
    move the first switch-on. Switched off later → still `true`. → Task 7
15. A module that holds an opening row but is absent at the ref is still listed. → Task 7
16. An event id above 2⁵³ is written exactly. → Task 8
17. `sessions.db` restored under the research file → `version_join: 'mismatch'`, `version_key: null`, including a
    reused id that names another segment's row with identical Icelandic. → Task 8
18. A served-version id nested in a before-image or in `module-opened`'s list is replaced, and checked against its
    locator. No `served_version_id` / `servedVersionId` key survives anywhere in the output. → Task 8
19. Every research file this PR writes is a flat regular file directly in `research-exports/`, so PR4's "delete every
    file" reaches it. → Task 7, Task 8
20. A comment in `research-export.js` that spells a forbidden table fails PR3's scan. → Task 8, Task 9
21. The loader's response is unchanged by Task 1, keys and order included: PR1's T17 pins its key sets, and the
    client reads it. The corpus check compares against an oracle built from the unchanged primitives, never against
    `pairForEditing` itself. → Task 1
22. `SESSIONS_DB_PATH` names a copy: every default output directory is beside the copy (PR4's `researchFilesFor`),
    so PR4's deletion empties the same directory; unset, they are `<repo>/pipeline-output/…`. → Task 5, Task 6, Task 7,
    Task 8
23. A mistyped `--book` (a slug with no module at the ref) → `BAD_BOOK`, exit 1, nothing written, never an empty
    export with exit 0. → Task 6, Task 7
24. The clone's checkout differs from the tag in the book's faithful layer (a later commit, a dirty file, an untracked
    file) → the report says `faithfulMatchesCheckout: false`; the files are unchanged. → Task 3, Task 6
25. A comment in `server/lib/` that names `opening-eligibility.js` is not a require, and does not trip Task 9's pin. →
    Task 9

## The T-tests this PR carries (index § Test placement)

| Test | Where |
|---|---|
| **T22** (whole) | Task 5 (`server/__tests__/exportServedVersions.test.js`), with its rules unit-tested in Task 4 |
| **T17**, PR5's part (the eligibility output) | Task 9 (`server/__tests__/researchBoundary.test.js`), plus decision-6's pins |

## Before Task 1: the tree check

- [ ] **Step 1: Confirm what this plan builds on is there** (each must print what is named; if not, stop):

```bash
git log --oneline -1 main
ls server/migrations | tail -5                     # PR1–PR4's migrations; PR5 adds none
grep -an "function sha256Text\|isNotMintedBook" server/lib/servedText.js
grep -an "STUDY_BOOKS" server/lib/researchScope.js
grep -an "countOccurrences\|buildVersionRow\|mintVersions" server/services/servedVersions.js
grep -an "firstSwitchOnMs" server/lib/bookSwitches.js
grep -an "resolveResearchDbPath" server/lib/researchDbPath.js
grep -an "ensureResearchSchema" server/lib/researchSchema.js
grep -an "filesNaming\|forbiddenTableUses\|FORBIDDEN_TABLES" server/__tests__/researchBoundary.test.js
grep -an "function openResearch\|const iterateEvents\|const itemsForEvent" server/scripts/lib/researchAdmin.js  # PR4 Task 4
grep -an "function researchFilesFor\|exportsDir\|servedVersionExportsDir" server/lib/researchFiles.js         # PR4 Task 2
grep -an "function nonScriptFilesNaming" server/__tests__/researchBoundary.test.js                           # PR4 Task 4
```

- [ ] **Step 2: Confirm nothing this plan creates exists already**
  (`git ls-files server | grep -aE "export-served-versions|opening-eligibility|research-export|endOfEditingTree|servedVersionKey|openingEligibility|exportFiles|pairForEditing"`
  prints nothing), and that `segmentParser.js` is as read here (`git diff ed10180c -- server/services/segmentParser.js`
  is empty: no PR1–PR4 plan touches it).
- [ ] **Step 3: Confirm the `check-docs` path filter** (`sed -n 4,8p .github/workflows/docs-check.yml` lists
  `tools/**`, `server/routes/**`, `scripts/**`; decision 23).

---

### Task 1: the loader's pairing and its enumeration rules become pure functions, with the loader unchanged

Spec §5.3 (the hash covers the served string), §5.19 (enumeration as `listChapterModules`); decisions 2, 3; Review
Focus 21.

**Files:**
- Modify: `server/services/segmentParser.js`:
  - add `pairForEditing`, `chapterOfForMtDir`, `moduleIdOfEnFile`;
  - `loadModuleForEditing` (`:102-190`) calls `pairForEditing`;
  - `listChapters` (`:391-406`) calls `chapterOfForMtDir`;
  - `listChapterModules` (`:408-447`) calls `moduleIdOfEnFile`;
  - `module.exports` (`:479-501`) gains the three.
- Test: `server/__tests__/segmentParserPairing.test.js` (new)

**Interfaces:**
- Produces:
  - `pairForEditing({ enContent: string, faithfulContent?: string | null, mtContent?: string | null }) → { isSource:
    'faithful' | 'mt-output' | null, segments: { segmentId, moduleId, segmentType, elementId, en, is, hasTranslation
    }[] }`. `null` means absent. `''` means present and empty, so an empty faithful file still wins, as `existsSync`
    does at `:115`.
  - `chapterOfForMtDir(name) → number | null`.
  - `moduleIdOfEnFile(name) → string | null`.

- [ ] **Step 1: Write the failing test**

`server/__tests__/segmentParserPairing.test.js` (header as `importConcepts.test.js:9-11`; fixtures through PR1's
`server/__tests__/helpers/servedFixture.js` `segFile` / `writeModule`, SEG markers with no space after the colon):

- `describe('pairForEditing (decision 2)')`:
  - `it('faithful wins over MT; MT when no faithful; null when neither')`:
    - with EN `[[a,'EN A'],[b,'EN B']]`, faithful `[[a,'F A']]` and MT `[[a,'M A'],[b,'M B']]` → `isSource 'faithful'`,
      `is` values `['F A', '']`, `hasTranslation` `[true, false]`;
    - the same without faithful → `'mt-output'`, `['M A', 'M B']`;
    - neither → `null`, `['', '']`, `[false, false]`.
  - `it('an empty faithful file is present, not absent')`: `faithfulContent: ''` with MT given → `isSource 'faithful'`,
    every `is` `''` (control: `faithfulContent: null` → `'mt-output'`).
  - `it('applies the loader chain: trim, wraps, MT escapes, term repair')`: EN `[[a, 'A __term__ x']]`, MT
    `[[a, '  Eitt **hugtak**\nhér \\[\\[MATH:1\\]\\]  ']]` → `is` equals `'Eitt __hugtak__ hér [[MATH:1]]'`.
  - `it('a duplicated id serves the last copy for both occurrences (segmentParser.js:135)')`: EN `[[d,'E1'],[d,'E2']]`,
    MT `[[d,'M1'],[d,'M2']]` → `is` `['M2', 'M2']`.
- `describe('the loader is unchanged, judged by an oracle outside pairForEditing (Review Focus 21)')`. Once Step 3
  lands the loader calls `pairForEditing`, so comparing the two would grade the function with itself (Task 2's rule).
  The expected side is built in the test, per module, from the unchanged primitives `segmentParser` exports, and never
  calls `pairForEditing`:

  ```js
  // The chain at ed10180c (segmentParser.js:112-121, :130-136, :156-170), restated from the primitives on purpose.
  function oracle({ enContent, faithfulContent, mtContent }) {
    const layer = faithfulContent !== null ? faithfulContent : mtContent;
    const isSource = faithfulContent !== null ? 'faithful' : mtContent !== null ? 'mt-output' : null;
    const last = new Map(); // a duplicated id: the last copy wins (:135)
    for (const s of layer === null ? [] : sp.parseSegments(layer)) last.set(s.segmentId, sp.unescapeMtMarkers(s.content));
    return { isSource, segments: sp.parseSegments(enContent).map((en) => ({
      segmentId: en.segmentId, moduleId: en.moduleId, segmentType: en.segmentType, elementId: en.elementId,
      en: en.content, is: last.has(en.segmentId) ? sp.normalizeTermMarkers(en.content, last.get(en.segmentId)) : '',
      hasTranslation: last.has(en.segmentId) })) };
  }
  ```

  - `it('on fixture modules, every layer combination')`: a temp books root (`segmentParser._setTestBooksDir`, restored in
    `afterEach`) with three modules (faithful + MT, MT only, EN only). For each, `const { mtFinding, ...rest } = s` over
    `loadModuleForEditing(...).segments` gives `{ isSource, segments: rest[] }` deep-equal to `oracle` on the same
    files' contents (`fs.readFileSync(…, 'utf-8')`, `null` where absent). `Object.keys(loaded.segments[0])` equals
    `['segmentId', 'moduleId', 'segmentType', 'elementId', 'en', 'is', 'hasTranslation', 'mtFinding']`, the order at
    `ed10180c`.
  - `it('on the corpus: the loader equals the oracle, every module of every book but organic (read-only)')`: for each
    book directory in the real `books/` with a `02-for-mt/` (organic skipped by name), each `listChapters` ×
    `listChapterModules`, the same equality, reading the real files. The scanned set holds `efnafraedi-2e` modules
    (control: a non-empty read, `expect(seen).toContain('efnafraedi-2e/ch02/chapter-metadata')`).
  - `it('on the corpus: pairForEditing equals the same oracle')`: the same walk, `pairForEditing` on the files'
    contents deep-equal to `oracle`. With the case above, both sides of Step 3's refactor are pinned to one independent
    statement of the chain.
- `describe('the enumeration rules (decision 3)')`:
  - `it('chapterOfForMtDir is listChapters\' rule')`:
    `['ch00','ch01','ch10','ch100','appendices','ch','chx','notes'].map(chapterOfForMtDir)` equals
    `[0, 1, 10, 100, -1, null, null, null]`.
  - `it('moduleIdOfEnFile is listChapterModules\' rule')`:
    `['m1-segments.en.md','chapter-metadata-segments.en.md','m1-segments(b).en.md','exercises-segments.en.md',
    'm1-segments.is.md','m1-segments-links.json'].map(moduleIdOfEnFile)` equals
    `['m1', 'chapter-metadata', null, null, null, null]`.
  - `it('listChapters and listChapterModules return what they returned before')` on a temp books root:
    - `02-for-mt/` holds `ch00/`, `ch02/`, `ch10/`, `appendices/` and `notes/`;
    - ch02 holds `m1-segments.en.md`, `m1-segments(b).en.md`, `exercises-segments.en.md` and
      `chapter-metadata-segments.en.md`;
    - `listChapters` → `[0, 2, 10, -1]`;
    - `listChapterModules(book, 2).map((m) => m.moduleId)` → `['chapter-metadata', 'm1']` as a sorted set.

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/segmentParserPairing.test.js`
Expected: FAIL — `TypeError: pairForEditing is not a function` (and `chapterOfForMtDir` / `moduleIdOfEnFile` likewise);
the `listChapters` case and the two loader-versus-oracle cases pass (they pin today's behaviour, so they are the
oracle's own check: if either fails here, the oracle is wrong, not the loader).

- [ ] **Step 3: Implement** in `server/services/segmentParser.js`. Add a header note above `pairForEditing`: why it
  exists (the end-of-editing export pairs blobs read from git with the loader's own rules, spec §5.3 and §5.19, one
  mechanism), and that the loader must keep calling it.

```js
/**
 * The loader's layer choice, Icelandic unescape and pairing, as a pure function of file contents.
 * null = the file is absent; '' = present and empty (an empty faithful file still wins, as existsSync did).
 * loadModuleForEditing calls it; so does server/scripts/export-served-versions.js on blobs read at a commit.
 */
function pairForEditing({ enContent, faithfulContent = null, mtContent = null }) {
  const enSegments = parseSegments(enContent);
  let isSegments = [];
  let isSource = null;
  if (faithfulContent !== null) {
    isSegments = parseSegments(faithfulContent);
    isSource = 'faithful';
  } else if (mtContent !== null) {
    isSegments = parseSegments(mtContent);
    isSource = 'mt-output';
  }
  const isLookup = {};
  for (const seg of isSegments) {
    seg.content = unescapeMtMarkers(seg.content);
    isLookup[seg.segmentId] = seg;
  }
  return {
    isSource,
    segments: enSegments.map((en) => ({
      segmentId: en.segmentId,
      moduleId: en.moduleId,
      segmentType: en.segmentType,
      elementId: en.elementId,
      en: en.content,
      is: isLookup[en.segmentId]
        ? normalizeTermMarkers(en.content, isLookup[en.segmentId].content)
        : '',
      hasTranslation: !!isLookup[en.segmentId],
    })),
  };
}

/** listChapters' rule for a 02-for-mt directory name: chNN → N, appendices → -1, anything else → null. */
function chapterOfForMtDir(name) {
  if (name === 'appendices') return -1;
  return /^ch\d+$/.test(name) ? parseInt(name.slice(2), 10) : null;
}

/** listChapterModules' rule: the module id of a 02-for-mt file, or null (legacy (b) copies, exercises, others). */
function moduleIdOfEnFile(name) {
  if (!name.endsWith('-segments.en.md') || name === 'exercises-segments.en.md') return null;
  return name.replace('-segments.en.md', '');
}
```

  In `loadModuleForEditing`, replace `:109-121` (the EN read, the Icelandic reads and the layer choice) with the reads
  and the `pairForEditing` call below; keep `:123-128` (the findings read and its comment), which now follows the call
  because it reads `isSource`; delete `:130-136` (the unescape and lookup, now inside `pairForEditing`); and replace
  `:156-170` (the pairing) with the `paired` map below:

```js
  const enContent = fs.readFileSync(paths.enSource, 'utf-8');
  const faithfulContent = fs.existsSync(paths.faithful)
    ? fs.readFileSync(paths.faithful, 'utf-8')
    : null;
  const mtContent =
    faithfulContent === null && fs.existsSync(paths.mtOutput)
      ? fs.readFileSync(paths.mtOutput, 'utf-8')
      : null;
  const { isSource, segments: pairedCore } = pairForEditing({ enContent, faithfulContent, mtContent });

  // §C124: … (the comment at :123-127, kept)
  const findings = mtFindings.read(book, isSource === 'faithful' ? 'faithful' : 'mt-preview');

  // … the equations, structure and manifest reads (:138-154) stay as they are …
  const paired = pairedCore.map((s) => ({
    ...s,
    // null, not undefined: a deleted key is a third state … (the comment at :167-168, kept)
    mtFinding: findings.bySegment.get(s.segmentId) || null,
  }));
```

  `listChapters`: `.filter((d) => /^ch\d+$/.test(d)).map((d) => parseInt(d.replace('ch', ''), 10))` becomes
  `.map(chapterOfForMtDir).filter((c) => c !== null && c >= 0)`. The appendices push at `:402-404` stays, so
  `appendices` is not added twice.

  `listChapterModules`: the filter at `:421` becomes `.filter((f) => moduleIdOfEnFile(f) !== null)`, keeping its
  comment, and `:431` becomes `const moduleId = moduleIdOfEnFile(f);`.

- [ ] **Step 4: Run it, and the suites that load modules**

Run: `npx vitest run server/__tests__/segmentParserPairing.test.js server/__tests__/segmentParser.test.js server/__tests__/segmentParserMtFindings.test.js server/__tests__/segmentParserExercises.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/segmentParser.js server/__tests__/segmentParserPairing.test.js
git commit -m "refactor(server): segmentParser — the loader's pairing and enumeration rules as pure functions (G1.1 PR5)"
```

---

### Task 2: the content key of a served version, and its exported record

Spec §5.19 (`version_key`, never the id), §5.22 (joined by value); decisions 12, 14.

**Files:**
- Create: `server/lib/servedVersionKey.js` — `VERSION_KEY_FIELDS`, `versionKey(row)`, `versionRecord(row)`
- Test: `server/__tests__/servedVersionKey.test.js` (new)

**Interfaces:**
- Consumes: `sha256Text` (PR1 Task 1).
- Produces (over a `served_text_versions` row as SQL returns it, snake_case):
  - `VERSION_KEY_FIELDS = ['book', 'chapter', 'module_id', 'segment_id', 'occurrence', 'en_sha256', 'is_sha256',
    'layer']`;
  - `versionKey(row) → string` (64 lowercase hex);
  - `versionRecord(row) → { version_key, book, chapter, module_id, segment_id, occurrence, layer, en_sha256, is_sha256,
    en_text, is_text }` (no `id`).
  - Errors carry `code`: `VERSION_FIELD` (a missing or ill-typed field, or one holding `|`) and `VERSION_CORRUPT` (a
    stored hash that does not match its text).

- [ ] **Step 1: Write the failing test**

```js
const ROW = { id: 41, book: 'efnafraedi-2e', chapter: 1, module_id: 'm90001', segment_id: 'm90001:para:a',
  occurrence: 0, en_sha256: sha256Text('EN-A'), is_sha256: sha256Text('MT-A'), layer: 'mt-output',
  en_text: 'EN-A', is_text: 'MT-A' };
```

- `it('is sha256 of the pipe-joined preimage, computed independently')`: `versionKey(ROW)` equals
  `crypto.createHash('sha256').update('efnafraedi-2e|1|m90001|m90001:para:a|0|' + ROW.en_sha256 + '|' +
  ROW.is_sha256 + '|mt-output', 'utf8').digest('hex')`. This uses `node:crypto` directly, not `sha256Text`, so the test
  does not grade the function with itself.
- `it('changes when any one field changes, and never with the id')`: eight variants, one field each (`chapter: 2`,
  `occurrence: 1`, `layer: 'faithful'`, and so on), give eight distinct keys, all different from `versionKey(ROW)`.
  `{ ...ROW, id: 999 }` gives `versionKey(ROW)`.
- `it('refuses an ambiguous or incomplete preimage')`:
  - `segment_id: 'a|b'` → throws with `code === 'VERSION_FIELD'`;
  - `chapter: '1'` (a string) throws; `layer: null` throws;
  - control: `chapter: -1` (appendices) passes.
- `it('the record has no id, its keys in order, and its key recomputes')`:
  - `Object.keys(versionRecord(ROW))` equals `['version_key', 'book', 'chapter', 'module_id', 'segment_id',
    'occurrence', 'layer', 'en_sha256', 'is_sha256', 'en_text', 'is_text']`;
  - `versionRecord(ROW).version_key === versionKey(ROW)`.
- `it('refuses a row whose stored hash disagrees with its text')`: `{ ...ROW, is_text: 'MT-A!' }` → `VERSION_CORRUPT`.

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/servedVersionKey.test.js`
Expected: FAIL — `Cannot find module '../lib/servedVersionKey'`.

- [ ] **Step 3: Implement** `server/lib/servedVersionKey.js` (CommonJS). Header: spec §5.19 and §5.22; why never the id
  (its order follows serve order, so it acts as a clock); why `|` is refused; that every consumer — the end-of-editing
  export, the raw research export, G3.2 and any join with G1.7's manifest — must derive keys here.

```js
const { sha256Text } = require('./servedText');

const VERSION_KEY_FIELDS = Object.freeze(['book', 'chapter', 'module_id', 'segment_id', 'occurrence',
  'en_sha256', 'is_sha256', 'layer']);
const HEX64 = /^[0-9a-f]{64}$/;
const coded = (code, message) => Object.assign(new Error(message), { code });

function versionKey(row) {
  const parts = VERSION_KEY_FIELDS.map((f) => {
    const v = row[f];
    if (f === 'chapter' || f === 'occurrence') {
      if (!Number.isInteger(v)) throw coded('VERSION_FIELD', `${f} must be an integer, got ${JSON.stringify(v)}`);
      return String(v);
    }
    if (typeof v !== 'string' || v === '') throw coded('VERSION_FIELD', `${f} must be a non-empty string`);
    if (v.includes('|')) throw coded('VERSION_FIELD', `${f} holds '|', which makes the key ambiguous`);
    if ((f === 'en_sha256' || f === 'is_sha256') && !HEX64.test(v)) {
      throw coded('VERSION_FIELD', `${f} is not 64 lowercase hex`);
    }
    return v;
  });
  return sha256Text(parts.join('|'));
}

function versionRecord(row) {
  if (sha256Text(row.en_text) !== row.en_sha256 || sha256Text(row.is_text) !== row.is_sha256) {
    throw coded('VERSION_CORRUPT', `served version of ${row.module_id}:${row.segment_id} does not match its text`);
  }
  return {
    version_key: versionKey(row),
    book: row.book, chapter: row.chapter, module_id: row.module_id, segment_id: row.segment_id,
    occurrence: row.occurrence, layer: row.layer, en_sha256: row.en_sha256, is_sha256: row.is_sha256,
    en_text: row.en_text, is_text: row.is_text,
  };
}

module.exports = { VERSION_KEY_FIELDS, versionKey, versionRecord };
```

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/servedVersionKey.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/servedVersionKey.js server/__tests__/servedVersionKey.test.js
git commit -m "feat(server): servedVersionKey — a served version's content key and its id-free record (G1.1 PR5)"
```

---

### Task 3: a book's modules as they stood at a commit, read from git objects

Spec §5.19 (the tag; enumeration); decisions 1, 2, 3; Review Focus 8, 9, 24.

**Files:**
- Create: `server/scripts/lib/endOfEditingTree.js` — `REPO_ROOT`, `resolveCommit({ repoRoot, ref })`,
  `bookTreeAt({ repoRoot, commit, book })`, `faithfulMatchesCheckout({ repoRoot, commit, book })`
- Test: `server/__tests__/endOfEditingTree.test.js` (new)

**Interfaces:**
- Consumes: `segmentParser.pairForEditing`, `chapterOfForMtDir`, `moduleIdOfEnFile` (Task 1);
  `chapterLabel.chapterDir`, `compareChapters` (`server/lib/chapterLabel.js:38-40`, `:75-79`).
- Produces:
  - `resolveCommit({ repoRoot?, ref }) → string` (40 lowercase hex). Throws `code 'BAD_REF'`.
  - `bookTreeAt({ repoRoot?, commit, book }) → { commit, book, modules: { chapter, moduleId }[], loadModule(chapter,
    moduleId) → { isSource, segments } }`. Modules are sorted by `compareChapters`, then module id in code-unit order.
    Throws `BAD_BOOK` or `BAD_REF`, and `EN_MISSING` when a module's English blob is absent.
  - `faithfulMatchesCheckout({ repoRoot?, commit, book }) → boolean`: the working tree's non-ignored files under
    `books/<book>/03-faithful-translation/` are exactly the commit's, path for path and blob id for blob id (a dirty,
    untracked or deleted file reads `false`). Writes nothing; decision 1.

- [ ] **Step 1: Write the failing test** (fixtures from `tools/__tests__/helpers/git-fixture.js`'s `makeGitFixture`,
  `cleanupFixtures` in `afterEach`; file bodies through PR1's `servedFixture.segFile`)

The fixture `F` holds, under `books/efnafraedi-2e/`:
- `02-for-mt/ch02/m90001-segments.en.md` (`a`, `b`);
- `02-for-mt/ch02/m90001-segments(b).en.md`;
- `02-for-mt/ch02/exercises-segments.en.md`;
- `02-for-mt/ch02/chapter-metadata-segments.en.md`;
- `02-for-mt/ch10/m90010-segments.en.md`;
- `02-for-mt/appendices/m90099-segments.en.md`;
- `02-for-mt/ch00/m90000-segments.en.md`;
- `02-for-mt/notes/README.md`;
- `02-mt-output/` for every real module (`a` → `'MT A'`);
- `03-faithful-translation/ch02/m90001-segments.is.md` (`a` → `'TAG A'`).

Then `F.git('tag', '-a', 'end-of-editing', '-m', 'end')`, an annotated tag. After the tag:
- a second commit changes the faithful `a` to `'LATER A'`;
- an uncommitted edit writes `'DIRTY A'` into the same file;
- an untracked `02-for-mt/ch02/m90002-segments.en.md` is added.

- `it('resolves an annotated tag, a branch and a short sha to one 40-hex commit')`:
  `resolveCommit({ repoRoot: F.root, ref: 'end-of-editing' })` equals `F.git('rev-parse', 'end-of-editing^{commit}')
  .trim()`. `ref: 'HEAD'` gives the later commit. A 7-character prefix of the tag's commit gives the tag's commit.
  Each matches `/^[0-9a-f]{40}$/`.
- `it('refuses a ref that names nothing, or that git would read as an option')`: `'no-such-tag'`, `'-c'`, `'--help'`,
  `'a b'` → `code 'BAD_REF'`. For `` `--output=${tmp}/x` `` (`tmp` a fresh temp directory), no file exists there
  afterwards: git never ran.
- `it('reads the tag, never a later commit, the working tree or an untracked file')`:
  `bookTreeAt({ repoRoot: F.root, commit: <tag commit>, book: 'efnafraedi-2e' }).loadModule(2, 'm90001')` →
  `isSource 'faithful'` and `a`'s `is` `'TAG A'`. Control: at `<HEAD commit>` it is `'LATER A'`. `'DIRTY A'` is never
  returned. `m90002` is in neither commit's `modules`.
- The next two cases use a second fixture, `F0`: the same tag-state files plus `02-for-mt/ch10/m90011-segments.en.md`
  with no Icelandic file, one commit, no later commit and no dirt. Its working tree equals its commit, so the
  loader can read the same text from disk. No `stash` and no `checkout`, in any repository.
- `it('enumerates exactly what listChapters and listChapterModules list')`:
  - with `segmentParser._setTestBooksDir(F0.booksRoot)` (restored in `finally`), the set of `` `${c}/${m}` `` over
    `listChapters` × `listChapterModules` equals the set from `bookTreeAt({ repoRoot: F0.root, commit: <its HEAD>,
    … }).modules`;
  - that set equals `['0/m90000', '2/chapter-metadata', '2/m90001', '10/m90010', '10/m90011', '-1/m90099']`;
  - `modules` in order are `[0 m90000, 2 chapter-metadata, 2 m90001, 10 m90010, 10 m90011, -1 m90099]`: appendices
    last, 10 after 2.
- `it('pairs as the loader does, layer by layer')`: on `F0`, `loadModule(c, m)` deep-equals `loadModuleForEditing`
  minus `mtFinding` (books root as above) for `m90001` (faithful), `m90010` (MT only) and `m90011` (`isSource
  null`).
- `it('a book absent at the commit has no modules')`: `book: 'liffraedi-2e'` → `modules` `[]` (the scripts refuse
  this as `BAD_BOOK`, Tasks 6 and 7; the reader only reports it).
- `it('an inherited GIT_DIR does not retarget it')`: a second fixture `G` with different text; `process.env.GIT_DIR =
  path.join(G.root, '.git')` (restored in `finally`). `bookTreeAt` on `F` still returns `F`'s `'TAG A'`. Control:
  `execFileSync('git', ['-C', F.root, 'rev-parse', 'HEAD'], { env: process.env })` returns `G`'s HEAD, so the hazard is
  real.
- `it('faithfulMatchesCheckout compares the checkout with the commit, and writes nothing (decision 1)')`, on `F0` at
  its HEAD unless named, each change undone (by writing the original bytes back) before the next:
  - clean → `true` (the positive control: a clean checkout reads clean);
  - its faithful file rewritten with identical bytes after a 1.1 s wait → `true` (blob ids, not stat data);
  - one line of its faithful file changed → `false`;
  - an untracked `03-faithful-translation/ch02/m90005-segments.is.md` → `false`; a `…/ch02/x.tmp` (gitignored) →
    `true`;
  - its faithful file removed from the working tree → `false`;
  - only `02-mt-output/…` changed → `true`, so the check is scoped to the faithful layer;
  - `F` at the tag's commit → `false` (a later commit and a dirty file);
  - `fs.statSync(path.join(F0.root, '.git', 'index')).mtimeMs` is the same before and after every call above.
    Control: after a 1.1 s wait and a same-bytes rewrite, `git update-index --refresh` run by the test changes that
    `mtimeMs`, so the probe can see an index write.
  (`F0`'s `.gitignore` holds `*.tmp`, as the repository's does.)

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/endOfEditingTree.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/endOfEditingTree'`.

- [ ] **Step 3: Implement** `server/scripts/lib/endOfEditingTree.js` (CommonJS). Header:
  - spec §5.19;
  - why a commit and never the working tree (decision 1);
  - why `pairForEditing` and the two predicates (decisions 2, 3);
  - why `GIT_*` is stripped (the git fixture's own measurement, `tools/__tests__/helpers/git-fixture.js:19-25`);
  - why the checkout comparison uses blob ids and never porcelain `git diff` (decision 1; it rewrites the index);
  - that it only reads.

```js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const segmentParser = require('../../services/segmentParser');
const { chapterDir, compareChapters } = require('../../lib/chapterLabel');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const LAYERS = ['02-for-mt', '02-mt-output', '03-faithful-translation'];
const GIT_MAX_BUFFER = 256 * 1024 * 1024;
const coded = (code, message) => Object.assign(new Error(message), { code });
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // code-unit order; never localeCompare

function git(repoRoot, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  return execFileSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8', env, maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function resolveCommit({ repoRoot = REPO_ROOT, ref }) {
  if (typeof ref !== 'string' || ref === '' || ref.startsWith('-') || /[\s\x00]/.test(ref)) {
    throw coded('BAD_REF', `refused ref ${JSON.stringify(ref)}`);
  }
  let out;
  try {
    out = git(repoRoot, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    throw coded('BAD_REF', `${ref} names no commit in ${repoRoot}`);
  }
  if (!/^[0-9a-f]{40}$/.test(out)) throw coded('BAD_REF', `${ref} did not resolve to one commit`);
  return out;
}

function bookTreeAt({ repoRoot = REPO_ROOT, commit, book }) {
  if (!/^[a-z0-9-]+$/.test(book || '')) throw coded('BAD_BOOK', `refused book ${JSON.stringify(book)}`);
  if (!/^[0-9a-f]{40}$/.test(commit || '')) throw coded('BAD_REF', 'commit must be a resolved 40-hex sha');
  const base = `books/${book}`;
  const listed = git(repoRoot, ['ls-tree', '-r', '-z', '--name-only', commit, '--',
    ...LAYERS.map((l) => `${base}/${l}`)]).split('\0').filter(Boolean);
  const present = new Set(listed);
  const forMt = `${base}/02-for-mt/`;
  const modules = [];
  for (const p of listed) {
    if (!p.startsWith(forMt)) continue;
    const parts = p.slice(forMt.length).split('/');
    if (parts.length !== 2) continue; // listChapterModules reads a chapter directory's own entries only
    const chapter = segmentParser.chapterOfForMtDir(parts[0]);
    const moduleId = segmentParser.moduleIdOfEnFile(parts[1]);
    if (chapter !== null && moduleId !== null) modules.push({ chapter, moduleId });
  }
  modules.sort((x, y) => compareChapters(x.chapter, y.chapter) || cmpStr(x.moduleId, y.moduleId));
  const read = (rel) => (present.has(rel) ? git(repoRoot, ['cat-file', 'blob', `${commit}:${rel}`]) : null);

  function loadModule(chapter, moduleId) {
    const dir = chapterDir(chapter); // the loader's own path rule (segmentParser.getModulePaths)
    const enContent = read(`${base}/02-for-mt/${dir}/${moduleId}-segments.en.md`);
    if (enContent === null) throw coded('EN_MISSING', `${book}/${dir}/${moduleId} has no English at ${commit}`);
    const faithfulContent = read(`${base}/03-faithful-translation/${dir}/${moduleId}-segments.is.md`);
    const mtContent =
      faithfulContent === null ? read(`${base}/02-mt-output/${dir}/${moduleId}-segments.is.md`) : null;
    return segmentParser.pairForEditing({ enContent, faithfulContent, mtContent });
  }

  return { commit, book, modules, loadModule };
}

/**
 * Decision 1: does this clone's checkout hold the commit's faithful layer? Compared, never read into the export.
 * Blob ids, not `git diff`: porcelain diff refreshes and rewrites the index even under --no-optional-locks (git 2.43,
 * measured), and plumbing diff-index without a refresh reports a touched, unchanged file as changed. ls-tree,
 * ls-files and hash-object (without -w) write nothing. Ignored files (*.tmp) are skipped, as the backup cron's
 * `git add` skips them.
 */
function faithfulMatchesCheckout({ repoRoot = REPO_ROOT, commit, book }) {
  if (!/^[a-z0-9-]+$/.test(book || '')) throw coded('BAD_BOOK', `refused book ${JSON.stringify(book)}`);
  if (!/^[0-9a-f]{40}$/.test(commit || '')) throw coded('BAD_REF', 'commit must be a resolved 40-hex sha');
  const layer = `books/${book}/03-faithful-translation`;
  const atCommit = new Map(); // path → blob id
  for (const rec of git(repoRoot, ['ls-tree', '-r', '-z', commit, '--', layer]).split('\0').filter(Boolean)) {
    const tab = rec.indexOf('\t');
    atCommit.set(rec.slice(tab + 1), rec.slice(0, tab).split(' ')[2]);
  }
  const listed = git(repoRoot, ['--no-optional-locks', 'ls-files', '-z', '--cached', '--others',
    '--exclude-standard', '--', layer]).split('\0').filter(Boolean);
  const onDisk = [...new Set(listed)].filter((p) => fs.existsSync(path.join(repoRoot, p))).sort(cmpStr);
  if (onDisk.length !== atCommit.size || onDisk.some((p) => !atCommit.has(p))) return false;
  if (onDisk.length === 0) return true;
  const ids = git(repoRoot, ['hash-object', '--', ...onDisk]).trim().split('\n');
  return onDisk.every((p, i) => ids[i] === atCommit.get(p));
}

module.exports = { REPO_ROOT, resolveCommit, bookTreeAt, faithfulMatchesCheckout };
```

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/endOfEditingTree.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/lib/endOfEditingTree.js server/__tests__/endOfEditingTree.test.js
git commit -m "feat(server): endOfEditingTree — a book's modules at a commit, paired by the loader's own rules (G1.1 PR5)"
```

---

### Task 4: one occurrence's decider, state, version key and final hash

Spec §5.19 (b) (A2: `version_key`, `final_sha256`, `state`; "the newest approved edit or active acceptance decides"),
R1's note; decisions 7–12; Review Focus 1–5, 7.

**Files:**
- Create: `server/scripts/export-served-versions.js` — this task adds the pure rules only: `servedViewOfText`,
  `deciderFor`, `lineFor`, `STATES`. Task 5 adds the export, Task 6 the command line.
- Test: `server/__tests__/exportServedVersionsRules.test.js` (new)

**Interfaces:**
- Consumes: `segmentParser.assembleSegments`, `pairForEditing`; `editRecency.pickLatest`; `sha256Text`;
  `versionRecord` (Task 2).
- Produces:
  - `STATES = ['complete', 'reviewed-but-unapplied', 'unreviewed']`.
  - `servedViewOfText(en, segmentId, text) → string`.
  - `deciderFor({ edits, acceptances, occurrence, segmentId }) → { kind: 'edit' | 'acceptance', row } | null`
    (decision 9). Throws `DECIDER_CONFLICT` for two matching active acceptances only.
  - `lineFor({ book, chapter, moduleId, seg, occurrence, layer, decider, versionRow }) → { line, version }`.
    Throws `VERSION_MISSING` or `VERSION_MISMATCH`.

- [ ] **Step 1: Write the failing test** — pure, no database, no git. Rows are plain objects shaped as Task 5's queries
  return them:
  - edit rows: `{ id, module_id, segment_id, occurrence, edited_content, served_version_id, created_at, applied_at }`;
  - acceptance rows: `{ module_id, segment_id, occurrence, accepted_content }`, no time (decision 9 compares none);
  - `seg = { segmentId: 'm90001:para:a', en: 'EN A', is: … }`.

- `describe('servedViewOfText (decision 7)')`:
  - `it('is what the loader would serve once apply wrote the text')`:
    - `servedViewOfText('EN H', id, ' ED-H line1\nline2 ')` → `'ED-H line1 line2'`;
    - with EN `'A __term__'`, `'Eitt **hugtak**'` → `'Eitt __hugtak__'`;
    - `'\\[\\[MATH:1\\]\\] x'` → `'[[MATH:1]] x'`;
    - control: `'plain'` → `'plain'`.
  - `it('agrees with the loader on a written file')`: write `assembleSegments([{ segmentId: id, content: t }])` as a
    module's faithful file in a temp books root, beside its EN. For each `t` above,
    `loadModuleForEditing(...).segments[0].is === servedViewOfText(en, id, t)`.
- `describe('deciderFor (decision 9, 10)')`:
  - `it('the newest approved edit decides; an older applied one does not')`: rows B1 (`created_at '…:01'`,
    `applied_at` set) and B2 (`'…:02'`, unapplied) → `{ kind: 'edit', row: B2 }`.
  - `it('an id tie on created_at falls to the higher id (editRecency)')`: equal `created_at`, ids 5 and 7 → 7.
  - `it('an active acceptance decides over an older applied edit (the restore edge)')` → `{ kind: 'acceptance' }`.
  - `it('an approved, unapplied newest edit outranks an active acceptance, as apply resolves it (decision 9)')`: the
    end state of reject → accept the MT → return to pending → approve: edit K (`created_at '…:01'`, `applied_at null`)
    and an active acceptance → `{ kind: 'edit', row: K }`. Control: the same edit with `applied_at` set → the
    acceptance decides (the case above, from the same rows).
  - `it('an older unapplied edit behind a newer applied one does not outrank the acceptance')`: edits B1 (`'…:01'`,
    unapplied) and B2 (`'…:02'`, applied) plus an active acceptance → `{ kind: 'acceptance' }` (`pickLatest` picks B2,
    which is applied; apply would supersede B1).
  - `it('two active acceptances on one occurrence refuse')` → throws `code 'DECIDER_CONFLICT'`, with the segment id and
    occurrence in the message. Control: either one alone decides.
  - `it('occurrence matching')`: on occurrence 1, an edit at `occurrence: 0` is ignored, one at `1` decides, one at
    `null` decides. On occurrence 0, the `null` row decides when it is the only match.
  - `it('nothing matches → null')`.
- `describe('lineFor (decisions 8, 12)')`. `layer` is the module's `isSource` at the tag. Each case asserts the whole
  `line` with `toEqual`:
  - `no decider` → `{ book, chapter: 1, module_id: 'm90001', segment_id, occurrence: 0, version_key: null,
    final_sha256: sha256Text(seg.is), state: 'unreviewed' }`; `version` `null`.
  - `acceptance in the tag` (layer `'faithful'`, `seg.is === accepted_content`) → `complete`, `null`,
    `sha256Text(seg.is)`.
  - `acceptance, no faithful file` (layer `'mt-output'`, `seg.is === accepted_content`) → `reviewed-but-unapplied`,
    `null`, `sha256Text(accepted_content)`.
  - `edit in the tag by view` (layer `'faithful'`, `seg.is = 'ED-I wrapped'`, `edited_content 'ED-I\nwrapped'`) →
    `complete`, key = `versionRecord(versionRow).version_key`, `sha256Text('ED-I wrapped')`. Control: a raw comparison
    (`seg.is === edited_content`) is false here, so this case fails if the rule compares raw strings.
  - `edit not in the tag` (layer `'faithful'`, `seg.is 'ED-B1'`, `edited_content 'ED-B2'`) → `reviewed-but-unapplied`,
    key, `sha256Text('ED-B2')`.
  - `edit equal to the MT, no faithful file` (layer `'mt-output'`, `seg.is 'MT C'`, `edited_content 'MT C'`) →
    `reviewed-but-unapplied` (decision 8: no faithful text at the tag).
  - `pre-G1.1 edit` (`served_version_id: null`) → `version_key: null`, `version: null`.
  - `unapplied whitespace text` (`edited_content ' ED-H line1\nline2 '`) → `final_sha256 ===
    sha256Text('ED-H line1 line2')` and `!== sha256Text(' ED-H line1\nline2 ')`. This case carries decision 7 and
    changes with its fallback.
  - `a version on another segment` → throws `VERSION_MISMATCH`. Control: the same row with this segment → no throw.
  - `a version on another chapter or occurrence` → no throw; `version_key` is that row's key.
  - `a set served_version_id with no row` (`versionRow: undefined`) → throws `VERSION_MISSING`.

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/exportServedVersionsRules.test.js`
Expected: FAIL — `Cannot find module '../scripts/export-served-versions'`.

- [ ] **Step 3: Implement** the rules in `server/scripts/export-served-versions.js` (CommonJS; `module.exports` grows in
  Tasks 5 and 6). Header:
  - spec §5.19 (b) and A2: one line per segment occurrence, no attempts, no editor key, no username, no edit id, no
    time;
  - decisions 7–12, each in one line;
  - it reads `sessions.db` read-only and the tag through `endOfEditingTree`;
  - it is never required by the server (§5.19, decision 6);
  - usage, as Task 6 leaves it.

```js
const segmentParser = require('../services/segmentParser');
const { pickLatest } = require('../lib/editRecency');
const { sha256Text } = require('../lib/servedText');
const { versionRecord } = require('../lib/servedVersionKey');

const STATES = Object.freeze(['complete', 'reviewed-but-unapplied', 'unreviewed']);
const coded = (code, message) => Object.assign(new Error(message), { code });

/** The text as the loader would serve it once apply wrote it (decision 7): apply writes with assembleSegments. */
function servedViewOfText(en, segmentId, text) {
  const one = (content) => segmentParser.assembleSegments([{ segmentId, content }]);
  const { segments } = segmentParser.pairForEditing({ enContent: one(en), faithfulContent: one(text) });
  if (segments.length !== 1 || segments[0].segmentId !== segmentId) {
    throw coded('VIEW_UNPARSEABLE', `${segmentId} does not round-trip as one segment`);
  }
  return segments[0].is;
}

/**
 * Decision 9: the decider is what apply would publish. Apply's winner is pickLatest over every approved row
 * (segmentEditorService.js:976); it overlays an unapplied winner (:1006-1013) and then lapses the acceptance
 * (lapseDrifted, :1083). So an unapplied newest edit outranks an active acceptance, and an acceptance outranks an
 * applied edit (the restore edge). Two active acceptances cannot exist under migration 043's index: a corruption.
 */
function deciderFor({ edits = [], acceptances = [], occurrence, segmentId }) {
  const here = (r) => r.occurrence === null || r.occurrence === occurrence;
  const acc = acceptances.filter(here);
  if (acc.length > 1) {
    throw coded('DECIDER_CONFLICT', `${segmentId}#${occurrence}: two active acceptances (decision 9)`);
  }
  const latest = pickLatest(edits.filter(here));
  if (latest && latest.applied_at === null) return { kind: 'edit', row: latest };
  if (acc.length === 1) return { kind: 'acceptance', row: acc[0] };
  return latest ? { kind: 'edit', row: latest } : null;
}

function lineFor({ book, chapter, moduleId, seg, occurrence, layer, decider, versionRow }) {
  const head = { book, chapter, module_id: moduleId, segment_id: seg.segmentId, occurrence };
  const out = (version, finalText, inTag) => ({
    line: { ...head, version_key: version ? version.version_key : null,
      final_sha256: sha256Text(finalText), state: inTag ? 'complete' : 'reviewed-but-unapplied' },
    version,
  });
  if (!decider) {
    return { line: { ...head, version_key: null, final_sha256: sha256Text(seg.is), state: 'unreviewed' }, version: null };
  }
  const faithful = layer === 'faithful'; // R1: the final text is read from 03-faithful-translation
  if (decider.kind === 'acceptance') {
    const inTag = faithful && seg.is === decider.row.accepted_content;
    return out(null, inTag ? seg.is : decider.row.accepted_content, inTag);
  }
  const view = servedViewOfText(seg.en, seg.segmentId, decider.row.edited_content);
  const inTag = faithful && seg.is === view;
  let version = null;
  if (decider.row.served_version_id !== null) {
    if (!versionRow) throw coded('VERSION_MISSING', `edit on ${seg.segmentId} names a served version that is gone`);
    if (versionRow.book !== book || versionRow.module_id !== moduleId || versionRow.segment_id !== seg.segmentId) {
      throw coded('VERSION_MISMATCH', `edit on ${seg.segmentId} names a version of another segment`);
    }
    version = versionRecord(versionRow); // another chapter or occurrence is kept: decision 12
  }
  return out(version, inTag ? seg.is : view, inTag);
}

module.exports = { STATES, servedViewOfText, deciderFor, lineFor };
```

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/exportServedVersionsRules.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/export-served-versions.js server/__tests__/exportServedVersionsRules.test.js
git commit -m "feat(server): end-of-editing export rules — decider, state by value, content key, served-view hash (G1.1 PR5)"
```

---

### Task 5: the end-of-editing export, end to end (T22)

Spec §5.19 (b), A2, R1's note, §10 T22 (whole, with its positive control); decisions 1, 5, 8–14; Review Focus 2, 4,
6–8, 10, 13, 22.

**Files:**
- Modify: `server/scripts/export-served-versions.js` — `exportServedVersions({ db, tree, book })`,
  `serializeExport(result)`, `writeExport({ result, outDir, repoRoot })`
- Create: `server/scripts/lib/exportFiles.js` — `exportDirs()`, `refuseUnderBooks(dir, repoRoot)`,
  `atomicWrite(file, text, mode?)`, `ensureDir(dir, mode?)`. There is no directory constant: `exportDirs()` calls PR4's
  `researchFilesFor` when a script runs (decision 13; PR4's handoff: "never a second derivation").
- Test: `server/__tests__/exportServedVersions.test.js` (new)

**Interfaces:**
- Consumes:
  - Task 3's tree (`modules`, `loadModule`), Task 4's rules;
  - `servedVersions.countOccurrences` (PR1 Task 5);
  - `compareChapters`;
  - PR3's `resolveResearchDbPath()` and PR4's `researchFilesFor(researchPath)` (in `exportDirs`);
  - a better-sqlite3 handle (read-only in production).
- Produces:
  - `exportDirs() → { exportsDir, servedVersionExportsDir }`, read from `researchFilesFor` at call time.
  - `exportServedVersions({ db, tree, book }) → { book, commit, lines, versions, summary: { book, commit, lines,
    byState, versions, duplicatedIds, orphanDeciders } }`. Throws `SCHEMA_MISSING`, plus Task 4's codes.
  - `serializeExport(result) → { [fileName]: text }` (the three files, the manifest last).
  - `writeExport({ result, outDir, repoRoot }) → string[]` (absolute paths). Throws `OUT_UNDER_BOOKS`.

- [ ] **Step 1: Write the failing test.** The fixture has two builders. `buildRepo()` runs **once per file**
  (`beforeAll`): every export in a comparison must read the same commit, because the commit is in the file names and
  the manifest, and a second `makeGitFixture` would make a different one. `buildDb({ mintOrder, cText })` runs per case.

  - **Repository (`buildRepo`):** a git fixture (`makeGitFixture`) holding, under `books/efnafraedi-2e/`, the tag state
    below, committed, then `git tag end-of-editing`. Afterwards a second commit applies `c` (faithful `c` → `'ED-C'`), the
    working tree gets `'DIRTY'` written over faithful `e`, and an untracked `m90002` faithful file is added.
  - **`ch01/m90001`**:
    - EN: `a`…`k` (`'EN-A'`…), with `g` twice (`'EN-G0'`, `'EN-G1'`);
    - MT: `'MT-A'`…, `g` as `'MT-G0'`, `'MT-G1'`;
    - faithful at the tag, as apply would have written it: `a 'ED-A'`, `b 'ED-B1'`, `c 'MT-C'`, `d 'MT-D'`, `e 'MT-E'`,
      `f 'MT-F'`, `g 'MT-G1'` twice, `h 'MT-H'`, `i 'ED-I\nwrapped'`, `j 'MT-J'`, `k 'MT-K'`.
    - `j` is the untouched segment (T22's "an untouched one"): one occurrence, no edit, no acceptance, no version.
    - `k` is decision 9's pair: the MT was accepted and applied, then a rejected edit was returned to pending and
      approved (the routes' end state), so an active acceptance stands beside a newer-approved, unapplied edit.
  - **`ch01/m90002`** (no faithful file at the tag): EN `x`, `y`, `z`; MT `'MT-X'`, `'MT-Y'`, `'MT-Z'`.
  - **Also present:** `ch01/m90003-segments(b).en.md`, `ch01/exercises-segments.en.md`.
  - **Database (`buildDb`):** `freshMigratedDb()`. Versions through PR1's `buildVersionRow` + `mintVersions` (`mintOrder
    'forward'` mints `[vA, vB1, vB2, vC, vD, vE, vH, vI, vK, vX, vY]`; `'reverse'` mints them reversed):

    | Version | Segment | `is` | Layer |
    |---|---|---|---|
    | vA | a | `'MT-A'` | `mt-output` |
    | vB1 | b | `'MT-B'` | `mt-output` |
    | vB2 | b | `'ED-B1'` | `faithful` |
    | vC | c | `'MT-C'` | `mt-output` |
    | vD | d | `'MT-D'` | `mt-output` |
    | vE | e | `'MT-E'` | `mt-output` (served; its only edit is pending) |
    | vH | h | `'MT-H'` | `mt-output` |
    | vI | i | `'MT-I'` | `mt-output` |
    | vK | k | `'MT-K'` | `mt-output` |
    | vX | x | `'MT-X'` | `mt-output` |
    | vY | y | `'MT-Y'` | `mt-output` |

    Every version is `chapter 1`, `occurrence 0`, with the segment's English from the EN file; vX and vY are minted
    for `m90002`, the rest for `m90001`.

  - **`segment_edits`**, inserted with explicit sentinel `id`s, `editor_username 'SENTINEL-USER'` and `created_at` /
    `reviewed_at` / `applied_at` on `'2031-07-07 …'`, `occurrence 0` unless noted:

    | id | Segment | Text | Status | Applied | Version |
    |---|---|---|---|---|---|
    | 7770001 | a | `'ED-A'` | approved | applied | vA |
    | 7770002 | a | `'REJ-A'` | rejected (newer) | — | vA |
    | 7770003 | b | `'ED-B1'` | approved | applied | vB1 |
    | 7770004 | b | `'ED-B2'` | approved | unapplied | vB2 |
    | 7770005 | c | `cText` (default `'ED-C'`) | approved | unapplied | vC |
    | 7770006 | f | `'ED-F'` | approved | unapplied | `NULL`, occurrence `NULL`: before G1.1 |
    | 7770007 | h | `' ED-H line1\nline2 '` | approved | unapplied | vH |
    | 7770008 | i | `'ED-I\nwrapped'` | approved | applied | vI |
    | 7770009 | x | `'ED-X'` | approved | **applied** | vX (stamped, but `m90002` has no faithful file) |
    | 7770010 | e | `'PEND-E'` | pending | — | vE |
    | 7770011 | k | `'ED-K'` | approved (reviewed after the acceptance; `created_at` before it) | unapplied | vK |

  - **`segment_acceptances`**, inserted with explicit sentinel `id`s, `accepted_by_username 'SENTINEL-USER'` and
    `accepted_at` / `applied_at` / `superseded_at` on `'2031-07-07 …'`, `occurrence 0`:

    | id | Segment | Accepted | Status | Applied | Version |
    |---|---|---|---|---|---|
    | 8880001 | d | `'MT-D'` | active | applied | vD |
    | 8880002 | y | `'MT-Y'` | active | unapplied | vY |
    | 8880003 | z | `'MT-Z'` | superseded | — | — |
    | 8880004 | k | `'MT-K'` | active | applied | vK |

  The export runs on a **read-only** handle on the fixture's path (`new Database(path, { readonly: true })`). That
  proves it writes nothing to the database. `out` is a temp directory.

- `it('T22: one line per occurrence, with the expected state, key and final hash')`. `const r =
  exportServedVersions({ db: ro, tree: bookTreeAt({ repoRoot: F.root, commit: tagCommit, book }), book })`. Then
  `r.lines` deep-equals, in this order (`K(v) = versionRecord(rowOf(v)).version_key`, `S = sha256Text`):

  | Line | `state` | `version_key` | `final_sha256` |
  |---|---|---|---|
  | `m90001` a#0 | `complete` | `K(vA)` | `S('ED-A')` |
  | b#0 | `reviewed-but-unapplied` | `K(vB2)` | `S('ED-B2')` |
  | c#0 | `reviewed-but-unapplied` | `K(vC)` | `S('ED-C')` |
  | d#0 | `complete` | `null` | `S('MT-D')` |
  | e#0 | `unreviewed` | `null` | `S('MT-E')` |
  | f#0 | `reviewed-but-unapplied` | `null` | `S('ED-F')` |
  | g#0 | `unreviewed` | `null` | `S('MT-G1')` |
  | g#1 | `unreviewed` | `null` | `S('MT-G1')` |
  | h#0 | `reviewed-but-unapplied` | `K(vH)` | `S('ED-H line1 line2')` |
  | i#0 | `complete` | `K(vI)` | `S('ED-I wrapped')` |
  | j#0 | `unreviewed` | `null` | `S('MT-J')` |
  | k#0 | `reviewed-but-unapplied` | `K(vK)` | `S('ED-K')` |
  | `m90002` x#0 | `reviewed-but-unapplied` | `K(vX)` | `S('ED-X')` |
  | y#0 | `reviewed-but-unapplied` | `null` | `S('MT-Y')` |
  | z#0 | `unreviewed` | `null` | `S('MT-Z')` |

  - The two-round line is `reviewed-but-unapplied` with the second round's key and text. MT-accepted, untouched and
    pre-G1.1 lines have `null`.
  - k#0 carries decision 9: the edit decides over the active acceptance. Control: d#0, an acceptance with no edit,
    is decided by the acceptance (`null` key), so the rule does not simply prefer edits.
  - The set of `` `${segment_id}#${occurrence}` `` equals the set built from the tag's EN files with
    `parseSegments` + `countOccurrences` (exactly one line per occurrence), and the line count equals that EN record
    count.
- `it('T22 positive control: the applied edit\'s key matches its served version\'s content')`: line a#0's `version_key`
  equals `crypto.createHash('sha256').update(['efnafraedi-2e', 1, 'm90001', 'm90001:para:a', 0,
  sha256('EN-A'), sha256('MT-A'), 'mt-output'].join('|')).digest('hex')`, computed in the test with `node:crypto` from
  the texts alone.
- `it('T22: the versions file lists exactly the versions the lines name')`: the set of `r.versions.map((v) =>
  v.version_key)` equals `{K(vA), K(vB2), K(vC), K(vH), K(vI), K(vK), K(vX)}`. It holds none of vB1, vD, vE or vY. Each record
  equals `versionRecord(rowOf(v))`, and no record has an `id` key.
- `it('T22: no integer id, edit id, status history or time')`:
  - Every line's keys equal `['book', 'chapter', 'module_id', 'segment_id', 'occurrence', 'version_key',
    'final_sha256', 'state']`.
  - The serialized files (`serializeExport(r)`, all three, joined) contain none of `'7770001'`…`'7770011'`,
    `'8880001'`…`'8880004'`, `'2031-07-07'`, `'SENTINEL-USER'`, `'REJ-A'`, `'PEND-E'`, `'"id"'`.
  - Control: the database holds every one of those (`SELECT` them from `segment_edits` **and**
    `segment_acceptances`: the ids, `editor_username`, `accepted_by_username`, and every time column above), so the
    absence is not an empty fixture.
- `it('T22: two exports whose served-version ids were assigned in different orders are byte-identical')`:
  - `buildDb({ mintOrder: 'forward' })` and `buildDb({ mintOrder: 'reverse' })`, both exported from the one repository
    at the tag's commit, each written with `writeExport` to its own directory;
  - for each of the three file names, `Buffer.compare(read1, read2) === 0`;
  - control 1: `idOf1(vA) !== idOf2(vA)`, so the orders really differ;
  - control 2: `buildDb({ cText: 'ED-C2' })` gives a different `segments.jsonl`, so the comparison can see a
    difference.
- `it('reads the tag, never the later commit or the working tree')`:
  - at the tag, c#0 is `reviewed-but-unapplied`. Control: the same export at the later commit (`--ref HEAD`'s commit)
    gives c#0 `complete` with `final_sha256 S('ED-C')`;
  - neither run's output contains `S('DIRTY')`, and `m90002`'s untracked faithful file changes neither run's x#0.
- `it('chapter-metadata, ch00 and appendices (Review Focus 6)')` on a second fixture:
  - `ch02/chapter-metadata` (`chapter:title:ch02`), `ch05/chapter-metadata` (`chapter:title:ch05`), `ch00/m90000`,
    `ch10/m90010`, `appendices/m90099`, MT only;
  - one approved edit on `chapter:title:ch02` (`module_id 'chapter-metadata'`, `chapter 2`);
  - the ch02 line is `reviewed-but-unapplied`, and the ch05 line `unreviewed`;
  - chapters appear in the order `[0, 2, 5, 10, -1]`.
- `it('source drift keeps the decider\'s key')`: a version minted with English `'EN-OLD'` for `a` (the tag's English is
  `'EN-A'`), an approved edit on it → `version_key === K(vOld)`. Its record's `en_text` is `'EN-OLD'`.
- `it('refuses a database without PR1\'s columns')`: a copy of the fixture database (`VACUUM INTO` a temp path),
  opened, then `copy.pragma('foreign_keys = OFF')` and `DROP TABLE served_text_versions` → throws `code
  'SCHEMA_MISSING'`. The pragma is needed: `segment_edits.served_version_id` references the table with no `ON DELETE`
  action (PR1 Task 3), and this build's foreign keys make the drop throw `SQLITE_CONSTRAINT_FOREIGNKEY` (measured,
  "State of this plan"). Control: the fixture database passes.
- `it('the default directories are PR4\'s, beside the research file, at call time (decision 13)')`: with
  `SESSIONS_DB_PATH = path.join(tmp, 's.db')` (restored after), `exportDirs()` equals `{ exportsDir: path.join(tmp,
  'research-exports'), servedVersionExportsDir: path.join(tmp, 'served-version-exports') }`, and equals the two fields
  of `researchFilesFor(resolveResearchDbPath().researchPath)`. Control: with it unset, they are
  `path.join(REPO_ROOT, 'pipeline-output', 'research-exports')` and `…'served-version-exports')`. Both calls happen in
  one test after `exportFiles` was required once, so a value captured at load would fail the second.
- `it('refuses an output directory under books/ (decision 13)')`: `writeExport({ outDir: path.join(F.root, 'books',
  'x'), repoRoot: F.root })` → `OUT_UNDER_BOOKS`, and nothing is created there. Control: `path.join(F.root,
  'pipeline-output', 'served-version-exports')` writes the three files.
- `it('pipeline-output/served-version-exports is gitignored in this repository')`: `execFileSync('git', ['check-ignore',
  '-q', 'pipeline-output/served-version-exports/x.jsonl'], { cwd: REPO_ROOT })` exits 0. Control: `check-ignore -q
  server/scripts/export-served-versions.js` exits 1.
- `it('the manifest names the commit and each file\'s sha256')`: `JSON.parse(manifest)` equals `{ format: 1, book,
  commit: tagCommit, files: { [segments]: sha256(bytes), [versions]: sha256(bytes) } }`, the sha256s computed from the
  written bytes.

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/exportServedVersions.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/exportFiles'`: the test requires it at the top for `exportDirs`,
so the file does not load and no case runs. (Were that require absent, every case would fail with `TypeError:
exportServedVersions is not a function`, since Task 4's module exports only its rules.)

- [ ] **Step 3: Implement.** In `server/scripts/lib/exportFiles.js`:

```js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REPO_ROOT } = require('./endOfEditingTree');
const { resolveResearchDbPath } = require('../../lib/researchDbPath');
const { researchFilesFor } = require('../../lib/researchFiles');

const coded = (code, message) => Object.assign(new Error(message), { code });

/**
 * PR4's directories, read when a script runs, never when this module loads: SESSIONS_DB_PATH moves them with the
 * database, so PR4's deletion empties the directory written here (decision 13; PR4's handoff: one derivation).
 */
function exportDirs() {
  const { exportsDir, servedVersionExportsDir } = researchFilesFor(resolveResearchDbPath().researchPath);
  return { exportsDir, servedVersionExportsDir };
}

function refuseUnderBooks(dir, repoRoot = REPO_ROOT) {
  const rel = path.relative(path.join(repoRoot, 'books'), path.resolve(dir));
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw coded('OUT_UNDER_BOOKS', `${dir} is under books/, which the cron pushes to the public repository`);
  }
}
function ensureDir(dir, mode) {
  fs.mkdirSync(dir, { recursive: true, ...(mode ? { mode } : {}) });
  if (mode) fs.chmodSync(dir, mode); // mkdir's mode is masked by the umask
}
function atomicWrite(file, text, mode) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmp, text, mode ? { mode } : undefined);
  if (mode) fs.chmodSync(tmp, mode);
  fs.renameSync(tmp, file);
}
module.exports = { exportDirs, refuseUnderBooks, ensureDir, atomicWrite };
```

  In `server/scripts/export-served-versions.js`, add:

```js
const crypto = require('crypto');
const path = require('path');
const { countOccurrences } = require('../services/servedVersions');
const { compareChapters } = require('../lib/chapterLabel');
const { refuseUnderBooks, ensureDir, atomicWrite } = require('./lib/exportFiles');

const LINE_KEYS = ['book', 'chapter', 'module_id', 'segment_id', 'occurrence', 'version_key', 'final_sha256', 'state'];
const REQUIRED = { served_text_versions: ['id', 'book', 'chapter', 'module_id', 'segment_id', 'occurrence',
  'en_sha256', 'is_sha256', 'layer', 'en_text', 'is_text'],
  segment_edits: ['served_version_id', 'occurrence'], segment_acceptances: ['served_version_id', 'occurrence'] };
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // code-unit order; never localeCompare
// Also sorts Task 7's eligibility lines, which have no segment_id or occurrence (hence the defaults).
const cmpLine = (x, y) => cmpStr(x.book, y.book) || compareChapters(x.chapter, y.chapter) ||
  cmpStr(x.module_id, y.module_id) || cmpStr(x.segment_id ?? '', y.segment_id ?? '') ||
  (x.occurrence ?? 0) - (y.occurrence ?? 0);

function missingColumns(db) {
  const missing = [];
  for (const [table, cols] of Object.entries(REQUIRED)) {
    const have = new Set(db.pragma(`table_info(${table})`).map((c) => c.name));
    for (const c of cols) if (!have.has(c)) missing.push(`${table}.${c}`);
  }
  return missing;
}

function exportServedVersions({ db, tree, book }) {
  const missing = missingColumns(db);
  if (missing.length) throw coded('SCHEMA_MISSING', `sessions.db lacks ${missing.join(', ')}: migrate it first`);
  return db.transaction(() => {
    // Grouped by module, then segment (decision 11: apply's and the route's own key; chapter not matched).
    const groups = new Map();
    const group = (m, s) => {
      if (!groups.has(m)) groups.set(m, new Map());
      const g = groups.get(m);
      if (!g.has(s)) g.set(s, { edits: [], acceptances: [], seen: false });
      return g.get(s);
    };
    for (const e of db.prepare(`SELECT id, module_id, segment_id, occurrence, edited_content, served_version_id,
        created_at, applied_at FROM segment_edits WHERE book = ? AND status = 'approved'`).all(book)) {
      group(e.module_id, e.segment_id).edits.push(e);
    }
    for (const a of db.prepare(`SELECT module_id, segment_id, occurrence, accepted_content
        FROM segment_acceptances WHERE book = ? AND status = 'active'`).all(book)) {
      group(a.module_id, a.segment_id).acceptances.push(a);
    }
    const versionById = db.prepare(`SELECT * FROM served_text_versions WHERE id = ?`);
    const lines = [];
    const versions = new Map();
    let duplicatedIds = 0;
    for (const { chapter, moduleId } of tree.modules) {
      const mod = tree.loadModule(chapter, moduleId);
      const { occurrences, duplicated } = countOccurrences(mod.segments);
      duplicatedIds += duplicated.size;
      mod.segments.forEach((seg, i) => {
        const g = groups.get(moduleId)?.get(seg.segmentId);
        if (g) g.seen = true;
        const decider = g ? deciderFor({ ...g, occurrence: occurrences[i], segmentId: seg.segmentId }) : null;
        const versionRow = decider?.kind === 'edit' && decider.row.served_version_id !== null
          ? versionById.get(decider.row.served_version_id) : null;
        const { line, version } = lineFor({ book, chapter, moduleId, seg, occurrence: occurrences[i],
          layer: mod.isSource, decider, versionRow });
        lines.push(line);
        if (version) versions.set(version.version_key, version);
      });
    }
    lines.sort(cmpLine);
    const versionList = [...versions.values()].sort((x, y) => cmpStr(x.version_key, y.version_key));
    let orphanDeciders = 0;
    for (const g of groups.values()) for (const s of g.values()) if (!s.seen) orphanDeciders += 1;
    const byState = Object.fromEntries(STATES.map((s) => [s, lines.filter((l) => l.state === s).length]));
    return { book, commit: tree.commit, lines, versions: versionList,
      summary: { book, commit: tree.commit, lines: lines.length, byState, versions: versionList.length,
        duplicatedIds, orphanDeciders } };
  })();
}

const jsonl = (rows) => rows.map((r) => JSON.stringify(r) + '\n').join('');
const sha256Bytes = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

function serializeExport(result) {
  const stem = `${result.book}.${result.commit}`;
  const files = { [`${stem}.segments.jsonl`]: jsonl(result.lines), [`${stem}.versions.jsonl`]: jsonl(result.versions) };
  const manifest = { format: 1, book: result.book, commit: result.commit,
    files: Object.fromEntries(Object.entries(files).map(([n, t]) => [n, sha256Bytes(t)])) };
  files[`${stem}.manifest.json`] = JSON.stringify(manifest, null, 2) + '\n'; // last: written last
  return files;
}

function writeExport({ result, outDir, repoRoot }) {
  refuseUnderBooks(outDir, repoRoot);
  ensureDir(outDir);
  return Object.entries(serializeExport(result)).map(([name, text]) => {
    atomicWrite(path.join(outDir, name), text);
    return path.join(outDir, name);
  });
}
```

  `lineFor` builds each line in `LINE_KEYS`' order, so `JSON.stringify` writes the keys in that order. `LINE_KEYS` is
  exported (`module.exports` gains `LINE_KEYS`, `exportServedVersions`, `serializeExport`, `writeExport`), and the
  T22 key-order assertion compares each line's `Object.keys` with it, so the constant is read, not decorative.

- [ ] **Step 4: Run it, and Task 4's suite**

Run: `npx vitest run server/__tests__/exportServedVersions.test.js server/__tests__/exportServedVersionsRules.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/export-served-versions.js server/scripts/lib/exportFiles.js \
  server/__tests__/exportServedVersions.test.js
git commit -m "feat(server): export-served-versions — one line per occurrence, by value at the tag, byte-stable (T22)"
```

---

### Task 6: the export's command line: dry run, `--write`, organic refused, exit codes

Spec §5.19 (b), §11 (organic, `process.exitCode`); decisions 1, 4, 5, 6, 13, 15; Review Focus 4, 11, 12, 22–24.

**Files:**
- Modify: `server/scripts/export-served-versions.js` — `USAGE`, `parseArgs(argv)`, `main({ argv, out, err, repoRoot,
  outDir })`, and the `require.main === module` wrapper
- Test: `server/__tests__/exportServedVersions.test.js` (extend: a `describe('the command line')`)

**Interfaces:**
- Consumes: `resolveCommit`, `bookTreeAt`, `faithfulMatchesCheckout` (Task 3); `researchScope.STUDY_BOOKS`;
  `servedText.isNotMintedBook`; `resolveDbPath`; `exportFiles.exportDirs()` (Task 5).
- Produces:
  - `main({ argv, out, err, repoRoot?, outDir? }) → 0 | 1 | 2`. `outDir` defaults to `exportDirs()
    .servedVersionExportsDir`, read when `main` runs. It prints a JSON array of per-book reports `{ mode: 'dry-run' |
    'write', ...summary, faithfulMatchesCheckout, files? }` on `out`, and one line on `err` when refused.
  - CLI: `node server/scripts/export-served-versions.js --ref <tag-or-commit> [--book <slug>] [--write]`.

- [ ] **Step 1: Write the failing tests.** `out` and `err` are collectors (`{ text: '', write(s) { this.text += s } }`).
  `SESSIONS_DB_PATH` is set per test to the T22 fixture's path and restored after.

- `it('a dry run prints the summary and creates nothing')`:
  - `main({ argv: ['--ref', 'end-of-editing'], out, err, repoRoot: F.root, outDir })` returns `0`;
  - `JSON.parse(out.text)` is one report with `mode 'dry-run'`, `book 'efnafraedi-2e'` (the default study book),
    `commit` the tag's, `byState` `{ complete: 3, 'reviewed-but-unapplied': 7, unreviewed: 5 }` (the T22 fixture's
    lines: `a d i`, `b c f h k x y`, `e g#0 g#1 j z`), and `faithfulMatchesCheckout: false` (the fixture's later commit
    and dirty file, decision 1);
  - `fs.existsSync(outDir) === false`.
- `it('with no outDir, --write writes beside the research file (decision 13)')`: `main({ argv: ['--ref',
  'end-of-editing', '--write'], out, err, repoRoot: F.root })` (no `outDir`) returns `0`, and every `report.files` entry
  is under `path.join(path.dirname(process.env.SESSIONS_DB_PATH), 'served-version-exports')`, which equals
  `researchFilesFor(resolveResearchDbPath().researchPath).servedVersionExportsDir`. Control: nothing was written under
  `path.join(REPO_ROOT, 'pipeline-output', 'served-version-exports')` by this test (`existsSync` of each named file
  there is `false`).
- `it('--write writes the three files and lists them')`: returns `0`; `report.files` names the three files; each
  exists.
- `it('refuses organic before git or the database is touched (CLAUDE.md § Organic)')`:
  - `repoRoot` is a temp directory that is **not** a git repository, and `SESSIONS_DB_PATH` names a missing file;
  - `argv ['--ref', 'x', '--book', 'lifraen-efnafraedi']` returns `1`;
  - `err.text` matches `/refused: lifraen-efnafraedi/`, not `BAD_REF` and not `SQLITE_CANTOPEN`;
  - nothing exists at `outDir`.
- `it('usage errors return 2, never drop a flag')`:
  - `[]` (no `--ref`) → `2`, with `/--ref is required/` on `err`;
  - `['--ref', 'end-of-editing', '--output-dir', '/tmp/x']` → `2`, with `/unknown or incomplete argument: --output-dir/`
    (CLAUDE.md: a dropped flag is a silent no-op);
  - `['--ref']` → `2`.
- `it('a bad ref, a mistyped book, a missing database, or a decider conflict returns 1 and writes nothing')`, four
  cases:
  - `--ref no-such-tag` → `1`, with `/BAD_REF/` on `err`;
  - `--book efnafraedi` (a mistyped slug: the fixture holds `efnafraedi-2e` only) → `1`, with `/BAD_BOOK/` on `err`.
    Control: `--book efnafraedi-2e` at the tag returns `0` with a non-empty `lines` (the dry-run case above);
  - `SESSIONS_DB_PATH` at a missing file → `1`, with `/SQLITE_CANTOPEN/`;
  - a copy of the T22 fixture (`VACUUM INTO`) with `idx_segment_acceptances_one_active` dropped and a second active
    acceptance on `d` inserted → `1`, with `/DECIDER_CONFLICT.*m90001:para:d#0/`. Control: the unmodified fixture
    exports `d#0` as `complete` (decision 9: only two acceptances refuse);
  - each with `--write`, and `outDir` absent after.
- `it('the file run sets the exit code (the require.main wrapper)')`: `spawnSync(process.execPath,
  ['server/scripts/export-served-versions.js', '--bogus'], { cwd: REPO_ROOT })` → `status 2` and a usage line on
  stderr. This is the one spawn: it refuses before any read, so it touches nothing.

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/exportServedVersions.test.js`
Expected: FAIL — `TypeError: main is not a function`; the spawn case gets status `0` (the file has no wrapper yet).

- [ ] **Step 3: Implement** (the shape of `close-pending-edits.js:236-292` and `read-apply-exposure.js:140-169`). Put
  the usage in the header too, with the production-host route (decision 6):

```text
On the production host, after editing has ended and the end-of-editing tag exists:
  cd <repo> && git fetch origin tag <tag>          # objects only; the working tree is untouched
  node server/scripts/export-served-versions.js --ref <tag>            # dry run: the summary
  node server/scripts/export-served-versions.js --ref <tag> --write    # pipeline-output/served-version-exports/
Cut the tag on production's HEAD after a healthy content-backup tick (checks.content_backup ok, nothing unpushed),
and write only when the dry run's faithfulMatchesCheckout is true (decision 1).
From a development clone with a copy of sessions.db: SESSIONS_DB_PATH=<copy> node … (decision 5); the files land in
<copy's directory>/served-version-exports/, and faithfulMatchesCheckout describes the clone, not production.
```

```js
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');
const { STUDY_BOOKS } = require('../lib/researchScope');
const { isNotMintedBook } = require('../lib/servedText');
const { REPO_ROOT, resolveCommit, bookTreeAt, faithfulMatchesCheckout } = require('./lib/endOfEditingTree');
const { exportDirs } = require('./lib/exportFiles');

const USAGE = 'usage: export-served-versions.js --ref <tag-or-commit> [--book <slug>] [--write]';

/** Unknown arguments are refused, not dropped (CLAUDE.md: tools/lib/parseArgs silently drops them). */
function parseArgs(argv) {
  const args = { write: false, books: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--write') args.write = true;
    else if ((a === '--ref' || a === '--book') && v !== undefined && !v.startsWith('--')) {
      if (a === '--ref') {
        if (args.ref !== undefined) return { error: '--ref given twice' };
        args.ref = v;
      } else args.books.push(v);
      i += 1;
    } else return { error: `unknown or incomplete argument: ${a}` };
  }
  if (args.ref === undefined) return { error: '--ref is required (the end-of-editing tag or commit)' };
  return args;
}

function main({ argv = process.argv.slice(2), out = process.stdout, err = process.stderr,
  repoRoot = REPO_ROOT, outDir } = {}) {
  const args = parseArgs(argv);
  if (args.error) {
    err.write(`${args.error}\n${USAGE}\n`);
    return 2;
  }
  const books = args.books.length ? args.books : [...STUDY_BOOKS];
  const organic = books.find(isNotMintedBook);
  if (organic) {
    err.write(`refused: ${organic} is never exported (CLAUDE.md § Organic)\n`);
    return 1;
  }
  let db;
  try {
    // PR4's directory, derived now, never at load: SESSIONS_DB_PATH moves it with the database (decision 13).
    const dir = outDir ?? exportDirs().servedVersionExportsDir;
    const commit = resolveCommit({ repoRoot, ref: args.ref });
    // A slug with no module at the ref is a typo, not an empty book: refuse it before anything is read or written.
    const trees = books.map((book) => {
      const tree = bookTreeAt({ repoRoot, commit, book });
      if (tree.modules.length === 0) throw coded('BAD_BOOK', `${book} has no module at ${commit}`);
      return tree;
    });
    db = new Database(resolveDbPath(), { readonly: true, fileMustExist: true });
    const reports = [];
    for (const tree of trees) {
      const { book } = tree;
      const result = exportServedVersions({ db, tree, book });
      const report = { mode: args.write ? 'write' : 'dry-run', ...result.summary,
        faithfulMatchesCheckout: faithfulMatchesCheckout({ repoRoot, commit, book }) }; // decision 1: reported only
      if (args.write) report.files = writeExport({ result, outDir: dir, repoRoot });
      reports.push(report);
    }
    out.write(JSON.stringify(reports, null, 1) + '\n');
    return 0;
  } catch (e) {
    err.write(`refused: ${e.code || e.name}: ${e.message}\n`);
    return 1;
  } finally {
    if (db) db.close();
  }
}

if (require.main === module) {
  process.exitCode = 1; // a failure default: a run that dies before main() returns is never 0
  process.exitCode = main();
}
```

  Note: every book's tree is checked (`BAD_BOOK`) before the database opens or anything is written. A failure while
  exporting a later book leaves the files of an earlier one, which are complete (each set is self-verifying through its
  manifest). The default list holds one book.

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/exportServedVersions.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/export-served-versions.js server/__tests__/exportServedVersions.test.js
git commit -m "feat(server): export-served-versions CLI — dry run by default, organic refused, exit codes (G1.1 PR5)"
```

---

### Task 7: opening eligibility: one rule, and a per-module yes/no with no time

Spec §5.22 (the per-module *opened after the first switch-on*, written into `research-exports/`, never the times),
§5.13 (first switch-on = lowest-id row with value 1), §5.5; G1.23 §6.2; decisions 16–18; Review Focus 11, 12, 14, 15,
19, 22, 23.

**Files:**
- Create: `server/lib/openingEligibility.js` — `openedAfterFirstSwitchOn({ openedAtMs, firstSwitchOnMs })`
- Create: `server/scripts/opening-eligibility.js` — `ELIGIBILITY_KEYS`, `deriveOpeningEligibility({ db, tree, book
  })`, `writeOpeningEligibility({ lines, book, outDir, repoRoot })`, `main(…)`, the `require.main` wrapper
- Modify: `server/scripts/lib/exportFiles.js` (gains `cmpStr`, `cmpLine`, `jsonl`, `parseArgs`) and
  `server/scripts/export-served-versions.js` (imports them instead of defining them)
- Test: `server/__tests__/openingEligibility.test.js` (new)

**Interfaces:**
- Consumes:
  - `bookSwitches.firstSwitchOnMs(conn, book, 'suggestion-view')` (PR3 Task 8);
  - `module_openings` (PR2 Task 1);
  - Task 3's tree; `exportFiles`, including `exportDirs()` (Task 5).
- Produces:
  - `openedAfterFirstSwitchOn → boolean`. `null` inputs give `false`. A non-integer gives a `TypeError`.
  - `ELIGIBILITY_KEYS = ['book', 'chapter', 'module_id', 'opened_after_first_switch_on']`.
  - Lines `{ book, chapter, module_id, opened_after_first_switch_on }`, sorted as decision 13.
  - The file `<outDir>/opening-eligibility.<book>.jsonl` (`0600`, in a `0700` directory); `main`'s `outDir`
    defaults to `exportDirs().exportsDir`, read when it runs.
  - CLI: `node server/scripts/opening-eligibility.js --ref <tag-or-commit> [--book <slug>] [--write]`. A dry run prints
    `{ book, commit, modules, yes, no }`.

- [ ] **Step 1: Write the failing test** (`freshMigratedDb()`; the tree is a hand-built `{ commit, modules }` object, no
  git, except one case that uses Task 3's reader on a git fixture)

- `describe('openedAfterFirstSwitchOn (decisions 16, 17)')`:

  | `openedAtMs` | `firstSwitchOnMs` | Result |
  |---|---|---|
  | 2000 | 1000 | `true` |
  | 1000 | 2000 | `false` |
  | 1500 | 1500 | `false` (equal) |
  | 1000 | `null` | `false` (never switched on) |
  | `null` | 1000 | `false` (never opened) |
  | `null` | `null` | `false` |

  `openedAtMs: '2000'` throws a `TypeError`.
- `describe('deriveOpeningEligibility')`:
  - `it('uses the lowest-id switch-on, not the earliest time (§5.13)')`:
    - `book_switch_events` rows in insertion order: `(suggestion-view, 1, 1000)`, `(…, 0, 2000)`, `(…, 1, 500)`;
    - modules opened at 800 (`m1`) and 1200 (`m2`) → `m1 false`, `m2 true`;
    - control: a rule reading the earliest time (500) would give `m1 true`, which this fixture distinguishes;
    - switched off at 2000 changes nothing for `m2`.
  - `it('a module never opened is false, and is listed')`: tree modules `[1 m1, 1 m2, 1 m3]`, an opening only for `m2`
    → `m3` is listed with `false`.
  - `it('a module with an opening row but absent at the ref is still listed (Review Focus 15)')`: an opening for `m9`,
    not in the tree → one `m9` line.
  - `it('another switch name or book does not count')`: a row `('liffraedi-2e', 'suggestion-view', 1, 1)` and a row
    `('efnafraedi-2e', 'other-switch', 1, 1)` → chemistry's first switch-on stays `null` (every line `false`). Control:
    adding chemistry's `suggestion-view` row makes the opened one `true`.
  - `it('lines are sorted by locator, not by opening time')`: openings at 300 (`ch02 m5`), 100 (`ch01 m9`) and 200
    (appendices `m1`) → order `ch01 m9, ch02 m5, appendices m1`.
  - `it('refuses a database without the opening or switch tables')`: on a copy (`VACUUM INTO`), opened, then
    `pragma('foreign_keys = OFF')` and `DROP TABLE module_openings` → `SCHEMA_MISSING`. The pragma keeps any
    `module_opening_inflight` rows: they reference `module_openings` `ON DELETE CASCADE` (PR2 Task 1), so with foreign
    keys on the drop would succeed by deleting them first (measured, "State of this plan"), and the copy would no
    longer be the fixture minus one table. Control: the fixture database passes.
- `describe('the file')`:
  - `it('writes one flat file, 0600 in a 0700 directory, keys in order')`:
    - `writeOpeningEligibility` into `outDir = <tmp>/research-exports` → `fs.readdirSync(outDir)` equals
      `['opening-eligibility.efnafraedi-2e.jsonl']`;
    - `statSync(file).mode & 0o777 === 0o600`, and the directory's `0o700`, under `process.umask(0o022)` (restored);
    - each parsed line's `Object.keys` equals `ELIGIBILITY_KEYS`.
  - `it('an outDir under books/ is refused')` → `OUT_UNDER_BOOKS`.
- `describe('the command line')`, as Task 6's:
  - a dry run creates no directory and prints `{ book, commit, modules, yes, no }`, on a git fixture through Task 3;
  - `--book lifraen-efnafraedi` → `1` before any read;
  - `--book efnafraedi` (no module at the ref) → `1`, `/BAD_BOOK/`, nothing written. Control: the fixture's
    `efnafraedi-2e` at the same ref returns `0`;
  - an unknown flag → `2`;
  - a missing database → `1`;
  - `--write` writes the file;
  - `--write` with no `outDir` and `SESSIONS_DB_PATH = <tmp>/sessions.db` writes
    `<tmp>/research-exports/opening-eligibility.efnafraedi-2e.jsonl`, which is under
    `researchFilesFor(resolveResearchDbPath().researchPath).exportsDir`.

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/openingEligibility.test.js`
Expected: FAIL — `Cannot find module '../lib/openingEligibility'`.

- [ ] **Step 3: Implement.** `server/lib/openingEligibility.js` header:
  - G1.23 §6.2's rule in one place, for this script and for G1.23's serve-time check;
  - strictly earlier: equality cannot show order (decision 16);
  - never opened → `false` (decision 17);
  - never send a time to a browser (§11).

```js
function openedAfterFirstSwitchOn({ openedAtMs, firstSwitchOnMs }) {
  for (const [name, v] of [['openedAtMs', openedAtMs], ['firstSwitchOnMs', firstSwitchOnMs]]) {
    if (v !== null && !Number.isSafeInteger(v)) throw new TypeError(`${name} must be an integer or null`);
  }
  return openedAtMs !== null && firstSwitchOnMs !== null && firstSwitchOnMs < openedAtMs;
}
module.exports = { openedAfterFirstSwitchOn };
```

  `server/scripts/opening-eligibility.js` header:
  - §5.22: the one admin script that may read `module_openings` and `book_switch_events`;
  - it writes a yes/no and never a time;
  - why it is not `research-` named (decision 18);
  - usage, with the production-host route, as Task 6.

  The core:

```js
const bookSwitches = require('../lib/bookSwitches');
const { openedAfterFirstSwitchOn } = require('../lib/openingEligibility');
const { cmpLine } = require('./lib/exportFiles');

const ELIGIBILITY_KEYS = Object.freeze(['book', 'chapter', 'module_id', 'opened_after_first_switch_on']);
const SWITCH = 'suggestion-view';

function deriveOpeningEligibility({ db, tree, book }) {
  for (const t of ['module_openings', 'book_switch_events']) {
    if (db.pragma(`table_info(${t})`).length === 0) throw coded('SCHEMA_MISSING', `sessions.db lacks ${t}`);
  }
  return db.transaction(() => {
    const firstSwitchOnMs = bookSwitches.firstSwitchOnMs(db, book, SWITCH); // PR3 Task 8: lowest-id row with value 1
    const openedAt = new Map();
    for (const r of db.prepare('SELECT chapter, module_id, opened_at_ms FROM module_openings WHERE book = ?').all(book)) {
      openedAt.set(`${r.chapter}/${r.module_id}`, r.opened_at_ms);
    }
    const modules = new Map(tree.modules.map((m) => [`${m.chapter}/${m.moduleId}`, m]));
    for (const k of openedAt.keys()) {
      if (!modules.has(k)) {
        const [c, ...rest] = k.split('/');
        modules.set(k, { chapter: Number(c), moduleId: rest.join('/') });
      }
    }
    return [...modules.entries()].map(([k, m]) => ({
      book, chapter: m.chapter, module_id: m.moduleId,
      opened_after_first_switch_on: openedAfterFirstSwitchOn({ openedAtMs: openedAt.get(k) ?? null, firstSwitchOnMs }),
    })).sort(cmpLine); // decision 13's order: never by opening time
  })();
}
```

  `writeOpeningEligibility`: `refuseUnderBooks`, `ensureDir(outDir, 0o700)`,
  `atomicWrite(path.join(outDir, `opening-eligibility.${book}.jsonl`), jsonl(lines), 0o600)`. `main` mirrors Task 6
  (the same parser; organic refused first; `const dir = outDir ?? exportDirs().exportsDir` inside `main`; every
  book's tree refused as `BAD_BOOK` when it has no module, before the database opens; the dry-run report `{ mode,
  book, commit, modules: n, yes: n, no: n }`).
  In this task, move `cmpStr`, `cmpLine`, `jsonl` and `parseArgs` from `export-served-versions.js` into
  `server/scripts/lib/exportFiles.js`, and make the export import them: one sort, one line format and one parser, so
  both scripts refuse the same unknown flags.

- [ ] **Step 4: Run it, and Task 5's suite (the comparator moved)**

Run: `npx vitest run server/__tests__/openingEligibility.test.js server/__tests__/exportServedVersions.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/openingEligibility.js server/scripts/opening-eligibility.js server/scripts/lib/exportFiles.js \
  server/scripts/export-served-versions.js server/__tests__/openingEligibility.test.js
git commit -m "feat(server): opening-eligibility — opened after the first switch-on, per module, never a time (spec §5.22)"
```

---

### Task 8: the raw research export: events and items by value, every served-version id replaced by its key

Spec §5.19's last bullet (one admin script into `research-exports/`, mapping each event's `served_version_id` to its
`version_key`), §5.22, §5.16 (admin readers; no export joins the key map), §5.15 step 4 (the deletion empties the
directory), §5.1 (`fileMustExist`); index decision 6; decisions 6, 19–22; Review Focus 12, 16–20, 22.

**Files:**
- Create: `server/scripts/research-export.js` — `buildResearchExport({ researchDb, sessionsDb })`,
  `writeResearchExport({ result, outDir, repoRoot })`, `main(…)`, the `require.main` wrapper
- Test: `server/__tests__/researchExport.test.js` (new)

PR4's admin reader is consumed, never modified (PR4's "PR5 must not change" list).

**Interfaces:**
- Consumes:
  - PR4's admin reader `server/scripts/lib/researchAdmin.js` (Task 4): `openResearch({ researchPath })` (read-only,
    `fileMustExist`, `defaultSafeIntegers(true)`: every integer a `BigInt`; it does not resolve the path),
    `iterateEvents(db)` (an iterator, `ORDER BY editor_key, key_seq`) and `itemsForEvent(db, eventId: bigint)` (`ORDER
    BY ordinal`). Never `keyForInterval` or `allKeys` (PR4's handoff: no export joins the key map, §5.16);
  - PR3's `resolveResearchDbPath()`, whose `researchPath` `research-export.js` passes to `openResearch`;
  - `versionRecord` (Task 2); `exportFiles`, including `exportDirs()` (Task 5);
  - PR3's `ensureResearchSchema` (test fixture only).
- Produces:
  - `buildResearchExport → { events, items, versions, summary: { events, items, versions, versionJoin: { none,
    ok, missing, mismatch }, nestedUnmatched } }`;
  - three files in `exportDirs().exportsDir` (PR4's `research-exports/`, read when `main` runs):
    `research-events.jsonl`, `research-event-items.jsonl`, `research-served-versions.jsonl` (`0600`, directory
    `0700`);
  - CLI: `node server/scripts/research-export.js [--write]`. No `--book`: `research.db` holds only study books.

- [ ] **Step 0: Confirm PR4's pieces in the tree, as its plan names them.**
  - `grep -an "function openResearch\|const iterateEvents\|const itemsForEvent" server/scripts/lib/researchAdmin.js`
    prints the three, and `grep -an "function researchFilesFor" server/lib/researchFiles.js` prints one.
  - If a name, a signature or `iterateEvents`' order differs from "Interfaces" above, stop and re-derive: the tree
    wins, and PR4's module is not this PR's to change.
  - PR4 already widened PR3's `forbiddenTableUses` to `scripts/research-*.js` and `scripts/lib/research*.js` (PR4
    Task 5), so `research-export.js` is scanned by name; Task 9 adds it to the visited list.

- [ ] **Step 1: Write the failing test**

Fixture:
- `SESSIONS_DB_PATH` → `freshMigratedDb()`'s path. PR3's `deriveResearchPath` then gives `research.db` beside it.
- The research file is built there with `ensureResearchSchema`.
- `editor_keys`: one row `(interval_id 424242, editor_key 'a'.repeat(32), stratum 'SENTINEL-STRATUM')`.
- Versions minted in `sessions.db` as in Task 5, all `chapter 1`, `occurrence 0`: `v1` (`m90001:para:a`, `is_text
  'MT-A'`), `v2` (`m90001:para:b`), and `v3` (`m90001:para:c`, `is_text 'MT-A'`: another segment with the same
  Icelandic as `v1`, so the same `is_sha256`).

Events (`defaultSafeIntegers` on the fixture handle), all under the one key, with `key_seq` 1 to 5 in table order
and every `NOT NULL` column of PR3 Task 2's schema filled (`event_type`, `server_time_ms`, `replayed`, `book`
`'efnafraedi-2e'`, `chapter 1`, `module_id 'm90001'`, `flag_snapshot_json`, `commit_source`); `segment_id` and
`occurrence 0` as named, `NULL` for E4:

| Event id | `segment_id` | `served_version_id` | `base_is_sha256` | Other |
|---|---|---|---|---|
| `E1 = 9007199254740993n` | `m90001:para:a` | `v1` | `v1`'s | `edit-resave`. `before_json` is PR3's shape, `[{ table: 'segment_edits', row: { book: 'efnafraedi-2e', module_id: 'm90001', segment_id: 'm90001:para:a', served_version_id: v1, status: 'pending' } }]`. One item (`ordinal 0`, `repetition-insert`) |
| `E2 = 2n` | `m90001:para:b` | `v2` | `sha256Text('OTHER')` | the hash mismatch |
| `E3 = 3n` | `m90001:para:a` | `999999` | — | no such row |
| `E4 = 4n` | `NULL` | `NULL` | — | `module-opened`. `detail_json` `{ servedVersionIds: [{ segmentId: 'm90001:para:a', occurrence: 0, servedVersionId: v1 }, { segmentId: 'm90001:para:x', occurrence: 0, servedVersionId: v2 }], duplicatedIds: [], inflightCount: 0 }`, whose second entry names a version of another segment |
| `E5 = 5n` | `m90001:para:a` | `v3` | `v1`'s (= `v3`'s) | the locator mismatch: a restored `sessions.db` reused the id for another segment with equal text |

- `it('the column: ok, mismatch, missing, none (decision 21)')`:
  `buildResearchExport({ researchDb, sessionsDb }).events.map((e) => [e.id, e.version_key, e.version_join])` equals,
  sorted by `key_seq`, `[[ '9007199254740993', K(v1), 'ok' ], [ '2', null, 'mismatch' ], [ '3', null, 'missing' ],
  [ '4', null, 'none' ], [ '5', null, 'mismatch' ]]`, and `summary.versionJoin` equals `{ none: 1, ok: 1, missing: 1,
  mismatch: 2 }`.
  - E5 is the locator case: `v3`'s `is_sha256` equals E5's `base_is_sha256`, so a hash-only join would read `ok` and
    carry `K(v3)`. Control: E1, whose row names its own segment, stays `ok` with `K(v1)`.
- `it('nested ids are replaced, and checked against their locator')`:
  - E1's `before[0].row.version_key === K(v1)`, and the row has no `served_version_id` key;
  - E4's `detail.servedVersionIds` equals `[{ segmentId: 'm90001:para:a', occurrence: 0, versionKey: K(v1) }, {
    segmentId: 'm90001:para:x', occurrence: 0, versionKey: null }]`;
  - `summary.nestedUnmatched === 1`.
- `it('no served-version id survives anywhere')`: a deep walk over every exported event and item finds no key named
  `served_version_id` or `servedVersionId`. Control: the same walk over the raw research rows (`JSON.parse` of their
  `*_json` columns, plus the column itself) finds them.
- `it('ids above 2^53 are exact decimal strings')`: `events[0].id === '9007199254740993'`, and the item's `event_id`
  equals it. Control: `String(Number(9007199254740993n))` is `'9007199254740992'`, so the hazard is real.
- `it('the versions file lists exactly the versions referenced and verified')`: the set of `versions.map((v) =>
  v.version_key)` is `{K(v1)}`. `v2` is named only by the mismatched column and the unmatched nested entry, and `v3`
  only by E5's locator mismatch. No record has an `id`.
- `it('the key map is never read: no interval id, no stratum')`: the serialized files contain neither `'424242'`,
  `'"interval_id"'`, `'SENTINEL-STRATUM'` nor `'"stratum"'`. Control: the research file holds both values.
- `it('writes three flat files, 0600 in a 0700 directory')`: `readdirSync(outDir).sort()` equals
  `['research-event-items.jsonl', 'research-events.jsonl', 'research-served-versions.jsonl']`, and the modes are as
  Task 7's.
- `it('the command line')`:
  - a dry run creates no directory and prints the summary;
  - `--write` writes;
  - `--write` with no `outDir` writes into `path.join(path.dirname(process.env.SESSIONS_DB_PATH), 'research-exports')`,
    which equals `researchFilesFor(resolveResearchDbPath().researchPath).exportsDir` (decision 13; Review Focus 22);
  - with no `research.db` at the derived path → `1`, `/research\.db/` on `err`, nothing written (§5.1);
  - an unknown flag → `2`.
- `it('reads research.db only through the admin reader (index decision 6; PR4\'s handoff)')`, on
  `src = fs.readFileSync(<research-export.js>, 'latin1')` (bytes, so a NUL cannot hide a match). Each pin has a planted
  control in the same case: a temp file holding the bad shape is matched, so the pattern can bite.
  - **The opener is PR4's:** `src` matches `/require\(\s*['"]\.\/lib\/researchAdmin['"]\s*\)/` and `/\bopenResearch\(/`
    (positive control on the real file).
  - **Its only `new Database(` is `sessions.db`:** every match of `/new Database\(([^,)]*)/g` in `src` captures exactly
    `resolveDbPath()`, and there is at least one. Control: a planted file holding `new Database(researchPath, {
    readonly: true })` yields a capture other than `resolveDbPath()`.
  - **It never touches the key map:** `src` matches none of `/\bkeyForInterval\b/`, `/\ballKeys\b/`,
    `/\beditor_keys\b/` (PR4's handoff offers this pin). Control: a planted file holding `keyForInterval(db, 1)` matches.
  - `resolveResearchDbPath` is allowed: PR4's opener takes the path from its caller, and PR3's module is where the path
    comes from (PR4's own scripts do the same).

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/researchExport.test.js`
Expected: FAIL — `Cannot find module '../scripts/research-export'`.

- [ ] **Step 3: Implement** `server/scripts/research-export.js`. Header:
  - spec §5.19's last bullet, §5.22 and §5.16;
  - the production host only (decision 6);
  - the files PR4's deletion empties;
  - why no key map (decision 20);
  - why every nested id is replaced (decision 21);
  - **the header and the code spell no table §5.22 forbids**: PR3's scan reads this file's bytes. Say "the editing
    tables";
  - **nor the key table, nor PR4's key readers**: Task 8's source pin reads the same bytes. Say "the key map".

  The mapping core:

```js
const Database = require('better-sqlite3');
const resolveDbPath = require('../lib/dbPath');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const { openResearch, iterateEvents, itemsForEvent } = require('./lib/researchAdmin');
const { versionRecord } = require('../lib/servedVersionKey');
const { exportDirs, refuseUnderBooks, ensureDir, atomicWrite, cmpStr } = require('./lib/exportFiles');

const coded = (code, message) => Object.assign(new Error(message), { code });
const NESTED = Object.freeze({ served_version_id: 'version_key', servedVersionId: 'versionKey' });
const JSON_COLS = Object.freeze({ content_json: 'content', before_json: 'before', detail_json: 'detail',
  flag_snapshot_json: 'flag_snapshot' });

const toNumber = (v) => {
  if (v === null) return null;
  const n = typeof v === 'bigint' ? Number(v) : v;
  if (!Number.isSafeInteger(n)) throw coded('UNSAFE_INTEGER', `integer ${String(v)} is not safe as a number`);
  return n;
};

function buildResearchExport({ researchDb, sessionsDb }) {
  const byId = sessionsDb.prepare('SELECT * FROM served_text_versions WHERE id = ?');
  const referenced = new Map();
  const counts = { none: 0, ok: 0, missing: 0, mismatch: 0 };
  let nestedUnmatched = 0;
  const keep = (row) => {
    const rec = versionRecord(row);
    referenced.set(rec.version_key, rec);
    return rec.version_key;
  };

  const mapNested = (value, ev) => {
    if (Array.isArray(value)) return value.map((v) => mapNested(v, ev));
    if (value === null || typeof value !== 'object') return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (!(k in NESTED)) { out[k] = mapNested(v, ev); continue; }
      if (v === null) { out[NESTED[k]] = null; continue; }
      const row = byId.get(v);
      const book = value.book ?? ev.book;
      const moduleId = value.module_id ?? value.moduleId ?? ev.module_id;
      const segmentId = value.segment_id ?? value.segmentId ?? null;
      const ok = row && row.book === book && row.module_id === moduleId &&
        (segmentId === null || row.segment_id === segmentId);
      if (!ok) nestedUnmatched += 1;
      out[NESTED[k]] = ok ? keep(row) : null;
    }
    return out;
  };

  // Decision 21: the row must name the event's own locator, not only carry its hash. r is a raw research row, whose
  // integers are BigInt (PR4's opener); row is a sessions.db row, whose integers are numbers.
  const sameLocator = (row, r) => row.book === r.book && row.module_id === r.module_id &&
    row.chapter === toNumber(r.chapter) &&
    (r.segment_id === null || row.segment_id === r.segment_id) &&
    (r.occurrence === null || row.occurrence === toNumber(r.occurrence));

  // PR4's reader, in its order (editor_key, key_seq). Materialised first; a read during an open iterate also works.
  const raw = [...iterateEvents(researchDb)];
  const events = raw.map((r) => {
    const ev = {};
    for (const [col, v] of Object.entries(r)) {
      if (col === 'id') ev.id = String(v);
      else if (col === 'served_version_id') {
        let join = 'none', key = null;
        if (v !== null) {
          const row = byId.get(toNumber(v));
          if (!row) join = 'missing';
          else if (row.is_sha256 !== r.base_is_sha256 || !sameLocator(row, r)) join = 'mismatch';
          else { join = 'ok'; key = keep(row); }
        }
        counts[join] += 1;
        ev.version_key = key;
        ev.version_join = join;
      } else if (col in JSON_COLS) ev[JSON_COLS[col]] = v === null ? null : mapNested(JSON.parse(v), r);
      else ev[col] = typeof v === 'bigint' ? toNumber(v) : v;
    }
    return ev;
  });
  // Items in their event's order, then ordinal (PR4's itemsForEvent). r.id is passed as the raw BigInt, before any
  // stringifying: an id above 2^53 would not survive Number().
  const items = raw.flatMap((r) => itemsForEvent(researchDb, r.id).map((it) => {
    const out = {};
    for (const [col, v] of Object.entries(it)) {
      if (col === 'event_id') out.event_id = String(v);
      else if (col === 'detail_json') out.detail = v === null ? null : mapNested(JSON.parse(v), r);
      else out[col] = typeof v === 'bigint' ? toNumber(v) : v;
    }
    return out;
  }));
  return { events, items, versions: [...referenced.values()].sort((x, y) => cmpStr(x.version_key, y.version_key)),
    summary: { events: events.length, items: items.length, versions: referenced.size, versionJoin: counts,
      nestedUnmatched } };
}
```

  `mapNested(JSON.parse(v), r)` receives the raw row `r`, whose `book` and `module_id` are strings, so the locator
  comparison is string to string; `sameLocator` converts the event's BigInt `chapter` and `occurrence` before
  comparing. `writeResearchExport`:
  - `refuseUnderBooks`, then `ensureDir(outDir, 0o700)`;
  - the three files through `atomicWrite(…, 0o600)`, one `JSON.stringify` per line.

  `main({ argv, out, err, repoRoot, outDir })`:
  - `--write` only: any other argument → `2` (the shared `parseArgs` requires `--ref`, which this script has not);
  - `const dir = outDir ?? exportDirs().exportsDir`, inside `main` (decision 13);
  - opens `research.db` with `openResearch({ researchPath: resolveResearchDbPath().researchPath })` (its
    `SQLITE_CANTOPEN` → `1`, "research.db is absent: …");
  - opens `sessions.db` with `new Database(resolveDbPath(), { readonly: true, fileMustExist: true })`, the file's only
    `new Database(` (Task 8's source pin);
  - reads both inside their own read transactions;
  - closes both in `finally`.

- [ ] **Step 4: Run it, the boundary file (the research-* scan now reads this file) and PR4's reader test**

Run: `npx vitest run server/__tests__/researchExport.test.js server/__tests__/researchBoundary.test.js server/__tests__/researchAdmin.test.js`
Expected: PASS. `forbiddenTableUses(SERVER_ROOT)` (as PR4 leaves it) stays `[]` with `research-export.js` in its scan,
and PR4's admin-reader test is unchanged and green (this task does not touch that module).

- [ ] **Step 5: Commit**

```bash
git add server/scripts/research-export.js server/__tests__/researchExport.test.js
git commit -m "feat(server): research-export — events and items for analysis, served versions joined by value (spec §5.19)"
```

---

### Task 9: T17, PR5's part: the eligibility output holds only book, chapter, module and the yes/no; the server never loads PR5's scripts

Spec §10 T17 ("the eligibility script's output holds only book, chapter, module and the yes/no"), §5.19 ("never the
running server"; the export carries no key), §5.22; index decision 15; decision 6; Review Focus 19, 20, 25.

**Files:**
- Modify: `server/__tests__/researchBoundary.test.js` (PR1's file, as PR2, PR3 and PR4 leave it) — three `describe`
  blocks, plus `'scripts/research-export.js'` added to the visited list of `forbiddenTableUses` as PR4 leaves it

**Interfaces:**
- Consumes:
  - PR2's `filesNaming(root, pattern)`;
  - PR4's `nonScriptFilesNaming(root, pattern) → { found, visited }` (PR4 Task 4: every top-level entry of `server/`
    except `scripts/` and `__tests__/`, skipping `node_modules` and `.venv` at any depth);
  - `forbiddenTableUses` and its visited-file assertion, as PR4 leaves them (PR4 Task 5 widened the scan to
    `scripts/research-*.js` and `scripts/lib/research*.js` and listed `research-withdrawal.js`, `research-status.js`,
    `lib/researchAdmin.js` and `lib/researchPurge.js`);
  - `deriveOpeningEligibility`, `writeOpeningEligibility` and `ELIGIBILITY_KEYS` (Task 7);
  - the file's own migrated database and env (PR1 Task 6 moved `SESSIONS_DB_PATH` to the top).
- Produces: local `eligibilityLineViolations(line) → string[]`, `PR5_REQUIRES`, `RESEARCH_NAMES`.

- [ ] **Step 1: Write the tests**

```js
// A require, not a mention: server/lib/openingEligibility.js's header may name the script in prose (Review Focus 25).
const PR5_REQUIRES =
  /require\([^)]*(?:export-served-versions|opening-eligibility|research-export|endOfEditingTree|exportFiles)/;
// The research tables and modules, and PR4's admin reader. `\bresearchDb\b` does not match `researchDbPath`, which
// exportFiles requires for the directories (decision 13).
const RESEARCH_NAMES = new RegExp([
  'research_events', 'research_event_items', 'editor_keys', 'research_consent', 'researchDb', 'researchLog',
  'researchAdmin', 'openResearch', 'iterateEvents', 'itemsForEvent', 'keyForInterval', 'allKeys',
].map((n) => `\\b${n}\\b`).join('|'));
function eligibilityLineViolations(line) {
  const v = Object.keys(line).filter((k) => !ELIGIBILITY_KEYS.includes(k)).map((k) => `key:${k}`);
  for (const k of ELIGIBILITY_KEYS) if (!(k in line)) v.push(`missing:${k}`);
  if (typeof line.book !== 'string') v.push('book');
  if (!Number.isInteger(line.chapter)) v.push('chapter');
  if (typeof line.module_id !== 'string') v.push('module_id');
  if (typeof line.opened_after_first_switch_on !== 'boolean') v.push('opened_after_first_switch_on');
  return v;
}
```

- `describe('T17 (PR5): the eligibility output holds only book, chapter, module and the yes/no (spec §5.22)')`:
  - `it('every line passes, and no time reaches the file')`:
    - setup: `module_openings` rows for `m1` at `OPENED = 1777000000123` and `m2` at `1777000000456`, and
      `book_switch_events` `(efnafraedi-2e, suggestion-view, 1, SWITCHED = 1666000000789)`;
    - the tree is `{ commit: 'c'.repeat(40), modules: [1 m1, 1 m2, 1 m3] }`;
    - write it to a temp `research-exports/`;
    - every parsed line's `eligibilityLineViolations` is `[]`;
    - the file's bytes contain none of `String(OPENED)`, `'1777000000456'`, `String(SWITCHED)`,
      `new Date(OPENED).toISOString().slice(0, 10)` or `new Date(SWITCHED).toISOString().slice(0, 10)`;
    - control: those values are in the database (`SELECT opened_at_ms …`, `SELECT switched_at_ms …`).
  - `it('control: a planted time or extra key is caught')`:
    - `eligibilityLineViolations({ book: 'b', chapter: 1, module_id: 'm1', opened_after_first_switch_on: true,
      opened_at_ms: 1 })` → `['key:opened_at_ms']`;
    - `…, opened_after_first_switch_on: 1777000000123` → `['opened_after_first_switch_on']`;
    - control: the well-formed line → `[]`.
- `describe('T17 (PR5): nothing the server process loads requires the end-of-editing scripts (spec §5.19, decision 6)')`:
  - `it('no file outside server/scripts and server/__tests__ requires them')`: `nonScriptFilesNaming(SERVER_ROOT,
    PR5_REQUIRES).found` equals `[]`, and its `visited` contains `'index.js'`, `'routes/segment-editor.js'`,
    `'services/segmentParser.js'`, `'middleware/errorHandler.js'` and `'lib/openingEligibility.js'` (an empty result is
    not an empty read).
  - `it('control: a planted require is found wherever it is not allowed, and a mention is not')`: a temp root holding
    `index.js`, `routes/x.js` and `lib/z.js`, each with `require('../scripts/export-served-versions')` (or
    `'./scripts/…'` at the root); `lib/prose.js` whose only mention is the comment `// see
    scripts/opening-eligibility.js`; and `scripts/ok.js` and `__tests__/t.test.js` holding the same require →
    `found` equals `['index.js', 'lib/z.js', 'routes/x.js']`.
  - `it('positive control: the pattern does find them')`: `filesNaming(path.join(SERVER_ROOT, '__tests__'),
    PR5_REQUIRES)` contains `'exportServedVersions.test.js'` and `'openingEligibility.test.js'`.
- `describe('T17 (PR5): the end-of-editing export reads no research data (spec §5.19: no editor key)')`:
  - `it('its files name no research table, module or reader')`: the bytes of `scripts/export-served-versions.js`,
    `scripts/lib/endOfEditingTree.js`, `scripts/lib/exportFiles.js` and `lib/servedVersionKey.js` do not match
    `RESEARCH_NAMES`. (`exportFiles.js` requires `researchDbPath` and `researchFiles` for the directories only.)
  - `it('control: the pattern bites')`: `research-export.js`'s bytes match `RESEARCH_NAMES` (it requires
    `./lib/researchAdmin` and calls `iterateEvents`: a real research reader), and a planted temp file holding
    `editor_keys` matches. A planted file holding only `require('../../lib/researchDbPath')` does not match (the
    allowance above is real).
- **The research-* scan, as PR4 leaves it:** its visited-list assertion (`research-withdrawal.js`,
  `research-status.js`, `lib/researchAdmin.js`, `lib/researchPurge.js`) also requires `'scripts/research-export.js'`,
  so an empty scan cannot pass.

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/researchBoundary.test.js`
Expected: PASS for the scans on a correct tree and their controls. These are pins: their red arm is each `describe`'s
planted control. **Make the pins bite before committing:**
1. Copy `server/scripts/opening-eligibility.js` to a golden file.
2. Add `opened_at_ms: openedAt.get(k)` to each line. Run the file: the first `describe` FAILS, naming
   `key:opened_at_ms`.
3. Restore from the golden copy with `cp` and `cmp` it (CLAUDE.md § Commands: never `git checkout` for a mutation
   restore). Run `git status --porcelain`.

- [ ] **Step 3: Implement** — nothing beyond the tests (the behaviour landed in Tasks 5–8).

- [ ] **Step 4: Run the whole PR's suites together**

Run: `npx vitest run server/__tests__/researchBoundary.test.js server/__tests__/openingEligibility.test.js server/__tests__/exportServedVersions.test.js server/__tests__/researchExport.test.js`
Expected: PASS, including PR1's, PR2's and PR3's `describe` blocks in the boundary file.

- [ ] **Step 5: Commit**

```bash
git add server/__tests__/researchBoundary.test.js
git commit -m "test(server): T17 for PR5 — the eligibility output carries no time; the server never loads the exports"
```

---

## Interfaces produced

CommonJS under `server/`; tests reach them through `createRequire(import.meta.url)`.

### `server/services/segmentParser.js` (Task 1)

```ts
pairForEditing({ enContent: string, faithfulContent?: string | null, mtContent?: string | null }):
  { isSource: 'faithful' | 'mt-output' | null,
    segments: { segmentId, moduleId, segmentType, elementId, en: string, is: string, hasTranslation: boolean }[] }
chapterOfForMtDir(name: string): number | null       // listChapters' rule
moduleIdOfEnFile(name: string): string | null        // listChapterModules' rule
```

`loadModuleForEditing` is `pairForEditing` plus its findings and metadata. **G1.12 (b)** changes the pairing here, and
the export follows.

### `server/lib/servedVersionKey.js` (Task 2)

```ts
VERSION_KEY_FIELDS: readonly ['book','chapter','module_id','segment_id','occurrence','en_sha256','is_sha256','layer']
versionKey(row: ServedTextVersionRow): string      // sha256Text(fields.join('|')); VERSION_FIELD on '|' or a bad field
versionRecord(row): { version_key, book, chapter, module_id, segment_id, occurrence, layer,
                      en_sha256, is_sha256, en_text, is_text }   // no id; VERSION_CORRUPT on a hash/text mismatch
```

### `server/lib/openingEligibility.js` (Task 7)

```ts
openedAfterFirstSwitchOn({ openedAtMs: number | null, firstSwitchOnMs: number | null }): boolean   // strict <
```

### `server/scripts/lib/endOfEditingTree.js` (Task 3)

```ts
REPO_ROOT: string
resolveCommit({ repoRoot?, ref }): string                                    // 40 hex; BAD_REF
bookTreeAt({ repoRoot?, commit, book }): { commit, book, modules: { chapter, moduleId }[],
                                           loadModule(chapter, moduleId): { isSource, segments } }
faithfulMatchesCheckout({ repoRoot?, commit, book }): boolean   // same non-ignored paths and blob ids; writes nothing
```

### `server/scripts/lib/exportFiles.js` (Tasks 5, 7)

`exportDirs() → { exportsDir, servedVersionExportsDir }` (PR4's `researchFilesFor`, read at call time; no directory
constant), `refuseUnderBooks(dir, repoRoot)`, `jsonl(rows)`, `parseArgs(argv)`, `ensureDir(dir, mode?)`,
`atomicWrite(file, text, mode?)`, `cmpStr`, `cmpLine`.

### The three scripts

| Script | Writes | Reads |
|---|---|---|
| `export-served-versions.js --ref <r> [--book <b>] [--write]` | `servedVersionExportsDir/<book>.<commit>.{segments.jsonl,versions.jsonl,manifest.json}` | the commit's `02-for-mt`, `02-mt-output`, `03-faithful-translation`; `sessions.db` (approved edits, active acceptances, served versions), read-only; the checkout's faithful layer, compared only |
| `opening-eligibility.js --ref <r> [--book <b>] [--write]` | `exportsDir/opening-eligibility.<book>.jsonl` (`0600`) | the commit's module list; `module_openings`, `book_switch_events` |
| `research-export.js [--write]` | `exportsDir/research-{events,event-items,served-versions}.jsonl` (`0600`) | `research.db` through PR4's admin reader; `served_text_versions` |

`exportsDir` and `servedVersionExportsDir` are PR4's `researchFilesFor(resolveResearchDbPath().researchPath)`, beside
the research file: `pipeline-output/research-exports/` and `pipeline-output/served-version-exports/` on production.
All three: a dry run by default; exit `0` / `1` / `2`; organic refused first (the first two); a slug with no module at
the ref refused as `BAD_BOOK` (the first two); never required by a file outside `server/scripts/` and
`server/__tests__/` (Task 9).

## Before the PR

1. **The gate, as CI runs it, on the branch's tip** (index § Global Constraints):
   - `npm test` from the repository root (diff the failing set by name against `main`'s, never the count);
   - `npm run lint` **and** `npm run format:check`;
   - `cd server && CI=1 npm run test:e2e` (Task 1 changes the loader every module serve runs; decision 23);
   - `npm run docs:check` leaves `docs/_generated/` clean (it does not run in CI for this PR);
   - no dependency is added;
   - `git status --porcelain` empty.
2. **A real-corpus dry run, recorded in the PR description, not in any document.** Against a fresh migrated copy
   (`SESSIONS_DB_PATH=<tmp>/sessions.db`, migrated with `runAllMigrations`), run `node
   server/scripts/export-served-versions.js --ref HEAD` from the repository root. Expected relations, not numbers:
   - `lines` equals the number of English segment records over `listChapters` × `listChapterModules` × the loader for
     chemistry;
   - every line is `unreviewed` (a fresh database holds no edit), and `versions` is `0`;
   - nothing exists under `<tmp>/served-version-exports/` (the default beside the copy, decision 13) or
     `pipeline-output/served-version-exports/` afterwards;
   - `faithfulMatchesCheckout` is `true` exactly when `git status --porcelain --
     books/efnafraedi-2e/03-faithful-translation` printed nothing before the run (decision 1);
   - `--book efnafraedi` exits 1 with `BAD_BOOK`;
   - a mismatch is a finding: stop and re-derive.
3. **A whole-branch adversarial review.** The newest practice is a blind pair, Opus and Fable on the same brief,
   neither seeing the other's findings; **ask [USER] before commissioning the Fable half.** The alternative is a review
   workflow with several lenses and a skeptic per finding. A mutation pass restores from a golden `cp`, never
   `git checkout`, and `git status --porcelain` runs the moment any reviewing agent goes quiet. Fold confirmed findings
   in as their own commits. The Review Focus above is the brief's input-case list.
4. **Push, open the PR (draft), and deploy only on [USER]'s go.** Merge as a **merge commit**, never squash or rebase,
   and only after PR4 (index decision 17). A push to `main` from dev puts prod's content backup behind until the next
   deploy (CLAUDE.md § Content delivery).
5. A new top entry in the register: what merged, what was measured, what is next. Also the apply path's
   `chapter-metadata` defect ("Where … disagree", item 1) as its own entry, since the register owns open work.

### Questions for [USER] before or during review

- **Decision 7, needs your yes:** the hash of an approved text that the tag does not hold is over that text as the
  loader would serve it once applied (surrounding whitespace trimmed, a single newline joined, MT escapes removed, term
  markers repaired), so one approved text keeps one hash before and after apply. If no, it is the stored text's hash,
  and a later apply can change a segment's hash without changing its text. A yes is written into the spec as a dated
  `✏️ AMENDED` block before Task 4.
- **Decision 6:** is "never the running server" (§5.19) read right, as "never inside the server process"? The raw
  research export can only run on the production host, where `research.db` lives. A copy of it elsewhere would break the
  7-day deletion promise. Should the end-of-editing export and the eligibility file also run there (the plan's documented
  route), or in a development clone with a copy of `sessions.db`?
- **Decision 17:** a module never opened is "no". Research then cannot tell "opened before the switch-on" from "never
  opened". Is that acceptable, or does G1.5 need the distinction (which §5.22's yes/no would have to grow)?
- **Decision 9:** an active acceptance alongside an approved, unapplied edit on one segment **is reachable**: reject
  an edit, accept the MT, return the edit to pending, approve it (none of those steps checks the other table), or a
  failed recursive apply after the self-heal resets a restore-edge segment. Apply resolves the pair for the edit (it
  writes the edit's text and lapses the acceptance), so the export does the same: the line is `reviewed-but-unapplied`
  with the edit's key and hash, unless the tag already holds the edit's text. This reads §5.19's "the newest approved
  edit or active acceptance decides" as the newest *decision* (the approval came after the accept), not the newest
  `created_at`. Is that the reading you want? The alternative, refusing the book, would block the export on an
  ordinary review path. Only two active acceptances on one segment still refuse, which migration 043's index forbids.
- **Decision 20:** the raw export carries no stratum, because the key map is never read. Leave the stratum to G1.5's
  own export decision?
- **"Where … disagree", item 1:** applying one chapter's `chapter-metadata` stamps the other chapters' approved
  winners applied without writing them, and lapses their active acceptances. It cannot fire while the hold is on. Should
  it be fixed before the hold lifts (a register entry), and by whom?

## Handoff to G3.2 and G1.5

What later work may rely on once PR5 is on `main`. The shapes are binding. A change to them is a new decision.

**G3.2 (the corpus release) may rely on:**
- **The end-of-editing export, one set per (book, commit):**
  - `<book>.<commit>.segments.jsonl` holds exactly one line per segment occurrence of every module `listChapterModules`
    would list at that commit, `ch00`, appendices and `chapter-metadata` included. Each line is `{ book, chapter,
    module_id, segment_id, occurrence, version_key, final_sha256, state }`, sorted as decision 13.
  - `<book>.<commit>.versions.jsonl` holds the versions the lines name.
  - `<book>.<commit>.manifest.json` holds the commit and each file's sha256.
- **The same commit and the same database give byte-identical files**, whatever order served-version ids were assigned
  in (T22).
- **`state`:**
  - `complete`: the decider's text is the faithful text at the tag;
  - `reviewed-but-unapplied`: an approved edit or active acceptance exists that the tag's faithful file does not hold,
    including every such segment of a module with no faithful file at the tag;
  - `unreviewed`: no approved edit and no active acceptance.
  - The decider is what apply would publish (decision 9): the newest approved edit by `editRecency` if it is
    unapplied, else the active acceptance if any, else that newest approved edit.
- **`version_key` = `servedVersionKey.versionKey(row)`**, the content key of the served version the final text was made
  on. It is `null` for an MT acceptance, for no decider and for an edit made before G1.1, whose base is unknown, as
  G2.1 treats it. To compute `postEdited` against the served version, join `version_key` to the versions file's
  `is_text`. Where it is `null`, the base is pure MT (read `02-mt-output` at the tag) or unknown (pre-G1.1).
- **`final_sha256` = `sha256Text` of the served view**, the loader's normalisation (decision 7, as [USER] rules). For a
  `complete` line it equals `sha256Text` of what the loader serves from `03-faithful-translation` at the tag. That is
  the string G1.7's manifest hashes, so the two compare by value.
- **No editor key, username, edit id, served-version id, attempt or time** appears anywhere in these files. Decliners'
  segments are included (R1, A2).
- **The contract figure** filters the population itself: the 134 units outside ch01–ch02, with or without
  `chapter-metadata`, as G1.5 decides. The export does not filter.
- **The tag:** the end-of-editing tag is made by whoever closes editing. PR5 makes none. The export reads any ref.
  **Cut it on production's HEAD after a healthy content-backup tick** (`checks.content_backup` ok, nothing unpushed):
  faithful files reach git only through the two-hourly cron (`scripts/git-backup.sh:162-163`), and a dev push strands
  the cron's next commit until a deploy (CLAUDE.md § Content delivery). On the production host the dry run's
  `faithfulMatchesCheckout` must read `true` before `--write`; `false` means the tag lacks faithful text production
  holds, and every such applied segment would read `reviewed-but-unapplied` (decision 1).
- **Order:** the chapter is ordered by `chapterLabel.compareChapters` (appendices last), a reading of §5.19's tuple
  ("Where … disagree", item 6).

**G1.5 (the protocol) may rely on, and must decide:**
- `opening-eligibility.<book>.jsonl`:
  - `opened_after_first_switch_on` is true iff the first switch-on (lowest-id row with value 1) is strictly earlier than
    the opening;
  - a module never opened is `false` (decision 17), so `false` covers "opened before the switch-on" and "never opened";
  - the file holds no time, and its lines are ordered by locator;
  - **G1.23's serve-time §6.2 check should call `openingEligibility.openedAfterFirstSwitchOn`**, so the research file
    and the screen use one comparison.
- The raw research export (`research-events.jsonl`, `research-event-items.jsonl`, `research-served-versions.jsonl`):
  - every served-version id, in the column and nested, is a `version_key` / `versionKey`. The column also carries
    `version_join` (`none`, `ok`, `missing`, `mismatch`): analysis drops or reports the last two, never trusts them;
  - event ids are decimal strings;
  - `editor_key` is the grouping pseudonym, and there is no interval id and no stratum. The stratum's export is G1.5's
    decision;
  - **`editing_id` is kept and must not be ordered or compared**, for §5.22's reason: it follows creation order in the
    editing record;
  - the files exist only in PR4's `exportsDir` (`pipeline-output/research-exports/` on the production host), and PR4's
    deletions empty them. **G1.5 must say where analysis copies live.** A copy anywhere else is outside the deletion
    promise (§5.19).
- Losses come from `research-status.js` (PR3), not from these files.
