# §C56 Gate A — hand-repair triage of `02-mt-output`

**Date:** 2026-08-12 · **Gate:** A, in [`2026-08-12-c56-pilot-re-extract-remt-runbook.md`](../plans/2026-08-12-c56-pilot-re-extract-remt-runbook.md)
**Register item:** §C56 · **Method source:** project memory `mt-output-hand-repairs` (2026-07-30)

> **FROZEN EVIDENCE — banner-dated 2026-08-12.** A measurement as taken on that date.
> **If it disagrees with the active register, the register wins.**

---

## Why this exists

`books/*/02-mt-output/` is READ-ONLY by project rule, **yet it holds hand corrections that exist in no faithful file and under no `.locked` marker.** A re-MT reverts them silently. The `manualCorrections` provenance block appears in **exactly one** file corpus-wide, so **git is the index**.

## Census — 31 commits, not 43

**⚠️ A correction to the figure quoted when §C56 was logged.** "43 commits" summed *per-book* counts; **12 commits touch more than one book**. The unique count is **31**.

## Method — a date-independent discriminator

The obvious discriminator (does the commit rewrite `-provenance.json`?) **is invalid before 2026-06-30**, because `70676f88` backfilled provenance on that date; earlier, its absence means nothing.

**The discriminator used instead:** a *tool* re-MT is preceded by a re-extract, so **`02-for-mt` moves in the same commit**. A *hand* edit touches **only `02-mt-output`**. This works at every date.

Title changes were then determined **exactly** — by extracting each `SEG:…:title:` segment's value from the parent and child blobs and comparing — not by reading diff context, which over-reports.

## Result — 7 hand-repair commits

| commit | date | book · modules | title changed? | URL impact |
|---|---|---|---|---|
| `edd84811` | 03-06 | efnafraedi · `appendices/m68866` | no | none |
| `e251c134` | 03-09 | orverufraedi · ch01 `m58781` `m58782` `m58783` | **no** ⚠️ | none |
| `5bbfdbe4` | 03-22 | efnafraedi · `m68727` (+1) | yes ×4 | **none** — compiled pages |
| `d440b5b8` | 03-23 | efnafraedi · ch16 `m68818`, ch17 `m68823` | no | none |
| `827424da` | 06-25 | efnafraedi · ch05 ×5 | yes ×4 | 🔴 **1 pending rename** |
| `7439d07e` | 06-26 | efnafraedi · ch14 `m68803`, ch18 `m68831`, ch19 `m68842` | no | none |
| `334d800d` | 07-14 | efnafraedi · `appendices/m68865` | no | none |
| `4e5be912` | 07-26 | liffraedi · ch03 `m66441` | yes | 🔴 **live URL already renamed** |

⚠️ **`e251c134` is a FALSE POSITIVE of the first pass** and is recorded because the mechanism recurs: the title parser captured the *next* `SEG` marker line as a title's value, because that title segment's content is empty. The actual change is an escaping fix (`\_\_` → `__`) inside a **`:problem:`** segment. **A title segment with empty content makes a naive next-non-blank-line parser read the following marker as its value.**

**Classified as TOOL runs** (moved `02-for-mt` in the same commit): `97f41735` (10 mt-out / **97** for-mt), `1db4fcf2` (1/3), `57467ce3` (1/4), `f594336f` (11/27), plus the large batch runs.

## The URL question — two page classes, and only one is at risk

Measured from `05-publication/mt-preview/chapters/NN/`:

- **Section pages are title-slugged** — `5-1-grunnatridi-orku.html`, `3-3-lipid.html`. **A title change renames the file.**
- **Compiled end-of-chapter pages have fixed names** — `5-summary.html`, `5-exercises.html`, `5-key-terms.html`, `5-answer-key.html`, `5-key-equations.html`. **A title change alters heading text only.**

This is what narrows `5bbfdbe4`'s four title changes to **no URL impact**: `m68727` produces compiled pages.

### 🔴 Two reader-visible cases, not one

**① `4e5be912` — biology `m66441`, already live.** `Fitusýrur` → `Lípíð`; published page is `3-3-lipid.html` (verified present). Reverting flips the URL back and re-triggers C9 prune-on-rename. *Known before this triage.*

**② `827424da` — chemistry `m68724`, a PENDING rename nobody had logged.** `02-mt-output` currently holds the title **`Grundvallaratriði orku`**, while the published page is still **`5-1-grunnatridi-orku.html`** — the *old* slug from `Grunnatriði orku`.

**So a re-render today renames that page, with or without any re-MT.** It has been in this state since **2026-06-25**. It is an independent, pre-existing C9 exposure that the migration did not create and must not be blamed for.

Also noted from the same commit: the ch05 chapter title is now `Varmaefnafræði` (was `Varmefnafræði`). The chapter directory is numeric (`05/`), so this is not a filename, but vefur may surface it in navigation.

## Consequences for §C56

- ✅ **Gate A3 is SATISFIED FOR THE PILOT.** **No hand repair touches `efnafraedi-2e` ch20 or `edlisfraedi-2e` at all** — `edlisfraedi-2e` has no hand repairs in any chapter. The pilot can proceed without re-application work.
- ⚠️ **The full run must re-apply 7 commits' worth of repairs** across ~21 module-file touches, concentrated in `efnafraedi-2e` (17), with `orverufraedi` (3) and `liffraedi-2e` (1).
- 🔴 **Two of those carry URL consequences** and need the C9 old→new slug map, not just a content re-apply.
- **`m68724`'s pending rename should be decided independently of §C56** — it is live in the tree now.

## Limits of this triage — stated rather than implied

1. **Classification is by diff shape and title comparison, not by reading all 31 diffs.** A hand repair that (a) touched no title and (b) coincided with a re-extract would be classified as a tool run.
2. **"URL impact" was determined from the page-naming convention plus spot checks**, not by diffing a before/after render.
3. **Only `SEG:…:title:` segments were compared.** Any other slug-affecting field would not have been seen.
4. `05-publication/mt-preview/` was the tree inspected. Whether every one of these is the *currently served* artifact was not re-verified against vefur.
