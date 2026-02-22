/**
 * Status Routes
 *
 * Provides pipeline status information for books and chapters.
 *
 * Book parameter: :book (Icelandic slug, e.g., 'efnafraedi')
 *
 * Endpoints:
 *   GET /api/status/dashboard          Get unified dashboard data (Mission Control)
 *   GET /api/status/:book              Get aggregated status for a book
 *   GET /api/status/:book/:chapter     Get status for a specific chapter
 *   GET /api/status/:book/summary      Get summary statistics
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const activityLog = require('../services/activityLog');
const { requireAuth } = require('../middleware/requireAuth');
const { requireAdmin } = require('../middleware/requireRole');
const {
  extractBaseSectionId,
  sectionHasAnyFile,
  getUniqueSections,
} = require('../services/splitFileUtils');
const { VALID_BOOKS } = require('../config');

// Project root
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Validate :book param on all routes that use it
router.param('book', (req, res, next, book) => {
  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({
      error: 'Invalid book',
      message: `Book must be one of: ${VALID_BOOKS.join(', ')}`,
    });
  }
  next();
});

// 8-step pipeline stages (extract-inject-render workflow)
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

// Status symbols for display
const STATUS_SYMBOLS = {
  complete: '\u2705', // ✅
  'in-progress': '\ud83d\udd04', // 🔄
  pending: '\u23f3', // ⏳
  'not-started': '\u25cb', // ○
  blocked: '\u274c', // ❌
};

// ============================================================================
// DASHBOARD (Mission Control)
// ============================================================================

/**
 * GET /api/status/dashboard
 * Get unified dashboard data for admin overview
 * Returns: needsAttention, teamActivity (24h), chapterMatrix, metrics, workload, overdueItems
 */
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const dashboard = {
      needsAttention: {
        pendingReviews: 0,
        blockedIssues: 0,
        unassignedWork: 0,
        items: [],
      },
      teamActivity: [],
      chapterMatrix: {},
      metrics: {
        velocity: null,
        projection: null,
        milestones: [],
      },
    };

    // Get all books
    for (const book of VALID_BOOKS) {
      const bookPath = path.join(PROJECT_ROOT, 'books', book);
      const chaptersPath = path.join(bookPath, 'chapters');

      if (!fs.existsSync(chaptersPath)) continue;

      const chapterDirs = fs
        .readdirSync(chaptersPath)
        .filter((d) => d.startsWith('ch'))
        .sort((a, b) => {
          const aNum = parseInt(a.replace('ch', ''));
          const bNum = parseInt(b.replace('ch', ''));
          return aNum - bNum;
        });

      dashboard.chapterMatrix[book] = {
        totalChapters: chapterDirs.length,
        chapters: [],
      };

      for (const chapterDir of chapterDirs) {
        const chapterNum = parseInt(chapterDir.replace('ch', ''));
        const statusPath = path.join(chaptersPath, chapterDir, 'status.json');

        const chapterData = {
          chapter: chapterNum,
          stages: {},
          progress: 0,
          assignment: null,
        };

        if (fs.existsSync(statusPath)) {
          try {
            const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
            const formatted = formatChapterStatus(statusData);
            chapterData.title = statusData.title;
            chapterData.progress = formatted.progress;
            chapterData.nextStage = formatted.nextStage;

            // Build stage map for matrix
            for (const stage of formatted.stages) {
              chapterData.stages[stage.stage] = stage.status;
            }

            // Check for unassigned in-progress work
            if (formatted.nextStage && !chapterData.assignment) {
              dashboard.needsAttention.unassignedWork++;
              dashboard.needsAttention.items.push({
                type: 'unassigned',
                book,
                chapter: chapterNum,
                stage: formatted.nextStage,
                message: `Kafli ${chapterNum} í vinnslu án úthlutunar`,
              });
            }
          } catch (err) {
            chapterData.error = err.message;
          }
        }

        dashboard.chapterMatrix[book].chapters.push(chapterData);
      }
    }

    // Get recent team activity (last 24 hours)
    try {
      const result = activityLog.search({
        limit: 20,
        offset: 0,
      });

      dashboard.teamActivity = result.activities.map((activity) => ({
        ...activity,
        timeAgo: formatTimeAgo(activity.createdAt),
        icon: getActivityIcon(activity.type),
        color: getActivityColor(activity.type),
      }));
    } catch (err) {
      console.error('Failed to get team activity:', err);
    }

    // Calculate velocity metrics
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      // Count completed sections in last 7 days
      const recentCompletions = activityLog.search({
        type: 'review_approved',
        limit: 100,
      });

      const completedThisWeek = recentCompletions.activities.filter((a) => {
        const activityDate = new Date(a.createdAt);
        return activityDate >= weekAgo;
      }).length;

      dashboard.metrics.velocity = {
        sectionsPerWeek: completedThisWeek,
        description: `${completedThisWeek} hlutar kláraðir síðustu 7 daga`,
      };

      // Milestone tracking for pilot (Chapters 1-4)
      let pilotComplete = 0;
      const pilotTotal = 4;

      if (dashboard.chapterMatrix.efnafraedi) {
        const pilotChapters = dashboard.chapterMatrix.efnafraedi.chapters.slice(0, 4);
        pilotComplete = pilotChapters.filter((ch) => ch.progress === 100).length;
      }

      dashboard.metrics.milestones = [
        {
          name: 'Kaflar 1-4 fyrir tilraunakennslu',
          complete: pilotComplete,
          total: pilotTotal,
          percentage: Math.round((pilotComplete / pilotTotal) * 100),
        },
      ];
    } catch (err) {
      console.error('Failed to calculate metrics:', err);
    }

    // Get pending reviews count
    try {
      const reviewsPath = path.join(__dirname, '..', 'data', 'reviews.json');
      if (fs.existsSync(reviewsPath)) {
        const reviews = JSON.parse(fs.readFileSync(reviewsPath, 'utf-8'));
        const pending = reviews.filter((r) => r.status === 'pending');
        dashboard.needsAttention.pendingReviews = pending.length;

        for (const review of pending.slice(0, 5)) {
          dashboard.needsAttention.items.push({
            type: 'review',
            book: review.book,
            chapter: review.chapter,
            section: review.section,
            submittedBy: review.submittedBy,
            message: `Yfirferð í bið: ${review.section}`,
          });
        }
      }
    } catch {
      // Reviews file may not exist
    }

    // Get blocked issues count
    try {
      const issuesPath = path.join(__dirname, '..', 'data', 'issues.json');
      if (fs.existsSync(issuesPath)) {
        const issues = JSON.parse(fs.readFileSync(issuesPath, 'utf-8'));
        const blocked = issues.filter((i) => i.category === 'BLOCKED' && i.status === 'pending');
        dashboard.needsAttention.blockedIssues = blocked.length;

        for (const issue of blocked.slice(0, 5)) {
          dashboard.needsAttention.items.push({
            type: 'blocked',
            description: issue.description,
            book: issue.book,
            chapter: issue.chapter,
            message: `Lokað á: ${issue.description}`,
          });
        }
      }
    } catch {
      // Issues file may not exist
    }

    res.json(dashboard);
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({
      error: 'Failed to get dashboard',
      message: err.message,
    });
  }
});

