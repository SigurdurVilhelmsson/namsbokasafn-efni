# OpenStax CNXML Licence Provenance — All Translated Titles

**Investigation date:** 2026-06-24
**Investigator:** Claude Code (read-only investigation; no content files modified)
**Repo state at investigation:** `namsbokasafn-efni` @ `fc7259de` (branch `chore/e2e-books-fixture`)
**Scope note:** Covers **all five OpenStax CNXML titles** present in the repo (Chemistry,
Organic Chemistry, Biology, Microbiology, College Physics) plus the Word edition. (Originally
requested as a Chemistry-only report — `efnafraedi-licence-provenance.md` — then broadened and
renamed.)

This report establishes, **per source**, the Creative Commons licence in force on the
OpenStax material **at the time it was obtained**. OpenStax relicensed several repositories
from CC BY to CC BY-NC-SA in 2026. CC licences are irrevocable for the copy obtained under
them: a file held under CC BY 4.0 before the upstream change stays CC BY 4.0 for that copy.

---

## 1. Determination summary

| Source (book) | Upstream repo / collection | Obtained (local) | Licence at obtaining | Verdict |
|---------------|----------------------------|------------------|----------------------|---------|
| **Word `.docx`** (Chemistry 2e) | n/a (external) | 2025-09-01 (user-asserted) | CC BY 4.0 | **CC BY 4.0** — user-asserted, not re-verified here |
| **Chemistry** — `efnafraedi-2e` | osbooks-chemistry-bundle / `chemistry-2e` | **2026-01-19** | CC BY 4.0 | **CC BY 4.0 — CONFIRMED** |
| **Biology** — `liffraedi-2e` | osbooks-biology-bundle / `biology-2e` | **2026-03-11** | CC BY 4.0 | **CC BY 4.0 — CONFIRMED** |
| **Microbiology** — `orverufraedi` | osbooks-microbiology / `microbiology` | **2026-03-09** | CC BY 4.0 | **CC BY 4.0 — CONFIRMED** |
| **College Physics** — `edlisfraedi-2e` | osbooks-college-physics-bundle / `college-physics-2e` | **2026-03-23 (confirmed)** | obtained after the 2026-03-19 relicense | **CC BY-NC-SA 4.0 — RESOLVED (user decision 2026-06-24)** |
| **Organic Chemistry** — `lifraen-efnafraedi` | osbooks-organic-chemistry / `organic-chemistry` | 2026-03-23 | CC BY-NC-SA 4.0 (always) | **CC BY-NC-SA 4.0** |

**Headline.** Chemistry, Biology, and Microbiology were all obtained while CC BY 4.0 — their
derivatives are CC BY 4.0 (irrevocable) and safe. Organic Chemistry was **never** CC BY.
**College Physics** was downloaded 2026-03-23, after the repo `LICENSE` flipped (03-19) but
before the governing collection metadata flipped (04-23) — an interpretive grey zone the user
has **resolved as CC BY-NC-SA 4.0** (2026-06-24), declining to argue the metadata-lag
technicality against OpenStax (see §5). Only Organic and Physics need remediation, and both
have **only machine-translation derivatives, no citable faithful translation**.

**Preface module `m68662` — re-created, not downloaded (2026-06-25).** The Chemistry CNXML
download (2026-01-19) omitted the book's preface module `m68662` (the CC BY-era pulls of
Chemistry, Biology, and College Physics all skipped their preface; the lowest captured
Chemistry module is `m68663`). A fresh OpenStax pull now would be CC BY-NC-SA, so the preface
was instead **re-authored as CNXML at `books/efnafraedi-2e/01-source/ch00/m68662.cnxml` from
the user's CC BY-era Word export** (`01-source/docx/ch00/preface.docx`, file date
**2025-09-12**). The docx body self-states *"Chemistry 2e is licensed under a Creative Commons
Attribution 4.0 International (CC BY) license,"* corroborating the Word-edition row above. The
re-created CNXML therefore inherits **CC BY 4.0** and is safe in this CC BY book. (Scope: the
re-creation kept the preface intro, the CC BY licence statement, "About Chemistry 2e", and the
full author/contributor/reviewer attribution lists; it dropped OpenStax-platform boilerplate. A
re-created module carries a locally-generated `md:uuid`, not the original OpenStax uuid.)

