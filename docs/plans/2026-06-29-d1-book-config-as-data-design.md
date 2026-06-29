# D1 — Per-book Config as Data File + Fail-loud + `--book` Required (Design)

**Status:** approved by lead 2026-06-29, ready for implementation plans.
**Roadmap item:** D1 in [docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md](2026-06-28-pipeline-architecture-implementation-plan.md)
(Track D — cross-book onboarding; `blocks all` D work). First step of biology onboarding.
**Guiding directive:** robustness & future-proofing over expedience (plan Constraints; memory
`feedback-robustness-over-expedience`).

## Problem

Per-book config is code-resident (`tools/lib/book-rendering-config.js:48-341`, five hardcoded config
objects). Three silent-default failure modes follow:
- unknown book → `getBookRenderConfig` warns and returns SHARED-only defaults (`:350-363`);
- every tool defaults `--book` to chemistry (`parseArgs.js:23` / `BOOK_OPTION`);
- `chapter-modules.js:48-79` falls through to a hardcoded `CHEMISTRY_2E_MODULES` map.

Onboarding a new book therefore needs a code change, and a misconfigured book renders silently wrong
instead of failing. `metadata.json` exists for only `efnafraedi-2e` and is read by no code (orphaned).

## Decisions (lead, 2026-06-29)

1. **Dedicated `books/<slug>/book-config.json`** holds render config + `domain`. `metadata.json` stays a
   pure bibliographic/provenance file. *(Deviation from the plan's literal "extend metadata.json" — chosen
   for separation of operational vs bibliographic/legal concerns.)*
2. **Every committed book gets a real `book-config.json`** — the 5 production books **and** the
   test/fixture/intake books (`__e2e-fixture__`, `testbook`, `stjornufraedi` if present on main). No book
   relies on implicit defaults. Robustness rationale: `testbook` may graduate to production; a config that
   already exists and is validated makes that a no-op risk instead of a silent-default trap.
3. **`--allow-default` is fenced out of production**, not merely warned: it yields SHARED-only config for
   early-pipeline dev use, but `npm run validate` **hard-fails** a book lacking `book-config.json` and the
   render/publish path **refuses** default config. A config-less book can be extracted/MT'd mid-intake but
   cannot be rendered-for-publish or pass validation. One real code path; the escape cannot reach prod.
4. **Shipped as two PRs** (split refactor from enforcement):
   - **PR-A — mechanism** (behavior-preserving): the loader, all `book-config.json` files, `bookToDomain`
     move, config-equality tests. Render output byte-identical.
   - **PR-B — enforcement** (behavior-changing): fail-loud, `--book` required, `--allow-default` fencing,
     `chapter-modules` fallback removal, validate coverage.

## PR-A — Mechanism (behavior-preserving)

### Data model — `books/<slug>/book-config.json`
Book-specific overrides only; `SHARED_*` defaults stay in code and are deep-merged under each file:
```json
{
  "domain": "biology",
  "noteTypeLabels": { "...": "..." },
  "titleTranslations": { "...": "..." },
  "endOfChapterSections": { "...": {} },
  "excludedSectionClasses": [],
  "specialModules": {}
}
```

### Loader (`tools/lib/book-rendering-config.js`, import surface preserved)
- The five per-book **code config objects are deleted**; bodies move verbatim into the JSON files.
- `getBookRenderConfig(slug)` now: read `books/<slug>/book-config.json` → deep-merge over `SHARED_*` →
  return. **Merge semantics reproduce today's behavior exactly:** object-valued keys shallow-merge
  (`{ ...SHARED_X, ...fileValue }`, matching the current spread); array keys and `specialModules` replace.
- `bookToDomain(slug)` **moves here** from `api-translate.js:305` and reads `config.domain` (replacing the
  slug-prefix matching). `api-translate.js` imports it.
- In PR-A the loader still tolerates a missing file (returns SHARED-only with a warning) so the migration
  is behavior-preserving; PR-B flips that to fail-loud.

### Migration-fidelity gate (the safety oracle)
Before deleting a code config, snapshot it; assert `getBookRenderConfig(slug)` deep-equals the snapshot
for **all 5 production books**. If the load+merge reproduces the old code object exactly, render output is
unchanged **by construction** — a tighter, faster oracle than re-rendering. Test/fixture books get a
minimal valid `book-config.json` (no prior code config to match).

### PR-A tests
- Per-book config-equality (5 books): loaded config deep-equals the pre-migration code object.
- Loader unit: deep-merge (shared + override), array/`specialModules` replace, `domain` returned.
- `bookToDomain`: 5 known domains resolve from file; back-compat with `api-translate.js` callers.
- Full `npm test` green (esp. `cnxml-render` + pipeline-integration; output unchanged).

## PR-B — Enforcement (behavior-changing)

- **`--book` required:** `BOOK_OPTION.default` `'efnafraedi-2e'` → `null`; multi-book tools error if
  `--book` is missing or `books/<slug>/` is absent. Audit + update all **10 tools** importing `BOOK_OPTION`
  and any tests/scripts relying on the chemistry default.
- **Fail-loud config:** `getBookRenderConfig(unknownBook)` throws unless `--allow-default`; `--allow-default`
  yields SHARED-only **and** is refused by the render/publish path and failed by `validate`.
- **`chapter-modules.js`:** remove the `CHEMISTRY_2E_MODULES` fall-through; a missing `collection-order.json`
  errors clearly. Delete the dead map if unreferenced.
- **`npm run validate` coverage:** each registered book must provide a valid `book-config.json` (required
  keys) + `collection-order.json`; missing/invalid → validation failure.

### PR-B tests
- `--book` missing → error; nonexistent slug → error.
- Unknown book without `--allow-default` → throws; with `--allow-default` → SHARED-only, but render/publish
  refuses and `validate` fails.
- `chapter-modules` with no collection → clear error (not chemistry).
- `validate` fails a book missing `book-config.json`; passes when present.

## Acceptance (whole D1)

- A fresh fake book with a `book-config.json` renders; a missing config errors clearly; a forgotten
  `--book` errors instead of silently using chemistry. Every committed book has an explicit, validated
  config; no production path can run on default config.

## Out of scope (deliberate)

- Moving module order itself (already solved by `collection-order.json`).
- Renaming `book-rendering-config.js` (keep import stability; the module loads `book-config.json`).
- `metadata.json` content/schema changes (stays bibliographic).
- D2 (pre-intake probe) and the other biology-onboarding items — separate roadmap items.
