# API Translation Follow-up Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Málstaður API integration by fixing the `<md:title>` fidelity gap, updating documentation for the new automated workflow, validating with a full chapter translation, and adding pipeline status tracking.

**Architecture:** Five independent tasks on the `feature/malstadur-api-integration` branch. Each produces a self-contained commit. Tasks 1-3 are code/doc changes; Task 4 is a live validation; Task 5 adds optional pipeline status integration.

**Tech Stack:** Node.js 24, ES modules, existing pipeline tools

**Spec:** `docs/superpowers/specs/2026-03-18-api-translate-design.md`
**Prior plan:** `docs/superpowers/plans/2026-03-18-api-translate.md`

---

## File Map

| File | Action | Task | Responsibility |
|------|--------|------|----------------|
| `tools/cnxml-inject.js` | Modify (lines 758-795) | 1 | Add `<md:title>` replacement in metadata |
| `tools/__tests__/pipeline-integration.test.js` | Modify | 1 | Add md:title test |
| `tools/protect-segments-for-mt.js` | Modify (help text) | 2 | Mark as legacy |
| `tools/unprotect-segments.js` | Modify (help text) | 2 | Mark as legacy |
| `docs/workflow/simplified-workflow.md` | Modify | 3 | Add API method, mark protect/unprotect as legacy |
| `tools/api-translate.js` | Modify | 5 | Add `--update-status` flag |

---

### Task 1: Fix `<md:title>` translation in cnxml-inject.js

**Files:**
- Modify: `tools/cnxml-inject.js:758-795`
- Modify: `tools/__tests__/pipeline-integration.test.js`

The `<md:title>` always has the same text as the document `<title>`. The document title is already extracted as a segment and translated. We just need to replace `<md:title>` in the metadata with the translated title — a 5-line change in injection, no extraction changes needed.

- [ ] **Step 1: Write a failing test**

Add to `tools/__tests__/pipeline-integration.test.js` in the injection test section:

```javascript
it('should translate md:title in metadata', async () => {
  // Use m68664 which has md:title "Chemistry in Context"
  const translatedCnxml = fs.readFileSync(
    'books/efnafraedi-2e/03-translated/mt-preview/ch01/m68664.cnxml', 'utf8'
  );
  const documentTitleMatch = translatedCnxml.match(/<title>([^<]+)<\/title>/);
  const mdTitleMatch = translatedCnxml.match(/<md:title>([^<]+)<\/md:title>/);

  // Both titles should be Icelandic (not English)
  expect(documentTitleMatch).toBeTruthy();
  expect(mdTitleMatch).toBeTruthy();
  // md:title should NOT be "Chemistry in Context" (the English original)
  expect(mdTitleMatch[1]).not.toBe('Chemistry in Context');
  // md:title should match the document title
  expect(mdTitleMatch[1]).toBe(documentTitleMatch[1]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/pipeline-integration.test.js -t "md:title"`
Expected: FAIL — `md:title` is still "Chemistry in Context"

- [ ] **Step 3: Implement the fix in cnxml-inject.js**

In `tools/cnxml-inject.js`, after the abstract replacement block (around line 792), add `<md:title>` replacement:

```javascript
    // After the abstract replacement block, before `lines.push(translatedMetadata)`:

    // Replace md:title with translated document title
    const translatedTitle = getSeg(structure.title?.segmentId) || structure.title?.text;
    if (translatedTitle) {
      translatedMetadata = translatedMetadata.replace(
        /<md:title>[^<]*<\/md:title>/,
        `<md:title>${translatedTitle}</md:title>`
      );
    }
```

This goes at `cnxml-inject.js` line ~792, right before `lines.push(translatedMetadata);`.

- [ ] **Step 4: Re-inject m68664 to generate updated translated CNXML**

Run: `node tools/cnxml-inject.js --book efnafraedi-2e --chapter 1 --module m68664 --source-dir 02-mt-output`

Expected: m68664.cnxml now has Icelandic `<md:title>`

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/pipeline-integration.test.js -t "md:title"`
Expected: PASS

- [ ] **Step 6: Run full pipeline tests**

Run: `npx vitest run tools/__tests__/pipeline-integration.test.js`
Expected: All 81+ tests pass (no regressions)

- [ ] **Step 7: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/pipeline-integration.test.js
git commit -m "fix(inject): translate <md:title> in metadata for OpenStax fidelity"
```

