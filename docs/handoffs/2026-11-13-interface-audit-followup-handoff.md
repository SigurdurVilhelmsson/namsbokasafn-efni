# Handoff — after the Ritstjóri interface audit (2026-11-13)

**Written:** 2026-11-13, at the close of the session that did the audit and the security fixes.
**Status of this document:** a starting brief for the next session. **It owns no status.** Open
work is owned by the active register in `docs/plans/`; if this file disagrees with the register,
the register wins. Nothing from the audit is in the register yet: [USER] decides what goes in.

**Committed on 2026-11-14, after the deploy** that brought pull requests #678, #679 and #680 live
(`main` at `c727b037`), together with the audit report. The repository is public, so four items the
security work left open on purpose are not described here: the private security note holds them.

---

## 0. Added later the same day (second session, evening of 2026-11-13)

This section is newer than everything below it. Where they disagree, this one holds.

> **Deployed, 2026-11-14:** [USER] merged #680 (`c727b037`) and ran the deploy, so #678, #679 and #680 are
> live. The two post-deploy checks of §2 were handed to [USER] the same day, with a command that runs the
> read-only query through the server's own SQLite driver (the `sqlite3` program is not installed there).

> **Later still (23:45Z):** PR #678 was MERGED (`0e4f206c`). Whether it is deployed: ask [USER];
> this file and the audit report stay uncommitted until it is. The editor fixes are no longer
> local only: the five commits were rebased onto the new `main` and pushed to
> `claude/wizardly-cori-itcxht`, draft pull request
> [SigurdurVilhelmsson/namsbokasafn-efni#679](https://github.com/SigurdurVilhelmsson/namsbokasafn-efni/pull/679)
> (`17e79f57`, `75c7f6b7`, `e262fb76`, `50e73963`, `3ae1a29e`). Read the pull request for its
> checks. Where the text below says "local branch", "not pushed" or "the patch is the only copy",
> that was true until then.

> **2026-11-14, after [USER]'s answers.** [USER] answered all thirteen open questions ("All recommendations
> accepted. Proceed."). Nine are recorded in `docs/decisions/2026-11-14-interface-audit-answers.md` and in the
> served-version spec's `✏️ AMENDED 2026-11-14` block; both are on pull request #679 (commit `da1f9d45`), whose
> description now says the two decisions are accepted. The other four (5 to 8) are recorded in the follow-up
> change below. What that leaves for #679: the native reading of its Icelandic lines, and [USER]'s merge.
>
> **Later on 2026-11-14:** #679 was merged (`6de6a8dd`). The three local commits below were stacked on the
> new `main` and pushed as ONE draft pull request,
> [SigurdurVilhelmsson/namsbokasafn-efni#680](https://github.com/SigurdurVilhelmsson/namsbokasafn-efni/pull/680)
> (`788f2e77` follow-up, `2bbad366` assignment, `e8a36d7a` Orðasafn). Read the pull request, not the table, for
> their state. The headword is called "flettiorð" on the page ([USER] 2026-11-14).
>
> **Two more changes are built and are LOCAL ONLY** (answer 13: one open pull request at a time, so each waits
> for the branch). Each is one commit on `main` `0e4f206c`, in its own worktree, with a patch sent to [USER]:
>
> | Branch (worktree) | Commit | Patch | What |
> |---|---|---|---|
> | `ia2-one-assignee` (`/tmp/claude-0/-home-user-namsbokasafn-efni/cd915628-981c-5707-8f89-deda848010df/scratchpad/ia2-wt`) | `07fd8af7` | `/tmp/claude-0/-home-user-namsbokasafn-efni/cd915628-981c-5707-8f89-deda848010df/scratchpad/ia2-one-assignee.patch` | IA-2, answer 9: a chapter has one assignee; choosing another replaces the first, on Úthlutanir and in Stjórnandi's user dialog. |
> | `sec-followup-names` (`/tmp/claude-0/-home-user-namsbokasafn-efni/cd915628-981c-5707-8f89-deda848010df/scratchpad/sec-wt`) | `cd7c69d4` | `/tmp/claude-0/-home-user-namsbokasafn-efni/cd915628-981c-5707-8f89-deda848010df/scratchpad/sec-followup-names.patch` | Answers 5 to 8: the activity log follows the reader's books; a guest reads the glossary and the pipeline status without names; the add-user dialog's note. Its own decision record is in the commit. |
> | `ia3-glossary-dialog` (`/tmp/claude-0/-home-user-namsbokasafn-efni/cd915628-981c-5707-8f89-deda848010df/scratchpad/ia3-wt`) | `30914cb4` | `/tmp/claude-0/-home-user-namsbokasafn-efni/cd915628-981c-5707-8f89-deda848010df/scratchpad/ia3-glossary-dialog.patch` | IA-3 (TE-01, TE-02, TE-04) and the correction rule [USER] chose: a translation is corrected by its proposer or a head editor until approved, never in place once approved. Its decision record is in the commit. |
>
> To publish one: once #679 is merged, restart `claude/wizardly-cori-itcxht` from `main`, cherry-pick the
> commit (or `git am` the patch), push, open a draft pull request. The follow-up shows what was open, so merge
> and deploy it in one sitting, like #678.
>
> **Known effect of answer 5 that [USER] should see before it ships:** an editor with an account and no book
> (no book-access row and no chapter) reads no timeline on Framvinda. Check who that is in production first.
>
> **Before answer 9 ships:** list the chapters that hold two assignees in production (read-only), and let
> [USER] choose who stays; the page then settles each with one choice:
> ```sql
> SELECT a.book_slug, a.chapter, COUNT(*) AS assignees, GROUP_CONCAT(u.display_name, ', ') AS names
> FROM user_chapter_assignments a JOIN users u ON u.id = a.user_id
> GROUP BY a.book_slug, a.chapter HAVING COUNT(*) > 1;
> ```
>
> **Icelandic, 2026-11-14:** [USER] read and approved every string listed up to then: #679's seven (comments
> updated in `2b7fdb4f`), #678's two, and the six of the two local commits (their comments and commit messages
> amended). The IA-3 commit adds five more that are NOT yet read: "Leiðrétta", "Leiðrétta þýðingu á “…”",
> "Orðið var vistað, en þessar þýðingar ekki: …", "Samþykkt þýðing er ekki leiðrétt beint. Leggðu til nýja
> þýðingu í staðinn.", "Aðeins sá sem lagði þýðinguna til, eða aðalritstjóri, getur leiðrétt hana."
>
> **IA-3's question was answered** ("I accept your … recommendation", option a): see the row above.

