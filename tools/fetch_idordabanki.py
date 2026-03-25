#!/usr/bin/env python3
"""
Íðorðabankinn Terminology Fetcher & Import Utility

Fetches bilingual (EN↔IS) terminology from the Íðorðabankinn API
(Árnastofnun) and imports it into the namsbokasafn terminology database.

API base: https://idord.arnastofnun.is/d/api/es/terms/
Frontend: https://idordabanki.arnastofnun.is
Permission: Granted by Árnastofnun for subject-specific terminology fetching.
Policy: 1-second delay between requests. No bulk scraping outside approved subjects.

Schema mapping: tools/idordabanki_schema_mapping.md
Collections:    tools/idordabanki_collections.json

Usage:
  python tools/fetch_idordabanki.py --mode fetch --subject efnafraedi --output /tmp/efnafr/
  python tools/fetch_idordabanki.py --mode fetch --ordabok EFNAFR --output /tmp/efnafr/
  python tools/fetch_idordabanki.py --mode compare --subject efnafraedi \\
      --existing books/efnafraedi-2e/glossary/glossary-unified.csv --output /tmp/compare/
  python tools/fetch_idordabanki.py --mode import --source /tmp/efnafr/raw_fetch.json \\
      --db pipeline-output/sessions.db
  python tools/fetch_idordabanki.py --mode import --source /tmp/efnafr/raw_fetch.json \\
      --db pipeline-output/sessions.db --execute
"""

import argparse
import csv
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

API_BASE = "https://idord.arnastofnun.is/d/api/es/terms/"
PAGE_SIZE = 50
REQUEST_DELAY = 1.0  # seconds between API requests

SCRIPT_DIR = Path(__file__).resolve().parent
COLLECTIONS_FILE = SCRIPT_DIR / "idordabanki_collections.json"

# Grammar abbreviation mapping (Icelandic → pos value)
GRAMMAR_MAP = {
    "kk": "noun (m)",
    "kvk": "noun (f)",
    "hk": "noun (n)",
    "no": "noun",
    "so": "verb",
    "lo": "adjective",
    "ao": "adverb",
}

# Íðorðabankinn collection code → subject domain
COLLECTION_SUBJECT_MAP = {
    "EFNAFR": "chemistry",
    "LIFORD": "biology",
    "LIFORD2": "biology",
    "EDLISFR": "physics",
    "STAERDFRAEDI": "mathematics",
}

# ---------------------------------------------------------------------------
# Shared utilities
# ---------------------------------------------------------------------------


