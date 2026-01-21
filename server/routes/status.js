/**
 * Status Routes
 *
 * Provides pipeline status information for books and chapters.
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

// Import assignment store (will create if not exists)
let assignmentStore;
try {
  assignmentStore = require('../services/assignmentStore');
} catch (e) {
  assignmentStore = null;
}

// Project root
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Valid books
const VALID_BOOKS = ['efnafraedi', 'liffraedi'];

// Simplified 5-step pipeline stages (aligned with workflow docs)
const PIPELINE_STAGES = [
  'enMarkdown',
  'mtOutput',
  'linguisticReview',
  'tmCreated',
  'publication'
];

// Map old stage names to new ones (backward compatibility)
const STAGE_MAPPING = {
  'source': 'enMarkdown',
  'matecat': 'tmCreated',
  'editorialPass1': 'linguisticReview',
  'tmUpdated': 'tmCreated',
  'editorialPass2': 'publication'
};

// Helper to normalize stage names from old status files
function normalizeStageStatus(status) {
  const normalized = {};
  for (const [key, value] of Object.entries(status)) {
    const newKey = STAGE_MAPPING[key] || key;
    // Prefer newer stage name if both exist
    if (!normalized[newKey] || (value && value.complete)) {
      normalized[newKey] = value;
    }
  }
  return normalized;
}

// Status symbols for display
const STATUS_SYMBOLS = {
  'complete': '\u2705',     // ✅
  'in-progress': '\ud83d\udd04', // 🔄
  'pending': '\u23f3',      // ⏳
  'not-started': '\u25cb',  // ○
  'blocked': '\u274c'       // ❌
};

// ============================================================================
// DASHBOARD (Mission Control)
// ============================================================================

/**
 * GET /api/status/dashboard
 * Get unified dashboard data for admin overview
 * Returns: needsAttention, teamActivity (24h), chapterMatrix, metrics
 */
