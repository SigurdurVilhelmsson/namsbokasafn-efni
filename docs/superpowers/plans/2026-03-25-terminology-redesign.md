# Terminology Redesign: Multi-Subject Domains with Inflection Support

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the terminology database from per-book scoping to per-domain (subject) scoping, where a single English term can have multiple Icelandic translations tagged by subject domain (Chemistry, Biology, Physics, etc.). Add inflection-aware matching for Icelandic terms.

**Architecture:** Normalize the current flat `terminology_terms` table into a headword + translations model. Each translation is tagged with one or more subject domains from Íðorðabankinn. Books map to a primary subject domain for priority ranking. Inflected forms are stored alongside translations for fuzzy matching.

**Tech Stack:** SQLite (better-sqlite3), Express routes, Vitest tests, existing migration runner

---

## Context

### Current State
- `terminology_terms` table: flat, one row per (english, pos, book_id)
- `book_id` ties a term to ONE book (NULL = global)
- `alternatives` JSON field is overloaded: synonyms, inflections, and domain variants mixed together
- Chemistry-only import from Íðorðabankinn done on production (can be redone)
- Term matching in segment editor: exact word-boundary match on `icelandic` field — misses inflected forms

### Problem
1. Same English term imported separately per book → duplicates
2. No way to show "this is the Chemistry translation, that's the Biology translation"
3. Icelandic inflections (4 cases × 3 genders × 2 numbers) defeat exact matching
4. `alternatives` conflates different translation options with inflected forms of the same translation

### Target State
- One headword entry per English term
- Multiple translations per headword, each tagged with subject domains
- Books map to primary subject → domain-relevant translations shown first
- Inflected forms stored per translation for fuzzy matching
- All existing data preserved through migration

---

## New Schema

```sql
-- Headword: one per English term (replaces terminology_terms identity)
CREATE TABLE terminology_headwords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  english TEXT NOT NULL,
  pos TEXT,                          -- part of speech
  definition_en TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(english, pos)
);

-- Translation: one per Icelandic rendering of a headword
CREATE TABLE terminology_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  headword_id INTEGER NOT NULL,
  icelandic TEXT NOT NULL,
  definition_is TEXT,
  inflections TEXT,                   -- JSON array of inflected forms (Option B)
  source TEXT,                        -- idordabankinn, manual, openstax-glossary, etc.
  idordabanki_id INTEGER,            -- dedup key for Íðorðabankinn imports
  notes TEXT,
  status TEXT DEFAULT 'proposed',     -- proposed, approved, disputed, needs_review
  proposed_by TEXT,
  proposed_by_name TEXT,
  approved_by TEXT,
  approved_by_name TEXT,
  approved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (headword_id) REFERENCES terminology_headwords(id) ON DELETE CASCADE,
  UNIQUE(headword_id, icelandic)
);

-- Subject tags for translations (many-to-many)
CREATE TABLE terminology_translation_subjects (
  translation_id INTEGER NOT NULL,
  subject TEXT NOT NULL,              -- 'chemistry', 'biology', 'physics', etc.
  PRIMARY KEY (translation_id, subject),
  FOREIGN KEY (translation_id) REFERENCES terminology_translations(id) ON DELETE CASCADE
);

-- Map books to their primary subject domain
CREATE TABLE book_subject_mapping (
  book_id INTEGER NOT NULL,
  primary_subject TEXT NOT NULL,      -- 'chemistry', 'biology', etc.
  PRIMARY KEY (book_id),
  FOREIGN KEY (book_id) REFERENCES registered_books(id) ON DELETE CASCADE
);

-- Discussions now reference headwords (not translations)
-- Migration: update FK from old term_id to new headword_id
CREATE TABLE terminology_discussions_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  headword_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  comment TEXT NOT NULL,
  proposed_translation TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (headword_id) REFERENCES terminology_headwords(id) ON DELETE CASCADE
);
```

### Subject Domain Values
Mapped from Íðorðabankinn collection codes:
- `chemistry` (EFNAFR)
- `biology` (LIFRAED)
- `physics` (EDLISFR)
- `microbiology` (subset of biology or separate?)
- `organic-chemistry` (subset of chemistry or separate?)
- `general` (for terms that span all domains)

Note: Check `tools/idordabanki_collections.json` for the full mapping.

### Inflections Field (Option B)
Stored as JSON array on `terminology_translations`:
```json
["afturkræfur", "afturkræfan", "afturkræfum", "afturkræfs", "afturkræft", "afturkræf", "afturkræfir", "afturkræfa", "afturkræfra"]
```
Populated during Íðorðabankinn import (many entries include paradigm data). For manually added terms, inflections can be added via the UI or left empty (falls back to exact match).

---

## Data Migration Strategy

The key challenge: map the flat `terminology_terms` table to the normalized schema without losing data.

