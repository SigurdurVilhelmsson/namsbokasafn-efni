#!/usr/bin/env python3
"""C4b compares MULTISETS, and a real figure proves why — ruling R-13.

    FIGTEXT_PYLIBS=./pylibs python3 test_c4b_multiset.py

A duplicate block key is the COMMON case, not an edge one: 2,052 duplicates across 245 of
530 figures in the harness's own baseline run. `compose.py` iterates BLOCKS and looks up
`TR[key]` for each, so two blocks sharing a key are BOTH drawn. A candidate reader that
produces one where the baseline produced two therefore leaves a label **undrawn** — and
the key SET is unchanged, so the set compare C4b used to do reported nothing at all.

The assertions below are run against a REAL figure's real block keys, not a hand-made
Counter, because the claim being tested is about the corpus as much as about the code: if
no figure carried a duplicate, the multiset would be a distinction without a difference.
Assertion 1 is what makes the rest non-vacuous, and it fails loudly if the corpus moves.

⚠️ Reads artwork from the machine-local trees in `sources.local.json`, so it FAILS rather
than skips when they are absent — a skip reads as a pass.
"""
import sys, collections
import _deps
import sources as S
import read_layer_accept as R

BOOK = 'efnafraedi-2e'
# A .pdf, so it is staged with no ghostscript step: 3 blocks, of which two share a key.
# Chosen as the SMALLEST duplicate-bearing figure in the full baseline run, so a failure
# here is readable rather than buried in 179 duplicates (CNX_Chem_06_04_Econtable).
FIGURE = 'CNX_Chem_08_01_N2LewStru_img'

fails = []


def check(label, ok, detail):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}: {detail}", flush=True)
    if not ok:
        fails.append(label)


def die(msg):
    print(f"  FAIL  precondition: {msg}")
    print("\n1 FAILED")
    sys.exit(1)


cfg = S.load_config()
try:
    trees = S.load_trees(BOOK, cfg)
except Exception as exc:                                   # noqa: BLE001
    die(f"cannot load source trees ({type(exc).__name__}: {exc}) — sources.local.json")
path, edition = S.resolve(FIGURE, trees, cfg['editionPrecedence'])
if not path:
    die(f"{FIGURE} does not resolve in any tree named by sources.local.json")

with R.staged(path) as (src, stage_err):
    if stage_err:
        die(f"staging {FIGURE} failed: {stage_err}")
    runs, meta, outcome = R.read_baseline(src)
if outcome != 'reads':
    die(f"the baseline does not read {FIGURE} ({outcome}: {meta.get('error')}) — "
        "this test needs a figure whose keys actually exist")

recs, base_keys, kerr = R.block_records(runs, meta)
if kerr:
    die(f"block-key derivation raised on {FIGURE}: {kerr}")
print(f"figure: {FIGURE}  <- {edition}  ({len(recs)} blocks, "
      f"{len(base_keys)} distinct keys)")

# ── 1. NON-VACUITY: the corpus really does carry duplicate keys ─────────────────────
dups = {k: n for k, n in base_keys.items() if n > 1}
check('1 the figure genuinely carries a DUPLICATE block key',
      bool(dups),
      f"{sum(n - 1 for n in dups.values())} duplicate occurrence(s): "
      f"{ {k: n for k, n in list(dups.items())[:3]} }  "
      "(without this, every assertion below tests nothing)")
if not dups:
    print("\n1 FAILED")
    sys.exit(1)
twin = sorted(dups)[0]

# ── 2. THE FINDING: a lost twin is a real loss, and the multiset sees it ────────────
lost_twin = base_keys.copy()
lost_twin[twin] -= 1
added, dropped = R.key_delta(base_keys, lost_twin)
check('2 a candidate that drops ONE of two identical blocks is REPORTED',
      dropped == [(twin, 1)] and added == [],
      f"dropped={dropped}  added={added}  "
      f"(compose.py would have drawn {base_keys[twin]} labels and now draws "
      f"{lost_twin[twin]})")

# ── 3. THE CONTROL: the set compare it replaced is blind to exactly that ────────────
# This is the defect stated as an executable fact. If this assertion ever fails, the
# multiset change has stopped being necessary and assertion 2 has stopped being a finding.
set_added = sorted(set(lost_twin) - set(base_keys))
set_dropped = sorted(set(base_keys) - set(lost_twin))
check('3 CONTROL — the SET compare reports NOTHING for that same loss',
      set_added == [] and set_dropped == [],
      f"set() compare: added={set_added} dropped={set_dropped} — silent, which is why "
      f"C4b could pass a reader that leaves a label undrawn")

# ── 4. the other direction, with multiplicity ───────────────────────────────────────
gained_twin = base_keys.copy()
gained_twin[twin] += 2
added, dropped = R.key_delta(base_keys, gained_twin)
check('4 an ADDED duplicate is reported with its multiplicity, not merely as present',
      added == [(twin, 2)] and dropped == [],
      f"added={added}  dropped={dropped}")

# ── 5. it still DISCRIMINATES: a clean compare must be empty ────────────────────────
# Without this, a key_delta that always returned something non-empty would pass 2 and 4.
added, dropped = R.key_delta(base_keys, base_keys.copy())
check('5 an IDENTICAL candidate reports no difference at all',
      added == [] and dropped == [],
      f"added={added}  dropped={dropped}  (a comparator that always fires is not a "
      f"comparator)")

# ── 6. a genuinely new key is still seen — the set compare was not wrong, only blind ─
novel = base_keys.copy()
novel['ÉG ER EKKI LYKILL'] = 1
added, dropped = R.key_delta(base_keys, novel)
check('6 a wholly NEW key is reported as added',
      added == [('ÉG ER EKKI LYKILL', 1)] and dropped == [],
      f"added={added}  dropped={dropped}")

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