router.get('/dashboard', async (req, res) => {
  try {
    const dashboard = {
      needsAttention: {
        pendingReviews: 0,
        blockedIssues: 0,
        unassignedWork: 0,
        items: []
      },
      teamActivity: [],
      chapterMatrix: {},
      metrics: {
        velocity: null,
        projection: null,
        milestones: []
      }
    };

    // Get all books
    for (const book of VALID_BOOKS) {
      const bookPath = path.join(PROJECT_ROOT, 'books', book);
      const chaptersPath = path.join(bookPath, 'chapters');

      if (!fs.existsSync(chaptersPath)) continue;

      const chapterDirs = fs.readdirSync(chaptersPath)
        .filter(d => d.startsWith('ch'))
        .sort((a, b) => {
          const aNum = parseInt(a.replace('ch', ''));
          const bNum = parseInt(b.replace('ch', ''));
          return aNum - bNum;
        });

      dashboard.chapterMatrix[book] = {
        totalChapters: chapterDirs.length,
        chapters: []
      };

      for (const chapterDir of chapterDirs) {
        const chapterNum = parseInt(chapterDir.replace('ch', ''));
        const statusPath = path.join(chaptersPath, chapterDir, 'status.json');

        let chapterData = {
          chapter: chapterNum,
          stages: {},
          progress: 0,
          assignment: null
        };

        if (fs.existsSync(statusPath)) {
          try {
            const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
            const formatted = formatChapterStatus(statusData);
            chapterData.title = statusData.title;
            chapterData.progress = formatted.progress;
            chapterData.currentStage = formatted.currentStage;
            chapterData.nextStage = formatted.nextStage;

            // Build stage map for matrix
            for (const stage of formatted.stages) {
              chapterData.stages[stage.stage] = stage.status;
            }

            // Check for unassigned in-progress work
            if (formatted.currentStage && !chapterData.assignment) {
              dashboard.needsAttention.unassignedWork++;
              dashboard.needsAttention.items.push({
                type: 'unassigned',
                book,
                chapter: chapterNum,
                stage: formatted.currentStage,
                message: `Kafli ${chapterNum} í vinnslu án úthlutunar`
              });
            }
          } catch (err) {
            chapterData.error = err.message;
          }
        }

        // Get assignment if available
        if (assignmentStore) {
          try {
            const assignment = assignmentStore.getAssignment(book, chapterNum);
            if (assignment) {
              chapterData.assignment = assignment;
            }
          } catch (e) {
            // Assignment store not available
          }
        }

        dashboard.chapterMatrix[book].chapters.push(chapterData);
      }
    }

    // Get recent team activity (last 24 hours)
    try {
      const result = activityLog.search({
        limit: 20,
        offset: 0
      });

      dashboard.teamActivity = result.activities.map(activity => ({
        ...activity,
        timeAgo: formatTimeAgo(activity.createdAt),
        icon: getActivityIcon(activity.type),
        color: getActivityColor(activity.type)
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
        limit: 100
      });

      const completedThisWeek = recentCompletions.activities.filter(a => {
        const activityDate = new Date(a.createdAt);
        return activityDate >= weekAgo;
      }).length;

      dashboard.metrics.velocity = {
        sectionsPerWeek: completedThisWeek,
        description: `${completedThisWeek} hlutar kláraðir síðustu 7 daga`
      };

      // Milestone tracking for pilot (Chapters 1-4)
      let pilotComplete = 0;
      let pilotTotal = 4;

      if (dashboard.chapterMatrix.efnafraedi) {
        const pilotChapters = dashboard.chapterMatrix.efnafraedi.chapters.slice(0, 4);
        pilotComplete = pilotChapters.filter(ch => ch.progress === 100).length;
      }

      dashboard.metrics.milestones = [{
        name: 'Kaflar 1-4 fyrir tilraunakennslu',
        complete: pilotComplete,
        total: pilotTotal,
        percentage: Math.round((pilotComplete / pilotTotal) * 100)
      }];

    } catch (err) {
      console.error('Failed to calculate metrics:', err);
    }

    // Get pending reviews count
    try {
      const reviewsPath = path.join(__dirname, '..', 'data', 'reviews.json');
      if (fs.existsSync(reviewsPath)) {
        const reviews = JSON.parse(fs.readFileSync(reviewsPath, 'utf-8'));
        const pending = reviews.filter(r => r.status === 'pending');
        dashboard.needsAttention.pendingReviews = pending.length;

        for (const review of pending.slice(0, 5)) {
          dashboard.needsAttention.items.push({
            type: 'review',
            book: review.book,
            chapter: review.chapter,
            section: review.section,
            submittedBy: review.submittedBy,
            message: `Yfirferð í bið: ${review.section}`
          });
        }
      }
    } catch (err) {
      // Reviews file may not exist
    }

    // Get blocked issues count
    try {
      const issuesPath = path.join(__dirname, '..', 'data', 'issues.json');
      if (fs.existsSync(issuesPath)) {
        const issues = JSON.parse(fs.readFileSync(issuesPath, 'utf-8'));
        const blocked = issues.filter(i => i.category === 'BLOCKED' && i.status === 'pending');
        dashboard.needsAttention.blockedIssues = blocked.length;

        for (const issue of blocked.slice(0, 5)) {
          dashboard.needsAttention.items.push({
            type: 'blocked',
            description: issue.description,
            book: issue.book,
            chapter: issue.chapter,
            message: `Lokað á: ${issue.description}`
          });
        }
      }
    } catch (err) {
      // Issues file may not exist
    }

    res.json(dashboard);

  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({
      error: 'Failed to get dashboard',
      message: err.message
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
router.get('/activity/timeline', (req, res) => {
  const { book, type, user, limit = 50, offset = 0 } = req.query;

  try {
    const result = activityLog.search({
      book: book || null,
      type: type || null,
      userId: user || null,
      limit: Math.min(parseInt(limit, 10) || 50, 200),
      offset: parseInt(offset, 10) || 0
    });

    // Format activities for display
    const formattedActivities = result.activities.map(activity => ({
      ...activity,
      timeAgo: formatTimeAgo(activity.createdAt),
      icon: getActivityIcon(activity.type),
      color: getActivityColor(activity.type)
    }));

    res.json({
      activities: formattedActivities,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.offset + result.activities.length < result.total
    });
  } catch (err) {
    console.error('Activity timeline error:', err);
    res.status(500).json({
      error: 'Failed to get activity timeline',
      message: err.message
    });
  }
});

/**
 * GET /api/status/activity/types
 * Get available activity types for filtering
 */
router.get('/activity/types', (req, res) => {
  res.json({
    types: Object.entries(activityLog.ACTIVITY_TYPES).map(([key, value]) => ({
      key,
      value,
      label: formatActivityType(value)
    }))
  });
});

// ============================================================================
// BOOK STATUS
// ============================================================================

/**
 * GET /api/status/:book
 * Get aggregated status for all chapters in a book
 */
router.get('/:book', (req, res) => {
  const { book } = req.params;

  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({
      error: 'Invalid book',
      message: `Book must be one of: ${VALID_BOOKS.join(', ')}`
    });
  }

  try {
    const bookPath = path.join(PROJECT_ROOT, 'books', book);
    const chaptersPath = path.join(bookPath, 'chapters');

    if (!fs.existsSync(chaptersPath)) {
      return res.json({
        book,
        chapters: [],
        message: 'No chapter status data found'
      });
    }

    // Read all chapter directories
    const chapterDirs = fs.readdirSync(chaptersPath)
      .filter(d => d.startsWith('ch'))
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
            ...formatChapterStatus(statusData)
          });
        } catch (err) {
          chapters.push({
            chapter: parseInt(chapterDir.replace('ch', '')),
            chapterDir,
            error: `Failed to parse status: ${err.message}`
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
      chapters
    });

  } catch (err) {
    res.status(500).json({
      error: 'Failed to get status',
      message: err.message
    });
  }
});

/**
 * GET /api/status/:book/summary
 * Get summary statistics for a book
 */
router.get('/:book/summary', (req, res) => {
  const { book } = req.params;

  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({
      error: 'Invalid book',
      message: `Book must be one of: ${VALID_BOOKS.join(', ')}`
    });
  }

  try {
    const chaptersPath = path.join(PROJECT_ROOT, 'books', book, 'chapters');

    if (!fs.existsSync(chaptersPath)) {
      return res.json({
        book,
        summary: {
          totalChapters: 0,
          stagesComplete: {},
          overallProgress: 0
        }
      });
    }

    const chapterDirs = fs.readdirSync(chaptersPath)
      .filter(d => d.startsWith('ch'));

    const stageCounts = {};
    PIPELINE_STAGES.forEach(stage => {
      stageCounts[stage] = { complete: 0, inProgress: 0, pending: 0, notStarted: 0 };
    });

    for (const chapterDir of chapterDirs) {
      const statusPath = path.join(chaptersPath, chapterDir, 'status.json');

      if (fs.existsSync(statusPath)) {
        try {
          const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
          const status = statusData.status || {};

          for (const stage of PIPELINE_STAGES) {
            const stageStatus = status[stage]?.status || 'not-started';

            if (stageStatus === 'complete') stageCounts[stage].complete++;
            else if (stageStatus === 'in-progress') stageCounts[stage].inProgress++;
            else if (stageStatus === 'pending') stageCounts[stage].pending++;
            else stageCounts[stage].notStarted++;
          }
        } catch (err) {
          // Skip invalid status files
        }
      }
    }

    // Calculate overall progress
    const totalChapters = chapterDirs.length;
    const publicationComplete = stageCounts.publication.complete;
    const overallProgress = totalChapters > 0
      ? Math.round((publicationComplete / totalChapters) * 100)
      : 0;

    res.json({
      book,
      summary: {
        totalChapters,
        stages: stageCounts,
        overallProgress,
        chaptersFullyComplete: publicationComplete
      }
    });

  } catch (err) {
    res.status(500).json({
      error: 'Failed to get summary',
      message: err.message
    });
  }
});

/**
 * GET /api/status/:book/:chapter
 * Get detailed status for a specific chapter
 */
router.get('/:book/:chapter', (req, res) => {
  const { book, chapter } = req.params;
  const chapterNum = parseInt(chapter);

  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({
      error: 'Invalid book',
      message: `Book must be one of: ${VALID_BOOKS.join(', ')}`
    });
  }

  if (isNaN(chapterNum) || chapterNum < 1) {
    return res.status(400).json({
      error: 'Invalid chapter',
      message: 'Chapter must be a positive number'
    });
  }

  try {
    const chapterDir = `ch${String(chapterNum).padStart(2, '0')}`;
    const statusPath = path.join(PROJECT_ROOT, 'books', book, 'chapters', chapterDir, 'status.json');
    const filesPath = path.join(PROJECT_ROOT, 'books', book, 'chapters', chapterDir, 'files.json');

    if (!fs.existsSync(statusPath)) {
      return res.status(404).json({
        error: 'Status not found',
        message: `No status file found for ${book} chapter ${chapterNum}`
      });
    }

    const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));

    // Include files data if available
    let filesData = null;
    if (fs.existsSync(filesPath)) {
      try {
        filesData = JSON.parse(fs.readFileSync(filesPath, 'utf-8'));
      } catch (err) {
        // Ignore files.json errors
      }
    }

    res.json({
      book,
      chapter: chapterNum,
      chapterDir,
      ...formatChapterStatus(statusData),
      files: filesData,
      actions: suggestNextActions(statusData)
    });

  } catch (err) {
    res.status(500).json({
      error: 'Failed to get chapter status',
      message: err.message
    });
  }
});

