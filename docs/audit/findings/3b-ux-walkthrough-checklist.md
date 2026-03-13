# Manual UX Walkthrough — Editing System Audit

**Date:** 2026-03-13
**Tester:** Siggi
**Server:** localhost:3456

## Instructions

Walk through each question below. Log in with the role specified and navigate
through the system naturally. Fill in Pass/Fail and any notes.

---

## A. Logical Progression (as contributor)

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 1 | From /my-work, can you figure out what to do first? Is there a clear call-to-action? | Yes |The contributor seems able to assign work to others. Isn't that supposed to be the main editor/ editor's responsibility? The roles need revisiting, i.e. which tasks belong to which role. |
| 2 | Does the segment editor make clear: what you're looking at, what to change, and how to save? |Yes | |
| 3 | Is the relationship between Pass 1 (Ritstjóri) and Pass 2 (Staðfærsla) obvious from the nav? | Contributor (Þátttakandi) does not have access to Staðfærsla| |
| 4 | Does /progress tell you where each chapter is and what needs to happen next? |No |Abbreviations in header are not transparent (descriptive) and contrast between different marks (fill color in dots) is not clear |
| 5 | After submitting for review, is it clear what happens next? Where do you find the result? |No | After pressing "Senda til yfirferðar" there is no feedback and no change on the page|
| 6 | After a review is completed (approved/rejected), do you see clear feedback on /my-work? | As "Þátttakandi" I can see there is one item waiting for review but no info on what that item is or what happens next. In the Editor role (on the production server) I see (on the /my-work, redirected to root page) a hero box saying "Ekkert verkefni í dag", below that it shows 16 waiting for review but no list of reviews waiting and no obvious route to where the review takes place.| |

## B. Icelandic UI Consistency

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 7 | Are all user-facing labels, buttons, and messages in Icelandic? List any English text found. | No|Landing page: "Tímafrestur" has "Undefined"; "Nýleg virkni" has a mix of English/Icelandic: "SigurdurVilhelmsson saved edit on m68664:m68664:title:auto-1 fyrir 9 mín" |
| 8 | Are error messages in Icelandic? (Try saving without changes, or with empty fields) |Yes |The error messages I've seen are in Icelandic. However, the editor is broken. When editing as a "Þátttakandi", after changing a translation and saving, when I reopen the segment, the edit is reverted back to the original. This is a major problem! The editor works on admin, main editor and editor roles, but not in "Þátttakandi"|
| 9 | Are role names displayed consistently (all Icelandic or all English)? |Yes | |
| 10 | Are pipeline stage names in Icelandic on user-facing pages? (Check /progress) |Mostly | In admin and Main editor views the render+inject labels for the pipeline are in English|

## C. Navigation & Discoverability

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 11 | Can you reach every relevant page from the sidebar without guessing URLs? |Yes |However, when in the editor, when I press the top button "Til baka" (not browser button but view interface button" I go back to chapter selection and infinite spinning wheel |
| 12 | Do page titles orient you? (Which book? Which chapter? Which module?) |Yes | However, I get the feeling there are many routes into each panel and/or panels are repeated in multiple views, which is a bit disorienting. I'm not always sure I'm in the right place according to my supposed workflow i.e. the workflow itself is not clear from the panels and descriptions. I'm worried non-technical user will get lost very fast.|
| 13 | When you complete an action (save/submit/approve), is the next step obvious? | No| There is intermittent feedback, no instructions on what to do next, the status page (my work) is not intuitive.|
| 14 | Does /my-work surface the right priorities? | It seems to list what work needs to be done, but no clear instructions on how and where| |

## D. Multi-Book Experience

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 15 | Is switching between books smooth in the editor? | Yes|There is still a duplicate of Líffræði 2e in the dropdown |
| 16 | Are books visually distinguishable (colors, labels, icons)? | No|Only distinction between books is the name |
| 17 | Does /progress show all three books clearly? | No| The /library view shows a progress bar for each book, but they are wildly inaccurate. For example, the Microbiology book shows 71% progress when only one chapter has been machine translated as a sample. The /progress mixes all books together and no way to see what belongs to which book and if the progress is even accurate.|
| 18 | After switching books, does the editor reset correctly (no stale chapter/module)? | Yes| |

## E. Error States & Feedback

| # | Question | Pass/Fail | Notes |
|---|---|---|---|
| 19 | What happens when you try to edit without selecting a module? | |Is that even possible? I wouldn't know how to try that. |
| 20 | What happens when a save fails? Is the error message helpful? | Yes| |
| 21 | Is the cross-tab warning clear about what to do? | Yes| |
| 22 | When network is slow, is there loading feedback (spinners, skeleton, etc.)? |Dont know | |

---

## Summary

**Total checks:** 22
**Passed:** ___
**Failed:** ___
**Critical issues found:** ___

**Top 3 UX concerns:**
1.
2.
3.