### PR #678 was reviewed and corrected

An independent review of the four security commits finished after this handoff was first
written. No blocker; twelve findings, all low after a skeptic pass. Those that were corrections to
the PR's own commits are fixed in five more commits on the same branch (`7073f353`, `9df4e43f`,
`6927de74`, `256ed95a`, `7f8b39c4`); the pull request's description lists them. Its five checks
were green on `7f8b39c4`. Read the pull request for the current verdict.

Four findings needed [USER]'s decision: who reads the activity log of which book, names on Orðasafn
for guests, names on the pipeline-status read, and a visitor who is added as an editor afterwards.
[USER] decided them on 2026-11-14 and they were fixed in #680
(`docs/decisions/2026-11-14-interface-audit-answers-logs-and-names.md`).

### IA-1 and ED-10 are built, on a LOCAL branch that is not pushed

- Branch `ia1-unsaved-text`, five commits on top of PR #678's tip `7f8b39c4`, in the worktree
  `/tmp/claude-0/-home-user-namsbokasafn-efni/0a351631-b77a-4e18-affb-43458475071b/scratchpad/ia1-wt`.
- The same five commits as a patch: `/tmp/claude-0/-home-user-namsbokasafn-efni/0a351631-b77a-4e18-affb-43458475071b/scratchpad/ia1-unsaved-text.patch` (sent to [USER] as a file).
  Checked: `git am` on `7f8b39c4` gives the same tree as the branch. **If the container is gone,
  the patch is the only copy.**
- It is not pushed because the session may push to one branch only, and that branch carries PR
  #678, which should stay a security pull request. Once #678 is merged: restart
  `claude/wizardly-cori-itcxht` from `main`, apply the five commits, push, open a draft pull
  request. If [USER] allows a second branch, push it there at once.

**What the five commits do** (each commit message has the detail):

1. A re-render never closes a row that holds unsaved text, and asks nothing (ED-03). A save
   conflict keeps the typed text (ED-02). Back, Escape, Hætta við, Endurstilla and "Nota þessa
   þýðingu" ask before they discard changed text (ED-01, ED-04). Text typed while a save is on its
   way stays (ED-18). The status line no longer claims a save after a discard.
2. The server refuses a save over an edit the page never showed, with a new code `UNSEEN_EDIT`
   (ED-05).
3. What a review of 1 and 2 found on the client: the moment between a refused save and its
   reload, the focus in a kept pane, a kept text on a row that is another editor's to finish.
