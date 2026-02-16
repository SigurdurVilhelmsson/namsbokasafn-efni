# Phase 11: Status & Schema Modernization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Modernize chapter status tracking from a mixed-name 7-stage model to a clean 8-stage pipeline with auto-advance hooks.

**Architecture:** JSON files remain source of truth. One-time migration script rewrites all status.json files. Schema, routes, and services updated to use canonical 8-stage names. Auto-advance hooks added at pipeline boundaries.

**Tech Stack:** Node.js, JSON Schema, Express routes, SQLite (for module review queries)

**Design doc:** `docs/plans/2026-02-16-phase11-status-modernization-design.md`

---

### Task 1: Write the migration script

**Files:**
- Create: `tools/migrate-status-schema.js`

This script reads all `books/efnafraedi/chapters/*/status.json` files and migrates them to the 8-stage schema. It's idempotent — safe to run multiple times.

**Step 1: Write the migration script**

```javascript
#!/usr/bin/env node
/**
 * migrate-status-schema.js
 *
 * One-time migration: rename legacy stage names to canonical 8-stage pipeline.
 * Idempotent — safe to run multiple times.
 *
 * Usage: node tools/migrate-status-schema.js [--dry-run] [--verbose]
 */

const fs = require('fs');
const path = require('path');

const BOOKS_DIR = path.join(__dirname, '..', 'books');
const BOOK = 'efnafraedi';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

// Legacy → canonical mapping
const STAGE_RENAME = {
  source: 'extraction',
  enMarkdown: 'extraction',
  editorialPass1: 'linguisticReview',
  matecat: 'tmCreated',
  tmUpdated: 'tmCreated',
};

// Stages to remove entirely
const STAGES_TO_REMOVE = ['editorialPass2'];

// Canonical stage order (for consistent JSON output)
const CANONICAL_STAGES = [
  'extraction',
  'mtReady',
  'mtOutput',
  'linguisticReview',
  'tmCreated',
  'injection',
  'rendering',
  'publication',
];

function migrateStatusFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const oldStatus = data.status || {};
  const newStatus = {};
  const changes = [];

  // 1. Migrate renamed stages (prefer new name if both exist)
  for (const [oldName, newName] of Object.entries(STAGE_RENAME)) {
    if (oldStatus[oldName] && !oldStatus[newName]) {
      newStatus[newName] = { ...oldStatus[oldName] };
      // Clean up extra fields from legacy shapes
      delete newStatus[newName].status;
      delete newStatus[newName].inProgress;
      delete newStatus[newName].pending;
      changes.push(`${oldName} → ${newName}`);
    }
  }

  // 2. Copy stages that already have canonical names
  for (const stage of CANONICAL_STAGES) {
    if (oldStatus[stage] && !newStatus[stage]) {
      if (stage === 'publication') {
        // Publication keeps sub-track structure as-is
        newStatus[stage] = oldStatus[stage];
      } else {
        newStatus[stage] = { ...oldStatus[stage] };
        delete newStatus[stage].status;
        delete newStatus[stage].inProgress;
        delete newStatus[stage].pending;
      }
    }
  }

  // 3. Add missing stages with defaults
  for (const stage of CANONICAL_STAGES) {
    if (!newStatus[stage]) {
      if (stage === 'publication') {
        newStatus[stage] = {
          mtPreview: { complete: false },
          faithful: { complete: false },
          localized: { complete: false },
        };
        changes.push(`+ ${stage} (default sub-tracks)`);
      } else {
        newStatus[stage] = { complete: false };
        changes.push(`+ ${stage} (default)`);
      }
    }
  }

  // 4. Ensure publication has all three sub-tracks
  if (newStatus.publication && !newStatus.publication.localized) {
    newStatus.publication.localized = { complete: false };
  }

  // Note removed stages
  for (const stage of STAGES_TO_REMOVE) {
    if (oldStatus[stage]) {
      changes.push(`- ${stage} (removed)`);
    }
  }

  // Build final status in canonical order
  const orderedStatus = {};
  for (const stage of CANONICAL_STAGES) {
    orderedStatus[stage] = newStatus[stage];
  }

  data.status = orderedStatus;

  return { data, changes };
}

// Main
const chaptersDir = path.join(BOOKS_DIR, BOOK, 'chapters');
const dirs = fs.readdirSync(chaptersDir).filter(d => {
  const stat = fs.statSync(path.join(chaptersDir, d));
  return stat.isDirectory();
}).sort();

let totalMigrated = 0;
let totalUnchanged = 0;

for (const dir of dirs) {
  const statusPath = path.join(chaptersDir, dir, 'status.json');
  if (!fs.existsSync(statusPath)) {
    if (verbose) console.log(`  SKIP ${dir} (no status.json)`);
    continue;
  }

  const { data, changes } = migrateStatusFile(statusPath);

  if (changes.length === 0) {
    totalUnchanged++;
    if (verbose) console.log(`  OK   ${dir} (no changes needed)`);
    continue;
  }

  totalMigrated++;

  if (dryRun) {
    console.log(`  DRY  ${dir}:`);
    for (const change of changes) {
      console.log(`       ${change}`);
    }
  } else {
    fs.writeFileSync(statusPath, JSON.stringify(data, null, 2) + '\n');
    console.log(`  MIGRATED ${dir}:`);
    for (const change of changes) {
      console.log(`           ${change}`);
    }
  }
}

console.log(`\n${dryRun ? 'DRY RUN — ' : ''}${totalMigrated} migrated, ${totalUnchanged} unchanged`);
```

