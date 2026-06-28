## Live Erlendur (Málstaður) re-characterization — 2026-06-28

Run via controlled probe harness (scratchpad), ~546 ISK total (~$4). Outputs in scratchpad/probe-out.
**Headline: Erlendur is now dramatically cleaner than the 2026-02 bug report. The elaborate
marker-restoration machinery appears largely redundant — a major simplification opportunity.**

### Tests & results

1. **`{{SEG}}` bulk-stripping bug (docs/erlendur-bug-report.md) — FIXED.**
   Re-ran the exact original fixture `m68724-segments(b).en.md` (19.6KB, 155 `{{SEG}}` markers),
   3×. Result every run: **155/155 markers preserved**. The historical failure (50/92 stripped in
   lines 1–149 of large files) is gone. Only residual anomaly: **1 marker** had a hyphen inserted
   into its module id (`{{SEG:m68724:...}}` → `{{SEG:m6-8724:...}}`) — the exact case
   `repairSegTags()` already handles (api-translate.js).

2. **Determinism — CONSISTENT.** The single hyphen anomaly occurred at the *same* marker (input
   line 7) in all 3 runs. Mangling is deterministic, not haphazard → reliably detectable/repairable.

3. **Inline-marker matrix — 100% survival, count + content.** A synthetic payload covering every
   marker type, 2×: `[[i:]] [[b:]] [[sub:]] [[sup:]] [[link:|url]] [[xref:label|id]] [[xref:id]]
   [[docref:doc#id]] [[MATH:N]] [[MEDIA:N]] [[BR]] {{term}}…{{/term}} {{fn}}…{{/fn}}` + `<!-- SEG -->`
   all preserved both runs. **Content integrity confirmed**: `[[link:the periodic table|https://…]]`
   → `[[link:lotukerfið|https://…]]` (link text translated, URL + delimiters intact); xref label
   translated, id preserved.

4. **Real files — no loss.** `m68866` (4.8KB): 85 SEG + 28 `[[sub:]]` + 36 `[[sup:]]` + 33 `[[MATH:]]`
   all preserved. Organic-chem excerpt (newer format): all markers preserved.

5. **Historically-lossy `[[BR]]`/`[[MEDIA:N]]` — now 20/20.** Stress payload (20 segments each ending
   `…[[BR]]…[[MEDIA:N]]`): 20/20 BR, 20/20 MEDIA, all numeric indices intact (vs historical ~2-3% loss).

6. **Truncation threshold — gone at 38KB.** Single 38KB send (214 SEG markers) via async endpoint:
   **214/214 preserved, tail present, no truncation** (historical truncation was ~33-35KB). Current
   chunking (`splitAtSegBoundaries`, 25KB) is over-conservative.

### Implications for the roadmap (API hardening + simplification)

- **Retire/downgrade most restoration heuristics.** `restoreNewlines`, `restoreMediaMarkers`,
  `restoreMathMarkers`, `restoreSupersubMarkers`, `restoreTermMarkers` were built for a much worse
  API. Recommend converting them from fragile *repair* heuristics to cheap **validate-and-warn**
  (detect divergence, log, don't guess) — removing significant complexity and a class of
  injection-time bugs.
- **Relax chunking.** Raise/remove the 25KB split or rely on async for large modules — fewer API
  calls, simpler reassembly. Re-measure the real ceiling before committing.
- **KEEP:** `repairSegTags` (hyphen-in-id persists, deterministic), `assertNoControlChars`
  (degree-sign→NUL corruption is a separate *content* issue, not marker survival), `validateMarkers`
  count check (cheap; also catches the hyphen case).
- **Legacy `{{SEG}}` vs `<!-- SEG -->`:** both now survive; the HTML-comment format remains the
  safer default, no need to revert.

### Caveats (honest scope)

- Sample sizes are modest (largest single-type N: 36 `[[sup:]]`, 33 `[[MATH:]]`, 20 BR/MEDIA, 214 SEG).
  Rare (<1%) failure modes wouldn't show. **Before deleting restoration code, run a full-chapter
  re-translation and diff marker integrity end-to-end** as the real gate.
- Marker survival ≠ translation fidelity. The `translation-errors.json` discrepancies (emphasis/para
  loss) are partly extraction/nested-structure issues, independent of API marker survival.
- Tested EN→IS on the production endpoint with the project key; behavior could differ with glossary
  enabled (not isolated here) — worth a glossary-on vs -off check during the validation run.
