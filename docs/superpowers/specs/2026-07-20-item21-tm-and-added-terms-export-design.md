# Item 21 — TM multi-format export + Árnastofnun added-terms path (design)

**Campaign:** `docs/plans/2026-07-11-pre-semester-coding-campaign.md` item 21 (Phase 4).
**Source audit:** `docs/audit/2026-07-11-product-provenance-durability-audit.md` findings **#5** (TM
export · PARTIAL) and **#6c** (added terms submittable to Árnastofnun · NOT-MET).
**Method:** brainstorming → writing-plans → SDD, per the standing campaign workflow.

## 1. Context and requirement

Two disjoint product gaps, one campaign item:

- **#5 (PARTIAL).** `tools/generate-tm.js` emits correct TMX 1.4b and auto-regenerates on every
  apply (`tmService.scheduleTmRegen`), but it is **TMX-only** (no `--format`) and has **no
  user-facing export** (no `/api/tm*` route; the generic book `/download` excludes TM). The
  alignment work — the hard part — is already done; the `tus` records
  (`{book, chapter, module, segmentId, en, is}`) just need more serializers and an exposed route.
- **#6c (NOT-MET).** There is no way to export the terms *the project itself coined* (as opposed
  to the ones pulled *from* Íðorðabankinn) in a shape that could be handed back to Árnastofnun. The
  nearest capability, the glossary `/export`, has no source filter and no Árnastofnun-shaped output.

The two halves touch **disjoint subsystems** (TM tooling vs terminology service), so they ship as
**two PRs** (precedent: items 8, 20b). **PR-A (TM export) first** — fully unblocked, low risk.
PR-B (Árnastofnun) second. This spec covers both; the plans are separate.

## 2. Scoping decisions (lead, 2026-07-20)

1. **2 PRs, TM first.**
2. **Árnastofnun output = a manual "seed" file (CSV + JSON), not an automated API push.** There is
   no documented Íðorðabankinn *submission* API — access is a human relationship (permission-granted
   *fetch* only, per `tools/idordabanki_schema_mapping.md`). The audit's own word is "submission
   **seed**." The deliverable is a clean, well-labelled hand-off file; if Árnastofnun later specifies
   a wire format, the serializer is refined then.
3. **"Added" = project-originated only.** Include sources the team itself surfaced:
   `manual`, `mined-postedit`, `chapter-glossary`. **Exclude** third-party imports
   (`idordabankinn`, `chemistry-association`, `chemistry-society-csv`, `openstax-glossary`,
   `imported-csv`, `imported-excel`, `merge-glossary`) **and `openstax-mt`** — the latter's *English*
   headwords are OpenStax-derived even though the Icelandic is the project's; the lead prefers not to
   relay OpenStax-originated pairings onward. (See §7 register note on `chapter-glossary`.)
4. **TM export is fully user-facing:** CLI `--format` + server route + a download control.
5. **TM formats = `tmx` (default) + `csv` + `json`.** No TSV — the item-20 corpus already owns the
   TSV research format; adding it here would duplicate a house format for no new consumer.
6. **PR-B auth = HEAD_EDITOR.** Relaying terms outward is a governance act, stricter than the plain
   glossary export's `requireAuth`.
7. **TM export stamps per-book licence (added 2026-07-20 during planning, advisor Finding 2).** For
   parity with the item-20 corpus export (which already stamps via `tools/lib/book-licences.cjs`,
   fail-loud) and the audit's rank-4 ("every export … TM, glossary, corpus" carries licence). This is
   a metadata **stamp**, distinct from item 17's containment guard/footer (still out of scope, §B6).
   See §A6.

## 3. Backward-compatibility constraint (verified, load-bearing)

`server/services/tmService.js` `defaultRunner` spawns `node tools/generate-tm.js --book <book>` with
**no `--format` and no `--out`**, and expects TMX at the default path
`books/<book>/tm/<book>-<date>.tmx` (auto-regen on apply). Therefore:

- `--format` **must default to `tmx`**, and the default out-path must stay `.tmx` when the format is
  tmx. A regression test pins this (§PR-A testing), **mutation-checked** so it fails if the default
  flips.

## 4. Module-system architecture (why a `.cjs` lib)

`server/` is CommonJS; `tools/` + repo root are ESM. ESM can `import` CJS, but **CJS cannot `require`
ESM**, so any code shared across the seam must be `.cjs` — the established pattern
(`seg-markers.cjs`, `mt-lock.cjs`, `mt-normalize.cjs`, `source-manifest.cjs`, all `require`d by the
server and `import`ed by ESM tools). The CJS TM route therefore cannot `require` the ESM
`generate-tm.js`; the pairing+serialization it needs must live in a `.cjs` lib. This yields **one
code path** for the CLI and the route (no subprocess, no reimplementation) — consistent with the
project's "one real code path" rule.

