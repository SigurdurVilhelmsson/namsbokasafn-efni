# svgfix.py — §C140 blend-lerp collapse + reference-cost sentinel (scratch pre-implementation)

0 ISK. No MT call, no figure-run.js. Repo read-only: `git status --porcelain` 0 lines. Everything under `/home/siggi/dev/scratch-c140/plan/tree-svgfix/`.

## Deliverables
- `svgfix.py` — stdlib only (re, math, xml.etree.ElementTree). `collapse_blend_lerp(data: bytes) -> (bytes, report)` with report keys exactly `addOps, collapsed, useSitesRewritten, clipped, unmatched, modes` (counts are ints). `reference_cost(data) -> (log2_cost, max_depth)`. `REFCOST_WARN_LOG2 = 20`.
- `test_svgfix.py` — 28 checks, pure, 0.14 s. Hand-built bytes fixtures. The paint is HClsoln's real `filter-1`/`filter-0` paint, cut down to what the checks read, with cairo's spellings kept.
- Edits applied only in tree-svgfix: `strip-text.py`, `figure-prepare.py`. There is also an optional section 6 in `test_figure_prepare.py`.

## How it works
- **Port of the verifier** (`exo-v/fix/lerpcollapse.py`).
  - It parses with ElementTree and runs the same conjunction of semantic checks. The blend id comes from R's `filter` attribute.
  - The edit is a byte substitution of `filter="url(#F_add)"`, done in ONE regex pass.
  - Before substituting, the byte count per id is checked against the parse. A mismatch raises `ValueError` and nothing is returned half-rewritten.
- **Zero rewrites** return the same object.
- **clipped / unmatched**:
  - `clipped` means the scaffolding matches but Ma does not cover SR.
  - Anything else is `unmatched`.
  - All structural checks run before the Ma-coverage check.
- **`reference_cost`** is refgraph.py's model, run iteratively and safe on cycles.

## Unit tests and RED-first
- **Stub run:** 26 FAIL, 2 PASS. The two passes are `1a PRECONDITION` and `7d CONTROL`.
- **Implementation:** ALL PASS.
- **Mutants (11)**, each a copy, with the golden file `cmp`-identical afterwards:
  - First round: M3 (verifier check order) and M9 (defs children counted) survived.
  - I added 3d (clipped Ma + broken L) and a nested `<defs>` in 6a.
  - Second round: all 11 killed.
    - M1 assume add−1 → 1b, 1d, 5a
    - M2 clipped→unmatched → 2, 2r
    - M3 → 3d
    - M4 no cross-check → 5b
    - M5 sharing → 6a, 7a
    - M6 recursion → 6b, 6c, 6d
    - M7 no cycle guard → 6d
    - M8 → 6a, 6b, 6c
    - M9 → 6a
    - M10 → 2, 4a
    - M11 → 8 checks
- **What the tests cover:**
  - The blend id is resolved; the `filter-2` screen decoy sits at add−1.
  - Clipped: a narrow Ma rect, and the rxn3 clipPath shape.
  - Unmatched: the IcePack non-feBlend shape, and a broken L.
  - Both precedence cases.
  - Zero collapses on an inspected file (addOps 1), plus a plain SVG.
  - Two use sites.
  - Count mismatch raises.
  - Exact refgraph integers: cost 10, depth 1.
  - A 3000-deep chain: depth 3000, recursion limit unchanged.
  - A cycle.
  - A 30-lerp cairo-shaped chain: 2^33.0, collapses 30/30, then 2^5.9.

## Real data: the 34 figures, one at a time
- **Collapse, against the verifier:**
  - 31 byte-identical to input; 34/34 byte-equal to the verifier (Python compare and shell `cmp`).
  - 30 have no add filter. rxn3 has 6 add filters, all clipped.
  - Verifier add/collapsed equal mine on all 34, and verifier rejected = clipped + unmatched.

| figure | addOps | collapsed | use sites | clipped | unmatched | bytes changed | modes |
|---|---|---|---|---|---|---|---|
| exocytosis-88f6 | 158 | 155 | 155 | 3 | 0 | 155 | multiply 110, screen 45 |
| sandwich | 52 | 52 | 52 | 0 | 0 | 52 | screen 52 |
| HClsoln | 2 | 2 | 2 | 0 | 0 | 2 | multiply 2 |
| rxn3 | 6 | 0 | 0 | 6 | 0 | 0 | — |
| other 30 | 0 | 0 | 0 | 0 | 0 | 0 | — |

- **Reference cost (mine = refgraph.py subprocess on all 10 rows):**

| figure | before | after |
|---|---|---|
| exocytosis | 2^116.3881, depth 224 | 2^12.2393, depth 115 (cost 4835) |
| sandwich | 2^60.6618, depth 104 | 2^9.7797, depth 52 (cost 879) |
| HClsoln | 2^10.0954, depth 4 | 2^8.2192, depth 2 (cost 1094 → 298) |
| brain-ec0b | cost 18 (2^4.17) | cost 18 |
| map2_img | cost 18 (2^4.17) | cost 18 |