def load_collections():
    """Load the collections mapping from idordabanki_collections.json."""
    with open(COLLECTIONS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def fetch_page(ordabok, offset=0, ord_filter=None):
    """Fetch a single page from the Íðorðabankinn API.

    The API is an Elasticsearch backend at idord.arnastofnun.is/d.
    Parameters: ordabok (collection code), limit (page size), offset (0-based),
                ord (optional search/filter string, e.g. "a*" for prefix match).
    Response: { metadata: { took, total }, results: [...] }
    """
    params = f"ordabok={ordabok}&limit={PAGE_SIZE}&offset={offset}"
    if ord_filter:
        params += f"&ord={urllib.parse.quote(ord_filter)}"
    url = f"{API_BASE}?{params}"
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "namsbokasafn-terminology-fetcher/1.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"  HTTP error {e.code} fetching offset {offset}: {e.reason}", file=sys.stderr)
        raise
    except urllib.error.URLError as e:
        print(f"  URL error fetching offset {offset}: {e.reason}", file=sys.stderr)
        raise


ES_MAX_WINDOW = 10000

# Prefixes used for per-letter fetching to bypass the ES 10,000 cap.
# Covers a-z plus Icelandic characters and digits.
LETTER_PREFIXES = list("abcdefghijklmnopqrstuvwxyz") + [
    "á", "ð", "é", "í", "ó", "ú", "ý", "þ", "æ", "ö",
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
]


def _fetch_paginated(ordabok, delay, ord_filter=None, label=None):
    """Fetch all pages for a single ordabok + optional ord filter."""
    entries = []
    offset = 0
    total = None
    tag = f" [{label}]" if label else ""

    while True:
        data = fetch_page(ordabok, offset, ord_filter=ord_filter)

        if total is None:
            total = data.get("metadata", {}).get("total", 0)

        page_entries = data.get("results", [])
        if not page_entries:
            break

        entries.extend(page_entries)
        offset += PAGE_SIZE

        if offset >= total:
            break

        time.sleep(delay)

    return entries, total


def fetch_collection(ordabok, delay=REQUEST_DELAY):
    """Fetch all entries from a single Íðorðabankinn collection, paginating.

    If the collection exceeds the Elasticsearch 10,000 result cap,
    automatically switches to per-letter fetching using the ord=X* filter
    to retrieve the full dataset.
    """
    print(f"Fetching collection {ordabok}...")

    # Probe total with a single-entry request
    probe = fetch_page(ordabok, offset=0)
    total = probe.get("metadata", {}).get("total", 0)
    print(f"  Total entries reported: {total}")

    if total < ES_MAX_WINDOW:
        # Standard pagination — fits in one window
        entries, _ = _fetch_paginated(ordabok, delay)
        print(f"  Fetched {len(entries)}/{total} entries from {ordabok}")
        return entries, total

    # Per-letter fetching to bypass ES 10,000 cap
    print(f"  Collection exceeds ES {ES_MAX_WINDOW} cap — switching to per-letter fetch...")
    entries = []
    seen_ids = set()
    real_total = 0

    for prefix in LETTER_PREFIXES:
        ord_filter = f"{prefix}*"
        letter_entries, letter_total = _fetch_paginated(
            ordabok, delay, ord_filter=ord_filter, label=prefix
        )
        real_total += letter_total

        # Deduplicate across letters (the ord filter searches both EN and IS,
        # so the same entry can appear under multiple letter prefixes)
        new_count = 0
        for entry in letter_entries:
            eid = entry.get("id")
            if eid not in seen_ids:
                seen_ids.add(eid)
                entries.append(entry)
                new_count += 1

        if letter_total > 0:
            print(f"    {prefix}: {letter_total} found, {new_count} new "
                  f"(total: {len(entries)})")

    print(f"  Fetched {len(entries)} unique entries from {ordabok} "
          f"(sum across letters: {real_total})")

    return entries, len(entries)


def get_word_by_lang(entry, lang):
    """Extract the word object for a given language from an entry's words array.

    The API uses 'fklanguage' as the language field (e.g., 'IS', 'EN').
    """
    for w in entry.get("words", []):
        if w.get("fklanguage", "").upper() == lang.upper():
            return w
    return None


def parse_lexcatnames(raw):
    """Parse Icelandic grammar abbreviations into a normalized pos value.

    Examples:
        "kvk" → "noun (f)"
        "kk ft" → "noun (m) pl"
        "so" → "verb"
        "" → None
    """
    if not raw or not raw.strip():
        return None

    parts = raw.strip().lower().split()
    pos = None
    suffix = ""

    for part in parts:
        if part in GRAMMAR_MAP:
            pos = GRAMMAR_MAP[part]
        elif part == "ft":
            suffix = " pl"
        elif part == "et":
            pass  # singular is the default, no suffix
        elif "/" in part:
            # Handle combined forms like "kk/kvk"
            subparts = part.split("/")
            mapped = [GRAMMAR_MAP.get(s, s) for s in subparts]
            # Extract gender codes for compound noun forms
            genders = []
            for s in subparts:
                if s in ("kk", "kvk", "hk"):
                    g = {"kk": "m", "kvk": "f", "hk": "n"}[s]
                    genders.append(g)
            if genders:
                pos = f"noun ({'/'.join(genders)})"

    if pos and suffix:
        pos += suffix

    return pos


def extract_bilingual_pair(entry):
    """Parse an API entry into a normalized bilingual term dict.

    Returns a dict ready for raw_fetch.json, or None if no EN/IS pair found.
    """
    word_en = get_word_by_lang(entry, "EN")
    word_is = get_word_by_lang(entry, "IS")

    if not word_en or not word_is:
        return None

    en_term = (word_en.get("word") or "").strip()
    is_term = (word_is.get("word") or "").strip()

    if not en_term and not is_term:
        return None

    # Parse synonyms (semicolon- or comma-separated)
    is_synonyms = parse_synonyms(word_is.get("synonyms", ""))
    en_synonyms = parse_synonyms(word_en.get("synonyms", ""))

    # Parse pos from Icelandic lexcatnames
    pos = parse_lexcatnames(word_is.get("lexcatnames", ""))

    # Build notes from various fields
    notes_parts = []
    is_abbr = (word_is.get("abbreviation") or "").strip()
    en_abbr = (word_en.get("abbreviation") or "").strip()
    is_explanation = (word_is.get("explanation") or "").strip()
    en_explanation = (word_en.get("explanation") or "").strip()
    is_example = (word_is.get("example") or "").strip()
    en_example = (word_en.get("example") or "").strip()

    if is_abbr:
        notes_parts.append(f"Skammstöfun: {is_abbr}")
    if en_abbr:
        notes_parts.append(f"Abbreviation: {en_abbr}")
    if is_explanation:
        notes_parts.append(f"Skýring: {is_explanation}")
    if en_explanation:
        notes_parts.append(f"Explanation: {en_explanation}")
    if is_example:
        notes_parts.append(f"Dæmi: {is_example}")
    if en_example:
        notes_parts.append(f"Example: {en_example}")
    if en_synonyms:
        notes_parts.append(f"EN synonyms: {'; '.join(en_synonyms)}")

    return {
        "idordabanki_id": entry.get("id"),
        "english": en_term,
        "icelandic": is_term,
        "pos": pos,
        "definition_en": (word_en.get("definition") or "").strip() or None,
        "definition_is": (word_is.get("definition") or "").strip() or None,
        "synonyms_is": is_synonyms,
        "notes": "\n".join(notes_parts) if notes_parts else None,
        "fkdictionary": entry.get("fkdictionary"),
        "registerdate": entry.get("registerdate"),
    }


def parse_synonyms(raw):
    """Parse a synonym string into a list of individual terms."""
    if not raw or not raw.strip():
        return []
    # Split on semicolons first, then commas within each part
    parts = []
    for chunk in raw.split(";"):
        chunk = chunk.strip()
        if chunk:
            parts.append(chunk)
    return parts


def synonyms_to_alternatives(synonyms):
    """Convert a list of synonym strings to the alternatives JSON format."""
    return [
        {"term": s, "note": "Íðorðabankinn synonym", "source": "idordabankinn"}
        for s in synonyms
    ]


# ---------------------------------------------------------------------------
# Mode: fetch
# ---------------------------------------------------------------------------


def mode_fetch(args):
    """Fetch terminology from Íðorðabankinn and write raw_fetch.json."""
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Determine which collections to fetch
    if args.ordabok:
        collections = [{"ordabok": args.ordabok, "label": args.ordabok}]
    elif args.subject:
        all_collections = load_collections()
        if args.subject not in all_collections:
            print(f"Unknown subject: {args.subject}", file=sys.stderr)
            print(f"Available: {', '.join(all_collections.keys())}", file=sys.stderr)
            sys.exit(1)
        collections = all_collections[args.subject]["collections"]
    else:
        print("Either --subject or --ordabok is required for fetch mode", file=sys.stderr)
        sys.exit(1)

    # Fetch all collections
    all_entries = []
    totals = {}
    for coll in collections:
        entries, total = fetch_collection(coll["ordabok"], delay=args.delay)
        all_entries.extend(entries)
        totals[coll["ordabok"]] = {"fetched": len(entries), "reported": total}

    # Extract bilingual pairs
    terms = []
    skipped = 0
    for entry in all_entries:
        pair = extract_bilingual_pair(entry)
        if pair:
            terms.append(pair)
        else:
            skipped += 1

    # Deduplicate on IS term (case-insensitive).
    # Placeholder IS terms like "[vantar]" (= "missing") are deduped on EN instead,
    # since they represent distinct untranslated entries.
    PLACEHOLDER_IS = {"[vantar]", "vantar", ""}
    seen_is = {}
    seen_en_placeholder = {}
    unique_terms = []
    conflicts = []
    for term in terms:
        is_key = (term["icelandic"] or "").lower().strip()

        if is_key in PLACEHOLDER_IS:
            # Dedup placeholders by EN term
            en_key = (term["english"] or "").lower()
            if en_key in seen_en_placeholder:
                conflicts.append({
                    "icelandic": term["icelandic"],
                    "english_new": term["english"],
                    "english_existing": seen_en_placeholder[en_key]["english"],
                    "id_new": term["idordabanki_id"],
                    "id_existing": seen_en_placeholder[en_key]["idordabanki_id"],
                })
            else:
                seen_en_placeholder[en_key] = term
                # Clear the placeholder — store as NULL icelandic
                term["icelandic"] = None
                unique_terms.append(term)
        elif is_key in seen_is:
            conflicts.append({
                "icelandic": term["icelandic"],
                "english_new": term["english"],
                "english_existing": seen_is[is_key]["english"],
                "id_new": term["idordabanki_id"],
                "id_existing": seen_is[is_key]["idordabanki_id"],
            })
        else:
            seen_is[is_key] = term
            unique_terms.append(term)

    # Write raw_fetch.json
    output = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "collections": totals,
        "stats": {
            "total_api_entries": len(all_entries),
            "bilingual_pairs": len(terms),
            "skipped_no_pair": skipped,
            "unique_terms": len(unique_terms),
            "conflicts": len(conflicts),
        },
        "terms": unique_terms,
    }

    raw_path = output_dir / "raw_fetch.json"
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {raw_path} ({len(unique_terms)} unique terms)")

    # Write conflicts report if any
    if conflicts:
        conflicts_path = output_dir / "conflicts.md"
        with open(conflicts_path, "w", encoding="utf-8") as f:
            f.write("# Duplicate IS Terms (Conflicts)\n\n")
            f.write(f"Found {len(conflicts)} duplicate Icelandic terms across entries.\n")
            f.write("The first occurrence was kept; these were skipped:\n\n")
            f.write("| IS Term | EN (kept) | EN (skipped) | ID (kept) | ID (skipped) |\n")
            f.write("|---------|-----------|-------------|-----------|-------------|\n")
            for c in conflicts:
                f.write(f"| {c['icelandic']} | {c['english_existing']} | {c['english_new']} "
                        f"| {c['id_existing']} | {c['id_new']} |\n")
        print(f"Wrote {conflicts_path} ({len(conflicts)} conflicts)")

    # Summary
    print(f"\n--- Fetch Summary ---")
    for code, stats in totals.items():
        print(f"  {code}: {stats['fetched']}/{stats['reported']} entries")
    print(f"  Bilingual pairs: {len(terms)}")
    print(f"  Skipped (no EN/IS pair): {skipped}")
    print(f"  Unique terms (after dedup): {len(unique_terms)}")
    print(f"  Conflicts: {len(conflicts)}")