// ============================================================================
// ACTIVITY TIMELINE (must be before /:book to avoid route conflicts)
// ============================================================================

/**
 * GET /api/status/activity/timeline
 * Get activity timeline with optional filters
 */
router.get('/activity/timeline', requireAuth, (req, res) => {
  const { book, type, user, limit = 50, offset = 0 } = req.query;

  try {
    const result = activityLog.search({
      book: book || null,
      type: type || null,
      userId: user || null,
      limit: Math.min(parseInt(limit, 10) || 50, 200),
      offset: parseInt(offset, 10) || 0,
    });

    // Format activities for display
    const formattedActivities = result.activities.map((activity) => ({
      ...activity,
      timeAgo: formatTimeAgo(activity.createdAt),
      icon: getActivityIcon(activity.type),
      color: getActivityColor(activity.type),
    }));

    res.json({
      activities: formattedActivities,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.offset + result.activities.length < result.total,
    });
  } catch (err) {
    console.error('Activity timeline error:', err);
    res.status(500).json({
      error: 'Failed to get activity timeline',
      message: err.message,
    });
  }
});

/**
 * GET /api/status/activity/types
 * Get available activity types for filtering
 */
router.get('/activity/types', requireAuth, (req, res) => {
  res.json({
    types: Object.entries(activityLog.ACTIVITY_TYPES).map(([key, value]) => ({
      key,
      value,
      label: formatActivityType(value),
    })),
  });
});

// ============================================================================
// BOOK STATUS
// ============================================================================

/**
 * GET /api/status/:book
 * Get aggregated status for all chapters in a book
 */
router.get('/:book', requireAuth, (req, res) => {
  const { book } = req.params;

  try {
    const bookPath = path.join(PROJECT_ROOT, 'books', book);
    const chaptersPath = path.join(bookPath, 'chapters');

    if (!fs.existsSync(chaptersPath)) {
      return res.json({
        book,
        chapters: [],
        message: 'No chapter status data found',
      });
    }

    // Read all chapter directories
    const chapterDirs = fs
      .readdirSync(chaptersPath)
      .filter((d) => d.startsWith('ch'))
      .sort((a, b) => {
        const aNum = parseInt(a.replace('ch', ''));
        const bNum = parseInt(b.replace('ch', ''));
        return aNum - bNum;
      });

    const chapters = [];

    for (const chapterDir of chapterDirs) {
      const statusPath = path.join(chaptersPath, chapterDir, 'status.json');

      if (fs.existsSync(statusPath)) {
        try {
          const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
          chapters.push({
            chapter: parseInt(chapterDir.replace('ch', '')),
            chapterDir,
            ...formatChapterStatus(statusData),
          });
        } catch (err) {
          chapters.push({
            chapter: parseInt(chapterDir.replace('ch', '')),
            chapterDir,
            error: `Failed to parse status: ${err.message}`,
          });
        }
      }
    }

    // Calculate summary
    const summary = calculateSummary(chapters);

    res.json({
      book,
      totalChapters: chapters.length,
      summary,
      chapters,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to get status',
      message: err.message,
    });
  }
});

/**
 * GET /api/status/:book/summary
 * Get summary statistics for a book
 */