---

## 2. The relicense pattern (authoritative external anchor)

All four relicensed bundles (Chemistry, Biology, Microbiology, College Physics) followed the
**same two-step relicense**, confirmed by `git log` on each upstream repo:

1. **Repo-level `LICENSE` file** flipped CC BY → CC BY-NC-SA on **2026-03-19** (one
   coordinated day across all repos).
2. **Per-collection `<md:license>`** (the element the task identifies as governing the
   specific modules) flipped CC BY 4.0 → CC BY-NC-SA 4.0 on **2026-04-23** (a later cleanup).

Before both steps, every collection's `md:license` read `http://creativecommons.org/licenses/by/4.0/`
("Creative Commons Attribution License 4.0"), verified with `git log -S 'licenses/by/4.0'`
(present in 2021–2022 commits) and `git log -S 'by-nc-sa'` (first appears only in the 04-23
commit). **Per-module `index.cnxml` files carry no `<md:license>` in any revision** — for the
three used Chemistry modules this was checked explicitly
(`git log -G md:license -- modules/m68664/… m68699/… m68700/…` returns empty), so collection
metadata governs throughout.

| Repo (book) | LICENSE → NC-SA | Collection `md:license` → NC-SA |
|-------------|-----------------|----------------------------------|
| osbooks-chemistry-bundle (Chemistry) | `0243cd58` · **2026-03-19T18:49:21Z** | `d91a52cb` · **2026-04-23T17:10:10Z** |
| osbooks-biology-bundle (Biology) | `4ea6132f` · **2026-03-19T16:48:37Z** | `db5f4a56` · 2026-04-23T15:25:20Z |
| osbooks-microbiology (Microbiology) | `f1d8d4e9` · **2026-03-19T19:09:45Z** | `4eeff16d` · 2026-04-23T15:22:45Z |
| osbooks-college-physics-bundle (Physics) | `5182c46e` · **2026-03-19T18:41:02Z** | `9065107c` · **2026-04-23T15:34:53Z** |

Governing collection-metadata diff (representative, Chemistry `d91a52cb`):

```diff
-  <md:license url="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution License 4.0</md:license>
+  <md:license url="http://creativecommons.org/licenses/by-nc-sa/4.0/">Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International</md:license>
```

### Organic Chemistry — never CC BY

`osbooks-organic-chemistry`'s collection (`organic-chemistry.collection.xml`) has carried
**CC BY-NC-SA 4.0 since its first commit** (`51e417ff`, 2022-06-09). `git log -S 'licenses/by/4.0'`
on it returns **nothing** — a non-NC `by/4.0` licence never existed. The only 2026-04-23 edit
(`278405a6`) merely added human-readable text to an already-`by-nc-sa` element (URL unchanged).

### Permalinks

- Chemistry: `…/osbooks-chemistry-bundle/commit/0243cd5879b93936ad8bc70ca181480403c331ec` · `…/commit/d91a52cbd45d63610518fe92a5a5d1746b11f680`
- Biology: `…/osbooks-biology-bundle/commit/4ea6132f7acb0fc9ef1015b11a59427fd7b4c61c` · `…/commit/db5f4a56b3f9eb98faa6846967da8fd11f57466e`
- Microbiology: `…/osbooks-microbiology/commit/f1d8d4e9941417f25610a239045c35488d56cf22` · `…/commit/4eeff16ddf4073752d0a1e988953faf56e6a352e`
- Physics: `…/osbooks-college-physics-bundle/commit/5182c46ee4854d84e3e35ea34e5ed0bef461b19b` · `…/commit/9065107cf140924c253aae15e82f8f75cba401df`
- Organic: `…/osbooks-organic-chemistry/commit/278405a66c258e1b0ef616e54a7eed63a71aa922` (cosmetic) · first-commit `51e417ff…`

