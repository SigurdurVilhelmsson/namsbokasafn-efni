"""The composer records WHICH blocks the artwork on disk was drawn from.

`renderHash` = the blocks an editor approved.  `composedHash` = the blocks the
SVG was actually composed from.  effectiveState() reports 'approved' only when
the two agree, which is what stops "approved" from describing text that is not
in the published image.

🔴 THE COMPOSER MUST NEVER COMPUTE A HASH.  computeRenderHash is JS (sha256 over
the composer version, then each sorted key and value, NUL-separated).  A second
implementation here would be two implementations of one rule in two languages,
and CLAUDE.md requires such a pair to be proved equal ON THE CORPUS.  Copying
the value sidesteps that entirely: there is nothing to disagree with.  The
`implausible value` check below is what enforces it - a recomputing
implementation cannot pass it.

⚠️ NOT run by `npm test` and NOT run in CI (both are node-only).  Run it by hand:

    python3 test_composed_hash.py
"""
import json
import sys
import tempfile
from pathlib import Path

from figtext import stamp_composed_hash

fails = []


def check(label, got, want):
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {label}: {got!r}")
    if not ok:
        print(f"        wanted: {want!r}")
        fails.append(label)


# The EXACT bytes writeSidecar() produces: JSON.stringify(data, null, 1) plus a
# trailing newline.  Anchored on the JS side too - figure-text-sidecar.test.js
# asserts writeSidecar emits this same literal - so the two languages agree on
# one constant rather than on two format implementations.
JS_WRITTEN = (
    '{\n'
    ' "version": 1,\n'
    ' "basename": "CNX_Chem_01_06_TempScales",\n'
    ' "state": "approved",\n'
    ' "renderHash": "0123456789abcdef",\n'
    ' "composerVersion": "1",\n'
    ' "blocks": {\n'
    '  "Boiling point of water": "Suðumark vatns"\n'
    ' }\n'
    '}\n'
)


def tmpfile(text):
    p = Path(tempfile.mkdtemp()) / 'CNX_T.is.json'
    p.write_text(text, encoding='utf-8')
    return p


# --- it copies, and it copies the RIGHT field -------------------------------
p = tmpfile(JS_WRITTEN)
returned = stamp_composed_hash(p)
after = json.loads(p.read_text(encoding='utf-8'))
check('returns the stamped value', returned, '0123456789abcdef')
check('composedHash equals renderHash', after['composedHash'], after['renderHash'])
check('renderHash itself is untouched', after['renderHash'], '0123456789abcdef')
check('blocks are untouched', after['blocks'], {'Boiling point of water': 'Suðumark vatns'})

# --- it COPIES rather than COMPUTES -----------------------------------------
# 'not-a-hash-at-all' is not a sha256 prefix and cannot be produced by hashing
# anything.  Any implementation that recomputed instead of copying fails here.
p = tmpfile(JS_WRITTEN.replace('0123456789abcdef', 'not-a-hash-at-all'))
stamp_composed_hash(p)
check('copies an implausible value verbatim',
      json.loads(p.read_text(encoding='utf-8'))['composedHash'], 'not-a-hash-at-all')

# --- a plain translations.json has no renderHash and must be left alone ------
plain = '{\n "blocks": {\n  "Celsius": "Selsíus"\n }\n}\n'
p = tmpfile(plain)
check('returns None when there is no renderHash', stamp_composed_hash(p), None)
check('leaves such a file byte-identical', p.read_text(encoding='utf-8'), plain)

# --- byte discipline: the sidecar is COMMITTED and reviewed as a diff --------
# Python's json.dumps defaults to ensure_ascii=True, which would rewrite every
# Icelandic character as á and turn a one-field stamp into a whole-file
# diff.  The instrument must therefore look at every line, not at a count.
#
# ⚠️ A RAW line diff cannot do it: inserting a key makes the line BEFORE it gain
# a trailing comma, so a one-key stamp shows up as two added lines and one
# removed one.  Normalising the punctuation away first is what makes the
# remaining difference mean "a key was added" and nothing else.
#
# ⚠️ And the earlier draft of this check compared `removed` against a FILTER OF
# ITSELF, which can only ever pass.  A comparison whose two sides come from one
# token proves nothing — the failure mode CLAUDE.md names for gates.
def norm(text):
    return [l.strip().rstrip(',') for l in text.splitlines() if l.strip().rstrip(',')]


p = tmpfile(JS_WRITTEN)
stamp_composed_hash(p)
before, after = norm(JS_WRITTEN), norm(p.read_text(encoding='utf-8'))
check('exactly one line added, and it is the stamp',
      [l for l in after if l not in before], ['"composedHash": "0123456789abcdef"'])
check('no line removed or rewritten', [l for l in before if l not in after], [])
check('Icelandic survives unescaped', 'Suðumark' in p.read_text(encoding='utf-8'), True)
check('trailing newline kept', p.read_text(encoding='utf-8').endswith('}\n'), True)

# KEY POSITION is part of the contract, not cosmetics.  BOTH writers touch this
# file — Python stamps it here, and applyApprovedFigureEdits rewrites it whole
# on the next approval.  If they disagree about where the key goes, every
# alternation churns the committed diff.  Directly after renderHash, in both.
keys = list(json.loads(p.read_text(encoding='utf-8')).keys())
check('composedHash sits directly after renderHash',
      keys[keys.index('renderHash') + 1], 'composedHash')

# --- idempotence: composing twice is normal and must not churn the file ------
p = tmpfile(JS_WRITTEN)
stamp_composed_hash(p)
once = p.read_text(encoding='utf-8')
stamp_composed_hash(p)
check('a second stamp changes nothing', p.read_text(encoding='utf-8'), once)

print('\nALL PASS' if not fails else f'\n{len(fails)} FAILED')
sys.exit(1 if fails else 0)
