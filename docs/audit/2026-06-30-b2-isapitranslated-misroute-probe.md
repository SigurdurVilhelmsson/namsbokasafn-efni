# B2 diagnostic probe — `isApiTranslated` mis-routing blast radius

**Date:** 2026-06-30
**Item:** B2 (re-scoped `isApiTranslated` routing/provenance fix) — the sole remaining
biology-onboarding gate. Plan: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`
§ B2 (line ~170) + biology onboarding (line ~406).
**Method:** probe-first (the session pattern). Read-only / self-reverting; working tree clean after.

## Question

`cnxml-inject.js:3330` infers translation provenance by **content-sniffing** for legacy markers:

```js
const isApiTranslated = [...segments.values()].some(
  (s) => s.includes('{{i}}') || s.includes('{{b}}') ||
         s.includes('{{term}}') || s.includes('{{fn}}'));
```

`!isApiTranslated` then runs three web-UI repair functions (`restoreSupersubMarkers`,
`restoreMediaMarkers`, `restoreNewlines`, `:3352-3374`). The plan's hypothesis: biology is a
"low-marker book" that the sniff mis-routes. **Two questions:** (Q1) how many biology modules
mis-route, and (Q2) does the mis-routing actually corrupt content?

## Findings

### The sniff effectively keys on `{{term}}`/`{{fn}}` only
`cnxml-extract.js` emits the **bracket** forms `[[i:]]`/`[[b:]]` today, not `{{i}}`/`{{b}}`. So the
`{{i}}`/`{{b}}` clauses are dead, and the sniff reduces to *"does this module contain a `<term>` or
`<footnote>`?"* **Any term-free, footnote-free module mis-routes.**

### Q1 — mis-routing is common, not rare
Counted directly from `01-source` across **all 259** biology modules:

| metric | count |
|---|---|
| term-free **and** footnote-free → **would mis-route** | **50 / 259 (19%)** |
| media-bearing | 257 / 259 |
| **structural danger zone** (mis-route **and** media-bearing) | **49 / 259 (19%)** |

50 is a **floor**: `{{term}}`/`{{fn}}` are the lossy legacy family (plan item B4; ~2.3% legacy API
loss vs ~0% for brackets). A module with a few EN terms that the API drops in translation flips
*from* correctly-routed *to* mis-routed — so the live mis-route count is `≥ 50`. (B1's all-types
matrix did include `{{term}}`/`{{fn}}` and saw 100% survival on its small sample, so per-run loss is
low — but not guaranteed, and B1 itself recorded a prior run's deterministic hyphen-in-id mangling,
proving the API *can* mangle markers.)

### Q2 — corruption blast radius on current API content is **zero** (but incidentally so)
Only ch05 (5 modules) is API-translated biology content today (ch03 is **docx-imported** — has
`02-mt-output/ch03/import-report.json` — where `!isApiTranslated` and the restores are *intended*,
not a bug). Of ch05's 5 modules, **1 mis-routes: m66372** (the term-less chapter intro); the other 4
are saved only because they carry `{{term}}` markers.

For m66372, proven harmless three independent ways:
1. **Trigger counts all zero** — EN and IS both have `[[MEDIA:]]=0 [[BR]]=0 [[sup:]]=0 [[sub:]]=0`.
   The restores fire only when EN>IS (MEDIA/BR) or IS>EN (sup/sub), so they **provably no-op**.
2. **Real-code run** — `cnxml-inject.js --chapter 5 --verbose` emitted **none** of the three
   mis-route-only restore notes for m66372. (The `sup: 30→35` note is on m66375, which is
   *correctly* routed — that's the known annotation-overcount fidelity effect, unrelated.)
3. **Byte-identical** — re-injecting m66372 produced output identical to the committed CNXML
   (`git diff --quiet` exit 0).

Across current **API** content the structural danger zone is **0** (m66372 carries no droppable
markers). The 49-module danger zone is the *future* exposure: once biology's term-free, media-bearing
chapters are API-translated during onboarding, each mis-routes **and** carries a `[[MEDIA:N]]` the
blind-append `restoreMediaMarkers` ("appends with no alignment", plan B2) could misplace **if** the
API ever drops it.

## Conclusion → implication for B2

The probe **inverts the plan's framing a fourth time this session**, but in a specific way:
mis-routing is **real and common** (≥19% of biology), yet its corruption today is **inert** —
because the API currently preserves MEDIA/BR markers and the lossy `{{term}}` family happens to
survive. **That inertness is incidental, not guaranteed** — exactly the fragility class
`feedback-robustness-over-expedience` says to eliminate.

So B2 is **not an active-corruption emergency** and does not block onboarding on a
"biology-is-corrupted-today" basis — **but it must still ship as designed (producer provenance), not
as a sniff-patch.** The payoff of the probe is the *opposite* of "defer": it proves the
provenance-routing swap is **behavior-preserving on all current content** (m66372 byte-identical), so
B2 lands as a clean, low-risk refactor rather than a risky behavior change. A sniff-patch (e.g.
"treat marker-less as API") would re-encode the same content→provenance conflation and is rejected.

**B2 scope confirmed (plan § B2 prereq):** stamp producer provenance into `02-mt-output` (mirror
docx's `import-report.json` at `api-translate.js:577/649`), replace the sniff at
`cnxml-inject.js:3330`, downgrade the three restores to **warn-only** for API content (keep them
mutating only for the provenance-gated docx population).

## Re-runnable commands

```bash
# Q1 — structural danger zone across all 259 source modules
cd books/liffraedi-2e
for f in $(find 01-source -name 'm*.cnxml' | sort); do
  t=$(grep -cE '<term[ >]|<footnote[ >]' "$f"); m=$(grep -cE '<media[ >]' "$f")
  [ "$t" -eq 0 ] && [ "$m" -gt 0 ] && echo "DANGER $(basename "$f")"
done | wc -l        # → 49

# Q2 — real-code run; watch for "stripped excess sup" / "Restored [[MEDIA:N]]" / "Restored ... newline"
node tools/cnxml-inject.js --book liffraedi-2e --chapter 5 --source-dir 02-mt-output --verbose
git checkout -- books/liffraedi-2e/03-translated books/liffraedi-2e/translation-errors.json
rm -f books/liffraedi-2e/residue-report.mt-preview.json   # probe is non-destructive
```