# ---------------------------------------------------------------------------
# Mode: compare
# ---------------------------------------------------------------------------


def mode_compare(args):
    """Compare Íðorðabankinn terms against an existing glossary CSV."""
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not args.existing:
        print("--existing is required for compare mode (path to CSV)", file=sys.stderr)
        sys.exit(1)

    # Load existing glossary
    existing_csv = Path(args.existing)
    if not existing_csv.exists():
        print(f"CSV file not found: {existing_csv}", file=sys.stderr)
        sys.exit(1)

    existing_terms = {}
    with open(existing_csv, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            is_term = (row.get("icelandic") or "").strip().lower()
            if is_term:
                existing_terms[is_term] = row

    print(f"Loaded {len(existing_terms)} existing terms from {existing_csv}")

    # Determine source: raw_fetch.json or live API
    if args.source:
        source_path = Path(args.source)
        with open(source_path, "r", encoding="utf-8") as f:
            fetch_data = json.load(f)
        api_terms = fetch_data["terms"]
        print(f"Loaded {len(api_terms)} terms from {source_path}")
    else:
        # Fetch from API
        if not args.subject and not args.ordabok:
            print("Either --subject, --ordabok, or --source is required for compare mode",
                  file=sys.stderr)
            sys.exit(1)

        if args.ordabok:
            collections = [{"ordabok": args.ordabok, "label": args.ordabok}]
        else:
            all_collections = load_collections()
            if args.subject not in all_collections:
                print(f"Unknown subject: {args.subject}", file=sys.stderr)
                sys.exit(1)
            collections = all_collections[args.subject]["collections"]

        all_entries = []
        for coll in collections:
            entries, _ = fetch_collection(coll["ordabok"], delay=args.delay)
            all_entries.extend(entries)

        api_terms = []
        for entry in all_entries:
            pair = extract_bilingual_pair(entry)
            if pair:
                api_terms.append(pair)

    # Compare
    new_terms = []
    en_mismatches = []
    enrichment = []
    matched = []

    for term in api_terms:
        is_key = (term["icelandic"] or "").strip().lower()
        if not is_key:
            continue

        if is_key in existing_terms:
            existing = existing_terms[is_key]
            matched.append(term)

            # Check English mismatch
            existing_en = (existing.get("english") or "").strip().lower()
            api_en = (term["english"] or "").strip().lower()
            if existing_en and api_en and existing_en != api_en:
                en_mismatches.append({
                    "icelandic": term["icelandic"],
                    "en_existing": existing.get("english"),
                    "en_api": term["english"],
                })

            # Check enrichment opportunities
            enrichments = []
            if not existing.get("definition_en") and term.get("definition_en"):
                enrichments.append("definition_en")
            if not existing.get("definition_is") and term.get("definition_is"):
                enrichments.append("definition_is")
            if not existing.get("pos") and term.get("pos"):
                enrichments.append("pos")
            if term.get("synonyms_is"):
                enrichments.append("synonyms_is")

            if enrichments:
                enrichment.append({
                    "icelandic": term["icelandic"],
                    "english": term["english"],
                    "fields": enrichments,
                    "term": term,
                })
        else:
            new_terms.append(term)

    # Write comparison report
    report_path = output_dir / "comparison_report.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# Íðorðabankinn vs Existing Glossary Comparison\n\n")
        f.write(f"**Date:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n")
        f.write(f"**Existing glossary:** {existing_csv}\n")
        f.write(f"**API terms:** {len(api_terms)}\n\n")

        f.write("## Summary\n\n")
        f.write(f"| Category | Count |\n")
        f.write(f"|----------|-------|\n")
        f.write(f"| Existing terms | {len(existing_terms)} |\n")
        f.write(f"| API terms | {len(api_terms)} |\n")
        f.write(f"| Matched (IS) | {len(matched)} |\n")
        f.write(f"| New terms | {len(new_terms)} |\n")
        f.write(f"| English mismatches | {len(en_mismatches)} |\n")
        f.write(f"| Enrichment opportunities | {len(enrichment)} |\n\n")

        f.write("## 1. New Terms (not in existing glossary)\n\n")
        if new_terms:
            f.write("| EN | IS | POS | Def (EN) |\n")
            f.write("|----|----|----|----------|\n")
            for t in sorted(new_terms, key=lambda x: (x["english"] or "").lower()):
                en = t["english"] or ""
                is_ = t["icelandic"] or ""
                pos = t["pos"] or ""
                defn = (t["definition_en"] or "")[:60]
                if len(t.get("definition_en") or "") > 60:
                    defn += "..."
                f.write(f"| {en} | {is_} | {pos} | {defn} |\n")
        else:
            f.write("None.\n")

        f.write("\n## 2. English Mismatches\n\n")
        f.write("Terms where the same IS term maps to different EN terms:\n\n")
        if en_mismatches:
            f.write("| IS | EN (existing) | EN (Íðorðabankinn) |\n")
            f.write("|----|---------------|--------------------|\n")
            for m in en_mismatches:
                f.write(f"| {m['icelandic']} | {m['en_existing']} | {m['en_api']} |\n")
        else:
            f.write("None.\n")

        f.write("\n## 3. Enrichment Opportunities\n\n")
        f.write("Existing terms where Íðorðabankinn can fill missing fields:\n\n")
        if enrichment:
            f.write("| IS | EN | Missing Fields |\n")
            f.write("|----|----|-----------|\n")
            for e in enrichment:
                f.write(f"| {e['icelandic']} | {e['english']} | {', '.join(e['fields'])} |\n")
        else:
            f.write("None.\n")

        f.write("\n## 4. Matched Terms (no action needed)\n\n")
        f.write(f"{len(matched) - len(en_mismatches) - len(enrichment)} terms matched "
                f"with no discrepancies or enrichment opportunities.\n")

    print(f"\nWrote {report_path}")

    # Write enriched_glossary.json (follows glossary-unified.json format)
    enriched_terms = []
    for term in new_terms + [e["term"] for e in enrichment]:
        enriched_terms.append({
            "english": term["english"],
            "icelandic": term["icelandic"],
            "pos": term["pos"],
            "definitionEn": term["definition_en"],
            "definitionIs": term["definition_is"],
            "status": "approved",
            "source": "idordabankinn",
            "alternatives": synonyms_to_alternatives(term.get("synonyms_is", [])),
            "category": None,
            "chapter": None,
            "notes": term.get("notes"),
            "idordabanki_id": term.get("idordabanki_id"),
        })

    enriched_output = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "source": "idordabankinn-compare",
        "stats": {
            "new_terms": len(new_terms),
            "enrichment": len(enrichment),
            "total": len(enriched_terms),
        },
        "terms": enriched_terms,
    }

    enriched_path = output_dir / "enriched_glossary.json"
    with open(enriched_path, "w", encoding="utf-8") as f:
        json.dump(enriched_output, f, ensure_ascii=False, indent=2)
    print(f"Wrote {enriched_path} ({len(enriched_terms)} terms)")

    # Summary
    print(f"\n--- Compare Summary ---")
    print(f"  Existing terms: {len(existing_terms)}")
    print(f"  API terms: {len(api_terms)}")
    print(f"  Matched: {len(matched)}")
    print(f"  New terms: {len(new_terms)}")
    print(f"  English mismatches: {len(en_mismatches)}")
    print(f"  Enrichment opportunities: {len(enrichment)}")


