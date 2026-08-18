<!-- FROZEN DESIGN RECORD — banner-dated 2026-08-17. Per CLAUDE.md § One source of truth this is
     EVIDENCE, never status. Open work lives in the active register (§C93). If this disagrees with
     the register, THE REGISTER WINS. Numbers are marked [M]/[D]/[E] inline. -->

# C93 — the licence-keyed `01-source` refresh guard

## Invariant

**A refresh may replace bytes only with identically-licensed bytes, in a book whose recorded licence
is on a closed refreshable allowlist, at paths on a closed write allowlist, recording the superseded
state append-only.** Four conjunctive, fail-closed conditions. **Corollary: this tooling can never
change a book's licence posture.**

⚠️ **This gate does not replace CLAUDE.md's three-step written consent, which is unconditional and
applies to every book regardless of licence.** The gate converts an *accident* into an impossibility;
consent governs the *deliberate* act.

## Placement — no new tool

`server/services/openstaxFetcher.js` is **not** extended: it keys on OpenStax collection slugs
(`organic-chemistry`), not ours (`lifraen-efnafraedi`), it is a *structure* fetcher, and it lives in
AGPL `server/` — an MIT `tools/` import would add an MIT→AGPL edge (CLAUDE.md gap E-2).

| Action | File |
|---|---|
| **create** | `tools/lib/source-refresh-policy.cjs` — the gate. CJS, mirroring `source-manifest.cjs`. |
| modify | `tools/download-source.js` — call the gate; parse `<md:license>`; write v2 manifest + `previous`; **fix the delete-prescribing error message**. |
| modify | `tools/lib/source-manifest.cjs` — read v2; honour `localOrigin`. |
| modify | `tools/generate-source-manifest.js` — **mint-only**; licence-accurate `note`. |
| modify | 4 test files + `server/routes/admin.js` (409 reason) — see *Test plan*. |

**Path resolution.** The gate reads `path.join(sourceDir, '..', 'book-config.json')` — the sibling of
the directory being written — **not** `book-licences.cjs`'s repo-root lookup. Three reasons: the
licence that governs the bytes you are about to overwrite is the one recorded beside them; it is
intrinsic, per CLAUDE.md's never-`cwd()` rule; and **the write target *is* the identity**, so no
caller can name one book and write another. *Declared out of model, consistent with F2: a caller who
can also edit that sibling `book-config.json` is outside the threat model.*

## The four gates

**G1 — book gate. `assertRefreshable(sourceDir)`. Arity 1. No options object, no `force`, no env var
— there is nothing to pass.**

```js
const REFRESHABLE = new Set(['CC BY-NC-SA 4.0']);   // closed allowlist, EXACT match
```

Allowlist, not denylist: a denylist fails open on a typo, a new book, or a missing config. **Do not
normalise, lowercase or regex the string** — an unrecognised value refuses, and the fix is a
reviewable edit to `book-config.json`, never a looser matcher. CC BY, absent (`stjornufraedi`,
`testbook`) and malformed land in the same refusal.

**G2 — vintage gate.** `.source-info.json` must exist and carry a `commitHash`, and the new upstream
commit must differ from it. Absent → refuse: **there is nothing to record as the OLD commit.**
⚠️ `efnafraedi-2e` has no `.source-info.json` [M] — protected by G1 anyway, but this is why G2 is a
gate and not a warning.

**G3 — licence-identity gate.** Parse `<md:license url=…>` from the **freshly fetched**
`collections/<name>.collection.xml`, map the URL through a closed enum, and require exact equality
with G1's code. **Differ in EITHER direction → refuse, write nothing, print both.**

This is the subtlest gate. **G1 keys on the recorded licence, which describes the OLD bytes, while
authorising a write of NEW bytes whose licence is unknown until fetched.** Without G3 the allowlist
*self-poisons*: an upstream NC-SA→CC BY flip would pull CC BY bytes into a book still recorded as
NC-SA, and the *next* refresh would destroy an irrevocable CC BY copy. The other direction (NC-SA→ND
or worse) would silently strip our derivatives of the right to exist. An unrecognised URL refuses.

*Evidence this is the right element:* the provenance doc §2 establishes that per-module `index.cnxml`
carries **no** `<md:license>` in any revision and the **collection** metadata governs throughout
(2026-06-24). `download-source.js` already downloads and parses that file **before** calling
`organizeSourceFiles`, so **G3 fits the existing seam with no restructuring.**
⚠️ **UNKNOWN, and it must be settled before G3 is built:** nobody re-measured that upstream
`collection.xml` still carries `<md:license url=…>` today — no raw collection XML exists locally
(`find books -name '*.collection.xml'` → **0**, control `collection-order.json` → **5** [M]).
**Settle it with one fetch** of `collections/organic-chemistry.collection.xml` at a named upstream
sha. *(§C92 measured the URL as unchanged at `8917713c` — that measurement is the fetch, so if it is
carried forward, G3's premise is already evidenced for organic at that sha.)*

**G4 — write-set gate. THIS IS THE ONE OWNER OF "WHAT A REFRESH MAY TOUCH".** The write set is a
**closed allowlist**: `chNN/*.cnxml`, `appendices/*.cnxml`, **`media/*`**, and the three named
metadata files (`.source-info.json`, `.source-manifest.json`, `collection-order.json`). **Everything
else under `01-source/` is unreachable because it is not on the list** — which is what protects
`docx/` (**273** tracked files [M]) and `exercises/` (**1,961** tracked files [M]), both outside
`computeFiles`' `*.cnxml` walk and therefore outside every hash gate [M].

`localOrigin` is then a **carve-out within** that allowlist, accepting file paths **and directory
prefixes**, for bytes that did not come from upstream:

```json
"localOrigin": [
  { "path": "ch00/m68662.cnxml",
    "reason": "re-authored from the lead's CC BY-era Word export; does not exist upstream",
    "evidence": "docs/provenance/openstax-cnxml-licence-provenance.md §1" },
  { "path": "docx/", "reason": "CC BY-era Word export; the sole provenance basis for m68662" },
  { "path": "exercises/", "reason": "resolve-os-embed.js cache; download-source.js never restores it" }
]
```

▶ **This is how a book that IS refreshable is still protected.** The gate is book-agnostic: organic
could acquire a hand-built module tomorrow. **The refresher never deletes** — it copies over — and
`localOrigin` paths are never written and are **reported** in the run summary.

## Manifest v2 — supersede, never regenerate

The laundering step today is that any tree can be made green by re-minting. Closed two ways:

1. **`generate-source-manifest.js` becomes mint-only** — refuses when a manifest already exists.
   `--all` then mints only for books that lack one, i.e. **a no-op on today's tree** [M: 5 of 5
   present]. **No standalone regenerate/`--supersede` verb is added.** If your tree drifted, the fix
   is `git checkout` of the source, not a new manifest.
   🔴 **Ordering: mint-only removes the only supported regeneration path, so it must ship WITH the
   refresher or after any manual refresh — see register §C93's ordering hazard.**