router.get('/:book/summary', requireAuth, (req, res) => {
  const { book } = req.params;

  try {
    const chaptersPath = path.join(PROJECT_ROOT, 'books', book, 'chapters');

    if (!fs.existsSync(chaptersPath)) {
      return res.json({
        book,
        summary: {
          totalChapters: 0,
          stagesComplete: {},
          overallProgress: 0,
        },
      });
    }

    const chapterDirs = fs.readdirSync(chaptersPath).filter((d) => d.startsWith('ch'));

    const stageCounts = {};
    PIPELINE_STAGES.forEach((stage) => {
      stageCounts[stage] = { complete: 0, inProgress: 0, pending: 0, notStarted: 0 };
    });

    for (const chapterDir of chapterDirs) {
      const statusPath = path.join(chaptersPath, chapterDir, 'status.json');

      if (fs.existsSync(statusPath)) {
        try {
          const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
          const status = statusData.status || {};

          for (const stage of PIPELINE_STAGES) {
            const stageData = status[stage] || {};
            let isComplete;
            if (stage === 'publication') {
              isComplete =
                stageData.mtPreview?.complete === true &&
                stageData.faithful?.complete === true &&
                stageData.localized?.complete === true;
            } else {
              isComplete = stageData.complete === true;
            }

            if (isComplete) stageCounts[stage].complete++;
            else stageCounts[stage].notStarted++;
          }
        } catch {
          // Skip invalid status files
        }
      }
    }

    // Calculate overall progress
    const totalChapters = chapterDirs.length;
    const publicationComplete = stageCounts.publication.complete;
    const overallProgress =
      totalChapters > 0 ? Math.round((publicationComplete / totalChapters) * 100) : 0;

    res.json({
      book,
      summary: {
        totalChapters,
        stages: stageCounts,
        overallProgress,
        chaptersFullyComplete: publicationComplete,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to get summary',
      message: err.message,
    });
  }
});

/**
 * GET /api/status/:book/:chapter
 * Get detailed status for a specific chapter
 */
router.get('/:book/:chapter', requireAuth, (req, res) => {
  const { book, chapter } = req.params;
  const chapterNum = parseInt(chapter);

  if (isNaN(chapterNum) || chapterNum < 1) {
    return res.status(400).json({
      error: 'Invalid chapter',
      message: 'Chapter must be a positive number',
    });
  }

  try {
    const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
    const statusPath = path.join(
      PROJECT_ROOT,
      'books',
      book,
      'chapters',
      chapterDir,
      'status.json'
    );
    const filesPath = path.join(PROJECT_ROOT, 'books', book, 'chapters', chapterDir, 'files.json');

    if (!fs.existsSync(statusPath)) {
      return res.status(404).json({
        error: 'Status not found',
        message: `No status file found for ${book} chapter ${chapterNum}`,
      });
    }

    const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));

    // Include files data if available
    let filesData = null;
    if (fs.existsSync(filesPath)) {
      try {
        filesData = JSON.parse(fs.readFileSync(filesPath, 'utf-8'));
      } catch {
        // Ignore files.json errors
      }
    }

    res.json({
      book,
      chapter: chapterNum,
      chapterDir,
      ...formatChapterStatus(statusData),
      files: filesData,
      actions: suggestNextActions(statusData),
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to get chapter status',
      message: err.message,
    });
  }
});

/**
 * GET /api/status/:book/:chapter/sections
 * Get section-level status for a specific chapter
 * Returns per-section stage status for expandable view
 */
