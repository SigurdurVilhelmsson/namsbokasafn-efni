# G1.12: duplicate segment ids in chemistry — design

- **Date:** 2026-11-12
- **Item:** Skerfur plan §3.1, gate row G1.12 (`docs/plans/2026-10-23-skerfur-development-plan.md`): _"Choose the
  mechanism in month 1, before the freeze."_
- **Decided by:** [USER] asked Claude to skip the questions, recommend (a) or (b) and write the design up
  (2026-11-12). **The recommendation and every choice below are Claude's calls for [USER] to check** (listed in §10).
  Nothing here is approved until [USER] says so.
- **Status of the work:** the active register's newest ⏩ RESUME entry, never this file.
- **Measured at:** `main` @ `5de321ca2`, in a throwaway scratch worktree. Nothing in the real tree was changed.

## 1. Recommendation

**Option (a), the extraction-side fix, with two refinements the plan row does not name:**

1. **Keep the FIRST copy.** The duplicated paragraph is emitted twice, first by the worked example's paragraph walk
   and then by the nested note's own handler. Keep the first emission and stop the second. The second keeps its
   **counter slot** but emits no text.
2. **Change the editor loader to pair the first Icelandic copy.** `02-mt-output` keeps both Icelandic copies forever
   (no hand repairs to pure MT). With one English row left, the loader must take the Icelandic copy that matches it,
   which is the first. It takes the last today.

With both refinements, the 83 modules lose 285 duplicate English segments and nothing else changes. Structure,
equations, inline attributes, every later segment id and every math placeholder stay byte-identical. Every reader of
the two Icelandic copies then agrees on one copy.

## 2. Why (a) and not (b)

- **(b) keeps a paragraph the editor would see twice.** One source paragraph would be shown as two editable rows.
  Edits to the two could diverge, and only one of them can reach readers, because there is one element in
  `01-source`. Every reader of the segment list would need an occurrence rule: TM generation, the corpus export,
  the AI harness and the research capture. The editing-burden measurement would count the same paragraph twice.
- **(a) removes the cause, and the spike shows it is clean.** Today's extractor reproduces the committed chemistry
  `02-for-mt` and `02-structure` byte for byte; the only difference is the `extractedAt` timestamp in each manifest.
  So the re-extract is a controlled change, and the before/after diff is exactly the 285 removed blocks (§3).
- **(b)'s "save backstop" already exists.** R4's refusal (`DUPLICATE_ID` in `server/services/servedVersions.js` and
  the save/accept routes) has shipped. Under (a) it stays as a generic guard and never fires for chemistry.
- **Size.** (a) is one extractor change, one line of loader logic and tests. (b) touches the editor's DOM ids, the
  save path, the lookup, `applyApprovedEdits` and every downstream reader, in code that carries research capture.

## 3. What was measured (2026-11-12)

