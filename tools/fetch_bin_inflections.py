#!/usr/bin/env python3
"""
BÍN Inflection Populator for Terminology Database

Populates the `inflections` JSON field on terminology_translations
by looking up each Icelandic term in a local copy of BÍN data
(Beygingarlýsing íslensks nútímamáls).

DATA SOURCE:
  Download SHsnid.csv from https://bin.arnastofnun.is/gogn/mimisbrunnur/
  (requires accepting CC BY-SA 4.0 license terms)

  Place the file at: tools/data/SHsnid.csv
  (or specify a different path with --bin-data)

LICENSE:
  BÍN data is © Stofnun Árna Magnússonar í íslenskum fræðum, distributed
  under CC BY-SA 4.0. Products using this data must include the attribution:

    Beygingarlýsing íslensks nútímamáls.
    Stofnun Árna Magnússonar í íslenskum fræðum.
    Höfundur og ritstjóri Kristín Bjarnadóttir.

  See: https://bin.arnastofnun.is/gogn/skilmalar/

SHsnid.csv FORMAT (Sigrúnarsnið):
  6 semicolon-separated fields per line:
    0: Uppflettimynd (headword/lemma)
    1: Auðkenni (BÍN ID)
    2: Orðflokkur (word class)
    3: Beygingarflokkur (inflection class)
    4: Beygingarmynd (inflected form)
    5: Greiningarstrengur (grammatical tag)

Usage:
  python tools/fetch_bin_inflections.py --db pipeline-output/sessions.db
  python tools/fetch_bin_inflections.py --db pipeline-output/sessions.db --execute
  python tools/fetch_bin_inflections.py --db pipeline-output/sessions.db --execute --limit 50
"""

import argparse
import csv
import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_BIN_PATH = SCRIPT_DIR / "data" / "SHsnid.csv"


def load_bin_data(bin_path):
    """Load SHsnid.csv into a dict: lowercase lemma → set of inflected forms.

    Each entry in SHsnid.csv has:
      field[0] = uppflettimynd (lemma/headword)
      field[4] = beygingarmynd (inflected form)

    We group all inflected forms by lowercase lemma so lookups are O(1).
    """
    print(f"Loading BÍN data from {bin_path}...")
    inflection_map = defaultdict(set)
    line_count = 0

    with open(bin_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f, delimiter=";")
        for row in reader:
            if len(row) < 5:
                continue
            lemma = row[0].strip()
            form = row[4].strip()
            if lemma and form:
                inflection_map[lemma.lower()].add(form)
                line_count += 1

    print(f"  Loaded {line_count:,} inflection records for {len(inflection_map):,} lemmas")
    return inflection_map


def get_inflections(inflection_map, word):
    """Look up all inflected forms for a word.

    Returns a sorted list of unique inflected forms (excluding the base form),
    or None if the word is not found in BÍN.
    """
    key = word.lower().strip()
    forms = inflection_map.get(key)

    if not forms:
        return None

    # Return all forms except the base form itself
    result = sorted(f for f in forms if f.lower() != key)
    return result if result else None


def main():
    parser = argparse.ArgumentParser(
        description="Populate inflections from BÍN data for terminology translations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--db", default="pipeline-output/sessions.db",
        help="Path to SQLite database (default: pipeline-output/sessions.db)",
    )
    parser.add_argument(
        "--bin-data", default=str(DEFAULT_BIN_PATH),
        help=f"Path to SHsnid.csv (default: {DEFAULT_BIN_PATH})",
    )
    parser.add_argument(
        "--execute", action="store_true",
        help="Actually write inflections to database. Without this, runs in dry-run mode.",
    )
    parser.add_argument(
        "--limit", type=int, default=0,
        help="Process at most N translations (0 = all). Useful for testing.",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Re-fetch inflections even for terms that already have them.",
    )
    args = parser.parse_args()

    # Check BÍN data file exists
    bin_path = Path(args.bin_data)
    if not bin_path.exists():
        print(f"Error: BÍN data file not found: {bin_path}", file=sys.stderr)
        print(f"\nTo use this tool:", file=sys.stderr)
        print(f"  1. Visit https://bin.arnastofnun.is/gogn/mimisbrunnur/", file=sys.stderr)
        print(f"  2. Accept the CC BY-SA 4.0 license", file=sys.stderr)
        print(f"  3. Download SHsnid.csv", file=sys.stderr)
        print(f"  4. Place it at: {DEFAULT_BIN_PATH}", file=sys.stderr)
        sys.exit(1)

    # Load BÍN data into memory
    inflection_map = load_bin_data(bin_path)

    # Connect to DB
    db = sqlite3.connect(args.db)
    db.row_factory = sqlite3.Row

    # Query translations needing inflections
    where = "1=1" if args.force else "t.inflections IS NULL"
    # Skip multi-word terms — BÍN handles single words
    where += " AND t.icelandic NOT LIKE '% %'"
    # Skip NULL icelandic
    where += " AND t.icelandic IS NOT NULL"

    limit_clause = f"LIMIT {args.limit}" if args.limit else ""

    sql = f"""
        SELECT t.id, t.icelandic, t.headword_id, h.english
        FROM terminology_translations t
        JOIN terminology_headwords h ON h.id = t.headword_id
        WHERE {where}
        ORDER BY t.id
        {limit_clause}
    """

    rows = db.execute(sql).fetchall()
    total = len(rows)

    print(f"\nFound {total} translations to process")
    if not args.execute:
        print("*** DRY RUN — add --execute to write to database ***\n")

    stats = {
        "processed": 0,
        "found": 0,
        "not_found": 0,
    }

    update_stmt = "UPDATE terminology_translations SET inflections = ? WHERE id = ?"

    for i, row in enumerate(rows):
        translation_id = row["id"]
        icelandic = row["icelandic"]
        english = row["english"]

        forms = get_inflections(inflection_map, icelandic)
        stats["processed"] += 1

        if forms:
            stats["found"] += 1
            inflections_json = json.dumps(forms, ensure_ascii=False)

            if args.execute:
                db.execute(update_stmt, (inflections_json, translation_id))

            # Verbose for first 20, then summary
            if i < 20:
                print(f"  ✓ {icelandic} ({english}): {len(forms)} forms")
        else:
            stats["not_found"] += 1
            if i < 20:
                print(f"  – {icelandic} ({english}): not in BÍN")

    # Commit
    if args.execute:
        db.commit()
        print(f"\n✓ Changes committed to {args.db}")
    else:
        print(f"\n*** DRY RUN — no changes written ***")

    db.close()

    # Summary
    print(f"\n--- Inflection Summary ---")
    print(f"  Processed: {stats['processed']}")
    print(f"  Found in BÍN: {stats['found']}")
    print(f"  Not in BÍN: {stats['not_found']}")
    hit_rate = (stats['found'] / stats['processed'] * 100) if stats['processed'] else 0
    print(f"  Hit rate: {hit_rate:.1f}%")
    if not args.execute and stats['found']:
        print(f"\n  Add --execute to apply {stats['found']} inflection updates")


if __name__ == "__main__":
    main()