Preserved patches (this directory): `openstax-licence-change-0243cd58.patch`,
`openstax-licence-change-d91a52cb.patch`, `openstax-biology-LICENSE-change-4ea6132f.patch`,
`openstax-microbiology-LICENSE-change-f1d8d4e9.patch`,
`openstax-physics-LICENSE-change-5182c46e.patch`,
`openstax-physics-collection-change-9065107c.patch`.

---

## 3. My-side download evidence (per book)

All five CNXML downloads are **extracted module sets** (flat `mNNNNN.cnxml`), **not** git
clones: no `.git/`, no `collection.xml`, no `index.cnxml` locally. Consequently **no
downloaded file carries embedded `<md:license>` metadata** — the strongest self-contained
proof (task Evidence B1) is unavailable for every book. Each verdict therefore rests on a
**timing bracket** (local git-add-date + mtime, bounded against the upstream change commit),
which for the obtained copy is a genuine upper bound — and for the four confirmed books, a
*tighter* bound than embedded metadata. Each repo was confirmed by **UUID match** between a
local module and the upstream `modules/mNNNNN/index.cnxml`, independent of repo naming.

| Book | UUID-matched module | git-add commit (UTC) | Add message | Source mtimes | Verdict basis |
|------|---------------------|----------------------|-------------|---------------|---------------|
| Chemistry | `m68664` `e4d0a888…` | `30d3624e` · 2026-01-19T08:50:52Z | "add complete Chemistry 2e source…" | 135×01-19, 13×02-05 (appendices) | ≤01-19 < 03-19 ✅ |
| Biology | `m66484` `0080ac75…` | `53442ca7` · 2026-03-11T12:54:05Z | "chore: download Biology 2e source CNXML (259 modules)" | 259×**03-11** | ≤03-11 < 03-19 ✅ |
| Microbiology | `m58842` `8514cfef…` | `c733eae4` · 2026-03-09T15:11:12Z | "add orverufraedi (Microbiology) source…" | 159×**03-09** | ≤03-09 < 03-19 ✅ |
| Physics | `m42186` `bb9825e1…` | `7aca8fd0` · 2026-03-23T19:08:16Z | "add preview chapters for 4 new books…" | 283×**03-23** | 03-23 — see §5 ⚠️ |
| Organic | `m00128` `011c4bf1…` | `7aca8fd0` · 2026-03-23T19:08:16Z | (same) | — | always NC-SA |

Notes:
- **Chemistry** — the three *translated* modules (`m68664`, `m68699`, `m68700`) all trace to
  the single 2026-01-19 add and were touched only by that add + the 2026-03-02 rename
  (`git log --follow`), so the file actually translated **is** the January CC BY copy
  (mtimes `2026-01-19 08:41`, unbumped, corroborate non-modification). The user's recalled
  "~2026-03-02" is that rename commit, not the download.
- **Biology / Microbiology** — uniform source mtimes (all 03-11 / all 03-09) match the
  add-commit dates and place the whole extraction before 03-19; the 03-23 "preview chapters"
  commit did not introduce these source blobs.
- **No external download record found** — `~/.bash_history` / `~/.zsh_history` contain no
  `osbooks`/`openstax` fetch line (Evidence B4 absent; shell history likely lacks
  timestamps).

---

## 4. Cross-check — content actually used / published

No book except Chemistry has any **faithful** (citable) translation; the other four have
**machine-translation derivatives only** (MT output, injected CNXML, rendered MT-preview HTML
— all derivative works under CC):

