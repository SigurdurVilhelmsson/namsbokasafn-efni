# Handoff → namsbokasafn-vefur: chemistry ch05 redirect row, for whenever chemistry is next synced

**From:** namsbokasafn-efni · **Date:** 2026-09-19 · **Status:** frozen record, not maintained.
**For:** the vefur session that prepares chemistry's next sync. **Adds to**
[`2026-09-17-vefur-chemistry-ch03-ch04-redirects.md`](2026-09-17-vefur-chemistry-ch03-ch04-redirects.md); supersedes
nothing in it.

> Per § *One source of truth*, this file is **evidence, not status**. If it disagrees with efni's active register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`), the register wins. The row below was derived from
> **`books/efnafraedi-2e/05-publication/mt-preview/slug-map.mt-preview.json`** on efni branch
> `content/batched-re-render-2026-09-19` and checked against the live site, never taken from register prose.

⏹ **Nothing here asks for a sync.** [USER] times the sync with the books' classroom users (efni
`docs/decisions/2026-09-16-chapters-prepared-sync-timed-by-classroom-use.md`). The row is inert until its target
exists, so landing it early is correct: redirect first, then sync, is the only order with no 404 window.

---

## 1. `src/lib/data/sectionRedirects.ts` — one ADD for ch05

vefur `origin/main` (read 2026-09-19) holds **no** chemistry ch05 row.

### ① ADD — chemistry `m68724` (ch05, renamed 2026-09-19 by the ch05 re-MT)

```ts
{
	bookSlug: 'efnafraedi-2e',
	fromChapter: '05',
	fromSlug: '5-1-grunnatridi-orku',
	toChapter: '05',
	toSlug: '5-1-grundvallaratridi-orku',
	moduleId: 'm68724'
}
```

The re-MT titled the module *Grundvallaratriði orku* where the old MT had *Grunnatriði orku* (both "fundamentals of
energy"). ✅ **`5-3-vermi` did NOT rename** — its title was held by the enthalpy glossary subset, so no row for m68727.

## 2. Verification after the sync — status codes mean nothing here; judge by BYTE SIZE, with a control

```bash
base=https://namsbokasafn.is/content/efnafraedi-2e/chapters
probe() { curl -s -o /dev/null -w '%{http_code} %{size_download}  '"$1"'\n' "$base/$1"; }
probe 05/5-1-grundvallaratridi-orku.html   # 404 162 on 2026-09-19 → LARGE after the sync
probe 05/5-1-grunnatridi-orku.html         # 200 207578 on 2026-09-19 → gone after the sync; the redirect is served by the section route
probe 05/5-3-vermi.html                    # 200 1427774 on 2026-09-19 → LARGE before and after (same name)
probe 05/zz-nonsense-control.html          # CONTROL: expect 404 162 — anything large means the probe is broken
```
