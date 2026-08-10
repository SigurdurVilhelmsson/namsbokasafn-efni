# tools/capture-bin-golden.py
"""
Captures the B4b-0a differential golden from the UNMODIFIED Python implementation.

⚠️ MUST be run BEFORE tools/fetch-bin-inflections.js exists. Re-running it after
the port would certify the new implementation against itself and destroy the
oracle — there is no observable difference between a correct golden and a
worthless one. (Same rule as tools/../server/scripts/capture-c24-golden.js.)

⚠️ Stores SHA-256 HASHES, never the forms themselves: the values are BÍN-derived
(CC BY-SA) and this repository is public. A hash is fully discriminating for a
differential test and carries no BÍN bytes.

`null` means the Python returned None. That is DISTINCT from a hash of "[]" and
the distinction is load-bearing — see the port's getInflections.

Run: python3 tools/capture-bin-golden.py
Captured at commit: 6193e1a4fbe58faf5f8ebc719bb27bd0e89e10f3
"""
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fetch_bin_inflections import load_bin_data, get_inflections  # noqa: E402

CSV = HERE / "data" / "SHsnid.csv"
WORDS = HERE / "__tests__" / "fixtures" / "bin-golden-words.txt"
OUT = HERE / "__tests__" / "fixtures" / "bin-golden-hashes.json"

if not CSV.exists():
    sys.exit(f"REFUSING: {CSV} not found. Download SHsnid.csv first.")

inflection_map = load_bin_data(CSV)
words = [w for w in WORDS.read_text(encoding="utf-8").split("\n") if w != ""]
print(f"words: {len(words)}")

golden = {}
found = missing = 0
for w in words:
    forms = get_inflections(inflection_map, w)
    if forms is None:
        golden[w] = None
        missing += 1
    else:
        payload = json.dumps(forms, ensure_ascii=False)
        golden[w] = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        found += 1

OUT.write_text(json.dumps(golden, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
               encoding="utf-8")
print(f"  found: {found}\n  not in BÍN (null): {missing}")

# A golden with no misses would never exercise the None path; one with no hits
# proves nothing at all. Both are worthless in different directions.
if found == 0 or missing == 0:
    sys.exit("REFUSING: a golden with zero hits or zero misses proves nothing.")