---

# PR-A — TM multi-format export

## A1. Components

- **`tools/lib/tm-export.cjs`** (new, CommonJS) — the single source of truth. Exports:
  - *Pairing* (moved from `generate-tm.js`, behavior-preserving): `generateTm(book, opts)`,
    `pairModule`, `listFaithfulChapterDirs`, `cleanSegmentText`, `decodeEntities`, `stripMarkers`,
    `chapterLabel`, and a books-dir handle (`_setTestBooksDir` or a `booksDir` option — planning
    decides; both preserved for the existing tests).
  - *Serialization*: `buildTmx(tus, opts)` (moved verbatim — TMX bytes unchanged), `serializeCsv(tus)`,
    `serializeJson(tus, opts)`, and dispatcher `serializeTm(tus, format, opts)`.
  - `FORMATS = ['tmx', 'csv', 'json']` (named, exported, for CLI validation + route + tests).
- **`tools/generate-tm.js`** — becomes a thin ESM CLI over the lib. Imports the lib, keeps `main()`
  + arg parsing, and **re-exports the same names** so existing tests
  (`tools/__tests__/generate-tm.test.js`) and the `tmService` spawn are untouched.
- **`server/routes/tm.js`** (new, CommonJS) — `GET /api/tm/export`. `require`s `tm-export.cjs`.
- **UI** — a "Sækja þýðingaminni" download control (format picker → the route) on the per-book view
  **`server/views/books.html`**, beside the existing per-book download controls
  (`downloadBookMarkdown` / `downloadPublishedHtml`, which already hit `/api/books/:book/download`).
  The TM is per-book, so it belongs here — not on the terminology page.

## A2. Formats

| Format | Default? | Consumer | Shape |
|--------|----------|----------|-------|
| `tmx`  | **yes**  | CAT tools | Existing TMX 1.4b, byte-identical to today. |
| `csv`  | no | Spreadsheets / other CAT import | Header `book,chapter,module,segment_id,en,is` + one row per TU; existing csv-escape idiom. |
| `json` | no | Programmatic | `{ generated, tool, version, book, stats, units:[{book,chapter,module,segmentId,en,is}] }`. |

## A3. CLI

`node tools/generate-tm.js --book <book> [--chapter N] [--format tmx|csv|json] [--out <path>] [--dry-run]`

- `--format` default `tmx`. Unknown value → error + exit 1.
- Default out-path: `books/<book>/tm/<book>-<date>.<ext>` (`.tmx`/`.csv`/`.json`). `--out` overrides.
- Everything else (pairing stats, empty→exit 1, `--verbose`) unchanged.

## A4. Route

`GET /api/tm/export?book=<slug>&chapter=<N>&format=tmx|csv|json`

- `requireAuth` (mirrors glossary `/export`).
- Guards copied from the book `/download` route: `VALID_BOOKS` membership (400 on miss) and chapter
  validation (integer 1–MAX_CHAPTERS, or absent = whole book; 400 on bad).
- Unknown `format` → 400.
- **Regenerates on-demand** via the lib (`generateTm` → `tus` → `serializeTm`) — always current,
  format-flexible, single code path. (Perf: sync read of the book's faithful segment files per
  request; acceptable for an occasional manual export, same class of work rendering already does.)
- Success → the serialized string with `Content-Type` (`application/xml` / `text/csv` /
  `application/json`, all `; charset=utf-8`) and `Content-Disposition: attachment; filename="<book>[-K<ch>]-tm.<ext>"`.
- **No faithful content** for the book (0 TUs) → **404** with a clear message (most books have no TM
  yet; this is the common case, not an error condition).
- Lib/read error → 500 + `log.error`.

## A5. Testing (PR-A)

- **Serializer units** over fixture `tus`: TMX **byte-identical to the pre-refactor output**
  (characterization pin); CSV escaping (comma/quote/newline); JSON shape + stats.
- **Refactor safety**: `generate-tm.js`'s existing exported-function tests keep passing unchanged
  (proves the move is behavior-preserving).
- **Auto-regen regression pin (mutation-checked):** `generate-tm.js --book X` with **no `--format`**
  writes a `.tmx` file byte-identical to today — fails if the default format or default extension
  flips.
- **Route**: format dispatch (3 formats, correct Content-Type/Disposition); `requireAuth`; 400 on
  bad book/chapter/format; 404 on no-TU book. Fixtures via `_setTestBooksDir` / synthetic segment
  files — never live book data.