| Book | faithful | 02-mt-output | 03-translated | 05-publication HTML | Licence of derivatives |
|------|---------:|-------------:|--------------:|--------------------:|------------------------|
| Chemistry | 3 (`m68664`,`m68699`,`m68700`) | — | — | MT-preview + faithful | **CC BY 4.0** |
| Biology | 0 | 14 | 17 | 18 | **CC BY 4.0** |
| Microbiology | 0 | 15 | 34 | 22 | **CC BY 4.0** |
| Physics | 0 | 10 | 9 | 15 (ch4) | **CC BY-NC-SA 4.0** (decided, §5) |
| Organic | 0 | 9 | 49 | 102 (ch3) | **CC BY-NC-SA 4.0** |

*(`stjornufraedi` (Astronomy) contains only a README in `01-source` — no CNXML, no
derivatives, out of scope. `testbook`/`__e2e-fixture__` are test artifacts.)*

---

## 5. College Physics — RESOLVED as CC BY-NC-SA 4.0 (user decision 2026-06-24)

College Physics 2e (`edlisfraedi-2e`) was obtained **2026-03-23** — now a **confirmed
actual** download date, not merely an upper bound: the user attests the local CNXML files
are the original downloads on this machine (never re-copied, which would have bumped the
mtimes), and the git-add (2026-03-23T19:08:16Z) and uniform 03-23 source mtimes agree. This
date falls **between** the two relicense anchors:

- **After** the repo `LICENSE` flipped to CC BY-NC-SA (**2026-03-19**).
- **Before** the governing collection `md:license` flipped (**2026-04-23**).

The two readings:

- **CC BY (colorable).** The task's own framework elevates collection/module metadata over the
  top-level `LICENSE` ("the module/collection metadata is what governs those specific files").
  The book-specific `college-physics-2e` collection still read `by/4.0` on 2026-03-23; the
  repo `LICENSE` is bundle-wide (also covers `college-physics-ap-courses-2e`). Under the
  more-specific governing signal, the copy was obtained under CC BY 4.0.
- **NC-SA (conservative default — adopted here).** The coordinated 2026-03-19 "updating
  license to CC BY NC-SA" across all repos shows the *effective* relicense decision was
  2026-03-19; the 04-23 metadata edits are lagging cleanup, and a downstream user is on notice
  from 03-19. Per this report's own decision rule, a download that **cannot be shown to
  predate the change** is NC-SA/unresolved — and Physics cannot.

**Final determination: CC BY-NC-SA 4.0.** Decided by the user (project lead) on 2026-06-24.

**The timing route to CC BY was closed by the user's own attestation.** The user confirmed the
local files are the original downloads, fixing the actual download at **2026-03-23** — *after*
the 2026-03-19 `LICENSE` flip. The download therefore does not predate the relicense; it is
confirmed to follow it. No earlier download record exists, so Physics fails the timing bracket.

**The only remaining route to CC BY was a legal-theory one** — arguing that the book-specific
collection `<md:license>` (still `by/4.0` on 2026-03-23, until the 2026-04-23 flip) overrides
the bundle-wide `LICENSE` file (NC-SA from 2026-03-19). **The user has declined to pursue
that argument**, on the principle of maintaining an open, honest working relationship with
OpenStax and honouring their evident 2026-03-19 relicense intent rather than leaning on a
metadata-update lag. College Physics is therefore treated as **CC BY-NC-SA 4.0**, the same as
Organic Chemistry. This is a deliberate, documented decision, not an unresolved gap.

---

## 6. Conclusion & remediation

**Confirmed CC BY 4.0 (no action):** Chemistry, Biology, Microbiology — and the Word edition
(user-asserted). Their MT-preview/faithful derivatives may be released under CC BY 4.0 with
attribution; the upstream relicense does not affect copies obtained before it.

**Remediation required:**
1. **Organic Chemistry — CC BY-NC-SA 4.0 (definite).** Relabel the **102** published
   MT-preview HTML pages (+ 49 translated + 9 MT-output) as CC BY-NC-SA 4.0 with
   attribution + ShareAlike + NonCommercial notice, **or** withdraw them. Do not intermix
   into CC BY deliverables.
