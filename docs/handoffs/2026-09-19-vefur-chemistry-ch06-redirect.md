# Handoff → namsbokasafn-vefur: chemistry ch06 redirect row, for whenever chemistry is next synced

**From:** namsbokasafn-efni · **Date:** 2026-09-19 · **Status:** frozen record, not maintained.
**Adds to** [`2026-09-19-vefur-chemistry-ch05-redirect.md`](2026-09-19-vefur-chemistry-ch05-redirect.md); supersedes nothing.

> Evidence, not status: if this disagrees with efni's active register, the register wins. The row was derived from
> **`books/efnafraedi-2e/05-publication/mt-preview/slug-map.mt-preview.json`** on efni branch `feat/chapter-term-check`
> and checked against the live site.

⏹ **Nothing here asks for a sync** ([USER] times it, efni `docs/decisions/2026-09-16-chapters-prepared-sync-timed-by-classroom-use.md`).
The row is inert until its target exists, so landing it early is correct.

## 1. `src/lib/data/sectionRedirects.ts` — one ADD for ch06

```ts
{
	bookSlug: 'efnafraedi-2e',
	fromChapter: '06',
	fromSlug: '6-2-likan-bors',
	toChapter: '06',
	toSlug: '6-2-likan-bohrs',
	moduleId: 'm68732'
}
```

The re-MT spelled the name right (*Líkan Bohrs*, was *Líkan Bórs*). ✅ **The other three ch06 sections keep their live
URLs**: their March titles were restored by a recorded hand repair ([USER] 2026-09-19), so no rows for m68733/m68734/m68735.

## 2. Verification after the sync — judge by BYTE SIZE, with a control

```bash
base=https://namsbokasafn.is/content/efnafraedi-2e/chapters
probe() { curl -s -o /dev/null -w '%{http_code} %{size_download}  '"$1"'\n' "$base/$1"; }
probe 06/6-2-likan-bohrs.html                      # 404 162 on 2026-09-19 → LARGE after the sync
probe 06/6-2-likan-bors.html                       # 200 195736 on 2026-09-19 → gone after; the section route redirects
probe 06/6-3-throun-skammtakenningarinnar.html     # 200 230496 on 2026-09-19 → LARGE before and after (same name)
probe 06/zz-nonsense-control.html                  # CONTROL: expect 404 162
```
