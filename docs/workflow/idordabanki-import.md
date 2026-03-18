# Íðorðabankinn Terminology Import

Fetches bilingual (EN↔IS) terminology from the Íðorðabankinn API (Árnastofnun) and imports it into the namsbokasafn terminology database.

**API:** `https://idord.arnastofnun.is/d/api/es/terms/`
**Frontend:** `https://idordabanki.arnastofnun.is`
**Permission:** Granted by Árnastofnun for subject-specific terminology fetching.
**Policy:** 1-second delay between API requests.

## Available Collections

| Subject | Key | Collection Codes | Entries |
|---------|-----|-----------------|---------|
| Chemistry | `efnafraedi` | EFNAFR | ~593 |
| Biology | `liffraedi` | LIFORD + LIFORD2 | ~10,650 |
| Physics | `edlisfraedi` | EDLISFR | ~4,982 |
| Mathematics | `staerdfraedi` | STAERDFRAEDI | ~8,600 |

Collection codes are configured in `tools/idordabanki_collections.json`.

## Prerequisites

- Python 3.12+ (stdlib only — no pip install needed)
- Database: `pipeline-output/sessions.db`
- Migration 028 adds `idordabanki_id` column (runs automatically on server restart, or added by the script on first import run)

## Production Workflow

### Step 1: Back up the database

```bash
cp pipeline-output/sessions.db pipeline-output/sessions.db.$(date +%Y-%m-%d-%H%M).bak
```

### Step 2: Fetch terms from the API

```bash
# Chemistry (~12 seconds, 593 entries)
python3 tools/fetch_idordabanki.py --mode fetch --subject efnafraedi -o /tmp/idordabanki-efnafraedi/

# Biology (~10 minutes, LIFORD uses per-letter fetch for ES 10k cap)
python3 tools/fetch_idordabanki.py --mode fetch --subject liffraedi -o /tmp/idordabanki-liffraedi/

# Or fetch a single collection directly
python3 tools/fetch_idordabanki.py --mode fetch --ordabok EFNAFR -o /tmp/efnafr/
```

Output: `raw_fetch.json` (normalized terms) and `conflicts.md` (duplicate IS terms).

### Step 3: Compare against existing glossary (optional, chemistry)

```bash
python3 tools/fetch_idordabanki.py --mode compare \
  --source /tmp/idordabanki-efnafraedi/raw_fetch.json \
  --existing books/efnafraedi-2e/glossary/glossary-unified.csv \
  -o /tmp/idordabanki-compare/
```

Output: `comparison_report.md` (new terms, English mismatches, enrichment opportunities) and `enriched_glossary.json`.

### Step 4: Dry run — review the counts

```bash
python3 tools/fetch_idordabanki.py --mode import \
  --source /tmp/idordabanki-efnafraedi/raw_fetch.json \
  --db pipeline-output/sessions.db
```

Shows insert/update/skip counts without modifying the database. Review these before proceeding.

### Step 5: Execute the import

```bash
python3 tools/fetch_idordabanki.py --mode import \
  --source /tmp/idordabanki-efnafraedi/raw_fetch.json \
  --db pipeline-output/sessions.db --execute
```

Output: `import_log.json` with per-term action log.

## Things to Be Aware Of

1. **The dry-run adds the `idordabanki_id` column.** The `ensure_idordabanki_id_column()` function runs before the dry-run/execute branch. This is harmless (nullable column, no data change), but if you want the column added only through the migration system, restart the server first to trigger migration 028.

2. **Back up the DB before `--execute`.** The import uses COALESCE logic (only fills NULL/empty fields, never overwrites existing data), but a backup is always prudent.

3. **Elasticsearch 10,000 cap.** Collections with >10,000 entries (currently LIFORD) automatically use per-letter fetching via the `ord=X*` parameter. This takes longer (~10 minutes for LIFORD) but retrieves the full dataset.

4. **`[vantar]` placeholders.** Some collections (especially LIFORD2) contain entries where the Icelandic term is `[vantar]` ("missing"). These are stored with `icelandic: null` — English-only terms awaiting translation.

## Import Behavior

- **Source:** `idordabankinn` (already in `TERM_SOURCES` enum)
- **Status:** `approved` (Árnastofnun is authoritative)
- **Scope:** `book_id = NULL` (global — available to all books)
- **Deduplication:** First by `idordabanki_id`, then by English term match
- **COALESCE:** Only fills NULL/empty fields — never overwrites `icelandic`, `definition_en`, `definition_is`, `status`, `source`, `approved_by`, or `approved_at` if already populated
- **Audit:** Logged in `terminology_imports` table; per-term actions in `import_log.json`

## Schema Mapping

Detailed field mapping from API response to database columns is documented in `tools/idordabanki_schema_mapping.md`.

## Files

| File | Purpose |
|------|---------|
| `tools/fetch_idordabanki.py` | Main script (fetch, compare, import) |
| `tools/idordabanki_collections.json` | Subject → collection code mapping |
| `tools/idordabanki_schema_mapping.md` | API → DB field mapping (review document) |
| `server/migrations/028-idordabanki-id.js` | Adds `idordabanki_id` column |
