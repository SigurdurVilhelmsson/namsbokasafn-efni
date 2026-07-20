# Item 20b PR2 — corpus `reviewStatus` + TSV single-sourcing (design addendum)

**Status:** addendum to §9 of `2026-07-19-mt-acceptance-design.md` (lead-approved `129bc2a7`).
§9 remains authoritative for *what* PR2 delivers. This file records only the decisions §9
leaves open, and the verified facts that force them. Nothing here restates §9.

**Scope:** `tools/export-corpus.js` + its test file. Tools-only — no server code, no data
operation, no re-render, no deploy coupling.

---

## 1. Verified facts that constrain the design

Established by a 4-lens scout over the repo (2026-07-20), primary evidence only:

| # | Fact | Evidence |
|---|------|----------|
| F1 | Sidecar path = the faithful path with `-segments.is.md` → `-review-status.json`, in the same chapter dir. `chapterDir(-1)` → `'appendices'`, `chapterDir(3)` → `'ch03'` — **identical** to `listEnChapterDirs`' output. A path built from export-corpus's own `dir` + `moduleName` loop variables lands on the identical file. | `acceptanceService.js:338-341`, `server/lib/chapterLabel.js:38-40`, `export-corpus.js:140-155` |
| F2 | The sidecar's self-declared `chapter` is the **canonical integer as a string** — appendices is `"-1"`. The corpus row's `chapter` is `chapterLabel(dir)` → `"appendices"`. The two dialects disagree on exactly one chapter. | `acceptanceService.js:410`, `generate-tm.js:229-232` |
| F3 | Sidecar keys come from the faithful **file** (`parseSegments`, all occurrences → object). Corpus keys come from `parseSegmentsMap` (first-wins). Winners differ on duplicate ids; the **distinct id set is identical**. The lookup needs only the key set. | `acceptanceService.js:359-363,387`, `export-corpus.js:161-166` |
| F4 | Every file segment gets an entry — the `else` branch assigns `carryover` unconditionally. No DB-only id is ever added. So at generation time the map is exactly the file's distinct id set. | `acceptanceService.js:386-405` |
| F5 | Only three paths regenerate the sidecar: apply, faithful-track restore, acceptance-revoke. **`acceptSegment` does not**, nor do `supersedeForEdit`'s call sites. DB state can therefore desync the sidecar with no file write at all. | `segmentEditorService.js:1094-1098,134,171`, `contentVersionService.js:319`, `routes/segment-editor.js:586`, `propagationService.js:135` |
| F6 | The sidecar contains **no content-derived value** — no hash, no length, no text. Only the key set is content-derived. The byte-anchor (`accepted_content`) lives in the DB and never reaches disk. | `acceptanceService.js:407-415`, `migrations/043-segment-acceptances.js:26` |
| F7 | mtime is **not** a usable staleness oracle, measured: `ch03/m68699` and `ch03/m68700` share an mtime identical to the nanosecond while their bytes were committed 4 days apart. Every tracked file's mtime is later than the commit that last changed it. A fresh clone false-positives unconditionally. | scout measurement, `scripts/git-backup.sh:75-91` |
| F8 | **Zero sidecars exist for any real book.** The only `-review-status.json` on disk is the gitignored e2e fixture. | `find books -name '*-review-status.json'`, `.gitignore:107` |
| F9 | The current TSV header test is **self-referential** (`lines[0] === TSV_COLUMNS.join('\t')`) — reordering or renaming columns cannot fail it. Only `id\tbook\t` is byte-pinned, and 8 of 11 column values are unasserted. | `export-corpus.test.js:412-422,371` |
| F10 | TSV column name ≠ row key for 5 of 11 columns (4 dereference `.clean` off a nullable tier object; `en`→`en_clean` etc.), and `elementId` is JSONL-only. An accessor table must map **name → getter**, not name → row key. | `export-corpus.js:104-117,276-322` |
| F11 | Row key order is pinned twice (`buildRow` 12 keys, `toJsonl` 12 keys); `manifest.notes` is pinned byte-exact by a full-array `toEqual`. Both must be updated in lockstep. | `export-corpus.test.js:126-139,395-408,440-445` |
| F12 | No runtime consumer of the corpus exists anywhere in the repo; `books/*/corpus/` is gitignored. The only consumer is the lead's MTPE study. | `.gitignore:120-121`, repo-wide grep |

---

## 2. Decisions

### D1 — Locate by path, read from disk, once per module
The sidecar is read in the existing tier-map loop, from the path derived per F1. Never from
`sessions.db`: the DB is gitignored and production-only, so disk-derivability is the sidecar's
entire reason to exist.

### D2 — Validate `module`, never `chapter`
Cross-check the sidecar's `module` field against the module being exported (cheap integrity
check; catches a misplaced or mis-merged file — the `merge=ours` driver on this path makes
that reachable). Do **not** cross-check `chapter`: per F2 the two sides speak different
dialects and would false-mismatch every appendices module.

### D3 — Resolution order for `reviewStatus`
Evaluated per row, first match wins:

1. `faithful` tier is null → `null`. You cannot have reviewed a translation that isn't there;
   this also stops a stale sidecar asserting `edited` on a row with no faithful text.
2. No sidecar file for the module → `null`.
3. Sidecar unreadable, not valid JSON, missing `segments`, or `module` mismatched → `null` for
   **every** row of that module, plus one warning and one counter increment. A single corrupt
   file must never abort a whole-book export (matches the existing skip-report idiom).
