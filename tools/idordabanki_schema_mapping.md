# Íðorðabankinn → terminology_terms Schema Mapping

> **Purpose:** Documents how Íðorðabankinn API response fields map to the
> `terminology_terms` database table. Review this before running the import tool.
>
> **API endpoint:** `https://idord.arnastofnun.is/d/api/es/terms/?ordabok={CODE}&limit=50&offset={N}`
> **Frontend:** `https://idordabanki.arnastofnun.is`
> **Permission:** Granted by Árnastofnun for subject-specific terminology fetching.

---

## Current Database Schema (after migrations 004→020→026)

```sql
CREATE TABLE terminology_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER,               -- NULL = global (all books)
  english TEXT NOT NULL,
  icelandic TEXT,                 -- nullable since migration 026
  alternatives TEXT,              -- JSON: [{"term": "...", "note": "...", "source": "..."}]
  category TEXT,
  notes TEXT,                     -- free-text, multi-line
  source TEXT,                    -- enum: see TERM_SOURCES
  source_chapter INTEGER,
  status TEXT DEFAULT 'proposed', -- enum: approved|proposed|disputed|needs_review
  proposed_by TEXT,
  proposed_by_name TEXT,
  approved_by TEXT,
  approved_by_name TEXT,
  approved_at DATETIME,
  definition_en TEXT,
  definition_is TEXT,
  pos TEXT,                       -- part of speech (free-text)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(english, pos, book_id)
);
```

---

## API Response Structure

Each search result returns `metadata` and `results[]`. Each entry in `results` has:

```json
{
  "id": 931162,
  "fkdictionary": "EFNAFR",
  "category": null,
  "subcategory": null,
  "registerdate": "2024-01-08T09:29:05",
  "words": [
    {
      "id": 2411951,
      "fklanguage": "IS",
      "lexcatnames": null,
      "word": "aðsogast",
      "synonyms": null,
      "abbreviation": "",
      "domain": "",
      "definition": "",
      "example": "",
      "explanation": "",
      "rownum": 7092
    },
    {
      "id": 2411952,
      "fklanguage": "EN",
      "lexcatnames": null,
      "word": "adsorb",
      "synonyms": null,
      "abbreviation": "",
      "domain": "",
      "definition": "",
      "example": "",
      "explanation": "",
      "rownum": 5613
    }
  ],
  "changes": null,
  "related": null,
  "compterms": null,
  "pictures": null
}
```

---

## Field Mapping: Entry-Level

| API Field | Type | DB Target | Action |
|-----------|------|-----------|--------|
| `id` | int | **`idordabanki_id`** (NEW) | Store for dedup. Requires migration 028. |
| `fkdictionary` | str | — | Metadata only. Recorded in `raw_fetch.json`. |
| `category` | str/null | — | Rarely populated (all null in EFNAFR). Skip. |
| `subcategory` | str/null | — | Not populated in observed data. Skip. |
| `registerdate` | ISO date | — | Metadata only. Recorded in `raw_fetch.json`. |
| `changes[]` | array | — | Internal audit trail. Skip. |
| `related` | array | — | Rarely populated. Skip. |
| `compterms` | array | — | Compound terms. Rarely populated. Skip. |
| `pictures` | array | — | Not relevant. Skip. |

---

## Field Mapping: Word-Level (per language)

| API Field | Lang | DB Target | Transform | Notes |
|-----------|------|-----------|-----------|-------|
| `word` | EN | `english` | Direct | Primary match key for import. |
| `word` | IS | `icelandic` | Direct | Primary match key for compare. |
| `synonyms` | IS | `alternatives` | Parse → JSON array | Format: `[{"term": "X", "note": "Íðorðabankinn synonym", "source": "idordabankinn"}]` |
| `synonyms` | EN | `notes` | Append | `"EN synonyms: ..."` |
| `abbreviation` | IS | `notes` | Append if non-empty | `"Skammstöfun: ..."` |
| `abbreviation` | EN | `notes` | Append if non-empty | `"Abbreviation: ..."` |
| `definition` | EN | `definition_en` | Direct | Only populate if currently NULL. |
| `definition` | IS | `definition_is` | Direct | Only populate if currently NULL. |
| `explanation` | IS | `notes` | Append if non-empty | `"Skýring: ..."` |
| `explanation` | EN | `notes` | Append if non-empty | `"Explanation: ..."` |
| `example` | IS/EN | `notes` | Append if non-empty | `"Dæmi: ..."` / `"Example: ..."` |
| `domain` | IS/EN | — | Skip | Empty in observed data. |
| `lexcatnames` | IS | `pos` | Parse abbreviation | See grammar mapping table below. |
| `lexcatnames` | EN | — | Skip | Rarely populated. |
| `id` (word) | — | — | Skip | Internal word-level ID. |
| `rownum` | — | — | Skip | Internal ordering. |