router.get('/:book/:chapter/sections', requireAuth, (req, res) => {
  const { book, chapter } = req.params;
  const chapterNum = parseInt(chapter);

  if (isNaN(chapterNum) || chapterNum < 1) {
    return res.status(400).json({
      error: 'Invalid chapter',
      message: 'Chapter must be a positive number',
    });
  }

  try {
    const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
    const bookPath = path.join(PROJECT_ROOT, 'books', book);

    // Define directories to check for sections/modules
    const chapterStr = String(chapterNum).padStart(2, '0');
    const stagePaths = {
      extraction: path.join(bookPath, '02-for-mt', chapterDir),
      mtReady: path.join(bookPath, '02-for-mt', chapterDir), // Check for -links.json
      mtOutput: path.join(bookPath, '02-mt-output', chapterDir),
      linguisticReview: path.join(bookPath, '03-faithful-translation', chapterDir),
      tmCreated: path.join(bookPath, 'tm', chapterDir),
      injection: path.join(bookPath, '03-translated', 'mt-preview', chapterDir),
      rendering: path.join(bookPath, '05-publication', 'mt-preview', 'chapters', chapterStr),
      publication: path.join(bookPath, '05-publication', 'faithful', 'chapters', chapterStr),
    };

    // Collect all unique section IDs from all directories
    const sectionSet = new Set();

    // Check MT output first (primary source of sections)
    // Use extractBaseSectionId to normalize split files (e.g., "1-2(a).is.md" → "1-2")
    if (fs.existsSync(stagePaths.mtOutput)) {
      const files = fs.readdirSync(stagePaths.mtOutput).filter((f) => f.endsWith('.is.md'));
      files.forEach((f) => {
        // Extract base section ID, collapsing splits to their parent
        const sectionId = extractBaseSectionId(f);
        sectionSet.add(sectionId);
      });
    }

    // Also check EN source for sections not yet translated
    if (fs.existsSync(stagePaths.extraction)) {
      const files = fs.readdirSync(stagePaths.extraction).filter((f) => f.endsWith('.en.md'));
      files.forEach((f) => {
        // Extract base section ID, collapsing splits to their parent
        const sectionId = extractBaseSectionId(f);
        sectionSet.add(sectionId);
      });
    }

    // Sort sections naturally (intro first, then 1-1, 1-2, etc.)
    const sections = Array.from(sectionSet).sort((a, b) => {
      if (a === 'intro') return -1;
      if (b === 'intro') return 1;
      // Extract numeric parts for natural sort
      const [aMain, aSub] = a.split('-').map(Number);
      const [bMain, bSub] = b.split('-').map(Number);
      if (aMain !== bMain) return aMain - bMain;
      return (aSub || 0) - (bSub || 0);
    });

    // Build section status for each section
    const sectionStatuses = sections.map((sectionId) => {
      const stages = {};

      // Check extraction (EN source — may be split into parts like "1-2(a).en.md")
      const enFileExists = sectionHasAnyFile(stagePaths.extraction, sectionId, '.en.md');
      stages.extraction = enFileExists ? 'complete' : 'not-started';

      // Check mtReady (protected files with -links.json sidecars)
      const linksFile = path.join(stagePaths.mtReady, `${sectionId}-links.json`);
      stages.mtReady = fs.existsSync(linksFile)
        ? 'complete'
        : stages.extraction === 'complete'
          ? 'pending'
          : 'not-started';

      // Check MT output (may be split into parts like "1-2(a).is.md")
      const mtFileExists = sectionHasAnyFile(stagePaths.mtOutput, sectionId, '.is.md');
      stages.mtOutput = mtFileExists ? 'complete' : 'not-started';

      // Check faithful translation (Pass 1 review)
      const faithfulFile = path.join(stagePaths.linguisticReview, `${sectionId}.is.md`);
      if (fs.existsSync(faithfulFile)) {
        stages.linguisticReview = 'complete';
      } else if (stages.mtOutput === 'complete') {
        stages.linguisticReview = 'pending'; // Ready for review
      } else {
        stages.linguisticReview = 'not-started';
      }

      // Check TM (simplified - just check if any TMX exists for the chapter)
      const tmxFile = path.join(stagePaths.tmCreated, `${sectionId}.tmx`);
      const tmxAlternate = path.join(bookPath, 'tm', `${chapterDir}-${sectionId}.tmx`);
      if (fs.existsSync(tmxFile) || fs.existsSync(tmxAlternate)) {
        stages.tmCreated = 'complete';
      } else if (stages.linguisticReview === 'complete') {
        stages.tmCreated = 'pending';
      } else {
        stages.tmCreated = 'not-started';
      }

      // Check injection (translated CNXML exists)
      if (fs.existsSync(stagePaths.injection)) {
        // Look for any CNXML file matching this section's module
        const injectedFiles = fs
          .readdirSync(stagePaths.injection)
          .filter((f) => f.endsWith('.cnxml'));
        stages.injection = injectedFiles.length > 0 ? 'complete' : 'not-started';
      } else {
        stages.injection = stages.linguisticReview === 'complete' ? 'pending' : 'not-started';
      }

      // Check rendering (HTML exists in publication dir)
      if (fs.existsSync(stagePaths.rendering)) {
        const htmlFiles = fs.readdirSync(stagePaths.rendering).filter((f) => f.endsWith('.html'));
        stages.rendering = htmlFiles.length > 0 ? 'complete' : 'not-started';
      } else {
        stages.rendering = stages.injection === 'complete' ? 'pending' : 'not-started';
      }

      // Check publication (faithful HTML published)
      if (fs.existsSync(stagePaths.publication)) {
        const pubHtmlFiles = fs
          .readdirSync(stagePaths.publication)
          .filter((f) => f.endsWith('.html'));
        stages.publication = pubHtmlFiles.length > 0 ? 'complete' : 'not-started';
      } else if (stages.rendering === 'complete') {
        stages.publication = 'pending';
      } else {
        stages.publication = 'not-started';
      }

      return {
        id: sectionId,
        stages,
      };
    });

    // Calculate summary
    const summary = {
      totalSections: sections.length,
      byStage: {},
    };

    for (const stage of PIPELINE_STAGES) {
      summary.byStage[stage] = {
        complete: sectionStatuses.filter((s) => s.stages[stage] === 'complete').length,
        inProgress: sectionStatuses.filter((s) => s.stages[stage] === 'in-progress').length,
        pending: sectionStatuses.filter((s) => s.stages[stage] === 'pending').length,
        notStarted: sectionStatuses.filter((s) => s.stages[stage] === 'not-started').length,
      };
    }

    res.json({
      book,
      chapter: chapterNum,
      chapterDir,
      sections: sectionStatuses,
      summary,
      stages: PIPELINE_STAGES.map((s) => ({
        id: s,
        shortLabel:
          {
            extraction: 'Ext',
            mtReady: 'Rdy',
            mtOutput: 'MT',
            linguisticReview: 'Y1',
            tmCreated: 'TM',
            injection: 'Inj',
            rendering: 'Ren',
            publication: 'Pub',
          }[s] || s,
      })),
    });
  } catch (err) {
    console.error('Error getting section status:', err);
    res.status(500).json({
      error: 'Failed to get section status',
      message: err.message,
    });
  }
});