4. What that review found on the server: `UNSEEN_EDIT` is checked only for a page that says it
   handles it (`handlesUnseenEdit` in the save body), so a tab left open across the deploy is not
   refused; and the replay exemption needs the category and note to match too.
5. The dark-theme edit box (ED-10): the text follows the theme. Contrast 1.2:1 before.

Tests: `server/e2e/unsaved-text.spec.js` (32 tests) and `server/e2e/edit-box-contrast.spec.js`.
Run on the final branch in this container: `npm run lint`, `npm run format:check`, the whole
Playwright suite, and `npm test` (its only failures there are the three root-permission files of
§4). Each editor fix was also checked by undoing it and seeing its test fail. CI has not seen the
branch.

**It changes two recorded decisions, and [USER] has ruled on neither:**

1. Plan decision 30 of the served-versions work kept a live conflict on "today's
   alert-and-reload". The conflict now keeps the text.
2. The served-version spec (§5.6 step 4) gets a refusal code, `UNSEEN_EDIT`, a body field
   (`handlesUnseenEdit`) and two Icelandic texts that [USER] has not approved. It is commits 2 and
   4 of the five; dropping them leaves the rest standing, apart from one line of the client that
   reloads after "Beita víðar".

**Icelandic that needs a native reading** (in `server/public/js/ui-strings.js` unless noted):
`save.nothingUnsaved`, `confirm.leaveDiscards`, the last sentence of `confirm.draftRecovery`,
`draftNotice.conflict`, `draftNotice.rowNotYours`, `draftNotice.unseenEdit`, and the server's
`UNSEEN_EDIT` message in `server/services/servedEdit.js`. Older and noticed on the way:
"Fundust 1 óvistuð drög" for a count of one.

**Open questions for [USER]:**

- Back still throws unsaved text away after OK (the question now says so). Closing the tab keeps
  a draft instead. Whether Back should keep a draft too is a design choice; the tests pin the
  discard.
- A kept text cannot be saved while its row shows another editor's undecided edit. The block
  lifts by the row's own Breyta rule: when that edit is rejected, put in discussion or published.
  An approved, unpublished edit still blocks. Is that the rule wanted?

**Left for later, on purpose** (found by the reviews; each is real and none is new):
a note or a category alone does not count as unsaved; a save already queued for retry still lands
after the editor discards the pane; the editor's own pending edit hidden under a newer edit that
is not in flight can still be overwritten unseen; a kept text can appear in a second tab of the
same unit; drafts and queued saves are not keyed by user; figure cards are rebuilt by every
reload; a row left in place is not told that a newer edit of it arrived until its Vista is
refused; a replay that named its own row still inserts a second row once that row is approved;
concurrent reloads have no sequence guard; the `UNSEEN_EDIT` research event carries two hashes
and no edit id.

### Not started

