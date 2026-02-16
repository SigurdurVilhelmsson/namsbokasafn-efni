# Validation Gate, TM Prep, Review Queue — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three features before editorial review work begins: publication validation gate, one-click TM preparation, and cross-chapter review queue.

**Architecture:** All three are independent — each adds a service function, wires it into a route, and optionally adds UI. Feature A hooks into the existing publication flow. Feature B follows the `pipelineService.spawnJob()` pattern. Feature D is a new read-only endpoint + HTML page.

**Tech Stack:** Node.js, Express, better-sqlite3, child_process (spawn), HTML/CSS/JS (no frameworks)

---

## Task 1: Validation Gate — Service Function

**Files:**
- Modify: `server/services/publicationService.js:16-20` (add spawn import), `:48-90` (after checkTrackReadiness)
- Reference: `tools/validate-chapter.js` (ES module, JSON output format)

**Step 1: Add `validateBeforePublish()` to publicationService.js**

Add `spawn` import at the top:

```js
const { spawn } = require('child_process');

const TOOLS_DIR = path.join(__dirname, '..', '..', 'tools');
```

Add the function after `checkTrackReadiness()` (~line 90):

```js
/**
 * Run validate-chapter.js and return parsed results.
 * Spawns the CLI tool as a child process (ES module).
 *
 * @param {string} bookSlug - Book slug
 * @param {number} chapterNum - Chapter number
 * @param {string} track - Publication track
 * @returns {Promise<object>} { valid, errors: [...], warnings: [...], summary }
 */
function validateBeforePublish(bookSlug, chapterNum, track) {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(TOOLS_DIR, 'validate-chapter.js'),
      bookSlug,
      String(chapterNum),
      '--track', track,
      '--json',
    ];

    let stdout = '';
    let stderr = '';

    const child = spawn('node', args, {
      cwd: path.join(__dirname, '..', '..'),
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('error', (err) => {
      reject(new Error(`Validation tool failed to start: ${err.message}`));
    });

    child.on('close', () => {
      try {
        const results = JSON.parse(stdout);
        const errors = [];
        const warnings = [];

        for (const [name, check] of Object.entries(results.checks)) {
          if (!check.passed && check.issues) {
            for (const issue of check.issues) {
              if (check.severity === 'error') {
                errors.push({ validator: name, ...issue });
              } else if (check.severity === 'warning') {
                warnings.push({ validator: name, ...issue });
              }
            }
          }
        }

        resolve({
          valid: results.valid,
          errors,
          warnings,
          summary: results.summary,
        });
      } catch (parseErr) {
        reject(new Error(`Failed to parse validation output: ${parseErr.message}. stderr: ${stderr}`));
      }
    });
  });
}
```

Add to module.exports: `validateBeforePublish`.

**Step 2: Run and verify**

```bash
node -e "
  const pub = require('./server/services/publicationService');
  pub.validateBeforePublish('efnafraedi', 1, 'mt-preview').then(r => console.log(JSON.stringify(r, null, 2))).catch(e => console.error(e));
"
```

Expected: JSON object with `valid`, `errors`, `warnings`, `summary` fields.

**Step 3: Commit**

```
feat(A): add validateBeforePublish to publicationService
```

---

## Task 2: Validation Gate — Wire Into Publication Route

**Files:**
- Modify: `server/services/publicationService.js:127-172` (publishChapter function)
- Modify: `server/routes/publication.js:125-167` (POST mt-preview handler — pattern for all three)

**Step 1: Make `publishChapter()` async and call validation**

Replace `publishChapter` with an async version:

