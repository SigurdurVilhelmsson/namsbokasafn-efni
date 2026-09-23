# Handoff → namsbokasafn-vefur: remove Organic Chemistry from the website, and retire the three books withdrawn on 2026-08-22

**From:** efni, 2026-09-23 · **For:** a Claude session started in `namsbokasafn-vefur` (read its CLAUDE.md and memory first)
**Ruling:** [`docs/decisions/2026-09-23-organic-translation-stopped-openstax-notice.md`](../decisions/2026-09-23-organic-translation-stopped-openstax-notice.md) (efni). **Status of this work is owned by efni's register §C190**, not by this file.

> This handoff is a **dated brief**, not a live document. Everything under "measured" was measured on
> 2026-09-23 and will drift. Re-measure before relying on any of it.

## Why

OpenStax told [USER] that Organic Chemistry is not an original OpenStax book (its author donated it),
that translation rights are limited, and that they cannot authorise a translation *at this time*.
[USER] is honouring that. **The Icelandic Organic Chemistry must come off namsbokasafn.is.** The same
change should also finish the 2026-08-22 withdrawal of physics, biology and microbiology, which was
never completed on the live site.

## What [USER] ruled for readers (organic)

- **At the book's landing URL `/lifraen-efnafraedi`:** a short Icelandic notice that the book has been
  withdrawn. Suggested wording, for [USER] to approve:
  *"Lífræn efnafræði hefur verið tekin úr birtingu. Þýðing bókarinnar hefur ekki fengið heimild frá
  OpenStax að svo stöddu."*
- **Every other organic URL returns 404**: the reader pages, the book-level tools (`ordabok`,
  `minniskort`, …), `kafli/03/*`, `svarlykill/3`, and `/content/lifraen-efnafraedi/**`.
- **Out of the sitemap, off the front page and out of the catalogue.**
- **Not a 301, and not a 503.** A 301 claims a permanent move and has no destination. A 503 promises
  a return nobody has committed to.
- **Reversible.** If OpenStax later agrees, the book comes back from efni's tree plus a re-sync.

## What is live today (measured 2026-09-23)

- **Sitemap URL counts:** organic **26**, physics `edlisfraedi-2e` **27**, biology `liffraedi-2e`
  **32**, microbiology `orverufraedi` **35**; chemistry **269** is the control that stays.
- **Organic's 26 URLs:** `/lifraen-efnafraedi` · `/ordabok` · `/minniskort` · `/lotukerfi` · `/prof` ·
  `/greining` · `/markmid` · `/bokamerki` · `/atridiordasskra` · `/nam` · `/yfirlit` · `/kafli/03` and
  its 13 pages (`3-0-introduction` … `3-7-afbrigdi-annarra-alkana`, `3-key-terms`, `3-summary`,
  `3-chemistry-matters`, `3-additional-problems`, `3-exercises`) · `/svarlykill/3`.
- **Content files**, judged by BYTE SIZE:

  | URL | status | bytes |
  |---|---|---|
  | `/content/lifraen-efnafraedi/chapters/03/3-1-virknihopar.html` | 200 | **58,444** |
  | `/content/lifraen-efnafraedi/chapters/03/zz-nonsense-control.html` (control) | 404 | 162 |
  | `/content/edlisfraedi-2e/chapters/04/4-0-introduction.html` | 200 | 11,615 |
  | `/content/liffraedi-2e/chapters/03/3-0-introduction.html` | 200 | 2,243 |
  | `/content/orverufraedi/chapters/01/1-0-introduction.html` | 200 | 3,770 |

- `scripts/lib/published-books.js`: `PUBLISHED_BOOKS = ['efnafraedi-2e', 'lifraen-efnafraedi']`.

## 🔴 Traps. Each one is stated in vefur's own code, so read the code, not only this list

1. **Removing organic from `PUBLISHED_BOOKS` freezes it; it does not remove it.** `deploy-excludes.js`
   turns every held-back book into an rsync `--exclude`, and **`--delete` protects excluded paths on
   the server**. That is how the three August books stayed live. The allowlist change is necessary,
   but on its own it leaves organic exactly where it is today.