IA-2 (needs [USER]'s answer on one assignee per chapter or several), IA-3, and everything after
them in §3.

### How this session worked, against §4 below

Three review workflows ran (three reviewers and three skeptics each): the previous session's
review of PR #678, then one on the IA-1 design before building and one on the code after. §4's
"no agent fleets" was written after eighteen readers ran at once; these were six agents each.
They found defects that the tests and one reader had missed (a stale tab that could still
overwrite a note, a kept text lost to Escape in the second after a refused save), but they are
not cheap: about two million tokens each. Decide with [USER] before running another.

---

## 1. What exists, and where

| What | Where | State |
|---|---|---|
| The audit report | `docs/audit/2026-11-13-interface-walkthrough-audit.md` | On disk, **not committed**. Frozen evidence, taken at `main` `e387f308`. |
| The private security note | `/tmp/claude-0/-home-user-namsbokasafn-efni/cd915628-981c-5707-8f89-deda848010df/scratchpad/report/security-findings-private-2026-11-13.md` | Outside the repository. [USER] has a copy. |
| Four security commits | branch `claude/wizardly-cori-itcxht`, on top of `e387f308` | Pushed 2026-11-13 on [USER]'s word; draft pull request [SigurdurVilhelmsson/namsbokasafn-efni#678](https://github.com/SigurdurVilhelmsson/namsbokasafn-efni/pull/678). Whether it is merged and deployed: read the pull request, not this line. See §2. |
| The same four commits as a patch | `/tmp/claude-0/-home-user-namsbokasafn-efni/cd915628-981c-5707-8f89-deda848010df/scratchpad/security-fixes-2026-11-13.patch`, also sent to [USER] as a file | Checked: `git am` on `e387f308` gives the same tree as the branch. Use it if the container is gone. |
| Screenshots from the walkthrough | `server/test-results/interface-audit-2026-11-13/` (git-ignored) | 175 images, with page text. Lost if the container is reclaimed. |

**The report's finding ids** are `SH` (whole application), `HM` (Heim), `ED` (Ritill), `LO`
(Aðlögun), `TE` (Orðasafn), `PR` (Framvinda), `AS` (Úthlutanir), `AD` (Stjórnandi), `BK`
(Bókasafn), `SP` (small pages), `DO` (documents). Its §8 holds fourteen draft register entries,
`IA-1` to `IA-13` and `IA-SEC`. **They are drafts.** Do not write them into `docs/plans/`.

Seven cross-reference ids in the report's §1 and §2 were wrong and were corrected on disk after
[USER] saved a local copy (lines 98, 102, 107, 110, 157, 218, 292: the `SH` and `ED` ids now
match §4). The findings themselves did not change.

---

## 2. The security fixes

Four commits. Each has tests that fail on the code as it was.

| Commit | Subject | What changes for people |
|---|---|---|
| `e2c6d678` | fix(admin): show analytics values as text; hold event place fields to plain text | Nothing visible. The public event route refuses a `book`, `chapter` or `section` that is not short plain text (400). |
| `141bf663` | fix(status): ask for a role on the routes that name team members | A guest no longer gets the timeline on Framvinda; the page shows one new line in its place. The team dashboard and the per-person figures are for head editors and admins. |
| `88d835b3` | fix(auth): decide each request from the account row, not from the token's copy | Deactivating an account, changing a role or taking a book away holds from the person's next request. Before, it held only after their sign-in ran out (up to 24 hours). |
| `1ce9e5bf` | fix(activity): hold the log search to the reader's books | A head editor reads the activity log of their own books only. |

**Before merging**

- Read the one new Icelandic line. It is in `server/views/status.html`, in `loadTimeline`:
  "Tímalínan er aðeins sýnileg yfirlesurum og ritstjórum." *(needs native reading)*
- The repository is public and the branch is pushed, so what was open is visible. Merge and
  deploy in one sitting (`./scripts/deploy.sh` on the server), and soon.
- Before the push, on 2026-11-13, `npm test`, the lint and format checks and the Playwright
  suite were run locally against these commits; the only failures were the three
  root-permission files named in §4. The verdict is the pull request's checks, not this line.

**After the deploy**

- Look for markup already stored by the public event route. Run it on the server, read-only:
  ```sql
  SELECT id, event_type, book, chapter, section, metadata, created_at
  FROM analytics_events
  WHERE book LIKE '%<%' OR chapter LIKE '%<%' OR section LIKE '%<%' OR metadata LIKE '%<%';
  ```
  Rows found there are harmless once the fix is live (the admin page now shows them as text),
  but they say whether anyone tried. A search query may hold a `<` innocently, so read the
  `metadata` hits before concluding anything. Tell [USER] what is found; do not delete rows
  unasked.
- Deactivate a test account and confirm that its open session is refused.

**Left open on purpose:** four items, each needing a decision rather than a patch. They are in the
private security note, not here, because the repository is public.

---

## 3. The other findings: recommended order

One item at a time, in ordinary sessions. Each item below names the report section to read
first.

### First batch (each is verified live, and each loses or misdirects a teacher's work)

| Draft entry | Findings | Report | In short |
|---|---|---|---|
| **IA-1** Unsaved text in the segment editor | ED-01 to ED-05 | §4.3 | Four ways to lose typed text without a warning: "← Til baka", a save conflict answered with OK, Escape, a stale second tab. Two of them end with "Allar breytingar vistaðar". |
| **IA-2** Chapter assignment replaces nobody | AS-01, AS-02 | §4.7 | Changing the assignee adds a second, hidden one; "— Óúthlutað —" then removes the wrong person. |
| **IA-3** Orðasafn edit and add dialog | TE-01, TE-02, TE-04 | §4.5 | "Breyta orðhausu" saves two fields and drops the rest; after one cancelled "Bæta við þýðingu", "Vista" fails for every new term until reload. |

### Three decisions [USER] has to make before the larger entries

1. **Is "Senda til yfirlestrar" a real step?** It works once per module and never again
   (ED-07), and "Yfirlestrar" is not a queue (ED-08). IA-5 depends on the answer.
2. **Do teachers localize, or only head editors?** The menu, the server and the documents
   disagree (LO-02). IA-7 depends on the answer.
3. **One assignee per chapter, or several?** The server allows several; the screen shows one
   (AS-01). IA-2 depends on the answer, so ask this one first.

### Before teachers are invited

- **IA-4, the front page** (HM-01 to HM-04, SH-12; §4.2). A new editor, an editor with a
  chapter and a guest all read "Þú hefur lokið öllum verkefnum." No page shows an editor
  which chapters are theirs.
- **The dark-theme edit box** (ED-10; §4.3). Text contrast in the edit box is 1.2:1. The fix
  is small: the layer behind the text box needs the theme's text colour
  (`server/public/css/common.css`).

### After that

IA-5 (review loop), IA-6 (error messages), IA-8 (names instead of identifiers), IA-9 (editing
page for reviewers), IA-10 (accessibility), IA-11 ("Skoða sem"), IA-12 (documents). The report's
§7 lists what could be removed or collapsed for the editor role.

### What the audit did not establish

- **Appendix A8 holds 478 reader flags that nobody re-checked.** They are hypotheses. Check a
  page's flags when that page is being worked on; do not work through the list.
- **Bókasafn and saving in Aðlögun were never walked live** (IA-13). A second pass needs a
  test database with a synced catalogue and one module with a faithful file. Both need steps
  the audit's ground rules ruled out, so ask [USER] before setting that up.

---

## 4. How to work

- **A finding is a claim about `e387f308` on 2026-11-13.** Reproduce it before fixing it.
  "Verified live" means it was seen in the browser that day; "code only" means it was read.
- **One defect, one test that fails first.** For anything a user sees, that is a Playwright
  spec in `server/e2e/`. `npm test` does not run Playwright.
- **No agent fleets.** The audit's first phase ran eighteen readers at once and used up
  [USER]'s weekly limit. Read and fix directly.
- **Icelandic copy:** mark every new or changed line *(needs native reading)* and list them
  for [USER] at the end of the session.
- **Before/after runs:** copy the file aside first, restore from that copy, and `cmp`. Not
  `git stash`, not `git checkout --` (CLAUDE.md has the reasons).

### Running the interface locally

The E2E fixture edits real `efnafraedi-2e` modules, so run the server in a separate worktree
and check `git status` before and after.

```bash
git worktree add /tmp/ritstjori-walk HEAD
```

```bash
cd /tmp/ritstjori-walk/server && npm ci
```

```bash
cd /tmp/ritstjori-walk/server && npx playwright test --config=e2e/playwright.config.js --trace off
```

- The config (`server/e2e/playwright.config.js`) starts the server on port 3456 with a
  throwaway database (`pipeline-output/e2e-sessions.db`), seeded by `server/e2e/seed-fixture.js`.
  Its `webServer.command` is the line to copy when the server should stay up for a manual
  walk.
- Sessions come from `server/e2e/helpers/auth.js` (`loginAs(page, role)`). Its tokens have no
  account row, except user `90123` (an editor with chapter 2 of `efnafraedi-2e`).
- A member in production always has an account row. To see what a member sees, add rows to
  the throwaway database for the helper's ids (admin `99999`, head editor `99998`, editor
  `99997`). The assignment dropdown lists only people with a `user_book_access` row for the
  book.