**Step 2: Run dry-run to verify**

Run: `node tools/migrate-status-schema.js --dry-run --verbose`
Expected: Shows planned changes for each chapter (source→extraction, matecat→tmCreated, etc.)

**Step 3: Run the actual migration**

Run: `node tools/migrate-status-schema.js --verbose`
Expected: All status.json files rewritten with canonical names.

**Step 4: Verify a migrated file**

Read `books/efnafraedi/chapters/ch01/status.json` and confirm:
- `extraction` exists (was `source`)
- `linguisticReview` exists (was `editorialPass1`)
- `tmCreated` exists (was `matecat`)
- `mtReady`, `injection`, `rendering` exist with `{ "complete": false }`
- `editorialPass2` is gone
- No `source`, `enMarkdown`, `editorialPass1`, `matecat`, `tmUpdated` keys remain

**Step 5: Commit**

```bash
git add tools/migrate-status-schema.js books/efnafraedi/chapters/
git commit -m "feat(phase11): migrate status.json files to 8-stage schema"
```

---

### Task 2: Update the JSON schema

**Files:**
- Modify: `schemas/chapter-status.schema.json`

**Step 1: Rewrite the schema**

Replace the `status` properties block (lines 45-101) with the 8 canonical stages. Remove all legacy definitions. Simplify `$defs` to two shapes: `stageStatus` and `publicationStatus`.

Key changes:
- Add `mtReady` stage between `extraction` and `mtOutput`
- Remove legacy `enMarkdown`, `source`, `matecat`, `editorialPass1`, `tmUpdated`, `editorialPass2`
- Update description from "7-step" to "8-step"
- Simplify `$defs`: remove `stageStatusWithProgress` and `editorialStageStatus` (consolidate to `stageStatus`)
- `stageStatus` keeps: `complete` (required), `date`, `notes`
- `publicationStatus` has sub-tracks: `mtPreview`, `faithful`, `localized` (each a `stageStatus`)

**Step 2: Validate schema is valid JSON Schema**

Run: `node -e "const s = require('./schemas/chapter-status.schema.json'); console.log('Valid JSON, stages:', Object.keys(s.properties.status.properties).join(', '))"`
Expected: `Valid JSON, stages: extraction, mtReady, mtOutput, linguisticReview, tmCreated, injection, rendering, publication`