```js
async function publishChapter(bookSlug, chapterNum, track, userId) {
  const readiness = checkTrackReadiness(bookSlug, chapterNum, track);
  if (!readiness.ready) {
    throw new Error(`Chapter not ready for ${track} publication: ${readiness.reason}`);
  }

  // Run content validation
  const validation = await validateBeforePublish(bookSlug, chapterNum, track);
  if (!validation.valid) {
    const err = new Error(`Validation failed: ${validation.summary.errors} error(s)`);
    err.validation = validation;
    throw err;
  }

  // Check for already-running pipeline
  const existing = pipelineService.hasRunningJob(chapterNum, 'pipeline');
  if (existing) {
    throw new Error(
      `Pipeline already running for chapter ${chapterNum} (job: ${existing.id}). ` +
        'Wait for it to complete or check its status.'
    );
  }

  // Launch inject → render pipeline
  const { jobId, promise } = pipelineService.runPipeline({
    chapter: chapterNum,
    track,
    userId,
  });

  // When pipeline completes, update chapter status.json
  promise.then(() => {
    const job = pipelineService.getJob(jobId);
    if (job && job.status === 'completed') {
      const trackKey = track === 'mt-preview' ? 'mtPreview' : track;
      updateChapterStatus(bookSlug, chapterNum, 'publication', {
        [trackKey]: {
          complete: true,
          date: new Date().toISOString().split('T')[0],
          pipeline: 'html',
          moduleCount: readiness.moduleCount,
        },
      });
    }
  });

  return {
    jobId,
    track,
    chapter: chapterNum,
    moduleCount: readiness.moduleCount,
    modules: readiness.modules,
    validation: {
      warnings: validation.warnings,
      summary: validation.summary,
    },
  };
}
```

**Step 2: Update route handlers to handle async + validation errors**

In `publication.js`, update the three POST handlers. Example for mt-preview (apply same pattern to faithful and localized):

```js
router.post(
  '/:bookSlug/:chapterNum/mt-preview',
  requireAuth,
  requireRole(ROLES.HEAD_EDITOR),
  validateChapterParams,
  async (req, res) => {
    const { bookSlug } = req.params;
    const { chapter } = req;

    try {
      const result = await publicationService.publishMtPreview(bookSlug, chapter, req.user.id);

      // Log activity (unchanged)
      try {
        activityLog.log({
          type: 'publish_mt_preview',
          userId: req.user.id,
          username: req.user.name || req.user.login,
          book: bookSlug,
          chapter: String(chapter),
          description: `Started MT preview publication for ${bookSlug} chapter ${chapter}`,
          metadata: { jobId: result.jobId, moduleCount: result.moduleCount },
        });
      } catch (logErr) {
        console.error('Failed to log activity:', logErr);
      }

      res.json({
        success: true,
        message: `MT preview pipeline started for chapter ${chapter}`,
        ...result,
      });
    } catch (err) {
      console.error('Error publishing MT preview:', err);
      if (err.validation) {
        return res.status(400).json({
          error: 'Content validation failed',
          message: err.message,
          validation: err.validation,
        });
      }
      const status = err.message.includes('not ready')
        ? 400
        : err.message.includes('already running')
          ? 409
          : 500;
      res.status(status).json({ error: 'Failed to publish MT preview', message: err.message });
    }
  }
);
```

Apply the same `async` + `await` + `err.validation` pattern to the faithful and localized handlers.

**Step 3: Verify**

```bash
node -e "
  const pub = require('./server/services/publicationService');
  console.log(typeof pub.publishChapter); // should be 'function' (async)
"
```

**Step 4: Commit**

```
feat(A): wire validation gate into publication endpoints
```

---

## Task 3: TM Preparation — Service Function

**Files:**
- Modify: `server/services/pipelineService.js:297-358` (after generateJobId, before module.exports)

**Step 1: Add `runPrepareTm()` to pipelineService.js**

