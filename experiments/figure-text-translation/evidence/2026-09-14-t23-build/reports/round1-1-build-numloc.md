# §C140 ⑨ scratch pre-implementation: numloc.py, the is_identity widening, test_numloc.py, parity vitest

Cost: 0 ISK. No MT, no figure-run.js. Nothing was written under the repo: `git status --porcelain` printed 0 lines. `find <repo> -newer <first scratch write> -not -path '*/.git/*'` listed only the `.git` directory entry, and that mtime comes from my own `git status`. `find .git -maxdepth 1 -newer` found nothing inside `.git`, and `.git/index` is dated 2026-09-13 21:43.

Every python command ran with `PYTHONDONTWRITEBYTECODE=1`. The tree has no `__pycache__`.

## Tree
Directory: `/home/siggi/dev/scratch-c140/plan/tree-numloc`, a copy of base-tree.

`diff -rq base-tree tree-numloc` shows only:
- `figtext.py` differs
- new: `numloc.py`, `test_numloc.py`, `figure-consistency-parity.test.js`

Test runs had created `out/` in the tree and vitest had created `node_modules/.vite`. Both were removed.

## Headline
| what | measured |
|---|---|
| fixture | B1: 211 rows / 342 instances (= stated). B2: 77 values / 385 instances (= stated). B1 splits 202 converted / 9 left. |
| test_numloc.py | 31 checks, ALL PASS, exit 0, 47 ms. Loads no cairo, pdfplumber, PIL or readlayer. |
| RED-first | Every check fails under at least 1 of 13 stubs. The checks that pass under the identity stub are exactly the 17 the docstring names. |
| real data, 34 figures | 35 kept runs change: 7/7/7/9/5, all ch03, `.`→`,` only. The value multiset equals c9's. One separator line is left: `H2, Raney Ni`. |
| kept / identity vs the composer's own record | Equal on 34/34 (191 kept, 7 identity). The widening moved 0 classifications. |
| does the widening do anything? (planted) | 37 blocks: identity under widened 37, under the old code 0. English-as-value control: 367/367 under both. |
| parity vitest | 173 pairs, 3 tests pass. Red under 4 variants. |
| existing experiment tests | Same failing set by name before and after (10, all environmental). |

