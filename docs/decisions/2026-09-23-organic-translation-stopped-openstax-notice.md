# Decision: the Organic Chemistry translation is stopped and the book is removed from the website and, after that, from the public repository's current tree, because OpenStax has not authorised it

- **Date:** 2026-09-23
- **Status:** Accepted
- **Context owners:** [USER]
- **Supersedes:** the **organic half** of `docs/decisions/2026-08-22-two-book-focus-and-publication-withdrawal.md` (development scope becomes chemistry only; its three-book withdrawal stands) · `docs/decisions/2026-09-22-organic-text-before-figures-exception.md` (in full — its subject no longer exists)
- **Related:** `docs/plans/2026-07-21-post-item17-followup-campaign.md` (the register; §C109, §C190) · `docs/provenance/openstax-cnxml-licence-provenance.md` · `books/lifraen-efnafraedi/book-config.json` · `docs/decisions/2026-09-23-organic-ch01-term-rulings.md` · `docs/handoffs/2026-09-23-vefur-remove-organic-and-retire-withdrawn-books.md` · sister repo `../namsbokasafn-vefur/scripts/lib/published-books.js`

> **FROZEN EVIDENCE — banner-dated 2026-09-23.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

OpenStax answered [USER]'s request for Organic Chemistry's figure artwork by saying the translation
is not authorised. Does the project continue translating and publishing `lifraen-efnafraedi`, and if
not, what exactly is removed, from where, and what happens to work already paid for?

At stake: a book live on namsbokasafn.is, a public repository that carries its Icelandic
translation, ~1,036 ISK of machine translation bought the same day, and the project's standing with
the publisher of the books it depends on.

## Decision

**The Organic Chemistry translation stops, and the book comes off the website.** [USER], verbatim:

> *"I just received an email from OpenStax regarding my request for images for Organic Chemistry.
> They state that as it is not an original OpenStax book, but donated by the author, the translation
> rights are limited and they cannot authorize me to translate it at this time. I thought it was
> covered by the CC-BY NC SA license, but apparently they are not ready to approve my translation.
> I will honor that request so we will have to stop the Organic translation and remove it from the
> website."*

Four follow-up rulings the same day (each the recommended option of a question put to [USER]):

1. **Today's paid ch01 translation is archived outside the repository and the tree restored.** It
   was never committed. It is kept privately, outside the repository, with a manifest, checksums
   and the run logs.
2. **The public GitHub repository counts as distribution.** After the website is down, a planned
   commit removes organic's **translated** files from `main`. `01-source/` and the glossary stay.
   History is not rewritten.
3. **A reader following an old organic link** gets a short Icelandic notice at the book's landing
   URL, and 404 for every content URL. The book leaves the sitemap.
4. **The website change is made in `namsbokasafn-vefur`** through a handoff and a session there. The
   same change may also retire the three books withdrawn on 2026-08-22, which are still live.

## Reasoning

### The licence record and the publisher's position are both recorded, and this record does not resolve them

`book-config.json` records `CC BY-NC-SA 4.0`, obtained 2026-03-23, and the provenance record says
Organic Chemistry was never CC BY. OpenStax's position, as [USER] relays it, is that the book was
donated by its author, that translation rights are limited, and that they cannot authorise a
translation *at this time*. [USER] chose to honour the request. **No legal conclusion is drawn here
in either direction.** The decision rests on [USER]'s choice, not on an analysis of the licence.

### What was live, measured on 2026-09-23

- The live sitemap lists **26** organic URLs: the book's landing page, 10 book-level tool pages,
  chapter 3's index and 13 pages, and chapter 3's answer key.
- `…/content/lifraen-efnafraedi/chapters/03/3-1-virknihopar.html` returned **200, 58,444 B**. A
  nonsense path in the same directory returned **404, 162 B**. The page URLs themselves prove
  nothing, because the SPA answers 200 for every path.
- vefur's publication allowlist still names the book: `PUBLISHED_BOOKS` in
  `scripts/lib/published-books.js`.

### The public repository distributes the translation too

