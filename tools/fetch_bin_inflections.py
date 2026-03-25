#!/usr/bin/env python3
"""
BÍN Inflection Fetcher for Terminology Database

Populates the `inflections` JSON field on terminology_translations
by looking up each Icelandic term in BÍN (Beygingarlýsing íslensks
nútímamáls) at bin.arnastofnun.is.

This reduces false "term not found" alerts in the segment editor,
since the matching code checks inflected forms as well as the base form.

API: https://bin.arnastofnun.is/api/ord/<word>
Returns: [{ ord, bmyndir: [{ g: "NFET", b: "vatn" }, ...] }]

Usage:
  python tools/fetch_bin_inflections.py --db pipeline-output/sessions.db
  python tools/fetch_bin_inflections.py --db pipeline-output/sessions.db --execute
  python tools/fetch_bin_inflections.py --db pipeline-output/sessions.db --execute --limit 50
"""

import argparse
import json
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

BIN_API = "https://bin.arnastofnun.is/api/ord"
REQUEST_DELAY = 1.0  # seconds between requests — be polite to Árnastofnun


def fetch_inflections(word):
    """Look up a word in BÍN and return all unique inflected forms.

    Returns (forms, pos_info) where forms is a list of unique strings
    (excluding the base form itself) and pos_info is the word class label.
    Returns (None, None) if the word is not found.
    """
    url = f"{BIN_API}/{urllib.request.quote(word)}"
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "namsbokasafn-inflection-fetcher/1.0",
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None, None
        raise
    except urllib.error.URLError:
        return None, None

    if not data or not isinstance(data, list):
        return None, None

    # Collect all unique inflected forms across all matching entries.
    # BÍN may return multiple entries (homonyms) — we want all forms.
    all_forms = set()
    pos_info = None

    for entry in data:
        if not isinstance(entry, dict):
            continue
        if not pos_info:
            pos_info = entry.get("ofl_heiti")

        for form in entry.get("bmyndir", []):
            b = form.get("b", "").strip()
            if b:
                all_forms.add(b)

    # Remove the base form itself — the matching code already checks it
    base_lower = word.lower()
    forms = sorted(f for f in all_forms if f.lower() != base_lower)

    return forms if forms else None, pos_info


def main():
    parser = argparse.ArgumentParser(
        description="Fetch inflections from BÍN for terminology translations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--db", default="pipeline-output/sessions.db",
        help="Path to SQLite database (default: pipeline-output/sessions.db)",
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
        "--delay", type=float, default=REQUEST_DELAY,
        help=f"Delay between API requests in seconds (default: {REQUEST_DELAY})",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Re-fetch inflections even for terms that already have them.",
    )
    args = parser.parse_args()

    db = sqlite3.connect(args.db)
    db.row_factory = sqlite3.Row

    # Query translations needing inflections
    where = "1=1" if args.force else "inflections IS NULL"
    # Skip multi-word terms — BÍN only handles single words
    where += " AND icelandic NOT LIKE '% %'"
    # Skip NULL icelandic
    where += " AND icelandic IS NOT NULL"

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

    print(f"Found {total} translations to process")
    if not args.execute:
        print("*** DRY RUN — add --execute to write to database ***\n")

    stats = {
        "processed": 0,
        "found": 0,
        "not_found": 0,
        "errors": 0,
        "skipped_existing": 0,
    }

    update_stmt = "UPDATE terminology_translations SET inflections = ? WHERE id = ?"

    for i, row in enumerate(rows):
        translation_id = row["id"]
        icelandic = row["icelandic"]
        english = row["english"]

        # Progress
        if (i + 1) % 25 == 0 or i == 0:
            print(f"\n[{i + 1}/{total}] Processing...")

        try:
            forms, pos_info = fetch_inflections(icelandic)
            stats["processed"] += 1

            if forms:
                stats["found"] += 1
                inflections_json = json.dumps(forms, ensure_ascii=False)
                print(f"  ✓ {icelandic} ({english}): {len(forms)} forms")

                if args.execute:
                    db.execute(update_stmt, (inflections_json, translation_id))
            else:
                stats["not_found"] += 1
                print(f"  – {icelandic} ({english}): not in BÍN")

        except Exception as e:
            stats["errors"] += 1
            print(f"  ✗ {icelandic} ({english}): error — {e}", file=sys.stderr)

        # Rate limiting
        if i < total - 1:
            time.sleep(args.delay)

    # Commit
    if args.execute:
        db.commit()
        print(f"\n✓ Changes committed to {args.db}")
    else:
        print(f"\n*** DRY RUN — no changes written ***")

    db.close()

    # Summary
    print(f"\n--- Inflection Fetch Summary ---")
    print(f"  Processed: {stats['processed']}")
    print(f"  Found in BÍN: {stats['found']}")
    print(f"  Not in BÍN: {stats['not_found']}")
    print(f"  Errors: {stats['errors']}")
    if not args.execute:
        print(f"\n  Add --execute to apply {stats['found']} inflection updates")


if __name__ == "__main__":
    main()
