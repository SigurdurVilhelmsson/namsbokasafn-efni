# vefur redirect rows — chemistry, after the 2026-09-27 title rulings

> ⏸ **HELD UNTIL THE CHEMISTRY SYNC ([USER] 2026-09-28).** Do not land these now. At sync time, after the ② re-render,
> **recompute** them from the final titles, since a title may change before then. Land the recomputed rows first, then sync.
> The procedure is the ⏹ SYNC PRECONDITION in the register's RESUME block.

**For `../namsbokasafn-vefur/src/lib/data/sectionRedirects.ts`.** This list **replaces**
[`2026-09-20-vefur-chemistry-autorun-redirects.md`](2026-09-20-vefur-chemistry-autorun-redirects.md): that one was
written for the re-MT titles **before** [USER] ruled on them, and many of its targets are now moot, because the ruling
restored the live wording. Record: [`docs/decisions/2026-09-27-chemistry-terms-and-titles-ruling-sheet.md`](../decisions/2026-09-27-chemistry-terms-and-titles-ruling-sheet.md).

🔴 **Order matters: land these BEFORE the next chemistry sync.** vefur gates each entry on `exactSectionExists`, so
an entry is inert until its target is published. Redirect-then-sync is the only ordering with no 404 window.

**How the rows were derived:**
- **from** = the file live on namsbokasafn.is today, read from the production `toc.json` fetched 2026-09-26.
- **to** = the file the ② re-render will write: efni's own `slugify` applied to the title now in
  `02-mt-output`, after the hand repair `f313fee32`. That function reproduces all 114 current prepared file names.
- A section needs a row only when those two differ. That gives **20 rows**; the audit's earlier 62 predate the rulings.
- Two sections, 2.7 and 5.1, move even though their title did not change: their live file name was rendered from an older title.

✅ **The 2 chemistry rows vefur already has stay correct.** 10.5 (`10-5-fast-astand-efnis → 10-5-fastur-efnishamur`) and
20.3 (`20-3-aldehyd-ketonar-… → 20-3-aldehyd-keton-…`) point at titles the ruling restored, which the re-render keeps.

| § | from | to | moduleId |
|---|---|---|---|
| 1.2 | `chapters/01/1-2-efnishamur-og-flokkun-efnis.html` | `chapters/01/1-2-efnishamir-og-flokkun-efnis.html` | m68667 |
| 1.6 | `chapters/01/1-6-staerdfraedileg-medferd-nidurstadna-maelinga.html` | `chapters/01/1-6-staerdfraedileg-medferd-a-nidurstodum-maelinga.html` | m68683 |
| 2.3 | `chapters/02/2-3-bygging-atoms-og-taknmal.html` | `chapters/02/2-3-atombygging-og-taknmal.html` | m68692 |
| 2.6 | `chapters/02/2-6-jona-og-sameindaefnasambond.html` | `chapters/02/2-6-jonaefni-og-sameindaefni.html` | m68696 |
| 2.7 | `chapters/02/2-7-nafnakerfi-efna.html` | `chapters/02/2-7-nafnakerfi-efnafraedinnar.html` | m68698 |
| 5.1 | `chapters/05/5-1-grunnatridi-orku.html` | `chapters/05/5-1-grundvallaratridi-orku.html` | m68724 |
| 6.2 | `chapters/06/6-2-likan-bors.html` | `chapters/06/6-2-likan-bohrs.html` | m68732 |
| 8.2 | `chapters/08/8-2-blendingssvigrum-frumeinda.html` | `chapters/08/8-2-blendingssvigrum-atoma.html` | m68745 |
| 8.3 | `chapters/08/8-3-fjolfold-tengi.html` | `chapters/08/8-3-margfold-tengi.html` | m68746 |
| 10.1 | `chapters/10/10-1-addrattarkraftar-milli-sameinda.html` | `chapters/10/10-1-millisameindakraftar.html` | m68761 |
| 12.3 | `chapters/12/12-3-hradajofnur.html` | `chapters/12/12-3-hradalogmal.html` | m68789 |
| 12.6 | `chapters/12/12-6-hvarfgangar-efnahvarfa.html` | `chapters/12/12-6-hvarfgangar.html` | m68794 |
| 16.1 | `chapters/16/16-1-sjalfsprotti.html` | `chapters/16/16-1-sjalfgengi.html` | m68816 |
| 17.2 | `chapters/17/17-2-rafefnafrumur.html` | `chapters/17/17-2-galvaniker.html` | m68822 |
| 18.2 | `chapters/18/18-2-tilvist-og-framleidsla-daemigerdra-malma.html` | `chapters/18/18-2-tilvist-og-framleidsla-adalflokkamalma.html` | m68830 |
| 19.3 | `chapters/19/19-3-litrofs-og-segulfraedilegir-eiginleikar-hnitfloka.html` | `chapters/19/19-3-litrofs-og-seguleiginleikar-girdisambanda.html` | m68844 |
| 20.1 | `chapters/20/20-1-kolvetni.html` | `chapters/20/20-1-vetniskolefni.html` | m68846 |
| 20.2 | `chapters/20/20-2-alkohol-og-etrar.html` | `chapters/20/20-2-alkohol-og-eterar.html` | m68847 |
| 21.3 | `chapters/21/21-3-geislavirk-hrornun.html` | `chapters/21/21-3-geislasundrun.html` | m68854 |
| 21.4 | `chapters/21/21-4-umskipting-og-kjarnorka.html` | `chapters/21/21-4-frumefnabreyting-og-kjarnorka.html` | m68856 |