- **Timing on exocytosis:**
  - collapse 0.482 s in the loop (verifier 3.698 s); repeats [0.635, 0.75, 0.741] s
  - reference_cost repeats [0.936, 0.699, 0.718] s

### Named disagreement (spec §3)
- The spec says "2^12.4 after". The prescribed 1-byte collapse measures **2^12.24 (4835)**.
- 5291 = 2^12.4 is the spike's **V1** variant, which keeps `mask=Ma` (re-ran `v1.py` + refgraph.py: "root cost = 5291 log2 = 12.4").
- `v1b.py`'s output is byte-identical to svgfix's.
- The spec's "brain and map2: 18" is a raw cost, not a log2.

## Proof of the edits
- **Fixture** (`figure-prepare.py fixtures/fixture_figure.pdf --basename CNX_Fixture_S --out fx`):
  - exit 0; warnings `['subset font PAGE/F1']` (unchanged)
  - `svgfix.json`: `{addOps 0, collapsed 0, useSitesRewritten 0, clipped 0, unmatched 0, modes {}}`
- **HClsoln** (`/home/siggi/dev/repos/Myndir/chemistry-2e/base/Ch_04/Source_File/CNX_Chem_04_02_HClsoln.pdf`, `--out hcl`):
  - exit 0; warnings are the 3 subset-font lines
  - `svgfix.json`: `{addOps 2, collapsed 2, useSitesRewritten 2, clipped 0, unmatched 0, modes {multiply 2}}`
- **HClsoln byte change:**
  - A fresh `pdftocairo -svg` of `hcl/artwork.pdf` equals the prep input.
  - `cmp -l` shows 2 bytes: 383587 `1→0`, 458211 `3→2`. That is diff lines 1664 `filter-1→filter-0` and 1725 `filter-3→filter-2`.
  - `hcl/artwork.svg` == `cmp/mine/…HClsoln.svg`.
  - A direct strip-text run printed `svgfix: collapsed 2 of 2 blend lerp(s), 2 use site(s) rewritten, 0 clipped, 0 unmatched -> out/svgfix.json`.
- **Sentinel on real artwork:**
  - exocytosis uncollapsed → `artwork.svg reference cost 2^116.4 exceeds 2^20 — a browser may never finish loading it (see svgfix.py)`; collapsed → `[]`
  - sandwich uncollapsed → 2^60.7 warning; collapsed → `[]`
- **Error path:**
  - Count mismatch and malformed XML each give `svgfix.json {'error': …}`, the file unchanged and no `.tmp` left.
- **Test suites:**
  - `test_figure_prepare.py`, unchanged suite, on the edited tree: **62 PASS, ALL PASS**.
  - With section 6 added: 66 PASS. Against an unedited base-tree copy: 4 FAILED (6, 6a, 6b, 6c).
  - `test_figtext_out.py` ALL PASS.
  - `test_readlayer.py` and `test_figure_compose.py` fail identically by name in base-tree and tree-svgfix. Both are environmental: a missing text-coverage file (readlayer dies at case [8], so case [14] is never reached) and node deps (compose case 10).

## Decisions a plan must carry
- **Library:** raises ValueError on a count mismatch.
- **strip-text.py:**
  - It catches only (ValueError, SyntaxError). It records the error and keeps cairo's file. The sentinel still fires; any other exception is a bug and stays loud.
  - It writes `svgfix.json` on every `--svg` run.
- **figure-prepare.py:** a parse failure is a warning, not a failure. Whether it should fail prepare is open for the plan.
- **HClsoln unit test:** spec §3 lists it as a unit test, but the file is not committed. Commit a reduced fixture, or keep it as a real-data check.
- **XML parser:** the hook suggested defusedxml; the contract pins the stdlib.