The repository has been public since 2026-07-25. On `main`, measured by `git ls-files`, it tracks
organic translation in **100** files under `02-mt-output/` (the July exercise MT for all 31
chapters, plus ch03 and ch12 modules), **1,969** under `03-translated/`, and **103** under
`05-publication/`. Taking only the website down would leave the same text one click away. The
removal commit comes after the website change because the website is the more visible copy and the
more urgent one.

### Why nothing is rewritten, and why the archive is outside git

A history rewrite would disturb the production server and vefur, which both track `main`, and every
clone. It also would not reliably remove the old text from a public host. So the repo removal is an
ordinary commit, and git history keeps the old versions.

Today's ch01 buy was never committed. Any git ref, even an unpushed local branch, can be pushed later
by a session that finds it. An archive outside every repository cannot. The archive's 148 files were
extracted to scratch and checked against their SHA-256 sums (148 of 148) before the tree was restored.
OpenStax said *"at this time"*, so the work is kept against a later approval, not deleted.

### Why a notice and 404, not a redirect or 503

A 301 tells search engines the move is permanent, and it has no destination here. A 503 tells them the
pages are coming back, and nothing says they will. A 404 is honest about the pages. A short notice at
the book's own URL tells a returning reader why the book is gone. Both are easy to undo if OpenStax
later agrees.

### The three books withdrawn on 2026-08-22 are still live, measured the same day

The sitemap still lists physics **27**, biology **32** and microbiology **35** URLs. A listed content
file for each returned 200 with real content: physics `4-0-introduction` 11,615 B, biology 2,243 B,
microbiology 3,770 B. vefur's allowlist stops future syncs, but nothing retired the pages already
deployed (register §C109). Removing organic needs exactly that missing step, so one change can serve
all four books.

## Consequences

- **Translation scope is chemistry only.** The organic campaign in the register is stopped:
  `api-translate`, render and sync are not run on `lifraen-efnafraedi`.
- **Superseded:** the 2026-09-22 text-before-figures exception, in full. The **organic half** of the
  2026-08-22 two-book focus. The house-style rows in `2026-09-23-organic-ch01-term-rulings.md` are
  filed under the chemistry domain and reach chemistry's export too, so they stay in force. Its
  organic-only rulings (the `atom → atóm` book preference, `shell` on ch01's wire, the by-hand run)
  have nothing left to govern.
- **A leak path stays open until [USER] closes it on production:** an editor with organic access who
  presses *Vista + Birta* renders into production's `05-publication/`, and the 2-hourly content
  backup pushes that to public `main`. Editors must be told, or organic access revoked. That cannot
  be done from a development machine.
- **Order matters.** vefur first (allowlist, deployed pages, sitemap, notice). The efni removal commit
  comes second. The armed `sync-content.yml` must not be switched on before either is done (§C109).
- **Kept, and not affected:** `01-source/` and its licence provenance. The glossary and its export.
  The house-style rulings. Everything under other books.
- **Reversing** costs a restore from the archive and git history, a re-render, and a re-sync. Nothing
  is destroyed.
- **Sunk:** ~1,036 ISK on 2026-09-23 (usage-based estimate), plus earlier organic MT spend.
- The work this creates is tracked in the register (§C190) and the vefur handoff named above. **This
  record holds no status.**

## Alternatives considered

1. **Carry on under the recorded CC BY-NC-SA licence.** Not taken. [USER] chose to honour the
   publisher's request, and this record does not re-argue that choice.
2. **Remove the website only and leave the repository as it is.** Rejected. The public repository
   distributes the same translation.
3. **Make the repository private.** Rejected as out of proportion. The repository has been public
   since 2026-07-25, and CI, links and the sister repo depend on that.
4. **Rewrite git history to remove every trace.** Rejected. It disrupts every consumer of `main` and
   would not reliably remove text a public host has already served.
5. **Commit today's paid work on the local branch, or discard it.** Rejected in favour of the external
   archive. A local commit can be pushed by mistake. Discarding throws away work that may become
   usable.
6. **404 everywhere with no notice, or 503 Retry-After.** Rejected in favour of a notice plus 404. The
   first explains nothing to a returning reader. The second promises a return nobody has committed to.
7. **Make the vefur change from this repository's session.** Rejected. The change spans vefur's
   allowlist, book registry, catalogue, front page, sitemap, deployed content and tests. vefur's own
   rules, memory and permissions govern it.
