# B2 — Producer-provenance routing for inject (design)

**Date:** 2026-06-30
**Item:** B2 (re-scoped `isApiTranslated` routing/provenance fix) — the sole remaining
biology-onboarding gate.
**Plan:** `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` § B2 (line ~170)
+ provenance prereq (lines ~182-185) + biology onboarding (~406).
**Probe (prereq, done):** `docs/audit/2026-06-30-b2-isapitranslated-misroute-probe.md`.
**Principle:** robustness over expedience — one real code path, fail loud, no escape hatch to prod.

---

## 1. Problem & goal

`cnxml-inject.js:3330` infers translation provenance by **content-sniffing**:

```js
const isApiTranslated = [...segments.values()].some(
  (s) => s.includes('{{i}}') || s.includes('{{b}}') ||
         s.includes('{{term}}') || s.includes('{{fn}}'));
```

`extract` emits **bracket** markers (`[[i:]]`/`[[b:]]`) today, so the `{{i}}`/`{{b}}` clauses are
dead and the sniff effectively reduces to *"does this module contain a `<term>` or `<footnote>`?"*
Any term/footnote-free module is classified `!isApiTranslated` and pushed through web-UI
marker-repair (`restoreSupersubMarkers`/`restoreMediaMarkers`/`restoreNewlines`, `:3352-3374`).