**Step 3: Commit**

```bash
git add schemas/chapter-status.schema.json
git commit -m "feat(phase11): update JSON schema to 8-stage pipeline"
```

---

### Task 3: Update status routes

**Files:**
- Modify: `server/routes/status.js`

**Step 1: Update PIPELINE_STAGES and remove STAGE_MAPPING**

At `status.js:39-57`:
- Add `mtReady` to `PIPELINE_STAGES` after `extraction`
- Remove `STAGE_MAPPING` object entirely
- Remove `normalizeStageStatus()` function (no longer needed — all files use canonical names)

New `PIPELINE_STAGES` (line 39):
```javascript
const PIPELINE_STAGES = [
  'extraction',
  'mtReady',
  'mtOutput',
  'linguisticReview',
  'tmCreated',
  'injection',
  'rendering',
  'publication',
];
```

**Step 2: Update formatChapterStatus()**

At `status.js:878-922`:
- Remove the `normalizeStageStatus()` call — read `rawStatus` directly
- Status values in migrated files use `{ complete: true/false, date, notes }` — the `stageData.status` field no longer exists, so replace `stageData.status || 'not-started'` with a derived status:
  ```javascript
  const status = stageData.complete ? 'complete' : 'not-started';
  ```

**Step 3: Update suggestNextActions()**

At `status.js:961-1016`:
- Remove `normalizeStageStatus()` call
- Add `mtReady` stage suggestion between extraction and mtOutput:
  ```javascript
  } else if (!isComplete('mtReady')) {
    actions.push({
      stage: 'mtReady',
      action: 'Protect segments for MT',
      command: 'node tools/protect-segments-for-mt.js --batch books/efnafraedi/02-for-mt/chNN/',
    });
  }
  ```

**Step 4: Update section-level status stagePaths**

At `status.js:716-724`, add `mtReady` path and fix detection for module-based file structure:
```javascript
const stagePaths = {
  extraction: path.join(bookPath, '02-for-mt', chapterDir),
  mtReady: path.join(bookPath, '02-for-mt', chapterDir),  // Check for -links.json
  mtOutput: path.join(bookPath, '02-mt-output', chapterDir),
  linguisticReview: path.join(bookPath, '03-faithful-translation', chapterDir),
  tmCreated: path.join(bookPath, 'tm', chapterDir),
  injection: path.join(bookPath, '03-translated', chapterDir),
  rendering: path.join(bookPath, '05-publication', 'mt-preview', 'chapters', chapterStr),
  publication: path.join(bookPath, '05-publication', 'faithful', 'chapters', chapterStr),
};
```

Add `mtReady` check in the section status mapping (~line 768):
```javascript
// Check mtReady (protected files with -links.json sidecars)
const linksFile = path.join(stagePaths.mtReady, `${sectionId}-links.json`);
stages.mtReady = fs.existsSync(linksFile) ? 'complete' :
  (stages.extraction === 'complete' ? 'pending' : 'not-started');
```

**Step 5: Update shortLabels**

At `status.js:854-864`, add `mtReady`:
```javascript
{
  extraction: 'Ext',
  mtReady: 'Rdy',
  mtOutput: 'MT',
  linguisticReview: 'Y1',
  tmCreated: 'TM',
  injection: 'Inj',
  rendering: 'Ren',
  publication: 'Pub',
}
```

**Step 6: Test the routes**

Run: `node -e "require('./server/routes/status');"` (quick syntax check)
If the server can start: `node server/index.js` and test `GET /api/status/efnafraedi` — verify 8 stages per chapter, no errors.

**Step 7: Commit**

```bash
git add server/routes/status.js
git commit -m "feat(phase11): update status routes for 8-stage pipeline"
```

---

### Task 4: Update bookRegistration filesystem sync

**Files:**
- Modify: `server/services/bookRegistration.js:661-870`