4. Sidecar usable but this seg-id absent from its map → `null`, plus its own counter. Per F4
   this cannot happen at generation time, so it is a **drift tripwire**: it means the faithful
   file's id set moved after the sidecar was written.
5. Otherwise → the sidecar's `status` **verbatim**.

Statuses pass through unvalidated. The per-status counter (D4) is a count of every observed
value, so a future or malformed vocabulary reports itself rather than being silently mapped.

**Only `status` is carried.** The sidecar's `by` / `at` are deliberately not exported — a
research corpus does not need per-segment reviewer identity, and §9 names only the status.

### D4 — Statistics
```
stats.reviewStatus     = { edited, accepted, carryover, null }   // per row; unexpected values create their own key
stats.sidecarsRead     // modules with a usable sidecar
stats.sidecarsMalformed// modules whose sidecar was unreadable/mismatched (D3.3)
stats.sidecarsAbsent   // modules with no sidecar file
stats.sidecarSegMissing// rows hitting D3.4 — the drift tripwire
```
`sidecarsRead + sidecarsMalformed + sidecarsAbsent === modulesListed` is an invariant a test
asserts. The three module-grain counters are printed in `main()`'s conditional two-space
idiom; the per-status line joins the always-printed padded-label block beside `postEdited`.

Splitting the null causes is the point: collapsing "no sidecar" and "sidecar says nothing
about this segment" into one number would hide drift, which is the class of thing this
codebase counts rather than swallows.

### D5 — No staleness detection; document instead
Per F6 and F7 there is no sound on-disk staleness signal — no content anchor in the sidecar,
and mtime false-positives on every clone. PR2 therefore makes no staleness claim. The honest
contract goes in manifest note 4, rewritten to say:

- `reviewStatus` reflects DB state **as of that module's last apply, faithful-restore, or
  acceptance-revoke** — not live DB state, and not necessarily the current file bytes;
- `null` means **unknown**, never "unreviewed" — no sidecar, no faithful tier, or a segment the
  sidecar does not mention;
- a hand-edit to `03-faithful-translation/` does not regenerate the sidecar.

The note replaces the current "per-segment review status lives only in the production DB"
sentence, which PR2 makes false.

### D6 — `TOOL_VERSION` 1.0 → 1.1
The output schema changes (row key, TSV column, note text). The corpus is regenerated on
demand rather than committed, so the version stamp is the only way to tell two generated
manifests apart.

### D7 — Append-last, both serializations
`reviewStatus` is the **last** row key (13th) and the **last** TSV column (12th). Existing key
positions are unchanged, so old and new JSONL diff cleanly against each other.

### D8 — TSV single-sourcing (folds I20-R6)
One table is the contract:

```js
const TSV_SPEC = [
  { column: 'id',     get: (r) => r.id },
  …
  { column: 'en_clean', get: (r) => (r.en ? r.en.clean : '') },
  …
  { column: 'reviewStatus', get: (r) => r.reviewStatus },
];
const TSV_COLUMNS = TSV_SPEC.map((c) => c.column);   // still exported — existing consumer/test
```
`toTsv` maps `TSV_SPEC` through the unchanged `tsvField`. Per F10 the getters are real
accessors, not key lookups.

The redundant `postEdited` ternary (`r.postEdited === null ? '' : String(r.postEdited)`)
collapses to a bare accessor — `tsvField` already maps `null`→`''`, `false`→`'false'`. This is
a behaviour-preserving simplification and the plan must **prove** it with a test covering all
three values, not assert it.

### D9 — Test obligations
- **Byte-literal header pin.** Per F9 the current assertion cannot fail on a reorder. Replace
  it with the full 12-column header as a string literal.
- **All 12 column values asserted at index** for a fixture row (I20-R6's explicit ask; 8 are
  unasserted today, so positional swaps are currently invisible).
- **Fixture sidecars**: all three statuses, a module with no sidecar, a malformed sidecar, a
  seg-missing case, a `module`-mismatched sidecar, and an appendices module (F2's dialect
  divergence must not break the lookup).
- **`faithful === null` beats a stale sidecar** (D3.1) — a discriminating test, not a
  characterization one.
- Counter invariant of D4.
- Row-key-order and `notes` pins updated in lockstep (F11).

Per F8 there is no production data to validate against; the tests are the only proof PR2
works. They are written accordingly.

---

## 3. Out of scope → register

- **MTA-R13 `[correctness — producer asymmetry]`** — `acceptSegment` does not regenerate the
  sidecar though `revokeAcceptance` does (F5), and neither do the `supersedeForEdit` call
  sites. Both directions under-claim, so the field stays fail-safe, but it is why D5's caveat
  is worded "as of the last apply". Lead decision 2026-07-20: register, do not fix here — PR2
  stays tools-only. Fix belongs with a server PR (one `regenSidecarSafe` call per site + tests).
- **I20-R10 `[stat — honesty signal]`** — the cross-tab `reviewStatus === 'carryover' &&
  postEdited === true` names the sharpest class in the corpus: *the Icelandic text diverges
  from raw MT, but nobody attested this segment*. Nearly free from counters PR2 already has.
  Lead decision 2026-07-20: register, do not build — with zero sidecars in production (F8) it
  would ship reading 0 everywhere, with no data to validate its interpretation.
- Producer-side changes of any kind; the TM/Árnastofnun export path (item 21).
