# Target-architecture assessment — LENS D: glossary, TM and corpus exports

**Status:** assessment / evidence. **Not a register.** Open work is owned by
`docs/plans/2026-07-21-post-item17-followup-campaign.md`; this document is *evidence*, and if
it ever disagrees with the register, the register wins (CLAUDE.md § *One source of truth*).

**Date:** 2026-07-30 · **Scope:** the lead's stated target — "ALL current content re-extracted
and re-MT'd; legacy removed; glossary export, TM export and aligned-corpus export must keep
working."

**Working tree at time of measurement:** branch `feat/c16-segment-edit-reattach`, HEAD
`d775e777`, clean apart from an untracked `.codegraph/`. Every command below was run from the
repo root.

---

## 0. Headline

**The corpus/TM join key does not break under re-extraction, and the lens's central worry is
the inverse of what the evidence shows.** Re-extracting `m68700` — the module that holds 282 of
the project's 368 human-verified segments — produced **zero seg-id changes**; and chemistry
already contains a 44-module natural experiment in which modules gained segments on
re-extraction and **not one `auto-N` id shifted** (57 EN-only ids, **0** IS-only). Realized
positional-id drift corpus-wide is **2 ids**, against a 6,450-id exposure.

**What actually goes to zero is the human-verified input.** Faithful translations are **5
tracked files / 368 segments**, and the clean break discards all but two chemistry ch03 modules.
`generate-tm.js` never writes an empty TM, so the date-stamped
`efnafraedi-2e-2026-06-13.tmx` **stays on disk describing pre-break content** while
`tmService.regenerateTm` is warn-only, `books/*/tm/` is absent from the backup pathspecs, and
`status.js` marks `tmCreated` complete on *file presence*. The exports "keep working" in the
sense the lead asked about — the code runs — while producing an empty-or-stale artifact that
nothing surfaces.

**Lens D is the cheapest part of the lead's target.** Corpus = **S**, TM code = **S**, glossary
= **M** and already [LEAD]-unblocked. The expense sits elsewhere: in the editorial re-review
that rebuilds the tiers, and in C16(a), which the re-MT does **not** fix.

---

## 1. The seg-id stability question (the lens's most decision-relevant number)

### 1.1 How a seg-id is built

`tools/cnxml-extract.js:116-121`:

```js
function generateSegmentId(moduleId, type, elementId, counter) {
  if (elementId) {
    return `${moduleId}:${type}:${elementId}`;
  }
  return `${moduleId}:${type}:auto-${counter}`;
}
```

`counter` is `counters.segment`, incremented on **every** `addSegment` call
(`tools/cnxml-extract.js:463`) regardless of whether the element had an id. So an `auto-N` id
encodes the segment's **ordinal position in the module**: gaining or losing one segment anywhere
earlier shifts every later `auto-N`. `elementId` comes from the element's `id` attribute in
read-only `books/*/01-source/`, which cannot drift by project rule.

### 1.2 Static exposure — 20.9% of seg-ids are positional

*Counting unit: one `<!-- SEG:… -->` marker line in `books/*/02-for-mt/**/*-segments.en.md`.*

| book | segments | source-derived | positional (`auto-N`) |
|---|---:|---:|---:|
| `efnafraedi-2e` | 21,536 | 15,451 (71.7%) | **6,085 (28.3%)** |
| `lifraen-efnafraedi` | 7,022 | 6,833 (97.3%) | 189 (2.7%) |
| `liffraedi-2e` | 880 | 773 (87.8%) | 107 (12.2%) |
| `edlisfraedi-2e` | 827 | 793 (95.9%) | 34 (4.1%) |
| `orverufraedi` | 584 | 552 (94.5%) | 32 (5.5%) |
| `__e2e-fixture__` | 83 | 80 (96.4%) | 3 (3.6%) |
| **total** | **30,932** | **24,482 (79.1%)** | **6,450 (20.9%)** |

**Read this as a ceiling, not an expectation** — §1.3 and §1.6 show the realized figure.
 It is the set of ids that *could* renumber if the
traversal changed — which is exactly why CLAUDE.md calls the extract traversal's depth-blindness
load-bearing. It is not a prediction of loss.