2. **Only a refresh may supersede**, in the *same process* as the fetch, from the manifest it actually
   replaced — so `supersedes` cannot be back-filled.

```jsonc
{
  "version": 2,
  "book": "lifraen-efnafraedi",
  "algorithm": "sha256",
  "upstream": { "repo": "...", "collection": "...", "branch": "main",
                "commit": "<new sha>", "fetchedAt": "...",
                "licenceAtFetch": { "url": "...", "text": "..." } },
  "localOrigin": [ /* above */ ],
  "supersedes": [                       // APPEND-ONLY; never rewritten
    { "upstreamCommit": "2a1f8284...",
      "generatedAt": "...",
      "licenceAtObtaining": { "code": "CC BY-NC-SA 4.0", "obtained": "2026-03-23" },
      "fileCount": 342,
      "filesDigest": "<sha256 of the canonical JSON of the previous `files` map>",
      "gitCommit": "<commit that held the superseded manifest>",
      "recordedAt": "..." }
  ],
  "files": { /* … */ }
}
```

**House-style note, so a reviewer does not flag it:** there is **no live `licence` key at the top
level** — `book-config.json` owns that. `upstream.licenceAtFetch` is a genuinely new fact nobody owns.
`supersedes[].licenceAtObtaining` is a **frozen historical snapshot** of a superseded state, not a
restatement of a live value. **No new `book-config.json` key is introduced**, so the `NON_RENDER_KEYS`
durable rule is untouched. `filesDigest` pins the whole previous hash map in 64 bytes, so the old
hashes survive **twice** — in git history, and as a digest that makes the git-history copy checkable.
`.source-info.json` gains a symmetric append-only `previous: [{ commit, fetchedAt, supersededAt }]`.

**Provenance doc in the same change, enforced not remembered.** A Vitest gate asserts that for each
source-bearing book, `docs/provenance/openstax-cnxml-licence-provenance.md` contains the current
`upstream.commit` from that book's manifest — a bump without a doc update goes red. Same pattern as
item 17's `VEFUR_CONTRACT` licence-agreement test. **The manifest owns the enforceable value; the doc
owns the human narrative; the test pins agreement.** ⚠️ Chemistry must be asserted as a
**known-absent state**, not skipped — a silently skipped book is a manufactured absence.

## Test plan (the instruments are half the work)

- **`source-manifest-baseline.test.js` — fix the dropout (finding ②).** Enumerate the **union** of
  *has a manifest* and *has CNXML*, not CNXML alone. Delete the CNXML → still enumerated via the
  manifest → red. Delete the manifest → still enumerated via the CNXML → red. Deleting **both** drops
  out and is **declared out of model** — a tracked-file deletion visible in the diff, the same
  carve-out F2 gives the deliberate insider. ⚠️ `__e2e-fixture__` (licence `CC BY 4.0`, 0 CNXML, no
  manifest) stays out of **both** sets, so the suite is unaffected — do **not** key this on licence.
- **`source-downloader.test.js` — the fixture must gain a real `book-config.json`.** Every case today
  passes a tmp `sourceDir`, so the sibling lookup refuses and all of them go red. **That is the
  correct outcome and must not be mocked away** — a mocked gate is a gate by care. Write an NC-SA
  config beside the tmp dir for the pass cases and a CC BY one for a new refusal case.
- **`fetchSourceGuard.test.js` — convert from absence to presence.** It asserts the *string*
  `--allow-overwrite-source` is absent from the spawned argv; assert instead that the argv **equals
  the exact known list**. An absence says whether you observed, never whether it is there — and it
  passes vacuously the moment the flag is renamed.
- **`source-manifest-cli.test.js`** pins `note` to `/CC BY/` [M]; retarget it to the per-book code.
- **New:** `assertRefreshable` has **arity 1** and the module exports nothing else — the
  machine-checkable form of *"no flag overrides it"*. Plus one refusal case per gate, each with a
  passing NC-SA control in the same file, so a harness that refuses everything cannot read as a pass.
- 🔴 **Verify every refusal test against the BROKEN state** — stash the gate, watch each refusal case
  go green (the write succeeds), restore. A refusal test that would refuse with the gate removed
  proves nothing.

## Out of model (declared)

A holder of repo write access who edits the CNXML **and** the sibling `book-config.json` **and** the
manifest **and** commits all three. F2's own threat model draws this line; C93 does not move it.
