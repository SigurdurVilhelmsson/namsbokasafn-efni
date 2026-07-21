# Handoff — Campaign item 17 (licence metadata per product)

**Date:** 2026-07-21 · **Authored from:** a namsbokasafn-vefur session (cross-repo scouting)
**For:** the efni session that will execute item 17 · **Status:** scoped + two lead decisions made; ready for `brainstorming → writing-plans → SDD`.

This handoff exists so the efni session does **not** re-do the cross-repo exploration. It captures the
current state of licence infrastructure in *both* repos, the two decisions the lead made 2026-07-21, and
the resulting reduced scope. Authoritative posture source: `docs/provenance/openstax-cnxml-licence-provenance.md`
§1 (per-book table) / §6.1 (RELABEL disposition).

---

## The two decisions (lead, 2026-07-21)

1. **Container = efni.** Item 17 runs as an efni SDD session (spec in `docs/superpowers/specs/`, one PR
   against efni, `npm test` from repo root = gate). The old efni-memory hint "likely relaunch in vefur"
   is **superseded** — see decision 2 for why.

2. **Footer mechanism = keep vefur's footer; efni emits NONE.** §6.1 literally says the per-page footer
   should be "keyed off a new book-config.json licence field" and rendered on published pages. Scouting
   found that **vefur already renders a correct, data-driven per-page licence footer** on every
   section/chapter page + print (attribution + NC + SA for Organic/Physics; plain attribution for the 3
   CC BY books), with a build gate and a "no blanket CC BY" test. Building the literal §6.1 mechanism would
   put a **second footer** beside vefur's. The lead chose to keep vefur as the footer owner and have efni
   emit nothing. §6.1's *intent* (correct labels + book-config as the canonical licence datum) is honored
   via decision-2's scope below; the *mechanism* wording in §6.1 is the part being adjusted.

   → **Scope part (b) "renderer emits a per-page licence footer" is DROPPED.** No `cnxml-render.js` change,
   no `content.css` change, no vefur render change.

---

## Reduced scope for item 17

| Part | Status | Work |
|---|---|---|
| (a) canonical `licence` field in `book-config.json` + agreement with `book-licences.cjs` | **BUILD** | efni |
| (b) renderer-emitted per-page footer | **DROPPED** (decision 2) | — |
| (c) licence-aware containment guard on aggregate/combined exports | **BUILD** (preventive) | efni |

---

## Current state — do not rebuild these

### efni (where the work is)
- **`tools/lib/book-licences.cjs`** — plain map `BOOK_LICENCES` (slug → `{licence, obtained}`) + `getBookLicence(slug)`
  which **throws** on unknown slug (fail-loud). Real books: `efnafraedi-2e`/`liffraedi-2e`/`orverufraedi` =
  **CC BY 4.0**; `lifraen-efnafraedi`/`edlisfraedi-2e` = **CC BY-NC-SA 4.0**; `__e2e-fixture__` = CC BY 4.0
  (documented test placeholder). Header comment already anticipates item 17: *"Campaign item 17 will move
  licence metadata into book-config; until then this file is the single swap point."*
  Consumers: `export-corpus.js:26,229`, `generate-tm.js:36,67`, `server/routes/tm.js:14,53` (+ their tests).
- **`books/<slug>/book-config.json`** — exists for **8** slugs (`edlisfraedi-2e`, `efnafraedi-2e`,
  `liffraedi-2e`, `lifraen-efnafraedi`, `orverufraedi`, `stjornufraedi`, `testbook`, `__e2e-fixture__`).
  **No `licence` field in any of them today.** Read by `tools/lib/book-rendering-config.js:69`
  `readBookConfigFile()` (memoized) → `getBookRenderConfig()` (:117); already loaded into the render path
  (`cnxml-render.js:63/:3230/:4077`), `preintake-probe.js:57`, `cnxml-render-fidelity-check.js:417`.
- **Aggregate/combined exports** (relevant to part c): `generate-glossary.js`, `generate-index.js`
  (subject index / atriðisorðaskrá), `merge-glossary.js`, `export-corpus.js` (**already row-stamps
  licence** via `getBookLicence`, manifest carries `licence`/`licenceObtained`/`provenance`),
  `generate-tm.js` + `tools/lib/tm-export.cjs` (**already licence-stamped**: TMX prop + CSV col + JSON
  manifest), `generate-book-data.cjs --all` (writes separate per-book JSON). **Every one is per-book —
  no cross-book licence mixing exists today.** The one cross-book *mixer* is the Árnastofnun added-terms
  export (`server/services/terminologyService.js:1600 getAddedTerms` → `server/lib/arnastofnunSeed.js` →
  route `server/routes/terminology.js:287`): optional `book`/`subject` filters, so unfiltered = all books
  combined; HEAD_EDITOR-gated. **But it exports terms, and terms aren't copyrightable** (established in
  item 21 PR-B — the added-terms seed deliberately carries *no* licence stamp) → almost certainly **not a
  containment target**; confirm this framing with the lead rather than guarding it reflexively.