# ---------------------------------------------------------------------------
# Mode: import
# ---------------------------------------------------------------------------


def ensure_idordabanki_id_column(db):
    """No-op. The idordabanki_id column exists on terminology_translations in the new schema.

    Kept as a stub for backward compatibility with any callers.
    """
    pass


def merge_notes(existing_notes, new_notes):
    """Merge new notes into existing notes, avoiding duplicates."""
    if not new_notes:
        return existing_notes
    if not existing_notes:
        return new_notes

    # Avoid appending duplicate content
    if new_notes in existing_notes:
        return existing_notes

    return existing_notes + "\n\n" + new_notes


def upsert_headword(db, english, pos, definition_en):
    """Upsert a headword row. Handles NULL pos correctly for UNIQUE(english, pos).

    SQLite treats NULLs as distinct in UNIQUE constraints, so we use an explicit
    check: WHERE english = ? AND (pos = ? OR (pos IS NULL AND ? IS NULL)).

    Returns the headword row id.
    """
    row = db.execute(
        "SELECT id, definition_en FROM terminology_headwords "
        "WHERE english = ? AND (pos = ? OR (pos IS NULL AND ? IS NULL))",
        (english, pos, pos)
    ).fetchone()

    if row:
        # Fill in definition_en if it was NULL before
        if definition_en and not row["definition_en"]:
            db.execute(
                "UPDATE terminology_headwords SET definition_en = ? WHERE id = ?",
                (definition_en, row["id"])
            )
        return row["id"]

    cursor = db.execute(
        "INSERT INTO terminology_headwords (english, pos, definition_en) VALUES (?, ?, ?)",
        (english, pos or None, definition_en or None)
    )
    return cursor.lastrowid