## A6. Licence stamping (§2.7)

Every TM export carries the per-book licence from `tools/lib/book-licences.cjs`
`getBookLicence(book)` → `{licence, obtained}` (throws on an unknown slug — fail-loud, as the
corpus export does). Placement per format: **TMX** an additive `<prop type="licence">` in
`<header>` (self-closed header preserved when absent, so `buildTmx`'s existing tests are
untouched); **CSV** a trailing `licence` column, row-stamped (same value every row, mirroring the
corpus TSV); **JSON** `licence` + `obtained` in the manifest. **The lookup lives in the callers**
(`runExport`, the route) so the serializers stay pure and take `opts.licence`/`opts.obtained` —
the route's `VALID_BOOKS` check already guarantees a licence row exists. This is *not* item 17's
containment guard or page footer (§B6); it is the same metadata-stamp the corpus already ships.

---

# PR-B — Árnastofnun added-terms seed

## PR-B Amendments (2026-07-21 — lead decisions, supersede §2.3/§B2/§B3 where noted)

Five decisions taken during PR-B planning (grounded against merged main + a source×status
read of the dev DB; recorded here so the as-built seed matches the design record). The core
insight: **the seed is a *diff against Íðorðabankinn*** — candidate rows Árnastofnun does not
already hold — not "the project's glossary."