2. **A deleted page is a soft-404, not a 404.** `svelte.config.js` has `fallback: '200.html'` and
   nginx does `try_files … /200.html`, so a missing page answers **200 with the SPA shell**. A real 404
   needs server-side work (nginx `location` rules, or a route that returns a real 404 status). Check
   what the SPA routes `/lifraen-efnafraedi/*` render once the registry entry is gone or flagged. They
   may be prerendered from `src/lib/types/book.ts`.
3. **Key on the slug, never on the status.** Four books carry `status: 'preview'`, chemistry is the
   exception. Code that filters "preview books" hits the wrong set.
4. **The sitemap generator reads the CONTENT DIRECTORY** (`scripts/generate-sitemap.js`,
   `CONTENT_DIR = 'static/content'`), not the book registry. Removing registry or catalogue entries
   leaves every URL in the sitemap.
5. **Half-withdrawal is worse than none.** Deleting pages while any `chapters/NN/` remains gives a
   *visible* book with empty chapters (`generate-toc` still exits 0).
6. **Tests pin the books.** `published-books.test.js`, `deploy-excludes.test.js` (it names
   `lifraen-efnafraedi`), `sync-content.test.js`, `book.test.ts`, `bookCredits.test.ts`,
   `sectionRedirects.test.ts`, `glossaryTerms.test.ts`, `e2e/glossary-gating.spec.ts`. `npm test` runs
   before the build in the deploy path, so a red test blocks the deploy.
7. **`src/lib/data/sectionRedirects.ts` has three organic ch03 entries.** Once the book is gone they
   point at withdrawn pages. Remove them, or they turn a 404 into a redirect to a 404.
8. **On the efni side, `sync-content.yml` is armed.** It runs a bare all-books sync and fails only for
   lack of `VEFUR_DEPLOY_TOKEN`. Nobody may create that secret before this work is done (efni
   register §C109).

## The three August books

The 2026-08-22 ruling calls their withdrawal *"a reversible pause"*. §C109 records two questions for
[USER] that are still open: ① whether "all published material" also covers chemistry's `faithful`
track and non-chapter surfaces; ② whether `orverufraedi`, which has no publication-scope record, is
treated the same. **Ask [USER] which signal they get** (organic's notice + 404, or 404 alone) and
answer ① and ② before removing them. The mechanism is the same one organic needs, so build it once.

## Acceptance: what must be true afterwards (measure each, with its control)

- Each organic content file listed above returns **404** with a small body. A chemistry content file
  still returns **200** at its real size (the control).
- `curl -s https://namsbokasafn.is/sitemap.xml | grep -c lifraen-efnafraedi` → **0**, and chemistry's
  count is unchanged.
- `/lifraen-efnafraedi` shows the notice. **Check the HTTP status as well as the look**: the notice
  page's status is a design choice, so choose it on purpose.
- Organic appears nowhere on the front page, in the catalogue, or in any book switcher.
- A bare `node scripts/sync-content.js --source ../namsbokasafn-efni` does **not** bring organic back,
  and neither does the next deploy (trap 1 in reverse).
- The same checks for the three August books, once their signal is ruled.

## What efni does, and when

- **After** the site is verified down: efni removes organic's **translated** files from `main` in an
  ordinary commit, and updates the tests pinned on them. Measured 2026-09-23: 100 tracked files under
  `02-mt-output/`, 1,969 under `03-translated/`, 103 under `05-publication/`. `01-source/` and the
  glossary stay, and history is not rewritten.
- **[USER], on production:** tell the editors, or revoke organic access. An organic *Vista + Birta*
  renders into production's `05-publication/`, and the 2-hourly backup pushes it to public `main`.
- Report back to efni by editing nothing in efni. [USER] relays the result, or a paired efni session
  re-measures it (efni CLAUDE.md § Cross-repo: re-measure a relayed finding).