| Measurement                                                    | Result                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicated ids in chemistry `02-for-mt` and `02-mt-output`     | 285 ids in 83 of 149 modules; 570 occurrences in each layer                                                                                                                                                                                                                                 |
| Element type of the duplicates                                 | `para`, all 285                                                                                                                                                                                                                                                                             |
| Shape in `01-source`                                           | every one occurs once, as a `<para>` inside a `<note>` nested directly in an `<example>` (203 under a section, 61 directly, 21 under a subsection)                                                                                                                                          |
| Other books                                                    | 0 duplicated ids in physics, biology, microbiology, organic and the e2e fixture                                                                                                                                                                                                             |
| English copies that differ                                     | 71 of 285 raw; **0 after normalising `[[MATH\|MEDIA\|TABLE:n]]` numbers** (zero residual)                                                                                                                                                                                                   |
| Icelandic copies that differ                                   | 75 of 285 raw; **6 after normalising the `MATH` numbers** (two independently paid MT strings; §6 item 3)                                                                                                                                                                                    |
| Size of the duplicate text                                     | 17,366 characters, 0.38% of chemistry's English segment files                                                                                                                                                                                                                               |
| Today's extractor vs committed tree                            | byte-identical except 148 manifest `extractedAt` lines                                                                                                                                                                                                                                      |
| Spike, keep-first (§5.1)                                       | only the 83 `segments.en.md` files change; each equals HEAD's file with every later copy removed, byte for byte; 0 duplicated ids remain; structure, equations, inline-attrs and links files byte-identical                                                                                 |
| `cnxml-inject`, HEAD vs spike, all chemistry, mt-preview track | all 149 injected CNXML files byte-identical; same per-chapter exit codes                                                                                                                                                                                                                    |
| `source-roundtrip-check`, HEAD vs spike, all 23 chapter dirs   | identical output, apart from 83 _"duplicate segment(s) skipped"_ notes that disappear (one per affected module); identical exit codes (22 chapters exit 1 at HEAD already)                                                                                                                  |
| `render-oracle-check`, HEAD vs spike                           | identical; `--control` passes on the spike. Its manifest covers only ch01 and ch03 (ch03 holds 25 of the duplicates)                                                                                                                                                                        |
| Editor loader after the cut, current code                      | `duplicatedIds` becomes empty, but the loader serves the **last** Icelandic copy against the **first** English copy: `[[MATH:8–10]]` against `[[MATH:11–13]]` on `m68685`. Save validation hard-blocks that (`segment-validation.js`: a `[[MATH:N]]` in English missing from the Icelandic) |
| Editor loader after the cut, first copy wins                   | English and Icelandic placeholders match on every probe                                                                                                                                                                                                                                     |
| AI change chains on duplicated ids                             | 20 chains (occurrence 0 and 1) on 10 segments, 32 records. Each chain's first `before` equals its own copy. In 7 segments the Icelandic copies are identical; in 3 they differ                                                                                                              |

The spike patches are kept outside the repo (scratchpad `spike-v2-keep-first.diff`, and the rejected
`spike-v1-keep-last.diff`). They are evidence for this choice only. The PR re-derives everything as committed tests
and scripts (§7).

## 4. The defect

`processExample` (`tools/cnxml-extract.js`) collects its paragraphs with `extractElements(example.content, 'para')`.
That regex is blind to depth, so it also returns the paragraphs of a nested `<note>`, and the walk emits each as a
`para` segment keyed on the paragraph's id. Later in the same function, the notes loop calls `processNote`, which
emits the same paragraphs again under the same ids.

Three consequences decide the design:

- **The counter.** `addSegment` bumps `counters.segment` for every segment, keyed or not, and every later `auto-N`
  id is numbered from it. `extractInlineText` also numbers `[[MATH:n]]` per call. A plain cut renumbers every later
  `auto-N` id and math placeholder in the module, while the bought MT keeps the old numbers. That would put
  equations in the wrong places with every count still matching.
- **Inject reads the example's copy.** `buildExampleDom` injects a nested note's paragraphs through the _example's_
  structure entries, by element id. `buildNoteDom` returns `null` for a nested note, and `writeNestedNoteTitles`
  writes only titles. The note node's paragraph entries are never read by inject.
- **The readers disagree about which copy counts:**

  | Reader                                                  | Copy it uses today                         |
  | ------------------------------------------------------- | ------------------------------------------ |
  | `cnxml-inject` `parseSegments`                          | first (first-match-wins)                   |
  | AI harness `tools/ai-review/worklist.js`                | by occurrence index                        |
  | AI change chains and `suggestionLogs.firstBeforeSha256` | by occurrence index                        |
  | editor loader `segmentParser.loadModuleForEditing`      | **last** (`isLookup[id] = seg` overwrites) |

  So readers see copy 0 on the mt-preview track today, while the editor would show copy 1.

## 5. The design

### 5.1 Extraction: the note's second emission takes a slot and emits nothing