1. **Source rule reversed to *Icelandic-origin* (supersedes §2.3's `openstax-mt` exclusion).**
   A scientific term is not copyrightable, and the same English concept appears in every
   textbook, so an *English*-origin exclusion is unfounded. The discriminator is **whose
   *Icelandic* it is** + **not already in Íðorðabankinn**. Therefore:
   `PROJECT_ORIGINATED_SOURCES = ['manual', 'mined-postedit', 'chapter-glossary', 'openstax-mt', 'openstax-glossary']`
   (all carry project-authored Icelandic — OpenStax publishes no Icelandic).
   **Excluded:** `idordabankinn`, `chemistry-association`, `chemistry-society-csv` (lead:
   *these are already in the Íðorðabankinn database* → re-submitting = duplicates) **and**
   `imported-csv`, `imported-excel`, `merge-glossary` (Icelandic origin indeterminate from the
   source tag; their `'proposed'` insert-default already keeps them out via the `status='approved'`
   gate — belt-and-suspenders). This **resolves I21-R1** (`chapter-glossary` and `openstax-mt`
   share the OpenStax-English property; the Icelandic-origin rule includes *both* consistently).

2. **`alternatives` kept + derived from *approved project-Icelandic siblings*.** It maps to
   Árnastofnun's native **`synonyms`** field (`tools/idordabanki_schema_mapping.md`), so it is not
   droppable. Derived *within* the already-filtered kept set (siblings' `icelandic`, excl. self) —
   so it automatically excludes Íðorðabankinn-sourced Icelandic. Emitted `'; '`-joined (house
   convention).

3. **Per-row submission model (new; makes each row actionable to Árnastofnun's reviewers):**
   - `submission_type` = `'new-alternative'` when the row's headword has a sibling translation
     **known to be in Íðorðabankinn** — one with `idordabanki_id IS NOT NULL` **OR**
     `source IN ('idordabankinn', 'chemistry-association', 'chemistry-society-csv')` (the lead
     confirmed those three are already in Íðorðabankinn, yet they carry a NULL id because the id
     is written only by the Íðorðabankinn *fetch* — so an id-only test would mislabel them
     `'new-translation'`). Else `'new-translation'`.
   - For `new-alternative` rows, `existing_idordabanki_term` lists those siblings' Icelandic
     (`'; '`-joined) and `existing_idordabanki_id` lists only their **non-null** ids (a
     chem-society anchor has no Íðorðabankinn id to surface — an empty id on a new-alternative is
     honest; fabricating one is not).
   - **Best-effort, stated in `provenance_note`:** a `'new-translation'` label means "no such known
     sibling in our data," not a guarantee of absence in Íðorðabankinn. `idordabanki_id IS NULL`
     is the best-available dedup signal, not a proof.

4. **CSV formula-injection guard (PR-B-local).** Unlike the internal glossary/corpus exports, this
   file is opened in Árnastofnun's spreadsheet — an external destination. A PR-B-local
   `csvSeedField` prepends a `'` to any field beginning with `= + - @` (tab/CR too) on top of the
   RFC-4180 quoting. **Do NOT** harden the shared `csvEscapeField` (would break the glossary
   export's byte-exact pins).

5. **Attribution names emitted.** `proposed_by`/`approved_by` columns carry the human name
   (`proposed_by_name`/`approved_by_name`, falling back to the id) — a provenance hand-off to a
   national authority is attribution-appropriate.

**Revised §B3 seed columns (supersede the §B3 list):**
`english, pos, definition_en, icelandic, definition_is, alternatives, subject, notes, source,
submission_type, existing_idordabanki_term, existing_idordabanki_id, proposed_by, approved_by,
approved_at`

## B1. Components

- **`terminologyService.getAddedTerms({ subjects, book })`** (new) — selects the added-terms rows
  (§B2). Returns headword+translation records shaped for the seed (§B3).
- **`PROJECT_ORIGINATED_SOURCES`** (new, exported, named constant) —
  `['manual', 'mined-postedit', 'chapter-glossary']`. Single documented source of the rights
  allowlist; **mutation-checked** in tests so the excluded sources stay excluded on purpose.
- **`GET /api/terminology/added-terms/export?format=csv|json&subject=&book=`** (new route) — gated
  `requireRole(HEAD_EDITOR)`. Mirrors the glossary `/export` serialization idiom.
- **UI** — a HEAD_EDITOR-only "Sækja viðbætt hugtök (Árnastofnun)" control in
  **`server/views/terminology.html`**, beside the existing `exportGlossary('csv')` button
  ("Flytja út CSV", ~line 926).

## B2. Filter (the rights decision, in code)

```
status = 'approved'
AND idordabanki_id IS NULL          -- not already Árnastofnun's (the trustworthy discriminator)
AND source IN PROJECT_ORIGINATED_SOURCES
[AND subject = ?]                   -- optional
[AND book scope]                    -- optional
```

`idordabanki_id IS NULL` excludes genuine Íðorðabankinn rows (that column is import-script-only,
never API-writable — the audit's reliable discriminator). The source allowlist is the *rights*
filter on top: exclude third-party imports and OpenStax-derived pairings (§2.3).

## B3. Output shape (seed)

Columns reversed out of `tools/idordabanki_schema_mapping.md` so they are recognizable to
Árnastofnun's reviewers, plus project-provenance columns for their audit:

`english, pos, definition_en, icelandic, definition_is, alternatives, subject, notes,
source, proposed_by, approved_by, approved_at`

- **CSV** — header + one row per (headword × approved project-originated translation).
- **JSON** — `{ generated, tool, version, provenance_note, stats, terms:[...] }` where
  `provenance_note` states these are the project's *added* Icelandic terms, **not** sourced from
  Íðorðabankinn, offered as a submission seed.

## B4. Error handling (PR-B)

- Empty result → a **valid header-only file** (an empty added-set is legitimate, not an error).
- Bad `format`/`subject` → 400.
- Non-HEAD_EDITOR → 403 (middleware).
- Service/DB error → 500 + `log.error`.

## B5. Testing (PR-B)

- **Service filter**: includes only `approved` + `idordabanki_id IS NULL` +
  `source ∈ PROJECT_ORIGINATED_SOURCES`; **excludes** an `idordabankinn` row, an `imported-csv` row,
  an `openstax-mt` row, a `proposed` row, a `disputed` row. Mutation-check the allowlist constant.
- **Shape**: CSV columns/escaping; JSON `terms` + `provenance_note` + `stats`.
- **Route auth**: EDITOR → 403; HEAD_EDITOR → 200. Empty DB → header-only file, 200.

## B6. Licence boundary (do NOT build item 17 here)

Terms are not copyrightable, and project-originated definitions are team-written, so the added-terms
seed is in-bounds **without** item 17's containment guard or per-page footer. The `provenance_note`
records the added-vs-Íðorðabanki distinction; that is the extent of licence handling in this PR. Item
17 (per-book licence field, page footer, NC-SA containment guard) stays a separate item.

## 5. Out of scope (deliberate)

- Automated Árnastofnun API submission (no submission API exists; §2.2).
- TSV for the TM (§2.5) — corpus owns it.
- Item 17 licence containment/footer (§B6).
- Surfacing `proposed` terms in the review queue (#6b) — already shipped in item 19.
- Any change to the TM auto-regen trigger, debounce, or committed-file location.

## 6. Register queue (to campaign doc on ship)

- **I21-R1 `[rights — register only]`** — `chapter-glossary` is in the added-terms set, but if its
  entries are harvested from OpenStax chapter-glossary sections, their *English* headwords are
  OpenStax-derived — the same provenance property that put `openstax-mt` **out** (§2.3). Included per
  the lead's explicit 2026-07-20 membership call; flagged so the lead can tighten to "purely
  project-coined" (drop `chapter-glossary`) if desired. Fail-safe either way (over- vs under-includes
  a relay candidate; no data risk).
- Further finds logged here during implementation per standing feedback.