### Migration Logic
```
For each row in terminology_terms:
  1. UPSERT into terminology_headwords (english, pos, definition_en)
     → get headword_id
  2. INSERT into terminology_translations (headword_id, icelandic, definition_is,
     source, status, idordabanki_id, notes, proposed_by/name, approved_by/name/at)
     → get translation_id
  3. Determine subject from source context:
     - If source = 'idordabankinn' → check idordabanki collection mapping
     - If book_id maps to a known book → use that book's subject
     - If book_id IS NULL → tag as 'general' (or infer from category)
     INSERT into terminology_translation_subjects (translation_id, subject)
  4. Parse alternatives JSON:
     - Objects with source='idordabankinn' → create additional translations
     - Plain strings → store as inflections on the primary translation
       (or as additional translations if they look like different words)
  5. Migrate terminology_discussions → terminology_discussions_v2
     (map old term_id to new headword_id)
```

### Book Subject Mapping (initial data)
```sql
INSERT INTO book_subject_mapping VALUES
  ((SELECT id FROM registered_books WHERE slug='efnafraedi-2e'), 'chemistry'),
  ((SELECT id FROM registered_books WHERE slug='liffraedi-2e'), 'biology'),
  ((SELECT id FROM registered_books WHERE slug='orverufraedi'), 'microbiology'),
  ((SELECT id FROM registered_books WHERE slug='lifraen-efnafraedi'), 'organic-chemistry'),
  ((SELECT id FROM registered_books WHERE slug='edlisfraedi-2e'), 'physics');
```

---

## Implementation Tasks

### Task 1: Schema migration
- Create migration 032 with new tables
- Migrate data from `terminology_terms` → headwords + translations + subjects
- Migrate `terminology_discussions` → `terminology_discussions_v2`
- Populate `book_subject_mapping`
- Keep old table as `terminology_terms_legacy` for rollback safety

### Task 2: Update terminologyService.js — core queries
- Rewrite CRUD operations for new schema (headwords + translations)
- Update `findTermsInSegments()` to:
  - Join headwords + translations + subjects
  - Rank by domain relevance (book's primary_subject matches translation's subject)
  - Check inflections array for fuzzy matching
  - Show all translations, mark primary by domain
- Update import functions (CSV, Excel, glossary, Íðorðabankinn)
- Update stats, search, export functions

### Task 3: Update terminology routes
- Adapt API endpoints for new data shape
- Search returns headwords with nested translations array
- Each translation has subject tags and status
- Approval/dispute now operates on translations (not headwords)
- Export includes subject tags

### Task 4: Update terminology UI (terminology.html)
- Term cards show headword with all translations grouped by subject
- Subject badges on each translation
- Import modal: subject selection for new imports
- Search/filter: filter by subject domain
- Approval workflow: approve individual translations

### Task 5: Update segment editor term matching
- `findTermsInSegments()` uses new schema
- Match includes inflections: build regex from `[icelandic, ...inflections]`
- Term popup shows all translations with subject badges
- Primary translation (matching book's domain) highlighted
- Alternative domain translations shown with tags

### Task 6: Update Íðorðabankinn import tool
- Update Python script (or rewrite in Node.js) to populate new schema
- Import inflections from Íðorðabankinn paradigm data
- Tag each translation with the source collection's subject domain
- Handle multi-collection terms (same EN word in Chemistry + Biology)

### Task 7: Tests
- Update existing terminologyService tests for new schema
- Add tests for inflection matching
- Add tests for domain-priority ranking
- Add tests for data migration (verify no data loss)
- Update E2E tests if term display changed

---

## Display Logic

### Segment Editor Term Popup
```
┌─────────────────────────────────────┐
│ reversible                          │
├─────────────────────────────────────┤
│ ★ afturkræfur        [Efnafræði] ✓ │  ← primary (matches book domain)
│   viðsnúanlegur      [Líffræði]    │  ← available alternative
│                                     │
│ Skilgreining: A process that can... │
└─────────────────────────────────────┘
```

### Terminology Page
```
reversible (adj.)
├── afturkræfur — Efnafræði, Eðlisfræði  [samþykkt]
└── viðsnúanlegur — Líffræði              [í bið]
```

### Matching Priority
1. Translation tagged with book's primary subject + exact/inflection match → **strong match**
2. Translation tagged with other subject + exact/inflection match → **available alternative**
3. No match → **missing term** issue (if approved)

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `server/migrations/032-terminology-redesign.js` | New tables, data migration |
| `server/services/terminologyService.js` | Core rewrite (~1323 lines) |
| `server/routes/terminology.js` | API endpoint updates (~970 lines) |
| `server/views/terminology.html` | UI for multi-translation display |
| `server/public/js/segment-editor.js` | Term popup with domain badges |
| `server/public/js/localization-editor.js` | Same term popup updates |
| `tools/fetch_idordabanki.py` | Import with inflections + subject tags |
| `server/__tests__/terminologyService.test.js` | Test updates |

---

## Verification

1. **Data integrity:** All existing terms preserved after migration (count check)
2. **Search works:** Terminology page shows headwords with grouped translations
3. **Domain priority:** In Chemistry book, Chemistry translations shown first
4. **Inflection matching:** "afturkræf" matches "afturkræfur" in segment editor
5. **Import works:** Íðorðabankinn import populates subjects + inflections
6. **Approval workflow:** Can approve/dispute individual translations
7. **Export:** CSV/JSON includes subject tags
8. **Tests pass:** All existing + new tests green
9. **E2E:** Terminology page, segment editor term highlighting