```js
/**
 * Run prepare-for-align.js for all sections in a chapter.
 * Requires linguisticReview to be complete (all modules have faithful files).
 *
 * @param {Object} params
 * @param {string} params.book - Book slug
 * @param {number} params.chapter - Chapter number
 * @param {string} [params.userId] - User who triggered the run
 * @returns {Object} { jobId, promise }
 */
function runPrepareTm({ book, chapter, userId }) {
  const chapterStr = String(chapter).padStart(2, '0');
  const enDir = path.join(BOOKS_DIR, book, '02-for-mt', `ch${chapterStr}`);
  const isDir = path.join(BOOKS_DIR, book, '03-faithful-translation', `ch${chapterStr}`);
  const outputDir = path.join(BOOKS_DIR, book, 'for-align', `ch${chapterStr}`);

  // Prerequisite: check faithful files exist
  if (!fs.existsSync(isDir)) {
    throw new Error(`Faithful translation directory not found: 03-faithful-translation/ch${chapterStr}`);
  }

  // Find all EN section files
  if (!fs.existsSync(enDir)) {
    throw new Error(`EN segments directory not found: 02-for-mt/ch${chapterStr}`);
  }

  const enFiles = fs.readdirSync(enDir).filter(f => f.match(/^\d+-\d+.*\.en\.md$/));
  if (enFiles.length === 0) {
    throw new Error(`No EN segment files found in 02-for-mt/ch${chapterStr}`);
  }

  // Extract unique section IDs (e.g., "5-1" from "5-1.en.md" or "5-1(a).en.md")
  const sections = [...new Set(enFiles.map(f => {
    const match = f.match(/^(\d+-\d+)/);
    return match ? match[1] : null;
  }).filter(Boolean))].sort();

  // Check which sections have IS files
  const isFiles = fs.existsSync(isDir)
    ? fs.readdirSync(isDir).filter(f => f.endsWith('.is.md'))
    : [];
  const isSections = new Set(isFiles.map(f => {
    const match = f.match(/^(\d+-\d+)/);
    return match ? match[1] : null;
  }).filter(Boolean));

  const readySections = sections.filter(s => isSections.has(s));
  if (readySections.length === 0) {
    throw new Error(`No sections have both EN and IS files for chapter ${chapter}`);
  }

  const jobId = generateJobId();
  const job = {
    id: jobId,
    type: 'prepare-tm',
    chapter,
    moduleId: 'all',
    track: 'faithful',
    userId,
    status: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    output: [`Preparing ${readySections.length} sections for Matecat Align...`],
    error: null,
  };
  jobs.set(jobId, job);

  const promise = (async () => {
    try {
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      for (const section of readySections) {
        job.output.push(`Processing section ${section}...`);

        await new Promise((resolve, reject) => {
          const child = spawn('node', [
            path.join(TOOLS_DIR, 'prepare-for-align.js'),
            '--en-dir', enDir,
            '--is-dir', isDir,
            '--section', section,
            '--output-dir', outputDir,
            '--verbose',
          ], {
            cwd: PROJECT_ROOT,
            env: { ...process.env, NODE_NO_WARNINGS: '1' },
          });

          child.stdout.on('data', (data) => {
            job.output.push(...data.toString().trim().split('\n'));
          });
          child.stderr.on('data', (data) => {
            job.output.push(...data.toString().trim().split('\n'));
          });

          child.on('error', (err) => reject(err));
          child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`prepare-for-align failed for section ${section} (exit code ${code})`));
          });
        });
      }

      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.output.push(`Done. ${readySections.length} section pairs ready in for-align/ch${chapterStr}/`);
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
      job.completedAt = new Date().toISOString();
    }
  })();

  return { jobId, promise };
}
```

Add `runPrepareTm` to module.exports.

**Step 2: Verify**

```bash
node -e "
  const p = require('./server/services/pipelineService');
  console.log(typeof p.runPrepareTm); // 'function'
"
```

**Step 3: Commit**

```
feat(B): add runPrepareTm to pipelineService
```

---

## Task 4: TM Preparation — Route + UI Button

**Files:**
- Modify: `server/routes/pipeline.js:148-181` (before GET /jobs)
- Modify: `server/views/chapter.html` (add button — exact location TBD by reading file)

**Step 1: Add POST /prepare-tm endpoint to pipeline.js**

Insert before the `GET /jobs` handler:

```js
/**
 * POST /prepare-tm
 * Prepare files for Matecat Align (TM creation).
 * Runs prepare-for-align.js for all sections in a chapter.
 */
router.post('/prepare-tm', (req, res) => {
  const { book, chapter } = req.body;

  if (!book || !VALID_BOOKS.includes(book)) {
    return res.status(400).json({ error: `Invalid book. Must be one of: ${VALID_BOOKS.join(', ')}` });
  }

  const chapterNum = parseInt(chapter, 10);
  if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > 50) {
    return res.status(400).json({ error: 'Invalid chapter number' });
  }

  const running = pipeline.hasRunningJob(chapterNum, 'prepare-tm');
  if (running) {
    return res.status(409).json({
      error: 'A TM preparation job is already running for this chapter',
      jobId: running.id,
    });
  }

  try {
    const { jobId } = pipeline.runPrepareTm({
      book,
      chapter: chapterNum,
      userId: req.user.id,
    });

    res.json({
      success: true,
      jobId,
      message: `TM preparation started for chapter ${chapterNum}`,
    });
  } catch (err) {
    console.error('Error starting TM preparation:', err);
    res.status(400).json({ error: err.message });
  }
});
```

**Step 2: Add button to chapter.html**

Read `chapter.html` to find the appropriate location (near pipeline/publication actions), then add a conditional "Undirbua fyrir Matecat" button that calls `POST /api/pipeline/prepare-tm`. The button should:
- Only be visible when linguisticReview is complete
- Show spinner/progress while running
- Display results on completion

*Exact placement depends on the chapter.html structure — read the file first.*

**Step 3: Verify**

Start the server and confirm the endpoint responds:
```bash
curl -X POST http://localhost:3000/api/pipeline/prepare-tm \
  -H "Content-Type: application/json" \
  -d '{"book":"efnafraedi","chapter":1}'
```

Expected: 401 (auth required) or the job response if authenticated.

**Step 4: Commit**

```
feat(B): add TM preparation endpoint and chapter UI button
```

---

## Task 5: Review Queue — Service Function

**Files:**
- Modify: `server/services/segmentEditorService.js:577-602` (before module.exports)

**Step 1: Add `getReviewQueue()` to segmentEditorService.js**

```js
/**
 * Get cross-chapter review queue with edit counts per module.
 *
 * @param {string} [book] - Optional book filter
 * @returns {Array} Array of review items with edit counts
 */
function getReviewQueue(book) {
  const conn = getDb();

  let query = `
    SELECT
      mr.id,
      mr.book,
      mr.chapter,
      mr.module_id,
      mr.submitted_by_username,
      mr.submitted_at,
      mr.status,
      mr.edited_segments,
      COUNT(CASE WHEN se.status = 'pending' THEN 1 END) as pending_edits,
      COUNT(CASE WHEN se.status = 'approved' THEN 1 END) as approved_edits,
      COUNT(CASE WHEN se.status = 'rejected' THEN 1 END) as rejected_edits,
      COUNT(CASE WHEN se.status = 'discuss' THEN 1 END) as discuss_edits
    FROM module_reviews mr
    LEFT JOIN segment_edits se ON mr.book = se.book AND mr.module_id = se.module_id
    WHERE mr.status IN ('pending', 'in_review')`;

  const params = [];
  if (book) {
    query += ` AND mr.book = ?`;
    params.push(book);
  }

  query += `
    GROUP BY mr.id
    ORDER BY mr.submitted_at ASC`;

  return conn.prepare(query).all(...params);
}
```

Add `getReviewQueue` to module.exports.

**Step 2: Verify**

```bash
node -e "
  const se = require('./server/services/segmentEditorService');
  console.log(se.getReviewQueue('efnafraedi'));
"
```

Expected: Array (possibly empty if no pending reviews).

**Step 3: Commit**

```
feat(D): add getReviewQueue to segmentEditorService
```

---

## Task 6: Review Queue — Route Endpoint

**Files:**
- Modify: `server/routes/segment-editor.js` (add GET /review-queue endpoint)
- Reference: existing GET /reviews endpoint in same file for pattern

**Step 1: Read `server/routes/segment-editor.js` to find the right location**

Add after the existing `GET /reviews` endpoint:

```js
/**
 * GET /review-queue
 * Cross-chapter review queue with edit counts and SLA indicators.
 */
router.get('/review-queue', requireAuth, (req, res) => {
  try {
    const { book } = req.query;
    const reviews = segmentEditor.getReviewQueue(book || undefined);

    // Add SLA indicators
    const now = Date.now();
    const SLA_TARGET_MS = 2 * 24 * 60 * 60 * 1000;   // 2 days
    const SLA_WARNING_MS = 3 * 24 * 60 * 60 * 1000;   // 3 days
    const SLA_CRITICAL_MS = 5 * 24 * 60 * 60 * 1000;  // 5 days

    const items = reviews.map(r => {
      const ageMs = now - new Date(r.submitted_at).getTime();
      let sla = 'on-track';
      if (ageMs > SLA_CRITICAL_MS) sla = 'critical';
      else if (ageMs > SLA_WARNING_MS) sla = 'overdue';
      else if (ageMs > SLA_TARGET_MS) sla = 'at-risk';

      return { ...r, sla, age_days: Math.floor(ageMs / (24 * 60 * 60 * 1000)) };
    });

    res.json({ reviews: items });
  } catch (err) {
    console.error('Error getting review queue:', err);
    res.status(500).json({ error: err.message });
  }
});
```

**Step 2: Verify**

```bash
curl http://localhost:3000/api/segment-editor/review-queue?book=efnafraedi
```

Expected: `{ "reviews": [...] }` (requires auth in practice).

**Step 3: Commit**

```
feat(D): add review queue API endpoint
```

---

## Task 7: Review Queue — HTML Page + View Route

**Files:**
- Create: `server/views/review-queue.html`
- Modify: `server/routes/views.js:66-68` (add route after /reviews)

**Step 1: Add view route**

In `views.js`, after the `/reviews` route:

```js
/**
 * GET /review-queue
 * Cross-chapter review queue
 */
router.get('/review-queue', (req, res) => {
  sendView(res, 'review-queue.html');
});
```

**Step 2: Create review-queue.html**

Follow the pattern from existing views (segment-editor.html, reviews.html). The page should have:

- Header with nav links (matching existing nav pattern)
- Book selector dropdown (default: efnafraedi)
- Table with columns: Kafli | Eining | Ritstjóri | Sent | Breytingar | SLA | Aðgerð
- Each row color-coded by SLA status (green/yellow/red)
- "Yfirfara" (Review) link → opens segment editor for that module review
- Auto-fetch on page load from `/api/segment-editor/review-queue`

*Read an existing view file (e.g., reviews.html) first to match the HTML structure, CSS classes, and nav links pattern.*

**Step 3: Add nav link**

Check existing views for the nav pattern and add a link to `/review-queue` in the navigation.

**Step 4: Verify**

Open `http://localhost:3000/review-queue` in browser — page should load and display the queue table (may be empty if no pending reviews).

**Step 5: Commit**

```
feat(D): add review queue page with SLA indicators
```

---

## Task 8: Final Verification

**Step 1: Run all tests**

```bash
npm test
```

Expected: All 49 tests pass.

**Step 2: Verify server starts cleanly**

```bash
node server/index.js
```

Check for startup errors. Confirm cleanup log appears.

**Step 3: Smoke test each feature**

- Feature A: Call publication endpoint — should run validation before pipeline
- Feature B: Call `POST /api/pipeline/prepare-tm` — should spawn prepare-for-align jobs
- Feature D: Visit `/review-queue` — should load and display the queue

**Step 4: Update ROADMAP.md**

Mark items A, B, D as done in the "Ideas Beyond the Roadmap" section references.

**Step 5: Commit**

```
docs: update roadmap for validation gate, TM prep, and review queue
```

---

## Summary

| Task | Feature | What | Files |
|------|---------|------|-------|
| 1 | A | Validation service function | publicationService.js |
| 2 | A | Wire into publication route | publicationService.js, publication.js |
| 3 | B | TM prep service function | pipelineService.js |
| 4 | B | TM prep route + UI button | pipeline.js, chapter.html |
| 5 | D | Review queue service function | segmentEditorService.js |
| 6 | D | Review queue API endpoint | segment-editor.js |
| 7 | D | Review queue HTML page + route | review-queue.html, views.js |
| 8 | — | Final verification + docs | tests, ROADMAP.md |

Tasks 1-2 (A), 3-4 (B), and 5-7 (D) are independent and can be parallelized.