def insert_translation(db, headword_id, icelandic, definition_is, source,
                       idordabanki_id, notes, status, proposed_by,
                       proposed_by_name, approved_by, approved_by_name,
                       approved_at):
    """Insert a translation row if it doesn't already exist.

    Returns (translation_id, was_inserted). If the (headword_id, icelandic)
    pair already exists, returns the existing id and False.
    """
    existing = db.execute(
        "SELECT id FROM terminology_translations "
        "WHERE headword_id = ? AND icelandic = ?",
        (headword_id, icelandic)
    ).fetchone()

    if existing:
        return existing["id"], False

    cursor = db.execute(
        "INSERT INTO terminology_translations "
        "(headword_id, icelandic, definition_is, source, idordabanki_id, "
        "notes, status, proposed_by, proposed_by_name, approved_by, "
        "approved_by_name, approved_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            headword_id, icelandic, definition_is or None, source,
            idordabanki_id, notes, status, proposed_by, proposed_by_name,
            approved_by, approved_by_name, approved_at,
        )
    )
    return cursor.lastrowid, True


def insert_translation_subject(db, translation_id, subject):
    """Insert a subject tag for a translation (idempotent — ignores duplicates)."""
    db.execute(
        "INSERT OR IGNORE INTO terminology_translation_subjects "
        "(translation_id, subject) VALUES (?, ?)",
        (translation_id, subject)
    )