## Diff — strip-text.py
```diff
--- base-tree/strip-text.py
+++ tree-svgfix/strip-text.py
@@ -24,6 +24,7 @@
 from _deps import read_content
 from _deps import OUT
 import pikepdf
+import svgfix
 
 DEFAULT_DPI = 200   # the DPI at which OpenStax rendered the published jpg
 
@@ -240,6 +241,42 @@
     return stats
 
 
+def collapse_svg(out_svg):
+    """The post-conversion pass: `svgfix.collapse_blend_lerp` over cairo's artwork.svg, in place.
+
+    cairo writes every blend-mode paint as a lerp that references everything painted so far
+    TWICE, so a figure with many of them is an exponential reference tree and a browser may
+    never finish loading it (exocytosis: 158 paints, never loads). See svgfix.py.
+
+    OUT/'svgfix.json' is written on EVERY --svg run, so "ran, nothing to collapse" can never
+    read like "did not run". artwork.svg is rewritten only when a byte changed.
+
+    ⚠️ A pass that CANNOT run - malformed XML, or a use-site byte count that disagrees with the
+    parse - is recorded in svgfix.json and printed, and artwork.svg is left exactly as cairo
+    wrote it. The collapse is an optimisation and must not turn a figure prepare accepted
+    before into a failure; it is not silent either, because figure-prepare.py's reference-cost
+    sentinel fires on an uncollapsed chain whatever happened here. Any OTHER exception is a
+    bug in svgfix.py and still fails this run.
+    """
+    import json, os
+    data = out_svg.read_bytes()
+    try:
+        fixed, report = svgfix.collapse_blend_lerp(data)
+    except (ValueError, SyntaxError) as exc:      # ElementTree.ParseError is a SyntaxError
+        fixed, report = data, {'error': f'{type(exc).__name__}: {exc}'}
+    if fixed is not data and fixed != data:
+        tmp = out_svg.with_name(out_svg.name + '.tmp')
+        tmp.write_bytes(fixed)
+        os.replace(tmp, out_svg)
+    (OUT / 'svgfix.json').write_text(json.dumps(report, indent=1))
+    if 'error' in report:
+        print(f"svgfix: NOT APPLIED, artwork.svg left as cairo wrote it - {report['error']}")
+    else:
+        print(f"svgfix: collapsed {report['collapsed']} of {report['addOps']} blend lerp(s), "
+              f"{report['useSitesRewritten']} use site(s) rewritten, {report['clipped']} clipped, "
+              f"{report['unmatched']} unmatched -> out/svgfix.json")
+
+
 def main(pdf_path, dpi=DEFAULT_DPI, svg=False):
     OUT.mkdir(exist_ok=True)
     pdf = pikepdf.open(pdf_path)
@@ -270,6 +307,7 @@
         out_svg = OUT / 'artwork.svg'
         subprocess.run(['pdftocairo', '-svg', str(out_pdf), str(out_svg)], check=True)
         print(f"artwork.svg -> out/artwork.svg ({os.path.getsize(out_svg)} bytes)")
+        collapse_svg(out_svg)
 
 
 if __name__ == '__main__':
```

## Diff — figure-prepare.py
```diff
--- base-tree/figure-prepare.py
+++ tree-svgfix/figure-prepare.py
@@ -75,6 +75,7 @@
 
 import pikepdf                                  # noqa: E402  - after the bootstrap
 from _deps import read_content                  # noqa: E402
+import svgfix                                   # noqa: E402
 
 # ⚠️ deliberately NOT `from _deps import OUT`. This tool never reads the shared output
 # directory; it passes FIGTEXT_OUT to its CHILDREN and computes its own paths from
@@ -372,6 +373,30 @@
     return warnings
 
 
+def reference_cost_warnings(svg):
+    """-> [] or ONE warning: artwork.svg's no-sharing reference cost above 2^REFCOST_WARN_LOG2.
+
+    The shape-INDEPENDENT half of the blend-chain fix. `strip-text.py` collapses cairo's
+    blend lerps by recognising cairo's exact output shape; if that shape ever changes the
+    collapse matches nothing and the exponential chain ships silently. This depends on
+    nothing but references, so it still fires. Measured with `svgfix.reference_cost`:
+    exocytosis 2^116.4 uncollapsed, 2^12.2 collapsed; brain-ec0b and map2 2^4.2 (cost 18).
+
+    A file that does not parse is a warning too, never a silent pass: this runs on EVERY
+    figure, and prepare's exit code is not changed by it.
+    """
+    try:
+        log2_cost, _depth = svgfix.reference_cost(svg.read_bytes())
+    except SyntaxError as exc:                    # ElementTree.ParseError
+        return [f'artwork.svg reference cost not computed ({type(exc).__name__}: {exc}) '
+                f'(see svgfix.py)']
+    if log2_cost > svgfix.REFCOST_WARN_LOG2:
+        return [f'artwork.svg reference cost 2^{log2_cost:.1f} exceeds '
+                f'2^{svgfix.REFCOST_WARN_LOG2} — a browser may never finish loading it '
+                f'(see svgfix.py)']
+    return []
+
+
 def prepare(artwork, out_dir, basename):
     """-> the prepare.json payload. Raises PrepareError on a per-figure failure."""
     # 🔴 A STALE artwork.svg MUST NOT BE ABLE TO SATISFY THE CHECK AT THE END OF THIS
@@ -424,7 +449,7 @@
         'imageXObjects': features['imageXObjects'],
         'paintOps': features['paintOps'],
         'formTextXObjects': features['formTextXObjects'],
-        'warnings': build_warnings(meta, features),
+        'warnings': build_warnings(meta, features) + reference_cost_warnings(svg),
     }
```

## Optional diff — test_figure_prepare.py (section 6)
The file is `cmp/test_figure_prepare.diff`, 43 added lines placed before the final print:
- `_doubling_chain(k)` builds `<g id=gi><use #g(i-1)/><use #g(i-1)/></g>`.
- **6 PRECONDITION:** the helper exists.
- **6a:** k=24 produces exactly `['artwork.svg reference cost 2^24.0 exceeds 2^20 — a browser may never finish loading it (see svgfix.py)']`.
- **6b CONTROL:** k=10 produces `[]`.
- **6c:** a fixture prepare writes `svgfix.json` with the six keys, addOps 0, useSitesRewritten 0.