/**
 * Format chapter status for API response
 */
function formatChapterStatus(statusData) {
  const rawStatus = statusData.status || {};

  const stages = PIPELINE_STAGES.map((stage) => {
    const stageData = rawStatus[stage] || {};
    let isComplete;
    if (stage === 'publication') {
      // Publication is complete when all sub-tracks are complete
      isComplete =
        stageData.mtPreview?.complete === true &&
        stageData.faithful?.complete === true &&
        stageData.localized?.complete === true;
    } else {
      isComplete = stageData.complete === true;
    }
    const status = isComplete ? 'complete' : 'not-started';
    return {
      stage,
      status,
      symbol: STATUS_SYMBOLS[status] || STATUS_SYMBOLS['not-started'],
      complete: isComplete,
      date: stageData.date || null,
      editor: stageData.editor || null,
      notes: stageData.notes || null,
    };
  });

  // Calculate next stage
  let nextStage = null;

  for (let i = 0; i < stages.length; i++) {
    if (stages[i].status !== 'complete') {
      nextStage = stages[i].stage;
      break;
    }
  }

  // Calculate progress percentage
  const completedStages = stages.filter((s) => s.complete).length;
  const progress = Math.round((completedStages / stages.length) * 100);

  return {
    title: statusData.title || null,
    progress,
    nextStage,
    stages,
  };
}

/**
 * Calculate summary statistics from chapters
 */
function calculateSummary(chapters) {
  const summary = {
    totalChapters: chapters.length,
    complete: 0,
    inProgress: 0,
    notStarted: 0,
    avgProgress: 0,
  };

  let totalProgress = 0;

  for (const chapter of chapters) {
    if (chapter.error) continue;

    totalProgress += chapter.progress || 0;

    if (chapter.progress === 100) {
      summary.complete++;
    } else if (chapter.progress > 0) {
      summary.inProgress++;
    } else {
      summary.notStarted++;
    }
  }

  summary.avgProgress = chapters.length > 0 ? Math.round(totalProgress / chapters.length) : 0;

  return summary;
}

/**
 * Suggest next actions based on current status.
 * Uses canonical stage names from the 8-step pipeline.
 */
function suggestNextActions(statusData) {
  const rawStatus = statusData.status || {};
  const actions = [];

  // Helper: is a stage complete?
  const isComplete = (stage) => rawStatus[stage]?.complete === true;

  if (!isComplete('extraction')) {
    actions.push({
      stage: 'extraction',
      action: 'Extract EN segments from CNXML',
      command: 'node tools/cnxml-extract.js --chapter N',
    });
  } else if (!isComplete('mtReady')) {
    actions.push({
      stage: 'mtReady',
      action: 'Protect segments for MT',
      command: 'node tools/protect-segments-for-mt.js --batch books/efnafraedi/02-for-mt/chNN/',
    });
  } else if (!isComplete('mtOutput')) {
    actions.push({
      stage: 'mtOutput',
      action: 'Run through malstadur.is MT',
      manual: true,
      instructions: 'Upload segments to malstadur.is and download IS output',
    });
  } else if (!isComplete('linguisticReview')) {
    actions.push({
      stage: 'linguisticReview',
      action: 'Linguistic review (Pass 1) in segment editor',
      command: '/review-chapter',
    });
  } else if (!isComplete('tmCreated')) {
    actions.push({
      stage: 'tmCreated',
      action: 'Create TM via Matecat Align',
      manual: true,
      instructions: 'Run prepare-for-align, then upload to Matecat Align',
    });
  } else if (!isComplete('injection')) {
    actions.push({
      stage: 'injection',
      action: 'Inject translations into CNXML',
      command: 'Pipeline API: POST /api/pipeline/inject',
    });
  } else if (!isComplete('rendering')) {
    actions.push({
      stage: 'rendering',
      action: 'Render CNXML to HTML',
      command: 'Pipeline API: POST /api/pipeline/render',
    });
  } else if (!isComplete('publication')) {
    actions.push({
      stage: 'publication',
      action: 'Publish to web',
      command: 'Publication API: POST /api/publication/:book/:chapter/:track',
    });
  }

  return actions;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format time ago for display
 */
function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'rétt í þessu';
  if (seconds < 3600) return `fyrir ${Math.floor(seconds / 60)} mín`;
  if (seconds < 86400) return `fyrir ${Math.floor(seconds / 3600)} klst`;
  if (seconds < 604800) return `fyrir ${Math.floor(seconds / 86400)} dögum`;
  return date.toLocaleDateString('is-IS');
}

/**
 * Get icon for activity type
 */
