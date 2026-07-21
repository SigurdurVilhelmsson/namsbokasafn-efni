# Item 17 — Licence metadata per product (design)

**Campaign:** `docs/plans/2026-07-11-pre-semester-coding-campaign.md` item 17 (Phase 4, the last coding item).
**Source posture:** `docs/provenance/openstax-cnxml-licence-provenance.md` §1 (per-book table) / §6.1 (RELABEL disposition).
**Cross-repo scouting:** `docs/handoffs/2026-07-21-item17-licence-metadata-handoff.md` (authored from a vefur session; captures both repos' licence infra so this session did not re-explore).
**Method:** brainstorming (2026-07-21, 5 lead decisions below) → writing-plans → SDD, one PR against efni, `npm test` from repo root = gate.

## 1. Context and requirement

Provenance §6.1 asks for a per-page licence footer keyed off a new `book-config.json` licence field, plus
a containment guard keeping restrictive (CC BY-NC-SA) derivatives out of CC BY aggregates. Cross-repo
scouting (handoff) found that **vefur already renders a correct, data-driven per-page licence footer** on
every section/chapter/print page (`BookAttribution.svelte`, build-gated, tested), so building §6.1's
literal footer mechanism in efni would produce a **second footer**. The requirement is therefore honored
by making `book-config.json` the canonical licence datum (§6.1's *intent*) while leaving display to vefur
(the *mechanism* wording in §6.1 is adjusted).

## 2. Decisions

### Handoff decisions (lead, 2026-07-21)
1. **Container = efni.** Item 17 runs as an efni SDD session; one PR against efni.
2. **efni emits no footer** (part b **dropped**). vefur owns the per-page licence footer. No `cnxml-render.js`
   change, no `content.css` change, no vefur change.

### Brainstorming decisions (lead, 2026-07-21)
3. **Single-source: `book-config.json` is the canonical licence.** `getBookLicence()` reads it; the inline
   `BOOK_LICENCES` map in `book-licences.cjs` is removed. There is one efni copy, so the efni "two-copy
   agreement" problem dissolves (the vefur `book.ts` copy is separate — decision 7).
4. **Field shape = nested object:** `"licence": { "code": "CC BY 4.0", "obtained": "<YYYY-MM-DD>" }`.
   The `code` keeps efni's spaced form (matches the provenance doc and the current `getBookLicence` return,
   so corpus/TM export bytes are unchanged); `obtained` is efni-only download provenance.
5. **Non-provenanced books = allowlist.** A validation test pins the 6 covered slugs (5 real + the
   `__e2e-fixture__` placeholder) against the provenance doc. `stjornufraedi` (not onboarded) and `testbook`
   (scaffold) get no `licence` field; `getBookLicence` keeps throwing for them (fail-loud at export time,
   unchanged). We do **not** fabricate a licence for un-onboarded/scaffold books.
6. **Part (c) = minimal helper + explicit disposition.** Build a pure `assertLicenceContainment()` helper +
   unit test encoding the containment rule (NOT wired to any caller — none exists yet), explicitly bless the
   added-terms export as licence-neutral (terms aren't copyrightable, per item 21 PR-B), and add a
   provenance-doc note. Not: guarding the added-terms export (contradicts PR-B); not: a wired guard with no
   consumer.
7. **Cross-repo agreement test included** (`VEFUR_CONTRACT`-gated). Both efni (new allowlist test) and vefur
   (`validateAllBookAttributions` + "no blanket CC BY") already pin to the provenance truth independently;
   the cross-repo test is belt-and-suspenders that closes the last drift surface directly.

## 3. Load-bearing findings (verified against both repos)

- **Only a test imports `BOOK_LICENCES`.** Production consumers (`tools/generate-tm.js:36`,
  `tools/export-corpus.js`, `server/routes/tm.js`) import **only** `getBookLicence`; the sole `BOOK_LICENCES`
  importer is `tools/__tests__/book-licences.test.js`. So `getBookLicence`'s internals can be rewritten with
  one test to update.
- **`book-rendering-config.js` is ESM** (`import fs`; memoized `readBookConfigFile(slug)` reading
  `books/<slug>/book-config.json` via an `import.meta.url` `REPO_ROOT`). `book-licences.cjs` is CommonJS and
  **cannot import** that ESM helper — but reading the JSON directly (`fs.readFileSync`/`require`) against a
  `__dirname`-based root is trivial and is the approach here.
- **⚠️ The two repos store the licence code in different formats.** efni provenance/`book-licences.cjs`:
  `'CC BY 4.0'` / `'CC BY-NC-SA 4.0'` (spaces). vefur `book.ts` `derivativeLicence`: `'CC-BY-4.0'` /
  `'CC-BY-NC-SA-4.0'` (SPDX hyphens). A naïve cross-repo string-equality test fails on every book. The
  agreement test **normalizes both sides** to a canonical form (strip separators + upcase, or an explicit
  2-entry map) before comparing. Corollary: `book-config.json` keeps the spaced form so `getBookLicence`'s
  return and the corpus/TM export bytes are byte-identical to today.
- **`css-contract` harness** (`tools/__tests__/css-contract.test.js`) is the cross-repo precedent to mirror:
  `vefurExists = fs.existsSync(<vefur path>)`; `requireVefur = process.env.VEFUR_CONTRACT === '1'`;
  `it.skipIf(!vefurExists)` per check; a dedicated test asserts presence when `VEFUR_CONTRACT=1`. The sibling
  vefur repo is checked out at `../namsbokasafn-vefur`, so the agreement test runs here.
- **No cross-book aggregate export exists.** corpus (`export-corpus.js`) and TM (`generate-tm.js` /
  `tm-export.cjs`) already **row-stamp** per-book licence; glossary/index/book-data are per-book. The only
  cross-book *mixer* is the item-21 added-terms export (`getAddedTerms` unfiltered = all books) — and it
  carries no licence stamp because terms aren't copyrightable.

## 4. Design

### Part (a) — `book-config.json` as the canonical licence source

**a1. Migrate 6 book-configs.** Add the nested `licence` block (decision 4) to `efnafraedi-2e`,
`liffraedi-2e`, `orverufraedi` (CC BY 4.0), `edlisfraedi-2e`, `lifraen-efnafraedi` (CC BY-NC-SA 4.0), and
`__e2e-fixture__` (CC BY 4.0 placeholder — carry over the `book-licences.cjs` comment that it is a test
fixture, not a provenance claim). Values + `obtained` dates come from the current `book-licences.cjs` rows
(themselves transcribed from provenance §1). `stjornufraedi`/`testbook` unchanged (no `licence`).

**a2. Rewrite `getBookLicence(slug)`** (`tools/lib/book-licences.cjs`, stays CommonJS):
- Reads `books/<slug>/book-config.json` against an intrinsic `__dirname` root.
- Returns `{ licence: cfg.licence.code, obtained: cfg.licence.obtained }` — unchanged contract.
- **Fail-loud:** throws a clear, actionable error (naming the book + the provenance doc) if the config file
  is missing OR has no `licence.code`. Preserves today's throw for `stjornufraedi`/`testbook`.
- Remove the inline `BOOK_LICENCES` map. Decide at plan time whether to keep a derived `BOOK_LICENCES`
  export (built by scanning book-configs) or drop it and update the one importing test; default = **drop it**
  and rewrite the test against the file-backed reader (YAGNI — no production importer).

**a3. Validation test** (`tools/__tests__/licence-book-config.test.js`, new): an explicit allowlist of the 6
covered slugs → expected `licence.code` (from provenance §1); asserts each `book-config.json` carries the
matching nested `licence`; asserts `getBookLicence` throws for `stjornufraedi`/`testbook`. Pins the *values*
so an edit can't silently mislabel a book.

### Part (a′) — Cross-repo agreement test

`tools/__tests__/licence-vefur-contract.test.js` (new), mirroring `css-contract.test.js`:
- `VEFUR_BOOK_TS = path.resolve(__dirname, '../../../namsbokasafn-vefur/src/lib/types/book.ts')`.
- `vefurExists = fs.existsSync(...)`; `it.skipIf(!vefurExists)` per assertion; a `VEFUR_CONTRACT=1`
  presence test (mirrors css-contract lines 226–239).
- Build `{ slug → derivativeLicence }` from vefur `book.ts` (parse method — regex over the source text vs
  esbuild-bundle — decided at plan time; regex is lighter and sufficient for extracting slug+derivativeLicence
  pairs).
- For each provenanced book: assert `normalize(efni licence.code) === normalize(vefur derivativeLicence)`,
  where `normalize` strips spaces/hyphens and upcases (`'CC BY 4.0'` and `'CC-BY-4.0'` → `'CCBY4.0'`).
- Fail-loud message names the book and both raw values on mismatch.

### Part (c) — Containment guard + dispositions

**c1. `assertLicenceContainment(licences)`** (`tools/lib/licence-containment.cjs`, new, CommonJS pure lib):
- Input: an array of licence codes (efni spaced form). Encodes the rule that an aggregate's effective licence
  is the **most restrictive** member, and that combining a CC BY-NC-SA member into an output labelled/treated
  as CC BY is forbidden. Exact contract (throw-on-violation vs return-most-restrictive) finalized at plan
  time; default = **throw** on an incompatible mix (fail-loud), with a helper `mostRestrictive(licences)` if
  useful. Unit test (`licence-containment.test.js`) covers: all-same → ok; CC BY + CC BY-NC-SA → violation;
  empty/unknown-code handling.
- **Not wired to any caller** — no cross-book aggregate exists. It is the encoded rule + the test a future
  aggregate must call.

**c2. Added-terms export disposition.** Add a comment at the added-terms export
(`server/routes/terminology.js` route + `server/lib/arnastofnunSeed.js`) stating it is **intentionally
licence-neutral** (terms aren't copyrightable; item 21 PR-B carries no licence stamp), and a test asserting
the seed output contains no licence field/stamp (locks the decision against a future "add a licence column"
change). Records *why* the one existing cross-book mixer is not a containment target.

**c3. Provenance-doc note.** A short §6.1 addendum: (i) mechanism adjustment — `book-config.json` is the
canonical licence datum, vefur owns the per-page footer, efni emits none; (ii) the containment invariant and
that corpus/TM already row-stamp and are unaffected; (iii) the added-terms licence-neutral disposition.

## 5. Files

**New:** `tools/lib/licence-containment.cjs`; `tools/__tests__/licence-containment.test.js`;
`tools/__tests__/licence-book-config.test.js`; `tools/__tests__/licence-vefur-contract.test.js`.
**Modified:** `tools/lib/book-licences.cjs` (rewrite `getBookLicence`, drop map);
6× `books/<slug>/book-config.json` (+`licence`); `tools/__tests__/book-licences.test.js` (rewrite);
`server/routes/terminology.js` + `server/lib/arnastofnunSeed.js` (disposition comment) + a seed
no-licence-stamp test; `docs/provenance/openstax-cnxml-licence-provenance.md` (§6.1 addendum);
`docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 17 register on ship).
**Untouched (verified):** `cnxml-render.js`, `content.css`, all vefur code, and the byte output of
`export-corpus.js` / `generate-tm.js` / `server/routes/tm.js`.

## 6. Testing

- `getBookLicence` returns the same `{licence, obtained}` from book-config for all 6 covered books; throws
  for `stjornufraedi`/`testbook` and for a book whose config lacks `licence`.
- Allowlist validation pins the 6 codes to provenance §1.
- Cross-repo agreement (skipped without vefur; runs here) with format normalization.
- `assertLicenceContainment`: same-licence ok; mixed CC BY / CC BY-NC-SA violation; edge cases.
- Added-terms seed carries no licence stamp (disposition lock).
- Full suite green from repo root; corpus/TM export tests unchanged (byte-identical output).

## 7. Out of scope (deliberate)

- The renderer-emitted per-page footer (part b — vefur owns it).
- Any vefur change.
- Guarding the added-terms export (licence-neutral by decision 6).
- Wiring `assertLicenceContainment` to a live caller (no cross-book aggregate exists — the guard lands wired
  when its first consumer is built).
- Changing the licence code format stamped by corpus/TM (stays `'CC BY 4.0'` spaced form).

## 8. Register queue (to campaign doc on ship)
- Any out-of-scope finds during implementation, per standing feedback.
- If the cross-repo test surfaces a real efni↔vefur licence disagreement, that is a provenance-integrity
  finding for the lead, not a test to loosen.