---

### Task 2: Mark protect/unprotect tools as legacy

**Files:**
- Modify: `tools/protect-segments-for-mt.js` (help text, lines 67-101)
- Modify: `tools/unprotect-segments.js` (help text)

- [ ] **Step 1: Update protect-segments-for-mt.js help text**

Add a note at the top of the `printHelp()` output (line ~69):

```javascript
// Add after the first line of the help text:
console.log(`
protect-segments-for-mt.js - Protect segment files for Erlendur MT

NOTE: This tool is only needed for the malstadur.is WEB UI workflow.
If using the Málstaður API (api-translate.js), no protection is needed —
the API preserves all content markers intact.

Converts segment tags to MT-safe format and splits by visible character count.
// ... rest unchanged
`);
```

- [ ] **Step 2: Update unprotect-segments.js help text**

Find the help/description section and add the same kind of note.

- [ ] **Step 3: Commit**

```bash
git add tools/protect-segments-for-mt.js tools/unprotect-segments.js
git commit -m "docs(tools): mark protect/unprotect as legacy (not needed with API)"
```

---

### Task 3: Update simplified-workflow.md

**Files:**
- Modify: `docs/workflow/simplified-workflow.md`

This is the main workflow reference. Update it to show `api-translate.js` as the primary MT method, with the web UI as an alternative.

- [ ] **Step 1: Update the Pipeline Overview diagram (lines 22-33)**

Replace the Step 1b/2/2b boxes with:

```markdown
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Machine Translation                                │
│  Tool: api-translate.js (automated via Málstaður API)       │
│  Sends whole files directly — all markers preserved intact  │
│  Output: m68724-segments.is.md in 02-mt-output/             │
└─────────────────────────────────────────────────────────────┘
```

Keep a note that Steps 1b/2b (protect/unprotect) are only needed for the legacy web UI method.

- [ ] **Step 2: Rewrite Step 2 instructions (lines 141-158)**

Replace the manual upload instructions with the API method as primary:

```markdown
### Step 2: Machine Translation

**Goal:** Get initial Icelandic translation via the Málstaður API.

#### Method A: Automated via API (Recommended)

```bash
# Translate all modules in a chapter
node tools/api-translate.js --book efnafraedi-2e --chapter 5

# Preview what will be translated and estimated cost
node tools/api-translate.js --book efnafraedi-2e --chapter 5 --dry-run

# Translate a single module
node tools/api-translate.js --book efnafraedi-2e --chapter 5 --module m68724

# Translate an entire book
node tools/api-translate.js --book efnafraedi-2e
```

**Requirements:** `MALSTADUR_API_KEY` set in `.env` or environment.

**Features:**
- Sends whole `.en.md` files directly (no protection/splitting needed)
- All content markers survive intact (validated by T1/T2 tests)
- Sends 617 approved chemistry terms as glossary with each request
- Skips modules that already have output (resumable)
- Reports character count and cost estimate

**Output:** `02-mt-output/ch05/m68724-segments.is.md`

#### Method B: Manual via malstadur.is Web UI (Legacy)

For situations where the API is unavailable, the web UI method still works but requires additional protect/unprotect steps. See the [legacy MT workflow](#legacy-mt-workflow) section below.
```

- [ ] **Step 3: Move legacy protect/unprotect instructions to a collapsible section**

Move the current Steps 1b and 2b content to a new section at the bottom titled "Legacy MT Workflow" (before the API Endpoints section). Add a note that these steps are only needed for the malstadur.is web UI, not for `api-translate.js`.

- [ ] **Step 4: Update the Tools Summary table (lines 439-453)**

Add `api-translate.js` to the Active tools table and move `protect-segments-for-mt.js` and `unprotect-segments.js` to a "Legacy (Web UI only)" section.

- [ ] **Step 5: Update the Quick Reference section (lines 514-552)**

Replace the protect/upload/unprotect commands with:

```bash
# Step 2: Machine translate via API (automated)
node tools/api-translate.js --book efnafraedi-2e --chapter 5
```

- [ ] **Step 6: Commit**

```bash
git add docs/workflow/simplified-workflow.md
git commit -m "docs(workflow): update for automated API translation, mark protect/unprotect as legacy"
```