**Step 1: Update STATUS_RULES to use canonical names**

At `bookRegistration.js:674-700`, replace the STATUS_RULES object:

```javascript
const STATUS_RULES = {
  extraction: (book, ch, section) => {
    const filename = `m*-segments.en.md`;
    const dir = path.join(BOOKS_DIR, book, '02-for-mt', `ch${ch}`);
    return fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.endsWith('-segments.en.md'));
  },
  mtReady: (book, ch) => {
    const dir = path.join(BOOKS_DIR, book, '02-for-mt', `ch${ch}`);
    return fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.endsWith('-links.json'));
  },
  mtOutput: (book, ch) => {
    const dir = path.join(BOOKS_DIR, book, '02-mt-output', `ch${ch}`);
    return fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.endsWith('-segments.is.md'));
  },
  linguisticReview: (book, ch) => {
    const dir = path.join(BOOKS_DIR, book, '03-faithful-translation', `ch${ch}`);
    return fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.endsWith('-segments.is.md'));
  },
  tmCreated: (book, ch, section) => {
    const filename = section === 'intro' ? 'intro.tmx' : `${section}.tmx`;
    return fs.existsSync(path.join(BOOKS_DIR, book, 'tm', `ch${ch}`, filename));
  },
  injection: (book, ch) => {
    const dir = path.join(BOOKS_DIR, book, '03-translated', `ch${ch}`);
    return fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.endsWith('.cnxml'));
  },
  rendering: (book, ch) => {
    const chStr = ch.replace(/^0+/, '') || '0';
    const dir = path.join(BOOKS_DIR, book, '05-publication', 'mt-preview', 'chapters', chStr);
    return fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.endsWith('.html'));
  },
};
```

Note: `extraction`, `mtReady`, `mtOutput`, `linguisticReview`, `injection`, `rendering` use module-based filenames (`m*-segments.*.md`) not section-based. Adjust the detection to check for any matching file in the directory rather than per-section checks.

**Step 2: Update the scan loop to use canonical stage names**

Replace the stage-by-stage scan blocks (lines 751-855) to use the new stage names. The scan should write to canonical names:
- `source` → `extraction`
- `editorialPass1` → `linguisticReview`
- `tmUpdated` → `tmCreated`
- Remove `editorialPass2` scan
- Add `mtReady`, `injection`, `rendering` scans

**Step 3: Commit**

```bash
git add server/services/bookRegistration.js
git commit -m "feat(phase11): update filesystem sync for 8-stage pipeline"
```

---

### Task 5: Add auto-advance hook in segmentEditorService

**Files:**
- Modify: `server/services/segmentEditorService.js:423-492`

**Step 1: Import advanceChapterStatus**

Add at the top of the file (near other requires):
```javascript
const { advanceChapterStatus } = require('./pipelineService');
```

**Step 2: Add status update after applyApprovedEdits()**

After the successful return block in `applyApprovedEdits()` (before `return` at ~line 488), add:

```javascript
// Check if all modules in this chapter now have faithful translation files
// If so, mark linguisticReview as complete
try {
  const chDir = formatChapterDir(chapter);
  const mtOutputDir = path.join(BOOKS_DIR, book, '02-mt-output', chDir);
  const faithfulDir = path.join(BOOKS_DIR, book, '03-faithful-translation', chDir);

  if (fs.existsSync(mtOutputDir) && fs.existsSync(faithfulDir)) {
    const mtModules = fs.readdirSync(mtOutputDir)
      .filter(f => f.endsWith('-segments.is.md'))
      .map(f => f.replace('-segments.is.md', ''));
    const faithfulModules = fs.readdirSync(faithfulDir)
      .filter(f => f.endsWith('-segments.is.md'))
      .map(f => f.replace('-segments.is.md', ''));

    const allModulesReviewed = mtModules.every(m => faithfulModules.includes(m));

    if (allModulesReviewed) {
      advanceChapterStatus(book, chapter, 'linguisticReview');
    }
  }
} catch (err) {
  // Best-effort — don't fail the apply operation
  console.error('Auto-advance linguisticReview failed:', err.message);
}
```