function getActivityIcon(type) {
  const icons = {
    draft_saved: '💾',
    review_submitted: '📤',
    version_restored: '🔄',
    review_approved: '✅',
    changes_requested: '📝',
    commit_created: '📦',
    push_completed: '🚀',
    workflow_started: '▶️',
    workflow_completed: '🏁',
    file_uploaded: '📁',
    upload: '📤',
    assign_reviewer: '👤',
    assign_localizer: '🌍',
    status_change: '🔀',
    submit_review: '📋',
    approve_review: '✅',
    request_changes: '✏️',
    submit_localization: '🌐',
    approve_localization: '✅',
    request_localization_changes: '✏️',
  };
  return icons[type] || '📌';
}

/**
 * Get color class for activity type
 */
function getActivityColor(type) {
  if (type.includes('approved') || type.includes('completed')) return 'success';
  if (type.includes('request') || type.includes('changes')) return 'warning';
  if (type.includes('submit') || type.includes('assign')) return 'info';
  return 'default';
}

/**
 * Format activity type for display
 */
function formatActivityType(type) {
  const labels = {
    draft_saved: 'Drög vistuð',
    review_submitted: 'Yfirferð send inn',
    version_restored: 'Útgáfa endurheimt',
    review_approved: 'Yfirferð samþykkt',
    changes_requested: 'Breytingar óskast',
    commit_created: 'Commit búin til',
    push_completed: 'Push lokið',
    workflow_started: 'Verkflæði hafið',
    workflow_completed: 'Verkflæði lokið',
    file_uploaded: 'Skrá hlaðið upp',
    upload: 'Upphleðsla',
    assign_reviewer: 'Ritstjóri úthlutaður',
    assign_localizer: 'Staðfærandi úthlutaður',
    status_change: 'Staða breytt',
    submit_review: 'Yfirferð send',
    approve_review: 'Yfirferð samþykkt',
    request_changes: 'Breytingar óskast',
    submit_localization: 'Staðfæring send',
    approve_localization: 'Staðfæring samþykkt',
    request_localization_changes: 'Breytingar á staðfæringu óskast',
  };
  return labels[type] || type;
}

// ============================================================================
// STATUS SYNC (Filesystem scanning)
// ============================================================================

// Import bookRegistration for scan functions
let bookRegistration;
try {
  bookRegistration = require('../services/bookRegistration');
} catch {
  // Service may not be available in all contexts
  bookRegistration = null;
}

/**
 * GET /api/status/:book/scan
 * Dry-run: show what would change if status were synced
 */
router.get('/:book/scan', requireAuth, (req, res) => {
  const { book } = req.params;

  if (!bookRegistration || !bookRegistration.scanStatusDryRun) {
    return res.status(501).json({
      error: 'Not implemented',
      message: 'Status scanning requires bookRegistration service',
    });
  }

  try {
    const result = bookRegistration.scanStatusDryRun(book);

    // Calculate summary
    const summary = {
      totalChapters: result.chapters.length,
      wouldUpdate: 0,
      unchanged: 0,
      stagesAffected: {},
    };

    for (const chapter of result.chapters) {
      let chapterWouldUpdate = false;
      for (const [stage, info] of Object.entries(chapter.stages)) {
        if (info.wouldUpdate) {
          chapterWouldUpdate = true;
          summary.stagesAffected[stage] = (summary.stagesAffected[stage] || 0) + 1;
        }
      }
      if (chapterWouldUpdate) {
        summary.wouldUpdate++;
      } else {
        summary.unchanged++;
      }
    }

    res.json({
      book,
      dryRun: true,
      summary,
      chapters: result.chapters,
      errors: result.errors,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Scan failed',
      message: err.message,
    });
  }
});

/**
 * POST /api/status/:book/sync
 * Actually update status.json files based on filesystem
 */
router.post('/:book/sync', requireAuth, requireAdmin(), (req, res) => {
  const { book } = req.params;

  if (!bookRegistration || !bookRegistration.scanAndUpdateStatus) {
    return res.status(501).json({
      error: 'Not implemented',
      message: 'Status sync requires bookRegistration service',
    });
  }

  try {
    const result = bookRegistration.scanAndUpdateStatus(book);

    res.json({
      book,
      success: result.errors.length === 0,
      updated: result.updated,
      unchanged: result.unchanged,
      changes: result.changes || [],
      errors: result.errors,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Sync failed',
      message: err.message,
    });
  }
});

/**
 * POST /api/status/:book/:chapter/sync
 * Update status for a single chapter
 */