- The first saved edit of a module writes `<module>-segments.locked` under
  `books/<book>/02-mt-output/`. The suite's teardown removes the ones it added; a manual walk
  has to remove its own. They are git-ignored, so `git status` does not show them.
- **Never click** a control that applies, renders, publishes, translates or syncs. The
  report's appendix A7 lists each one and what it would do.

### Known in this container

- **The Playwright suite cannot launch a browser with the repo's config as it is.** The repo
  pins a newer `@playwright/test` than the browser build installed here, so every test fails
  within milliseconds, before any page loads. Do not run `playwright install`. Put a local
  config beside the real one in the throwaway worktree and run with
  `--config=e2e/playwright.local.config.js`:
  ```js
  const base = require('./playwright.config.js');
  module.exports = {
    ...base,
    use: { ...base.use, launchOptions: { executablePath: '/opt/pw-browsers/chromium' } },
  };
  ```
- A stopped Playwright run leaves its server on port 3456, and the next run reuses it. Check
  the port before starting another.

- Three test files fail here and are not a result of any change: the container runs as root,
  and each depends on a file permission being refused (`chmod`, then expect `EACCES`).
  `server/__tests__/booksDownloadStreamFailure.test.js`,
  `server/__tests__/glossaryExportRun.test.js` and `tools/__tests__/figure-run-paid.test.js`.
  The first two were also run on unchanged `main` sources and fail there the same way. Read
  CI for the verdict on these three.