Note: `formatChapterDir` needs to be available. Check if it's already imported from module-sections.js or define inline:
```javascript
const chDir = `ch${String(chapter).padStart(2, '0')}`;
```

**Step 3: Commit**

```bash
git add server/services/segmentEditorService.js
git commit -m "feat(phase11): auto-advance linguisticReview on applyApprovedEdits"
```

---

### Task 6: Verify end-to-end and update documentation

**Step 1: Run filesystem sync on a chapter**

Test: `curl -X POST http://localhost:3000/api/status/efnafraedi/sync` (or start server and test)
Alternatively, quick check: `node -e "const br = require('./server/services/bookRegistration'); console.log(JSON.stringify(br.scanStatusDryRun('efnafraedi', '01'), null, 2))"`

Verify: Output uses canonical stage names only.

**Step 2: Verify ch01 status.json has correct shape**

Read `books/efnafraedi/chapters/ch01/status.json`:
- 8 stages present: extraction, mtReady, mtOutput, linguisticReview, tmCreated, injection, rendering, publication
- No legacy names
- publication has mtPreview, faithful, localized sub-tracks

**Step 3: Update CLAUDE.md pipeline table**

Update the pipeline stages table in CLAUDE.md to include `mtReady`:

```
| 1a | CNXML → EN segments | `cnxml-extract.js` | `02-for-mt/`, `02-structure/` |
| 1b | Protect for MT | `protect-segments-for-mt.js` | MT-ready segments |
| 2a | Machine translation | malstadur.is | `02-mt-output/` |
| 2b | Unprotect MT output | `unprotect-segments.js` | Ready for review/injection |
| 3a | Linguistic review | Segment editor (web) or manual editing | `03-faithful-translation/` ★ |
| 3b | Apply approved edits | `applyApprovedEdits()` (per-module) | `03-faithful-translation/` |
| 4 | TM creation | `prepare-for-align.js` + Matecat Align | `tm/` ★ |
| 5a | Inject translations | `cnxml-inject.js` | `03-translated/` |
| 5b | Render to HTML | `cnxml-render.js` | `05-publication/` |
```

Also update the Stages section to list all 8:
```
- `extraction` - Step 1: Segments + structure extracted
- `mtReady` - Step 1b: Segments protected for MT
- `mtOutput` - Step 2: MT output received
- `linguisticReview` - Step 3: Faithful translation reviewed
- `tmCreated` - Step 4: TM created via Matecat Align
- `injection` - Step 5a: Translated CNXML produced
- `rendering` - Step 5b: HTML produced
- `publication` - Step 5c: Published to web
```

**Step 4: Update ROADMAP.md — mark Phase 11 as complete**

**Step 5: Commit**

```bash
git add CLAUDE.md ROADMAP.md books/efnafraedi/chapters/
git commit -m "docs: update documentation for Phase 11 completion"
```

---

## Summary of Changes

| File | Type | Description |
|------|------|-------------|
| `tools/migrate-status-schema.js` | NEW | One-time migration script |
| `schemas/chapter-status.schema.json` | MODIFY | 8-stage schema, remove legacy |
| `server/routes/status.js` | MODIFY | 8 stages, remove STAGE_MAPPING, fix formatChapterStatus |
| `server/services/bookRegistration.js` | MODIFY | Canonical names in sync, module-based detection |
| `server/services/segmentEditorService.js` | MODIFY | Auto-advance linguisticReview |
| `books/efnafraedi/chapters/*/status.json` | MIGRATE | ~22 files, canonical names |
| `CLAUDE.md` | MODIFY | 8-stage pipeline table |
| `ROADMAP.md` | MODIFY | Phase 11 complete |
