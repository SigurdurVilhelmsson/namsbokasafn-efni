# Handoff → namsbokasafn-vefur: publishing chemistry ch03 + organic ch03

**From:** namsbokasafn-efni · **Date:** 2026-09-05 · **Status:** frozen record, not maintained.
**For:** the vefur session doing the redirect edit, the named-book sync, the build and the deploy.

> Per § *One source of truth*, this file is **evidence, not status**. If it disagrees with efni's
> active register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`), the register wins.
> Every row below was derived from **`books/*/05-publication/*/slug-map.*.json`**, never from
> register prose — the prose carries a superseded, partly inverted copy (efni register `:577`).

---

## 🔴 READ FIRST — the text side of organic ch03 is NOT clear to publish

**117 of 198 `alt` attributes on organic ch03's 13 rendered pages are still ENGLISH.**
Measured 2026-09-05 on `books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/*.html`,
with a control (80 alts score Icelandic, so the detector is not simply failing):

| page | English alts |
|---|---|
| `3-exercises.html` | 43 |
| `3-additional-problems.html` | 31 |
| `3-1-virknihopar.html` | 11 |
| `3-3-alkilhopar.html` | 10 |
| `3-4-nafngiftir-alkana.html` | 10 |
| `3-7-stellingar-annarra-alkana.html` | 8 |
| `3-2-alkanar-og-alkana-hverfur.html` | 4 |

Sample: `alt="The chemical structure of methionine which is an amino acid."`

**Cause is on efni's side and is a CODE gap, not an editorial one:** organic's exercise figure
`alt` text lives in `01-source/exercises/*.json` and the extractor never emits alt segments for it
— **0 of 6,664 exercise segments are alt segments**, against a control of 81 alt segments in ch03's
module CNXML. So the alts were never extracted, never translated, and inject had nothing to write.

▶ **This is efni's to fix and it is logged there** (⚒️ post-run manual-fix ledger + register).
**Nothing in this handoff depends on it** — the redirect rows below are correct and worth landing
either way, because one of them is actively wrong today. **But do not treat "redirects landed" as
"organic ch03 is publishable".** Chemistry ch03 is unaffected by this finding.

---

## What efni changed

- **Chemistry ch03** — re-extracted, re-MT'd, injected, **rendered** (efni PR #449). One page renamed.
- **Organic ch03** — re-MT'd against the cleaned glossary, September exercises assembled, injected
  (7 of 8 modules), **rendered** (efni PR #450, merged `edeed7c9`). Two pages renamed.
  - ⚠️ **`m00037` was NOT re-injected.** The MT returned 2 of 3 `[[term:]]` markers, a count-guard
    degraded the paragraph to English, and inject correctly **refused** the module. The page
    `3-6-stellingar-etans.html` therefore carries a **2026-09-01** body under a 2026-09-05 slug, and
    its `<h1>` reads **"Afbrigði etans"** while its filename says *stellingar*. The text is good
    Icelandic — this is a terminology/heading inconsistency, not untranslated content.

---

## 1. The redirect edit — `src/lib/data/sectionRedirects.ts`

🔴 **THE NET INSTRUCTION IS THREE EDITS, NOT SEVEN ADDITIONS.** vefur already holds five relevant
rows; two of them are stale relative to efni's tree today. Verified against
`../namsbokasafn-vefur/src/lib/data/sectionRedirects.ts` at read time and against efni's rendered
tree by file existence.

### ① ADD — chemistry `m68702` (absent from vefur; control: `m68770` present)

```ts
{
	bookSlug: 'efnafraedi-2e',
	fromChapter: '03',
	fromSlug: '3-2-akvordun-reynsluformula-og-sameindaformula',
	toChapter: '03',
	toSlug: '3-2-akvordun-reynslu-og-sameindaformula',
	moduleId: 'm68702'
}
```

### ② UPDATE — organic `m00033`: the `toSlug` names a page that does not exist

vefur currently has `toSlug: '3-2-alkanar-og-alkanhverfur'`. **That file is absent from efni.**
It was itself a superseded link in the rename chain. The current page is:

```
	fromSlug: '3-2-alkanar-og-hverfur-alkana'      (unchanged)
	toSlug:   '3-2-alkanar-og-alkana-hverfur'      ← was '3-2-alkanar-og-alkanhverfur'
```

efni's slug map also records a second `from` for the same module — `3-2-alkanar-og-alkanhverfur`
→ `3-2-alkanar-og-alkana-hverfur`. That slug was **never synced**, so a redirect for it protects
nobody. **Your call whether to add it; stated explicitly rather than left implicit.**

### ③ REPLACE — organic `m00037`: vefur's row is the EXACT INVERSE of efni's, and this one bites

vefur holds `3-6-stellingar-etans` → `3-6-afbrigdi-etans`. Both halves are wrong today:

| slug | in efni's rendered tree |
|---|---|
| `3-6-stellingar-etans` | **EXISTS** — it is the current page |
| `3-6-afbrigdi-etans` | **absent** — it is the OLD name |

Replace with:

```ts
{
	bookSlug: 'lifraen-efnafraedi',
	fromChapter: '03',
	fromSlug: '3-6-afbrigdi-etans',
	toChapter: '03',
	toSlug: '3-6-stellingar-etans',
	moduleId: 'm00037'
}
```

🔴 **THIS OVERRIDES A COMMENT IN YOUR OWN FILE, BY NAME — and without this paragraph you would be
right to refuse the edit.** `sectionRedirects.ts:123-125` says:

> ⚠️ THE 3-6 AND 3-7 PAIRS CROSS OVER — 3-6 goes `stellingar` -> `afbrigdi` while 3-7 goes
> `afbrigdi` -> `stellingar`. That is what efni recorded and it is not a transcription slip; do not
> "normalise" them into the same direction.

**That comment was accurate when written and is now stale.** The crossover was real: a July render
had renamed 3-6 `stellingar → afbrigdi`. **efni's 2026-09-05 re-render reversed it**, so both pairs
now run in the same direction. This is not a normalisation on aesthetic grounds — it is efni's slug
map changing. Please update or delete that comment along with the row.

▶ **Consequence of leaving it:** after the sync, `3-6-afbrigdi-etans` — **live on the site today** —
has no redirect and **404s**. That is precisely the window the mechanism exists to close.

### ④ NO CHANGE — organic `m00038` (3-7)

vefur's `3-7-afbrigdi-annarra-alkana` → `3-7-stellingar-annarra-alkana` is **correct**; the target
exists in efni. Left alone.

### Also stale in that file's comments

`sectionRedirects.ts:127-129` says efni's branch *"`feat/c82-action3-full-corpus-loop` … has NOT
merged to efni `main`"*. That is no longer true — this work merged via PR #450 (`edeed7c9`) and the
pages are on efni `main`.

---

## 2. Ordering — this is a gate, not a preference

```
redirect edit  →  named-book sync  →  build  →  deploy  →  verify
```

🔴 **Redirects land BEFORE the sync.** A vefur redirect entry is inert until
`exactSectionExists` finds its target published, so shipping them ahead of the content is the
**only ordering with no 404 window**. Redirect-then-sync is safe; sync-then-redirect is not.

🔴 **NAME THE BOOKS. Never run `sync-content.js` bare** — a bare run publishes every book,
including the three held back by the 2026-08-22 [LEAD] ruling.

```bash
node scripts/sync-content.js --source ../namsbokasafn-efni efnafraedi-2e lifraen-efnafraedi
```

⚠️ If `scripts/lib/published-books.js` now gates this (it exists in vefur with `PUBLISHED_BOOKS`
frozen to the two books and its own test), prefer whatever that allowlist enforces — it supersedes
the hand-named form, and efni's CLAUDE.md carries a self-destruct note saying its own copy of the
list should be deleted once that shipped.

⚠️ **`deleting toc.json` in the sync output is EXPECTED** — efni ships none; vefur regenerates it.
The regen is warn-only and cannot fail the sync, while vefur skips any book lacking one, so a failed
regen silently drops a whole book with every exit code green. **Read the output.**

⚠️ **A sync conflict is warn-only and does not change the exit code.** A clean exit is *not*
evidence that there are no duplicates.

---

## 3. Verification — status codes are meaningless here

The reader site is a client-rendered SPA with an any-path fallback: **a real page, a deleted page and
nonsense all return 200 with the same ~2,940-byte shell.** Test the content file, judge by **byte
size**, and always include a control you expect to fail.

```bash
# expect ~7 KB — organic ch03, m00037's page (the renamed one)
curl -sS -o /dev/null -w '%{size_download}\n' \
  https://namsbokasafn.is/content/lifraen-efnafraedi/chapters/03/3-6-stellingar-etans.html

# expect ~19 KB — a fully re-MT'd organic module
curl -sS -o /dev/null -w '%{size_download}\n' \
  https://namsbokasafn.is/content/lifraen-efnafraedi/chapters/03/3-4-nafngiftir-alkana.html

# CONTROL — expect ~160 bytes. If this returns 7 KB your instrument is wrong,
# and a set of "clean" results above means nothing.
curl -sS -o /dev/null -w '%{size_download}\n' \
  https://namsbokasafn.is/content/lifraen-efnafraedi/chapters/03/zzz-does-not-exist.html
```

Then check the redirect itself: request the **old** slug `3-6-afbrigdi-etans` and confirm you get
the ~200-byte meta-refresh stub rather than a 404.

---

## 4. Not covered by this handoff

- **The 117 English alts** (§ READ FIRST). efni's problem, efni's ledger. Blocks calling organic
  ch03 *done*; does not block the redirect edit.
- **m00037's `<h1>Afbrigði etans` under a `stellingar` filename.** Reader-visible, efni-side,
  logged as editor follow-up. Not a vefur concern.
- **Chemistry ch03's index**: 4 ch03 terms lost their English search key (`termEn: null`,
  18 of 763 entries book-wide, up from 14). efni code item.
- **Anything under `05-publication/faithful/`.** Both books publish on **`mt-preview`** today.
- **The deploy itself** needs a human with `sudo` on the box; nothing here automates it.

---

## Provenance

Rows derived from, and re-verifiable against:

- `books/efnafraedi-2e/05-publication/mt-preview/slug-map.mt-preview.json`
- `books/lifraen-efnafraedi/05-publication/mt-preview/slug-map.mt-preview.json`

Target existence checked by file test against
`books/<slug>/05-publication/mt-preview/chapters/03/<slug>.html` in efni at `d1021ad5`.
vefur state read from `src/lib/data/sectionRedirects.ts` (read-only; efni never writes vefur's tree).
