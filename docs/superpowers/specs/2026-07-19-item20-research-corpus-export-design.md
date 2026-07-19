# Item 20 — Aligned research-corpus export (design)

**Date:** 2026-07-19
**Campaign item:** 20 (`docs/plans/2026-07-11-pre-semester-coding-campaign.md:182`)
**Origin:** audit finding New-#2, remediation step 5 (`docs/audit/2026-07-11-product-provenance-durability-audit.md:94,133`)
**Deliverable:** one PR — a pure-file CLI `tools/export-corpus.js` emitting a per-book aligned
{EN, MT, faithful, localized} segment corpus in JSONL + TSV, plus a manifest.
**Consumer:** the lead's MT-vs-post-edited (MTPE) research study; EN↔MT parallel data is a
research asset in its own right.

## 1. Context and requirement

The audit requires "an export that emits, per segment, {EN, MT-original, faithful, localized}
aligned — the actual object your study needs". Today the only aligned export is the EN↔faithful
TMX (`tools/generate-tm.js`), which deliberately never emits MT. The corpus is fully
reconstructible from git — all four tiers are tracked files — so the tool, not the artifact, is
the durable deliverable.

Data state at design time (2026-07-19): 187 extracted modules across 5 active books, 100% MT
coverage; faithful = 4 modules (all efnafraedi-2e: ch01/m68663, ch01/m68664, ch03/m68699,
ch03/m68700 — exactly matching the 4 Track-C `.locked` markers); localized = 0 files;
lifraen-efnafraedi additionally has 31 per-chapter `exercises-segments` sidecars (item 9).
The corpus ships mostly machinery now; data grows into it without format changes.

## 2. Scoping decisions (lead, 2026-07-19)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Item 20/21 boundary | **Corpus artifact only.** generate-tm, server routes, Árnastofnun untouched — item 21 keeps the TM `--format` flag / export route / added-terms path. The corpus's CSV-family output satisfies the audit's "aligned pairs in other formats" note. |
| 2 | Licence posture | **All books, per-book licence stamped** from a provenance-doc-sourced map (chem/bio/micro CC BY 4.0; physics/organic CC BY-NC-SA 4.0). Item 17's book-config field replaces the map later; the map lib is the single swap point. |
| 3 | Text form | **Raw + clean per tier.** Raw = byte-honest on-disk text (marker damage is MTPE evidence); clean = stripped text so consumers never reimplement two marker dialects. |
| 4 | Coverage | **All segments, tier-flagged.** Every extracted EN segment is a row; absent tiers are `null`; derived `postEdited` flag (§6). The MTPE subset is a downstream filter. |
| 5 | Serialization | **Canonical JSONL + derived TSV** (clean text only). TMX cannot hold three `is`-language tiers; ParIce/DivEMT/CLARIN-IS precedent supports JSONL/TSV. src/mt/pe triples: YAGNI until a venue asks. |
| 6 | Output home | **On-demand, not committed.** `books/{book}/corpus/` gitignored. Regeneration is one command from any clone. |

Architecture (lead, same session): **new standalone `tools/export-corpus.js`** — not a
generate-tm mode (different discovery direction, pairing arity, container), not a server script
(DB is prod-only; its "original" text is normalized and client-supplied — the disk pair is the
byte-honest record).

## 3. Tool shape

ESM CLI following the generate-tm template:

```
node tools/export-corpus.js --book <book> [--chapter <N|appendices>] [--out <dir>] [--dry-run] [--verbose]
```

- `parseArgs` + `BOOK_OPTION` + `CHAPTER_OPTION` + `requireBook` from `tools/lib/parseArgs.js`;
  `--out`/`--dry-run` defined locally (generate-tm precedent).