---

## Derived / Constant Fields

| DB Field | Value | Notes |
|----------|-------|-------|
| `source` | `'idordabankinn'` | Already in `TERM_SOURCES` enum. |
| `status` | `'approved'` | Árnastofnun is authoritative. |
| `book_id` | `NULL` | Global scope — available to all books. |
| `source_chapter` | `NULL` | Not chapter-specific. |
| `proposed_by` | `'idordabankinn-import'` | System attribution. |
| `proposed_by_name` | `'Íðorðabankinn'` | Display name. |
| `approved_by` | `'idordabankinn-import'` | Auto-approved (authoritative source). |
| `approved_by_name` | `'Íðorðabankinn'` | Display name. |
| `approved_at` | Current timestamp | Set at import time. |

---

## Grammar Abbreviation Mapping (lexcatnames → pos)

| Abbreviation | Icelandic | English | `pos` value |
|-------------|-----------|---------|-------------|
| `kk` | karlkyn | masculine noun | `noun (m)` |
| `kvk` | kvenkyn | feminine noun | `noun (f)` |
| `hk` | hvorugkyn | neuter noun | `noun (n)` |
| `kk/kvk` | karl-/kvenkyn | masc/fem noun | `noun (m/f)` |
| `ft` | fleirtala | plural | append `pl` to noun |
| `et` | eintala | singular | (default, no suffix) |
| `so` | sagnorð | verb | `verb` |
| `lo` | lýsingarorð | adjective | `adjective` |
| `ao` | atviksorð | adverb | `adverb` |
| `no` | nafnorð | noun (unspecified) | `noun` |
| (empty) | — | — | `NULL` |

**Combination examples:** `"kvk ft"` → `noun (f) pl`, `"kk"` → `noun (m)`

---

## Proposed Schema Change: Migration 028

**One new column:**

```sql
ALTER TABLE terminology_terms ADD COLUMN idordabanki_id INTEGER;
CREATE INDEX idx_terminology_terms_idordabanki
  ON terminology_terms(idordabanki_id);
```

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `idordabanki_id` | INTEGER | NULL | External entry ID for deduplication and provenance. |

**Why:** Enables reliable dedup on re-import. Without it, re-running the import
would need heuristic English-term matching, which is fragile for terms with
multiple POS entries.

**Fields NOT added** (too sparse to justify dedicated columns):
- `abbreviation` — stored in `notes`
- `explanation_en` / `explanation_is` — stored in `notes`
- `example` — rarely populated, stored in `notes`
- `subcategory` — not populated in API data

---

## Conflict Resolution Strategy

### Import Mode (new terms)

1. **Exact dedup:** Skip if `idordabanki_id` already exists in DB.
2. **English match:** Query `WHERE LOWER(english) = ? AND (book_id IS NULL) AND (pos = ? OR pos IS NULL)`.
3. **If match found:** COALESCE — fill NULL fields only. Never overwrite:
   - `icelandic` (if non-null)
   - `definition_en` / `definition_is` (if non-null)
   - `status`, `source`, `approved_by`, `approved_at`
4. **If no match:** INSERT new row with all mapped fields.

### Compare Mode (chemistry enrichment)

1. Match on `LOWER(icelandic)` across Íðorðabankinn data and existing CSV.
2. Report: new terms, English mismatches, definition enrichment opportunities.
3. Output `enriched_glossary.json` in existing `glossary-unified.json` format.

### Existing Íðorðabankinn Terms

12 terms already have `source: 'idordabankinn'` in the chemistry glossary
(manually imported from `terminology-en-is.csv`). The import will detect these
via English-term matching and only COALESCE missing fields (e.g., add
`idordabanki_id`, fill missing definitions).

---

## Synonym Parsing

API `synonyms` field is a semicolon-separated string (e.g., `"uppleyst efni; leysiefni"`).

**Transform to `alternatives` JSON array:**

```json
[
  {"term": "uppleyst efni", "note": "Íðorðabankinn synonym", "source": "idordabankinn"},
  {"term": "leysiefni", "note": "Íðorðabankinn synonym", "source": "idordabankinn"}
]
```

**Merge strategy:** If existing `alternatives` is non-empty, append new synonyms
that aren't already present (case-insensitive match on `term`).

---

## Notes Field Assembly

The `notes` field aggregates multiple API fields. Each section is on its own line:

```
Skammstöfun: H₂O
Abbreviation: ...
Skýring: Vatn er samband vetnis og súrefnis.
Explanation: Water is a compound of hydrogen and oxygen.
Dæmi: ...
EN synonyms: dihydrogen monoxide
```

Only non-empty fields are included. If existing `notes` is non-null, new content
is appended with a blank-line separator.
