# Manual Test Plan — Editor UX (Post-Audit Iterations 1–4)

**Date:** 2026-03-12
**Scope:** Segment editor, localization editor, server routes
**Prerequisite:** Server running (`cd server && npm start`), logged in as admin

---

## Setup

1. Start the server: `cd server && npm start`
2. Open browser to `http://localhost:3000` (or your domain)
3. Log in via GitHub OAuth (admin account)
4. Keep browser DevTools console open throughout — watch for errors

---

## A. Segment Editor — Basic Flow

> Navigate to: **Ritstjóri** (Editor) page

### A1. Book & Chapter Selection

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 1 | Select "Efnafræði 2e" from book dropdown | Chapter dropdown populates | ☐ |
| 2 | Verify chapter list shows "Kafli 1 — ..." through "Kafli 21 — ..." | Chapters have Icelandic titles | ☐ |
| 3 | Verify **"Viðaukar"** appears at the end of the chapter list | Not "Kafli -1" | ☐ |
| 4 | Select Kafli 1 | Module cards appear with titles and badges | ☐ |
| 5 | Verify module cards show titles (e.g., "Introduction") not just "m68663" | Title enrichment working | ☐ |
| 6 | Click a module card (e.g., m68663) | Segment table loads | ☐ |

### A2. Appendices

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 7 | Select "Viðaukar" from chapter dropdown | Module cards load for appendices | ☐ |
| 8 | Verify module metadata bar shows "Viðaukar" not "Kafli -1" | Display fix working | ☐ |
| 9 | Click a module card | Segments load normally | ☐ |
| 10 | Navigate back, select a normal chapter (e.g., Kafli 2) | Modules load correctly | ☐ |

### A3. Edit Panel — Open/Close/Reopen

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 11 | Click a segment row to open edit panel | Panel opens, textarea focused | ☐ |
| 12 | Type some text in the textarea | "Breytt" indicator appears on the row | ☐ |
| 13 | Click "Hætta við" to close the panel | Panel closes | ☐ |
| 14 | Click the SAME segment again to reopen | Panel opens cleanly | ☐ |
| 15 | Type text again | Only ONE "Breytt" indicator (no doubled effects) | ☐ |
| 16 | Check console for errors | No errors | ☐ |

> **What this tests:** P1 — listener accumulation fix. If broken, typing in step 15 would fire events multiple times.

### A4. Filter Guard (Dirty Edit Protection)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 17 | Open an edit panel and type some text (don't save) | Panel open, text modified | ☐ |
| 18 | Change the filter dropdown (e.g., "Allt" → "Klárað") | **Confirmation dialog** appears: "Opin klippispjöld verða lokuð..." | ☐ |
| 19 | Click "Cancel" on the dialog | Filter does NOT change, edit panel stays open with text intact | ☐ |
| 20 | Change filter again, click "OK" | Filter changes, edit panel closes, dirty state cleared | ☐ |

> **What this tests:** O1 — filter re-render protection.

### A5. Save and Refresh

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 21 | Open an edit panel, type a change, click "Vista" | Save succeeds, "Vistað" indicator appears briefly | ☐ |
| 22 | Module reloads and shows the edit in the segment row | Edit visible in edits column | ☐ |
| 23 | Check console — no re-entrancy warnings or errors | Clean | ☐ |

> **What this tests:** O2 — force reload after save, O3 — null guard.

### A6. Escape Key Behavior

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 24 | Type a term in the terminology lookup input (top right) | Results dropdown appears | ☐ |
| 25 | Press Escape | **Terminology results close** (not the edit panel) | ☐ |
| 26 | Open an edit panel, then press Escape | Edit panel closes (with confirmation if dirty) | ☐ |

> **What this tests:** O5 — Escape closes term lookup first.

### A7. Terminology Lookup

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 27 | Open an edit panel for any segment | Textarea focused | ☐ |
| 28 | Type a chemistry term in the lookup input (e.g., "atom") | Results appear | ☐ |
| 29 | Click a result to insert it | Term inserted into the textarea at cursor position | ☐ |
| 30 | Blur the lookup input, then immediately re-focus it | Results should NOT flash closed and reopen | ☐ |