### 1.3 Realized drift — 2 ids, corpus-wide

Chemistry's EN tier has already been re-extracted while its MT was not regenerated (register
§C16 records this). Comparing the id set of every `02-for-mt` EN file against its
`02-mt-output` IS counterpart:

| book | identical | id-set mismatch | EN-only ids | IS-only ids |
|---|---:|---:|---:|---:|
| `efnafraedi-2e` | 126 | 44 | 57 | 0 |
| `lifraen-efnafraedi` | 37 | 3 | 3 | 3 |
| `liffraedi-2e` | 11 | 2 | 2 | 0 |
| `orverufraedi` | 9 | 3 | 9 | 0 |
| `edlisfraedi-2e` | 6 | 4 | 4 | 0 |
| `__e2e-fixture__` | 2 | 0 | — | — |

Classifying every differing id by kind: **`source`-derived = 76, `auto-N` = 2.**

The differences are overwhelmingly ids the *newer* extraction **gained** (`m68783:problem:…`,
`m68733:glossary-term:…`) — extraction improvements capturing more elements — not renumbering.
The 6,450-id positional exposure has produced 2 actual drifts.

### 1.4 The decisive test — a real re-extraction is id-stable

I re-extracted the single most valuable module and diffed:

```
node tools/cnxml-extract.js --book efnafraedi-2e --chapter 3 --module m68700 --output-dir /tmp/reex
git diff -U0 books/efnafraedi-2e/02-for-mt/ch03/m68700-segments.en.md | grep -cE '^[+-]<!-- SEG:'
→ 0
```

**282 segments, 0 seg-id changes.** The only content changes were **marker modernisation**:

- `{{term}}formula mass{{/term}}` → `[[term:formula mass|term-00001]]`
- `{{fn}}…{{/fn}}` → `[[fn:…|fs-idp50539888]]`

(4 changed lines; `m68700-structure.json` was byte-identical; the manifest changed only its
`extractedAt` timestamp.) **The tree was restored with `git checkout --` immediately; `git
status` is clean.**

### 1.5 Bonus: the `[[term:…|id]]` anchor is source-derived, and the register does not say so