## As `SectionRedirect` entries

```ts
	// efni 2026-09-27 title rulings (docs/decisions/2026-09-27-chemistry-terms-and-titles-ruling-sheet.md);
	// targets exist after efni's ② re-render + the chemistry sync. Inert until then.
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '01',
		fromSlug: '1-2-efnishamur-og-flokkun-efnis',
		toChapter: '01',
		toSlug: '1-2-efnishamir-og-flokkun-efnis',
		moduleId: 'm68667'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '01',
		fromSlug: '1-6-staerdfraedileg-medferd-nidurstadna-maelinga',
		toChapter: '01',
		toSlug: '1-6-staerdfraedileg-medferd-a-nidurstodum-maelinga',
		moduleId: 'm68683'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '02',
		fromSlug: '2-3-bygging-atoms-og-taknmal',
		toChapter: '02',
		toSlug: '2-3-atombygging-og-taknmal',
		moduleId: 'm68692'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '02',
		fromSlug: '2-6-jona-og-sameindaefnasambond',
		toChapter: '02',
		toSlug: '2-6-jonaefni-og-sameindaefni',
		moduleId: 'm68696'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '02',
		fromSlug: '2-7-nafnakerfi-efna',
		toChapter: '02',
		toSlug: '2-7-nafnakerfi-efnafraedinnar',
		moduleId: 'm68698'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '05',
		fromSlug: '5-1-grunnatridi-orku',
		toChapter: '05',
		toSlug: '5-1-grundvallaratridi-orku',
		moduleId: 'm68724'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '06',
		fromSlug: '6-2-likan-bors',
		toChapter: '06',
		toSlug: '6-2-likan-bohrs',
		moduleId: 'm68732'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '08',
		fromSlug: '8-2-blendingssvigrum-frumeinda',
		toChapter: '08',
		toSlug: '8-2-blendingssvigrum-atoma',
		moduleId: 'm68745'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '08',
		fromSlug: '8-3-fjolfold-tengi',
		toChapter: '08',
		toSlug: '8-3-margfold-tengi',
		moduleId: 'm68746'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '10',
		fromSlug: '10-1-addrattarkraftar-milli-sameinda',
		toChapter: '10',
		toSlug: '10-1-millisameindakraftar',
		moduleId: 'm68761'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '12',
		fromSlug: '12-3-hradajofnur',
		toChapter: '12',
		toSlug: '12-3-hradalogmal',
		moduleId: 'm68789'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '12',
		fromSlug: '12-6-hvarfgangar-efnahvarfa',
		toChapter: '12',
		toSlug: '12-6-hvarfgangar',
		moduleId: 'm68794'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '16',
		fromSlug: '16-1-sjalfsprotti',
		toChapter: '16',
		toSlug: '16-1-sjalfgengi',
		moduleId: 'm68816'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '17',
		fromSlug: '17-2-rafefnafrumur',
		toChapter: '17',
		toSlug: '17-2-galvaniker',
		moduleId: 'm68822'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '18',
		fromSlug: '18-2-tilvist-og-framleidsla-daemigerdra-malma',
		toChapter: '18',
		toSlug: '18-2-tilvist-og-framleidsla-adalflokkamalma',
		moduleId: 'm68830'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '19',
		fromSlug: '19-3-litrofs-og-segulfraedilegir-eiginleikar-hnitfloka',
		toChapter: '19',
		toSlug: '19-3-litrofs-og-seguleiginleikar-girdisambanda',
		moduleId: 'm68844'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '20',
		fromSlug: '20-1-kolvetni',
		toChapter: '20',
		toSlug: '20-1-vetniskolefni',
		moduleId: 'm68846'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '20',
		fromSlug: '20-2-alkohol-og-etrar',
		toChapter: '20',
		toSlug: '20-2-alkohol-og-eterar',
		moduleId: 'm68847'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '21',
		fromSlug: '21-3-geislavirk-hrornun',
		toChapter: '21',
		toSlug: '21-3-geislasundrun',
		moduleId: 'm68854'
	},
	{
		bookSlug: 'efnafraedi-2e',
		fromChapter: '21',
		fromSlug: '21-4-umskipting-og-kjarnorka',
		toChapter: '21',
		toSlug: '21-4-frumefnabreyting-og-kjarnorka',
		moduleId: 'm68856'
	},
```
