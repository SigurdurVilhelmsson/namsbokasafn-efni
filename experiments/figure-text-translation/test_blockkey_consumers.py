#!/usr/bin/env python3
"""The block key has FOUR consumers and they must agree — measured, not asserted.

    FIGTEXT_PYLIBS=./pylibs python3 test_blockkey_consumers.py

`emit-blocks.py` decides what is BOUGHT; `compose.py` decides what is DRAWN. They look the
key up in the same dict (`TR[key]`), so a rule that differs between them buys a translation
no figure can find — a label silently left in English, with every count green. P8's own
wording is "emit and compose must agree, whoever reads", and ruling R-11 makes that one
importable function rather than four inline copies.

This file asserts the agreement END TO END, by RUNNING both programs on a real figure and
comparing the keys they actually produced — not by re-deriving the rule here and comparing
it with itself. `compose.py` is a script that draws at import time, so it cannot be
imported; its keys are read back out of the report it prints.

⚠️ It writes into the gitignored `out/` scratch directory, which is where both programs
already write. It reads artwork from the machine-local trees in `sources.local.json`, so it
FAILS (never skips) when they are absent: a skip here reads as a pass.
"""
import sys, json, ast, subprocess, tempfile, collections, os
from pathlib import Path
import _deps
from _deps import HERE, OUT
import sources as S
import figtext as FT
from blockkey import block_key

BOOK = 'efnafraedi-2e'
FIGURE = 'CNX_Chem_01_01_SciMethod'

fails = []


def check(label, ok, detail):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}: {detail}", flush=True)
    if not ok:
        fails.append(label)


def die(msg):
    """A precondition failure is a FAILURE, not a skip — an absent instrument that
    reports nothing is indistinguishable from an instrument that found nothing."""
    print(f"  FAIL  precondition: {msg}")
    print("\n1 FAILED")
    sys.exit(1)


# ── resolve the figure the same way every other tool does ───────────────────────────
cfg = S.load_config()
try:
    trees = S.load_trees(BOOK, cfg)
except Exception as exc:                                   # noqa: BLE001
    die(f"cannot load source trees ({type(exc).__name__}: {exc}) — sources.local.json")
path, edition = S.resolve(FIGURE, trees, cfg['editionPrecedence'])
if not path:
    die(f"{FIGURE} does not resolve in any tree named by sources.local.json")
print(f"figure: {FIGURE}  <- {edition}  {path}")


def run(argv, what):
    r = subprocess.run([sys.executable] + argv, cwd=str(HERE),
                       capture_output=True, timeout=600, env=os.environ)
    if r.returncode != 0:
        die(f"{what} exited {r.returncode}\n{r.stderr.decode('utf-8', 'replace')[-2000:]}")
    return r.stdout.decode('utf-8', 'replace')


# ── the EMIT side: what gets bought ─────────────────────────────────────────────────
run(['emit-blocks.py', str(path)], 'emit-blocks.py')
emit_keys = [b['key'] for b in json.loads((OUT / 'blocks.json').read_text())]

# ── the COMPOSE side: what gets drawn ───────────────────────────────────────────────
# Run WITHOUT --control and with an EMPTY translations file, so every block misses the
# `key not in TR` lookup and compose reports the key it actually looked up. --control
# never populates `missing`, so it would report nothing at all.
if not (OUT / 'artwork.png').exists():
    die(f"{OUT/'artwork.png'} is absent — run strip-text.py for {FIGURE} first "
        "(compose.py loads it before it derives a single key)")
with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as tf:
    tf.write('{"blocks": {}}')
    empty_tr = tf.name
try:
    stdout = run(['compose.py', '--translations', empty_tr], 'compose.py')
finally:
    os.unlink(empty_tr)

compose_keys, grabbing = [], False
for line in stdout.splitlines():
    if line.startswith('!!') and 'no translation' in line:
        grabbing = True
        continue
    if grabbing:
        s = line.strip()
        if not s:
            break
        compose_keys.append(ast.literal_eval(s))

# ── 1. the assertion this file exists for ───────────────────────────────────────────
# MULTISETS: a figure may legitimately carry the same key twice, and compose DRAWS both.
emit_c = collections.Counter(emit_keys)
comp_c = collections.Counter(compose_keys)
check('1 emit-side and compose-side keys are IDENTICAL on a real figure',
      emit_c == comp_c and len(emit_keys) > 0,
      f"emit {len(emit_keys)} keys, compose {len(compose_keys)} keys, "
      f"multisets equal={emit_c == comp_c}  "
      f"(+{sorted((comp_c - emit_c).items())[:3]} "
      f"-{sorted((emit_c - comp_c).items())[:3]})")

# ── 2. CONTROL: the comparison in 1 is a real constraint, not a tautology ───────────
# Derive the SAME figure's keys under the PRE-P8 rule (blank runs dropped before
# grouping). If assertion 1 could not tell two rules apart it would pass on anything.
runs = json.loads((OUT / 'runs.json').read_text())
pre_p8 = [block_key(b) for b in FT.merge_blocks(FT.group(
    [r for r in runs if r['text'].strip()]))]
differ = sorted(set(pre_p8) ^ set(emit_keys))
check('2 CONTROL — a DIFFERENT key rule produces a DIFFERENT answer',
      len(differ) > 0,
      f"the pre-P8 blank-run filter changes {len(differ)} keys on this figure: "
      f"{differ[:4]}  (if this were 0, assertion 1 would prove nothing)")

# ── 3. there is no second copy of the rule left in compose.py ───────────────────────
# Positive check, not a forbidden-token pin: a pin that forbids a token trips on the
# comment documenting the prohibition. Comment lines are stripped for the same reason.
src = '\n'.join(l for l in (HERE / 'compose.py').read_text().splitlines()
                if not l.lstrip().startswith('#'))
check('3 compose.py IMPORTS the shared rule rather than restating it',
      'from blockkey import' in src and 'block_key(' in src,
      "compose.py's key comes from blockkey.block_key")

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
