# Editor Test Checklist — Post-Audit (2026-03-12)

**Setup:** Start server (`cd server && npm start`), log in as admin, keep DevTools console open.

---

## A. Segment Editor — Book & Chapter Selection

**A1.** Select "Efnafræði 2e" from the book dropdown. Does the chapter dropdown populate with titled chapters (e.g., "Kafli 1 — ...")?

> Answer:

**A2.** Does "Viðaukar" appear at the bottom of the chapter list (NOT "Kafli -1")?

> Answer:

**A3.** Select Kafli 1. Do module cards appear with human-readable titles (e.g., "Introduction") and not just raw IDs like "m68663"?

> Answer:

**A4.** Click a module card. Does the segment table load with EN/IS pairs?

> Answer:

---

## B. Segment Editor — Appendices

**B1.** Select "Viðaukar" from the chapter dropdown. Do module cards load?

> Answer:

**B2.** Does the metadata bar above the segments show "Viðaukar" (not "Kafli -1")?

> Answer:

**B3.** After viewing appendices, switch back to a normal chapter (e.g., Kafli 2). Does it load correctly?

> Answer:

---

## C. Segment Editor — Edit Panel Lifecycle

**C1.** Click a segment row to open its edit panel. Type some text. Click "Hætta við" to close. Now click the SAME segment to reopen. Type again. Does the "Breytt" indicator appear only once (no doubled/flickering effects)?

> Answer:

**C2.** With an edit panel open and text modified (not saved), change the filter dropdown. Does a confirmation dialog appear asking "Opin klippispjöld verða lokuð. Viltu halda áfram?"?

> Answer:

**C3.** Click "Cancel" on that dialog. Does the edit panel stay open with your text intact?

> Answer:

**C4.** Click "OK" on the dialog. Does the filter change and the edit panel close cleanly?

> Answer:

---

## D. Segment Editor — Save

**D1.** Open an edit panel, make a change, click "Vista". Does it save successfully with a "Vistað" indicator?

> Answer:

**D2.** After saving, does the module reload and show your edit in the edits column?

> Answer:

**D3.** Any errors in the browser console during or after the save?

> Answer:

---

## E. Segment Editor — Escape Key

**E1.** Type a term in the terminology lookup input (top area). When results appear, press Escape. Do the **term results** close (without closing any edit panel)?

> Answer:

**E2.** Now open an edit panel and press Escape. Does the edit panel close (with a confirmation if you had typed unsaved text)?

> Answer:

---

## F. Segment Editor — Terminology Lookup

**F1.** Open an edit panel for any segment. Type a chemistry term (e.g., "atom", "efni") in the terminology lookup input. Do results appear?

> Answer:

**F2.** Click a result. Is the Icelandic term inserted into your textarea at the cursor position?

> Answer:

**F3.** Blur the lookup input and immediately click back into it. Do the results stay visible (no flash of closing and reopening)?

> Answer:

---

## G. Segment Editor — Navigate Away During Save

**G1.** Open an edit panel, click "Vista", then immediately click "Til baka" (back button). Does the page return to the module list without crashing?

> Answer:

**G2.** Any errors in the console?

> Answer:

---

## H. Localization Editor — Book & Chapter Selection

**H1.** Navigate to the Staðfærsla (Localization) page. Select "Efnafræði 2e". Does the chapter dropdown populate?

> Answer:

**H2.** Does "Viðaukar" appear in the chapter list?

> Answer:

**H3.** Select Kafli 1. Do module cards show **titles** (not just "m68663") with the module ID as smaller secondary text?

> Answer:

---

## I. Localization Editor — Appendices

**I1.** Select "Viðaukar" from the chapter dropdown. Do modules load (not blank)?

> Answer:

**I2.** If you click into a module, does the metadata show "Viðaukar" (not "Kafli -1")?

> Answer:

---

## J. Localization Editor — Autosave Safety

_(Only testable if at least one module has Pass 1 faithful files. If none exist, write "N/A — no faithful files".)_

**J1.** Load a module that has Pass 1 content. Make a change in a localized textarea. Wait ~30 seconds. Does autosave trigger without errors?

> Answer:

**J2.** Click "Til baka" to navigate away, then wait 10 seconds. Any console errors from autosave firing after navigation?

> Answer:

---

## K. Multi-Book

**K1.** In the segment editor, switch to "Líffræði 2e". Does the chapter dropdown show Kafli 3?

> Answer:

**K2.** Switch to "Örverufræði". Does it show Kafli 1?

> Answer:

**K3.** Switch back to "Efnafræði 2e". Does the full chapter list return?

> Answer:

---

## L. Cross-Tab & Network Errors

**L1.** Open the segment editor and load a module. Open a second browser tab to the same module. Does the second tab show a cross-tab conflict warning?

> Answer:

**L2.** In DevTools, set Network to "Offline". Try to save an edit. Does an error message appear (not a silent failure)?

> Answer:

**L3.** Re-enable network. Does the retry succeed?

> Answer:

---

## M. Console Health

**M1.** After completing all tests above, review the browser console for the entire session. Any uncaught exceptions or "Cannot read properties of null" errors?

> Answer:

**M2.** Any unexpected 4xx or 5xx errors in the Network tab?

> Answer:

---

## N. Other Pages (Quick Smoke)

**N1.** Does the /status (Framvinda) page load?

> Answer:

**N2.** Does the /admin page load (if logged in as admin)?

> Answer:

---

## Summary

**Total questions:** 38
**Passed:**
**Failed:**
**N/A:**

**Issues found (list any problems here):**

1.
2.
3.