- `BOOKS_DIR` resolved via `import.meta.url` (never cwd — #213 rule); `_setTestBooksDir` seam.
- Output (stable names — regeneration overwrites; no date-stamp accumulation):
  - `books/{book}/corpus/{book}.corpus.jsonl`
  - `books/{book}/corpus/{book}.corpus.tsv`
  - `books/{book}/corpus/{book}.corpus-manifest.json`
- `.gitignore` gains `books/*/corpus/`.

## 4. Discovery and alignment

**EN-driven** (generate-tm stays faithful-driven; the corpus must include unreviewed modules):

1. List chapter dirs under `books/{book}/02-for-mt/`: `ch\d+` (numeric ascending) then
   `appendices` last. `--chapter` filters using CHAPTER_OPTION semantics.
2. In each dir, accept basenames matching exactly
   `^(m\d+|exercises|chapter-metadata)-segments\.en\.md$`, sorted lexicographically.
   Everything else (`.backup.*`, `(b)/(c)/(d)` variants, the 30 stray `.is.md` in efnafraedi's
   `02-for-mt`, `-links.json`) goes to the manifest skip report — counted, never silent.
   A `chapter-metadata` or `exercises` file that parses to zero SEG markers is likewise
   skip-reported, not fatal.
3. For each EN file, probe the same basename with `.is.md` suffix in `02-mt-output/`,
   `03-faithful-translation/`, `04-localized-content/` (all four layers share the naming —
   `server/services/segmentParser.js:140-158`).
4. Parse every present file with the shared `parseSegmentsMap`
   (`tools/lib/seg-markers.cjs`; first-wins on duplicate ids — join-consistent with the TM;
   duplicates counted). Join on the frozen seg-id, iterating EN-side segments in file order.
5. IS-side seg-ids absent from EN → `orphanIs` count + warning; no row (EN-driven).

Row order is fully deterministic (chapter → file → EN segment order) and JSON field order is
fixed, so successive exports diff cleanly.

## 5. Row schema

JSONL — one object per EN segment:

```json
{"id": "m68664:para:fs-idm183676832",
 "book": "efnafraedi-2e", "chapter": "1", "module": "m68664",
 "type": "para", "elementId": "fs-idm183676832",
 "licence": "CC BY 4.0",
 "en":        {"raw": "…", "clean": "…"},
 "mt":        {"raw": "…", "clean": "…"},
 "faithful":  {"raw": "…", "clean": "…"},
 "localized": null,
 "postEdited": true}
```

- `chapter` uses generate-tm's `chapterLabel` convention so corpus↔TMX joins line up.
- `module` is the filename basename stem (`m68664`, `exercises`, `chapter-metadata`); for
  exercise sidecars the per-exercise nickname lives in `id` (same as the TM's granularity).
- `licence` rides every row — corpora get concatenated downstream; per-row stamping prevents
  mislabeling after a merge.
- Absent tier → `null`. `postEdited` → `null` unless **both** `mt` and `faithful` are present
  (human-authored modules, e.g. the m68662 preface, have faithful without MT).

TSV (derived from the same rows, header included):

```
id  book  chapter  module  type  licence  en_clean  mt_clean  faithful_clean  localized_clean  postEdited
```

Empty string for absent tiers; `postEdited` = `true`/`false`/empty. Any tab or newline
remaining in a clean field is replaced by a space (WMT convention).

## 6. The `postEdited` flag

Byte-comparing faithful vs raw MT is dishonest: apply rebuilds the faithful file from the
**normalized** editor view, so untouched segments still differ from raw MT bytes. The honest,
deterministic definition reproduces the editor's own equality semantics
(`loadModuleForEditing`, `server/services/segmentParser.js:164-239`):

```
view(text) = normalizeTermMarkers(en_wrapNormalized,
               unescapeMtMarkers(normalizeWraps(text)))
postEdited = trim(view(faithful_raw)) !== trim(view(mt_raw))
```

where `en_wrapNormalized = normalizeWraps(en_raw)` — the same EN feeds both sides
(`normalizeTermMarkers` is two-argument and EN-aware; for bracket-era EN it is a deliberate
no-op, segmentParser.js:71-77). `normalizeWraps` is applied by `parseSegments` on every read
(:112); `unescapeMtMarkers` on IS content (:189); `normalizeTermMarkers` at pairing (:219).
Applying the identical chain to both tiers makes the flag exactly "would the editor's diff view
show a change".

### Shared-code extraction (the one refactor in this PR)

`normalizeWraps` / `unescapeMtMarkers` / `normalizeTermMarkers` currently live in
`server/services/segmentParser.js` (:35, :53, :73; exported at :514-517). Tools must not import
from `server/` (the established dependency direction is server → `tools/lib`, per the
seg-markers unification). Therefore: extract the three functions verbatim to
`tools/lib/mt-normalize.cjs`; `segmentParser.js` deletes its local copies and re-exports the
required functions from the new lib **by reference** (`module.exports` entries are the same
function objects), pinned by a `toBe` reference-identity test (item-14 `chapterDir` pattern).
No behavior change anywhere; pure relocation.

## 7. Clean-text rules

Import generate-tm's **exported, unchanged** helpers (`tools/generate-tm.js:481-498`):
`stripMarkers`, `decodeEntities`, `cleanSegmentText`. Compose corpus-only additions on top,
inside export-corpus.js — TM and concordance output stay byte-identical:

- `[[lb:]]` → `[` and `[[rb:]]` → `]` (item-9 literal-bracket escapes, unknown to the TM's
  stripMarkers; without this rule exercise clean text carries escape artifacts).
- `[[MEDIA:n]]` kept verbatim (same policy as `[[MATH:N]]` — positional placeholder, resolvable
  via the 02-structure sidecars).
- Single-char legacy markers (`*…*`, `~…~`, `^…^`, `__…__`) stay in clean text — the TM's
  documented ambiguity rationale (generate-tm.js:101-104) applies unchanged; noted in the
  manifest so consumers aren't surprised.
- Empty-after-strip rows are **kept** with `clean: ""` (completeness; the TM's drop policy is a
  TM concern). Counted in the manifest.

## 8. Licence map

New `tools/lib/book-licences.cjs`: slug → `{licence, obtainedDate}`, transcribed from
`docs/provenance/openstax-cnxml-licence-provenance.md` §1:

| slug | licence |
|------|---------|
| efnafraedi-2e | CC BY 4.0 |
| liffraedi-2e | CC BY 4.0 |
| orverufraedi | CC BY 4.0 |
| edlisfraedi-2e | CC BY-NC-SA 4.0 |
| lifraen-efnafraedi | CC BY-NC-SA 4.0 |

**Unknown slug → exit 1** with a message naming this file — a new book enters the corpus
deliberately, licence-first. When item 17 ships the book-config licence field, this lib is the
single swap point (and can then delegate to book-config).

## 9. Manifest

`{book}.corpus-manifest.json`:

```json
{"generated": "<ISO>", "tool": "export-corpus.js", "toolVersion": "1.0",
 "book": "…", "licence": "…", "provenance": "docs/provenance/openstax-cnxml-licence-provenance.md",
 "stats": {"modulesListed": 0, "filesSkipped": 0, "rows": 0,
           "tiers": {"mt": 0, "faithful": 0, "localized": 0},
           "postEditedTrue": 0, "postEditedFalse": 0,
           "orphanIs": 0, "duplicateIds": 0, "emptyClean": 0},
 "skipped": ["…relative paths…"],
 "notes": ["single-char legacy markers retained in clean text",
           "[[MATH:N]]/[[MEDIA:n]] placeholders retained; resolve via 02-structure sidecars",
           "EN tier is the current extraction; for modules MT'd before a re-extraction the exact bytes sent to MT may differ (dialect drift, e.g. m68664)"]}
```

That last note is a **known honesty caveat**: `02-for-mt` was re-extracted for chemistry on
2026-07-07 (bracket dialect) while much of the MT predates it (legacy dialect), so `en.raw` is
the canonical current EN, not necessarily the byte-exact MT-time source. Seg-ids are frozen, so
alignment is unaffected; the caveat is documented rather than silently ignored.

## 10. Fail-loud and edge policy

| Condition | Behavior |
|-----------|----------|
| Zero rows produced | exit 1 |
| Unknown book slug in licence map | exit 1, names `book-licences.cjs` |
| EN file unparseable / zero SEG markers | skip-report entry; fatal only if it zeroes the corpus |
| IS seg-id absent from EN | warn + `orphanIs` count |
| Duplicate seg-id in a file | first-wins + `duplicateIds` count (matches TM; #288 found all live dups benign) |
| EN module missing MT file | row with `mt: null` + tier count (100% MT coverage today — no silent assumption) |
| Output dir missing | `mkdirSync recursive` |
| `--dry-run` | full scan + stats printed, no writes |

## 11. Testing

`tools/__tests__/export-corpus.test.js` (Vitest, repo-root `npm test` is the gate):

- **Unit:** row construction (all tiers / missing tiers / null rules); corpus clean-text
  additions (`[[lb:]]`/`[[rb:]]` decode, `[[MEDIA:n]]` verbatim); `postEdited` — untouched
  segment whose MT normalizes to the faithful bytes ⇒ `false`, real edit ⇒ `true`, missing
  tier ⇒ `null`; licence-map fail-loud on unknown slug; TSV escaping (tab/newline in text);
  JSONL determinism (fixed field order, stable row order).
- **Reference-identity pin:** `server/services/segmentParser.js` re-exports `toBe` the
  `tools/lib/mt-normalize.cjs` functions; existing segmentParser suites keep covering behavior.
- **End-to-end fixture:** a small book fixture (generate-tm test pattern, `_setTestBooksDir`)
  with: a module present in all four tiers (one edited + one untouched segment), an MT-only
  module, an exercise sidecar with lb/rb + MEDIA markers, a skip-report trigger (backup file),
  a duplicate id, and an IS orphan — asserting rows, flags, manifest stats, and the TSV.

## 12. Out of scope (deliberate)

- generate-tm.js / tmService / concordanceService changes of any kind (byte-untouched).
- Server routes or UI; DB-sourced per-edit chains (a future prod-side enrichment can join
  `segment_edits`/`content_versions` on the same seg-ids).
- Árnastofnun submission shape, src/mt/pe triple files, TMX changes (item 21 / deposit-time).
- Fixing the git-backup pathspec divergence (registered, below).
- Data hygiene for the stray/variant files (registered, below).

## 13. Register queue (to campaign doc on ship)

- **I20-R1 `[doc/impl]`** — `scripts/git-backup.sh` PATHSPECS stages neither `books/*/tm/` nor
  `books/*/glossary/`, but `docs/technical/architecture.md:431-433` claims both ride the cron;
  glossary-unified.json and TMX reach git only via manual commits.
- **I20-R2 `[data]`** — `books/lifraen-efnafraedi/glossary/glossary-unified.json` is
  byte-size-identical (445,395 B) to chemistry's — likely a stale copy, needs a check before
  organic MT-priming relies on it.
- **I20-R3 `[hygiene]`** — efnafraedi `02-for-mt` contains 30 stray `.is.md` files and 49
  `(b)/(c)/(d)` EN variants; ch05 `02-mt-output` has 7 variant `.is.md` (m68724/m68726/m68727)
  with no recorded authoritative-variant decision.
- **I20-R4 `[minor]`** — generate-tm's date-stamped default out path accumulates one TMX per
  regeneration day in `books/{book}/tm/` with no pruning/latest pointer.
- **I20-R5 `[note]`** — M-e (TM exercise pairing) remains open for the TM proper; the corpus
  includes exercise sidecars regardless, with the lb/rb decode the TM lacks.