- `processExample` passes `processNote` an emitter that, **for the paragraph ids its own walk has already
  emitted**, takes the counter slot and the inline-attribute capture but pushes no segment. Every other emission
  (the note's title, lists, list-item paragraphs, media alts) goes through unchanged.
  - **Key the skip on that id set, never on the segment type `'para'`.** A type-keyed skip would also swallow
    paragraphs inside a note's list items, which the example walk does not emit: a cut without an owner. The spike
    used a type-keyed wrapper and slotted exactly 285, so the corpus does not distinguish the two today. The id set
    is the correct predicate anyway.
- The slot does what `addSegment` does minus `segments.push`: `counters.segment++`, mint the same id, and consume
  `lastInlineAttrs` into `inlineAttrsMap`. That last step keeps `inline-attrs.json` byte-identical, and it keeps the
  capture from leaking into the next real segment. It is the mirror of the existing `addSegment.keyed` (§C126 #4),
  which emits without taking a slot; expose it the same way, as a property of `addSegment`.
- `extractInlineText` still runs for the skipped paragraph, so `mathMap` and the `MATH` counter advance exactly as
  today and `equations.json` stays byte-identical.
- The note node keeps its paragraph entries in `02-structure` (same segment id string), so the structure file is
  byte-identical. Nothing reads those entries for a nested note, as §4 shows.
- `processNote`'s other caller (a top-level note) is untouched.
- **Container rule (CLAUDE.md).** This is a cut without a new owner, and it is safe because the owner already exists
  and is the one inject consumes: the example walk's emission and its structure entry. The census in §3 is the
  zero-residual proof. The row's planted-fixture and sentinel requirements are in §7.

### 5.2 One rule for every reader: English occurrence k pairs with Icelandic occurrence k

After the cut, English has one occurrence of each id and the Icelandic files keep two. The shared rule is
**occurrence-keyed pairing**; with a single English occurrence, it selects the first Icelandic copy.

- **Editor loader — the one code change outside the extractor.** In `segmentParser.loadModuleForEditing`, build
  `isLookup` so the first occurrence of an id wins (or pair by occurrence explicitly). For every id that occurs
  once, this changes nothing. `applyApprovedEdits`, `servedVersions` and the suggestion view all read through this
  loader, so they follow.
- **No change needed to:** `cnxml-inject` (already first-match-wins), the AI harness and the AI change chains
  (already keyed by occurrence), or the suggestion view.
- **The builder lists every other reader that maps an IS file by segment id** (start with `generate-tm.js`,
  `export-corpus.js`, `tools/lib/tm-export.cjs`, `server/lib/sourceEnglish.js` and the localization editor) and
  confirms each takes the first copy, or reads through the loader or faithful file. A reader that takes the last
  copy is changed in the same PR, or the design comes back to [USER].
- **Stale premises in code comments.** Comments in `servedVersions.js`, the refusal sites in
  `routes/segment-editor.js` (around the `DUPLICATE_ID` handling) and the suggestion view's §6.4 docstrings say
  _"the loader serves the last copy"_. Update every one in the same PR. A premise left standing in code is how this
  repo's stale-rule incidents start.

### 5.3 What stays exactly as it is

- **`02-mt-output` and `02-mt-revised` are never touched.** Pure MT keeps 570 occurrences, of which 285 are no
  longer served. The AI layer is tool-written data and keeps its chains for both occurrences.
- **`01-source` is never touched** (licence provenance).
- **R4's refusal and the suggestion view's §6.4 rule stay in code.** After the cut no chemistry id is duplicated, so
  neither fires, but both remain the backstop for any future duplicate in any book.
- **The faithful layer needs no migration.** `applyApprovedEdits` builds the file from the loader's English-driven
  list, so the first apply on a module writes one entry per id. The unserved second copy never moves forward.

### 5.4 What the editor and the AI suggestions do after landing

- `countOccurrences` finds no duplicated id, so every one of the 285 paragraphs gets a served-version row and a
  `baseSha256`. R4 and §6.4 lift with no further change. The suggestion view's offered map can stay keyed by id: the
  register's note that lifting §6.4 must re-key it by occurrence assumed (b).
- The served Icelandic is copy 0, which is also what chain 0's first `before` describes. So all 10 segments' chain-0
  groups pass the G1.23 spec's §6.3 integrity check, subject to the usual rules (drop filter, eligibility, not closed). Chain-1
  records are never offered: their copy is no longer served. The G1.23 spec's sentence _"lifting the rule after
  G1.12 needs no data change"_ holds.
- The 6 paragraphs whose two Icelandic copies differ in wording show copy 0. That is what mt-preview readers see
  today, so the editor's baseline and the published page agree.

### 5.5 Scope of the re-extract

- **Commit chemistry only:** the 83 regenerated `02-for-mt/*/<module>-segments.en.md` files. The manifests'
  `extractedAt` lines will also move; leave them out unless a tool needs them (the builder decides, §10 call 9).
- **Other books.** Run the changed extractor over physics, biology and microbiology in a scratch tree and show no
  diff (they hold no duplicates). Organic may be extracted in scratch for that check; nothing for organic is ever
  committed (CLAUDE.md § Organic).
- **Re-extract first, then translate.** Should any later paid MT run cover these modules, it reads the new
  `02-for-mt`. That is the intended state, and nothing here buys MT.

## 6. Research record

The project documents every post-processing step (CLAUDE.md § Purpose). This change alters the **English segment
list**, not any MT layer, but it changes what editors are served, so the report must be able to reconstruct it.
Record the following in the register, and cite it from the PR:

1. **What and why.** The extractor emitted 285 note paragraphs twice in 83 chemistry modules; the second emission now
   takes its counter slot without text. Point to this design.
2. **The pure-MT consequence.** 285 Icelandic occurrences were bought twice and are no longer served. That is
   17,366 English characters; on the `--dry-run` ceiling basis about 170 ISK. The builder recomputes this on §C91's
   expectation basis and labels which basis it uses.
3. **The baseline choice for the 6 wording-different paragraphs** (`ch03 m68700 fs-idp14642528`,
   `ch08 m68747 fs-idm99049568`, `ch12 m68795 fs-idm239441760`, `ch14 m68808 fs-idm119337184`,
   `ch16 m68817 fs-idm140480768`, `ch20 m68846 fs-idp53499344`): copy 0 is the pure-MT baseline the editor starts
   from; copy 1 stays in `02-mt-output`, unserved.
4. **The AI-layer consequence.** The number of chain-1 AI changes that become unservable, measured with
   `suggestionLogs.keptGroups` (not raw records), next to the G1.23 spec's 22 kept changes in 7 segments.
5. **Before/after measurements** from §7, as committed artifacts rather than off-repo files.

## 7. What the PR must show

The G1.12 row's requirements, plus what the spike showed is needed:

1. **Census with zero residual (row).** A committed script reproduces §3's table. Required results: 285 pairs, 0
   English pairs differing after placeholder normalisation, every duplicate a `note < example` paragraph occurring
   once in `01-source`.
2. **Byte identity (row: "every other module", "no auto-N shift").** Over all 149 chemistry modules, every
   `02-structure` file (structure, equations, inline-attrs, links) is byte-identical to HEAD. Each changed English
   file equals HEAD's with every later copy removed. Byte identity of the rest is what proves no `auto-N` and no
   `MATH` shift.
3. **Controlled render pair (row).** Render `01-source` directly against an extract → inject round trip for the
   83 modules, and compare **by value at the element keyed by each paragraph's id** in the rendered HTML (never by
   prose search). Also run `source-roundtrip-check` and `render-oracle-check --control`, HEAD against the branch,
   and diff the outputs; exit codes alone mean nothing here, since 22 chapters exit 1 at HEAD.
4. **A sentinel through inject and the loader, on scratch copies only.** Copy the IS files of the affected modules
   to scratch; put a unique token in each **first** copy and a different token in each **second** copy; inject and
   load from the scratch copies. Pass means every first-copy token arrives as the whole value at its id-keyed element,
   in injected CNXML, rendered HTML and the loader's served `is`, and no second-copy token appears anywhere. The
   second copy is the control that proves the survivor rule is what the code applies. `02-mt-output` itself is never
   written.
5. **Tests that fail on the broken code** (red first, against HEAD):
   - a planted fixture (an example with a nested note paragraph that carries `<m:math>`, followed by an id-less
     segment): the paragraph is emitted once, and the later `auto-N` id and `[[MATH:n]]` numbers equal HEAD's;
   - a planted fixture with a list-item paragraph inside the nested note: it is still emitted (the id-set predicate,
     §5.1);
   - the loader, given one English occurrence and two Icelandic occurrences, serves the first;
   - `applyApprovedEdits` on such a module writes one entry per id;
   - **a corpus-anchored property:** no committed `02-for-mt` file in any book holds a duplicated SEG id. It is red
     at HEAD and green on the branch, and it protects any future extraction.
6. **Mutant hygiene.** Restore every mutated file from a golden copy, and `cmp` after each round and at the end
   (CLAUDE.md § mutation-test restore).

## 8. Order and landing

- **One PR, deployed as one unit:** the extractor change, the loader change, the 83 regenerated files and the
  tests. The two halves must not ship apart:
  - **files without the loader:** the duplicates vanish, so R4 stops refusing, and saves on 71 of the 285
    paragraphs are hard-blocked by validation, because the editor shows copy 1's Icelandic against copy 0's English
    and their `[[MATH:n]]` numbers differ (measured);
  - **loader without the files:** a no-op while English still has two rows.
- **Before landing, [USER] runs a read-only production check** (Claude's attempt was refused by the permission
  classifier on 2026-11-12). For the 83 modules, count rows in `module_openings`, `module_opening_inflight`,
  `served_text_versions`, `segment_edits`, `segment_acceptances`, `suggestion_rejections` and `suggestion_left_open`.
  **Expected: zero.** R4 says G1.12 lands before any of the 83 opens, and the suggestion view was switched on for
  chemistry at 12:01Z today. If any row exists, stop and bring it to [USER] before merging. The module list is the
  83 ids printed by the census script.
- **Ordering against other items:** before any of the 83 modules opens (R4); before G1.7's freeze manifest is
  generated, so the manifest records the post-cut segment list; before G1.13 assigns chapters. The plan's month-1
  calendar puts G1.12 before the freeze around 29 Nov–6 Dec.
- **This needs a deploy** (loader code). After the push to `main`, prod's content backup is stranded until the next
  deploy (CLAUDE.md § Content delivery), and the deploy itself needs [USER] for `sudo`.

## 9. Not in this design

- **mt-preview vs faithful elsewhere.** Inject's first-match-wins and the loader's rule now agree on these 285 ids;
  no other divergence was looked for.
- **`render-oracle-check` coverage.** Its manifest holds only ch01 and ch03. Widening it is separate work.
- **A read-time remap of chain-1 AI records.** Not built (§10 call 4).
- **Any change to pure MT, the AI layer's data or `01-source`.**

## 10. Claude's calls, for [USER] to check

1. **(a), not (b)** (§2).
2. **Keep the first copy** (the example walk's), not the note's. It is the copy inject consumes, the one readers see
   today, and the one the AI chains and the harness already key on. The rejected keep-last spike was equally clean
   on the files, but it left three readers on the other copy.
3. **The 6 wording-different paragraphs start from copy 0** (§6 item 3).
4. **No read-time remap for chain-1 AI records.** The integrity hash already prevents a wrong placement. Chain 0
   covers all 10 affected segments, so the loss is suggestions for a copy nobody is served.
5. **No change to inject, the AI harness or the suggestion view**, and no re-keying of the offered map.
6. **R4's refusal and §6.4 stay in code** as generic backstops.
7. **Commit only chemistry's regenerated files.** The extractor change reaches other books on their next extract,
   with no effect measured today.
8. **The verification ships as committed tests and scripts**, not off-repo evidence (§6 item 5).
9. **Manifests:** commit their `extractedAt` change only if a consumer needs it to reflect the re-extract; the
   builder checks and says which.
10. **Size: S–M**, against the plan row's M.

On approval: banner-freeze this file, add a dated note under the plan's G1.12 row pointing here (and noting that
the "editor fixes" batch no longer carries G1.12), and open the register entry that owns its status.