> **What this tests:** P2 — terms API field names, P6 — blur timeout fix.

### A8. Navigate Away During Save

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 31 | Open an edit panel and click "Vista" | Save starts | ☐ |
| 32 | Immediately click "Til baka" (back button) | No crash, no console error | ☐ |
| 33 | Re-navigate to the same module | Module loads normally | ☐ |

> **What this tests:** O3 — null moduleData guard.

---

## B. Localization Editor

> Navigate to: **Staðfærsla** (Localization) page

### B1. Book & Chapter Selection

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 34 | Select "Efnafræði 2e" | Chapter dropdown populates | ☐ |
| 35 | Verify **"Viðaukar"** appears in chapter list | Not "Kafli -1" | ☐ |
| 36 | Select Kafli 1 | Module cards appear | ☐ |
| 37 | Verify module cards show **titles** (not just "m68663") | O8 enrichment working | ☐ |
| 38 | Verify module ID shown as secondary text (smaller, gray) | Layout correct | ☐ |

### B2. Appendices in Localization Editor

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 39 | Select "Viðaukar" from chapter dropdown | Modules load (not blank) | ☐ |
| 40 | Verify metadata shows "Viðaukar" not "Kafli -1" | P4 fix working | ☐ |

### B3. Module Loading (if Pass 1 content exists)

> **Note:** If no faithful translation files exist yet, modules will show "Vantar Pass 1" and be unclickable. If you have applied approved edits for any module, test these:

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 41 | Click a module with "Pass 1" badge | Three-column view loads (EN / Faithful IS / Localized IS) | ☐ |
| 42 | Make a change in a localized textarea | "Breytt" indicator appears | ☐ |
| 43 | Wait 30 seconds for autosave | Autosave triggers without errors | ☐ |
| 44 | Click "Til baka" then re-enter | No autosave crash after navigating away | ☐ |

> **What this tests:** P5 — autosave null guard.

---

## C. Multi-Book Support

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 45 | In segment editor, switch to "Líffræði 2e" | Chapter dropdown shows Kafli 3 only | ☐ |
| 46 | Select Kafli 3, verify modules load | Modules appear | ☐ |
| 47 | Switch to "Örverufræði" | Chapter dropdown shows Kafli 1 | ☐ |
| 48 | Switch back to "Efnafræði 2e" | Full chapter list reappears | ☐ |

---

## D. Error Resilience

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 49 | Open segment editor, load a module | Working state | ☐ |
| 50 | Open a **second browser tab** to the same module | Second tab shows cross-tab warning | ☐ |
| 51 | In DevTools Network tab, throttle to "Offline" | — | ☐ |
| 52 | Try to save an edit | Error toast appears, retry queued | ☐ |
| 53 | Re-enable network | Retry succeeds (check console) | ☐ |

---

## E. Console Health Check

After completing all tests above:

| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 54 | Review browser console for the entire session | No uncaught exceptions | ☐ |
| 55 | No repeated "TypeError" or "Cannot read properties of null" | Clean | ☐ |
| 56 | No 4xx/5xx errors in Network tab (except intentional offline test) | Clean | ☐ |

---

## F. Quick Smoke — Other Pages

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 57 | Visit /status (Framvinda) page | Pipeline status loads | ☐ |
| 58 | Visit /admin (if admin) | Admin panel loads | ☐ |
| 59 | Visit /feedback | Feedback form loads | ☐ |

---

## Results Summary

| Section | Tests | Passed | Failed | Notes |
|---------|-------|--------|--------|-------|
| A. Segment Editor | 33 | | | |
| B. Localization Editor | 11 | | | |
| C. Multi-Book | 4 | | | |
| D. Error Resilience | 5 | | | |
| E. Console Health | 3 | | | |
| F. Smoke | 3 | | | |
| **Total** | **59** | | | |

---

## What to Report

For any failure, note:
1. Which step number failed
2. What you saw instead of the expected behavior
3. Any console errors (copy/paste the full error)
4. Browser and OS (if relevant)