The probe measured this on biology: **50/259 (19%)** source modules are term+footnote-free → would
mis-route; **49/259** are mis-route **and** media-bearing (the structural danger zone). Corruption on
*current* API content is zero only incidentally (the API doesn't currently drop MEDIA/BR markers).

**Goal:** route the restores on **recorded producer provenance**, not on content bytes. The change is
probe-proven behavior-preserving on all current content, so it lands as a clean, low-risk refactor.

## 2. Provenance sidecar — the recorded signal

A per-module JSON file co-located with each `mNNNNN-segments.is.md` in `02-mt-output`:

```
books/<book>/02-mt-output/ch05/m66372-provenance.json
{
  "schemaVersion": 1,
  "tool": "api-translate",
  "generatedAt": "2026-06-30T12:34:56.000Z"
}
```

- **Granularity:** per-module (co-located with the artifact it describes). Robust to a single module
  being re-translated independently (`api-translate --module`) — a per-chapter record could desync.
- **`tool`** ∈ `{ "api-translate", "docx-import" }` — the only decisive field. (`web-import` is *not*
  a value because the `/import-mt` route is retired in §6.)
- **`generatedAt`** — informational only (uses real wall-clock at producer runtime; this is a tool, not
  a workflow script, so `Date` is available).
- **Policy mapping** (explicit lookup, in the provenance lib):
  `api-translate → 'warn'`, `docx-import → 'mutate'`. **Any other `tool` value → throw** (no guessing).

### New module: `tools/lib/provenance.js`
Small, single-purpose, independently testable:

| Export | Behavior |
|---|---|
| `writeProvenance(mtOutputChapterDir, moduleId, { tool })` | Writes `<moduleId>-provenance.json`. Validates `tool` is known. |
| `readProvenance(mtOutputChapterDir, moduleId)` | Returns the parsed object, or `null` if the file is absent. Throws on malformed JSON or unknown `tool`. |
| `restorePolicyFor(tool)` | `'warn'` \| `'mutate'`; throws on unknown `tool`. |

The lib owns the filename convention and the tool→policy map so producers and the consumer can't drift.

## 3. Producers stamp on write

- **`api-translate.js`** — `translateFile` writes the `.is.md` at `:577` and already copies a per-module
  `-links.json` sidecar right after. Add `writeProvenance(outputDir, moduleId, { tool: 'api-translate' })`
  in the same place. (Derive `moduleId` from the output filename, as the links-copy already does.)
- **`docx-import.js`** — writes per-module `.is.md` files at `:824` inside `writeSegmentFiles`. Stamp
  `writeProvenance(outputDir, moduleId, { tool: 'docx-import' })` per module. Its per-chapter
  `import-report.json` is unchanged (kept as the human-facing alignment report).

## 4. Consumer — inject resolves provenance, not markers

In `loadModuleInputs` (`:3174`) the chapter/module/`chapterDir` are all in hand. Resolve provenance by
**always reading from `02-mt-output`** (the MT origin), independent of which track (`sourceDir`) is being
injected — faithful/localized content derives from the same MT origin, so its restore behavior is a
property of that origin, not of the edited copy.

Replace the `isApiTranslated` sniff (`:3330`) and the `if (!isApiTranslated)` gate (`:3352`) with a
resolved `restorePolicy`:

| Situation | `restorePolicy` |
|---|---|
| `02-mt-output/<ch>/<mod>-provenance.json` present | `restorePolicyFor(tool)` (`'warn'` or `'mutate'`) |
| provenance absent **but** `02-mt-output/<ch>/<mod>-segments.is.md` exists | **throw** — fail loud: name the module + path, point to `tools/backfill-provenance.js` |
| no `02-mt-output` segments for the module at all (human-authored faithful/localized) | `'warn'` — logged "no MT origin — treating as human-authored" |

The third row is a *defined* branch, not a guess: absence of any MT segment file is positive evidence the
content was authored directly (e.g. a recreated front-matter module). Not exercised by current content
(all faithful modules today have an MT origin) but specified so inject never crashes on it.

### Restore functions become policy-aware
`restoreSupersubMarkers`, `restoreMediaMarkers`, `restoreNewlines` take the policy (or are gated by it):

- `'mutate'` (docx): identical to today's `!isApiTranslated` branch — compare EN/IS and **mutate**.
- `'warn'` (api-translate / human-authored): compare EN/IS, **log any delta, do not mutate**.

`restoreMathMarkers` (`:3377`) and `restoreTermMarkers` (`:3341`) are **untouched** — they run for both
branches today and are not part of the routing bug. The math-detection upstream-move is logged
out-of-scope (§8).

> **Mis-stamp detector (free safety net):** if the backfill ever wrongly labels a web-uploaded legacy
> module `api-translate`, the `'warn'` policy logs "would have restored N markers" rather than silently
> skipping — a mis-stamp surfaces loudly instead of corrupting content.

## 5. One-time backfill — `tools/backfill-provenance.js --book <book>`

Stamps existing `02-mt-output` content (which predates the sidecar):

- For each `02-mt-output/chNN`: if `import-report.json` present → stamp every module `docx-import`;
  else → stamp `api-translate`.
- **Idempotent:** skip any module that already has a provenance sidecar.
- Per-book; uses `requireBook` like the other tools. Commit the resulting sidecars (content under
  `books/` is committed).
- **Evidence basis:** `/import-mt` is orphaned + unused (not UI-wired; retired in §6); the only docx
  chapter project-wide is liffraedi ch03 (has `import-report.json`). The `'warn'` mis-stamp detector
  (§4) catches any wrong stamp at the next inject.

## 6. Retire `/import-mt`

Delete the orphan upload route `POST /api/books/:bookId/chapters/:chapter/import-mt`
(`server/routes/books.js:618`) and its tests. Rationale: not UI-wired, Matecat-era, unused, and an
un-stamped producer that would otherwise undermine the provenance guarantee. Reduces live producers of
`02-mt-output` to two (`api-translate`, `docx-import`). Re-addable later *with* provenance baked in if
external-MT upload is ever wanted again.

## 7. Testing & acceptance

- **Unit (`provenance.test.js`):** write→read round-trip; `readProvenance` returns `null` on absent;
  throws on malformed JSON; throws on unknown `tool`; `restorePolicyFor` map + unknown→throw.
- **Producers:** `api-translate` stamps `api-translate` on write; `docx-import` stamps `docx-import`
  per module.
- **Inject routing:** module with `api-translate` provenance → restores do **not** mutate (warn only);
  module with `docx-import` provenance → restores **mutate** (parity with today's `!isApiTranslated`).
- **Backfill:** docx chapter → all modules `docx-import`; non-docx chapter → `api-translate`;
  idempotent (second run no-ops).
- **Fail-loud:** `02-mt-output` segments present + provenance absent → inject throws with a message
  naming the module and the backfill tool.
- **★ Behavior-preservation gate (the headline acceptance):** after backfill, **re-inject every existing
  module across all books and assert byte-identical CNXML** vs the committed `03-translated`. The probe
  already showed ch05 m66372 is byte-identical; docx ch03 is unchanged because its restores still mutate.
  This is the C0-style golden guarantee that B2 is a pure refactor. Implement as a vitest over the
  existing books (mirrors `cnxml-dom-comparison.test.js`).
- **Route retirement:** `/import-mt` no longer mounted; its specs removed/adjusted.
- **Gate:** local `npm test` green (CI is red until ~Jul 1, no branch protection — local is authoritative).

## 8. Out-of-scope (logged to the plan's register)

- **`restoreMathMarkers` upstream-move** to `api-translate.js` (per-segment `[[MATH:N]]` count check) —
  the plan's B2 note; a separate, math-pipeline concern. Defer to its own item.
- **`/import-mt` retirement** is *in* B2 (discovered during this design) — worth one register line as a
  found-and-fixed un-stamped producer.

## 9. Files touched

| File | Change |
|---|---|
| `tools/lib/provenance.js` | **new** — write/read/policy helper |
| `tools/api-translate.js` | stamp `api-translate` after `:577` write |
| `tools/docx-import.js` | stamp `docx-import` per module in `writeSegmentFiles` |
| `tools/cnxml-inject.js` | replace sniff (`:3330`) + gate (`:3352`) with resolved policy; make the 3 restores policy-aware |
| `tools/backfill-provenance.js` | **new** — one-time backfill CLI |
| `server/routes/books.js` | delete `/import-mt` route (`:618`) |
| `tools/__tests__/provenance.test.js` + routing/backfill/byte-identical specs | **new** |
| server specs referencing `/import-mt` | remove/adjust |