`tools/cnxml-extract.js:339` emits `[[term:${termText}|${parsedAttrs.id}]]` — the id is the
source element's own attribute. Verified: `grep -o 'id="term-0000[1-4]"'
books/efnafraedi-2e/01-source/ch03/m68700.cnxml` returns all four. So `term-00001` is **not** an
extraction-time counter; it lives in read-only `01-source/`.

**This matters for §C16(a).** Its stated resolution is to move the editor's term marker from the
ambiguous `__text__` to id-anchored `[[term:text|id]]`. That anchor is stable across
re-extraction. Had it been a positional counter, the fix direction would have rested on a key
that renumbers — it does not. Recording it here because the register does not, and the
asymmetry with footnotes (also source-derived: `fs-idp50539888`) is easy to assume the wrong way.

### 1.6 Verdict on the lens's question

> Does re-extracting everything renumber seg-ids and break the corpus join?

**No, on the current evidence — and the strongest evidence is a 44-module natural experiment
already in the tree, not my single-module test.**

Chemistry has 44 modules where the EN tier was re-extracted and the MT was not: 57 EN-only ids
and **0 IS-only ids**. That asymmetry is the proof. If a re-extraction had gained a segment ahead
of an `auto-N` id, the old number and the new number would *both* appear in the symmetric
difference — one EN-only, one IS-only. IS-only = 0 means that in 44 modules which demonstrably
gained segments, **not one `auto-N` id shifted**. The renumbering mechanism fired 44 times and
produced no drift.

The join key is 79.1% source-derived by construction, and
re-extraction of the highest-value module was exactly id-stable. **The one thing that would
change this answer is a change to the extraction traversal**, which CLAUDE.md already bans and
which `tools/verify-reextract-equivalence.js` exists to detect (`compareModule` fails on
`'segment-id-set changed'` before it compares any text).

**Recommended cheap insurance, not a blocker:** run
`node tools/verify-reextract-equivalence.js` across the corpus as step 0 of the re-extraction,
and treat a non-empty `segment-id-set changed` list as a stop. It is already written and
already validated ("Verified 2026-07-07 over all 149 modules").

---

## 2. What actually breaks — the human-verified tiers, and the TM's silent staleness

### 2.1 The human-verified corpus is 5 files

`git ls-files 'books/*/03-faithful-translation/*'` → **5**. Only `__e2e-fixture__` is gitignored
(`.gitignore:116`); every real book's `03-faithful-translation/` is staged by the 2h cron
(`scripts/git-backup.sh` `PATHSPECS`). So the tracked set *is* the whole set.

| file | segments | positional ids |
|---|---:|---:|
| `books/efnafraedi-2e/03-faithful-translation/ch03/m68700-segments.is.md` | 282 | 26 |
| `books/efnafraedi-2e/03-faithful-translation/ch01/m68664-segments.is.md` | 72 | 2 |
| `books/efnafraedi-2e/03-faithful-translation/ch01/m68663-segments.is.md` | 11 | 1 |
| `books/efnafraedi-2e/03-faithful-translation/ch03/m68699-segments.is.md` | 3 | 1 |
| **total (real books)** | **368** | **30 (8.2%)** |

This corroborates §C16's "4 modules / 62 applied segments" from an independent direction:
`export-corpus --dry-run` reports `postEdited: true=64`.

### 2.2 The committed TMX is 3 translation units

```
grep -c '<tu[ >]' books/efnafraedi-2e/tm/efnafraedi-2e-2026-06-13.tmx   → 3
node tools/generate-tm.js --book efnafraedi-2e --dry-run --verbose      → 360 TUs
```

The only committed TM in the repo covers **m68699 only** (first TU's
`<prop type="segment-id">m68699:title:auto-1</prop>`). Regenerating today would produce **360**.
Corroborated by size: `wc -c` → **3,686 bytes**, against the 201,995 bytes the dry-run predicts
for 360 TUs. The file is what its name implies; it is simply nine months of editorial work behind.

**This is register C3 measured, and it is worse than the register states.** C3 records that
`books/*/tm/` is missing from `git-backup.sh`'s `PATHSPECS` (verified: it is not there, while
`books/*/glossary/` was added by C14 at `scripts/git-backup.sh:153`). The consequence is not
"the TMX is a bit behind" — it is **3 TUs where 360 exist**, and has been since 2026-06-13.

### 2.3 The post-break failure chain (assembled from four verified facts)

1. The clean break discards all faithful files but the two ch03 modules → TM input drops to
   ~285 segments, then to ~0 until editors re-review against the new MT.
2. `generate-tm.js`'s core "**writes only when there are TUs — an empty TM is never written**"
   (header comment, `tools/generate-tm.js:57-60`). A zero-pair run therefore leaves the old file
   in place.
3. `tmService.regenerateTm` (`server/services/tmService.js:52-68`) **never throws**: exit ≠ 0
   → `log.warn`, spawn failure → `log.error`, return `null`. Fire-and-forget, debounced,
   `unref`'d. Nothing surfaces it.
4. `server/routes/status.js:1332` marks `tmCreated` complete when **any** file matching
   `^efnafraedi-2e-.*\.tmx$` exists in `tm/`.

**Net:** after the break, a stale 3-TU TMX from June continues to satisfy the `tmCreated` status
check while the real TM is empty, and no alarm anywhere fires. Add that `books/*/tm/` is not in
the backup pathspecs, and every replacement TU is born on prod's gitignored disk with **no
off-box copy** — the same exposure the register's A2 item describes for `sessions.db`.

**Recommendation:** add `'books/*/tm/'` to `PATHSPECS` **before** the clean break, not after. It
closes C3 and converts the post-break TM from "silently absent" to "visibly empty in git".

**⚠️ It is not a one-line change, and the register's C3 wording implies it is.**
`tools/lib/tm-export.cjs:467-470` `defaultOutPath` is **date-stamped**:

```js
const date = new Date().toISOString().slice(0, 10);
return path.join(BOOKS_DIR, book, 'tm', `${book}-${date}.${EXT[format]}`);
```