- **`cnxml-render.js`** has **5 independent full-document builders** (`:797 buildHtmlDocument`,
  `:2523 renderCompiledSummary`, `:2761 renderSingleTypeExercises`, `:2859 renderCompiledExercises`,
  `:3086` template path) and emits **no** footer. Only relevant if (b) were pursued — it isn't.

### vefur (the footer/display owner — LEAVE IT ALONE)
- Canonical per-book licence data: `src/lib/types/book.ts` (`derivativeLicence` per book — **matches
  `book-licences.cjs` exactly**). Descriptors: `src/lib/data/licences.ts` (`LicenceDescriptor` with
  `nonCommercial`/`shareAlike`/`notices`/`restrictiveness`, `getLicence` fail-loud, `mostRestrictive`,
  `validateAttribution`).
- Per-page footer: `src/lib/components/BookAttribution.svelte` (mounted on section page
  `…/[sectionSlug]/+page.svelte:451` and chapter page `…/[chapterSlug]/+page.svelte:195`, shown in print);
  `LicenceBadge.svelte` on catalogue/book-home/colophon; colophon route `/[bookSlug]/leyfi`; print
  colophons under `src/routes/print/`.
- Build gate: `scripts/validate-content.js` → esbuild-bundles `book.ts` → `validateAllBookAttributions()`,
  exit 1 on any problem. "No blanket CC BY 4.0" enforced by `src/lib/data/licences.test.ts` (R6-1).
- The efni-rendered HTML in `static/content/` carries **no** licence footer; `content.css` has **no**
  licence/colophon classes. Attribution is 100% vefur-side at display time.

**Cross-repo fact:** `book-config.json` is **not** synced to vefur (sync only rsyncs `05-publication/` +
the provenance summary). So vefur will keep reading its own `book.ts`; there is **no runtime path** for
vefur to read efni's book-config. Any "book-config ↔ book.ts agreement" is a **build/test-time invariant
across three copies**, not a runtime dependency.

---

## Design questions for the efni brainstorming to resolve (do NOT pre-decide here)

**Part (a):**
- **Single-source vs pinned-parallel-copy.** §6.1 says "book-licences.cjs stays the corpus-export map…
  the two must agree." Cleanest: make `book-config.json` the source and have `getBookLicence()` *read*
  book-config (JSON is trivially requireable from the `.cjs`), collapsing two copies to one. Alternative:
  keep both and add an agreement test. Decide during brainstorming. (Whichever way: the corpus/TM export
  callers of `getBookLicence` must keep working unchanged — pin them.)
- **Field shape.** `book-licences.cjs` rows are `{licence, obtained}`. Match that in book-config (a
  `licence` object/field with the code + obtained date), or licence-code-only? Values come from
  provenance §1.
- **Non-provenanced books.** `book-config` exists for 8 slugs but only **5** have provenance/licence
  (`stjornufraedi` = not onboarded, no provenance; `testbook` = scaffold; `__e2e-fixture__` = test
  placeholder already in book-licences.cjs). Define the "must agree" rule for these — e.g. require a
  licence only for provenanced books and make the reader/guard tolerate/skip the rest, or add explicit
  entries. Fail-loud on a real book missing a licence.
- **Agreement with vefur `book.ts`.** Cross-repo, so not a plain efni unit test. Precedent exists: the
  `css-contract` test runs from efni against vefur files under `VEFUR_CONTRACT=1`. Optional stretch;
  the load-bearing testable pair is book-config ↔ book-licences.cjs (both in-repo).

**Part (c):**
- Since no cross-book aggregate exists, the guard is **scaffolding for a future one** + documenting the
  invariant. Likely shape: a small reusable `assertLicenceContainment(books)` / "all-same-licence-or-fail"
  helper, plus deciding *where* it's wired. Candidates: a test/lint that any future cross-book aggregate
  must call it; and an explicit disposition of the added-terms export (recommend: bless as
  licence-neutral because terms aren't copyrightable — confirm with lead). corpus + TM already row-stamp
  and are explicitly unaffected per §6.1.

---

## Method reminder
Campaign standing workflow: `superpowers:brainstorming` → `writing-plans` → SDD, one PR, `npm test` from
efni repo root as the gate (no branch protection — local test is authoritative). Log out-of-scope finds
to this item's register + memory per standing feedback. Item 17 is the **last Phase-4 coding item**.