router.post('/:book/:chapter/sync', requireAuth, requireAdmin(), (req, res) => {
  const { book, chapter } = req.params;
  const chapterNum = parseInt(chapter);

  if (isNaN(chapterNum) || chapterNum < 1) {
    return res.status(400).json({
      error: 'Invalid chapter',
      message: 'Chapter must be a positive number',
    });
  }

  if (!bookRegistration || !bookRegistration.scanAndUpdateStatus) {
    return res.status(501).json({
      error: 'Not implemented',
      message: 'Status sync requires bookRegistration service',
    });
  }

  try {
    const chapterStr = String(chapterNum).padStart(2, '0');
    const result = bookRegistration.scanAndUpdateStatus(book, chapterStr);

    res.json({
      book,
      chapter: chapterNum,
      success: result.errors.length === 0,
      updated: result.updated,
      unchanged: result.unchanged,
      changes: result.changes || [],
      errors: result.errors,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Sync failed',
      message: err.message,
    });
  }
});

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * GET /api/status/analytics
 * Get detailed analytics for the project
 *
 * Returns:
 *   - velocity: Sections completed per period
 *   - burndown: Work remaining over time
 *   - projections: Estimated completion dates
 *   - teamMetrics: Per-user productivity
 *   - stageMetrics: Completion rates per stage
 */
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const analytics = {
      generatedAt: new Date().toISOString(),
      velocity: {},
      burndown: {},
      projections: {},
      teamMetrics: [],
      stageMetrics: [],
      weeklyProgress: [],
    };

    // Calculate velocity over different periods
    const periods = [
      { name: 'last7days', days: 7, label: 'Síðustu 7 dagar' },
      { name: 'last14days', days: 14, label: 'Síðustu 14 dagar' },
      { name: 'last30days', days: 30, label: 'Síðustu 30 dagar' },
    ];

    for (const period of periods) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - period.days);

      const result = activityLog.search({
        type: 'review_approved',
        limit: 500,
      });

      const completedInPeriod = result.activities.filter((a) => {
        const activityDate = new Date(a.createdAt);
        return activityDate >= startDate;
      }).length;

      const avgPerDay = (completedInPeriod / period.days).toFixed(2);

      analytics.velocity[period.name] = {
        label: period.label,
        total: completedInPeriod,
        averagePerDay: parseFloat(avgPerDay),
        averagePerWeek: parseFloat((avgPerDay * 7).toFixed(2)),
      };
    }

    // Calculate burndown data (work remaining)
    let totalSections = 0;
    let completedSections = 0;
    let inProgressSections = 0;

    for (const book of VALID_BOOKS) {
      const bookPath = path.join(PROJECT_ROOT, 'books', book);
      const chaptersPath = path.join(bookPath, 'chapters');

      if (!fs.existsSync(chaptersPath)) continue;

      const chapterDirs = fs.readdirSync(chaptersPath).filter((d) => d.startsWith('ch'));

      for (const chapterDir of chapterDirs) {
        // Count sections in this chapter
        const faithfulPath = path.join(
          bookPath,
          '03-faithful-translation',
          chapterDir.replace('ch', 'ch')
        );
        const mtOutputPath = path.join(bookPath, '02-mt-output', chapterDir.replace('ch', 'ch'));

        // Estimate sections based on files (normalize split files to base sections)
        if (fs.existsSync(faithfulPath)) {
          try {
            const faithfulFiles = fs.readdirSync(faithfulPath).filter((f) => f.endsWith('.is.md'));
            const uniqueFaithfulSections = getUniqueSections(faithfulFiles);
            completedSections += uniqueFaithfulSections.length;
            totalSections += uniqueFaithfulSections.length;
          } catch {
            /* ignore */
          }
        }

        if (fs.existsSync(mtOutputPath)) {
          try {
            const mtFiles = fs.readdirSync(mtOutputPath).filter((f) => f.endsWith('.is.md'));
            const uniqueMtSections = getUniqueSections(mtFiles);
            // Add sections that are in MT output but not in faithful
            const faithfulCount = fs.existsSync(faithfulPath)
              ? getUniqueSections(fs.readdirSync(faithfulPath).filter((f) => f.endsWith('.is.md')))
                  .length
              : 0;
            const mtOnlyCount = Math.max(0, uniqueMtSections.length - faithfulCount);
            inProgressSections += mtOnlyCount;
            totalSections += mtOnlyCount;
          } catch {
            /* ignore */
          }
        }
      }
    }

    analytics.burndown = {
      totalSections,
      completedSections,
      inProgressSections,
      remainingSections: totalSections - completedSections,
      percentComplete:
        totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0,
    };

    // Calculate projections based on velocity
    const currentVelocity = analytics.velocity.last7days.averagePerDay;

    if (currentVelocity > 0) {
      const remaining = totalSections - completedSections;
      const daysToComplete = Math.ceil(remaining / currentVelocity);
      const projectedDate = new Date();
      projectedDate.setDate(projectedDate.getDate() + daysToComplete);

      analytics.projections = {
        sectionsRemaining: remaining,
        currentVelocity: currentVelocity,
        estimatedDaysToComplete: daysToComplete,
        estimatedWeeksToComplete: Math.ceil(daysToComplete / 7),
        projectedCompletionDate: projectedDate.toISOString(),
        projectedCompletionDateFormatted: projectedDate.toLocaleDateString('is-IS', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        confidence: daysToComplete <= 30 ? 'high' : daysToComplete <= 90 ? 'medium' : 'low',
      };
    } else {
      analytics.projections = {
        sectionsRemaining: totalSections - completedSections,
        currentVelocity: 0,
        estimatedDaysToComplete: null,
        message: 'Ófullnægjandi gögn til að spá fyrir um lokadagsetningu',
      };
    }

    // Per-user team metrics
    try {
      const last30Days = new Date();
      last30Days.setDate(last30Days.getDate() - 30);

      const result = activityLog.search({
        limit: 1000,
      });

      const userStats = {};

      for (const activity of result.activities) {
        const activityDate = new Date(activity.createdAt);
        if (activityDate < last30Days) continue;

        const user = activity.username || 'unknown';
        if (!userStats[user]) {
          userStats[user] = {
            username: user,
            totalActions: 0,
            reviews: 0,
            approvals: 0,
            drafts: 0,
            submissions: 0,
            lastActive: null,
          };
        }

        userStats[user].totalActions++;

        if (activity.type === 'review_approved' || activity.type === 'approve_review') {
          userStats[user].approvals++;
        } else if (activity.type === 'review_submitted' || activity.type === 'submit_review') {
          userStats[user].submissions++;
        } else if (activity.type === 'draft_saved') {
          userStats[user].drafts++;
        }

        if (
          !userStats[user].lastActive ||
          new Date(activity.createdAt) > new Date(userStats[user].lastActive)
        ) {
          userStats[user].lastActive = activity.createdAt;
        }
      }

      analytics.teamMetrics = Object.values(userStats).sort(
        (a, b) => b.totalActions - a.totalActions
      );
    } catch (e) {
      console.log('Could not calculate team metrics:', e.message);
    }

    // Per-stage metrics
    const stageStats = {};
    for (const stage of PIPELINE_STAGES) {
      stageStats[stage] = { complete: 0, inProgress: 0, pending: 0, notStarted: 0 };
    }

    for (const book of VALID_BOOKS) {
      const chaptersPath = path.join(PROJECT_ROOT, 'books', book, 'chapters');
      if (!fs.existsSync(chaptersPath)) continue;

      const chapterDirs = fs.readdirSync(chaptersPath).filter((d) => d.startsWith('ch'));

      for (const chapterDir of chapterDirs) {
        const statusPath = path.join(chaptersPath, chapterDir, 'status.json');
        if (!fs.existsSync(statusPath)) continue;

        try {
          const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
          const status = statusData.status || {};

          for (const stage of PIPELINE_STAGES) {
            const stageData = status[stage] || {};
            let isComplete;
            if (stage === 'publication') {
              isComplete =
                stageData.mtPreview?.complete === true &&
                stageData.faithful?.complete === true &&
                stageData.localized?.complete === true;
            } else {
              isComplete = stageData.complete === true;
            }
            if (isComplete) stageStats[stage].complete++;
            else stageStats[stage].notStarted++;
          }
        } catch {
          /* ignore */
        }
      }
    }

    const totalChapters = Object.values(stageStats)[0]
      ? Object.values(stageStats[PIPELINE_STAGES[0]]).reduce((a, b) => a + b, 0)
      : 0;

    analytics.stageMetrics = PIPELINE_STAGES.map((stage) => ({
      stage,
      ...stageStats[stage],
      total: totalChapters,
      percentComplete:
        totalChapters > 0 ? Math.round((stageStats[stage].complete / totalChapters) * 100) : 0,
    }));

    // Weekly progress over last 8 weeks
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - i * 7 - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const result = activityLog.search({
        type: 'review_approved',
        limit: 500,
      });

      const completedInWeek = result.activities.filter((a) => {
        const d = new Date(a.createdAt);
        return d >= weekStart && d < weekEnd;
      }).length;

      weeks.push({
        weekStart: weekStart.toISOString(),
        weekLabel: `Vika ${8 - i}`,
        completedSections: completedInWeek,
      });
    }

    analytics.weeklyProgress = weeks;

    // Pilot milestone tracking
    const pilotChapters = [1, 2, 3, 4];
    let pilotSectionsTotal = 0;
    let pilotSectionsComplete = 0;

    for (const chNum of pilotChapters) {
      const chDir = `ch${String(chNum).padStart(2, '0')}`;
      const faithfulPath = path.join(
        PROJECT_ROOT,
        'books',
        'efnafraedi',
        '03-faithful-translation',
        chDir
      );
      const mtOutputPath = path.join(PROJECT_ROOT, 'books', 'efnafraedi', '02-mt-output', chDir);

      if (fs.existsSync(mtOutputPath)) {
        try {
          const mtFiles = fs.readdirSync(mtOutputPath).filter((f) => f.endsWith('.is.md'));
          // Count unique base sections (collapse split parts)
          pilotSectionsTotal += getUniqueSections(mtFiles).length;
        } catch {
          /* ignore */
        }
      }

      if (fs.existsSync(faithfulPath)) {
        try {
          const faithfulFiles = fs.readdirSync(faithfulPath).filter((f) => f.endsWith('.is.md'));
          // Count unique base sections (collapse split parts)
          pilotSectionsComplete += getUniqueSections(faithfulFiles).length;
        } catch {
          /* ignore */
        }
      }
    }

    analytics.pilotMilestone = {
      name: 'Kaflar 1-4 fyrir janúar 2026',
      chapters: pilotChapters,
      totalSections: pilotSectionsTotal,
      completedSections: pilotSectionsComplete,
      percentComplete:
        pilotSectionsTotal > 0 ? Math.round((pilotSectionsComplete / pilotSectionsTotal) * 100) : 0,
      onTrack: pilotSectionsComplete >= pilotSectionsTotal * 0.5, // Simple heuristic
    };

    res.json(analytics);
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({
      error: 'Failed to generate analytics',
      message: err.message,
    });
  }
});

module.exports = router;