Regenerations therefore **accumulate** files rather than overwrite one — and
`status.js:1332`'s `^efnafraedi-2e-.*\.tmx$` matches any of them. Since `tmService` regenerates
on every debounced save, adding the pathspec as-is commits a new ~200 KB TMX **per book per day
of editorial activity**. The pathspec needs either a fixed-name output for the cron-driven regen
or a prune step alongside it. **S→M**, and the decision (keep dated snapshots vs. one current
file) is a design call, not a defect fix.

### 2.4 The corpus gets *better*, not worse

`node tools/export-corpus.js --book efnafraedi-2e --dry-run`:

```
Modules: 170 · Rows: 21251
Tiers present: mt=21251 faithful=360 localized=0
postEdited: true=64 false=296
duplicate seg-ids (first-wins): 578
files skipped (see manifest): 3255
```

The committed manifest (`books/efnafraedi-2e/corpus/efnafraedi-2e.corpus-manifest.json`, v1.0,
2026-07-19) carries this note:

> "EN tier is the current extraction; for modules MT'd before a re-extraction the exact bytes
> sent to MT may differ (dialect drift, e.g. m68664)"

**A full re-extract + re-MT deletes that caveat.** The corpus's own recorded weakness is
precisely the EN/MT dialect skew the lead's plan removes. The corpus is regenerable by one
command and is gitignored (`.gitignore:130`) — nothing to migrate.

The 3,255 "skipped" files are `*-segments.en.md.backup.<timestamp>` artifacts of previous
re-extractions, correctly excluded. Their existence is also evidence that mass re-extraction has
been done here before at scale.

---

## 3. Glossary — the CLAUDE.md durable rule, claim by claim

| Claim | Verdict | Evidence |
|---|---|---|
| Two producers | **TRUE** | `tools/merge-glossary.js` and `server/scripts/export-terminology.js` both write `books/<book>/glossary/glossary-unified.json` (`merge-glossary.js:418`, `export-terminology.js:250`) |
| `merge-glossary.js` has 3 sources, Íðorðabankinn not among them | **TRUE** | header `merge-glossary.js:5-8`: Chemistry Society CSV · OpenStax CNXML glossary · curated CSV |
| Its `--db` upsert targets a dropped table | **TRUE** | `merge-glossary.js:529/533/539` hit `terminology_terms`; `server/migrations/032-terminology-redesign.js:24` = `DROP TABLE IF EXISTS terminology_terms;`. Its line 597 also targets `terminology_imports`, dropped at `032:23`. `033-fix-organic-chemistry-slug.js:53` says so in a comment. The surviving producer reads `terminology_headwords` / `terminology_translations` (`terminologyService.js:143,216`). |
| The export feeds the RENDER path | **TRUE** | `math-label-substitute.js:137` reads `<bookDir>/glossary/glossary-unified.json` → `buildGlossaryMap` (`:15`) → `cnxml-inject.js:4127` `substituteMathLabels(rawOriginalCnxml, resolveMathLabel)` and `:4186` for equations. Reader-visible. |
| Shrink guard shipped (C14) | **TRUE** | `server/lib/glossaryExportDecision.js` `shrinkVerdict`, wired at `export-terminology.js:298`; `--force` at `:47`; health check `checks.glossary_export`; `git-backup.sh:140` runs it under `timeout 120`. |

**Additional consumers, per register §C14 follow-up 4 — verified:** `tools/api-translate.js:633`
(MT priming) and `tools/translate-chapter-titles.js:104`.

### 3.1 The clean break gives the [LEAD] glossary dry-run an *ordering constraint*

The register already queues "run `export-terminology.js --dry-run` on prod and read the real
approved-term counts before deciding `--force`" as [LEAD] item ②. What the clean break adds:

Because glossary content becomes reader-visible **at inject/render time**
(`cnxml-inject.js:4127`), and the break re-renders **everything from empty**, the glossary state
at re-render time is baked into every published page at once. The committed chemistry glossary
holds 617 approved terms written by a producer whose DB table no longer exists. If prod's DB
holds fewer, the shrink guard fires; if someone `--force`s past it *and then* re-renders, the new
pages silently lose math-label substitutions that today's pages have.

**So: dry-run the glossary BEFORE the re-render, not after.** That is a sequencing note for the
runbook, not new work.