---

### Task 4: Full chapter API translation test

**Files:** None modified — this is a validation step.

Pick a chapter that has untranslated modules (the dry-run showed 86 of 148 modules need translation).

- [ ] **Step 1: Identify a good test chapter**

Run: `node tools/api-translate.js --book efnafraedi-2e --dry-run --verbose 2>&1 | head -30`

Pick a chapter with a mix of translated and untranslated modules.

- [ ] **Step 2: Translate the chapter**

Run: `node tools/api-translate.js --book efnafraedi-2e --chapter <N> --verbose`

Expected: All untranslated modules succeed, existing ones skipped, cost reported.

- [ ] **Step 3: Inject the translations**

Run: `node tools/cnxml-inject.js --book efnafraedi-2e --chapter <N> --source-dir 02-mt-output`

Expected: All modules inject successfully.

- [ ] **Step 4: Render to HTML**

Run: `node tools/cnxml-render.js --book efnafraedi-2e --chapter <N> --track mt-preview`

Expected: HTML files produced in `05-publication/mt-preview/`.

- [ ] **Step 5: Verify md:title is translated in output**

Run: `grep '<md:title>' books/efnafraedi-2e/03-translated/mt-preview/ch<NN>/*.cnxml`

Expected: All `<md:title>` values are in Icelandic (not English).

- [ ] **Step 6: No commit needed** — translated content is generated data. The user decides whether to commit.

---

### Task 5: Pipeline status integration (optional `--update-status`)

**Files:**
- Modify: `tools/api-translate.js`
- Modify: `tools/__tests__/api-translate.test.js`

Add an `--update-status` flag that marks the `mtOutput` stage as complete after successful translation. This is opt-in because the pipeline DB may not exist in all environments.

- [ ] **Step 1: Add the CLI flag**

In `tools/api-translate.js`, add to `parseCliArgs`:

```javascript
{ name: 'updateStatus', flags: ['--update-status'], type: 'boolean', default: false },
```

Update `printHelp()` to document it.

- [ ] **Step 2: Implement status update function**

Add to `tools/api-translate.js`:

```javascript
/**
 * Update pipeline status for translated chapters.
 * Uses the server's pipelineStatusService directly (standalone, no server needed).
 * Fails silently — status updates should never block translation.
 */
async function updatePipelineStatus(bookSlug, chapters) {
  try {
    // Dynamic import of CommonJS module from server/
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);

    let pipelineStatus;
    try {
      pipelineStatus = require('../server/services/pipelineStatusService.js');
    } catch {
      console.warn('  Warning: Could not load pipeline status service (server not set up?)');
      return;
    }

    for (const chapterDir of chapters) {
      const chapterNum = chapterDir === 'appendices' ? -1 : parseInt(chapterDir.slice(2), 10);
      try {
        pipelineStatus.transitionStage(bookSlug, chapterNum, 'mtOutput', 'complete', 'api-translate');
        console.log(`  Updated pipeline status: ch${String(chapterNum).padStart(2, '0')} mtOutput → complete`);
      } catch (err) {
        console.warn(`  Warning: Status update failed for ch${chapterNum}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`  Warning: Pipeline status update skipped: ${err.message}`);
  }
}
```

- [ ] **Step 3: Call it from main() after successful translations**

In `main()`, after the summary block but before the final exit:

```javascript
  // Update pipeline status if requested
  if (args.updateStatus && results.translated > 0) {
    console.log('\nUpdating pipeline status...');
    const translatedChapters = [...new Set(
      workList.filter(m => !m.skip).map(m => m.chapterDir)
    )];
    await updatePipelineStatus(args.book, translatedChapters);
  }
```

- [ ] **Step 4: Run existing tests**

Run: `npx vitest run tools/__tests__/api-translate.test.js`
Expected: All 29 tests pass (new flag doesn't affect existing behavior)

- [ ] **Step 5: Commit**

```bash
git add tools/api-translate.js
git commit -m "feat(api-translate): add --update-status flag for pipeline status tracking"
```

---

### Final: Push updated branch

- [ ] **Push all new commits**

```bash
git push
```

Expected: Branch `feature/malstadur-api-integration` updated on remote with 4-5 new commits.