## numloc.py (full, as shipped)
```python
"""§C140 ⑨ - Icelandic number separators for figure labels DRAWN IN ENGLISH.

    import numloc
    numloc.localize('26.98')                         # -> '26,98'
    numloc.localize_runs(['2', '8', '.', '1', ' g'])  # -> ['2', '8', ',', '1', ' g']

The source is always US-formatted and Icelandic INVERTS both separators, so a kept label
`26.98` is drawn `26,98` and `1,000` is drawn `1.000` - as the chapter text and the June
figures already do. Rule R3 of `evidence/2026-09-13-t23/reports/c9-decimal.md` §7, on ONE
LINE of text:

1. a line holding a coordinate pair (`(10.0, 19.5)`) is left alone - a comma decimal inside a
   comma-separated pair is ambiguous, and changing the `,` is an editorial decision;
2. every thousands group becomes a period, ACROSS ALL GROUPS (`1,000,000` -> `1.000.000`);
3. every `.` flanked by digits becomes `,`;
4. a line that is then exactly a bare overprint fragment `\\d+\\.` (`0.`) has its `.` made `,`,
   so the fragment agrees with the label it overprints.

Left alone by construction: a leading point (`.625 g`), a trailing sentence point (`Br2.`),
locants (`1,2-dichloroethane` - a thousands group needs three digits) and `N2, H2`.

The regexes are copied VERBATIM from the instrument that measured the rule
(`instruments/c9/rules_eval.py`: `TH`, `r2_line`, `TUPLE`, `r3_line`), except that the
fragment test is applied to the line (c9 applied it to the block key; for a one-line fragment
block the two are the same string, and rule 2/3 cannot turn a non-fragment into one).

🔴 NOT IDEMPOTENT ON THREE-DECIMAL VALUES: `1.008 -> 1,008 -> 1.008`, because `1,008` IS a
US thousands group. So this runs ONLY on source run text read from `runs.json`, never on
text that may already be localised - an MT reply, an editor's value, or its own output.

🔴 WHY `localize_runs` WORKS ON THE LINE, NOT ON EACH RUN: a PDF may set a number one glyph
per run (`CNX_Chem_03_02_moles-6296` draws `28.1 g Si` as `2`,`8`,`.`,`1`,...), and no run
on its own holds a digit-flanked point. The line is joined, localised, and cut back at the
original run lengths - which is sound only because every substitution is one character for
one character. `localize` asserts that.

⚠️ DO NOT REUSE the chapter's `mathml-to-latex.js` `localizeNumberFull`: it corrupts
multi-group values (`1,000,000` -> `1.000,000`).

⚠️ `\\d` here is Python's Unicode digit class, where the review panel's JavaScript
(`tools/lib/figure-consistency.cjs`) is ASCII-only. They differ only on non-ASCII decimal
digits, of which the chemistry figure census holds none.

Imports NOTHING from the experiment: the standard library's `re` only.
"""
import re

# Stands in for a thousands comma while step 3 rewrites points. It must never occur in the
# input, or step 2's un-substitution would turn a real one into a period; `localize` returns
# such a line unchanged rather than guess.
_PH = '⠀'

# ── copied verbatim from instruments/c9/rules_eval.py ────────────────────────────────────
TH = re.compile(r'(?<![\d.,])\d{1,3}(?:,\d{3})+(?=(?:\.\d+)?(?![\d,]))')
TUPLE = re.compile(r'\d\.\d+\s*,\s*[–−-]?\d')
_DIGIT_FLANKED_POINT = r'(?<=\d)\.(?=\d)'
_FRAGMENT = r'\s*\d+\.\s*'
_POINT_AFTER_DIGIT = r'(?<=\d)\.'
# ─────────────────────────────────────────────────────────────────────────────────────────


def _r2_line(t):
    """Digit-flanked decimal point -> ',' and ALL thousands groups -> '.' (c9's `r2_line`)."""
    t = TH.sub(lambda m: m.group().replace(',', _PH), t)
    t = re.sub(_DIGIT_FLANKED_POINT, ',', t)
    return t.replace(_PH, '.')


def localize(text):
    """Rule R3 on ONE line of source text -> the same line with Icelandic separators.

    Returns a string of exactly `len(text)` characters (asserted): only `.` and `,` are ever
    exchanged, one for one, so whitespace and every other character stay where they were.
    A line containing the internal placeholder U+2800 is returned unchanged.
    """
    if _PH in text:
        return text
    if TUPLE.search(text):            # coordinate tuple "(10.0, 19.5)": leave for a human
        return text
    out = _r2_line(text)
    if re.fullmatch(_FRAGMENT, out):   # overprint fragment "0." -> "0,"
        out = re.sub(_POINT_AFTER_DIGIT, ',', out)
    assert len(out) == len(text), (text, out)
    return out


def localize_runs(texts):
    """`localize` one LINE given as its runs' texts -> the runs' new texts, same lengths.

    `texts` are the raw `run['text']` values of one `figtext.lines()` line, in order. They are
    joined, localised as one line, and split back at the original lengths, so a number set
    one glyph per run is found and each changed character lands in the run that drew it.
    """
    texts = list(texts)
    out = localize(''.join(texts))
    pieces, i = [], 0
    for t in texts:
        pieces.append(out[i:i + len(t)])
        i += len(t)
    return pieces
```

**Was the regex copy really verbatim?** `verify_copy.py` reads the regex strings out of the Python syntax tree (so a comment cannot fake a match) in all three files: `rules_eval.py`, `r2dec.py` and `numloc.py`.
- It found 5 regex patterns in `rules_eval.py`'s TH, r2_line, TUPLE and r3_line.
- `r2dec.py` holds the same 5. `numloc.py` is missing none.
- Control: the 2 patterns of `r2coded_line` are reported as missing from `numloc.py`, as they should be.
- `VERDICT ok`.

## figtext.py diff (full)
```diff
--- base-tree/figtext.py
+++ tree-numloc/figtext.py
@@ -3,6 +3,7 @@
 no assumption that text is centred, and lines are split on the text NORMAL so
 rotated blocks work the same as horizontal ones."""
 import math, json, re
+import numloc   # stdlib-only sibling (§C140 ⑨); imports nothing from this experiment
 
 def proj(r):
     """distance along the text normal (which line of the block a run sits on)"""
@@ -212,10 +213,31 @@
 
     Callers decide identity only AFTER the empty/whitespace check: an empty value is
     `missing`, never identity.
+
+    🔴 A TOKEN ALSO MATCHES ITS LOCALISED FORM (§C140 ⑨). Each whitespace token of the value
+    may equal the English token OR the same token of `numloc.localize(english)` - only the
+    ENGLISH side is localised, token by token, so a value mixing both forms is identity too.
+    WHY: every kept label is drawn with `numloc`'s separators, and the review panel offers
+    `Nota` on a numeric identity reply (`373.15 K` -> `373,15 K`). Without this, an editor
+    accepting that suggestion turns the block into a TRANSLATION, and the composer re-lays on
+    the layout path English it can draw run-exact - undoing E's fix for exactly that label, to
+    reach the text it would have drawn anyway. `localize` exchanges only `.` and `,`, so the
+    English and localised token lists always have the same length.
+    ⚠️ NEVER LOCALISE THE VALUE: `localize` is not idempotent (`1,008` -> `1.008`), and the
+    value may already be Icelandic.
+    ⚠️ `english` is localised as ONE string where the composer localises each drawn LINE, so
+    a coordinate-tuple or fragment guard can see a different span (a two-line `0.` / `x`
+    block converts its fragment when drawn and not here). Measured on the 14,962-block
+    chemistry census: 0 blocks whose token lists differ between the two.
     """
     shaped = normalise_block_value(value, arc)
     text = shaped if arc else ' '.join(shaped)
-    return text.split() == english.split()
+    got, sent = text.split(), english.split()
+    if got == sent:
+        return True
+    local = numloc.localize(english).split()
+    return (len(got) == len(sent) == len(local)
+            and all(g == s or g == l for g, s, l in zip(got, sent, local)))
```
Every existing docstring sentence is kept. The claim about the 14,962-block census is measured:
- Instrument: `scope_diff2.py`.
- 772 blocks' English changes under `localize`; 0 blocks differ between the block-level and per-line forms.
- Planted controls through the same comparison: a two-line `0.` / `x` block and a tuple split across two lines. Both are reported (2 of 2).