### 3.2 One small defect found in passing

`tools/merge-glossary.js:24` — `const BOOKS_DIR = 'books';`, used at `:142`, `:418`, `:441`. A
**cwd-relative** resource path, which CLAUDE.md's durable rule bans (`import.meta.url`, never
`process.cwd()`). Run from anywhere but the repo root it writes to the wrong tree or fails. Not
triggered today because it is a root-run CLI, but it is the exact shape that shipped three times
in `tools/lib` (#213). **S** to fix; unrelated to the refactor, log it rather than bundle it.

---

## 4. TM — the durable rules, claim by claim

| Claim | Verdict | Evidence |
|---|---|---|
| A missing per-book licence row is a LOUD 500 on the route | **TRUE** | `tools/lib/book-licences.cjs` `getBookLicence` **throws**; `server/routes/tm.js:53` calls `generateTm` with no catch of that class |
| …but a SILENT stale TM on the regen path | **TRUE** | `tmService.regenerateTm` warn-only (§2.3 above); callers are `segmentEditorService.js:1155` and `contentVersionService.js:304`, both fire-and-forget |
| `tmCreated` reported-but-not-sequenced | **TRUE** | listed in `NON_SEQUENTIAL_STAGES`; detected by mere file presence at `status.js:1332`; `bookRegistration.js:1266` maps the stage to `dir: 'tm', pattern: '.tmx'` |

**Licence rows are complete for every real book** — so this is not a blocker for the refactor:

| book | licence |
|---|---|
| `efnafraedi-2e` | CC BY 4.0 (2026-01-19) |
| `liffraedi-2e` | CC BY 4.0 (2026-03-11) |
| `orverufraedi` | CC BY 4.0 (2026-03-09) |
| `edlisfraedi-2e` | CC BY-NC-SA 4.0 (2026-03-23) |
| `lifraen-efnafraedi` | CC BY-NC-SA 4.0 (2026-03-23) |
| `__e2e-fixture__` | CC BY 4.0 |
| `stjornufraedi`, `testbook` | **none — correct**, they have no `02-for-mt` and are expected to throw |

**Nothing to do here for the refactor.** The TM code path is shared between CLI and route
(`server/routes/tm.js:14` requires `tools/lib/tm-export.cjs` — note this is one of the MIT→AGPL
edge files the root `LICENSE` enumeration covers, in the *server-requires-tools* direction).

---

## 5. Do these three depend on the legacy markers Lens A wants deleted?

**Yes, but only in `stripMarkers`, and the dependency is one-directional and safe.**

`tools/lib/tm-export.cjs:114-140` `stripMarkers` handles, in one function:

- current bracket forms `[[i:]] [[b:]] [[sub:]] [[sup:]] [[link:]] [[xref:]] [[docref:]] [[term:…|id]] [[fn:…]] [[em:…|class]] [[u:]]`
- legacy paired `{{x}}…{{/x}}` (`:127`)
- legacy `++t++` (`:125`)
- and **deliberately leaves** single-char `*…*`, `~…~`, `^…^`, `__…__` alone, with the reason
  stated at `:107-109`: "they collide with literal math/chemistry text and are ambiguous".

`tools/export-corpus.js:50-55` `corpusCleanText` wraps it and additionally drops the legacy
`[#id]` xref dialect and decodes `[[lb:]]`/`[[rb:]]`, with an ordering comment explaining why the
`[#id]` strip must precede the bracket decode.

**Consequences for the lead's plan:**

1. **Deleting `{{…}}` parsing from `stripMarkers` is NOT safe on the register's own numbers.**
   §C16 measured `{{term}}`/`{{fn}}` live in **28 EN + 28 IS files across the four books the
   chemistry migration does not touch**. If the lead's target really is *all* content re-extracted
   and re-MT'd, that retires it — but only *after* all five books are done, not after chemistry.
2. **Failure mode if removed early is cosmetic, not corrupting**: the TM/corpus text would carry
   literal `{{term}}` delimiters. No wrong join, no lost row. Contrast with `cnxml-inject.js`'s
   `hasApiMarkers` (§C16(a)), where the same class of removal is reader-visible.
3. **The exports are *not* affected by C16(a) at all.** `hasApiMarkers` lives on the inject path;
   the TM and corpus read the `02-*` / `03-*` markdown tiers directly and never consult it.
4. **`export-corpus`'s note "single-char legacy markers retained" survives the refactor**, and it
   should: per §C16's 2026-07-30 correction, the markdown family is the editor's **current**
   toolbar vocabulary, not residue. If the editor-facing tag redesign lands, that note becomes
   stale and `corpusCleanText` gains a case — a small, well-pinned change
   (`tools/__tests__/export-corpus.test.js`, `tools/__tests__/tm-export.test.js`).

---

## 6. Blockers and traps found, with sizes

### 6.1 🔴 `--output-dir` is documented, parsed, and never used

`tools/cnxml-extract.js` documents `--output-dir <dir>` at `:23` and `:89` and registers the
option at `:68`:

```js
{ name: 'outputDir', flags: ['--output-dir'], type: 'string', default: null },
```

`grep -n "outputDir" tools/cnxml-extract.js` returns **only that one line**. The value is never
read.

**I hit this live.** Running the §1.4 experiment with `--output-dir /tmp/reex` wrote into
`books/efnafraedi-2e/02-for-mt/ch03/` and `books/efnafraedi-2e/02-structure/ch03/` — `/tmp/reex`
stayed empty. (Restored with `git checkout --`; tree verified clean.)

**Why this blocks the lead's plan specifically:** the natural rehearsal for a mass re-extraction
is "extract to a scratch directory and diff before committing". That rehearsal **silently
overwrites the EN tier of the corpus** instead. It must be either implemented or removed from
`--help` **before** the re-extraction runbook is executed. **S.** Belongs in the runbook's
prerequisites.

### 6.2 🟠 Extraction emits the same seg-id twice, and first-wins silently drops the second

`export-corpus` reports `duplicate seg-ids (first-wins): 578` for chemistry
(`tools/export-corpus.js:165`, `stats.duplicateIds += records.length - map.size`). The same
first-wins collapse is used by the TM ("join-consistent with the TM", `:159`).

I re-derived it with an independent parser over `books/efnafraedi-2e/02-for-mt/**` and found
**285 collapsed occurrences: 214 with identical text, 71 with DIFFERENT text.** The differing
ones vary only in their `[[MATH:N]]` placeholder index, e.g. in
`ch11/m68783-segments.en.md`, id `m68783:para:fs-idm9532784`:

```
7.14 [[MATH:3]] 10[[sup:−3]]; 0.399 [[i:m]]
7.14 [[MATH:4]] 10[[sup:−3]]; 0.399 [[i:m]]
```

**The cause is the extraction traversal, not the source data.** I checked:

```
grep -c 'fs-idm9532784' books/efnafraedi-2e/01-source/ch11/m68783.cnxml   → 1
```

The id occurs **once** in the read-only source. So `cnxml-extract.js` **visits the same element
twice**, and the `[[MATH:N]]` counter has advanced between the two visits — which is exactly why
the only difference between the two texts is the placeholder index. This is the depth-blindness
CLAUDE.md calls load-bearing, observed producing a duplicate emission.

Downstream, `parseSegmentsMap`'s first-wins collapse silently drops the second emission from
both the TM and the corpus. Whether that loses anything depends on which `[[MATH:N]]` index the
injected/rendered output resolves against.

**⚠️ My 285 and the tool's 578 disagree, and I did not resolve it** — different counting units
(my parser vs `parseSegmentRecords`, possibly a different file set). I report both rather than
pick one. **Re-extraction will not fix this**: it is the same code over the same read-only
source. → **UNKNOWN**, see §8.

**⚠️ Do NOT "fix" this by changing the traversal.** CLAUDE.md's durable rule and
`verify-reextract-equivalence.js` both exist because a traversal change renumbers frozen
`auto-N` ids — the join key. Whatever the right fix is, it is a deduplication at emission, not a
re-walk.

### 6.3 🟡 `books/*/tm/` is not backed up (register C3) — raise its priority

Covered in §2.3. **S**, and it should land **before** the break, not after.

### 6.4 🟡 `merge-glossary.js` cwd-relative books root

Covered in §3.2. **S**, unrelated to the refactor.

---

## 7. Sizing — Lens D only

| Work | Size | Justification |
|---|---|---|
| Corpus survives the refactor | **S** | Regenerable by one command; gitignored (`.gitignore:130`); the manifest's only recorded weakness is the EN/MT dialect skew the re-MT removes. Nothing to migrate. |
| TM code survives the refactor | **S** | Shared CLI/route path (`tools/lib/tm-export.cjs`); licence rows present for all 6 real books; `stjornufraedi`/`testbook` correctly throw. **Zero code change required.** |
| Add `books/*/tm/` to backup pathspecs (C3) | **S** | One `PATHSPECS` entry + one `scripts/__tests__/git-backup.test.mjs` case. |
| Fix or delete `--output-dir` | **S** | One option already parsed; wire it through or drop three doc lines. Must precede the re-extraction rehearsal. |
| Glossary: prod dry-run → per-book `--force` decision → re-render | **M** | Code shipped (C14). The work is a [LEAD] judgement over real counts plus a sequencing constraint (§3.1). Not code. |
| `stripMarkers` legacy `{{…}}` removal | **S**, but **blocked** | Safe only after **all five** books are re-extracted, not after chemistry. Failure mode if done early is cosmetic. |
| Duplicate-seg-id collapse | **UNKNOWN** | Cannot size until §8's measurement runs. |

**Nothing in Lens D is L or XL.** The honest answer to "achievable in a reasonable timeframe" for
*this lens* is **yes** — the exports are the cheapest part of the target. The expense is
elsewhere: (i) the editorial re-review that rebuilds `03-faithful-translation` from 0 back to
something worth exporting, and (ii) C16(a), which the register has already demonstrated the
re-MT does not fix.

---

## 8. Unknowns — what I could not settle, and the measurement that would

1. **The 578-vs-285 duplicate-seg-id discrepancy, and whether the 71 differing collapses matter.**
   The *cause* is settled (§6.2 — a double-visit in extraction, not duplicate source ids); the
   *blast radius* is not.
   *Measurement:* `node tools/export-corpus.js --book efnafraedi-2e --dry-run --verbose` and diff
   its skipped/duplicate accounting against a `parseSegmentRecords`-based dump; then check
   whether the dropped `[[MATH:N]]` indices are ever referenced from
   `02-structure/*-structure.json` and which index the injected output resolves against.
   If the second emission's index is the live one, this is a reader-visible fidelity gap, not a
   reporting artifact.

2. **Whether prod's `books/*/03-faithful-translation/` matches git.** All my faithful-tier numbers
   come from the tracked tree. The cron stages that directory, so they *should* agree — but a
   failed push would look exactly like agreement from here.
   *Measurement:* on prod, `git status --short books/*/03-faithful-translation/` and
   `cat pipeline-output/.last-content-backup`. This is the same class as the register's open
   `segment_edits` scope question and can be answered in the same session.

3. **Whether a whole-corpus re-extraction is as id-stable as `m68700` was.** I tested one module
   (the highest-value one) and it was exactly stable; §1.3 shows realized drift is 2 ids. I did
   **not** test all 170+ modules.
   *Measurement:* `node tools/verify-reextract-equivalence.js` over the full corpus, treating any
   `segment-id-set changed` as a stop. Cheap, already written, already validated over 149 modules
   on 2026-07-07.

4. **Whether any *other* book's faithful tier exists only on prod.** Books other than chemistry
   show `faithful_md=0` on disk. That is consistent with "no review has happened yet", but I
   cannot distinguish it from "reviews happened and never reached git" without prod access. Same
   measurement as (2).

5. **Whether `merge-glossary.js` should be retired outright.** Its DB path is broken (§3) and
   `export-terminology.js` supersedes it — but it is the producer of every committed
   `glossary-unified.json`, and its three file-based sources have no equivalent in the DB path.
   *Measurement:* diff `export-terminology.js --dry-run` output against the committed
   `books/efnafraedi-2e/glossary/glossary-unified.json` term-by-term. That single diff decides
   whether the file producer can be deleted or must be kept as a seeding step.
