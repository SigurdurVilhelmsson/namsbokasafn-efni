# WS5 BLOCKER — OC-B (#226) reverts table-cell translations to English

**Date:** 2026-07-06. **Status:** WS5 halted at Phase 4. **Severity:** HIGH — book-wide content
regression, reaches published HTML, invisible to every tag-counting gate.
**Root cause proven by git bisect:** PR #226 (OC-B), commit `985e211d`
`fix(inject): keep direct-child container tables in place (tablesHandledInContainers) [OC-B]`.

## Symptom

Running WS5's re-inject (`cnxml-inject.js`, first re-inject since OC-A/B/E + F4 merged — those PRs
were code-only, "armed for WS5", so no `03-translated` bytes existed to expose them) reverts
`<entry>` **table cells** from their Icelandic translations back to the **English source**, plus
reverts decimal localization (`0,10` → `0.10`).

Example — m68710 (ch04), balancing table `fs-idp8525760`, identical `02-mt-output` input:

| cell | HEAD (committed, live) | WS5 re-inject (current tool) |
|------|------------------------|------------------------------|
| header | `Hvarfefni` / `Myndefni` | `Reactants` / `Products` |
| row | `Hleðsla` (charge) | `charge` |

The translations **exist** in the segment stream and are byte-identical to HEAD
(`02-mt-output/ch04/m68710-segments.is.md` line 479 `Hvarfefni`, 482 `Myndefni`, 521 `Hleðsla`;
`git diff HEAD` on that file = empty). This is **inject-addressable** — the translation sits exactly
where inject reads it — the opposite of the m68860 "translation exists somewhere ≠ inject-fixable"
case.

## Proof (git bisect on a worktree, m68710, identical input)

| commit | table headers |
|--------|---------------|
| `954ae906` (pre-inject-F4) | **Icelandic** ✓ |
| `4e3e683b` = `985e211d^` (post-F4 merged, pre-OC-B) | **Icelandic** ✓ |
| HEAD (post-OC-B `985e211d`) | **English** ✗ |

F4 (`[[TABLE:]]` inline expansion in buildExercise/Example/NoteDom) is **exonerated** — output is
still Icelandic after F4. The break is introduced by OC-B `985e211d`.

## Mechanism (hypothesis, matches all evidence)

OC-B added `ctx.tablesHandledInContainers` so a direct-child (non-inline) container table is "kept in
place" instead of being stripped + mis-placed (its order-fix goal — which it achieves: the WS5 header
is now structurally correct, `[empty] | Reactants | Products`, vs HEAD's misaligned
`Hvarfefni | Myndefni | Products`). But the in-place path appears to **emit the table from the source
`<table>` DOM without threading the translated entry-segments through** — so every `<entry>` falls
back to English source text, and numeric cells lose Icelandic decimal formatting. Structure fixed,
content regressed.

Next step for the fixer: read the `tablesHandledInContainers` registration + emit path in
`tools/cnxml-inject.js` (container builders: buildExercise/Example/Note + the standalone
`case 'table':` skip) and confirm the kept-in-place table applies `entry`-segment translations the
same way the standalone table path does.

## Blast radius (mt-preview)

- **~30 modules** with changed `<entry>` cells; **10** with a hard decimal reversion
  (`0,NN`→`0.NN`) as a clean fingerprint. Heaviest: m68789 (250 entry-line changes), m68791 (120),
  m68866 (114), m68698 (62), m68784 (60), m68786 (42), m68733 (38), m68709 (36).
- Reverted content includes headers (`Reactants`, `Products`, `Element`, `Trial`, `Compound`,
  `Balanced?`, `Rate (mol L⁻¹...)`, `Time (s)`), content words (`water`, `air`), and decimals.
- **Reaches published HTML**: `05-publication/mt-preview/chapters/12/12-exercises.html` shows
  `Rate (`×8, `Time (`×4 in English.
- **Faithful track (ch01/ch03) is NOT affected** — those modules have no affected container tables
  (`git diff HEAD` on `03-translated/faithful/**` = zero `<entry>` changes).

## Why every gate missed it

- `cnxml-fidelity-check.js` — counts tags; blind to IS-vs-EN text. (121 PERFECT, exit 0.)
- A2 residue check — did **not** flag these table headers (didn't trip the content-word floor).
- `cnxml-render-fidelity-check.js` — genuine-math-drop / image-drop = 0; shape only.
- **Only** `cnxml-render-golden.test.js` (byte-exact) caught it, and only because m68710/m68789 happen
  to be in its 7-module sample. **The gate stack has no IS→EN table-text detector.**

## Recommendation

1. **Do NOT ship WS5 in this state.** All WS5 Phase 1–4 artifacts on branch
   `chore/efnafraedi-ws5-reinject-rerender` are downstream of the bad inject and have been restored;
   the branch keeps only this audit doc.
2. **Fix OC-B `985e211d` as its own cycle** (brainstorm → plan → TDD → PR): thread entry-segment
   translations through the kept-in-place container-table path. Add a **regression test** that asserts
   a container table's translated `<entry>` cells survive (guarding IS text + comma-decimals), since
   no existing gate covers this.
3. **Consider a cheap book-wide IS→EN table-text gate** (the class that slipped through) — e.g. extend
   the residue/fidelity check to compare `<entry>` text against the translated segment, or flag
   period-decimals in `03-translated` entries.
4. **Resume WS5 from Phase 1** once the OC-B fix lands (redo re-inject → re-verify → re-render →
   regenerate the render-fidelity baseline **from the fixed render**, and re-do the F3 fidelity-allowlist
   re-triage against fixed output). The Phase-2 allowlist reconciliation done in this attempt
   (m68733 -4→-3; add emphasis known-loss-deferred for m68741/m68791/m68822/m68842; m68811 -1→+1) was
   table-independent and should re-apply, but must be re-verified.

## Provenance / reproduction

- Bisect worktree: `git worktree add --detach <tmp> 985e211d^`, symlink `node_modules`,
  `node tools/cnxml-inject.js --book efnafraedi-2e --chapter 4 --module m68710 --allow-incomplete`,
  inspect `03-translated/mt-preview/ch04/m68710.cnxml` header entries. (Worktree removed.)
- Advisor-reviewed root cause + halt decision.