## test_numloc.py
The file is in the tree at `/home/siggi/dev/scratch-c140/plan/tree-numloc/test_numloc.py` and follows the repo test style.

**Fixture.** The B1 and B2 literals were generated once by `parse_fixture.py` and are not parsed at test time. Extra named cases:
- the §7 hazard strings
- the 7 real moles-6296 lines

**Output (exit 0):**
```
  PASS  0a NON-VACUITY the fixture is every row of B1 (211) and every value of B2 (77): B1=211 B2=77
  PASS  0b B1 holds 202 lines R3 converts and 9 it leaves: 202 / 9
  PASS  1a every B1 line R3 CONVERTS gives the census R3 output (202): []
  PASS  1b every B1 line R3 LEAVES is returned unchanged (9): []
  PASS  1c every B2 periodic-table value gives its census R3 output (77): []
  PASS  2a every thousands group becomes a period: 1,000,000 -> 1.000.000 (not localizeNumberFull's 1.000,000): '1.000.000'
  PASS  2b groups and a decimal in one number: 1,234,567.8 -> 1.234.567,8: '1.234.567,8'
  PASS  2c a coordinate pair (10.0, 19.5) is left whole: '(10.0, 19.5)'
  PASS  2d a leading point .625 g is left: '.625 g'
  PASS  2e a bare overprint fragment 0. becomes 0,: '0,'
  PASS  2f a trailing sentence point after a digit is left (Br2.): ['Br2.', 'with an excess of Br2.']
  PASS  2g locants are left (1,2-dichloroethane and the other six of c9 §7): []
  PASS  2h formula lists are left (N2, H2 · H2, Raney Ni · CO2, H2O, O2,): ['N2, H2', 'H2, Raney Ni', 'CO2, H2O, O2,']
  PASS  3a a line already holding the placeholder U+2800 is returned unchanged: '1,000⠀'
  PASS  3b CONTROL the same line with a space in its place IS converted: '1.000 '
  PASS  4a localize preserves the length of every fixture string (311): []
  PASS  5a a run-split line ['2','8','.','1',' g Si'] converts the point in its own run: ['2', '8', ',', '1', ' g Si']
  PASS  5b the 7 real moles-6296 lines, one glyph per run, each convert their point run: []
  PASS  5c CONTROL localising each glyph run ALONE changes none of them - why the unit is the line: []
  PASS  5d each run keeps its length, an empty run included: ['1', '', ',5', ' g']
  PASS  6 NOT IDEMPOTENT, a documented hazard (spec §2): 1.008 -> 1,008 -> 1.008 - a "fix" that makes this idempotent changes the rule and must show up here: '1,008' -> '1.008'
  PASS  7a a localised numeric reply is identity: 373,15 K for 373.15 K
  PASS  7b ... a different number is not: 373,15 K for 373.16 K
  PASS  7c a legacy LIST value, localised, is identity
  PASS  7d a legacy LIST value, plain, is still identity (E's case)
  PASS  7e tokens are decided one by one: 12,01 and 1.008 for 12.01 and 1.008
  PASS  7f only the ENGLISH side is localised: 1.2-dichloroethane is not identity for 1,2-dichloroethane
  PASS  7g an arc value is widened the same way: 26,98 for 26.98
  PASS  7h a changed token count is never identity: 373,15 for 373.15 K
  PASS  8a numloc.py imports nothing but re: ['re']
  PASS  8b CONTROL the same scan sees figtext.py import numloc: ['json', 'math', 'numloc', 're', 'readlayer']

ALL PASS
```

## RED-first (red_matrix.final.txt)
No file in the tree was mutated:
- Numloc stubs and `is_identity` mutants are seeded in memory through `sys.modules` + `runpy`.
- Three variants need different files on disk and run on a copy in `numloc-work/red/`.
- Every stub exits 1. `checks never red under any stub: []`.