/**
 * Format chapter status for API response
 */
function formatChapterStatus(statusData) {
  // Normalize old stage names to new 5-step schema
  const rawStatus = statusData.status || {};
  const status = normalizeStageStatus(rawStatus);

  const stages = PIPELINE_STAGES.map(stage => {
    const stageData = status[stage] || {};
    return {
      stage,
      status: stageData.status || 'not-started',
      symbol: STATUS_SYMBOLS[stageData.status] || STATUS_SYMBOLS['not-started'],
      complete: stageData.status === 'complete',
      date: stageData.date || null,
      editor: stageData.editor || null,
      notes: stageData.notes || null
    };
  });

  // Calculate current stage
  let currentStage = null;
  let nextStage = null;

  for (let i = 0; i < stages.length; i++) {
    if (stages[i].status === 'in-progress') {
      currentStage = stages[i].stage;
      break;
    }
    if (stages[i].status !== 'complete') {
      nextStage = stages[i].stage;
      break;
    }
  }

  // Calculate progress percentage
  const completedStages = stages.filter(s => s.complete).length;
  const progress = Math.round((completedStages / stages.length) * 100);

  return {
    title: statusData.title || null,
    progress,
    currentStage,
    nextStage,
    stages
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
    avgProgress: 0
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

  summary.avgProgress = chapters.length > 0
    ? Math.round(totalProgress / chapters.length)
    : 0;

  return summary;
}

/**
 * Suggest next actions based on current status
 */
function suggestNextActions(statusData) {
  const status = statusData.status || {};
  const actions = [];

  // Check each stage and suggest actions
  if (!status.source?.status || status.source?.status === 'not-started') {
    actions.push({
      stage: 'source',
      action: 'Register source files',
      command: '/intake-source'
    });
  } else if (status.source?.status === 'complete' && (!status.mtOutput?.status || status.mtOutput?.status === 'not-started')) {
    actions.push({
      stage: 'mtOutput',
      action: 'Run through Erlendur MT',
      manual: true,
      instructions: 'Download markdown and upload to malstadur.is'
    });
  } else if (status.mtOutput?.status === 'complete' && (!status.matecat?.status || status.matecat?.status === 'not-started')) {
    actions.push({
      stage: 'matecat',
      action: 'Upload to Matecat for alignment',
      manual: true,
      instructions: 'Create Matecat project with XLIFF file'
    });
  } else if (status.matecat?.status === 'complete' && (!status.editorialPass1?.status || status.editorialPass1?.status !== 'complete')) {
    actions.push({
      stage: 'editorialPass1',
      action: 'Run editorial review (Pass 1)',
      command: '/review-chapter'
    });
  } else if (status.editorialPass1?.status === 'complete' && (!status.tmUpdated?.status || status.tmUpdated?.status === 'not-started')) {
    actions.push({
      stage: 'tmUpdated',
      action: 'Export updated TM',
      command: 'node tools/xliff-to-tmx.js'
    });
  } else if (status.tmUpdated?.status === 'complete' && (!status.editorialPass2?.status || status.editorialPass2?.status !== 'complete')) {
    actions.push({
      stage: 'editorialPass2',
      action: 'Run localization review (Pass 2)',
      command: '/localize-chapter'
    });
  } else if (status.editorialPass2?.status === 'complete' && (!status.publication?.status || status.publication?.status !== 'complete')) {
    actions.push({
      stage: 'publication',
      action: 'Prepare for publication',
      command: '/tag-for-publication'
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
    'draft_saved': '💾',
    'review_submitted': '📤',
    'version_restored': '🔄',
    'review_approved': '✅',
    'changes_requested': '📝',
    'commit_created': '📦',
    'push_completed': '🚀',
    'workflow_started': '▶️',
    'workflow_completed': '🏁',
    'file_uploaded': '📁',
    'upload': '📤',
    'assign_reviewer': '👤',
    'assign_localizer': '🌍',
    'status_change': '🔀',
    'submit_review': '📋',
    'approve_review': '✅',
    'request_changes': '✏️',
    'submit_localization': '🌐',
    'approve_localization': '✅',
    'request_localization_changes': '✏️'
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
    'draft_saved': 'Drög vistuð',
    'review_submitted': 'Yfirferð send inn',
    'version_restored': 'Útgáfa endurheimt',
    'review_approved': 'Yfirferð samþykkt',
    'changes_requested': 'Breytingar óskast',
    'commit_created': 'Commit búin til',
    'push_completed': 'Push lokið',
    'workflow_started': 'Verkflæði hafið',
    'workflow_completed': 'Verkflæði lokið',
    'file_uploaded': 'Skrá hlaðið upp',
    'upload': 'Upphleðsla',
    'assign_reviewer': 'Ritstjóri úthlutaður',
    'assign_localizer': 'Staðfærandi úthlutaður',
    'status_change': 'Staða breytt',
    'submit_review': 'Yfirferð send',
    'approve_review': 'Yfirferð samþykkt',
    'request_changes': 'Breytingar óskast',
    'submit_localization': 'Staðfæring send',
    'approve_localization': 'Staðfæring samþykkt',
    'request_localization_changes': 'Breytingar á staðfæringu óskast'
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
} catch (e) {
  // Service may not be available in all contexts
  bookRegistration = null;
}

/**
 * GET /api/status/:book/scan
 * Dry-run: show what would change if status were synced
 */
router.get('/:book/scan', (req, res) => {
  const { book } = req.params;

  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({
      error: 'Invalid book',
      message: `Book must be one of: ${VALID_BOOKS.join(', ')}`
    });
  }

  if (!bookRegistration || !bookRegistration.scanStatusDryRun) {
    return res.status(501).json({
      error: 'Not implemented',
      message: 'Status scanning requires bookRegistration service'
    });
  }

  try {
    const result = bookRegistration.scanStatusDryRun(book);

    // Calculate summary
    const summary = {
      totalChapters: result.chapters.length,
      wouldUpdate: 0,
      unchanged: 0,
      stagesAffected: {}
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
      errors: result.errors
    });
  } catch (err) {
    res.status(500).json({
      error: 'Scan failed',
      message: err.message
    });
  }
});

/**
 * POST /api/status/:book/sync
 * Actually update status.json files based on filesystem
 */
router.post('/:book/sync', (req, res) => {
  const { book } = req.params;

  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({
      error: 'Invalid book',
      message: `Book must be one of: ${VALID_BOOKS.join(', ')}`
    });
  }

  if (!bookRegistration || !bookRegistration.scanAndUpdateStatus) {
    return res.status(501).json({
      error: 'Not implemented',
      message: 'Status sync requires bookRegistration service'
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
      errors: result.errors
    });
  } catch (err) {
    res.status(500).json({
      error: 'Sync failed',
      message: err.message
    });
  }
});

/**
 * POST /api/status/:book/:chapter/sync
 * Update status for a single chapter
 */
router.post('/:book/:chapter/sync', (req, res) => {
  const { book, chapter } = req.params;
  const chapterNum = parseInt(chapter);

  if (!VALID_BOOKS.includes(book)) {
    return res.status(400).json({
      error: 'Invalid book',
      message: `Book must be one of: ${VALID_BOOKS.join(', ')}`
    });
  }

  if (isNaN(chapterNum) || chapterNum < 1) {
    return res.status(400).json({
      error: 'Invalid chapter',
      message: 'Chapter must be a positive number'
    });
  }

  if (!bookRegistration || !bookRegistration.scanAndUpdateStatus) {
    return res.status(501).json({
      error: 'Not implemented',
      message: 'Status sync requires bookRegistration service'
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
      errors: result.errors
    });
  } catch (err) {
    res.status(500).json({
      error: 'Sync failed',
      message: err.message
    });
  }
});

// ============================================================================
// MEETING AGENDA GENERATOR
// ============================================================================

/**
 * GET /api/status/meeting-agenda
 * Generate a meeting agenda for weekly team sync
 *
 * Returns:
 *   - date: Meeting date
 *   - disputedTerms: Terminology needing discussion
 *   - blockedIssues: Blocked items needing team resolution
 *   - pendingReviews: Reviews awaiting decision
 *   - weekProgress: Summary of progress this week
 *   - nextSteps: Suggested action items
 */
router.get('/meeting-agenda', async (req, res) => {
  try {
    // Load required services
    let terminology, editorHistory, decisionStore;
    try {
      terminology = require('../services/terminology');
      editorHistory = require('../services/editorHistory');
      decisionStore = require('../services/decisionStore');
    } catch (e) {
      // Services may not be available
    }

    const agenda = {
      generatedAt: new Date().toISOString(),
      meetingDate: new Date().toLocaleDateString('is-IS', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      sections: []
    };

    // 1. Disputed/Needs Review Terminology
    if (terminology) {
      try {
        const terms = terminology.getReviewQueue({ limit: 10 });
        if (terms.length > 0) {
          agenda.sections.push({
            title: 'Hugtök til umræðu',
            titleEn: 'Terminology Discussion',
            icon: '📖',
            priority: 'high',
            count: terms.length,
            items: terms.map(t => ({
              id: t.id,
              english: t.english,
              icelandic: t.icelandic,
              status: t.status,
              proposedBy: t.proposed_by_name,
              discussionCount: t.discussion_count || 0
            }))
          });
        }
      } catch (e) {
        console.log('Could not load terminology for agenda:', e.message);
      }
    }

    // 2. Blocked Issues
    const session = require('../services/session');
    try {
      const sessions = session.listAllSessions();
      const blockedIssues = [];

      for (const sess of sessions) {
        const sessionData = session.getSession(sess.id);
        if (!sessionData) continue;

        const blocked = sessionData.issues.filter(i =>
          i.category === 'BLOCKED' && i.status === 'pending'
        );

        for (const issue of blocked) {
          blockedIssues.push({
            id: issue.id,
            sessionId: sess.id,
            book: sessionData.book,
            chapter: sessionData.chapter,
            description: issue.description,
            context: issue.context
          });
        }
      }

      if (blockedIssues.length > 0) {
        agenda.sections.push({
          title: 'Lokaðar vandamál',
          titleEn: 'Blocked Issues',
          icon: '🚫',
          priority: 'high',
          count: blockedIssues.length,
          items: blockedIssues.slice(0, 10)
        });
      }
    } catch (e) {
      console.log('Could not load blocked issues for agenda:', e.message);
    }

    // 3. Pending Reviews
    if (editorHistory) {
      try {
        const pendingReviews = editorHistory.getPendingReviews();
        if (pendingReviews.length > 0) {
          agenda.sections.push({
            title: 'Yfirferðir í bið',
            titleEn: 'Pending Reviews',
            icon: '📝',
            priority: 'medium',
            count: pendingReviews.length,
            items: pendingReviews.slice(0, 10).map(r => ({
              id: r.id,
              book: r.book,
              chapter: r.chapter,
              section: r.section,
              submittedBy: r.submittedByUsername,
              submittedAt: r.submittedAt,
              daysPending: Math.floor((Date.now() - new Date(r.submittedAt).getTime()) / (1000 * 60 * 60 * 24))
            }))
          });
        }
      } catch (e) {
        console.log('Could not load pending reviews for agenda:', e.message);
      }
    }

    // 4. Recent Activity Summary
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const recentActivity = activityLog.getRecent(100);
      const weekActivity = recentActivity.filter(a =>
        new Date(a.timestamp) >= weekAgo
      );

      // Group by user
      const userActivity = {};
      for (const activity of weekActivity) {
        if (!userActivity[activity.username]) {
          userActivity[activity.username] = { count: 0, types: {} };
        }
        userActivity[activity.username].count++;
        const type = activity.action || 'other';
        userActivity[activity.username].types[type] = (userActivity[activity.username].types[type] || 0) + 1;
      }

      const activitySummary = Object.entries(userActivity)
        .map(([user, data]) => ({
          username: user,
          totalActions: data.count,
          breakdown: data.types
        }))
        .sort((a, b) => b.totalActions - a.totalActions);

      if (activitySummary.length > 0) {
        agenda.sections.push({
          title: 'Virkni síðustu 7 daga',
          titleEn: 'Week Activity Summary',
          icon: '📊',
          priority: 'info',
          count: weekActivity.length,
          items: activitySummary.slice(0, 5)
        });
      }
    } catch (e) {
      console.log('Could not load activity summary for agenda:', e.message);
    }

    // 5. Recent Decisions (for reference)
    if (decisionStore) {
      try {
        const recentDecisions = decisionStore.getRecentDecisions(5);
        if (recentDecisions.length > 0) {
          agenda.sections.push({
            title: 'Nýlegar ákvarðanir',
            titleEn: 'Recent Decisions',
            icon: '✅',
            priority: 'info',
            count: recentDecisions.length,
            items: recentDecisions.map(d => ({
              id: d.id,
              type: d.type,
              english: d.englishTerm,
              icelandic: d.icelandicTerm,
              rationale: d.rationale,
              decidedBy: d.decidedBy,
              decidedAt: d.decidedAt
            }))
          });
        }
      } catch (e) {
        console.log('Could not load recent decisions for agenda:', e.message);
      }
    }

    // Generate summary statistics
    agenda.summary = {
      highPriorityCount: agenda.sections.filter(s => s.priority === 'high').reduce((sum, s) => sum + s.count, 0),
      mediumPriorityCount: agenda.sections.filter(s => s.priority === 'medium').reduce((sum, s) => sum + s.count, 0),
      totalSections: agenda.sections.length
    };

    res.json(agenda);

  } catch (err) {
    console.error('Meeting agenda error:', err);
    res.status(500).json({
      error: 'Failed to generate meeting agenda',
      message: err.message
    });
  }
});

module.exports = router;