2. **College Physics — CC BY-NC-SA 4.0 (decided, §5).** Relabel the **15** published
   MT-preview HTML pages (ch4, + 9 translated + 10 MT-output) as CC BY-NC-SA 4.0 with
   attribution + ShareAlike + NonCommercial notice, **or** withdraw them — same treatment as
   Organic Chemistry.

No remediation needed for Chemistry / Biology / Microbiology derivatives.

### 6.1 Disposition — RELABEL (lead decision 2026-07-20)

The remediation fork above (relabel vs withdraw) is **decided: relabel.** The Organic
(102 published) and College Physics (15 published) MT-preview derivatives stay
published and are labelled **CC BY-NC-SA 4.0** with attribution + NonCommercial +
ShareAlike notice — not withdrawn. Rationale: they are legitimate NC-SA derivative
works; a correct label satisfies the licence, and withdrawing would discard
already-translated student content for no compliance gain.

Decided facets (adopted as the campaign item-17 build posture):

- **Display.** A per-product licence footer, keyed off a new `books/<slug>/book-config.json`
  licence field, renders on published pages: attribution for the three CC BY books;
  attribution + NonCommercial + ShareAlike for Organic and Physics. `tools/lib/book-licences.cjs`
  stays the corpus-export map; item 17 moves the canonical licence into book-config and the
  two must agree (single provenance source: this document §1).
- **Containment.** NC-SA content must not be folded into any CC BY aggregate or combined
  deliverable (cross-book glossary/index aggregates, combined/library exports). A lightweight
  licence-aware guard enforces this; the research corpus already stamps licence per row and is
  unaffected.
- **NonCommercial.** The lead affirms namsbókasafn.is's use is non-commercial (free
  educational access), consistent with the NC term.
- **ShareAlike.** The Icelandic MT-preview of an NC-SA source is itself offered under
  CC BY-NC-SA 4.0; the footer for those two books states this.

This is licence posture, not legal advice; counsel review remains advisable but is not a
blocker on the item-17 build. This resolves the L7 licence-posture gate on campaign item 17.

#### 6.1.a — Item 17 implementation (2026-07-21)

- **Canonical datum.** The per-book licence now lives in `books/<slug>/book-config.json`
  (`"licence": { "code", "obtained" }`); `tools/lib/book-licences.cjs` `getBookLicence()` reads it
  (return contract unchanged; the inline map is retired). Provenanced books only — `stjornufraedi`/`testbook`
  carry none and `getBookLicence` throws for them.
- **Display mechanism adjusted.** The §6.1 "per-product licence footer keyed off book-config" is delivered by
  **vefur**, which already renders a correct, data-driven per-page/print licence footer (`BookAttribution.svelte`,
  build-gated). **efni emits no footer.** A `VEFUR_CONTRACT`-gated test asserts efni's `book-config` licence codes
  agree (after format normalisation) with vefur's `book.ts` `derivativeLicence`.
- **Containment.** corpus + TM already row-stamp per-book and are unaffected. No cross-book aggregate export
  exists; `tools/lib/licence-containment.cjs` encodes the "no restrictive book in a permissive aggregate" rule for
  any future one. The Árnastofnun added-terms export is **licence-neutral** (terms aren't copyrightable) and is
  therefore not a containment target.

---

## 7. Evidence integrity / reproducibility

- Upstream repos cloned (full history) into `/tmp/osbooks-*` — **outside** this repo tree,
  never committed.
- Seven change-commit patches preserved in this directory (listed in §2).
- Provenance confirmed by **UUID match** for all five books, independent of repo naming.
- **Unverified items (explicit):** the Word `.docx` licence/date (user-asserted, no local
  artifact). College Physics is **decided** as NC-SA (§5), not unverified — the download is
  user-confirmed as the original 2026-03-23 fetch, after the 03-19 relicense, and the user
  chose not to argue the metadata-lag technicality. Chemistry/Biology/Microbiology download
  instants are bounded by git-add + mtime. No external download record (browser/shell) was
  found for any book.