**Under the identity stub:**
- 14 checks fail: 1a 1c 2a 2b 2e 3b 5a 5b 5d 6 7a 7c 7e 7g.
- 17 pass vacuously: 0a 0b 1b 2c 2d 2f 2g 2h 3a 4a 5c 7b 7d 7f 7h 8a 8b. The harness confirms this equals the list in the test docstring.

**What makes each vacuous check fail:**

| check(s) | fails under |
|---|---|
| 1b, 2c | swap-all, naive-decimal, no-tuple-guard |
| 2d, 2f, 2g, 2h, 5c | swap-all |
| 3a | swap-all, no-placeholder-guard |
| 4a | length-changing |
| 7b | token-count-only |
| 7d | joins-list-without-space |
| 7f | swap-all, localises-value, token-count-only |
| 7h | no-length-check |
| 8a | numloc-imports-figtext |
| 8b | base-tree figtext |
| 0a, 0b | fixture-row-dropped |

**Check 6** is red under identity (its first half) and under naive-decimal (its second half).

**Before the widening:** base-tree `figtext.py` with the real numloc makes 7a, 7c, 7e, 7g and 8b fail.

## Real data (realdata.out.txt)
**Setup.** Kept is decided exactly as `compose.py` decides it, using the widened `is_identity`. The result is checked against each figure's own `compose-report.json`:
- keys match, `runExact` matches, `identity` matches
- `problems: none` on 34/34
- 191 kept, 7 identity, none of them numeric
- sidecar values that are not str: 0

**CHANGED KEPT RUNS: 35.** Each is run#0 of a single-run block:
- alsulfatemass: 26.98 32.06 16.00 53.96 96.18 192.00 342.14
- aspirin: 12.01 1.008 16.00 108.09 8.064 64.00 180.15
- chloroform: 12.01 1.008 35.45 12.01 1.008 106.35 119.37
- glycinemass: 12.01 1.008 14.007 24.02 5.040 14.007 75.07 16.00 32.00
- saltMass: 22.99 35.45 22.99 35.45 58.44

**Checks on that list:**
- Per figure: 7/7/7/9/5. This matches r2-build and c9; no difference to name.
- Chapters touched: 03 only.
- Every change is `.`→`,` only: True.
- The value multiset equals `c9-matches.jsonl`: True.
- c9's grouping gives the identical list.
- Arc blocks carrying a digit next to a separator: none.
- Kept lines with a separator: 36; left unchanged: 1 (GreenChem `H2, Raney Ni`).

**Positive control.**
- Sidecar values that already carry a comma decimal are exactly two, both translated rather than kept, and absent from the change list:
  - etheneBr `12,85`
  - ethene `9,55`
- The same `localize_runs` instrument does change their English runs: `12.85`→`12,85` and `9.55`→`9,55`.

**Planted widening check.**
- 37 blocks: localised value counts as identity 37/37 with the widened code, 0/37 with base-tree.
- English value as identity: 367/367 under both.

## Parity vitest
**File.** In the tree:
- The module path is the single constant `CONSISTENCY_MODULE`. It is currently an absolute path; in the repo it becomes `'../lib/figure-consistency.cjs'`.
- `PLAIN_DECIMAL` has 173 pairs: 96 from B1 and 77 from B2. It is identical, in order, to the Python subset.
- Tests: NON-VACUITY (length 173, unique), per-pair exact suggestion, and a BOUNDARY test (`1,000,000` → `[]`).
- Formatted with the repo's `.prettierrc`: `prettier --check` passes.
- ESLint with the repo config is clean, and a planted control shows it really lints the file.

**How I ran it.** The repo's vitest binary by absolute path, with `--root` set to the scratch tree. Output:
```
 RUN  v4.1.10 /home/siggi/dev/scratch-c140/plan/tree-numloc
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

**Red variants:**
- stub returning `[]`: 173 mismatches, exit 1
- stub treating `\d+\.\d{3}` as thousands: 19 mismatches, exit 1
- stub converting thousands: the BOUNDARY test fails
- one fixture row dropped: `to have a length of 173 but got 172`

## Existing experiment tests, before vs after (by name)
The failing set is identical before and after: 10 checks, none new, none fixed. All are environmental in a scratch copy:
- `test_blockkey_consumers`: `out/artwork.png` is absent.
- `test_figure_compose` section 10 (8 checks): the driver's node module is not resolvable outside the repo.
- `test_make_fixture` 1: not a git repo.

`test_readlayer.py` crashes with `FileNotFoundError text-coverage-efnafraedi-2e.json` after 22 passes, in both runs. Checks after the crash did not run on either side.

The only new checks are test_numloc's 31.