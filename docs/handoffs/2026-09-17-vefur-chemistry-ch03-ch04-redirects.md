# Handoff → namsbokasafn-vefur: chemistry ch03/ch04 redirect rows, for whenever chemistry is next synced

**From:** namsbokasafn-efni · **Date:** 2026-09-17 · **Status:** frozen record, not maintained.
**For:** the vefur session that prepares chemistry's next sync. **Supersedes the chemistry half of
[`2026-09-05-vefur-ch03-publish-redirects.md`](2026-09-05-vefur-ch03-publish-redirects.md) §1 ①.** Its organic rows are
not re-derived here.

> Per § *One source of truth*, this file is **evidence, not status**. If it disagrees with efni's active register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ㉟), the register wins. Every row below was derived
> from **`books/efnafraedi-2e/05-publication/mt-preview/slug-map.mt-preview.json`** on efni branch
> `content/c140-c35-rerender-ch03-ch04` and checked against the live site, never taken from register prose.

⏹ **Nothing here asks for a sync.** [USER] ruled 2026-09-16 that chapters are *prepared* and [USER] times the sync with
the books' classroom users (efni `docs/decisions/2026-09-16-chapters-prepared-sync-timed-by-classroom-use.md`). These
rows are inert until their targets exist, so landing them early is correct: redirect first, then sync, is the only
order with no 404 window.

---

## 1. `src/lib/data/sectionRedirects.ts` — two ADDs for ch04, nothing for ch03

vefur `origin/main` (`45f1299`, read 2026-09-17) holds **no** chemistry ch03 or ch04 rows (controls present: `m68770`
ch10, `m68848` ch20).

### ① ADD — chemistry `m68713` (ch04, renamed 2026-09-06)

```ts
{
	bookSlug: 'efnafraedi-2e',
	fromChapter: '04',
	fromSlug: '4-3-hlutfallaefnafraedi-efnahvarfa',
	toChapter: '04',
	toSlug: '4-3-efnajofnuhlutfall',
	moduleId: 'm68713'
}
```

### ② ADD — chemistry `m68716` (ch04, renamed 2026-09-06)

```ts
{
	bookSlug: 'efnafraedi-2e',
	fromChapter: '04',
	fromSlug: '4-5-magnbundin-efnagreining',
	toChapter: '04',
	toSlug: '4-5-megindleg-efnagreining',
	moduleId: 'm68716'
}
```

### ③ WITHDRAWN — chemistry `m68702` (ch03). **Do NOT add the 09-05 row, and do NOT add the row your detector suggests.**

The 09-05 handoff asked for `3-2-akvordun-reynsluformula-og-sameindaformula → 3-2-akvordun-reynslu-og-sameindaformula`.
efni's 2026-09-17 re-render **renamed the page back**: m68702's title follows the §C133 re-MT, which gives
`3-2-akvordun-reynsluformula-og-sameindaformula`, and that is **the name the live site already serves** (499,575 B).
`reynslu-og` never went live (404, 162 B). So no ch03 redirect is needed.

⚠️ `scripts/lib/rename-detector.js` reads efni's slug map, which now records `reynslu-og → reynsluformula-og` for
m68702, so it **will print a suggestion**. That row is harmless (the target exists and there is no loop) but it
redirects a URL no reader ever had. Skip it.

## 2. Verification after the sync — status codes mean nothing here; judge by BYTE SIZE, with a control

```bash
base=https://namsbokasafn.is/content/efnafraedi-2e/chapters
probe() { curl -s -o /dev/null -w '%{http_code} %{size_download}  '"$1"'\n' "$base/$1"; }
probe 03/3-2-akvordun-reynsluformula-og-sameindaformula.html   # LARGE before and after (same name)
probe 04/4-3-efnajofnuhlutfall.html                            # 404 162 today → LARGE after the sync
probe 04/4-5-megindleg-efnagreining.html                       # 404 162 today → LARGE after the sync
probe 04/4-3-hlutfallaefnafraedi-efnahvarfa.html               # LARGE today → the old page is gone after the sync; the redirect is served by the section route, not this content path
probe 03/zz-nonsense-control.html                              # CONTROL: expect 404 162 — anything large means the probe is broken
```

## 3. One note that is not a redirect: `data-figure-review` has no consumer on vefur

efni's render now emits `data-figure-review="mt-preview"` on a `<figure>` whose Icelandic figure text is machine
translated and not yet approved. After this render, chemistry ch03 and ch04 carry it on 15 distinct figures. Nothing in vefur
`origin/main` (CSS, Svelte or TS) reads it, and content is inserted with `{@html}`, so the attribute reaches the page and
**shows nothing**. Whether and how to show readers that warning is vefur's design decision; this is a pointer, not a
request. Inline (non-`<figure>`) images never carry the attribute.