def resolve_subject(fkdictionary):
    """Map an Íðorðabankinn collection code to a subject domain.

    Returns the subject string or None if the collection code is unknown.
    """
    if not fkdictionary:
        return None
    return COLLECTION_SUBJECT_MAP.get(fkdictionary.upper())


def mode_import(args):
    """Import terms from raw_fetch.json or enriched_glossary.json into the DB.

    Uses the normalized terminology schema:
      terminology_headwords → terminology_translations → terminology_translation_subjects
    """
    if not args.source:
        print("--source is required for import mode", file=sys.stderr)
        sys.exit(1)

    source_path = Path(args.source)
    if not source_path.exists():
        print(f"Source file not found: {source_path}", file=sys.stderr)
        sys.exit(1)

    db_path = args.db or "pipeline-output/sessions.db"
    if not Path(db_path).exists():
        print(f"Database not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    # Load source data
    with open(source_path, "r", encoding="utf-8") as f:
        source_data = json.load(f)

    # Handle both raw_fetch.json and enriched_glossary.json formats
    terms = source_data.get("terms", [])
    print(f"Loaded {len(terms)} terms from {source_path}")

    # Connect to DB
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row

    # Process terms
    stats = {
        "headwords_created": 0,
        "headwords_existing": 0,
        "translations_inserted": 0,
        "translations_existing": 0,
        "synonym_translations_inserted": 0,
        "subjects_tagged": 0,
        "skipped": 0,
        "errors": 0,
    }
    log_entries = []
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    for term in terms:
        # Normalize field names (enriched_glossary uses camelCase)
        en = (term.get("english") or "").strip()
        is_ = (term.get("icelandic") or "").strip()
        pos = term.get("pos")
        def_en = term.get("definition_en") or term.get("definitionEn")
        def_is = term.get("definition_is") or term.get("definitionIs")
        idob_id = term.get("idordabanki_id")
        synonyms_is = term.get("synonyms_is", [])
        notes = term.get("notes")
        fkdictionary = term.get("fkdictionary")

        # Handle alternatives from enriched format
        if not synonyms_is and "alternatives" in term:
            alts = term["alternatives"]
            if isinstance(alts, list):
                synonyms_is = [a.get("term", "") for a in alts if a.get("source") == "idordabankinn"]

        if not en:
            stats["errors"] += 1
            log_entries.append({"action": "error", "reason": "no_english", "term": term})
            continue

        try:
            # Step 1: Check by idordabanki_id — skip if this exact entry was already imported
            if idob_id:
                existing = db.execute(
                    "SELECT id FROM terminology_translations WHERE idordabanki_id = ?",
                    (idob_id,)
                ).fetchone()
                if existing:
                    stats["skipped"] += 1
                    log_entries.append({
                        "action": "skipped",
                        "reason": "idordabanki_id_exists",
                        "english": en,
                        "idordabanki_id": idob_id,
                    })
                    continue

            # Resolve subject from collection code
            subject = resolve_subject(fkdictionary)

            if args.execute:
                # Step 2: Upsert headword
                headword_id = upsert_headword(db, en, pos, def_en)

                # Track whether this was a new headword
                was_new_headword = db.execute(
                    "SELECT COUNT(*) as cnt FROM terminology_translations "
                    "WHERE headword_id = ?", (headword_id,)
                ).fetchone()["cnt"] == 0

                # Step 3: Insert main translation (if we have an IS term)
                if is_:
                    trans_id, was_inserted = insert_translation(
                        db, headword_id, is_, def_is, "idordabankinn",
                        idob_id, notes, "approved",
                        "idordabankinn-import", "Íðorðabankinn",
                        "idordabankinn-import", "Íðorðabankinn", now,
                    )

                    if was_inserted:
                        stats["translations_inserted"] += 1

                        # Step 4: Tag with subject
                        if subject:
                            insert_translation_subject(db, trans_id, subject)
                            stats["subjects_tagged"] += 1
                    else:
                        stats["translations_existing"] += 1

                    # Step 5: Insert synonym translations (same headword, different icelandic)
                    for syn in synonyms_is:
                        syn = syn.strip()
                        if not syn or syn.lower() == is_.lower():
                            continue
                        syn_trans_id, syn_inserted = insert_translation(
                            db, headword_id, syn, None, "idordabankinn",
                            None, "Íðorðabankinn synonym", "approved",
                            "idordabankinn-import", "Íðorðabankinn",
                            "idordabankinn-import", "Íðorðabankinn", now,
                        )
                        if syn_inserted:
                            stats["synonym_translations_inserted"] += 1
                            if subject:
                                insert_translation_subject(db, syn_trans_id, subject)
                                stats["subjects_tagged"] += 1

                else:
                    # No IS term — headword only (placeholder entry)
                    stats["skipped"] += 1
                    log_entries.append({
                        "action": "skipped",
                        "reason": "no_icelandic",
                        "english": en,
                    })
                    continue

                if was_new_headword:
                    stats["headwords_created"] += 1
                else:
                    stats["headwords_existing"] += 1

            else:
                # Dry run — just count
                if is_:
                    stats["translations_inserted"] += 1
                    for syn in synonyms_is:
                        syn = syn.strip()
                        if syn and syn.lower() != is_.lower():
                            stats["synonym_translations_inserted"] += 1
                else:
                    stats["skipped"] += 1

            log_entries.append({
                "action": "imported",
                "english": en,
                "icelandic": is_,
                "synonyms": len(synonyms_is),
                "subject": subject,
                "idordabanki_id": idob_id,
            })

        except Exception as e:
            stats["errors"] += 1
            log_entries.append({
                "action": "error",
                "english": en,
                "error": str(e),
            })

    # Commit or report dry run
    if args.execute:
        db.commit()

        # Write import log
        log_path = Path(args.output) / "import_log.json" if args.output else source_path.parent / "import_log.json"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(log_path, "w", encoding="utf-8") as f:
            json.dump({
                "imported_at": now,
                "source": str(source_path),
                "db": db_path,
                "stats": stats,
                "entries": log_entries,
            }, f, ensure_ascii=False, indent=2)
        print(f"\nWrote {log_path}")
    else:
        print("\n*** DRY RUN — no changes written to database ***")
        print("Add --execute to apply changes.")

    db.close()

    # Summary
    print(f"\n--- Import Summary ---")
    print(f"  Source: {source_path}")
    print(f"  Database: {db_path}")
    print(f"  Headwords created: {stats['headwords_created']}")
    print(f"  Headwords existing: {stats['headwords_existing']}")
    print(f"  Translations inserted: {stats['translations_inserted']}")
    print(f"  Translations existing: {stats['translations_existing']}")
    print(f"  Synonym translations: {stats['synonym_translations_inserted']}")
    print(f"  Subjects tagged: {stats['subjects_tagged']}")
    print(f"  Skipped: {stats['skipped']}")
    print(f"  Errors: {stats['errors']}")
    if not args.execute:
        print(f"\n  (dry run — use --execute to apply)")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Fetch and import terminology from Íðorðabankinn (Árnastofnun)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--mode", required=True, choices=["fetch", "compare", "import"],
        help="Operation mode: fetch (download), compare (diff against CSV), import (load to DB)",
    )
    parser.add_argument(
        "--subject",
        help="Subject key from idordabanki_collections.json (e.g., efnafraedi, liffraedi)",
    )
    parser.add_argument(
        "--ordabok",
        help="Direct collection code override (e.g., EFNAFR, LIFFRSK)",
    )
    parser.add_argument(
        "--output", "-o",
        help="Output directory for results (created if needed)",
    )
    parser.add_argument(
        "--existing",
        help="Path to existing glossary CSV (for compare mode)",
    )
    parser.add_argument(
        "--source",
        help="Path to raw_fetch.json or enriched_glossary.json (for import/compare mode)",
    )
    parser.add_argument(
        "--db",
        help="Path to SQLite database (default: pipeline-output/sessions.db)",
    )
    parser.add_argument(
        "--execute", action="store_true",
        help="Actually write changes to the database (import mode). Without this flag, runs in dry-run mode.",
    )
    parser.add_argument(
        "--delay", type=float, default=REQUEST_DELAY,
        help=f"Delay between API requests in seconds (default: {REQUEST_DELAY})",
    )

    args = parser.parse_args()

    # Validate mode-specific requirements
    if args.mode == "fetch" and not args.output:
        parser.error("--output is required for fetch mode")

    if args.mode == "compare" and not args.output:
        parser.error("--output is required for compare mode")

    if args.mode == "import" and not args.source:
        parser.error("--source is required for import mode")

    # Dispatch
    if args.mode == "fetch":
        mode_fetch(args)
    elif args.mode == "compare":
        mode_compare(args)
    elif args.mode == "import":
        mode_import(args)


if __name__ == "__main__":
    main()
